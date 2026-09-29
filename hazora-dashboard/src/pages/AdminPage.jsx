import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Navigate, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../config/roles';
import '../styles/AdminPage.css';

const PRIVILEGED_ROLES = new Set([
  'Safety Engineer - Head Office',
  'Safety Manager - Head Office',
  'HSE Head - Head Office',
]);

function formatDate(value) {
  if (!value?.toDate) return 'Not available';
  return value.toDate().toLocaleString();
}

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [websiteUsers, setWebsiteUsers] = useState([]);
  const [mobileAccounts, setMobileAccounts] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;

    user.getIdTokenResult().then((token) => {
      if (!active) return;
      setIsAdmin(token.claims.admin === true);
      setIsSuperAdmin(token.claims.superAdmin === true);
    }).catch(() => {
      if (active) setIsAdmin(false);
    });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    let loadedUsers = false;
    let loadedMobileAccounts = false;
    const finishInitialLoad = () => {
      if (loadedUsers && loadedMobileAccounts) setLoading(false);
    };
    const handleError = (error) => {
      setMessage({ type: 'error', text: error.message || 'Could not load admin records.' });
      setLoading(false);
    };

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setWebsiteUsers(users);
      setPendingUsers(users.filter((account) => account.approvalStatus === 'pending'));
      loadedUsers = true;
      finishInitialLoad();
    }, handleError);

    const mobileAccountsQuery = query(
      collection(db, 'mobile_accounts'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsubscribeMobileAccounts = onSnapshot(mobileAccountsQuery, (snapshot) => {
      setMobileAccounts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      loadedMobileAccounts = true;
      finishInitialLoad();
    }, handleError);

    return () => {
      unsubscribeUsers();
      unsubscribeMobileAccounts();
    };
  }, [isAdmin]);

  async function reviewUser(uid, decision) {
    const role = selectedRoles[uid];
    if (decision === 'approve' && !role) {
      setMessage({ type: 'error', text: 'Choose the verified user role before approving.' });
      return;
    }

    setBusyUid(uid);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', uid), {
        approvalStatus: decision === 'approve' ? 'approved' : 'rejected',
        role: decision === 'approve' ? role : null,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });
      const notificationRef = doc(collection(db, 'users', uid, 'notifications'));
      batch.set(notificationRef, {
        type: decision === 'approve' ? 'account_approved' : 'account_rejected',
        violationType: decision === 'approve' ? 'Account verified' : 'Account review complete',
        cameraSource: decision === 'approve'
          ? `Your account is verified. Your assigned role is ${role}. You can now access the website.`
          : 'Your account was not approved. Please contact your administrator if you need more information.',
        role: decision === 'approve' ? role : null,
        read: false,
        timestamp: serverTimestamp(),
      });
      await batch.commit();
      setMessage({ type: 'success', text: decision === 'approve' ? 'User approved and role assigned.' : 'User rejected.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not review this account.' });
    } finally {
      setBusyUid(null);
    }
  }

  async function deleteUser(account) {
    const label = account.email || account.fullName || account.id;
    if (!window.confirm(`Remove the pending profile for ${label}? This does not delete the Firebase Authentication login.`)) return;

    setBusyUid(account.id);
    setMessage(null);
    try {
      await deleteDoc(doc(db, 'users', account.id));
      setMessage({ type: 'success', text: 'Pending profile removed. Delete the Firebase Authentication user separately in Firebase Console if needed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not delete this account.' });
    } finally {
      setBusyUid(null);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  if (isAdmin === null) {
    return <div className="loading-screen">Checking administrator access...</div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const availableRoles = isSuperAdmin ? ROLES : ROLES.filter((role) => !PRIVILEGED_ROLES.has(role));

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="admin-brand" href="/">HAZORA <span>ADMIN</span></a>
        <div className="admin-header-user">
          <span>{user.email}</span>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className="admin-main">
        <div className="admin-title-row">
          <div>
            <p className="admin-eyebrow">ACCOUNT CONTROL</p>
            <h1>Administration</h1>
            <p>Review website registrations and inspect provisioned mobile accounts.</p>
          </div>
          <span className="admin-live-status"><span aria-hidden="true" /> Live updates</span>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            className={activeTab === 'pending' ? 'active' : ''}
            onClick={() => setActiveTab('pending')}
          >
            Pending review <span>{pendingUsers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => setActiveTab('users')}
          >
            All website users <span>{websiteUsers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mobile'}
            className={activeTab === 'mobile' ? 'active' : ''}
            onClick={() => setActiveTab('mobile')}
          >
            Mobile accounts <span>{mobileAccounts.length}</span>
          </button>
        </div>

        {message && <div className={`admin-message ${message.type}`} role="status">{message.text}</div>}

        {activeTab === 'pending' ? (
          <section className="admin-section" aria-label="Pending website registrations">
            <div className="admin-section-heading">
              <div>
                <h2>Pending registrations</h2>
                <p>Verify the person through your organization before assigning access. Removing a profile does not delete its Firebase Authentication login.</p>
              </div>
            </div>
            {loading ? <p className="admin-empty">Loading registrations…</p> : pendingUsers.length === 0 ? (
              <p className="admin-empty">No users are waiting for verification.</p>
            ) : (
              <div className="admin-user-list">
                {pendingUsers.map((account) => (
                  <article className="admin-user-row" key={account.id}>
                    <div className="admin-user-identity">
                      <strong>{account.fullName || 'Name not provided'}</strong>
                      <span>{account.email || 'Email not provided'}</span>
                      <span>{account.phone || 'Phone not provided'}</span>
                      <small>Registered {formatDate(account.createdAt)}</small>
                    </div>
                    <label className="admin-role-field">
                      <span>Assign role</span>
                      <select
                        value={selectedRoles[account.id] || ''}
                        onChange={(event) => setSelectedRoles((current) => ({ ...current, [account.id]: event.target.value }))}
                        disabled={busyUid === account.id}
                      >
                        <option value="">Choose role</option>
                        {availableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>
                    <div className="admin-row-actions">
                      <button type="button" className="admin-approve" onClick={() => reviewUser(account.id, 'approve')} disabled={busyUid === account.id}>
                        {busyUid === account.id ? 'Working…' : 'Verify & approve'}
                      </button>
                      <button type="button" className="admin-reject" onClick={() => reviewUser(account.id, 'reject')} disabled={busyUid === account.id}>
                        Reject
                      </button>
                      <button type="button" className="admin-delete" onClick={() => deleteUser(account)} disabled={busyUid === account.id}>
                        Remove profile
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === 'users' ? (
          <section className="admin-section" aria-label="All website users">
            <div className="admin-section-heading">
              <div>
                <h2>All website users</h2>
                <p>Website account roles and verification status.</p>
              </div>
            </div>
            {loading ? <p className="admin-empty">Loading website users…</p> : websiteUsers.length === 0 ? (
              <p className="admin-empty">No website users found.</p>
            ) : (
              <div className="admin-directory-list">
                {websiteUsers.map((account) => (
                  <article className="admin-directory-row" key={account.id}>
                    <div><span>Name</span><strong>{account.fullName || 'Name not provided'}</strong></div>
                    <div><span>Email</span><strong>{account.email || 'Email not provided'}</strong></div>
                    <div><span>Role</span><strong>{account.role || 'Not assigned'}</strong></div>
                    <div><span>Status</span><strong>{account.approvalStatus || 'Existing account'}</strong></div>
                    <div><span>Registered</span><strong>{formatDate(account.createdAt)}</strong></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="admin-section" aria-label="Mobile application accounts">
            <div className="admin-section-heading">
              <div>
                <h2>Mobile app accounts</h2>
                <p>Account identifiers and access status. Passwords are intentionally not displayed.</p>
              </div>
            </div>
            {loading ? <p className="admin-empty">Loading mobile accounts…</p> : mobileAccounts.length === 0 ? (
              <p className="admin-empty">No mobile accounts found.</p>
            ) : (
              <div className="admin-mobile-list">
                {mobileAccounts.map((account) => (
                  <article className="admin-mobile-row" key={account.id}>
                    <div><span>Name</span><strong>{account.name || 'Not provided'}</strong></div>
                    <div><span>Username</span><strong>{account.username || 'Not provided'}</strong></div>
                    <div><span>Role</span><strong>{account.role || 'Not assigned'}</strong></div>
                    <div><span>Site</span><strong>{account.site || 'Not assigned'}</strong></div>
                    <div><span>Status</span><strong>{account.status || 'Unknown'}</strong></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where, writeBatch } from 'firebase/firestore';
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
const PROTECTED_ACCOUNT_EMAIL = 'mirasolvenandrew@gmail.com';

function formatDate(value) {
  if (!value?.toDate) return 'Not available';
  return value.toDate().toLocaleString();
}

function mobileSetupRecord(account, role, site, createdBy, createdByEmail) {
  const email = account.email.trim();
  const emailLowercase = email.toLowerCase();
  return {
    name: account.fullName || email,
    role,
    username: email,
    usernameLowercase: emailLowercase,
    email,
    authUid: account.id,
    site,
    status: 'active',
    mobileSetupStatus: 'setup_required',
    linkedWebsiteUid: account.id,
    createdBy,
    createdByEmail: createdByEmail || '',
    createdAt: serverTimestamp(),
  };
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
  const [selectedSites, setSelectedSites] = useState({});
  const [selectedMobileAccess, setSelectedMobileAccess] = useState({});
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
    const site = selectedSites[uid];
    const enableMobileAccess = selectedMobileAccess[uid] ?? true;
    const pendingAccount = pendingUsers.find((account) => account.id === uid);
    if (decision === 'approve' && !role) {
      setMessage({ type: 'error', text: 'Choose the verified user role before approving.' });
      return;
    }
    if (decision === 'approve') {
      const normalizedSite = (site || '').trim();
      if (!normalizedSite) {
        setMessage({ type: 'error', text: 'Enter the user site before approving.' });
        return;
      }
      if (normalizedSite.length > 120) {
        setMessage({ type: 'error', text: 'Site location must be 120 characters or fewer.' });
        return;
      }
    }
    const normalizedSite = decision === 'approve' ? site.trim() : '';

    setBusyUid(uid);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      let linkedMobileAccount = null;
      if (decision === 'approve' && enableMobileAccess) {
        const mobileAccountsRef = collection(db, 'mobile_accounts');
        const accountEmail = pendingAccount?.email?.trim();
        const mobileAccountSnapshot = await getDocs(query(
          mobileAccountsRef,
          where('authUid', '==', uid),
          limit(1),
        ));
        linkedMobileAccount = mobileAccountSnapshot.docs[0] || null;
        if (!linkedMobileAccount && accountEmail) {
          const emailSnapshot = await getDocs(query(
            mobileAccountsRef,
            where('email', '==', accountEmail.toLowerCase()),
          ));
          linkedMobileAccount = emailSnapshot.docs.find((account) =>
            !account.data().authUid || account.data().authUid === uid
          ) || null;
        }
        if (linkedMobileAccount) {
          batch.update(linkedMobileAccount.ref, {
            site: normalizedSite,
            authUid: uid,
            mobileSetupStatus: linkedMobileAccount.data().mobileSetupStatus || 'setup_required',
          });
        } else {
          if (!accountEmail) {
            throw new Error('The website profile has no email address, so mobile access cannot be enabled.');
          }
          batch.set(
            doc(db, 'mobile_accounts', uid),
            mobileSetupRecord(pendingAccount, role, normalizedSite, user.uid, user.email),
          );
        }
      }

      batch.update(doc(db, 'users', uid), {
        approvalStatus: decision === 'approve' ? 'approved' : 'rejected',
        role: decision === 'approve' ? role : null,
        ...(decision === 'approve' ? { site: normalizedSite } : {}),
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });
      const notificationRef = doc(collection(db, 'users', uid, 'notifications'));
      batch.set(notificationRef, {
        type: decision === 'approve' ? 'account_approved' : 'account_rejected',
        violationType: decision === 'approve' ? 'Account verified' : 'Account review complete',
        cameraSource: decision === 'approve'
          ? `Your account is verified. Your assigned role is ${role} and site is ${normalizedSite}. You can now access the website.`
          : 'Your account was not approved. Please contact your administrator if you need more information.',
        role: decision === 'approve' ? role : null,
        read: false,
        timestamp: serverTimestamp(),
      });
      await batch.commit();
      setMessage({
        type: 'success',
        text: decision === 'approve'
          ? `User approved and assigned to ${normalizedSite}.${enableMobileAccess ? ' Mobile access is enabled; the user can sign in with the same email and password. First mobile sign-in completes setup.' : ' Mobile access was not enabled.'}`
          : 'User rejected.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not review this account.' });
    } finally {
      setBusyUid(null);
    }
  }

  async function saveUserSite(account) {
    const site = (selectedSites[account.id] ?? account.site ?? '').trim();
    if (site.length > 120) {
      setMessage({ type: 'error', text: 'Site location must be 120 characters or fewer.' });
      return;
    }

    setBusyUid(account.id);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', account.id), { site });

      const mobileAccountsRef = collection(db, 'mobile_accounts');
      const mobileAccountsByUid = await getDocs(query(
        mobileAccountsRef,
        where('authUid', '==', account.id),
        limit(1),
      ));
      let linkedAccount = mobileAccountsByUid.docs[0];
      if (!linkedAccount && account.email) {
        const email = account.email.trim().toLowerCase();
        const emailSnapshot = await getDocs(query(
          mobileAccountsRef,
          where('email', '==', email),
          limit(1),
        ));
        linkedAccount = emailSnapshot.docs.find((item) =>
          !item.data().authUid || item.data().authUid === account.id
        );
      }

      if (linkedAccount) batch.update(linkedAccount.ref, { site });

      await batch.commit();
      setMessage({
        type: 'success',
        text: `Site location ${site ? `updated to ${site}` : 'cleared'}${linkedAccount ? ' for the website and mobile accounts.' : ' for the website account.'}`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.code === 'permission-denied'
          ? 'Firestore denied this update. Publish the latest firestore.rules to the hazora database, then try again.'
          : error.message || 'Could not update the user site.',
      });
    } finally {
      setBusyUid(null);
    }
  }

  async function prepareMobileAccess(account) {
    const email = account.email?.trim();
    const site = account.site?.trim();
    if (account.approvalStatus !== 'approved') {
      setMessage({ type: 'error', text: 'Approve the website account before enabling mobile access.' });
      return;
    }
    if (!email || !site || !account.role) {
      setMessage({ type: 'error', text: 'Add the user email, role, and site before enabling mobile access.' });
      return;
    }

    const existingAccount = mobileAccounts.find((mobileAccount) =>
      mobileAccount.authUid === account.id ||
      (mobileAccount.email?.trim().toLowerCase() === email.toLowerCase() &&
        (!mobileAccount.authUid || mobileAccount.authUid === account.id))
    );
    if (existingAccount) {
      setMessage({ type: 'error', text: 'This user already has a linked mobile account.' });
      return;
    }

    setBusyUid(account.id);
    setMessage(null);
    try {
      await runTransaction(db, async (transaction) => {
        const mobileAccountRef = doc(db, 'mobile_accounts', account.id);
        const existingSnapshot = await transaction.get(mobileAccountRef);
        if (existingSnapshot.exists()) {
          throw new Error('This user already has a mobile account record.');
        }
        transaction.set(
          mobileAccountRef,
          mobileSetupRecord(account, account.role, site, user.uid, user.email),
        );
      });
      setMessage({
        type: 'success',
        text: `Mobile access prepared for ${email}. The user can sign in with the same email and password; first sign-in completes setup.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not prepare mobile access.' });
    } finally {
      setBusyUid(null);
    }
  }

  async function deleteUser(account) {
    if (
      account.id === user.uid ||
      account.email?.trim().toLowerCase() === PROTECTED_ACCOUNT_EMAIL
    ) {
      setMessage({ type: 'error', text: 'This account is protected and cannot be removed here.' });
      return;
    }

    const label = account.email || account.fullName || account.id;
    if (!window.confirm(`Remove the website profile for ${label}? This leaves its Firebase Authentication login, mobile-account record, and subcollection data untouched.`)) return;

    setBusyUid(account.id);
    setMessage(null);
    try {
      await deleteDoc(doc(db, 'users', account.id));
      setMessage({ type: 'success', text: 'Website profile removed. Its Firebase Authentication login, mobile-account record, and subcollection data were left untouched.' });
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
                <p>Verify the person through your organization, then assign a role and site. Mobile access is prepared by default; users sign in with the same email and password, and their first mobile sign-in completes setup.</p>
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
                    <label className="admin-role-field">
                      <span>Assign site</span>
                      <input
                        type="text"
                        value={selectedSites[account.id] ?? account.site ?? ''}
                        onChange={(event) => setSelectedSites((current) => ({ ...current, [account.id]: event.target.value }))}
                        placeholder="Enter site location"
                        maxLength={120}
                        disabled={busyUid === account.id}
                      />
                    </label>
                    <label className="admin-mobile-access">
                      <input
                        type="checkbox"
                        checked={selectedMobileAccess[account.id] ?? true}
                        onChange={(event) => setSelectedMobileAccess((current) => ({
                          ...current,
                          [account.id]: event.target.checked,
                        }))}
                        disabled={busyUid === account.id}
                      />
                      <span>Enable mobile app access</span>
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
                <p>Choose a site and save to update the website profile and any linked mobile account.</p>
              </div>
            </div>
            {loading ? <p className="admin-empty">Loading website users…</p> : websiteUsers.length === 0 ? (
              <p className="admin-empty">No website users found.</p>
            ) : (
              <div className="admin-directory-list">
                {websiteUsers.map((account) => {
                  const linkedMobileAccount = mobileAccounts.find((mobileAccount) =>
                    mobileAccount.authUid === account.id ||
                    (mobileAccount.email?.trim().toLowerCase() === account.email?.trim().toLowerCase() &&
                      (!mobileAccount.authUid || mobileAccount.authUid === account.id))
                  );
                  return (
                    <article className="admin-directory-row" key={account.id}>
                    <div><span>Name</span><strong>{account.fullName || 'Name not provided'}</strong></div>
                    <div><span>Email</span><strong>{account.email || 'Email not provided'}</strong></div>
                    <div><span>Role</span><strong>{account.role || 'Not assigned'}</strong></div>
                    <div className="admin-user-site">
                      <label htmlFor={`site-${account.id}`}>Site</label>
                      <input
                        id={`site-${account.id}`}
                        type="text"
                        value={selectedSites[account.id] ?? account.site ?? ''}
                        onChange={(event) => setSelectedSites((current) => ({ ...current, [account.id]: event.target.value }))}
                        placeholder="Enter site location"
                        maxLength={120}
                        disabled={busyUid === account.id}
                      />
                      <button
                        type="button"
                        onClick={() => saveUserSite(account)}
                        disabled={busyUid === account.id}
                      >
                        {busyUid === account.id ? 'Saving…' : 'Save site'}
                      </button>
                    </div>
                    <div className="admin-directory-mobile">
                      <span>Mobile app</span>
                      <strong>
                        {linkedMobileAccount
                          ? linkedMobileAccount.mobileSetupStatus === 'setup_required'
                            ? 'Setup required'
                            : linkedMobileAccount.mobileSetupStatus === 'active'
                              ? 'Active'
                              : linkedMobileAccount.status || 'Linked'
                          : 'Not enabled'}
                      </strong>
                      {!linkedMobileAccount && account.approvalStatus === 'approved' && (
                        <button
                          type="button"
                          onClick={() => prepareMobileAccess(account)}
                          disabled={busyUid === account.id}
                        >
                          {busyUid === account.id ? 'Preparing…' : 'Prepare access'}
                        </button>
                      )}
                    </div>
                    <div><span>Status</span><strong>{account.approvalStatus || 'Existing account'}</strong></div>
                    <div><span>Registered</span><strong>{formatDate(account.createdAt)}</strong></div>
                    {account.id !== user.uid &&
                      account.email?.trim().toLowerCase() !== PROTECTED_ACCOUNT_EMAIL && (
                        <div className="admin-directory-actions">
                          <button
                            type="button"
                            className="admin-delete"
                            onClick={() => deleteUser(account)}
                            disabled={busyUid === account.id}
                          >
                            {busyUid === account.id ? 'Removing…' : 'Remove profile'}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="admin-section" aria-label="Mobile application accounts">
            <div className="admin-section-heading">
              <div>
                <h2>Mobile app accounts</h2>
                <p>Prepared accounts show Setup required until the user signs in to the app. Website and mobile access use the same Firebase email and password.</p>
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
                    <div><span>Status</span><strong>{account.mobileSetupStatus === 'setup_required' ? 'Setup required' : account.mobileSetupStatus === 'active' ? 'Active' : account.status || 'Unknown'}</strong></div>
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
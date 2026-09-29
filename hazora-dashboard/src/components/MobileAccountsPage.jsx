import { useEffect, useState } from 'react';
import { addDoc, collection, deleteField, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, sendEmailVerification, signOut as signOutFirebase } from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import { db, firebaseConfig } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canManageMobileAccounts } from '../config/roles';
import { sanitizeInput } from '../utils/security';
import '../styles/MobileAccountsPage.css';

const MOBILE_ROLE = 'Site/Safety Engineer';

const initialForm = {
  name: '',
  role: MOBILE_ROLE,
  username: '',
  email: '',
  site: '',
};

export default function MobileAccountsPage({ userRole }) {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const allowed = canManageMobileAccounts(userRole);

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    async function loadAccounts() {
      try {
        const accountQuery = query(
          collection(db, 'mobile_accounts'),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(accountQuery);
        setAccounts(snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
      } catch (err) {
        console.warn('Failed to load mobile accounts:', err.message);
        setMessage({ type: 'error', text: 'Unable to load mobile accounts.' });
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
    return undefined;
  }, [allowed]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function createTemporaryPassword() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('') + 'A7!';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const cleanName = sanitizeInput(form.name.trim());
    const cleanUsername = sanitizeInput(form.username.trim());
    const cleanEmail = form.email.trim().toLowerCase();
    const cleanRole = sanitizeInput(form.role.trim());
    const cleanSite = sanitizeInput(form.site.trim());

    if (cleanName.length < 3) {
      setMessage({ type: 'error', text: 'Account name must be at least 3 characters.' });
      return;
    }

    if (cleanUsername.length < 3) {
      setMessage({ type: 'error', text: 'Code, ID, or username must be at least 3 characters.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage({ type: 'error', text: 'Enter the email used by the Firebase Authentication account.' });
      return;
    }

    if (cleanRole !== MOBILE_ROLE) {
      setMessage({ type: 'error', text: 'Mobile account role must be Site/Safety Engineer.' });
      return;
    }

    if (cleanSite.length < 2) {
      setMessage({ type: 'error', text: 'Please enter the site location for this officer.' });
      return;
    }

    setSaving(true);
    setTemporaryPassword('');
    let provisionApp;
    let provisionedUser;
    try {
      const tempPassword = createTemporaryPassword();
      provisionApp = initializeApp(firebaseConfig, `mobile-provision-${Date.now()}`);
      const provisionAuth = getAuth(provisionApp);
      const credential = await createUserWithEmailAndPassword(provisionAuth, cleanEmail, tempPassword);
      provisionedUser = credential.user;

      const accountData = {
        name: cleanName,
        role: cleanRole,
        username: cleanUsername,
        email: cleanEmail,
        authUid: credential.user.uid,
        site: cleanSite,
        status: 'active',
        createdBy: user.uid,
        createdByEmail: user.email || '',
        createdAt: serverTimestamp(),
      };

      const existingAccount = accounts.find((account) =>
        String(account.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
      );
      let accountId;
      if (existingAccount) {
        const profileUpdates = { ...accountData };
        delete profileUpdates.createdAt;
        await updateDoc(doc(db, 'mobile_accounts', existingAccount.id), {
          ...profileUpdates,
          password: deleteField(),
          authLinkedAt: serverTimestamp(),
        });
        accountId = existingAccount.id;
      } else {
        const docRef = await addDoc(collection(db, 'mobile_accounts'), accountData);
        accountId = docRef.id;
      }
      let verificationSent = true;
      try {
        await sendEmailVerification(credential.user);
      } catch (verificationError) {
        verificationSent = false;
        console.warn('Mobile account verification email failed:', verificationError.message);
      }

      setAccounts((prev) => {
        const nextAccount = { id: accountId, ...accountData, createdAt: new Date() };
        const withoutLinkedAccount = prev.filter((account) => account.id !== accountId);
        return [nextAccount, ...withoutLinkedAccount];
      });
      setForm(initialForm);
      setTemporaryPassword(tempPassword);
      setMessage({
        type: verificationSent ? 'success' : 'error',
        text: verificationSent
          ? `${existingAccount ? 'Existing mobile record linked' : 'Firebase login created'}. Give the user the temporary password below; they must verify their email before signing in.`
          : 'Firebase login and mobile record were created, but the verification email could not be sent. Use Firebase Console to resend it.',
      });
    } catch (err) {
      if (provisionedUser) {
        try {
          await provisionedUser.delete();
        } catch (cleanupError) {
          console.warn('Could not roll back mobile Auth user:', cleanupError.message);
        }
      }
      console.warn('Failed to save mobile account:', err.message);
      const errorText = err.code === 'auth/email-already-in-use'
        ? 'A Firebase Auth account already exists for this email. Use a different email or link the existing account.'
        : err.code === 'permission-denied'
          ? 'Your account is not authorized to create mobile accounts. Sign in as the HSE Head administrator.'
          : err.message || 'Failed to create mobile account. Please try again.';
      setMessage({ type: 'error', text: errorText });
    } finally {
      if (provisionApp) {
        try {
          await signOutFirebase(getAuth(provisionApp));
          await deleteApp(provisionApp);
        } catch (cleanupError) {
          console.warn('Mobile provisioning session cleanup failed:', cleanupError.message);
        }
      }
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <div className="mobile-accounts-page">
        <div className="mobile-accounts-panel">
          <h2>Mobile Accounts</h2>
          <p className="mobile-empty">Only the HSE Head - Head Office can create mobile device accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-accounts-page">
      <section className="mobile-accounts-panel">
        <div className="mobile-accounts-header">
          <div>
            <h2>Mobile Device Accounts</h2>
            <p>Create a Firebase login and mobile profile together. Users must verify their email before signing in.</p>
          </div>
        </div>

        {message && (
          <div className={`mobile-message ${message.type}`}>
            {message.text}
            {temporaryPassword && (
              <div className="mobile-temporary-password">
                <strong>Temporary password (shown once)</strong>
                <code>{temporaryPassword}</code>
              </div>
            )}
          </div>
        )}

        <form className="mobile-account-form" onSubmit={handleSubmit}>
          <div className="mobile-form-grid">
            <div className="mobile-field">
              <label htmlFor="mobile-name">Name of Account/User</label>
              <input
                id="mobile-name"
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Juan Dela Cruz"
                disabled={saving}
              />
            </div>

            <div className="mobile-field">
              <label htmlFor="mobile-role">Role</label>
              <input
                id="mobile-role"
                type="text"
                value={form.role}
                readOnly
                disabled={saving}
              />
            </div>

            <div className="mobile-field">
              <label htmlFor="mobile-username">Code / ID / Username</label>
              <input
                id="mobile-username"
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="MOB-001"
                disabled={saving}
              />
            </div>

            <div className="mobile-field">
              <label htmlFor="mobile-email">Firebase Auth Email</label>
              <input
                id="mobile-email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="officer@example.com"
                disabled={saving}
              />
            </div>

            <div className="mobile-field">
              <label htmlFor="mobile-site">Site Location</label>
              <input
                id="mobile-site"
                type="text"
                value={form.site}
                onChange={(e) => handleChange('site', e.target.value)}
                placeholder="e.g. Tower B - Level 3"
                disabled={saving}
              />
            </div>
          </div>

          <div className="mobile-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Mobile Account'}
            </button>
          </div>
        </form>
      </section>

      <section className="mobile-accounts-panel">
        <h3>Created Accounts</h3>
        {loading ? (
          <p className="mobile-empty">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="mobile-empty">No mobile accounts created yet.</p>
        ) : (
          <div className="mobile-account-list">
            {accounts.map((account) => (
              <article className="mobile-account-row" key={account.id}>
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.role}</span>
                  {account.site && <span className="mobile-site-tag">📍 {account.site}</span>}
                </div>
                <div>
                  <span className="mobile-credential-label">Username</span>
                  <code>{account.username}</code>
                </div>
                <div>
                  <span className="mobile-credential-label">Firebase Auth email</span>
                  <code>{account.email || 'Not linked yet'}</code>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

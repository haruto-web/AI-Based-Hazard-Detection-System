import { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canManageMobileAccounts } from '../config/roles';
import { sanitizeInput } from '../utils/security';
import '../styles/MobileAccountsPage.css';

const MOBILE_ROLES = [
  'Mobile Safety Observer',
  'Mobile Site Inspector',
  'Mobile Device User',
];

const initialForm = {
  name: '',
  role: MOBILE_ROLES[0],
  username: '',
  password: '',
};

export default function MobileAccountsPage({ userRole }) {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const allowed = canManageMobileAccounts(userRole);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const cleanName = sanitizeInput(form.name.trim());
    const cleanUsername = sanitizeInput(form.username.trim());
    const cleanRole = sanitizeInput(form.role.trim());

    if (cleanName.length < 3) {
      setMessage({ type: 'error', text: 'Account name must be at least 3 characters.' });
      return;
    }

    if (cleanUsername.length < 3) {
      setMessage({ type: 'error', text: 'Code, ID, or username must be at least 3 characters.' });
      return;
    }

    if (form.password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setSaving(true);
    try {
      const accountData = {
        name: cleanName,
        role: cleanRole,
        username: cleanUsername,
        password: form.password,
        status: 'active',
        createdBy: user.uid,
        createdByEmail: user.email || '',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'mobile_accounts'), accountData);
      setAccounts((prev) => [{ id: docRef.id, ...accountData, createdAt: new Date() }, ...prev]);
      setForm(initialForm);
      setMessage({ type: 'success', text: 'Mobile account saved. You can give these credentials to the mobile user.' });
    } catch (err) {
      console.warn('Failed to save mobile account:', err.message);
      setMessage({ type: 'error', text: 'Failed to save mobile account. Please try again.' });
    } finally {
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
            <p>Create login credentials for mobile users.</p>
          </div>
        </div>

        {message && (
          <div className={`mobile-message ${message.type}`}>
            {message.text}
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
              <select
                id="mobile-role"
                value={form.role}
                onChange={(e) => handleChange('role', e.target.value)}
                disabled={saving}
              >
                {MOBILE_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
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
              <label htmlFor="mobile-password">Password</label>
              <input
                id="mobile-password"
                type="text"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="Temporary password"
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
                </div>
                <div>
                  <span className="mobile-credential-label">Username</span>
                  <code>{account.username}</code>
                </div>
                <div>
                  <span className="mobile-credential-label">Password</span>
                  <code>{account.password}</code>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

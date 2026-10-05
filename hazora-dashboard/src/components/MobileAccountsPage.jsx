import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { canManageMobileAccounts } from '../config/roles';
import '../styles/MobileAccountsPage.css';

export default function MobileAccountsPage({ userRole }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const allowed = canManageMobileAccounts(userRole);

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    async function loadAccounts() {
      try {
        const accountQuery = query(
          collection(db, 'mobile_accounts'),
          orderBy('createdAt', 'desc'),
          limit(50),
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

  if (!allowed) {
    return (
      <div className="mobile-accounts-page">
        <div className="mobile-accounts-panel">
          <h2>Mobile Accounts</h2>
          <p className="mobile-empty">Only the HSE Head - Head Office can view mobile device accounts.</p>
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
            <p>Mobile access is prepared from approved website accounts. Users sign in to the app with the same verified email and password. To enable access for an existing website user, use Prepare access under Admin &gt; All website users.</p>
          </div>
        </div>
        {message && <div className={`mobile-message ${message.type}`}>{message.text}</div>}
      </section>

      <section className="mobile-accounts-panel">
        <h3>Mobile Accounts</h3>
        {loading ? (
          <p className="mobile-empty">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="mobile-empty">No mobile accounts yet. Prepare access for an approved user from the Admin page.</p>
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
                <div>
                  <span className="mobile-credential-label">Mobile setup</span>
                  <strong>{account.mobileSetupStatus === 'setup_required' ? 'Setup required' : account.mobileSetupStatus === 'active' ? 'Active' : account.status || 'Unknown'}</strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { reload, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import '../styles/ProfilePage.css';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: '',
    site: '',
  });
  const [mobileAccount, setMobileAccount] = useState({ status: 'checking', account: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [verificationSending, setVerificationSending] = useState(false);
  const [message, setMessage] = useState(null);

  // Load profile from Firestore
  useEffect(() => {
    async function loadProfile() {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile({
            fullName: data.fullName || '',
            email: data.email || user.email || '',
            phone: data.phone || '',
            role: data.role || '',
            site: data.site || '',
          });
        } else {
          // Fallback if no profile doc exists yet
          setProfile({
            fullName: '',
            email: user.email || '',
            phone: '',
            role: '',
            site: '',
          });
        }

        try {
          const mobileAccountsRef = collection(db, 'mobile_accounts');
          const email = user.email?.trim().toLowerCase();
          const [byUid, byEmail] = await Promise.all([
            getDocs(query(mobileAccountsRef, where('authUid', '==', user.uid), limit(1))),
            email
              ? getDocs(query(mobileAccountsRef, where('email', '==', email), limit(1)))
              : Promise.resolve(null),
          ]);
          const emailMatch = byEmail?.docs.find((accountDoc) => {
            const authUid = accountDoc.data().authUid;
            return !authUid || authUid === user.uid;
          });
          const accountDoc = byUid.docs[0] || emailMatch;
          setMobileAccount({
            status: accountDoc ? 'found' : 'none',
            account: accountDoc?.data() || null,
          });
        } catch (err) {
          console.warn('Failed to check for a mobile app account:', err.message);
          setMobileAccount({ status: 'error', account: null });
        }
      } catch (err) {
        console.warn('Failed to load profile:', err.message);
        setProfile({
          fullName: '',
          email: user.email || '',
          phone: '',
          role: '',
          site: '',
        });
        setMobileAccount({ status: 'error', account: null });
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user.uid, user.email]);

  function handleChange(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setMessage(null);

    if (!profile.fullName.trim()) {
      setMessage({ type: 'error', text: 'Full name is required.' });
      return;
    }
    if (!profile.phone.trim()) {
      setMessage({ type: 'error', text: 'Phone number is required.' });
      return;
    }
    if (!profile.role) {
      setMessage({ type: 'error', text: 'Please select a role.' });
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        fullName: profile.fullName.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
      }, { merge: true });

      setMessage({ type: 'success', text: 'Profile updated successfully.' });
      setEditing(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save. Please try again.' });
      console.warn('Profile save error:', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setMessage(null);
    setResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setMessage({ type: 'success', text: 'Password reset instructions have been sent to your email.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Unable to send reset instructions. Please try again.' });
      console.warn('Password reset error:', err.message);
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleVerifyEmail() {
    setMessage(null);
    setVerificationSending(true);
    try {
      if (emailVerified) {
        await reload(user);
        setEmailVerified(user.emailVerified);
        setMessage({ type: 'success', text: user.emailVerified ? 'Your email is verified.' : 'Email is not verified yet. Open the verification link from your inbox, then check again.' });
      } else {
        await sendEmailVerification(user);
        setMessage({ type: 'success', text: 'Verification link sent. Check your inbox, then return here and check your status.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Could not verify your email right now. Please try again.' });
      console.warn('Email verification error:', err.message);
    } finally {
      setVerificationSending(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-card-header">
          <div className="profile-avatar-large">
            {profile.fullName
              ? profile.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
              : profile.email.substring(0, 2).toUpperCase()}
          </div>
          <div className="profile-card-info">
            <h2>{profile.fullName || 'Set your name'}</h2>
            <p className="profile-role-label">{profile.role || 'No role set'}</p>
          </div>
          {!editing && (
            <button className="edit-profile-btn" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>

        {message && (
          <div className={`profile-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <form className="profile-form" onSubmit={handleSave}>
          <div className="profile-field">
            <label htmlFor="profile-name">Full Name</label>
            <input
              id="profile-name"
              type="text"
              value={profile.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              disabled={!editing || saving}
              placeholder="Enter your full name"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              disabled
              className="field-readonly"
            />
            <span className="field-hint">Email cannot be changed</span>
          </div>

          <div className={`profile-email-verification ${emailVerified ? 'verified' : 'unverified'}`}>
            <div>
              <strong>{emailVerified ? 'Email verified' : 'Verify your email for hazard alerts'}</strong>
              <p>{emailVerified
                ? 'Hazard email notifications can be sent to this address.'
                : 'Confirm this address to receive hazard email notifications. Check your inbox after requesting a link.'}</p>
            </div>
            <button type="button" onClick={handleVerifyEmail} disabled={verificationSending}>
              {verificationSending ? 'Please wait…' : emailVerified ? 'Check status' : 'Send verification link'}
            </button>
          </div>

          <div className="profile-field">
            <label htmlFor="profile-phone">Phone Number</label>
            <input
              id="profile-phone"
              type="tel"
              value={profile.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              disabled={!editing || saving}
              placeholder="+63 912 345 6789"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-role">Role</label>
            <input
              id="profile-role"
              value={profile.role || 'Pending admin assignment'}
              disabled
              className="field-readonly"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-site">Site Location</label>
            <input
              id="profile-site"
              value={profile.site || 'No site assigned'}
              disabled
              className="field-readonly"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-mobile-account">Mobile App Account</label>
            <input
              id="profile-mobile-account"
              value={
                mobileAccount.status === 'checking'
                  ? 'Checking account...'
                  : mobileAccount.status === 'error'
                    ? 'Unable to check account'
                    : mobileAccount.account
                      ? `Linked${mobileAccount.account.status ? ` (${mobileAccount.account.status})` : ''}`
                      : 'No mobile app account'
              }
              disabled
              className="field-readonly"
            />
          </div>

          {editing && (
            <div className="profile-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="save-btn"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </form>

        <div className="profile-security">
          <div>
            <h3>Password</h3>
            <p>Send a password reset link to your account email.</p>
          </div>
          <button
            type="button"
            className="reset-password-btn"
            onClick={handleResetPassword}
            disabled={resettingPassword}
          >
            {resettingPassword ? 'Sending...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

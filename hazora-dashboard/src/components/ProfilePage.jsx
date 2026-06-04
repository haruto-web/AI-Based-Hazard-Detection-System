import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../config/roles';
import '../styles/ProfilePage.css';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
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
          });
        } else {
          // Fallback if no profile doc exists yet
          setProfile({
            fullName: '',
            email: user.email || '',
            phone: '',
            role: '',
          });
        }
      } catch (err) {
        console.warn('Failed to load profile:', err.message);
        setProfile({
          fullName: '',
          email: user.email || '',
          phone: '',
          role: '',
        });
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
        role: profile.role,
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
            <select
              id="profile-role"
              value={profile.role}
              onChange={(e) => handleChange('role', e.target.value)}
              disabled={!editing || saving}
            >
              <option value="" disabled>Select your role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
      </div>
    </div>
  );
}

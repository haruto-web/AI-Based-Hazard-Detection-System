import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Link } from 'react-router-dom';
import '../styles/AuthForm.css';

import { ROLES } from '../config/roles';

export default function AuthForm({ mode, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  function getErrorMessage(code) {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please log in instead.';
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (isRegister) {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!phone.trim()) {
        setError('Please enter your phone number.');
        return;
      }
      if (!role) {
        setError('Please select your role.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user profile in Firestore with additional details
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role: role,
          cameraIP: null,
          cameras: ['', '', '', '', ''],
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess?.();
    } catch (err) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-card">
        <div className="auth-brand">
          <span className="auth-brand-text">HAZORA</span>
        </div>

        <h1 className="auth-title">
          {isRegister ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="auth-subtitle">
          {isRegister ? 'Sign up for HAZORA Dashboard' : 'Log in to HAZORA Dashboard'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <>
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  disabled={loading}
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 912 345 6789"
                  disabled={loading}
                  autoComplete="tel"
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={loading}
                  className="form-select"
                >
                  <option value="" disabled>Select your role</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@archenInc.com"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 6 characters' : 'Enter your password'}
              disabled={loading}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p className="auth-error" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? (
            <>Already have an account? <Link to="/login">Log in</Link></>
          ) : (
            <>Don&apos;t have an account? <Link to="/register">Sign up</Link></>
          )}
        </p>
      </div>
    </div>
  );
}

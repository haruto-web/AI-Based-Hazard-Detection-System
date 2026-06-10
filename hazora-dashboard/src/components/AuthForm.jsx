import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Link } from 'react-router-dom';
import '../styles/AuthForm.css';

import { ROLES } from '../config/roles';
import { sanitizeInput, isValidEmail, isValidPhone, checkPasswordStrength } from '../utils/security';
import { logUserLogin, logLoginFailed } from '../utils/auditLogger';

export default function AuthForm({ mode, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(null);

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

    // Client-side validation with sanitization
    if (!email.trim() || !isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (isRegister) {
      if (!fullName.trim() || fullName.trim().length < 3) {
        setError('Please enter your full name (at least 3 characters).');
        return;
      }
      if (!phone.trim() || !isValidPhone(phone)) {
        setError('Please enter a valid Philippine phone number.');
        return;
      }
      if (!role) {
        setError('Please select your role.');
        return;
      }
      
      // Enhanced password validation
      const strengthCheck = checkPasswordStrength(password);
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (strengthCheck.strength === 'weak') {
        setError(`Password is too weak. ${strengthCheck.feedback.join(', ')}`);
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Sanitize user inputs before storing
        const sanitizedFullName = sanitizeInput(fullName.trim());
        const sanitizedPhone = sanitizeInput(phone.trim());
        
        // Create user profile in Firestore with additional details
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          fullName: sanitizedFullName,
          email: email.trim().toLowerCase(),
          phone: sanitizedPhone,
          role: role,
          cameraIP: null,
          cameras: ['', '', '', '', ''],
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        });
        
        // Log successful registration
        await logUserLogin(userCredential.user.uid, email);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        // Log successful login
        await logUserLogin(userCredential.user.uid, email);
      }
      onSuccess?.();
    } catch (err) {
      const errorMessage = getErrorMessage(err.code);
      setError(errorMessage);
      
      // Log failed login attempt
      await logLoginFailed(email, err.code);
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
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (isRegister) {
                    setPasswordStrength(checkPasswordStrength(e.target.value));
                  }
                }}
                placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                disabled={loading}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {isRegister && passwordStrength && password.length > 0 && (
              <div className={`password-strength password-strength-${passwordStrength.strength}`}>
                <div className="strength-indicator">
                  <div className={`strength-bar strength-${passwordStrength.strength}`}></div>
                </div>
                <span className="strength-text">
                  Password strength: {passwordStrength.strength}
                </span>
              </div>
            )}
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

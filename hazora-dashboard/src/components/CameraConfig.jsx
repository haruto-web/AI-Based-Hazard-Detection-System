import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export function validateIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (part === '' || part !== part.trim()) return false;
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === part;
  });
}

export default function CameraConfig({ cameraIP, onConnect, disabled }) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (cameraIP) {
      setInputValue(cameraIP);
    }
  }, [cameraIP]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmedIP = inputValue.trim();

    if (!validateIPv4(trimmedIP)) {
      setError('Please enter a valid IP address (e.g., 192.168.1.100)');
      return;
    }

    setSaving(true);

    // Save to localStorage immediately (always works)
    try {
      localStorage.setItem('hazora_camera_ip', trimmedIP);
    } catch (storageErr) {
      // localStorage unavailable — continue anyway
    }

    // Connect the stream immediately — don't wait for Firestore
    onConnect(trimmedIP);

    // Save to Firestore in background with a 5-second timeout
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firestore timeout')), 5000)
      );
      await Promise.race([
        setDoc(doc(db, 'users', user.uid), { cameraIP: trimmedIP }, { merge: true }),
        timeoutPromise,
      ]);
    } catch (err) {
      console.warn('Firestore save failed or timed out:', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="camera-config">
      <label htmlFor="camera-ip">Camera IP Address</label>
      <div className="camera-config-row">
        <input
          id="camera-ip"
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          placeholder="192.168.1.100"
          disabled={disabled || saving}
          aria-describedby={error ? 'ip-error' : undefined}
        />
        <button type="submit" disabled={disabled || saving}>
          {saving ? 'Saving...' : 'Connect'}
        </button>
      </div>
      {error && (
        <p id="ip-error" className="config-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

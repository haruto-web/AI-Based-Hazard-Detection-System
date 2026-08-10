import { useState, useEffect, useRef } from 'react';
import { validateIPv4 } from './CameraConfig';
import '../styles/StreamBox.css';

export default function StreamBox({ id, label, cameraIP, onIPChange, isMain = false, onPromote }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'connected' | 'failed'
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);
  const imgRef = useRef(null);

  // Sync input with prop
  useEffect(() => {
    if (cameraIP) {
      setInputValue(cameraIP);
    }
  }, [cameraIP]);

  // Handle connection when cameraIP changes
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!cameraIP) {
      setStatus('idle');
      return;
    }

    setStatus('loading');

    // 10-second timeout for connection failure
    timeoutRef.current = setTimeout(() => {
      setStatus('failed');
    }, 10000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [cameraIP]);

  function handleLoad() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('connected');
  }

  function handleError() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('failed');
  }

  function isUrl(value) {
    return value.startsWith('http://') || value.startsWith('https://');
  }

  function getIPFromUrl(value) {
    try {
      const url = new URL(value);
      return validateIPv4(url.hostname) ? url.hostname : '';
    } catch {
      return '';
    }
  }

  function getStreamUrl(value) {
    if (!value) return '';

    if (!isUrl(value)) {
      return `http://${value}:81/stream`;
    }

    try {
      const url = new URL(value);
      if (url.pathname === '/' || url.pathname === '') {
        return `${url.protocol}//${url.hostname}:81/stream`;
      }
      return value;
    } catch {
      return value;
    }
  }

  function handleConnect(e) {
    e.preventDefault();
    setError(null);
    const trimmed = inputValue.trim();

    if (!trimmed) {
      // Clear — disconnect
      onIPChange(id, '');
      setStatus('idle');
      return;
    }

    if (isUrl(trimmed)) {
      const ipFromUrl = getIPFromUrl(trimmed);
      onIPChange(id, ipFromUrl || trimmed);
    } else if (validateIPv4(trimmed)) {
      onIPChange(id, trimmed);
    } else {
      setError('Enter a valid IP or stream URL');
      return;
    }
  }

  function handleDisconnect() {
    onIPChange(id, '');
    setInputValue('');
    setStatus('idle');
  }

  const streamUrl = getStreamUrl(cameraIP);

  return (
    <div className={`stream-box ${status}${isMain ? ' main' : ''}`}>
      <div className="stream-box-header">
        <span className="stream-box-label">{label}</span>
        <div className="stream-box-header-actions">
          <button
            type="button"
            className={`stream-box-main-btn${isMain ? ' active' : ''}`}
            onClick={() => onPromote?.(id)}
            disabled={isMain}
            title={isMain ? 'Current big screen' : 'Show on big screen'}
          >
            {isMain ? 'Main' : 'Big'}
          </button>
          <span className={`stream-box-status-dot ${status}`} title={status}></span>
        </div>
      </div>

      <div className="stream-box-content">
        {status === 'loading' && (
          <div className="stream-box-loading">
            <div className="spinner"></div>
            <p>Connecting...</p>
          </div>
        )}

        {status === 'connected' && streamUrl && (
          <img
            ref={imgRef}
            className="stream-box-img"
            src={streamUrl}
            alt={`${label} - Live Camera Stream`}
            onError={handleError}
          />
        )}

        {status === 'failed' && (
          <div className="stream-box-failed">
            <div className="failed-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p>Connection failed</p>
            <div className="stream-box-failed-actions">
              <button className="retry-btn" onClick={() => onIPChange(id, cameraIP)}>
                Retry
              </button>
              <button className="stream-box-disconnect-btn" onClick={handleDisconnect}>
                ✕
              </button>
            </div>
          </div>
        )}

        {status === 'idle' && (
          <div className="stream-box-placeholder">
            <div className="placeholder-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <p>No camera connected</p>
          </div>
        )}

        {/* Hidden img to detect load/error while in loading state */}
        {status === 'loading' && streamUrl && (
          <img
            className="stream-box-img-hidden"
            src={streamUrl}
            alt=""
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>

      <form className="stream-box-controls" onSubmit={handleConnect}>
        <input
          type="text"
          className="stream-box-ip-input"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); }}
          placeholder="IP or stream URL"
          disabled={status === 'loading'}
        />
        {status === 'connected' || status === 'failed' ? (
          <button type="button" className="stream-box-disconnect-btn" onClick={handleDisconnect}>
            ✕
          </button>
        ) : (
          <button type="submit" className="stream-box-connect-btn" disabled={status === 'loading'}>
            →
          </button>
        )}
      </form>
      {error && <p className="stream-box-error">{error}</p>}
    </div>
  );
}

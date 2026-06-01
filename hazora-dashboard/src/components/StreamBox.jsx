import { useState, useEffect, useRef } from 'react';
import { validateIPv4 } from './CameraConfig';
import '../styles/StreamBox.css';

export default function StreamBox({ id, label, cameraIP, onIPChange }) {
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

  function handleConnect(e) {
    e.preventDefault();
    setError(null);
    const trimmed = inputValue.trim();

    if (!trimmed) {
      // Clear the IP — disconnect
      onIPChange(id, '');
      setStatus('idle');
      return;
    }

    if (!validateIPv4(trimmed)) {
      setError('Invalid IP');
      return;
    }

    onIPChange(id, trimmed);
  }

  function handleDisconnect() {
    onIPChange(id, '');
    setInputValue('');
    setStatus('idle');
  }

  const streamUrl = cameraIP ? `http://${cameraIP}:81/stream` : '';

  return (
    <div className={`stream-box ${status}`}>
      <div className="stream-box-header">
        <span className="stream-box-label">{label}</span>
        <span className={`stream-box-status-dot ${status}`} title={status}></span>
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
            <div className="failed-icon">⚠️</div>
            <p>Connection failed</p>
            <button className="retry-btn" onClick={() => onIPChange(id, cameraIP)}>
              Retry
            </button>
          </div>
        )}

        {status === 'idle' && (
          <div className="stream-box-placeholder">
            <div className="placeholder-icon">📷</div>
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
          placeholder="Camera IP"
          disabled={status === 'loading'}
        />
        {status === 'connected' ? (
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

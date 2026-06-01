import { useState, useEffect, useRef } from 'react';
import '../styles/StreamBox.css';

export default function StreamBox({ cameraIP, isConnecting, label, onStatusChange }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'connected' | 'failed'
  const timeoutRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    // Clear any existing timeout on dependency change
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!cameraIP || !isConnecting) {
      setStatus('idle');
      return;
    }

    setStatus('loading');

    // Set a 10-second timeout for connection failure
    timeoutRef.current = setTimeout(() => {
      setStatus('failed');
      onStatusChange('failed');
    }, 10000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [cameraIP, isConnecting]);

  function handleLoad() {
    // Stream started successfully
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('connected');
    onStatusChange('connected');
  }

  function handleError() {
    // Network error or stream unreachable
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('failed');
    onStatusChange('failed');
  }

  const streamUrl = cameraIP ? `http://${cameraIP}:81/stream` : '';

  return (
    <div className="stream-box">
      <div className="stream-box-label">{label}</div>

      {status === 'loading' && (
        <div className="stream-box-loading">
          <div className="spinner"></div>
          <p>Connecting to camera...</p>
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
          ref={imgRef}
          className="stream-box-img-hidden"
          src={streamUrl}
          alt=""
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}

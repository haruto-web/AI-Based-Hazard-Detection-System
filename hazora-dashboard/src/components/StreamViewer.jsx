import { useState, useEffect } from 'react';
import '../styles/StreamViewer.css';

export default function StreamViewer({ cameraIP, isConnecting, onStatusChange }) {
  const [streamUrl, setStreamUrl] = useState('');
  const [showStream, setShowStream] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isConnecting || !cameraIP) {
      setStreamUrl('');
      setShowStream(false);
      setShowLoading(false);
      return;
    }

    setShowLoading(true);
    setShowStream(false);

    const url = `http://${cameraIP}:81/stream`;
    
    // Set stream URL after brief delay
    const timer = setTimeout(() => {
      setStreamUrl(url);
      setShowLoading(false);
      setShowStream(true);
      onStatusChange('connected');
    }, 500);

    return () => clearTimeout(timer);
  }, [cameraIP, isConnecting]);

  return (
    <div className="stream-viewer">
      {showLoading && (
        <div className="stream-loading">
          <div className="spinner"></div>
          <p>Connecting to camera...</p>
        </div>
      )}

      {showStream && streamUrl && (
        <img
          className="stream-img visible"
          src={streamUrl}
          alt="Live Camera Stream"
        />
      )}

      {!isConnecting && !showStream && !showLoading && (
        <div className="stream-placeholder">
          <div className="placeholder-icon"></div>
          <p>Enter camera IP and click Connect to start streaming</p>
        </div>
      )}
    </div>
  );
}

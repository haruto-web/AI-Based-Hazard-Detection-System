import '../styles/DetectionViewer.css';

export default function DetectionViewerContent({
  canvasRef,
  loading,
  error,
  status,
  detections,
  detecting,
  toggleDetection,
  handleRetry,
}) {
  return (
    <div className="detection-viewer">
      <div className="detection-header">
        <h3>AI Detection</h3>
        <button
          className={`detection-toggle ${detecting ? 'active' : ''}`}
          onClick={toggleDetection}
          disabled={loading || !!error}
        >
          {loading ? 'Loading models...' : detecting ? 'Stop Detection' : 'Start Detection'}
        </button>
      </div>

      {error && (
        <div className="detection-error-block">
          <p className="detection-error">{error}</p>
          <button className="detection-error-retry" onClick={handleRetry}>
            Retry AI
          </button>
        </div>
      )}

      {detecting && (
        <>
          <div className="detection-panel">
            <div className="ppe-status-bar" aria-live="polite">
              <div className={`ppe-pill ${detections.helmets > 0 ? 'good' : 'warn'}`}>
                <span className="ppe-pill-title">Helmet</span>
                <span className="ppe-pill-state">{detections.helmets > 0 ? 'Detected' : 'Missing'}</span>
              </div>
              <div className={`ppe-pill ${detections.vests > 0 ? 'good' : 'warn'}`}>
                <span className="ppe-pill-title">Vest</span>
                <span className="ppe-pill-state">{detections.vests > 0 ? 'Detected' : 'Missing'}</span>
              </div>
              <div className={`ppe-pill ${detections.shoes > 0 ? 'good' : 'warn'}`}>
                <span className="ppe-pill-title">Shoes</span>
                <span className="ppe-pill-state">{detections.shoes > 0 ? 'Detected' : 'Missing'}</span>
              </div>
            </div>

            <div className="detection-summary-grid">
              <div className="summary-card">
                <span className="summary-label">Persons</span>
                <strong className="summary-value">{detections.persons}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Helmets</span>
                <strong className="summary-value">{detections.helmets}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Vests</span>
                <strong className="summary-value">{detections.vests}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">Shoes</span>
                <strong className="summary-value">{detections.shoes}</strong>
              </div>
            </div>

            <div className="detection-risk-grid">
              <div className="risk-box">
                <span className="risk-label">Compliant</span>
                <strong>{detections.compliant}</strong>
              </div>
              <div className="risk-box hazard-box">
                <span className="risk-label">Violations</span>
                <strong>{detections.violations}</strong>
              </div>
            </div>

          </div>

          {status && <p className="detection-status">{status}</p>}
          <canvas ref={canvasRef} className="detection-canvas" />
        </>
      )}
    </div>
  );
}

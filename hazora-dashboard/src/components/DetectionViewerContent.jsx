import '../styles/DetectionViewer.css';

export default function DetectionViewerContent({
  canvasRef,
  loading,
  error,
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
          <div className="detection-stats">
            <span className="stat person-stat">Persons: {detections.persons}</span>
            <span className="stat face-stat">Faces: {detections.faces}</span>
            <span className="stat helmet-stat">Helmet: {detections.helmets}</span>
            <span className={`stat no-helmet-stat${detections.noHelmets > 0 ? ' active' : ''}`}>
              No helmet: {detections.noHelmets}
            </span>
          </div>
          <canvas ref={canvasRef} className="detection-canvas" />
        </>
      )}
    </div>
  );
}

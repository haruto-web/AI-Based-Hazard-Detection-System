import '../styles/DetectionViewer.css';

export default function DetectionViewerContent({
  canvasRef,
  streamImageRef,
  streamUrl,
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
            <span className="stat helmet-stat">Helmets: {detections.helmets}</span>
            <span className="stat vest-stat">Vests: {detections.vests}</span>
            <span className="stat shoes-stat">Shoes: {detections.shoes}</span>
            <span className={`stat violation-stat${detections.violations > 0 ? ' active' : ''}`}>
              Violations: {detections.violations}
            </span>
          </div>
          <img ref={streamImageRef} className="detection-stream-source" src={streamUrl} alt="" crossOrigin="anonymous" />
          <canvas ref={canvasRef} className="detection-canvas" />
        </>
      )}
    </div>
  );
}

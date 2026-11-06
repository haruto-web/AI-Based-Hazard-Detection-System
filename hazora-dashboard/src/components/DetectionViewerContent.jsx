import '../styles/DetectionViewer.css';
import {
  MATERIAL_LABELS,
  PROTRUDING_LABELS,
  SCAFFOLDING_LABELS,
} from '../AI/LM_detection/ppeDetection';

export default function DetectionViewerContent({
  canvasRef,
  loading,
  scaffoldingLoading,
  protrudingLoading,
  materialLoading,
  error,
  scaffoldingError,
  protrudingError,
  materialError,
  status,
  detections,
  detecting,
  activeDetectors = [],
  detectorModeReady = false,
  canManageDetectorMode = false,
  updateActiveDetectors,
  toggleDetection,
  handleRetry,
}) {
  const detectorOptions = [
    ['ppe', 'PPE'],
    ['scaffolding', 'Scaffolding'],
    ['protruding', 'Protruding hazard'],
    ['material', 'Material handling'],
  ];
  const ppeEnabled = activeDetectors.includes('ppe');
  const ppeStatus = (missingCount, itemCount) => {
    if (!ppeEnabled) return { state: 'Not checked', tone: 'caution' };
    if (missingCount > 0) return { state: `Missing (${missingCount})`, tone: 'danger' };
    if (detections.persons === 0) return { state: 'No workers detected', tone: 'caution' };
    if (itemCount > 0) return { state: 'Detected', tone: 'good' };
    return { state: 'Check camera', tone: 'caution' };
  };
  const ppeItems = [
    ['Helmet', detections.noHelmets, detections.helmets],
    ['Vest', detections.noVests, detections.vests],
    ['Shoes', detections.noShoes, detections.shoes],
  ];

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

      {canManageDetectorMode && (
        <details className="detector-mode-settings">
          <summary>Operator detector settings</summary>
          <p>Choose which detectors run. The active selection is shown in detection status.</p>
          <div className="detector-mode-options" role="group" aria-label="Active AI detectors">
            {detectorOptions.map(([name, label]) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={activeDetectors.includes(name)}
                  disabled={!detectorModeReady}
                  onChange={() => {
                    const next = activeDetectors.includes(name)
                      ? activeDetectors.filter((item) => item !== name)
                      : [...activeDetectors, name];
                    updateActiveDetectors(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="detector-mode-all"
            disabled={!detectorModeReady}
            onClick={() => updateActiveDetectors(detectorOptions.map(([name]) => name))}
          >
            Run all detectors
          </button>
        </details>
      )}

      {error && (
        <div className="detection-error-block">
          <p className="detection-error">{error}</p>
          <button className="detection-error-retry" onClick={handleRetry}>
            Retry AI
          </button>
        </div>
      )}
      {scaffoldingError && (
        <div className="detection-error-block">
          <p className="detection-error">Scaffolding model failed to load: {scaffoldingError}</p>
          <button className="detection-error-retry" onClick={handleRetry}>
            Retry scaffolding model
          </button>
        </div>
      )}
      {scaffoldingLoading && (
        <p className="detection-status" role="status">
          Loading scaffolding detection model. This may take a while.
        </p>
      )}
      {protrudingError && (
        <div className="detection-error-block">
          <p className="detection-error">Protruding hazard model failed to load: {protrudingError}</p>
          <button className="detection-error-retry" onClick={handleRetry}>
            Retry protruding hazard model
          </button>
        </div>
      )}
      {protrudingLoading && (
        <p className="detection-status" role="status">
          Loading protruding hazard detection model. This may take a while.
        </p>
      )}
      {materialError && (
        <div className="detection-error-block">
          <p className="detection-error">Material-handling model failed to load: {materialError}</p>
          <button className="detection-error-retry" onClick={handleRetry}>
            Retry material-handling model
          </button>
        </div>
      )}
      {materialLoading && (
        <p className="detection-status" role="status">
          Loading material-handling detection model. This may take a while.
        </p>
      )}

      {detecting && (
        <>
          <div className="detection-panel">
            <div className="ppe-status-bar" aria-live="polite">
              {ppeItems.map(([label, missing, detected]) => {
                const result = ppeStatus(missing, detected);
                return (
                  <div className={`ppe-pill ${result.tone}`} key={label}>
                    <span className="ppe-pill-title">{label}</span>
                    <span className="ppe-pill-state">{result.state}</span>
                  </div>
                );
              })}
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

            <section className="scaffolding-detections" aria-label="Scaffolding detections">
              <h4>Scaffolding Detection</h4>
              <div className="scaffolding-summary-grid">
                {SCAFFOLDING_LABELS.map((label) => (
                  <div
                    className={`summary-card ${
                      (detections.scaffoldingClasses?.[label] || 0) > 0
                        ? label === 'No Base' ? 'scaffolding-hazard' : 'detection-safe'
                        : ''
                    }`}
                    key={label}
                  >
                    <span className="summary-label">{label}</span>
                    <strong className="summary-value">
                      {detections.scaffoldingClasses?.[label] || 0}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="scaffolding-detections" aria-label="Protruding hazard detections">
              <h4>Protruding Hazard Detection</h4>
              <div className="scaffolding-summary-grid">
                {PROTRUDING_LABELS.map((label) => (
                  <div
                    className={`summary-card ${
                      (detections.protrudingClasses?.[label] || 0) > 0
                        ? label === 'Potruding Hazard' ? 'scaffolding-hazard' : 'detection-safe'
                        : ''
                    }`}
                    key={label}
                  >
                    <span className="summary-label">{label}</span>
                    <strong className="summary-value">
                      {detections.protrudingClasses?.[label] || 0}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="scaffolding-detections" aria-label="Material-handling detections">
              <h4>Material Handling</h4>
              <div className="scaffolding-summary-grid">
                {MATERIAL_LABELS.map((label) => (
                  <div
                    className={`summary-card ${
                      (detections.materialClasses?.[label] || 0) > 0
                        ? label === 'Messy' ? 'scaffolding-hazard' : 'detection-safe'
                        : ''
                    }`}
                    key={label}
                  >
                    <span className="summary-label">{label}</span>
                    <strong className="summary-value">
                      {detections.materialClasses?.[label] || 0}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <div className="detection-risk-grid">
              <div className={`risk-box ${detections.compliant > 0 ? 'compliant-box' : ''}`}>
                <span className="risk-label">Compliant</span>
                <strong>{detections.compliant}</strong>
              </div>
              <div className={`risk-box ${detections.violations > 0 ? 'hazard-box' : ''}`}>
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

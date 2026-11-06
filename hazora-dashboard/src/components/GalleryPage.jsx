import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  buildTrainingDataset,
  createIncidentReport,
  deleteIncident,
  fetchTrainingDataset,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import { hasFullAccess } from '../config/roles';
import '../styles/GalleryPage.css';

const SITE_NOT_SET = 'Site location not set';
const IMAGE_MAX_BYTES = 500 * 1024;
const INITIAL_COUNTS = {
  persons: 0,
  helmets: 0,
  noHelmets: 0,
  vests: 0,
  noVests: 0,
  shoes: 0,
  noShoes: 0,
  compliant: 0,
  standardScaffoldingBase: 0,
  diagonalRidgerBrace: 0,
  scaffolding: 0,
  crossRidgeBrace: 0,
  standardScaffoldingLadder: 0,
  noBase: 0,
  protrudingHazards: 0,
  safetyCaps: 0,
  organized: 0,
  messy: 0,
};

const COUNT_FIELDS = {
  ppe: [
    ['persons', 'People'],
    ['helmets', 'Safety helmets'],
    ['noHelmets', 'Missing helmets'],
    ['vests', 'Safety vests'],
    ['noVests', 'Missing vests'],
    ['shoes', 'Safety shoes'],
    ['noShoes', 'Missing safety shoes'],
    ['compliant', 'Compliant workers'],
  ],
  scaffolding: [
    ['standardScaffoldingBase', 'Standard Scaffolding Base'],
    ['diagonalRidgerBrace', 'Diagonal Ridger Brace'],
    ['scaffolding', 'Scaffolding'],
    ['crossRidgeBrace', 'CrossRidge Brace'],
    ['standardScaffoldingLadder', 'Standard Scaffolding Ladder'],
    ['noBase', 'No Base'],
  ],
  protruding: [
    ['protrudingHazards', 'Protruding hazards'],
    ['safetyCaps', 'Safety caps'],
  ],
  material: [
    ['organized', 'Organized areas'],
    ['messy', 'Messy areas'],
  ],
};

const DETECTION_TYPES = {
  ppe: { label: 'PPE detection', model: 'Manual PPE capture' },
  scaffolding: { label: 'Scaffolding detection', model: 'Manual scaffolding capture' },
  protruding: { label: 'Protruding hazard detection', model: 'Manual protruding hazard capture' },
  material: { label: 'Material handling detection', model: 'Manual material capture' },
};

function toLocalDateTimeValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function loadCompressedImage(file) {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not process the selected image.'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > IMAGE_MAX_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length * 0.75 > IMAGE_MAX_BYTES) {
        reject(new Error('This image is too large to store safely. Choose a smaller image.'));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the selected image.'));
    };
    image.src = objectUrl;
  });
}

// Incident captures show images attached to detected incidents from supported streams.
const SEVERITY_FILTERS = ['all', 'low', 'medium', 'high', 'critical'];

export default function GalleryPage({ userRole, cameraIP = '', siteLocation = '' }) {
  const { user } = useAuth();
  const canExportDataset = hasFullAccess(userRole, 'gallery');
  const canAddCapture = hasFullAccess(userRole, 'gallery');
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [showCaptureForm, setShowCaptureForm] = useState(false);
  const [captureType, setCaptureType] = useState('ppe');
  const [capturedAt, setCapturedAt] = useState(() => toLocalDateTimeValue(new Date()));
  const [captureCamera, setCaptureCamera] = useState(cameraIP);
  const [captureSite, setCaptureSite] = useState(siteLocation);
  const [captureSeverity, setCaptureSeverity] = useState('low');
  const [captureCounts, setCaptureCounts] = useState(INITIAL_COUNTS);
  const [captureImage, setCaptureImage] = useState('');
  const [captureImageName, setCaptureImageName] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [savingCapture, setSavingCapture] = useState(false);

  function resetCaptureForm() {
    setShowCaptureForm(false);
    setCaptureError('');
    setCaptureImage('');
    setCaptureImageName('');
    setCapturedAt(toLocalDateTimeValue(new Date()));
    setCaptureCamera(cameraIP);
    setCaptureSite(siteLocation);
    setCaptureCounts(INITIAL_COUNTS);
    setCaptureType('ppe');
    setCaptureSeverity('low');
  }

  async function handleCaptureImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCaptureError('');
    try {
      const imageData = await loadCompressedImage(file);
      setCaptureImage(imageData);
      setCaptureImageName(file.name);
    } catch (error) {
      setCaptureImage('');
      setCaptureImageName('');
      setCaptureError(error.message || 'Could not process the selected image.');
    }
  }

  async function handleCreateCapture(event) {
    event.preventDefault();
    setCaptureError('');
    if (!captureImage) {
      setCaptureError('Select a capture image before saving.');
      return;
    }
    if (!capturedAt || !Number.isFinite(new Date(capturedAt).getTime())) {
      setCaptureError('Enter a valid capture date and time.');
      return;
    }
    if (!captureCamera.trim()) {
      setCaptureError('Enter the ESP32 camera IP or address.');
      return;
    }

    const countSummary = COUNT_FIELDS[captureType]
      .map(([key, label]) => `${label}: ${captureCounts[key]}`)
      .join('; ');
    const hazardType = DETECTION_TYPES[captureType].label;
    const description = `${hazardType} counts — ${countSummary}.`;
    const detectionCounts = Object.fromEntries(
      COUNT_FIELDS[captureType].map(([key]) => [key, captureCounts[key]]),
    );

    setSavingCapture(true);
    try {
      const incident = await createIncidentReport({
        userId: user?.uid,
        hazardType,
        hazardCode: `${captureType}_detection`,
        description,
        precautions: '',
        cameraSource: captureCamera.trim(),
        severity: captureSeverity,
        detectionConfidence: 0,
        model: DETECTION_TYPES[captureType].model,
        detectedWorkers: captureCounts.persons || 0,
        helmets: captureCounts.helmets,
        noHelmets: captureCounts.noHelmets,
        vests: captureCounts.vests,
        noVests: captureCounts.noVests,
        shoes: captureCounts.shoes,
        noShoes: captureCounts.noShoes,
        compliant: captureCounts.compliant,
        imageData: captureImage,
        site: captureSite.trim(),
        capturedAt: new Date(capturedAt),
        detectionCounts,
        requireFirestore: true,
      });
      setIncidents((current) => [incident, ...current.filter((item) => item.id !== incident.id)]);
      resetCaptureForm();
    } catch (error) {
      console.error('Could not save historical incident capture:', error);
      setCaptureError(error.message || 'Could not save this capture. Please try again.');
    } finally {
      setSavingCapture(false);
    }
  }

  async function handleDelete(capture) {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteIncident(capture.id);
      setConfirmDelete(null);
      // Close the detail modal if the deleted item was open.
      setSelected((current) => (current && current.id === capture.id ? null : current));
      setIncidents((current) => current.filter((incident) => incident.id !== capture.id));
    } catch (error) {
      console.error('Could not delete gallery capture:', error);
      setDeleteError(error.message || 'Could not delete this capture. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleExportDataset() {
    setExportMessage('');
    try {
      const trainingSamples = await fetchTrainingDataset();
      if (trainingSamples.length === 0) {
        setExportMessage('No validated image records are available to export.');
        return;
      }

      const blob = new Blob([JSON.stringify(trainingSamples, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hazora-training-dataset-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage(`Exported ${trainingSamples.length} validated image records.`);
    } catch (error) {
      console.error('Could not export training dataset:', error);
      setExportMessage(error.message || 'Could not export the training dataset. Please try again.');
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToIncidents(user?.uid, setIncidents);

    function refreshIncidents() {
      setIncidents(getIncidents());
    }

    window.addEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents);
    window.addEventListener('storage', refreshIncidents);
    return () => {
      unsubscribe();
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents);
      window.removeEventListener('storage', refreshIncidents);
    };
  }, [user?.uid]);

  // Only incidents with a captured image belong in the gallery, newest first.
  const captures = useMemo(() => (
    incidents
      .filter((incident) => incident.imageData)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  ), [incidents]);
  const validatedCount = buildTrainingDataset(incidents).length;

  // Apply the severity filter + free-text search (hazard, description, site,
  // camera, date, time).
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return captures.filter((capture) => {
      if (severityFilter !== 'all' && capture.severity !== severityFilter) return false;
      if (!q) return true;
      const haystack = [
        capture.hazardType,
        capture.hazardCategory,
        ...(Array.isArray(capture.subTypes) ? capture.subTypes : []),
        capture.description,
        capture.site || SITE_NOT_SET,
        capture.cameraSource,
        capture.validationStatus,
        capture.date,
        capture.time,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [captures, severityFilter, searchQuery]);

  const captureSections = [
    {
      id: 'pending',
      title: 'Awaiting mobile validation',
      description: 'Mobile-submitted captures not yet marked validated by a safety officer.',
      captures: filtered.filter((capture) => capture.validationStatus === 'Pending Validation'),
    },
    {
      id: 'validated',
      title: 'Validated by mobile safety officers',
      description: 'Classified and validated in the mobile app by field safety officers.',
      captures: filtered.filter((capture) => capture.validationStatus === 'Validated'),
    },
    {
      id: 'other',
      title: 'Other incident captures',
      description: 'Captures without a mobile validation status, including website detections.',
      captures: filtered.filter((capture) => !['Pending Validation', 'Validated'].includes(capture.validationStatus)),
    },
  ].filter((section) => section.captures.length > 0);

  return (
    <div className="gallery-page">
      <div className="gallery-header">
        <div>
          <h2 className="gallery-title">Incident Captures</h2>
          <p className="gallery-subtitle">
            Review captures and mobile officer classifications. Validation is completed in the mobile app.
          </p>
        </div>
        <div className="gallery-header-actions">
          {canAddCapture && (
            <button
              type="button"
              className="gallery-add-capture-btn"
              onClick={() => {
                setCaptureError('');
                setCaptureCamera(cameraIP);
                setCaptureSite(siteLocation);
                setShowCaptureForm(true);
              }}
            >
              Add capture
            </button>
          )}
          {canExportDataset && (
            <button type="button" className="gallery-export-btn" onClick={handleExportDataset}>
              Export validated dataset ({validatedCount})
            </button>
          )}
          <span className="gallery-count">
            {filtered.length} of {captures.length} capture{captures.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      {exportMessage && <p className="gallery-feedback" role="status">{exportMessage}</p>}
      {showCaptureForm && (
        <div className="gallery-overlay" onClick={() => {
          if (!savingCapture) resetCaptureForm();
        }}>
          <form
            className="gallery-capture-form"
            onSubmit={handleCreateCapture}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-capture-title"
          >
            <div className="gallery-modal-header">
              <h3 id="gallery-capture-title">Add historical capture</h3>
              <button
                type="button"
                className="gallery-modal-close"
                onClick={resetCaptureForm}
                aria-label="Close"
                disabled={savingCapture}
              >
                ✕
              </button>
            </div>
            <p className="gallery-capture-help">
              Upload the evidence image, enter when it was captured, and record the detections. The capture will be saved to the incidents collection.
            </p>
            <label className="gallery-form-field">
              Capture image
              <input
                type="file"
                accept="image/*"
                onChange={handleCaptureImageChange}
                required={!captureImage}
                disabled={savingCapture}
              />
              <span className="gallery-form-hint">
                {captureImageName ? `${captureImageName} (compressed for Firestore)` : 'Required; images are resized and compressed before upload.'}
              </span>
            </label>
            {captureImage && (
              <img className="gallery-capture-preview" src={captureImage} alt="Selected capture preview" />
            )}
            <div className="gallery-form-grid">
              <label className="gallery-form-field">
                Capture date and time
                <input
                  type="datetime-local"
                  value={capturedAt}
                  onChange={(event) => setCapturedAt(event.target.value)}
                  required
                  disabled={savingCapture}
                />
              </label>
              <label className="gallery-form-field">
                ESP32 camera IP or address
                <input
                  type="text"
                  value={captureCamera}
                  onChange={(event) => setCaptureCamera(event.target.value)}
                  placeholder="e.g. 192.168.55.122"
                  required
                  disabled={savingCapture}
                />
              </label>
              <label className="gallery-form-field">
                Site (optional)
                <input
                  type="text"
                  value={captureSite}
                  onChange={(event) => setCaptureSite(event.target.value)}
                  placeholder="Site name"
                  disabled={savingCapture}
                />
              </label>
              <label className="gallery-form-field">
                Detection category
                <select
                  value={captureType}
                  onChange={(event) => setCaptureType(event.target.value)}
                  disabled={savingCapture}
                >
                  {Object.entries(DETECTION_TYPES).map(([key, type]) => (
                    <option key={key} value={key}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="gallery-form-field">
                Severity
                <select
                  value={captureSeverity}
                  onChange={(event) => setCaptureSeverity(event.target.value)}
                  disabled={savingCapture}
                >
                  {SEVERITY_FILTERS.filter((level) => level !== 'all').map((level) => (
                    <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="gallery-count-fields">
              <legend>Detection counts</legend>
              {COUNT_FIELDS[captureType].map(([key, label]) => (
                <label key={key} className="gallery-form-field">
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={captureCounts[key]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setCaptureCounts((current) => ({
                        ...current,
                        [key]: Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0,
                      }));
                    }}
                    required
                    disabled={savingCapture}
                  />
                </label>
              ))}
            </fieldset>
            {captureError && <p className="gallery-form-error" role="alert">{captureError}</p>}
            <div className="gallery-form-actions">
              <button type="button" className="gallery-form-cancel" onClick={resetCaptureForm} disabled={savingCapture}>
                Cancel
              </button>
              <button type="submit" className="gallery-add-capture-btn" disabled={savingCapture}>
                {savingCapture ? 'Saving…' : 'Save capture'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Search + severity filters */}
      <div className="gallery-controls">
        <div className="gallery-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <input
            type="text"
            placeholder="Search by hazard, site, camera, or date…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search incident captures"
          />
          {searchQuery && (
            <button className="gallery-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <div className="gallery-severity-filters" role="group" aria-label="Filter by severity">
          {SEVERITY_FILTERS.map((level) => (
            <button
              key={level}
              type="button"
              className={`gallery-severity-btn ${level} ${severityFilter === level ? 'active' : ''}`}
              onClick={() => setSeverityFilter(level)}
              aria-pressed={severityFilter === level}
            >
              {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {captures.length === 0 ? (
        <div className="gallery-empty">
          <p>No incident captures yet.</p>
          <p className="gallery-empty-hint">
            Captured images appear here when hazards are detected or when an authorized user adds a historical capture.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="gallery-empty">
          <p>No captures match your filters.</p>
          <p className="gallery-empty-hint">Try a different search term or severity.</p>
        </div>
      ) : (
        <div className="gallery-sections">
          {captureSections.map((section) => (
            <section key={section.id} className={`gallery-section gallery-section-${section.id}`}>
              <div className="gallery-section-header">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <span className="gallery-section-count">{section.captures.length}</span>
              </div>
              <div className="gallery-grid">
                {section.captures.map((capture) => (
                  <div
                    key={capture.id}
                    className="gallery-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(capture)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(capture); }
                    }}
                  >
                    <div className="gallery-card-image">
                      <img src={capture.imageData} alt={capture.hazardType} loading="lazy" />
                      <span className={`gallery-card-severity ${capture.severity}`}>{capture.severity}</span>
                      {capture.validationStatus && (
                        <span className={`gallery-validation-badge ${capture.validationStatus === 'Validated' ? 'validated' : 'pending'}`}>
                          {capture.validationStatus}
                        </span>
                      )}
                      <span
                        className="gallery-card-delete"
                        role="button"
                        tabIndex={0}
                        aria-label="Delete capture"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError('');
                          setConfirmDelete(capture);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteError('');
                            setConfirmDelete(capture);
                          }
                        }}
                      >
                        🗑
                      </span>
                      {capture.faceData && (
                        <img className="gallery-card-face" src={capture.faceData} alt="Detected face" loading="lazy" />
                      )}
                    </div>
                    <div className="gallery-card-body">
                      <strong className="gallery-card-hazard">{capture.hazardType}</strong>
                      <span className="gallery-card-meta">{capture.date} • {capture.time}</span>
                      <span className="gallery-card-site">{capture.site || SITE_NOT_SET}</span>
                      {capture.hazardCategory && (
                        <span className="gallery-card-meta">Category: {capture.hazardCategory}</span>
                      )}
                      {Array.isArray(capture.subTypes) && capture.subTypes.length > 0 && (
                        <span className="gallery-card-meta">Labels: {capture.subTypes.join(', ')}</span>
                      )}
                      <p className="gallery-card-desc">{capture.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <div className="gallery-overlay" onClick={() => setSelected(null)}>
          <div className="gallery-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="gallery-modal-header">
              <h3>{selected.hazardType}</h3>
              <button className="gallery-modal-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>
            <div className="gallery-modal-image">
              <img src={selected.imageData} alt={selected.hazardType} />
            </div>
            {selected.faceData && (
              <div className="gallery-modal-face">
                <span className="gallery-modal-label">Detected face (evidence)</span>
                <img src={selected.faceData} alt="Detected face" />
              </div>
            )}
            <div className="gallery-modal-info">
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Date & time</span>
                <span>{selected.date} • {selected.time}</span>
              </div>
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Site</span>
                <span>{selected.site || SITE_NOT_SET}</span>
              </div>
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Camera</span>
                <span>{selected.cameraSource || 'N/A'}</span>
              </div>
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Severity</span>
                <span className={`gallery-card-severity gallery-modal-severity ${selected.severity}`}>
                  {selected.severity}
                </span>
              </div>
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Mobile validation</span>
                <span>{selected.validationStatus || 'Not validated in mobile app'}</span>
              </div>
              {selected.hazardCategory && (
                <div className="gallery-modal-row">
                  <span className="gallery-modal-label">Officer category</span>
                  <span>{selected.hazardCategory}</span>
                </div>
              )}
              {Array.isArray(selected.subTypes) && selected.subTypes.length > 0 && (
                <div className="gallery-modal-row">
                  <span className="gallery-modal-label">Officer labels</span>
                  <span>{selected.subTypes.join(', ')}</span>
                </div>
              )}
              {selected.classifiedBy && (
                <div className="gallery-modal-row">
                  <span className="gallery-modal-label">Classified by</span>
                  <span>{selected.classifiedBy}</span>
                </div>
              )}
              <div className="gallery-modal-description">
                <span className="gallery-modal-label">AI description</span>
                <p>{selected.description}</p>
                {selected.precautions && (
                  <p className="gallery-modal-action">Recommended action: {selected.precautions}</p>
                )}
              </div>
              <div className="gallery-modal-actions">
                <button
                  className="gallery-delete-btn"
                  onClick={() => {
                    setDeleteError('');
                    setConfirmDelete(selected);
                  }}
                >
                  Delete capture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="gallery-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="gallery-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Delete this capture?</h3>
            <p>
              This permanently removes the <strong>{confirmDelete.hazardType}</strong> capture from
              {' '}{confirmDelete.date} • {confirmDelete.time}. This cannot be undone.
            </p>
            {deleteError && <p className="gallery-delete-error" role="alert">{deleteError}</p>}
            <div className="gallery-confirm-actions">
              <button
                className="gallery-confirm-cancel"
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteError('');
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="gallery-confirm-delete"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

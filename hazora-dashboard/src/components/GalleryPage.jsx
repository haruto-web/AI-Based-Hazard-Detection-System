import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  buildTrainingDataset,
  deleteIncident,
  fetchTrainingDataset,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import { hasFullAccess } from '../config/roles';
import '../styles/GalleryPage.css';

const SITE_NOT_SET = 'Site location not set';

// Incident captures show images attached to detected incidents from supported streams.
const SEVERITY_FILTERS = ['all', 'low', 'medium', 'high', 'critical'];

export default function GalleryPage({ userRole }) {
  const { user } = useAuth();
  const canExportDataset = hasFullAccess(userRole, 'gallery');
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

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
          <p>No violation captures yet.</p>
          <p className="gallery-empty-hint">
            When the AI detects a worker missing PPE on a connected camera, the frame is saved here automatically.
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
                <span className={`gallery-card-severity ${selected.severity}`}>{selected.severity}</span>
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
              <div className="gallery-modal-row">
                <span className="gallery-modal-label">Confidence</span>
                <span>{selected.detectionConfidence ? `${Math.round(selected.detectionConfidence * 100)}%` : 'N/A'}</span>
              </div>
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

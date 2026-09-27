import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deleteIncident,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import '../styles/GalleryPage.css';

const SITE_NOT_SET = 'Site location not set';

// Gallery shows auto-captured violation snapshots. Every incident that carries
// an annotated image (from the live stream auto-capture) becomes a card with
// its picture, timestamp, site, and the AI hazard description.
const SEVERITY_FILTERS = ['all', 'low', 'medium', 'high', 'critical'];

export default function GalleryPage() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function handleDelete(capture) {
    await deleteIncident(capture.id);
    setConfirmDelete(null);
    // Close the detail modal if the deleted item was open.
    setSelected((current) => (current && current.id === capture.id ? null : current));
    setIncidents((current) => current.filter((incident) => incident.id !== capture.id));
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

  // Apply the severity filter + free-text search (hazard, description, site,
  // camera, date, time).
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return captures.filter((capture) => {
      if (severityFilter !== 'all' && capture.severity !== severityFilter) return false;
      if (!q) return true;
      const haystack = [
        capture.hazardType,
        capture.description,
        capture.site || SITE_NOT_SET,
        capture.cameraSource,
        capture.date,
        capture.time,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [captures, severityFilter, searchQuery]);

  return (
    <div className="gallery-page">
      <div className="gallery-header">
        <div>
          <h2 className="gallery-title">Violation Gallery</h2>
          <p className="gallery-subtitle">
            Snapshots automatically captured when a PPE violation is detected on a live stream.
          </p>
        </div>
        <span className="gallery-count">
          {filtered.length} of {captures.length} capture{captures.length === 1 ? '' : 's'}
        </span>
      </div>

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
            aria-label="Search violation captures"
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
        <div className="gallery-grid">
          {filtered.map((capture) => (
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
                <span
                  className="gallery-card-delete"
                  role="button"
                  tabIndex={0}
                  aria-label="Delete capture"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(capture); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setConfirmDelete(capture); }
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
                <p className="gallery-card-desc">{capture.description}</p>
              </div>
            </div>
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
                  onClick={() => setConfirmDelete(selected)}
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
            <div className="gallery-confirm-actions">
              <button className="gallery-confirm-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="gallery-confirm-delete" onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

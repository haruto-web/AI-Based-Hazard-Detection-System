import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import '../styles/GalleryPage.css';

const SITE_NOT_SET = 'Site location not set';

// Gallery shows auto-captured violation snapshots. Every incident that carries
// an annotated image (from the live stream auto-capture) becomes a card with
// its picture, timestamp, site, and the AI hazard description.
export default function GalleryPage() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [selected, setSelected] = useState(null);

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

  return (
    <div className="gallery-page">
      <div className="gallery-header">
        <div>
          <h2 className="gallery-title">Violation Gallery</h2>
          <p className="gallery-subtitle">
            Snapshots automatically captured when a PPE violation is detected on a live stream.
          </p>
        </div>
        <span className="gallery-count">{captures.length} capture{captures.length === 1 ? '' : 's'}</span>
      </div>

      {captures.length === 0 ? (
        <div className="gallery-empty">
          <p>No violation captures yet.</p>
          <p className="gallery-empty-hint">
            When the AI detects a worker missing PPE on a connected camera, the frame is saved here automatically.
          </p>
        </div>
      ) : (
        <div className="gallery-grid">
          {captures.map((capture) => (
            <button
              type="button"
              key={capture.id}
              className="gallery-card"
              onClick={() => setSelected(capture)}
            >
              <div className="gallery-card-image">
                <img src={capture.imageData} alt={capture.hazardType} loading="lazy" />
                <span className={`gallery-card-severity ${capture.severity}`}>{capture.severity}</span>
              </div>
              <div className="gallery-card-body">
                <strong className="gallery-card-hazard">{capture.hazardType}</strong>
                <span className="gallery-card-meta">{capture.date} • {capture.time}</span>
                <span className="gallery-card-site">{capture.site || SITE_NOT_SET}</span>
                <p className="gallery-card-desc">{capture.description}</p>
              </div>
            </button>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

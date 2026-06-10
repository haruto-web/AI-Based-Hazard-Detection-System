import { useState } from 'react';
import { useSites } from '../context/SiteContext';
import { useAuth } from '../context/AuthContext';
import '../styles/SiteSelector.css';

const HEAD_OFFICE_ROLES = [
  'Safety Engineer - Head Office',
  'Safety Manager - Head Office',
  'HSE Head - Head Office',
];

export default function SiteSelector({ userRole, userName }) {
  const { sites, activeSite, setActiveSite, addSite, removeSite, loading } = useSites();
  const { user } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const canManageSites = HEAD_OFFICE_ROLES.includes(userRole);

  if (loading) {
    return (
      <div className="site-selector-wrapper">
        <div className="site-selector-row">
          <label>Site:</label>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading...</span>
        </div>
      </div>
    );
  }

  async function handleAddSite(e) {
    e.preventDefault();
    setError(null);
    if (!newSiteName.trim()) {
      setError('Site name is required');
      return;
    }
    setAdding(true);
    try {
      await addSite(newSiteName, {
        uid: user.uid,
        email: user.email,
        name: userName || user.email,
        role: userRole || '',
      });
      setNewSiteName('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveSite(siteId, siteName) {
    if (window.confirm(`Remove site "${siteName}"? This cannot be undone.`)) {
      try {
        await removeSite(siteId);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  return (
    <div className="site-selector-wrapper">
      <div className="site-selector-row">
        <label htmlFor="site-select-global">Site:</label>
        <select
          id="site-select-global"
          value={activeSite}
          onChange={(e) => {
            const newSite = e.target.value;
            if (newSite === activeSite) return;
            if (window.confirm(`Are you sure you want to switch to "${newSite}"?`)) {
              setActiveSite(newSite);
            } else {
              e.target.value = activeSite;
            }
          }}
          className="site-select"
        >
          {sites.map((site) => {
            const creator = site.createdBy;
            const label = creator && creator.name
              ? `${site.name} — ${creator.name} (${creator.role || 'N/A'})`
              : site.name;
            return (
              <option key={site.id} value={site.name}>{label}</option>
            );
          })}
        </select>

        {canManageSites && (
          <button
            className="manage-sites-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            title="Manage Sites"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {showAddForm && canManageSites && (
        <div className="site-manage-panel">
          <form className="site-add-form" onSubmit={handleAddSite}>
            <input
              type="text"
              value={newSiteName}
              onChange={(e) => { setNewSiteName(e.target.value); setError(null); }}
              placeholder="New site name"
              disabled={adding}
              className="site-add-input"
            />
            <button type="submit" disabled={adding} className="site-add-btn">
              {adding ? '...' : 'Add'}
            </button>
          </form>
          {error && <p className="site-error">{error}</p>}

          {sites.length > 0 && (
            <ul className="site-list">
              {sites.map((site) => (
                <li key={site.id} className="site-list-item">
                  <div className="site-list-info">
                    <span className="site-list-name">{site.name}</span>
                    {site.createdBy && site.createdBy.name && (
                      <span className="site-list-creator">
                        {site.createdBy.name} — {site.createdBy.role || 'Unknown'}
                      </span>
                    )}
                  </div>
                  {site.id !== 'default' && (
                    <button
                      className="site-remove-btn"
                      onClick={() => handleRemoveSite(site.id, site.name)}
                      title="Remove site"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

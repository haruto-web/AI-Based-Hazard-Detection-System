import { canAccess } from '../config/roles';
import '../styles/Sidebar.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'streams', label: 'Live Streams', icon: 'camera' },
  { id: 'reports', label: 'Reports', icon: 'file' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

const VALID_VIEWS = ['dashboard', 'streams', 'reports', 'profile'];

function NavIcon({ type }) {
  switch (type) {
    case 'grid':
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'camera':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      );
    case 'file':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'user':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({ activeView, onViewChange, userRole }) {
  const currentView = VALID_VIEWS.includes(activeView) ? activeView : 'dashboard';

  // Filter nav items based on user role access
  const visibleItems = NAV_ITEMS.filter(item => canAccess(userRole, item.id));

  function handleKeyDown(e, viewId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onViewChange(viewId);
    }
  }

  return (
    <nav className="sidebar" aria-label="Dashboard navigation">
      <ul className="sidebar-nav">
        {visibleItems.map((item) => (
          <li key={item.id} className="sidebar-nav-item">
            <button
              className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
              aria-label={item.label}
              tabIndex={0}
            >
              <span className="nav-icon" aria-hidden="true">
                <NavIcon type={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import '../styles/Sidebar.css';

const NAV_ITEMS = [
  { id: 'streams', label: 'Live Streams' },
  { id: 'reports', label: 'Reports', badge: 'ON GOING' },
];

const VALID_VIEWS = ['streams', 'reports'];

export default function Sidebar({ activeView, onViewChange }) {
  // Default to "streams" if an invalid activeView value is provided
  const currentView = VALID_VIEWS.includes(activeView) ? activeView : 'streams';

  return (
    <nav className="sidebar" aria-label="Dashboard navigation">
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id} className="sidebar-nav-item">
            <button
              className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
            >
              <span className="nav-label">{item.label}</span>
              {item.badge && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

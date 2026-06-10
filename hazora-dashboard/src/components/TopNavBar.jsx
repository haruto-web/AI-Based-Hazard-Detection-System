import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import '../styles/TopNavBar.css';

export default function TopNavBar({ userEmail, onLogout, onNavigateProfile, onNavigate }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const searchRef = useRef(null);

  // Searchable items
  const SEARCH_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', keywords: 'dashboard analytics overview stats' },
    { id: 'streams', label: 'Live Streams', keywords: 'live streams camera esp32 monitoring video' },
    { id: 'reports', label: 'Reports', keywords: 'reports export pdf csv generate' },
    { id: 'about', label: 'About', keywords: 'about project hazora info system' },
    { id: 'profile', label: 'Profile', keywords: 'profile settings account name phone role' },
  ];

  function handleSearch(query) {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const lower = query.toLowerCase();
    const matches = SEARCH_ITEMS.filter(item =>
      item.label.toLowerCase().includes(lower) || item.keywords.includes(lower)
    );
    setSearchResults(matches);
    setShowResults(true);
  }

  function handleSearchSelect(id) {
    if (id === 'profile') {
      onNavigateProfile?.();
    } else {
      onNavigate?.(id);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSearchSelect(searchResults[0].id);
    }
  }

  // Get user initials from email
  const initials = userEmail
    ? userEmail.substring(0, 2).toUpperCase()
    : 'U';

  const displayName = userEmail || 'User';

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function formatBadge(count) {
    if (count > 99) return '99+';
    return count;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  return (
    <div className="top-nav-bar">
      <div className="top-nav-left">
        <form className="search-container" ref={searchRef} onSubmit={handleSearchSubmit}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search for anything..."
            aria-label="Search"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => { if (searchQuery) setShowResults(true); }}
          />
          {showResults && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="search-result-item"
                  onClick={() => handleSearchSelect(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {showResults && searchQuery && searchResults.length === 0 && (
            <div className="search-dropdown">
              <p className="search-no-results">No results found</p>
            </div>
          )}
        </form>
      </div>

      <div className="top-nav-right">
        {/* Theme Toggle */}
        <button className="theme-toggle-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Notification Bell */}
        <div className="notif-wrapper" ref={notifRef}>
          <button
            className="notif-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notif-badge">{formatBadge(unreadCount)}</span>
            )}
          </button>

          {showNotifications && (
            <div className="notif-dropdown" role="menu">
              <div className="notif-dropdown-header">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button className="mark-all-btn" onClick={markAllAsRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notif-dropdown-body">
                {notifications.length === 0 ? (
                  <p className="notif-empty">No new notifications</p>
                ) : (
                  notifications.slice(0, 20).map((notif) => (
                    <button
                      key={notif.id}
                      className={`notif-item ${!notif.read ? 'unread' : ''}`}
                      onClick={() => markAsRead(notif.id)}
                    >
                      <div className="notif-item-content">
                        <span className="notif-type">{notif.violationType || 'Alert'}</span>
                        <span className="notif-source">{notif.cameraSource || ''}</span>
                      </div>
                      <span className="notif-time">{formatTime(notif.timestamp)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar */}
        <div className="profile-wrapper" ref={profileRef}>
          <button
            className="profile-btn"
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            aria-label="User profile menu"
          >
            <span className="profile-avatar">{initials}</span>
            <span className="profile-name">{displayName}</span>
          </button>

          {showProfile && (
            <div className="profile-dropdown" role="menu">
              <button className="profile-dropdown-item" role="menuitem" onClick={() => { setShowProfile(false); onNavigateProfile?.(); }}>
                Profile
              </button>
              <button className="profile-dropdown-item logout" onClick={onLogout} role="menuitem">
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import '../styles/ReportsPlaceholder.css';

function ReportsPlaceholder() {
  return (
    <div className="reports-placeholder">
      <div className="reports-header">
        <h2>Report & Analytics</h2>
        <span className="badge ongoing">ON GOING</span>
      </div>
      <div className="reports-content">
        <div className="placeholder-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        </div>
        <p>Analytics and reporting features are currently under development.</p>
        <p className="subtitle">Detection logs, activity charts, and export capabilities coming soon.</p>
      </div>
    </div>
  );
}

export default ReportsPlaceholder;

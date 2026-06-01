import '../styles/ReportsPlaceholder.css';

function ReportsPlaceholder() {
  return (
    <div className="reports-placeholder">
      <div className="reports-header">
        <h2>Report & Analytics</h2>
        <span className="badge ongoing">ON GOING</span>
      </div>
      <div className="reports-content">
        <div className="placeholder-icon">📊</div>
        <p>Analytics and reporting features are currently under development.</p>
        <p className="subtitle">Detection logs, activity charts, and export capabilities coming soon.</p>
      </div>
    </div>
  );
}

export default ReportsPlaceholder;

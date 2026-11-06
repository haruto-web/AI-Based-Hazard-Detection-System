import '../styles/HazardAlertToasts.css';

function getSeverityClass(severity) {
  if (severity === 'critical' || severity === 'high') return 'hazard-alert-critical';
  if (severity === 'safe' || severity === 'success') return 'hazard-alert-safe';
  return 'hazard-alert-warning';
}

export default function HazardAlertToasts({ notifications, onDismiss }) {
  if (notifications.length === 0) return null;

  return (
    <div className="hazard-alert-stack" aria-label="Detection alerts">
      {notifications.map((notification) => (
        <section
          className={`hazard-alert-toast ${getSeverityClass(notification.severity)}`}
          role="alert"
          key={notification.id}
        >
          <div className="hazard-alert-copy">
            <strong className="hazard-alert-title">
              {notification.severity === 'medium' ? 'Safety warning' : 'Hazard detected'}
              {notification.violationType ? `: ${notification.violationType}` : ''}
            </strong>
            {notification.message && <p>{notification.message}</p>}
            {notification.cameraSource && (
              <span className="hazard-alert-source">{notification.cameraSource}</span>
            )}
          </div>
          <button
            type="button"
            className="hazard-alert-dismiss"
            aria-label="Dismiss hazard alert"
            onClick={() => onDismiss(notification.id)}
          >
            ×
          </button>
        </section>
      ))}
    </div>
  );
}

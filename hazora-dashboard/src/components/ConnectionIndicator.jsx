import '../styles/ConnectionIndicator.css';

export default function ConnectionIndicator({ status }) {
  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    loading: 'Connecting...',
  };

  return (
    <div className={`connection-indicator ${status}`} aria-label={`Camera status: ${labels[status]}`}>
      <span className="indicator-dot"></span>
      <span className="indicator-label">{labels[status]}</span>
    </div>
  );
}

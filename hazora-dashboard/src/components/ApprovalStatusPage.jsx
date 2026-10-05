import '../styles/ApprovalStatus.css';

const STATUS_COPY = {
  pending: {
    eyebrow: 'ACCOUNT REVIEW',
    title: 'Waiting for admin verification',
    message: 'Your HAZORA website account and mobile app access use the same email and password. Before signing in, check your inbox and spam/junk folder for the HAZORA email verification message sent to your email address, then click its verification link. An administrator must approve your account and assign your role before you can use the dashboard. Once approved, use this same verified email and password in the mobile app.',
  },
  rejected: {
    eyebrow: 'ACCOUNT REVIEW',
    title: 'Your account was not approved',
    message: 'Contact your administrator if you think this decision was made in error.',
  },
  unavailable: {
    eyebrow: 'ACCOUNT STATUS',
    title: 'We could not verify your account',
    message: 'Your dashboard is unavailable until your account status can be confirmed. Try again or sign out and contact your administrator.',
  },
};

export default function ApprovalStatusPage({ status, email, onSignOut, onRetry }) {
  const copy = STATUS_COPY[status] || STATUS_COPY.unavailable;

  return (
    <main className="approval-status-page">
      <section className="approval-status-panel" aria-labelledby="approval-title">
        <span className="approval-status-mark" aria-hidden="true">!</span>
        <p className="approval-status-eyebrow">{copy.eyebrow}</p>
        <h1 id="approval-title">{copy.title}</h1>
        <p className="approval-status-message">{copy.message}</p>
        {email && <p className="approval-status-email">Signed in as <strong>{email}</strong></p>}
        <div className="approval-status-actions">
          {onRetry && (
            <button type="button" className="approval-retry-button" onClick={onRetry}>
              Check again
            </button>
          )}
          <button type="button" className="approval-signout-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
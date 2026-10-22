import '../styles/UserGuidePage.css';

function GuideSection({ title, children }) {
  return (
    <section className="user-guide-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function UserGuidePage() {
  return (
    <div className="user-guide-page">
      <header className="user-guide-heading">
        <p className="user-guide-eyebrow">HELP &amp; SUPPORT</p>
        <h2>HAZORA User Guide</h2>
        <p>Follow these steps to sign in, monitor hazards, and review incident information on the website or mobile app.</p>
      </header>

      <div className="user-guide-grid">
        <GuideSection title="Before you sign in">
          <p className="user-guide-callout">
            A website account is required before you can access the HAZORA mobile app. The app does not use a separate account.
          </p>
          <ol>
            <li>Register for a website account with an email address you can access and create your password.</li>
            <li>Open the verification email and confirm your email address.</li>
            <li>Wait for an administrator to approve your website account, assign your role, and enable mobile app access.</li>
            <li>After approval, use the same verified email and password to sign in to both the website and mobile app.</li>
          </ol>
        </GuideSection>

        <GuideSection title="Using the website">
          <ol>
            <li><strong>Dashboard:</strong> review the available safety and hazard summaries.</li>
            <li><strong>Live Streams:</strong> connect a camera using its IP address, then use the AI Detection controls to start or stop analysis.</li>
            <li><strong>Incident Captures:</strong> review images saved when a hazard is reported.</li>
            <li><strong>Reports:</strong> view or export reports when your role allows it.</li>
            <li><strong>Messages:</strong> read notices or send messages where your role allows it.</li>
            <li><strong>Profile:</strong> check your account details, email verification, and password-reset options.</li>
          </ol>
        </GuideSection>

        <GuideSection title="Using the mobile app">
          <ol>
            <li>First complete website registration, email verification, and administrator approval with mobile access enabled.</li>
            <li>Then install HAZORA from the download link provided by your administrator.</li>
            <li>Sign in with the same email and password used for your approved website account; do not create a separate app account.</li>
            <li>If prompted, complete the first-time mobile account setup and grant only the permissions the app needs.</li>
            <li>Use the app’s available screens to review safety information and report or inspect hazards.</li>
            <li>Website and mobile incidents use the shared HAZORA account and incident feed.</li>
          </ol>
        </GuideSection>

        <GuideSection title="If you cannot sign in">
          <ul>
            <li>Check that your email address is verified and your account has been approved.</li>
            <li>Use <strong>Forgot password</strong> on the sign-in screen, or contact an administrator to send a reset link to your registered email.</li>
            <li>Check your inbox and spam/junk folder for verification or password-reset messages.</li>
            <li>If access still fails, contact your administrator with the email address on your account and the exact error message. Never share your password.</li>
          </ul>
        </GuideSection>
      </div>

      <p className="user-guide-note">
        The screens and controls available to you depend on your assigned role. If a section is missing, ask your administrator to check your account access.
      </p>
    </div>
  );
}

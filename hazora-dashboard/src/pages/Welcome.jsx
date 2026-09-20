import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import hazoraLogo from '../assets/hazora-logo.png';
import '../styles/Welcome.css';

const websiteFeatures = [
  'Capture field conditions through connected ESP32-CAM devices',
  'Analyze hazards with AI and identify the likely risk',
  'Review incidents and send updates to mobile safety teams',
  'Stay connected while moving around the site',
];

const mobileFeatures = [
  'Use the built-in camera to capture hazards in the field',
  'Let AI analyze the captured hazard immediately',
  'Receive an automatic description and recommended precautions',
  'Generate a complete report instantly after the analysis',
];

export default function Welcome() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="welcome-loading" role="status">
        Loading HAZORA...
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  return (
    <main className="welcome-page">
      <nav className="welcome-nav" aria-label="Public navigation">
        <Link className="welcome-brand" to="/">
          <img src={hazoraLogo} alt="HAZORA" />
          <span>HAZORA</span>
        </Link>
        <div className="welcome-nav-actions">
          <Link className="welcome-login-link" to="/login">Log in</Link>
          <Link className="welcome-register-link" to="/register">Create account</Link>
        </div>
      </nav>

      <section className="welcome-hero">
        <div className="welcome-hero-copy">
          <p className="welcome-eyebrow">Connected construction safety</p>
          <h1>See risk early. Keep every team safer.</h1>
          <p className="welcome-lede">
            HAZORA helps safety officers capture hazards in the field and receive AI-generated analysis, descriptions, precautions, and reports immediately.
          </p>
          <div className="welcome-hero-actions">
            <Link className="welcome-primary-action" to="/register">Get started</Link>
            <Link className="welcome-secondary-action" to="/login">Open dashboard</Link>
          </div>
        </div>
        <div className="welcome-signal" aria-label="HAZORA safety monitoring overview">
          <div className="signal-topline"><span>HAZORA live safety network</span><span className="signal-status">● Online</span></div>
          <div className="signal-screen">
            <div className="signal-grid-lines" aria-hidden="true"></div>
            <span className="signal-label signal-camera">ESP32-CAM</span>
            <span className="signal-label signal-ai">AI CHECK</span>
            <span className="signal-label signal-alert">SAFETY ALERT</span>
            <div className="signal-node node-camera">01</div>
            <div className="signal-node node-ai">AI</div>
            <div className="signal-node node-alert">!</div>
            <div className="signal-line line-one"></div>
            <div className="signal-line line-two"></div>
          </div>
          <div className="signal-footer"><span>Live monitoring</span><span>Incident response</span><span>Team messaging</span></div>
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="platform-title">
        <div className="welcome-section-heading">
          <p className="welcome-eyebrow">One safety system, two connected experiences</p>
          <h2 id="platform-title">Built for the people watching the site and the people working on it.</h2>
        </div>
        <div className="platform-grid">
          <article className="platform-card platform-website">
            <div className="platform-card-heading"><span className="platform-icon">WEB</span><span className="platform-tag">For safety teams</span></div>
            <h3>Website Dashboard</h3>
            <p>Turn camera and sensor data into a clear operational view for head office, engineers, and site safety leaders.</p>
            <ul>{websiteFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          </article>
          <article className="platform-card platform-mobile">
            <div className="platform-card-heading"><span className="platform-icon">APP</span><span className="platform-tag">For field teams</span></div>
            <h3>Mobile App</h3>
            <p>Give safety officers a faster field workflow: capture a hazard, understand the risk, and receive a complete report immediately.</p>
            <ul>{mobileFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          </article>
        </div>
      </section>

      <section className="welcome-flow" aria-labelledby="flow-title">
        <div>
          <p className="welcome-eyebrow">How HAZORA works</p>
          <h2 id="flow-title">From detection to action.</h2>
        </div>
        <div className="welcome-flow-steps">
          <div><strong>01</strong><span>Capture</span><p>Safety officers capture field conditions with connected cameras and sensors.</p></div>
          <div><strong>02</strong><span>Analyze</span><p>AI identifies the hazard and produces a clear description with recommended precautions.</p></div>
          <div><strong>03</strong><span>Report</span><p>HAZORA records the incident and generates a report while the event is still fresh.</p></div>
        </div>
      </section>

      <footer className="welcome-footer">
        <span>HAZORA safety intelligence</span>
        <span>Technological Institute of the Philippines · Capstone Project 2025-2026</span>
      </footer>
    </main>
  );
}

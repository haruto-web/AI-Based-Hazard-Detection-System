import { useState, useEffect, lazy, Suspense } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canAccess, hasFullAccess } from '../config/roles';
import { useCameraSettings } from '../hooks/useCameraSettings';
import StreamGrid from '../components/StreamGrid';
import ConnectionIndicator from '../components/ConnectionIndicator';
import hazoraLogo from '../assets/hazora-logo.png';
const DetectionViewer = lazy(() => import('../components/DetectionViewer'));
import CollapsibleGuide from '../components/CollapsibleGuide';
import Sidebar from '../components/Sidebar';
import TopNavBar from '../components/TopNavBar';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import ReportsPage from '../components/ReportsPage';
import ProfilePage from '../components/ProfilePage';
import AboutPage from '../components/AboutPage';
import Footer from '../components/Footer';
import OnboardingTour from '../components/OnboardingTour';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [showTour, setShowTour] = useState(false);
  const {
    cameras,
    cameraIP,
    connectedCount,
    mainStreamId,
    userRole,
    handleCameraIPChange,
    handleMainStreamChange,
  } = useCameraSettings(user.uid);

  function getCameraWebsite(camera) {
    if (!camera) return '';

    if (camera.startsWith('http://') || camera.startsWith('https://')) {
      try {
        const url = new URL(camera);
        return `${url.protocol}//${url.hostname}`;
      } catch {
        return camera;
      }
    }

    return `http://${camera}`;
  }

  const streamCount = cameras.length;
  const savedCameraLinks = cameras
    .map((camera, index) => ({ website: getCameraWebsite(camera), index }))
    .filter(({ website }) => website);

  // Check tour status per user
  useEffect(() => {
    try {
      const tourKey = `hazora_tour_completed_${user.uid}`;
      if (!localStorage.getItem(tourKey)) {
        setShowTour(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, [user.uid]);

  const connectionStatus = connectedCount > 0 ? 'connected' : 'disconnected';

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <img src={hazoraLogo} alt="Hazora Logo" className="header-logo" />
          <h1>HAZORA</h1>
          <ConnectionIndicator status={connectionStatus} />
          {connectedCount > 0 && (
            <span className="camera-count">{connectedCount}/{streamCount} cameras</span>
          )}
        </div>
        <div className="header-right">
          <span className="user-email">{user.email}</span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-body">
        <Sidebar activeView={activeView} onViewChange={setActiveView} userRole={userRole} />

        <main className="dashboard-content">
          <TopNavBar userEmail={user.email} onLogout={handleLogout} onNavigateProfile={() => setActiveView('profile')} onNavigate={setActiveView} />

          <div className="dashboard-content-inner">
            {activeView === 'dashboard' && canAccess(userRole, 'dashboard') && (
              <AnalyticsDashboard readOnly={!hasFullAccess(userRole, 'dashboard')} />
            )}

            {activeView === 'streams' && canAccess(userRole, 'streams') && (
              <div className="streams-view">
                <section className="stream-section">
                  <StreamGrid
                    cameras={cameras}
                    mainStreamId={mainStreamId}
                    onCameraIPChange={handleCameraIPChange}
                    onMainStreamChange={handleMainStreamChange}
                  />
                </section>

                <section className="controls-section">
                  <CollapsibleGuide title="Camera Setup Guide" defaultOpen={false}>
                    <ol>
                      <li>Power on the ESP32-CAM</li>
                      <li>Connect your phone/laptop to Wi-Fi: <strong>HAZORA_CAM_SETUP</strong></li>
                      <li>A setup page opens — enter your Wi-Fi name and password</li>
                      <li>The camera connects and shows its IP and website URL</li>
                      <li>Open the camera website URL below if you are on the same network</li>
                      <li>Enter the IP in any stream box and click the arrow to connect</li>
                    </ol>
                    <div className="saved-camera-sites">
                      <p className="saved-camera-sites-title">Saved camera website</p>
                      {savedCameraLinks.length > 0 ? (
                        savedCameraLinks.map(({ website, index }) => (
                          <a
                            key={`${website}-${index}`}
                            className="saved-camera-link"
                            href={website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Stream {index + 1}: {website}
                          </a>
                        ))
                      ) : (
                        <p className="saved-camera-empty">Connect a camera IP to save its website link here.</p>
                      )}
                    </div>
                  </CollapsibleGuide>

                  <Suspense fallback={<div>Loading AI detection viewer…</div>}>
                    <DetectionViewer cameraIP={cameraIP} isConnected={connectedCount > 0} />
                  </Suspense>
                </section>
              </div>
            )}

            {activeView === 'reports' && canAccess(userRole, 'reports') && (
              <ReportsPage readOnly={!hasFullAccess(userRole, 'reports')} />
            )}

            {activeView === 'about' && <AboutPage />}

            {activeView === 'profile' && <ProfilePage />}
          </div>

          <Footer />
        </main>
      </div>

      {showTour && <OnboardingTour userId={user.uid} onComplete={() => setShowTour(false)} />}
    </div>
  );
}

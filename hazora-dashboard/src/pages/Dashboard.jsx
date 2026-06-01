import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import CameraConfig from '../components/CameraConfig';
import StreamGrid from '../components/StreamGrid';
import ConnectionIndicator from '../components/ConnectionIndicator';
import DetectionViewer from '../components/DetectionViewer';
import CollapsibleGuide from '../components/CollapsibleGuide';
import Sidebar from '../components/Sidebar';
import ReportsPlaceholder from '../components/ReportsPlaceholder';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cameraIP, setCameraIP] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [ipLoading, setIpLoading] = useState(true);
  const [activeView, setActiveView] = useState('streams');

  // Load camera IP from Firestore on mount
  useEffect(() => {
    async function loadCameraIP() {
      // Try localStorage first (instant, always works)
      try {
        const localIP = localStorage.getItem('hazora_camera_ip');
        if (localIP) {
          setCameraIP(localIP);
          setIsConnecting(true);
          setIpLoading(false);
        }
      } catch (storageErr) {
        // localStorage unavailable
      }

      // Then try Firestore with timeout (may be slow or blocked)
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore timeout')), 5000)
        );
        const userDoc = await Promise.race([
          getDoc(doc(db, 'users', user.uid)),
          timeoutPromise,
        ]);
        if (userDoc.exists() && userDoc.data().cameraIP) {
          const savedIP = userDoc.data().cameraIP;
          setCameraIP(savedIP);
          setIsConnecting(true);
        }
      } catch (err) {
        console.warn('Firestore load failed or timed out:', err.message);
      } finally {
        setIpLoading(false);
      }
    }

    loadCameraIP();
  }, [user.uid]);

  function handleConnect(ip) {
    setCameraIP(ip);
    setIsConnecting(true);
    setConnectionStatus('loading');
  }

  function handleStatusChange(status) {
    if (status === 'failed') {
      setConnectionStatus('disconnected');
      setIsConnecting(false);
    } else {
      setConnectionStatus(status);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>HAZORA</h1>
          <ConnectionIndicator status={connectionStatus} />
        </div>
        <div className="header-right">
          <span className="user-email">{user.email}</span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-body">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="dashboard-content">
          {activeView === 'streams' && (
            <div className="streams-view">
              <section className="stream-section">
                <StreamGrid
                  cameraIP={cameraIP}
                  isConnecting={isConnecting}
                  onStatusChange={handleStatusChange}
                />
              </section>

              <section className="controls-section">
                <CameraConfig
                  cameraIP={cameraIP}
                  onConnect={handleConnect}
                  disabled={ipLoading}
                />

                <CollapsibleGuide title="Camera Setup Guide" defaultOpen={false}>
                  <ol>
                    <li>Power on the ESP32-CAM</li>
                    <li>Connect your phone/laptop to Wi-Fi: <strong>HAZORA_CAM_SETUP</strong></li>
                    <li>A setup page opens — enter your Wi-Fi name and password</li>
                    <li>The camera connects and shows its IP in Serial Monitor</li>
                    <li>Enter that IP above and click Connect</li>
                  </ol>
                </CollapsibleGuide>

                <DetectionViewer
                  cameraIP={cameraIP}
                  isConnected={connectionStatus === 'connected'}
                />
              </section>
            </div>
          )}

          {activeView === 'reports' && <ReportsPlaceholder />}
        </main>
      </div>
    </div>
  );
}

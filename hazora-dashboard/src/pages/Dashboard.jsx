import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import StreamGrid from '../components/StreamGrid';
import ConnectionIndicator from '../components/ConnectionIndicator';
import DetectionViewer from '../components/DetectionViewer';
import CollapsibleGuide from '../components/CollapsibleGuide';
import Sidebar from '../components/Sidebar';
import ReportsPlaceholder from '../components/ReportsPlaceholder';
import '../styles/Dashboard.css';

const STREAM_COUNT = 5;
const STORAGE_KEY = 'hazora_cameras';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState(Array(STREAM_COUNT).fill(''));
  const [ipLoading, setIpLoading] = useState(true);
  const [activeView, setActiveView] = useState('streams');

  // Derive connection status from cameras array
  const connectedCount = cameras.filter(ip => ip).length;
  const connectionStatus = connectedCount > 0 ? 'connected' : 'disconnected';

  // Load camera IPs from localStorage and Firestore on mount
  useEffect(() => {
    async function loadCameras() {
      // Try localStorage first
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length === STREAM_COUNT) {
            setCameras(parsed);
            setIpLoading(false);
          }
        }
        // Migrate old single-IP format
        const oldIP = localStorage.getItem('hazora_camera_ip');
        if (oldIP && !stored) {
          const migrated = [oldIP, '', '', '', ''];
          setCameras(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem('hazora_camera_ip');
          setIpLoading(false);
        }
      } catch (storageErr) {
        // localStorage unavailable
      }

      // Then try Firestore
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore timeout')), 5000)
        );
        const userDoc = await Promise.race([
          getDoc(doc(db, 'users', user.uid)),
          timeoutPromise,
        ]);
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.cameras && Array.isArray(data.cameras)) {
            setCameras(data.cameras);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.cameras));
          } else if (data.cameraIP) {
            // Migrate old single-IP Firestore format
            const migrated = [data.cameraIP, '', '', '', ''];
            setCameras(migrated);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          }
        }
      } catch (err) {
        console.warn('Firestore load failed or timed out:', err.message);
      } finally {
        setIpLoading(false);
      }
    }

    loadCameras();
  }, [user.uid]);

  function handleCameraIPChange(streamId, newIP) {
    setCameras(prev => {
      const updated = [...prev];
      updated[streamId - 1] = newIP;

      // Persist to localStorage immediately
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        // localStorage unavailable
      }

      // Persist to Firestore in background
      setDoc(doc(db, 'users', user.uid), { cameras: updated }, { merge: true })
        .catch(err => console.warn('Firestore save failed:', err.message));

      return updated;
    });
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
          {connectedCount > 0 && (
            <span className="camera-count">{connectedCount}/{STREAM_COUNT} cameras</span>
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
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="dashboard-content">
          {activeView === 'streams' && (
            <div className="streams-view">
              <section className="stream-section">
                <StreamGrid
                  cameras={cameras}
                  onCameraIPChange={handleCameraIPChange}
                />
              </section>

              <section className="controls-section">
                <CollapsibleGuide title="Camera Setup Guide" defaultOpen={false}>
                  <ol>
                    <li>Power on the ESP32-CAM</li>
                    <li>Connect your phone/laptop to Wi-Fi: <strong>HAZORA_CAM_SETUP</strong></li>
                    <li>A setup page opens — enter your Wi-Fi name and password</li>
                    <li>The camera connects and shows its IP in Serial Monitor</li>
                    <li>Enter the IP in any stream box and click the arrow to connect</li>
                  </ol>
                </CollapsibleGuide>

                <DetectionViewer
                  cameraIP={cameras[0]}
                  isConnected={connectedCount > 0}
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

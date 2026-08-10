import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const STREAM_COUNT = 3;
const STORAGE_KEY = 'hazora_cameras';
const MAIN_STREAM_KEY = 'hazora_main_stream';

export function useCameraSettings(userId) {
  const [cameras, setCameras] = useState(Array(STREAM_COUNT).fill(''));
  const [mainStreamId, setMainStreamId] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(MAIN_STREAM_KEY));
      return saved >= 1 && saved <= STREAM_COUNT ? saved : 1;
    } catch {
      return 1;
    }
  });
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    async function loadCameras() {
      let stored;

      try {
        stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length === STREAM_COUNT) {
            setCameras(parsed);
          }
        }

        const oldIP = localStorage.getItem('hazora_camera_ip');
        if (oldIP && !stored) {
          const migrated = [oldIP, '', ''];
          setCameras(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem('hazora_camera_ip');
        }
      } catch {
        // localStorage unavailable
      }

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore timeout')), 5000)
        );

        const userDoc = await Promise.race([
          getDoc(doc(db, 'users', userId)),
          timeoutPromise,
        ]);

        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.role) {
            setUserRole(data.role);
          }
          if (data.fullName) {
            setUserName(data.fullName);
          }
          if (data.cameras && Array.isArray(data.cameras)) {
            setCameras(data.cameras);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data.cameras));
            } catch {
              // localStorage unavailable
            }
          } else if (data.cameraIP) {
            const migrated = [data.cameraIP, '', ''];
            setCameras(migrated);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            } catch {
              // localStorage unavailable
            }
          }
        }
      } catch (err) {
        console.warn('Firestore load failed or timed out:', err.message);
      }
    }

    loadCameras();
    return undefined;
  }, [userId]);

  const connectedCount = useMemo(
    () => cameras.filter((ip) => ip).length,
    [cameras]
  );

  const cameraIP = useMemo(
    () => cameras[mainStreamId - 1] || cameras.find((ip) => ip) || '',
    [cameras, mainStreamId]
  );

  function handleCameraIPChange(streamId, newIP) {
    setCameras((prev) => {
      const updated = [...prev];
      updated[streamId - 1] = newIP;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // localStorage unavailable
      }

      setDoc(doc(db, 'users', userId), { cameras: updated }, { merge: true }).catch(
        (err) => console.warn('Firestore save failed:', err.message)
      );

      return updated;
    });
  }

  function handleMainStreamChange(streamId) {
    setMainStreamId(streamId);
    try {
      localStorage.setItem(MAIN_STREAM_KEY, String(streamId));
    } catch {
      // localStorage unavailable
    }
  }

  return {
    cameras,
    cameraIP,
    connectedCount,
    mainStreamId,
    userRole,
    userName,
    handleCameraIPChange,
    handleMainStreamChange,
  };
}

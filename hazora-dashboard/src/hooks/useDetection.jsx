import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport } from '../utils/incidents';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import {
  buildCaptureUrl,
  createPersonTracker,
  cropFaceForPerson,
  detectFaces,
  detectPersons,
  detectPpeObjects,
  drawPersonResult,
  drawPpeResult,
  groupPpeDetections,
  loadPpeDetectionModels,
} from '../AI/LM_detection/ppeDetection';
import { buildHazardReport } from '../AI/LM_detection/hazardDetails';

// A violation must persist across this many consecutive frames before it
// alerts, so a single-frame model miss (flicker) doesn't fire a false alarm.
const PPE_FRAMES_TO_REPORT = 5;
// Safety-net re-alert window: even a continuously-present, already-alerted
// person can re-alert at most once per this interval (prevents true silence
// on a long-standing violation, without per-frame spam).
const REALERT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function buildStreamUrl(value) {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.hostname}:81/stream`;
    } catch {
      return value;
    }
  }
  return `http://${value}:81/stream`;
}

// Load a fresh JPEG from the ESP32 /capture endpoint. The MJPEG stream never
// fires `load`, so we cannot read pixels from it reliably; a single-frame grab
// decodes cleanly and the ESP32 already serves it with CORS headers.
function loadCaptureFrame(captureUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load camera frame'));
    // Cache-bust so each poll pulls a new frame.
    image.src = `${captureUrl}?t=${Date.now()}`;
  });
}

export function useDetection(cameraIP, isConnected, siteLocation = '') {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const inferenceInFlightRef = useRef(false);
  // Tracks people across frames so each person alerts once per missing item
  // (no per-frame flooding). Keyed alert timestamps live on each track.
  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = createPersonTracker();
  // Per-track, per-item confirmation-frame counter: `${trackId}:${item}` -> n.
  const confirmFramesRef = useRef({});
  // Per-track, per-item last-alert time for the 5-min re-alert safety net.
  const lastAlertRef = useRef({});
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const userId = user?.uid;
  const [ppeModel, setPpeModel] = useState(null);
  const [personModel, setPersonModel] = useState(null);
  const [faceModel, setFaceModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [detections, setDetections] = useState({
    persons: 0,
    helmets: 0,
    vests: 0,
    shoes: 0,
    noHelmets: 0,
    noVests: 0,
    noShoes: 0,
    compliant: 0,
    violations: 0,
  });
  const modelLoadPromiseRef = useRef(null);
  const modelLoadStartedRef = useRef(false);

  async function loadModels() {
    if (modelLoadPromiseRef.current) return modelLoadPromiseRef.current;

    modelLoadStartedRef.current = true;
    setLoading(true);
    setError(null);

    const promise = (async () => {
      try {
        const models = await loadPpeDetectionModels();
        setPpeModel(models.ppeModel);
        setPersonModel(models.personModel);
        setFaceModel(models.faceModel);
        return models;
      } catch (err) {
        console.error('Failed to load detection models:', err);
        setError(`Failed to load AI model. ${err?.message || 'Unknown error'}`);
        modelLoadPromiseRef.current = null;
        throw err;
      } finally {
        setLoading(false);
      }
    })();

    modelLoadPromiseRef.current = promise;
    return promise;
  }

  const detectFrame = useCallback(async () => {
    if (inferenceInFlightRef.current || !ppeModel || !canvasRef.current) return;

    const captureUrl = buildCaptureUrl(cameraIP);
    if (!captureUrl) {
      setStatus('No camera URL');
      return;
    }

    inferenceInFlightRef.current = true;

    // Draw the captured frame plus detection boxes onto the panel canvas.
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    try {
      const image = await loadCaptureFrame(captureUrl);
      if (!image.naturalWidth) {
        setStatus('Waiting for camera frame...');
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Keep a clean (un-annotated) copy of this frame for face crops, since
      // the main canvas will get detection boxes drawn over it below.
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = canvas.width;
      rawCanvas.height = canvas.height;
      rawCanvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

      const [ppeObjects, persons, faces] = await Promise.all([
        detectPpeObjects({ ppeModel, canvas }),
        personModel ? detectPersons({ personModel, canvas }) : Promise.resolve([]),
        faceModel ? detectFaces({ faceModel, canvas }) : Promise.resolve([]),
      ]);

      // One group per detected person (falls back to spatial clustering when
      // no person model output is available). canvas.height enables adaptive
      // visibility so shoes/vest aren't flagged when out of frame.
      const rawGroups = groupPpeDetections(ppeObjects, canvas.width, persons, canvas.height);
      // Attach a stable trackId to each person so alerts are per-person.
      const groups = trackerRef.current.assign(rawGroups);
      persons.forEach((person) => drawPersonResult(ctx, person));
      ppeObjects.forEach((detection) => drawPpeResult(ctx, detection));

      const helmets = ppeObjects.filter((item) => item.label === 'Safety Helmet').length;
      const vests = ppeObjects.filter((item) => item.label === 'Safety Vest').length;
      const shoes = ppeObjects.filter((item) => item.label === 'Safety Shoes').length;

      // Average detection confidence across all PPE boxes this frame (0..1).
      const avgConfidence = ppeObjects.length
        ? ppeObjects.reduce((sum, item) => sum + item.score, 0) / ppeObjects.length
        : 0;

      // Per-person evaluation: a group is a violation if it is missing anything
      // that is actually required (i.e. the body region is in frame).
      const violationGroups = groups.filter((group) => group.missing.length > 0);
      const compliantGroups = groups.filter((group) => group.missing.length === 0);
      // Only count a missing item when that item was required for that person.
      const noHelmets = groups.filter((group) => group.missing.includes('Safety Helmet')).length;
      const noVests = groups.filter((group) => group.missing.includes('Safety Vest')).length;
      const noShoes = groups.filter((group) => group.missing.includes('Safety Shoes')).length;
      const personCount = persons.length || groups.length;

      setStatus(
        `Analyzing • ${personCount} person(s) • ${compliantGroups.length} compliant, ${violationGroups.length} with violations`
      );
      setDetections({
        persons: personCount,
        helmets,
        vests,
        shoes,
        noHelmets,
        noVests,
        noShoes,
        compliant: compliantGroups.length,
        violations: violationGroups.length,
      });

      const now = Date.now();
      const tracker = trackerRef.current;
      const siteForIncident = siteLocation && siteLocation.trim()
        ? siteLocation.trim()
        : 'Site location not set';

      // Lazily capture the annotated frame only once per frame if any alert fires.
      let cachedImageData = null;
      const captureFrame = () => {
        if (cachedImageData === null) {
          try {
            cachedImageData = canvas.toDataURL('image/jpeg', 0.6);
          } catch {
            cachedImageData = '';
          }
        }
        return cachedImageData;
      };

      // Evaluate EACH PERSON separately. A person alerts once per missing item;
      // it only re-alerts after REALERT_INTERVAL_MS or if they left and returned
      // (a returning person gets a fresh track, so alerted state is cleared).
      groups.forEach((group) => {
        const track = group._track;
        if (!track || group.missing.length === 0) return;

        group.missing.forEach((item) => {
          const key = `${track.id}:${item}`;

          // Require the violation to persist a few frames before alerting.
          confirmFramesRef.current[key] = (confirmFramesRef.current[key] || 0) + 1;
          if (confirmFramesRef.current[key] < PPE_FRAMES_TO_REPORT) return;

          const lastAlert = lastAlertRef.current[key] || 0;
          const alreadyAlerted = tracker.hasAlerted(track, item);
          const withinRealertWindow = now - lastAlert < REALERT_INTERVAL_MS;

          // Skip if this person was already alerted for this item recently.
          if (alreadyAlerted && withinRealertWindow) return;

          tracker.markAlerted(track, item);
          lastAlertRef.current[key] = now;

          // Crop the violator's face from the clean frame for evidence (not
          // identification). Empty string if no face is confidently found.
          const faceData = group.person
            ? cropFaceForPerson(rawCanvas, group.person.box, faces)
            : '';

          const report = buildHazardReport({
            item,
            affectedCount: 1,
            personCount,
            compliantCount: compliantGroups.length,
            cameraSource: cameraIP,
          });

          addNotification({
            violationType: report.hazardType,
            cameraSource: cameraIP,
            message: report.notificationMessage,
            severity: report.severity,
          });
          createIncidentReport({
            userId,
            hazardType: report.hazardType,
            description: report.description,
            precautions: report.precautions,
            cameraSource: cameraIP,
            severity: report.severity,
            detectionConfidence: avgConfidence,
            model: 'YOLOv8n PPE',
            detectedWorkers: personCount,
            compliant: compliantGroups.length,
            helmets,
            noHelmets: item === 'Safety Helmet' ? 1 : 0,
            vests,
            noVests: item === 'Safety Vest' ? 1 : 0,
            shoes,
            noShoes: item === 'Safety Shoes' ? 1 : 0,
            imageData: captureFrame(),
            faceData,
            site: siteForIncident,
          });
        });
      });

      // Reset confirmation streaks for tracks/items no longer violating so a
      // brief flicker doesn't accumulate toward an alert.
      const activeKeys = new Set();
      groups.forEach((group) => {
        if (group._track) {
          group.missing.forEach((item) => activeKeys.add(`${group._track.id}:${item}`));
        }
      });
      Object.keys(confirmFramesRef.current).forEach((key) => {
        if (!activeKeys.has(key)) confirmFramesRef.current[key] = 0;
      });
    } catch (err) {
      console.warn('PPE detection frame error:', err.message);
      setStatus(`Detection error: ${err.message}`);
    } finally {
      inferenceInFlightRef.current = false;
    }
  }, [ppeModel, personModel, faceModel, cameraIP, addNotification, userId, siteLocation]);

  useEffect(() => {
    if (detecting && ppeModel && isConnected && cameraIP) {
      detectFrame();
      timerRef.current = setInterval(detectFrame, 700);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [detecting, ppeModel, isConnected, cameraIP, detectFrame]);

  useEffect(() => {
    let idleId = null;
    if (!isConnected || !cameraIP || modelLoadStartedRef.current) return undefined;

    const scheduleLoad = () => loadModels().catch(() => {});
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(scheduleLoad, { timeout: 2000 });
    } else {
      idleId = window.setTimeout(scheduleLoad, 200);
    }

    return () => {
      if (idleId !== null) {
        if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
        else window.clearTimeout(idleId);
      }
    };
  }, [cameraIP, isConnected]);

  function toggleDetection() {
    if (detecting) {
      setDetecting(false);
      setStatus('');
      if (timerRef.current) clearInterval(timerRef.current);
      // Clear tracking state so a fresh session starts clean.
      trackerRef.current.reset();
      confirmFramesRef.current = {};
      lastAlertRef.current = {};
      return;
    }

    if (!ppeModel) {
      loadModels().then(() => setDetecting(true)).catch(() => {});
      return;
    }

    setDetecting(true);
  }

  return {
    canvasRef,
    streamUrl: buildStreamUrl(cameraIP),
    loading,
    error,
    status,
    detections,
    detecting,
    toggleDetection,
    handleRetry: loadModels,
  };
}

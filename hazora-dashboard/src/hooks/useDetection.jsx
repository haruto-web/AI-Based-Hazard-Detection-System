import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport } from '../utils/incidents';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import {
  buildCaptureUrl,
  detectPersons,
  detectPpeObjects,
  drawPersonResult,
  drawPpeResult,
  groupPpeDetections,
  loadPpeDetectionModels,
  PPE_LABELS,
} from '../AI/LM_detection/ppeDetection';
import { buildHazardReport } from '../AI/LM_detection/hazardDetails';

const VIOLATION_COOLDOWN_MS = 30000;
const PPE_FRAMES_TO_REPORT = 3;

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

export function useDetection(cameraIP, isConnected) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const inferenceInFlightRef = useRef(false);
  // Per-missing-item tracking so each PPE type is confirmed and throttled
  // independently. Keys: 'Safety Helmet' | 'Safety Vest' | 'Safety Shoes'.
  const lastAlertByItemRef = useRef({});
  const confirmFramesByItemRef = useRef({});
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const userId = user?.uid;
  const [ppeModel, setPpeModel] = useState(null);
  const [personModel, setPersonModel] = useState(null);
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

      const [ppeObjects, persons] = await Promise.all([
        detectPpeObjects({ ppeModel, canvas }),
        personModel ? detectPersons({ personModel, canvas }) : Promise.resolve([]),
      ]);

      // One group per detected person (falls back to spatial clustering when
      // no person model output is available).
      const groups = groupPpeDetections(ppeObjects, canvas.width, persons);
      persons.forEach((person) => drawPersonResult(ctx, person));
      ppeObjects.forEach((detection) => drawPpeResult(ctx, detection));

      const helmets = ppeObjects.filter((item) => item.label === 'Safety Helmet').length;
      const vests = ppeObjects.filter((item) => item.label === 'Safety Vest').length;
      const shoes = ppeObjects.filter((item) => item.label === 'Safety Shoes').length;

      // Average detection confidence across all PPE boxes this frame (0..1).
      const avgConfidence = ppeObjects.length
        ? ppeObjects.reduce((sum, item) => sum + item.score, 0) / ppeObjects.length
        : 0;

      // Per-person evaluation: a group is a violation if it is missing anything.
      const violationGroups = groups.filter((group) => group.missing.length > 0);
      const compliantGroups = groups.filter((group) => group.missing.length === 0);
      const noHelmets = groups.filter((group) => !group.hasHelmet).length;
      const noVests = groups.filter((group) => !group.hasVest).length;
      const noShoes = groups.filter((group) => !group.hasShoes).length;
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

      // Count, per missing item type, how many people are missing it this frame.
      const missingCountByItem = {};
      violationGroups.forEach((group) => {
        group.missing.forEach((item) => {
          missingCountByItem[item] = (missingCountByItem[item] || 0) + 1;
        });
      });

      const now = Date.now();
      // Evaluate each PPE item type independently so each gets its own
      // confirmation window, cooldown, notification, and incident report.
      PPE_LABELS.forEach((item) => {
        const affectedCount = missingCountByItem[item] || 0;

        if (affectedCount > 0) {
          confirmFramesByItemRef.current[item] = (confirmFramesByItemRef.current[item] || 0) + 1;

          const confirmed = confirmFramesByItemRef.current[item] >= PPE_FRAMES_TO_REPORT;
          const lastAlert = lastAlertByItemRef.current[item] || 0;
          const cooledDown = now - lastAlert > VIOLATION_COOLDOWN_MS;

          if (confirmed && cooledDown) {
            lastAlertByItemRef.current[item] = now;

            const report = buildHazardReport({
              item,
              affectedCount,
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
              noHelmets: item === 'Safety Helmet' ? affectedCount : 0,
              vests,
              noVests: item === 'Safety Vest' ? affectedCount : 0,
              shoes,
              noShoes: item === 'Safety Shoes' ? affectedCount : 0,
            });
          }
        } else {
          // Item satisfied (or nobody missing it) this frame — reset its streak.
          confirmFramesByItemRef.current[item] = 0;
        }
      });
    } catch (err) {
      console.warn('PPE detection frame error:', err.message);
      setStatus(`Detection error: ${err.message}`);
    } finally {
      inferenceInFlightRef.current = false;
    }
  }, [ppeModel, personModel, cameraIP, addNotification, userId]);

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

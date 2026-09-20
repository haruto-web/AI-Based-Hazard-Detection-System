import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport } from '../utils/incidents';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import {
  detectPpeObjects,
  drawPpeResult,
  groupPpeDetections,
  loadPpeDetectionModels,
} from '../AI/LM_detection/ppeDetection';

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

export function useDetection(cameraIP, isConnected) {
  const canvasRef = useRef(null);
  const streamImageRef = useRef(null);
  const timerRef = useRef(null);
  const inferenceInFlightRef = useRef(false);
  const lastAlertRef = useRef(0);
  const violationFrameCountRef = useRef(0);
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const userId = user?.uid;
  const [ppeModel, setPpeModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);
  const [detections, setDetections] = useState({
    persons: 0,
    helmets: 0,
    vests: 0,
    shoes: 0,
    noHelmets: 0,
    noVests: 0,
    noShoes: 0,
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
        return models;
      } catch (err) {
        console.error('Failed to load PPE detection model:', err);
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
    const image = streamImageRef.current;
    if (
      inferenceInFlightRef.current ||
      !ppeModel ||
      !canvasRef.current ||
      !image ||
      !image.complete ||
      !image.naturalWidth
    ) return;

    inferenceInFlightRef.current = true;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    try {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const ppeObjects = await detectPpeObjects({ ppeModel, canvas });
      const groups = groupPpeDetections(ppeObjects, canvas.width);
      ppeObjects.forEach((detection) => drawPpeResult(ctx, detection));

      const helmets = ppeObjects.filter((item) => item.label === 'Safety Helmet').length;
      const vests = ppeObjects.filter((item) => item.label === 'Safety Vest').length;
      const shoes = ppeObjects.filter((item) => item.label === 'Safety Shoes').length;
      const violations = groups.filter((group) => group.missing.length > 0);
      const noHelmets = violations.filter((group) => !group.hasHelmet).length;
      const noVests = violations.filter((group) => !group.hasVest).length;
      const noShoes = violations.filter((group) => !group.hasShoes).length;

      setDetections({
        persons: groups.length,
        helmets,
        vests,
        shoes,
        noHelmets,
        noVests,
        noShoes,
        violations: violations.length,
      });

      if (violations.length > 0) {
        violationFrameCountRef.current += 1;
        const now = Date.now();
        if (
          violationFrameCountRef.current >= PPE_FRAMES_TO_REPORT &&
          now - lastAlertRef.current > VIOLATION_COOLDOWN_MS
        ) {
          lastAlertRef.current = now;
          const missingItems = [...new Set(violations.flatMap((group) => group.missing))];
          const missingNames = missingItems.map((item) => item.replace('Safety ', '')).join(', ');
          const precautions = `Equip required PPE: ${missingNames}.`;
          const hazardType = `PPE Violation: Missing ${missingNames}`;
          const description = `${violations.length} worker${violations.length === 1 ? '' : 's'} detected without required ${missingNames}.`;

          addNotification({
            violationType: hazardType,
            cameraSource: cameraIP,
            message: `${description} ${precautions}`,
            severity: 'high',
          });
          createIncidentReport({
            userId,
            hazardType,
            description,
            precautions,
            cameraSource: cameraIP,
            severity: 'high',
            detectedWorkers: groups.length,
            helmets,
            noHelmets,
            vests,
            noVests,
            shoes,
            noShoes,
          });
        }
      } else {
        violationFrameCountRef.current = 0;
      }
    } catch (err) {
      console.warn('PPE detection frame error:', err.message);
    } finally {
      inferenceInFlightRef.current = false;
    }

  }, [ppeModel, cameraIP, addNotification, userId]);

  useEffect(() => {
    if (detecting && ppeModel && isConnected && cameraIP) {
      detectFrame();
      timerRef.current = setInterval(detectFrame, 500);
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
    streamImageRef,
    streamUrl: buildStreamUrl(cameraIP),
    loading,
    error,
    detections,
    detecting,
    toggleDetection,
    handleRetry: loadModels,
  };
}

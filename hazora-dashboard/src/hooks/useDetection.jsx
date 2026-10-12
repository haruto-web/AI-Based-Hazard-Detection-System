import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport, getIncidents } from '../utils/incidents';
import { HAZARD_EMAIL_COOLDOWN_MS, sendHazardEmail } from '../utils/hazardEmail';
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
  loadFaceDetectionModel,
  loadPpeDetectionModels,
} from '../AI/LM_detection/ppeDetection';
import { buildHazardReport } from '../AI/LM_detection/hazardDetails';

// A violation must persist across this many consecutive frames before it
// alerts, so a single-frame model miss (flicker) doesn't fire a false alarm.
const PPE_FRAMES_TO_REPORT = 5;
const DETECTION_INTERVAL_MS = 10000;
const PERSON_DETECTION_INTERVAL_MS = 60000;
const AI_SERVICE_URL = (import.meta.env.VITE_AI_API_URL || '').replace(/\/$/, '');

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
  // Tracks people across frames so each person creates one incident per
  // missing item during a continuous violation.
  const trackerRef = useRef(null);
  if (trackerRef.current === null) trackerRef.current = createPersonTracker();
  // Per-track, per-item confirmation-frame counter: `${trackId}:${item}` -> n.
  const confirmFramesRef = useRef({});
  const lastEmailSentRef = useRef({});
  const backendAlertRef = useRef({});
  const cachedPersonsRef = useRef([]);
  const lastPersonDetectionAtRef = useRef(0);
  const lastDetectionStartedAtRef = useRef(0);
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
  const faceModelRef = useRef(null);
  const faceModelLoadPromiseRef = useRef(null);

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

  const getFaceModel = useCallback(async () => {
    if (faceModelRef.current) return faceModelRef.current;
    if (!faceModelLoadPromiseRef.current) {
      faceModelLoadPromiseRef.current = loadFaceDetectionModel()
        .then((model) => {
          faceModelRef.current = model;
          return model;
        })
        .catch((err) => {
          faceModelLoadPromiseRef.current = null;
          console.warn('Face model failed to load; face capture disabled:', err?.message);
          return null;
        });
    }
    return faceModelLoadPromiseRef.current;
  }, []);

  const captureFaceEvidence = useCallback(async (captureUrl) => {
    if (!captureUrl) return '';
    try {
      const image = await loadCaptureFrame(captureUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 640;
      canvas.height = image.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const faceModel = await getFaceModel();
      if (!faceModel) return '';

      const faces = await detectFaces({ faceModel, canvas });
      if (!faces.length) return '';

      const bestFace = faces.reduce((best, current) => (current.score > best.score ? current : best), faces[0]);
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = Math.max(80, Math.round(bestFace.box.width));
      faceCanvas.height = Math.max(80, Math.round(bestFace.box.height));
      const faceCtx = faceCanvas.getContext('2d');
      if (!faceCtx) return '';

      faceCtx.drawImage(
        canvas,
        Math.max(0, bestFace.box.x),
        Math.max(0, bestFace.box.y),
        bestFace.box.width,
        bestFace.box.height,
        0,
        0,
        faceCanvas.width,
        faceCanvas.height,
      );

      return faceCanvas.toDataURL('image/jpeg', 0.75);
    } catch (error) {
      console.warn('Face capture failed for backend alert:', error?.message || error);
      return '';
    }
  }, [getFaceModel]);

  const detectViaBackend = useCallback(async () => {
    if (!AI_SERVICE_URL) return false;

    const captureUrl = buildCaptureUrl(cameraIP);
    if (!captureUrl) return false;

    try {
      const response = await fetch(`${AI_SERVICE_URL}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: captureUrl,
          cameraIp: cameraIP,
          source: 'dashboard',
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const payload = await response.json();
      const detections = payload?.detections || {};
      const hasValidBackendResult = Boolean(
        payload &&
          typeof payload === 'object' &&
          payload.ok !== false &&
          detections &&
          typeof detections === 'object' &&
          Object.keys(detections).length > 0
      );
      console.log('[Hazora AI backend result]', {
        cameraIP,
        payload,
        summary: {
          persons: detections.persons || 0,
          helmets: detections.helmets || 0,
          vests: detections.vests || 0,
          shoes: detections.shoes || 0,
          noHelmets: detections.noHelmets || 0,
          noVests: detections.noVests || 0,
          noShoes: detections.noShoes || 0,
          compliant: detections.compliant || 0,
          violations: detections.violations || 0,
        },
        hasValidBackendResult,
      });

      const captureFrameImage = await captureFaceEvidence(captureUrl);
      if (detections) {
        setDetections({
          persons: detections.persons || 0,
          helmets: detections.helmets || 0,
          vests: detections.vests || 0,
          shoes: detections.shoes || 0,
          noHelmets: detections.noHelmets || 0,
          noVests: detections.noVests || 0,
          noShoes: detections.noShoes || 0,
          compliant: detections.compliant || 0,
          violations: detections.violations || 0,
        });
      }

      const siteForIncident = siteLocation && siteLocation.trim()
        ? siteLocation.trim()
        : 'Site location not set';
      const backendIssues = [
        detections.noHelmets ? { item: 'Safety Helmet', count: detections.noHelmets } : null,
        detections.noVests ? { item: 'Safety Vest', count: detections.noVests } : null,
        detections.noShoes ? { item: 'Safety Shoes', count: detections.noShoes } : null,
      ].filter(Boolean);

      for (const issue of backendIssues) {
        const key = `${cameraIP}:${issue.item}`;
        const lastAt = backendAlertRef.current[key] || 0;
        if (Date.now() - lastAt < 60000) continue;
        backendAlertRef.current[key] = Date.now();

        const report = buildHazardReport({
          item: issue.item,
          affectedCount: issue.count,
          personCount: detections.persons || issue.count,
          compliantCount: detections.compliant || 0,
          cameraSource: cameraIP,
        });

        const duplicateFace = captureFrameImage && getIncidents().some((incident) => {
          const sameCamera = (incident.cameraSource || '').includes(cameraIP);
          const sameHazard = (incident.hazardType || '').toLowerCase() === report.hazardType.toLowerCase();
          const sameFace = incident.faceData && incident.faceData === captureFrameImage;
          const sameSite = !siteForIncident || !incident.site || incident.site === siteForIncident;
          return sameCamera && sameHazard && sameFace && sameSite;
        });

        if (duplicateFace) {
          console.log('[Hazora AI backend duplicate suppressed]', { cameraIP, hazardType: report.hazardType });
          continue;
        }

        addNotification({
          violationType: report.hazardType,
          cameraSource: `Site: ${siteForIncident} | Camera: ${cameraIP}`,
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
          detectionConfidence: 0.9,
          model: 'YOLOv8n PPE (backend)',
          detectedWorkers: detections.persons || issue.count,
          compliant: detections.compliant || 0,
          helmets: detections.helmets || 0,
          noHelmets: issue.item === 'Safety Helmet' ? issue.count : 0,
          vests: detections.vests || 0,
          noVests: issue.item === 'Safety Vest' ? issue.count : 0,
          shoes: detections.shoes || 0,
          noShoes: issue.item === 'Safety Shoes' ? issue.count : 0,
          imageData: captureFrameImage || '',
          faceData: captureFrameImage || '',
          site: siteForIncident,
        });

        const emailKey = `${cameraIP}:${issue.item}`;
        const lastEmailSentAt = lastEmailSentRef.current[emailKey] || 0;
        if (Date.now() - lastEmailSentAt >= HAZARD_EMAIL_COOLDOWN_MS) {
          lastEmailSentRef.current[emailKey] = Date.now();
          sendHazardEmail({
            user,
            hazardType: report.hazardType,
            site: siteForIncident,
            cameraSource: cameraIP,
            severity: report.severity,
          }).catch((error) => console.error('Hazard email request failed unexpectedly:', error));
        }
      }

      const backendSummary = [
        `persons=${detections.persons || 0}`,
        `helmets=${detections.helmets || 0}`,
        `vests=${detections.vests || 0}`,
        `shoes=${detections.shoes || 0}`,
        `missingHelmet=${detections.noHelmets || 0}`,
        `missingVest=${detections.noVests || 0}`,
        `missingShoes=${detections.noShoes || 0}`,
        `violations=${detections.violations || 0}`,
      ].join(' • ');

      setStatus(`${payload?.status || 'AI analysis running on backend'} • ${backendSummary}`);
      return hasValidBackendResult;
    } catch (error) {
      console.warn('Backend AI detection unavailable, falling back to browser model:', error?.message || error);
      return false;
    }
  }, [addNotification, cameraIP, siteLocation, user, userId]);

  const detectFrame = useCallback(async () => {
    const now = Date.now();
    if (inferenceInFlightRef.current || !canvasRef.current) return;
    if (now - lastDetectionStartedAtRef.current < DETECTION_INTERVAL_MS) return;

    if (AI_SERVICE_URL) {
      lastDetectionStartedAtRef.current = now;
      const handled = await detectViaBackend();
      if (handled) return;
      setStatus('Backend saw no PPE objects; falling back to local person/PPE detection');
    }

    if (!ppeModel) {
      try {
        await loadModels();
      } catch {
        return;
      }
    }

    if (!ppeModel) return;

    lastDetectionStartedAtRef.current = now;

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

      const shouldRefreshPersons = personModel &&
        Date.now() - lastPersonDetectionAtRef.current >= PERSON_DETECTION_INTERVAL_MS;
      const [ppeObjects, refreshedPersons] = await Promise.all([
        detectPpeObjects({ ppeModel, canvas }),
        shouldRefreshPersons
          ? detectPersons({ personModel, canvas })
          : Promise.resolve(null),
      ]);
      if (refreshedPersons) {
        cachedPersonsRef.current = refreshedPersons;
        lastPersonDetectionAtRef.current = Date.now();
      }
      const persons = cachedPersonsRef.current;

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
      let rawCanvas = null;
      let facesPromise = null;
      const getRawCanvas = () => {
        if (!rawCanvas) {
          rawCanvas = document.createElement('canvas');
          rawCanvas.width = canvas.width;
          rawCanvas.height = canvas.height;
          rawCanvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        }
        return rawCanvas;
      };
      const getFaces = () => {
        if (!facesPromise) {
          facesPromise = getFaceModel().then((faceModel) => (
            faceModel
              ? detectFaces({ faceModel, canvas: getRawCanvas() })
              : []
          ));
        }
        return facesPromise;
      };
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

      // Evaluate each person separately. A persistent violation creates one
      // incident per tracked occurrence; a new incident is created if the
      // person leaves and later returns.
      for (const group of groups) {
        const track = group._track;
        if (!track || group.missing.length === 0) continue;

        for (const item of group.missing) {
          const key = `${track.id}:${item}`;

          // Require the violation to persist a few frames before alerting.
          confirmFramesRef.current[key] = (confirmFramesRef.current[key] || 0) + 1;
          if (confirmFramesRef.current[key] < PPE_FRAMES_TO_REPORT) continue;

          const alreadyAlerted = tracker.hasAlerted(track, item);

          const report = buildHazardReport({
            item,
            affectedCount: 1,
            personCount,
            compliantCount: compliantGroups.length,
            cameraSource: cameraIP,
          });

          const lastEmailSentAt = lastEmailSentRef.current[key] || 0;
          if (now - lastEmailSentAt >= HAZARD_EMAIL_COOLDOWN_MS) {
            lastEmailSentRef.current[key] = now;
            sendHazardEmail({
              user,
              hazardType: report.hazardType,
              site: siteForIncident,
              cameraSource: cameraIP,
              severity: report.severity,
            }).then((result) => {
              if (!result.sent) {
                console.warn('Hazard email was not sent:', result.reason);
              }
            }).catch((error) => {
              console.error('Hazard email request failed unexpectedly:', error);
            });
          }

          // Keep a single incident for an ongoing tracked violation. Email
          // repeats are independently rate-limited above.
          if (alreadyAlerted) continue;

          tracker.markAlerted(track, item);

          // Crop the violator's face from the clean frame for evidence (not
          // identification). Empty string if no face is confidently found.
          const faces = await getFaces();
          const faceData = group.person
            ? cropFaceForPerson(getRawCanvas(), group.person.box, faces)
            : '';

          addNotification({
            violationType: report.hazardType,
            cameraSource: `Site: ${siteForIncident} | Camera: ${cameraIP}`,
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
        }
      }

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
  }, [ppeModel, personModel, cameraIP, addNotification, userId, user, siteLocation, getFaceModel]);

  useEffect(() => {
    if (detecting && isConnected && cameraIP && (AI_SERVICE_URL || ppeModel)) {
      let cancelled = false;
      const scheduleNext = (delay) => {
        timerRef.current = setTimeout(async () => {
          if (cancelled) return;
          await detectFrame();
          if (!cancelled) scheduleNext(DETECTION_INTERVAL_MS);
        }, delay);
      };
      scheduleNext(0);

      return () => {
        cancelled = true;
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    return undefined;
  }, [detecting, ppeModel, isConnected, cameraIP, detectFrame]);

  useEffect(() => {
    cachedPersonsRef.current = [];
    lastPersonDetectionAtRef.current = 0;
  }, [cameraIP]);

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
      if (timerRef.current) clearTimeout(timerRef.current);
      // Clear tracking state so a fresh session starts clean.
      trackerRef.current.reset();
      confirmFramesRef.current = {};
      lastEmailSentRef.current = {};
      return;
    }

    if (!AI_SERVICE_URL && !ppeModel) {
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

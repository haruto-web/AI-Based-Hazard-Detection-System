import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport, getIncidents } from '../utils/incidents';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import {
  buildCaptureUrl,
  createPersonTracker,
  cropFaceForPerson,
  detectFaces,
  detectMaterialObjects,
  detectPersons,
  detectPpeObjects,
  detectProtrudingObjects,
  detectScaffoldingObjects,
  groupPpeDetections,
  loadFaceDetectionModel,
  loadMaterialDetectionModel,
  loadPpeDetectionModels,
  MATERIAL_LABELS,
  loadProtrudingDetectionModel,
  loadScaffoldingDetectionModel,
  PROTRUDING_LABELS,
  SCAFFOLDING_LABELS,
  stabilizePpeDetections,
} from '../AI/LM_detection/ppeDetection';
import {
  buildHazardReport,
  buildMaterialHandlingHazardReport,
  buildProtrudingHazardReport,
  buildScaffoldingHazardReport,
} from '../AI/LM_detection/hazardDetails';

// A violation must persist across this many consecutive frames before it
// alerts, so a single-frame model miss (flicker) doesn't fire a false alarm.
const PPE_FRAMES_TO_REPORT = 5;
const DETECTION_INTERVAL_MS = 2000;
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

async function captureFullFrameImage(captureUrl) {
  const image = await loadCaptureFrame(captureUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 640;
  canvas.height = image.naturalHeight || 480;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create image evidence canvas');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
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
  const backendAlertRef = useRef({});
  const backendPpePresenceRef = useRef({});
  const scaffoldingAlertRef = useRef({ cameraIP: '', frames: 0, alerted: false });
  const protrudingAlertRef = useRef({ cameraIP: '', frames: 0, alerted: false });
  const materialAlertRef = useRef({ cameraIP: '', frames: 0, alerted: false });
  const cachedPersonsRef = useRef([]);
  const lastPersonDetectionAtRef = useRef(0);
  const lastDetectionStartedAtRef = useRef(0);
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const userId = user?.uid;
  const [ppeModel, setPpeModel] = useState(null);
  const [scaffoldingModel, setScaffoldingModel] = useState(null);
  const [protrudingModel, setProtrudingModel] = useState(null);
  const [materialModel, setMaterialModel] = useState(null);
  const [personModel, setPersonModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scaffoldingLoading, setScaffoldingLoading] = useState(false);
  const [scaffoldingError, setScaffoldingError] = useState(null);
  const [protrudingLoading, setProtrudingLoading] = useState(false);
  const [protrudingError, setProtrudingError] = useState(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState(null);
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
    scaffoldingClasses: {},
    noBase: 0,
    protrudingClasses: {},
    materialClasses: {},
  });
  const modelLoadPromiseRef = useRef(null);
  const scaffoldingModelLoadPromiseRef = useRef(null);
  const scaffoldingModelLoadFailedRef = useRef(false);
  const protrudingModelLoadPromiseRef = useRef(null);
  const protrudingModelLoadFailedRef = useRef(false);
  const materialModelLoadPromiseRef = useRef(null);
  const materialModelLoadFailedRef = useRef(false);
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

  const loadScaffoldingModel = useCallback(() => {
    if (scaffoldingModel) return Promise.resolve(scaffoldingModel);
    if (scaffoldingModelLoadFailedRef.current) return Promise.resolve(null);
    if (scaffoldingModelLoadPromiseRef.current) return scaffoldingModelLoadPromiseRef.current;

    setScaffoldingLoading(true);
    const promise = loadScaffoldingDetectionModel()
      .then((model) => {
        setScaffoldingModel(model);
        setScaffoldingError(null);
        return model;
      })
      .catch((err) => {
        console.error('Failed to load scaffolding detection model:', err);
        scaffoldingModelLoadPromiseRef.current = null;
        scaffoldingModelLoadFailedRef.current = true;
        setScaffoldingError(err?.message || 'Unknown error');
        setStatus(`Scaffolding detection unavailable: ${err?.message || 'Unknown error'}`);
        throw err;
      })
      .finally(() => setScaffoldingLoading(false));

    scaffoldingModelLoadPromiseRef.current = promise;
    return promise;
  }, [scaffoldingModel]);

  const loadProtrudingModel = useCallback(() => {
    if (protrudingModel) return Promise.resolve(protrudingModel);
    if (protrudingModelLoadFailedRef.current) return Promise.resolve(null);
    if (protrudingModelLoadPromiseRef.current) return protrudingModelLoadPromiseRef.current;

    setProtrudingLoading(true);
    const promise = loadProtrudingDetectionModel()
      .then((model) => {
        setProtrudingModel(model);
        setProtrudingError(null);
        return model;
      })
      .catch((err) => {
        console.error('Failed to load protruding hazard detection model:', err);
        protrudingModelLoadPromiseRef.current = null;
        protrudingModelLoadFailedRef.current = true;
        setProtrudingError(err?.message || 'Unknown error');
        setStatus(`Protruding hazard detection unavailable: ${err?.message || 'Unknown error'}`);
        throw err;
      })
      .finally(() => setProtrudingLoading(false));

    protrudingModelLoadPromiseRef.current = promise;
    return promise;
  }, [protrudingModel]);

  const loadMaterialModel = useCallback(() => {
    if (materialModel) return Promise.resolve(materialModel);
    if (materialModelLoadFailedRef.current) return Promise.resolve(null);
    if (materialModelLoadPromiseRef.current) return materialModelLoadPromiseRef.current;

    setMaterialLoading(true);
    const promise = loadMaterialDetectionModel()
      .then((model) => {
        setMaterialModel(model);
        setMaterialError(null);
        return model;
      })
      .catch((err) => {
        console.error('Failed to load material-handling detection model:', err);
        materialModelLoadPromiseRef.current = null;
        materialModelLoadFailedRef.current = true;
        setMaterialError(err?.message || 'Unknown error');
        setStatus(`Material-handling detection unavailable: ${err?.message || 'Unknown error'}`);
        throw err;
      })
      .finally(() => setMaterialLoading(false));

    materialModelLoadPromiseRef.current = promise;
    return promise;
  }, [materialModel]);

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
      if (!payload || typeof payload !== 'object' || payload.ok !== true) {
        throw new Error('AI service returned an invalid detection response');
      }
      const hasDetectionSummary = payload.detections &&
        typeof payload.detections === 'object' &&
        !Array.isArray(payload.detections);
      const detections = hasDetectionSummary
        ? stabilizePpeDetections(
          payload.detections,
          backendPpePresenceRef.current,
          cameraIP,
        )
        : {};
      if (detections) {
        setDetections((previous) => ({
          persons: detections.persons || 0,
          helmets: detections.helmets || 0,
          vests: detections.vests || 0,
          shoes: detections.shoes || 0,
          noHelmets: detections.noHelmets || 0,
          noVests: detections.noVests || 0,
          noShoes: detections.noShoes || 0,
          compliant: detections.compliant || 0,
          violations: detections.violations || 0,
          scaffoldingClasses: detections.scaffoldingClasses || previous.scaffoldingClasses,
          noBase: detections.noBase ?? previous.noBase,
          protrudingClasses: detections.protrudingClasses || previous.protrudingClasses,
          materialClasses: detections.materialClasses || previous.materialClasses,
        }));
      }

      const siteForIncident = siteLocation && siteLocation.trim()
        ? siteLocation.trim()
        : 'Site location not set';
      const backendIssues = [
        detections.noHelmets ? { item: 'Safety Helmet', count: detections.noHelmets } : null,
        detections.noVests ? { item: 'Safety Vest', count: detections.noVests } : null,
        detections.noShoes ? { item: 'Safety Shoes', count: detections.noShoes } : null,
      ].filter(Boolean);
      const needsEvidence = backendIssues.some((issue) => {
        const key = `${cameraIP}:${issue.item}`;
        return Date.now() - (backendAlertRef.current[key] || 0) >= 60000;
      });
      const captureFrameImage = needsEvidence
        ? await captureFaceEvidence(captureUrl)
        : '';

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
          model: 'PPE TFLite (backend)',
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

      }

      const backendHazards = [
        detections.noBase
          ? {
            count: detections.noBase,
            confidence: detections.scaffoldingConfidence,
            report: buildScaffoldingHazardReport({
              affectedCount: detections.noBase,
              cameraSource: cameraIP,
            }),
            model: 'Scaffolding TFLite (backend)',
          }
          : null,
        detections.protrudingHazardCount
          ? {
            count: detections.protrudingHazardCount,
            confidence: detections.protrudingConfidence,
            report: buildProtrudingHazardReport({
              affectedCount: detections.protrudingHazardCount,
              cameraSource: cameraIP,
            }),
            model: 'Protruding hazard TFLite (backend)',
          }
          : null,
        detections.messyMaterialAreas
          ? {
            count: detections.messyMaterialAreas,
            confidence: detections.materialConfidence,
            report: buildMaterialHandlingHazardReport({
              affectedCount: detections.messyMaterialAreas,
              cameraSource: cameraIP,
            }),
            model: 'Material handling TFLite (backend)',
          }
          : null,
      ].filter(Boolean);
      const needsHazardEvidence = backendHazards.some((issue) => {
        const key = `${cameraIP}:${issue.report.hazardType}`;
        return Date.now() - (backendAlertRef.current[key] || 0) >= 60000;
      });
      let hazardImage = '';
      if (needsHazardEvidence) {
        try {
          hazardImage = await captureFullFrameImage(captureUrl);
        } catch (error) {
          console.warn('Could not capture image evidence for backend hazard:', error?.message || error);
        }
      }

      for (const issue of backendHazards) {
        const key = `${cameraIP}:${issue.report.hazardType}`;
        const lastAt = backendAlertRef.current[key] || 0;
        if (Date.now() - lastAt < 60000) continue;
        backendAlertRef.current[key] = Date.now();

        addNotification({
          violationType: issue.report.hazardType,
          cameraSource: `Site: ${siteForIncident} | Camera: ${cameraIP}`,
          message: issue.report.notificationMessage,
          severity: issue.report.severity,
        });
        createIncidentReport({
          userId,
          hazardType: issue.report.hazardType,
          description: issue.report.description,
          precautions: issue.report.precautions,
          cameraSource: cameraIP,
          severity: issue.report.severity,
          detectionConfidence: issue.confidence || 0,
          model: issue.model,
          detectedWorkers: 0,
          imageData: hazardImage,
          site: siteForIncident,
        });
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
        `noBase=${detections.noBase || 0}`,
        `protruding=${detections.protrudingHazardCount || 0}`,
        `messyMaterials=${detections.messyMaterialAreas || 0}`,
      ].join(' • ');

      const backendStatus = hasDetectionSummary
        ? payload.status || 'AI analysis running on backend'
        : 'AI service returned no detection counts';
      const modelErrors = payload.modelErrors && Object.entries(payload.modelErrors)
        .map(([name, message]) => `${name}: ${message}`)
        .join('; ');
      setStatus(`${backendStatus} • ${backendSummary}${modelErrors ? ` • Model errors: ${modelErrors}` : ''}`);
      return true;
    } catch (error) {
      console.warn('Local AI service request failed:', error?.message || error);
      return false;
    }
  }, [addNotification, cameraIP, captureFaceEvidence, siteLocation, userId]);

  const detectFrame = useCallback(async () => {
    const now = Date.now();
    if (inferenceInFlightRef.current || !canvasRef.current) return;
    if (now - lastDetectionStartedAtRef.current < DETECTION_INTERVAL_MS) return;

    let backendHandled = false;
    if (AI_SERVICE_URL) {
      lastDetectionStartedAtRef.current = now;
      inferenceInFlightRef.current = true;
      try {
        backendHandled = await detectViaBackend();
        if (!backendHandled) {
          setStatus('Local AI service unavailable. Start the service at the configured VITE_AI_API_URL; browser fallback is disabled to avoid memory errors.');
        }
      } finally {
        inferenceInFlightRef.current = false;
      }
      if (!backendHandled) {
        return;
      }
      return;
    }

    if (!backendHandled && !ppeModel) {
      try {
        await loadModels();
      } catch {
        return;
      }
    }

    if (!backendHandled && !ppeModel) return;
    if (!scaffoldingModel) loadScaffoldingModel().catch(() => {});
    if (!protrudingModel) loadProtrudingModel().catch(() => {});
    if (!materialModel) loadMaterialModel().catch(() => {});

    lastDetectionStartedAtRef.current = now;

    const captureUrl = buildCaptureUrl(cameraIP);
    if (!captureUrl) {
      setStatus('No camera URL');
      return;
    }

    inferenceInFlightRef.current = true;

    // Keep the captured frame clean while using it as the model input.
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

      const shouldRefreshPersons = !backendHandled && personModel &&
        Date.now() - lastPersonDetectionAtRef.current >= PERSON_DETECTION_INTERVAL_MS;
      let scaffoldingDetectionError = null;
      let protrudingDetectionError = null;
      let materialDetectionError = null;
      const [ppeObjects, refreshedPersons, scaffoldingObjects, protrudingObjects, materialObjects] = await Promise.all([
        backendHandled ? Promise.resolve([]) : detectPpeObjects({ ppeModel, canvas }),
        shouldRefreshPersons
          ? detectPersons({ personModel, canvas })
          : Promise.resolve(null),
        scaffoldingModel
          ? detectScaffoldingObjects({ scaffoldingModel, canvas }).catch((err) => {
            scaffoldingDetectionError = err;
            console.error('Scaffolding detection frame failed:', err);
            return null;
          })
          : Promise.resolve(null),
        protrudingModel
          ? detectProtrudingObjects({ protrudingModel, canvas }).catch((err) => {
            protrudingDetectionError = err;
            console.error('Protruding hazard detection frame failed:', err);
            return null;
          })
          : Promise.resolve(null),
        materialModel
          ? detectMaterialObjects({ materialModel, canvas }).catch((err) => {
            materialDetectionError = err;
            console.error('Material-handling detection frame failed:', err);
            return null;
          })
          : Promise.resolve(null),
      ]);
      const currentScaffoldingObjects = scaffoldingObjects || [];
      const currentProtrudingObjects = protrudingObjects || [];
      const currentMaterialObjects = materialObjects || [];
      const scaffoldingClasses = Object.fromEntries(
        SCAFFOLDING_LABELS.map((label) => [
          label,
          currentScaffoldingObjects.filter((item) => item.label === label).length,
        ])
      );
      const noBase = scaffoldingClasses['No Base'];
      const protrudingClasses = Object.fromEntries(
        PROTRUDING_LABELS.map((label) => [
          label,
          currentProtrudingObjects.filter((item) => item.label === label).length,
        ])
      );
      const protrudingHazards = protrudingClasses['Potruding Hazard'];
      const materialClasses = Object.fromEntries(
        MATERIAL_LABELS.map((label) => [
          label,
          currentMaterialObjects.filter((item) => item.label === label).length,
        ])
      );
      const messyMaterials = materialClasses.Messy;

      if (scaffoldingModel && !scaffoldingDetectionError) {
        setDetections((previous) => ({
          ...previous,
          scaffoldingClasses,
          noBase,
          protrudingClasses: protrudingDetectionError
            ? previous.protrudingClasses
            : protrudingClasses,
          materialClasses: materialDetectionError
            ? previous.materialClasses
            : materialClasses,
        }));

        const alertState = scaffoldingAlertRef.current;
        if (alertState.cameraIP !== cameraIP) {
          scaffoldingAlertRef.current = { cameraIP, frames: 0, alerted: false };
        }
        const currentAlertState = scaffoldingAlertRef.current;
        if (noBase > 0) {
          currentAlertState.frames += 1;
          if (currentAlertState.frames >= PPE_FRAMES_TO_REPORT && !currentAlertState.alerted) {
            currentAlertState.alerted = true;
            const siteForIncident = siteLocation && siteLocation.trim()
              ? siteLocation.trim()
              : 'Site location not set';
            const affectedCount = noBase;
            const confidence = currentScaffoldingObjects
              .filter((item) => item.label === 'No Base')
              .reduce((sum, item) => sum + item.score, 0) / affectedCount;
            const report = buildScaffoldingHazardReport({
              affectedCount,
              cameraSource: cameraIP,
            });
            let imageData = '';
            try {
              imageData = canvas.toDataURL('image/jpeg', 0.6);
            } catch {
              imageData = '';
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
              detectionConfidence: confidence,
              model: 'Scaffolding TFLite',
              detectedWorkers: 0,
              imageData,
              site: siteForIncident,
            });
          }
        } else {
          currentAlertState.frames = 0;
          currentAlertState.alerted = false;
        }
      }

      if (protrudingModel && !protrudingDetectionError) {
        setDetections((previous) => ({
          ...previous,
          protrudingClasses,
        }));

        const alertState = protrudingAlertRef.current;
        if (alertState.cameraIP !== cameraIP) {
          protrudingAlertRef.current = { cameraIP, frames: 0, alerted: false };
        }
        const currentAlertState = protrudingAlertRef.current;
        if (protrudingHazards > 0) {
          currentAlertState.frames += 1;
          if (currentAlertState.frames >= PPE_FRAMES_TO_REPORT && !currentAlertState.alerted) {
            currentAlertState.alerted = true;
            const siteForIncident = siteLocation && siteLocation.trim()
              ? siteLocation.trim()
              : 'Site location not set';
            const confidence = currentProtrudingObjects
              .filter((item) => item.label === 'Potruding Hazard')
              .reduce((sum, item) => sum + item.score, 0) / protrudingHazards;
            const report = buildProtrudingHazardReport({
              affectedCount: protrudingHazards,
              cameraSource: cameraIP,
            });
            let imageData = '';
            try {
              imageData = canvas.toDataURL('image/jpeg', 0.6);
            } catch {
              imageData = '';
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
              detectionConfidence: confidence,
              model: 'Protruding hazard TFLite',
              detectedWorkers: 0,
              imageData,
              site: siteForIncident,
            });
          }
        } else {
          currentAlertState.frames = 0;
          currentAlertState.alerted = false;
        }
      }

      if (materialModel && !materialDetectionError) {
        setDetections((previous) => ({
          ...previous,
          materialClasses,
        }));

        const alertState = materialAlertRef.current;
        if (alertState.cameraIP !== cameraIP) {
          materialAlertRef.current = { cameraIP, frames: 0, alerted: false };
        }
        const currentAlertState = materialAlertRef.current;
        if (messyMaterials > 0) {
          currentAlertState.frames += 1;
          if (currentAlertState.frames >= PPE_FRAMES_TO_REPORT && !currentAlertState.alerted) {
            currentAlertState.alerted = true;
            const siteForIncident = siteLocation && siteLocation.trim()
              ? siteLocation.trim()
              : 'Site location not set';
            const confidence = currentMaterialObjects
              .filter((item) => item.label === 'Messy')
              .reduce((sum, item) => sum + item.score, 0) / messyMaterials;
            const report = buildMaterialHandlingHazardReport({
              affectedCount: messyMaterials,
              cameraSource: cameraIP,
            });
            let imageData = '';
            try {
              imageData = canvas.toDataURL('image/jpeg', 0.6);
            } catch {
              imageData = '';
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
              detectionConfidence: confidence,
              model: 'Material handling TFLite',
              detectedWorkers: 0,
              imageData,
              site: siteForIncident,
            });
          }
        } else {
          currentAlertState.frames = 0;
          currentAlertState.alerted = false;
        }
      }

      if (backendHandled) {
        setStatus(
          `Backend PPE analysis running • Scaffolding components=${currentScaffoldingObjects.length} • No Base=${noBase} • Protruding hazards=${protrudingHazards} • Messy material areas=${messyMaterials}` +
          (scaffoldingDetectionError ? ` • Scaffolding detection error: ${scaffoldingDetectionError.message}` : '') +
          (protrudingDetectionError ? ` • Protruding hazard detection error: ${protrudingDetectionError.message}` : '') +
          (materialDetectionError ? ` • Material handling detection error: ${materialDetectionError.message}` : '')
        );
        return;
      }

      if (refreshedPersons) {
        cachedPersonsRef.current = refreshedPersons;
        lastPersonDetectionAtRef.current = Date.now();
      }
      const modelPersons = ppeObjects
        .filter((item) => item.label === 'Person')
        .map(({ score, box }) => ({ score, box }));
      const equipmentDetections = ppeObjects.filter((item) => item.label !== 'Person');
      const persons = cachedPersonsRef.current.length
        ? cachedPersonsRef.current
        : modelPersons;

      // One group per detected person (falls back to spatial clustering when
      // no person model output is available). canvas.height enables adaptive
      // visibility so shoes/vest aren't flagged when out of frame.
      const rawGroups = groupPpeDetections(equipmentDetections, canvas.width, persons, canvas.height);
      // Attach a stable trackId to each person so alerts are per-person.
      const groups = trackerRef.current.assign(rawGroups);

      const helmets = equipmentDetections.filter((item) => item.label === 'Safety Helmet').length;
      const vests = equipmentDetections.filter((item) => item.label === 'Safety Vest').length;
      const shoes = equipmentDetections.filter((item) => item.label === 'Safety Shoes').length;

      // Average detection confidence across all PPE boxes this frame (0..1).
      const avgConfidence = equipmentDetections.length
        ? equipmentDetections.reduce((sum, item) => sum + item.score, 0) / equipmentDetections.length
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
        `Analyzing • ${personCount} person(s) • ${compliantGroups.length} compliant, ${violationGroups.length} with violations • Scaffolding components=${currentScaffoldingObjects.length}, No Base=${noBase} • Protruding hazards=${protrudingHazards} • Messy material areas=${messyMaterials}` +
        (scaffoldingDetectionError ? ` • Scaffolding detection error: ${scaffoldingDetectionError.message}` : '') +
        (protrudingDetectionError ? ` • Protruding hazard detection error: ${protrudingDetectionError.message}` : '') +
        (materialDetectionError ? ` • Material handling detection error: ${materialDetectionError.message}` : '')
      );
      setDetections((previous) => ({
        persons: personCount,
        helmets,
        vests,
        shoes,
        noHelmets,
        noVests,
        noShoes,
        compliant: compliantGroups.length,
        violations: violationGroups.length,
        scaffoldingClasses: scaffoldingDetectionError ? previous.scaffoldingClasses : scaffoldingClasses,
        noBase: scaffoldingDetectionError ? previous.noBase : noBase,
        protrudingClasses: protrudingDetectionError ? previous.protrudingClasses : protrudingClasses,
        materialClasses: materialDetectionError ? previous.materialClasses : materialClasses,
      }));

      const tracker = trackerRef.current;
      const siteForIncident = siteLocation && siteLocation.trim()
        ? siteLocation.trim()
        : 'Site location not set';

      // Lazily capture the clean frame only once per frame if any alert fires.
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

          // Keep a single incident for an ongoing tracked violation. Email
          // delivery is triggered by the shared Firestore incident record.
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
            model: 'PPE TFLite',
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
  }, [
    ppeModel,
    scaffoldingModel,
    protrudingModel,
    materialModel,
    personModel,
    cameraIP,
    addNotification,
    userId,
    siteLocation,
    getFaceModel,
    detectViaBackend,
    loadScaffoldingModel,
    loadProtrudingModel,
    loadMaterialModel,
  ]);

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
    if (AI_SERVICE_URL || !isConnected || !cameraIP || modelLoadStartedRef.current) return undefined;

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
      scaffoldingAlertRef.current = { cameraIP, frames: 0, alerted: false };
      protrudingAlertRef.current = { cameraIP, frames: 0, alerted: false };
      materialAlertRef.current = { cameraIP, frames: 0, alerted: false };
      return;
    }

    if (AI_SERVICE_URL) {
      setDetecting(true);
      return;
    }

    loadScaffoldingModel().catch(() => {});
    loadProtrudingModel().catch(() => {});
    loadMaterialModel().catch(() => {});
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
    scaffoldingLoading,
    protrudingLoading,
    materialLoading,
    error,
    status,
    detections,
    detecting,
    toggleDetection,
    handleRetry: () => {
      scaffoldingModelLoadPromiseRef.current = null;
      scaffoldingModelLoadFailedRef.current = false;
      setScaffoldingError(null);
      protrudingModelLoadPromiseRef.current = null;
      protrudingModelLoadFailedRef.current = false;
      setProtrudingError(null);
      materialModelLoadPromiseRef.current = null;
      materialModelLoadFailedRef.current = false;
      setMaterialError(null);
      return Promise.all([
        loadModels(),
        loadScaffoldingModel(),
        loadProtrudingModel(),
        loadMaterialModel(),
      ]);
    },
    scaffoldingError,
    protrudingError,
    materialError,
  };
}

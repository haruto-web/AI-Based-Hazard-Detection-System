import { useRef, useEffect, useState, useCallback } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { useSites } from '../context/SiteContext';
import { useAuth } from '../context/AuthContext';
import { createIncidentReport } from '../utils/incidents';
import {
  buildCaptureUrl,
  classifyHelmetRegion,
  clampRegion,
  drawFaceResult,
  drawHelmetResult,
  drawPersonResult,
  findFaceForPerson,
  getHelmetRegionFromFace,
  getHelmetRegionFromPerson,
  loadPpeDetectionModels,
} from '../AI/LM_detection/ppeDetection';
import '../styles/DetectionViewer.css';

const VIOLATION_COOLDOWN_MS = 30000;
const NO_HELMET_FRAMES_TO_REPORT = 3;

export default function DetectionViewer({ cameraIP, isConnected }) {
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const timerRef = useRef(null);
  const lastHelmetAlertRef = useRef(0);
  const noHelmetFrameCountRef = useRef(0);
  const { addNotification } = useNotifications();
  const { activeSite } = useSites();
  const { user } = useAuth();
  const [cocoModel, setCocoModel] = useState(null);
  const [faceModel, setFaceModel] = useState(null);
  const [helmetModel, setHelmetModel] = useState(null);
  const [helmetMetadata, setHelmetMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detections, setDetections] = useState({
    persons: 0,
    faces: 0,
    helmets: 0,
    noHelmets: 0,
  });
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);

  // Load models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        setLoading(true);
        setError(null);
        const models = await loadPpeDetectionModels();

        setCocoModel(models.personModel);
        setFaceModel(models.faceModel);
        setHelmetModel(models.helmetModel);
        setHelmetMetadata(models.helmetMetadata);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load detection models:', err);
        setError('Failed to load AI models. Check your internet connection.');
        setLoading(false);
      }
    }
    loadModels();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Fetch a single frame from /capture and run detection on it
  const detectFrame = useCallback(async () => {
    if (!cocoModel || !faceModel || !canvasRef.current || !cameraIP) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    try {
      // Fetch a single JPEG frame from the capture endpoint
      const response = await fetch(buildCaptureUrl(cameraIP));
      if (!response.ok) throw new Error('Capture failed');

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Set canvas size to match image
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;

      // Draw frame to canvas
      ctx.drawImage(imageBitmap, 0, 0);

      // Run detections in parallel
      const [cocoPredictions, facePredictions] = await Promise.all([
        cocoModel.detect(canvas),
        faceModel.estimateFaces(canvas, false),
      ]);

      // Filter for persons only
      const persons = cocoPredictions.filter(p => p.class === 'person');

      let helmetCount = 0;
      let noHelmetCount = 0;

      // Draw person bounding boxes and helmet indicators.
      for (const prediction of persons) {
        drawPersonResult(ctx, prediction);

        const face = findFaceForPerson(prediction, facePredictions);
        const rawHelmetRegion = face
          ? getHelmetRegionFromFace(face)
          : getHelmetRegionFromPerson(prediction);
        const helmetRegion = clampRegion(rawHelmetRegion, canvas);
        const cropCanvas = cropCanvasRef.current || document.createElement('canvas');
        cropCanvasRef.current = cropCanvas;
        const helmetResult = await classifyHelmetRegion({
          ctx,
          canvas,
          region: helmetRegion,
          helmetModel,
          helmetMetadata,
          cropCanvas,
        });
        const hasHelmet = helmetResult.hasHelmet;

        if (hasHelmet) {
          helmetCount++;
        } else {
          noHelmetCount++;
        }

        drawHelmetResult(ctx, helmetRegion, hasHelmet);
      }

      // Draw face bounding boxes (cyan)
      facePredictions.forEach(face => {
        drawFaceResult(ctx, face);
      });

      setDetections({
        persons: persons.length,
        faces: facePredictions.length,
        helmets: helmetCount,
        noHelmets: noHelmetCount,
      });

      if (noHelmetCount > 0) {
        noHelmetFrameCountRef.current += 1;
        const now = Date.now();
        if (
          noHelmetFrameCountRef.current >= NO_HELMET_FRAMES_TO_REPORT &&
          now - lastHelmetAlertRef.current > VIOLATION_COOLDOWN_MS
        ) {
          lastHelmetAlertRef.current = now;
          addNotification({
            violationType: 'No Safety Helmet',
            cameraSource: cameraIP,
            severity: 'high',
          });
          createIncidentReport({
            userId: user?.uid,
            hazardType: 'No Safety Helmet',
            cameraSource: cameraIP,
            severity: 'high',
            siteName: activeSite,
            detectedWorkers: persons.length,
            helmets: helmetCount,
            noHelmets: noHelmetCount,
          });
        }
      } else {
        noHelmetFrameCountRef.current = 0;
      }

      imageBitmap.close();
    } catch (err) {
      console.warn('Detection frame error:', err.message);
    }

    // Schedule next frame (about 2 FPS)
    if (detecting) {
      timerRef.current = setTimeout(detectFrame, 500);
    }
  }, [
    cocoModel,
    faceModel,
    helmetModel,
    helmetMetadata,
    cameraIP,
    detecting,
    addNotification,
    activeSite,
    user?.uid,
  ]);

  // Start/stop detection loop
  useEffect(() => {
    if (detecting && cocoModel && faceModel && helmetModel && isConnected && cameraIP) {
      detectFrame();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [detecting, cocoModel, faceModel, helmetModel, isConnected, cameraIP, detectFrame]);

  function toggleDetection() {
    if (detecting) {
      setDetecting(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setDetecting(true);
    }
  }

  if (!isConnected) return null;

  return (
    <div className="detection-viewer">
      <div className="detection-header">
        <h3>AI Detection</h3>
        <button
          className={`detection-toggle ${detecting ? 'active' : ''}`}
          onClick={toggleDetection}
          disabled={loading || !!error}
        >
          {loading ? 'Loading models...' : detecting ? 'Stop Detection' : 'Start Detection'}
        </button>
      </div>

      {error && <p className="detection-error">{error}</p>}

      {detecting && (
        <>
          <div className="detection-stats">
            <span className="stat person-stat">Persons: {detections.persons}</span>
            <span className="stat face-stat">Faces: {detections.faces}</span>
            <span className="stat helmet-stat">Helmet: {detections.helmets}</span>
            <span className={`stat no-helmet-stat${detections.noHelmets > 0 ? ' active' : ''}`}>
              No helmet: {detections.noHelmets}
            </span>
          </div>
          <canvas ref={canvasRef} className="detection-canvas" />
        </>
      )}
    </div>
  );
}

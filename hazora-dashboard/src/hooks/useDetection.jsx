import { useCallback, useEffect, useRef, useState } from 'react';
import { createIncidentReport } from '../utils/incidents';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
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

const VIOLATION_COOLDOWN_MS = 30000;
const NO_HELMET_FRAMES_TO_REPORT = 3;

export function useDetection(cameraIP, isConnected) {
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const timerRef = useRef(null);
  const lastHelmetAlertRef = useRef(0);
  const noHelmetFrameCountRef = useRef(0);
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [cocoModel, setCocoModel] = useState(null);
  const [faceModel, setFaceModel] = useState(null);
  const [helmetModel, setHelmetModel] = useState(null);
  const [helmetMetadata, setHelmetMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);
  const [detections, setDetections] = useState({
    persons: 0,
    faces: 0,
    helmets: 0,
    noHelmets: 0,
  });
  const modelLoadPromiseRef = useRef(null);
  const modelLoadStartedRef = useRef(false);

  async function loadModels() {
    if (modelLoadPromiseRef.current) {
      return modelLoadPromiseRef.current;
    }

    modelLoadStartedRef.current = true;
    setLoading(true);
    setError(null);

    const promise = (async () => {
      try {
        const models = await loadPpeDetectionModels();

        setCocoModel(models.personModel);
        setFaceModel(models.faceModel);
        setHelmetModel(models.helmetModel);
        setHelmetMetadata(models.helmetMetadata);
        return models;
      } catch (err) {
        console.error('Failed to load detection models:', err);
        const message = err?.message || 'Unknown error';
        setError(`Failed to load AI models. ${message}`);
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
    if (!cocoModel || !faceModel || !canvasRef.current || !cameraIP) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    try {
      const response = await fetch(buildCaptureUrl(cameraIP));
      if (!response.ok) throw new Error('Capture failed');

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      ctx.drawImage(imageBitmap, 0, 0);

      const [cocoPredictions, facePredictions] = await Promise.all([
        cocoModel.detect(canvas),
        faceModel.estimateFaces(canvas, false),
      ]);

      const persons = cocoPredictions.filter((p) => p.class === 'person');
      let helmetCount = 0;
      let noHelmetCount = 0;

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

      facePredictions.forEach((face) => {
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
    user?.uid,
  ]);

  useEffect(() => {
    if (detecting && cocoModel && faceModel && helmetModel && isConnected && cameraIP) {
      detectFrame();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [detecting, cocoModel, faceModel, helmetModel, isConnected, cameraIP, detectFrame]);

  useEffect(() => {
    let idleId = null;

    if (!isConnected || !cameraIP || modelLoadStartedRef.current) {
      return undefined;
    }

    const scheduleLoad = () => {
      loadModels().catch(() => {});
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(scheduleLoad, { timeout: 2000 });
    } else {
      idleId = window.setTimeout(scheduleLoad, 200);
    }

    return () => {
      if (idleId !== null) {
        if ('cancelIdleCallback' in window) {
          window.cancelIdleCallback(idleId);
        } else {
          window.clearTimeout(idleId);
        }
      }
    };
  }, [cameraIP, isConnected]);

  function toggleDetection() {
    if (detecting) {
      setDetecting(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (!cocoModel || !faceModel || !helmetModel) {
      loadModels()
        .then(() => {
          setDetecting(true);
        })
        .catch(() => {
          // error is handled in loadModels
        });
      return;
    }

    setDetecting(true);
  }

  return {
    canvasRef,
    loading,
    error,
    detections,
    detecting,
    toggleDetection,
    handleRetry: loadModels,
  };
}

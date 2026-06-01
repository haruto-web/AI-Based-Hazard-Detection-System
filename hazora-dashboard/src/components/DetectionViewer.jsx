import { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import '../styles/DetectionViewer.css';

export default function DetectionViewer({ cameraIP, isConnected }) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const [cocoModel, setCocoModel] = useState(null);
  const [faceModel, setFaceModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detections, setDetections] = useState({ persons: 0, faces: 0 });
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(null);

  // Load models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        setLoading(true);
        setError(null);
        await tf.ready();

        const [coco, face] = await Promise.all([
          cocoSsd.load({ base: 'lite_mobilenet_v2' }),
          blazeface.load(),
        ]);

        setCocoModel(coco);
        setFaceModel(face);
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
      const response = await fetch(`http://${cameraIP}/capture`);
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

      // Draw person bounding boxes (green)
      persons.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 14px Arial';
        const label = `Person ${Math.round(prediction.score * 100)}%`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, y - 22, textWidth + 10, 22);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 5, y - 6);
      });

      // Draw face bounding boxes (cyan)
      facePredictions.forEach(face => {
        const start = face.topLeft;
        const end = face.bottomRight;
        const size = [end[0] - start[0], end[1] - start[1]];

        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 2;
        ctx.strokeRect(start[0], start[1], size[0], size[1]);

        ctx.fillStyle = '#00d4aa';
        ctx.font = 'bold 12px Arial';
        const prob = Math.round(face.probability[0] * 100);
        const faceLabel = `Face ${prob}%`;
        const textWidth = ctx.measureText(faceLabel).width;
        ctx.fillRect(start[0], start[1] - 18, textWidth + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(faceLabel, start[0] + 4, start[1] - 4);
      });

      setDetections({ persons: persons.length, faces: facePredictions.length });
      imageBitmap.close();
    } catch (err) {
      console.warn('Detection frame error:', err.message);
    }

    // Schedule next frame (about 2 FPS)
    if (detecting) {
      timerRef.current = setTimeout(detectFrame, 500);
    }
  }, [cocoModel, faceModel, cameraIP, detecting]);

  // Start/stop detection loop
  useEffect(() => {
    if (detecting && cocoModel && faceModel && isConnected && cameraIP) {
      detectFrame();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [detecting, cocoModel, faceModel, isConnected, cameraIP, detectFrame]);

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
          </div>
          <canvas ref={canvasRef} className="detection-canvas" />
        </>
      )}
    </div>
  );
}

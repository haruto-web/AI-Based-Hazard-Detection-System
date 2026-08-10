import { useDetection } from '../hooks/useDetection';
import DetectionViewerContent from './DetectionViewerContent';

export default function DetectionViewer({ cameraIP, isConnected }) {
  const {
    canvasRef,
    loading,
    error,
    detections,
    detecting,
    toggleDetection,
    handleRetry,
  } = useDetection(cameraIP, isConnected);

  if (!isConnected) return null;

  return (
    <DetectionViewerContent
      canvasRef={canvasRef}
      loading={loading}
      error={error}
      detections={detections}
      detecting={detecting}
      toggleDetection={toggleDetection}
      handleRetry={handleRetry}
    />
  );
}

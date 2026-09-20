import { useDetection } from '../hooks/useDetection';
import DetectionViewerContent from './DetectionViewerContent';

export default function DetectionViewer({ cameraIP, isConnected }) {
  const {
    canvasRef,
    streamImageRef,
    streamUrl,
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
      streamImageRef={streamImageRef}
      streamUrl={streamUrl}
      loading={loading}
      error={error}
      detections={detections}
      detecting={detecting}
      toggleDetection={toggleDetection}
      handleRetry={handleRetry}
    />
  );
}

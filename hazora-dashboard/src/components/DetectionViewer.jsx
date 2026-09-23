import DetectionViewerContent from './DetectionViewerContent';

// Presentational wrapper. Detection state is owned by Dashboard (via useDetection).
export default function DetectionViewer({ detection, isConnected }) {
  if (!isConnected || !detection) return null;

  const {
    canvasRef,
    loading,
    error,
    status,
    detections,
    detecting,
    toggleDetection,
    handleRetry,
  } = detection;

  return (
    <DetectionViewerContent
      canvasRef={canvasRef}
      loading={loading}
      error={error}
      status={status}
      detections={detections}
      detecting={detecting}
      toggleDetection={toggleDetection}
      handleRetry={handleRetry}
    />
  );
}

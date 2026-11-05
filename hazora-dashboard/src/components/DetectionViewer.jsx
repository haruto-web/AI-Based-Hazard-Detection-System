import DetectionViewerContent from './DetectionViewerContent';

// Presentational wrapper. Detection state is owned by Dashboard (via useDetection).
export default function DetectionViewer({ detection, isConnected }) {
  if (!isConnected || !detection) return null;

  const {
    canvasRef,
    loading,
    scaffoldingLoading,
    protrudingLoading,
    materialLoading,
    error,
    scaffoldingError,
    protrudingError,
    materialError,
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
      scaffoldingLoading={scaffoldingLoading}
      protrudingLoading={protrudingLoading}
      materialLoading={materialLoading}
      error={error}
      scaffoldingError={scaffoldingError}
      protrudingError={protrudingError}
      materialError={materialError}
      status={status}
      detections={detections}
      detecting={detecting}
      toggleDetection={toggleDetection}
      handleRetry={handleRetry}
    />
  );
}

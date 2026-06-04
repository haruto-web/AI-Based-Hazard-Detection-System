import StreamBox from './StreamBox';
import '../styles/StreamGrid.css';

const STREAM_COUNT = 3;

export default function StreamGrid({ cameras, onCameraIPChange }) {
  const streams = Array.from({ length: STREAM_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Stream ${i + 1}`,
    cameraIP: cameras[i] || '',
  }));

  return (
    <div className="stream-grid">
      {streams.map(stream => (
        <StreamBox
          key={stream.id}
          id={stream.id}
          label={stream.label}
          cameraIP={stream.cameraIP}
          onIPChange={onCameraIPChange}
        />
      ))}
    </div>
  );
}

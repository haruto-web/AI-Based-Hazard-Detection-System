import StreamBox from './StreamBox';
import '../styles/StreamGrid.css';

const STREAM_COUNT = 5;

export default function StreamGrid({ cameraIP, isConnecting, onStatusChange }) {
  const streams = Array.from({ length: STREAM_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Stream ${i + 1}`,
  }));

  return (
    <div className="stream-grid">
      {streams.map(stream => (
        <StreamBox
          key={stream.id}
          cameraIP={cameraIP}
          isConnecting={isConnecting}
          label={stream.label}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

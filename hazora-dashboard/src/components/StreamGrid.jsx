import { useState } from 'react';
import StreamBox from './StreamBox';
import '../styles/StreamGrid.css';

const STREAM_COUNT = 3;
const MAIN_STREAM_KEY = 'hazora_main_stream';

export default function StreamGrid({ cameras, mainStreamId, onCameraIPChange, onMainStreamChange }) {

  const streams = Array.from({ length: STREAM_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Stream ${i + 1}`,
    cameraIP: cameras[i] || '',
  }));

  const orderedStreams = [
    streams.find(stream => stream.id === mainStreamId),
    ...streams.filter(stream => stream.id !== mainStreamId),
  ].filter(Boolean);

  function handleMainStreamChange(streamId) {
    onMainStreamChange?.(streamId);
    try {
      localStorage.setItem(MAIN_STREAM_KEY, String(streamId));
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <div className="stream-grid">
      {orderedStreams.map(stream => (
        <StreamBox
          key={stream.id}
          id={stream.id}
          label={stream.label}
          cameraIP={stream.cameraIP}
          onIPChange={onCameraIPChange}
          isMain={stream.id === mainStreamId}
          onPromote={handleMainStreamChange}
        />
      ))}
    </div>
  );
}

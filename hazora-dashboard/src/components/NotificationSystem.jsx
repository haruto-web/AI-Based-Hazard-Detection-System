import { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';

/**
 * NotificationSystem hooks into detection results and generates alerts.
 * For now, this component provides a hook for future integration with
 * the detection system. It monitors detection results and creates
 * notifications for PPE violations.
 */
export function useDetectionNotifications(detectionResults) {
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!detectionResults || !Array.isArray(detectionResults)) return;

    detectionResults.forEach((result) => {
      if (result.type === 'no_hardhat' || result.type === 'no_vest') {
        addNotification({
          violationType: result.type === 'no_hardhat' ? 'No Hard Hat' : 'No Safety Vest',
          cameraSource: result.camera || 'Unknown Camera',
          severity: 'high',
        });
      }
      if (result.type === 'gas_detected' || result.type === 'smoke_detected') {
        addNotification({
          violationType: result.type === 'gas_detected' ? 'Gas Detected' : 'Smoke Detected',
          cameraSource: result.camera || 'Unknown Camera',
          severity: 'critical',
        });
      }
    });
  }, [detectionResults, addNotification]);
}

export default function NotificationSystem() {
  // This component can be rendered to provide system-level notification logic
  // For now it serves as a namespace for the notification hooks
  return null;
}

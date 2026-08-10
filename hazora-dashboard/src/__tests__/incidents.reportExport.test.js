import { describe, expect, it } from 'vitest';
import { buildIncidentPdf } from '../utils/incidents';

describe('incident report export', () => {
  it('creates a PDF document with incident rows', () => {
    const doc = buildIncidentPdf([
      {
        date: '2026-08-10',
        time: '09:00:00',
        hazardType: 'No Safety Helmet',
        cameraSource: '192.168.254.106',
        severity: 'high',
        detectedWorkers: 2,
        helmets: 1,
        noHelmets: 1,
      },
    ], 'Hazora Safety Report');

    expect(doc).toBeTruthy();
    expect(typeof doc.save).toBe('function');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

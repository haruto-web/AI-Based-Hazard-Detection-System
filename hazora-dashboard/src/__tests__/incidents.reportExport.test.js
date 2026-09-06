import { describe, expect, it } from 'vitest';
import { buildIncidentCsv, buildIncidentPdf, filterIncidentsByMonthYear } from '../utils/incidents';

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

  it('exports incident detail fields and filters by month and year', () => {
    const incidents = [
      {
        timestamp: '2026-08-10T09:00:00.000Z',
        hazardType: 'No Safety Helmet',
        description: 'Worker detected without head protection.',
        severity: 'high',
        cameraSource: '192.168.254.106',
      },
      {
        timestamp: '2026-07-10T09:00:00.000Z',
        hazardType: 'No Safety Helmet',
        description: 'Older incident.',
        severity: 'medium',
      },
    ];

    const csv = buildIncidentCsv(incidents);
    expect(csv).toContain('Description');
    expect(csv).toContain('Worker detected without head protection.');
    expect(filterIncidentsByMonthYear(incidents, '2026-08')).toHaveLength(1);
  });
});

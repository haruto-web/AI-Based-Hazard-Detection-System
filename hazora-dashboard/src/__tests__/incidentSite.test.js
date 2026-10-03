import { describe, expect, it } from 'vitest';
import { buildIncidentCsv, normalizeIncident } from '../utils/incidents';

describe('incident site location', () => {
  it('normalizes the mobile app location field as the site', () => {
    expect(normalizeIncident({ location: 'North Plant' }).site).toBe('North Plant');
  });

  it('includes the site in exported incident CSV rows', () => {
    const csv = buildIncidentCsv([{
      date: '10/03/2026',
      time: '10:00 AM',
      hazardType: 'Missing helmet',
      site: 'North Plant',
    }]);

    expect(csv.split('\n')[0]).toContain('"Site"');
    expect(csv.split('\n')[1]).toContain('"North Plant"');
  });
});

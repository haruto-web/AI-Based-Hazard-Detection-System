import { describe, expect, it } from 'vitest';
import { buildIncidentCsv, buildTrainingDataset, normalizeIncident } from '../utils/incidents';

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

  it('exports only validated image records with officer labels', () => {
    const dataset = buildTrainingDataset([
      {
        id: 'validated-1',
        hazardCategory: 'PPE Assessment',
        subTypes: ['No Safety Helmet'],
        validationStatus: 'Validated',
        isTrainingDatasetCandidate: true,
        imageData: '/9j/4AAQ',
        description: 'Officer note',
        classifiedBy: 'officer@hazora.com',
        location: 'North Plant',
        timestamp: '2026-10-03T10:00:00.000Z',
      },
      {
        id: 'pending-1',
        validationStatus: 'Pending Validation',
        isTrainingDatasetCandidate: true,
        imageData: '/9j/4AAQ',
      },
      {
        id: 'no-image-1',
        validationStatus: 'Validated',
        isTrainingDatasetCandidate: true,
      },
    ]);

    expect(dataset).toHaveLength(1);
    expect(dataset[0]).toMatchObject({
      id: 'validated-1',
      category: 'PPE Assessment',
      subTypes: ['No Safety Helmet'],
      imageData: 'data:image/jpeg;base64,/9j/4AAQ',
      notes: 'Officer note',
      classifiedBy: 'officer@hazora.com',
      location: 'North Plant',
    });
  });
});

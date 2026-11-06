import { afterEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn((_db, collectionName, incidentId) => `${collectionName}/${incidentId}`),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  setDoc: vi.fn().mockResolvedValue(undefined),
  timestampFromDate: vi.fn((date) => ({ toDate: () => date })),
}));

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: firestoreMocks.timestampFromDate },
  collection: vi.fn(),
  doc: firestoreMocks.doc,
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: firestoreMocks.serverTimestamp,
  setDoc: firestoreMocks.setDoc,
  where: vi.fn(),
}));

import { createIncidentReport } from '../utils/incidents';

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('createIncidentReport', () => {
  it('preserves a supplied capture time in the incident and Firestore document', async () => {
    const capturedAt = '2026-11-06T11:04:00+08:00';

    const incident = await createIncidentReport({
      hazardType: 'Scaffolding detection',
      description: 'Scaffolding detection counts',
      cameraSource: '192.168.55.122',
      severity: 'low',
      capturedAt,
      detectionCounts: { standardScaffoldingBase: 6, noBase: 0 },
    });

    expect(incident.timestamp).toBe('2026-11-06T03:04:00.000Z');
    expect(incident.time).toBe(new Date(capturedAt).toLocaleTimeString());
    expect(firestoreMocks.timestampFromDate).toHaveBeenCalledWith(new Date(capturedAt));
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      `incidents/${incident.id}`,
      expect.objectContaining({
        timestamp: expect.objectContaining({ toDate: expect.any(Function) }),
        createdAt: 'server-timestamp',
        detectionCounts: { standardScaffoldingBase: 6, noBase: 0 },
      }),
    );
  });

  it('rejects an invalid capture time before saving the incident', async () => {
    await expect(createIncidentReport({
      hazardType: 'Scaffolding detection',
      capturedAt: 'not-a-date',
    })).rejects.toThrow('capturedAt must be a valid Date or date string');

    expect(localStorage.getItem('hazora_incidents')).toBeNull();
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });

  it('does not report success or cache the record when a required Firestore write fails', async () => {
    firestoreMocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(createIncidentReport({
      hazardType: 'Protruding hazard detection',
      capturedAt: '2026-11-06T10:32:00+08:00',
      requireFirestore: true,
    })).rejects.toThrow('Could not save this capture to Firestore');

    expect(localStorage.getItem('hazora_incidents')).toBeNull();
  });
});

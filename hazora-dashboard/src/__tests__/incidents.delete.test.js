import { afterEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, collectionName, incidentId) => `${collectionName}/${incidentId}`),
  getDocs: vi.fn(),
  query: vi.fn((collectionRef, filters) => ({ collectionRef, filters })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
}));

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: firestoreMocks.deleteDoc,
  doc: firestoreMocks.doc,
  getDocs: firestoreMocks.getDocs,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: firestoreMocks.query,
  serverTimestamp: vi.fn(),
  where: firestoreMocks.where,
}));

import { deleteIncident } from '../utils/incidents';

const storedIncident = { id: 'incident-1', hazardType: 'Missing helmet' };

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('deleteIncident', () => {
  it('removes the local incident even when Firestore deletion fails', async () => {
    localStorage.setItem('hazora_incidents', JSON.stringify([storedIncident]));
    firestoreMocks.deleteDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(deleteIncident(storedIncident.id)).resolves.toBeUndefined();
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('incidents/incident-1');
    expect(JSON.parse(localStorage.getItem('hazora_incidents'))).toEqual([]);
  });

  it('removes the local incident after Firestore confirms deletion', async () => {
    localStorage.setItem('hazora_incidents', JSON.stringify([storedIncident]));
    firestoreMocks.deleteDoc.mockResolvedValueOnce();

    await deleteIncident(storedIncident.id);

    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('incidents/incident-1');
    expect(JSON.parse(localStorage.getItem('hazora_incidents'))).toEqual([]);
  });

  it('finds the matching Firestore record by the incident id field when the document id differs', async () => {
    localStorage.setItem('hazora_incidents', JSON.stringify([storedIncident]));
    firestoreMocks.deleteDoc.mockResolvedValueOnce();
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'firestoreDoc-123',
        data: () => ({ id: storedIncident.id }),
        ref: { id: 'firestoreDoc-123' },
      }],
    });

    await deleteIncident(storedIncident.id);

    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledTimes(2);
    expect(firestoreMocks.deleteDoc).toHaveBeenLastCalledWith({ id: 'firestoreDoc-123' });
    expect(JSON.parse(localStorage.getItem('hazora_incidents'))).toEqual([]);
  });
});

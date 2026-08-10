import { jsPDF } from 'jspdf';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const INCIDENTS_KEY = 'hazora_incidents';
export const INCIDENTS_UPDATED_EVENT = 'hazora_incidents_updated';

function readStoredIncidents() {
  try {
    const stored = localStorage.getItem(INCIDENTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredIncidents(incidents) {
  try {
    localStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents));
    window.dispatchEvent(new Event(INCIDENTS_UPDATED_EVENT));
  } catch {
    // localStorage unavailable
  }
}

export function getIncidents() {
  return readStoredIncidents();
}

export async function createIncidentReport({
  userId,
  hazardType,
  cameraSource,
  severity = 'high',
  detectedWorkers = 0,
  helmets = 0,
  noHelmets = 0,
}) {
  const now = new Date();
  const incident = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    hazardType,
    cameraSource,
    severity,
    detectedWorkers,
    helmets,
    noHelmets,
  };

  const incidents = [incident, ...readStoredIncidents()].slice(0, 500);
  writeStoredIncidents(incidents);

  if (userId) {
    try {
      await addDoc(collection(db, 'users', userId, 'incidents'), {
        ...incident,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to save incident to Firestore:', err.message);
    }
  }

  return incident;
}

export function subscribeToIncidents(userId, onIncidents) {
  if (!userId) {
    onIncidents(readStoredIncidents());
    return () => {};
  }

  const incidentsQuery = query(
    collection(db, 'users', userId, 'incidents'),
    orderBy('createdAt', 'desc'),
    limit(500)
  );

  return onSnapshot(
    incidentsQuery,
    (snapshot) => {
      const incidents = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      writeStoredIncidents(incidents);
      onIncidents(incidents);
    },
    (err) => {
      console.warn('Incidents listener error:', err.message);
      onIncidents(readStoredIncidents());
    }
  );
}

export function filterIncidentsByPeriod(incidents, period) {
  const now = Date.now();
  const ranges = {
    'Last 24 Hours': 24 * 60 * 60 * 1000,
    'Last 7 Days': 7 * 24 * 60 * 60 * 1000,
    'Last 30 Days': 30 * 24 * 60 * 60 * 1000,
    'Last 90 Days': 90 * 24 * 60 * 60 * 1000,
  };
  const maxAge = ranges[period] || ranges['Last 24 Hours'];

  return incidents.filter((incident) => {
    const time = new Date(incident.timestamp).getTime();
    return Number.isFinite(time) && now - time <= maxAge;
  });
}

export function buildIncidentCsv(incidents) {
  const rows = [
    ['Date', 'Time', 'Hazard Type', 'Camera Source', 'Severity', 'Workers', 'Helmet', 'No Helmet'],
    ...incidents.map((incident) => [
      incident.date,
      incident.time,
      incident.hazardType,
      incident.cameraSource,
      incident.severity,
      incident.detectedWorkers || 0,
      incident.helmets || 0,
      incident.noHelmets || 0,
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function buildIncidentPdf(incidents, title = 'Hazora Safety Report') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  const lineHeight = 18;

  doc.setFontSize(18);
  doc.setTextColor(20, 34, 52);
  doc.text(title, margin, margin);

  doc.setFontSize(10);
  doc.setTextColor(70, 80, 90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 20);

  let y = margin + 42;
  doc.setDrawColor(230, 233, 238);
  doc.setFillColor(245, 248, 252);
  doc.rect(margin, y - 10, pageWidth - margin * 2, 22, 'F');
  doc.setTextColor(40, 50, 60);
  doc.text('Date', margin + 10, y + 4);
  doc.text('Time', margin + 90, y + 4);
  doc.text('Hazard', margin + 150, y + 4);
  doc.text('Camera', margin + 260, y + 4);
  doc.text('Severity', margin + 410, y + 4);
  y += 18;

  const rows = incidents.length > 0 ? incidents : [{
    date: 'N/A',
    time: 'N/A',
    hazardType: 'No incidents',
    cameraSource: 'N/A',
    severity: 'info',
  }];

  rows.forEach((incident) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(String(incident.date || 'N/A'), margin + 10, y + 10);
    doc.text(String(incident.time || 'N/A'), margin + 90, y + 10);
    doc.text(String(incident.hazardType || 'N/A'), margin + 150, y + 10);
    doc.text(String(incident.cameraSource || 'N/A'), margin + 260, y + 10);
    doc.text(String(incident.severity || 'N/A'), margin + 410, y + 10);
    y += lineHeight;
  });

  return doc;
}

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

export function normalizeIncident(incident) {
  const timestamp = incident.timestamp || incident.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();
  const hazardType = incident.hazardType || 'Unknown hazard';
  const severity = ['low', 'medium', 'high', 'critical'].includes(incident.severity)
    ? incident.severity
    : 'medium';

  return {
    ...incident,
    timestamp,
    date: incident.date || new Date(timestamp).toLocaleDateString(),
    time: incident.time || new Date(timestamp).toLocaleTimeString(),
    hazardType,
    hazardCode: incident.hazardCode || hazardType.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    description: incident.description || `${hazardType} detected at ${incident.cameraSource || 'unknown camera'}.`,
    severity,
    status: incident.status || 'open',
    detectionConfidence: Number(incident.detectionConfidence) || 0,
    detectedWorkers: Number(incident.detectedWorkers) || 0,
    helmets: Number(incident.helmets) || 0,
    noHelmets: Number(incident.noHelmets) || 0,
  };
}

export async function createIncidentReport({
  userId,
  hazardType,
  hazardCode,
  description,
  cameraSource,
  severity = 'medium',
  detectionConfidence = 0,
  status = 'open',
  model = 'unknown',
  detectedWorkers = 0,
  helmets = 0,
  noHelmets = 0,
}) {
  const now = new Date();
  const incident = normalizeIncident({
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    hazardType,
    hazardCode,
    description,
    cameraSource,
    severity,
    detectionConfidence,
    status,
    model,
    detectedWorkers,
    helmets,
    noHelmets,
  });

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
      const incidents = snapshot.docs.map((doc) => normalizeIncident({ id: doc.id, ...doc.data() }));
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

  return incidents.map(normalizeIncident).filter((incident) => {
    const time = new Date(incident.timestamp).getTime();
    return Number.isFinite(time) && now - time <= maxAge;
  });
}

export function filterIncidentsByMonthYear(incidents, monthYear) {
  if (!monthYear) return incidents.map(normalizeIncident);

  return incidents.map(normalizeIncident).filter((incident) => {
    const date = new Date(incident.timestamp);
    return Number.isFinite(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === monthYear;
  });
}

export function buildIncidentCsv(incidents) {
  const rows = [
    ['Date', 'Time', 'Hazard Type', 'Description', 'Camera Source', 'Severity', 'Status', 'Confidence', 'Workers', 'Helmet', 'No Helmet', 'Detection Model'],
    ...incidents.map((incident) => [
      incident.date,
      incident.time,
      incident.hazardType,
      incident.description || '',
      incident.cameraSource,
      incident.severity,
      incident.status || 'open',
      incident.detectionConfidence ? `${Math.round(incident.detectionConfidence * 100)}%` : 'N/A',
      incident.detectedWorkers || 0,
      incident.helmets || 0,
      incident.noHelmets || 0,
      incident.model || 'unknown',
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function buildIncidentPdf(incidents, title = 'Hazora Safety Report') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  doc.setFontSize(18);
  doc.setTextColor(20, 34, 52);
  doc.text(title, margin, margin);

  doc.setFontSize(10);
  doc.setTextColor(70, 80, 90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 20);

  const reportRows = incidents.map(normalizeIncident);
  const totalWorkers = reportRows.reduce((sum, incident) => sum + incident.detectedWorkers, 0);
  const highRiskCount = reportRows.filter((incident) => ['high', 'critical'].includes(incident.severity)).length;
  const severityCounts = reportRows.reduce((counts, incident) => {
    counts[incident.severity] = (counts[incident.severity] || 0) + 1;
    return counts;
  }, {});
  const hazardCounts = reportRows.reduce((counts, incident) => {
    counts[incident.hazardType] = (counts[incident.hazardType] || 0) + 1;
    return counts;
  }, {});

  let y = margin + 48;
  doc.setFontSize(11);
  doc.setTextColor(30, 42, 55);
  doc.setFont(undefined, 'bold');
  doc.text('Safety snapshot', margin, y);
  doc.setFont(undefined, 'normal');
  y += 12;

  const cardGap = 8;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cards = [
    ['Total incidents', reportRows.length],
    ['High-risk incidents', highRiskCount],
    ['Workers observed', totalWorkers],
  ];
  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + cardGap);
    doc.setFillColor(245, 248, 252);
    doc.setDrawColor(225, 230, 236);
    doc.roundedRect(x, y, cardWidth, 42, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(80, 90, 100);
    doc.text(label, x + 9, y + 15);
    doc.setFontSize(16);
    doc.setTextColor(20, 34, 52);
    doc.setFont(undefined, 'bold');
    doc.text(String(value), x + 9, y + 34);
    doc.setFont(undefined, 'normal');
  });
  y += 58;

  doc.setFontSize(10);
  doc.setTextColor(30, 42, 55);
  doc.setFont(undefined, 'bold');
  doc.text('Severity distribution', margin, y);
  doc.text('Top hazards', margin + contentWidth / 2, y);
  doc.setFont(undefined, 'normal');
  y += 12;

  const chartWidth = contentWidth / 2 - 12;
  const severityColors = { critical: [190, 45, 45], high: [220, 105, 40], medium: [220, 160, 40], low: [65, 145, 90] };
  ['critical', 'high', 'medium', 'low'].forEach((severity, index) => {
    const rowY = y + index * 18;
    const count = severityCounts[severity] || 0;
    const barWidth = reportRows.length ? (count / reportRows.length) * chartWidth : 0;
    const color = severityColors[severity];
    doc.setFontSize(8);
    doc.setTextColor(80, 90, 100);
    doc.text(severity, margin, rowY + 9);
    doc.setFillColor(235, 238, 242);
    doc.roundedRect(margin + 52, rowY, chartWidth - 30, 10, 3, 3, 'F');
    doc.setFillColor(...color);
    if (barWidth > 0) doc.roundedRect(margin + 52, rowY, Math.max(5, barWidth - 30), 10, 3, 3, 'F');
    doc.text(String(count), margin + chartWidth - 8, rowY + 9);
  });

  const topHazards = Object.entries(hazardCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxHazardCount = topHazards[0]?.[1] || 1;
  topHazards.forEach(([hazard, count], index) => {
    const rowY = y + index * 18;
    const label = hazard.length > 22 ? `${hazard.slice(0, 21)}...` : hazard;
    doc.setFontSize(8);
    doc.setTextColor(80, 90, 100);
    doc.text(label, margin + contentWidth / 2, rowY + 9);
    doc.setFillColor(235, 238, 242);
    doc.roundedRect(margin + contentWidth / 2 + 92, rowY, chartWidth - 92, 10, 3, 3, 'F');
    doc.setFillColor(55, 115, 170);
    doc.roundedRect(margin + contentWidth / 2 + 92, rowY, Math.max(5, (count / maxHazardCount) * (chartWidth - 92)), 10, 3, 3, 'F');
    doc.text(String(count), margin + contentWidth - 8, rowY + 9);
  });
  y += 88;

  doc.setFontSize(11);
  doc.setTextColor(30, 42, 55);
  doc.setFont(undefined, 'bold');
  doc.text('Incident details', margin, y);
  doc.setFont(undefined, 'normal');
  y += 14;

  const rows = reportRows.length > 0 ? reportRows : [{
    date: 'N/A',
    time: 'N/A',
    hazardType: 'No incidents',
    cameraSource: 'N/A',
    severity: 'info',
  }];

  rows.forEach((incident, index) => {
    const normalized = normalizeIncident(incident);
    const descriptionLines = doc.splitTextToSize(normalized.description, contentWidth - 20);
    const rowHeight = 76 + Math.max(0, descriptionLines.length - 1) * 11;

    if (y + rowHeight > 800) {
      doc.addPage();
      y = margin;
    }

    doc.setFillColor(index % 2 === 0 ? 248 : 255, 250, 252);
    doc.setDrawColor(225, 230, 236);
    doc.roundedRect(margin, y, contentWidth, rowHeight - 8, 4, 4, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(30, 42, 55);
    doc.setFont(undefined, 'bold');
    doc.text(`${normalized.hazardType} | ${normalized.severity.toUpperCase()}`, margin + 10, y + 16);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(65, 75, 86);
    doc.text(`${normalized.date} ${normalized.time}  |  Camera: ${normalized.cameraSource || 'N/A'}`, margin + 10, y + 31);
    doc.text(`Status: ${normalized.status}  |  Confidence: ${normalized.detectionConfidence ? `${Math.round(normalized.detectionConfidence * 100)}%` : 'N/A'}  |  Model: ${normalized.model || 'unknown'}`, margin + 10, y + 45);
    doc.setTextColor(45, 55, 65);
    doc.text(descriptionLines, margin + 10, y + 60);
    y += rowHeight;
  });

  return doc;
}

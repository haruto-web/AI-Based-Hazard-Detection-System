import { jsPDF } from 'jspdf';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { computeReportSummary, computePpeBreakdown } from './analytics';

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

// Convert a raw Firestore timestamp (Firebase Timestamp, ISO string, or
// serverTimestamp placeholder) into an ISO string.
function toIsoTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

// Normalize an incident from EITHER the website's own schema OR the mobile
// app's schema so the dashboard, reports, and gallery read consistent fields.
// App fields: location, confidence, prevention, capitalized status, timestamp.
// Website fields: site, detectionConfidence, precautions, lowercase status.
export function normalizeIncident(incident) {
  const timestamp =
    toIsoTimestamp(incident.timestamp) ||
    toIsoTimestamp(incident.createdAt) ||
    new Date().toISOString();

  const hazardType = incident.hazardType || 'Unknown hazard';

  const severity = ['low', 'medium', 'high', 'critical'].includes(String(incident.severity).toLowerCase())
    ? String(incident.severity).toLowerCase()
    : 'medium';

  // Map both status conventions to the website's lowercase set.
  const statusMap = { new: 'open', open: 'open', acknowledged: 'acknowledged', resolved: 'resolved', done: 'resolved' };
  const status = statusMap[String(incident.status || 'open').toLowerCase()] || 'open';

  // Confidence: app stores "confidence" (0..1 or 0..100), website stores
  // "detectionConfidence" (0..1). Normalize everything to 0..1.
  let confidence = Number(incident.detectionConfidence);
  if (!Number.isFinite(confidence) || confidence === 0) {
    confidence = Number(incident.confidence) || 0;
  }
  if (confidence > 1) confidence = confidence / 100;

  // Site: website uses "site", app uses "location".
  const site = incident.site || incident.location || '';

  // Recommended action: website uses "precautions", app uses "prevention".
  const precautions = incident.precautions || incident.prevention || '';

  // App incidents don't carry per-item PPE counts; derive them from the hazard
  // type so the PPE-breakdown/compliance charts still populate. e.g. a
  // "Missing Safety Helmet" incident counts as 1 missing helmet.
  const hazardLc = hazardType.toLowerCase();
  const hasExplicitCounts =
    incident.helmets != null || incident.noHelmets != null ||
    incident.vests != null || incident.noVests != null ||
    incident.shoes != null || incident.noShoes != null;

  let helmets = Number(incident.helmets) || 0;
  let noHelmets = Number(incident.noHelmets) || 0;
  let vests = Number(incident.vests) || 0;
  let noVests = Number(incident.noVests) || 0;
  let shoes = Number(incident.shoes) || 0;
  let noShoes = Number(incident.noShoes) || 0;

  if (!hasExplicitCounts) {
    const missing = hazardLc.includes('no ') || hazardLc.includes('missing') || hazardLc.includes('without');
    if (hazardLc.includes('helmet') || hazardLc.includes('hard hat')) {
      if (missing) noHelmets = 1; else helmets = 1;
    }
    if (hazardLc.includes('vest')) {
      if (missing) noVests = 1; else vests = 1;
    }
    if (hazardLc.includes('shoe') || hazardLc.includes('boot')) {
      if (missing) noShoes = 1; else shoes = 1;
    }
  }

  return {
    ...incident,
    timestamp,
    date: incident.date || new Date(timestamp).toLocaleDateString(),
    time: incident.time || new Date(timestamp).toLocaleTimeString(),
    hazardType,
    hazardCode: incident.hazardCode || hazardType.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    description: incident.description || `${hazardType} detected at ${incident.cameraSource || 'unknown camera'}.`,
    precautions,
    severity,
    status,
    detectionConfidence: confidence,
    // A single app detection represents at least one worker observed.
    detectedWorkers: Number(incident.detectedWorkers) || (incident.hazardType ? 1 : 0),
    helmets,
    noHelmets,
    vests,
    noVests,
    shoes,
    noShoes,
    compliant: Number(incident.compliant) || 0,
    imageData: incident.imageData || '',
    faceData: incident.faceData || '',
    site,
  };
}

export async function createIncidentReport({
  userId,
  hazardType,
  hazardCode,
  description,
  precautions,
  cameraSource,
  severity = 'medium',
  detectionConfidence = 0,
  status = 'open',
  model = 'unknown',
  detectedWorkers = 0,
  helmets = 0,
  noHelmets = 0,
  vests = 0,
  noVests = 0,
  shoes = 0,
  noShoes = 0,
  compliant = 0,
  imageData = '',
  faceData = '',
  site = '',
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
    precautions,
    cameraSource,
    severity,
    detectionConfidence,
    status,
    model,
    detectedWorkers,
    helmets,
    noHelmets,
    vests,
    noVests,
    shoes,
    noShoes,
    compliant,
    imageData,
    faceData,
    site,
  });

  const incidents = [incident, ...readStoredIncidents()].slice(0, 500);
  writeStoredIncidents(incidents);

  // Write to the shared top-level "incidents" collection so the website's
  // live-stream captures land in the same place the mobile app writes to, and
  // both platforms see one unified incident feed.
  // Also emit the mobile app's field names/conventions so app screens render
  // website-generated incidents correctly (shared collection, one feed).
  const appStatus = { open: 'New', acknowledged: 'Acknowledged', resolved: 'Resolved' }[incident.status] || 'New';

  try {
    await addDoc(collection(db, 'incidents'), {
      ...incident,
      userId: userId || incident.userId || null,
      // App-compatible aliases.
      status: appStatus,
      location: incident.site || '',
      prevention: incident.precautions || '',
      confidence: incident.detectionConfidence || 0,
      // Store the app-compatible timestamp too so ordering works across both.
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to save incident to Firestore:', err.message);
  }

  return incident;
}

export const INCIDENT_STATUSES = ['open', 'acknowledged', 'resolved'];

// Update an incident's workflow status locally and (if signed in) in Firestore.
export async function updateIncidentStatus(userId, incidentId, status) {
  if (!INCIDENT_STATUSES.includes(status)) return;

  const incidents = readStoredIncidents().map((incident) =>
    incident.id === incidentId ? { ...incident, status } : incident
  );
  writeStoredIncidents(incidents);

  // Write the mobile app's capitalized status convention so the app's incident
  // list (which filters on "New"/"Acknowledged"/"Resolved") stays in sync.
  const appStatus = { open: 'New', acknowledged: 'Acknowledged', resolved: 'Resolved' }[status] || 'New';

  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'incidents', incidentId), { status: appStatus });
  } catch (err) {
    console.warn('Failed to update incident status in Firestore:', err.message);
  }
}

// Permanently delete an incident locally and from the shared Firestore
// "incidents" collection.
export async function deleteIncident(incidentId) {
  if (!incidentId) return;

  const incidents = readStoredIncidents().filter((incident) => incident.id !== incidentId);
  writeStoredIncidents(incidents);

  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'incidents', incidentId));
  } catch (err) {
    console.warn('Failed to delete incident from Firestore:', err.message);
  }
}

export function subscribeToIncidents(userId, onIncidents) {
  // Read from the shared top-level "incidents" collection (same place the
  // mobile app writes). Ordered by "timestamp" since both platforms set it.
  const incidentsQuery = query(
    collection(db, 'incidents'),
    orderBy('timestamp', 'desc'),
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

export function filterIncidentsByPeriod(incidents, period, endDate = new Date()) {
  const endTime = endDate instanceof Date
    ? endDate.getTime()
    : new Date(`${endDate}T23:59:59`).getTime();
  const ranges = {
    'Last 24 Hours': 24 * 60 * 60 * 1000,
    'Last 7 Days': 7 * 24 * 60 * 60 * 1000,
    'Last 30 Days': 30 * 24 * 60 * 60 * 1000,
    'Last 90 Days': 90 * 24 * 60 * 60 * 1000,
  };
  const maxAge = ranges[period] || ranges['Last 24 Hours'];

  return incidents.map(normalizeIncident).filter((incident) => {
    const time = new Date(incident.timestamp).getTime();
    return Number.isFinite(time) && Number.isFinite(endTime) && endTime - time <= maxAge && time <= endTime;
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
    ['Date', 'Time', 'Hazard Type', 'Description', 'Recommended Action', 'Camera Source', 'Severity', 'Status', 'Confidence', 'Workers', 'Compliant', 'Helmet', 'No Helmet', 'Vest', 'No Vest', 'Shoes', 'No Shoes', 'Detection Model'],
    ...incidents.map((incident) => [
      incident.date,
      incident.time,
      incident.hazardType,
      incident.description || '',
      incident.precautions || '',
      incident.cameraSource,
      incident.severity,
      incident.status || 'open',
      incident.detectionConfidence ? `${Math.round(incident.detectionConfidence * 100)}%` : 'N/A',
      incident.detectedWorkers || 0,
      incident.compliant || 0,
      incident.helmets || 0,
      incident.noHelmets || 0,
      incident.vests || 0,
      incident.noVests || 0,
      incident.shoes || 0,
      incident.noShoes || 0,
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
  const summary = computeReportSummary(reportRows);
  const ppeBreakdown = computePpeBreakdown(reportRows);
  const totalWorkers = summary.totalWorkers;
  const highRiskCount = summary.highRisk;
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
    ['PPE compliance', `${summary.overallCompliance.toFixed(0)}%`],
    ['Workers observed', totalWorkers],
    ['High-risk incidents', highRiskCount],
    ['Avg confidence', `${Math.round(summary.avgConfidence * 100)}%`],
    ['Resolved', summary.resolved],
  ];
  cards.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (cardWidth + cardGap);
    const cardY = y + row * 50;
    doc.setFillColor(245, 248, 252);
    doc.setDrawColor(225, 230, 236);
    doc.roundedRect(x, cardY, cardWidth, 42, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(80, 90, 100);
    doc.text(label, x + 9, cardY + 15);
    doc.setFontSize(16);
    doc.setTextColor(20, 34, 52);
    doc.setFont(undefined, 'bold');
    doc.text(String(value), x + 9, cardY + 34);
    doc.setFont(undefined, 'normal');
  });
  y += 50 * Math.ceil(cards.length / 3) + 12;

  // PPE compliance breakdown per item.
  doc.setFontSize(11);
  doc.setTextColor(30, 42, 55);
  doc.setFont(undefined, 'bold');
  doc.text('PPE compliance by item', margin, y);
  doc.setFont(undefined, 'normal');
  y += 14;

  const ppeBarWidth = contentWidth - 150;
  ppeBreakdown.forEach((item, index) => {
    const rowY = y + index * 20;
    const pct = item.complianceRate;
    doc.setFontSize(9);
    doc.setTextColor(50, 60, 70);
    doc.text(item.item, margin, rowY + 9);
    doc.setFillColor(235, 238, 242);
    doc.roundedRect(margin + 60, rowY, ppeBarWidth, 11, 3, 3, 'F');
    const fillColor = pct >= 80 ? [65, 145, 90] : pct >= 50 ? [220, 160, 40] : [200, 60, 45];
    doc.setFillColor(...fillColor);
    if (pct > 0) doc.roundedRect(margin + 60, rowY, Math.max(4, (pct / 100) * ppeBarWidth), 11, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setTextColor(70, 80, 90);
    doc.text(`${pct.toFixed(0)}%  (${item.present} worn / ${item.missing} missing)`, margin + 60 + ppeBarWidth + 6, rowY + 9);
  });
  y += ppeBreakdown.length * 20 + 16;

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
    const actionText = normalized.precautions ? `Recommended action: ${normalized.precautions}` : '';
    const actionLines = actionText ? doc.splitTextToSize(actionText, contentWidth - 20) : [];
    const rowHeight = 76 + Math.max(0, descriptionLines.length - 1) * 11 + (actionLines.length ? actionLines.length * 11 + 4 : 0);

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
    if (actionLines.length) {
      const actionY = y + 60 + descriptionLines.length * 11 + 4;
      doc.setTextColor(150, 70, 20);
      doc.text(actionLines, margin + 10, actionY);
    }
    y += rowHeight;
  });

  return doc;
}

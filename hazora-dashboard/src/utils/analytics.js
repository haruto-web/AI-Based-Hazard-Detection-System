// Analytics computations over a list of normalized incidents. Kept pure so both
// the dashboard and the reports page (and PDF/CSV builders) can share them.

const PPE_ITEMS = [
  { key: 'Helmet', present: 'helmets', missing: 'noHelmets' },
  { key: 'Vest', present: 'vests', missing: 'noVests' },
  { key: 'Shoes', present: 'shoes', missing: 'noShoes' },
];

function sum(incidents, field) {
  return incidents.reduce((total, incident) => total + (Number(incident[field]) || 0), 0);
}

// Per-item present/missing counts and compliance percentage.
export function computePpeBreakdown(incidents) {
  return PPE_ITEMS.map(({ key, present, missing }) => {
    const presentCount = sum(incidents, present);
    const missingCount = sum(incidents, missing);
    const base = presentCount + missingCount;
    const complianceRate = base > 0 ? (presentCount / base) * 100 : 0;
    return { item: key, present: presentCount, missing: missingCount, total: base, complianceRate };
  });
}

// Overall compliance across all three PPE items.
export function computeOverallCompliance(incidents) {
  const present = sum(incidents, 'helmets') + sum(incidents, 'vests') + sum(incidents, 'shoes');
  const missing = sum(incidents, 'noHelmets') + sum(incidents, 'noVests') + sum(incidents, 'noShoes');
  const base = present + missing;
  return {
    present,
    missing,
    complianceRate: base > 0 ? (present / base) * 100 : 0,
  };
}

// Compliance rate per day (chronological) for a trend line.
export function computeComplianceTrend(incidents) {
  const byDate = {};
  incidents.forEach((incident) => {
    const key = incident.date;
    if (!byDate[key]) byDate[key] = { present: 0, missing: 0, incidents: 0 };
    byDate[key].present += (incident.helmets || 0) + (incident.vests || 0) + (incident.shoes || 0);
    byDate[key].missing += (incident.noHelmets || 0) + (incident.noVests || 0) + (incident.noShoes || 0);
    byDate[key].incidents += 1;
  });

  return Object.entries(byDate)
    .map(([date, data]) => {
      const base = data.present + data.missing;
      return {
        date,
        complianceRate: base > 0 ? Math.round((data.present / base) * 100) : 0,
        incidents: data.incidents,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Violations grouped by camera/location so the worst zones stand out.
export function computeByCamera(incidents) {
  const byCamera = {};
  incidents.forEach((incident) => {
    const key = incident.cameraSource || 'Unknown camera';
    if (!byCamera[key]) byCamera[key] = { camera: key, incidents: 0, workers: 0 };
    byCamera[key].incidents += 1;
    byCamera[key].workers += incident.detectedWorkers || 0;
  });
  return Object.values(byCamera).sort((a, b) => b.incidents - a.incidents);
}

// Violations by hour of day (0-23) to reveal peak-risk times.
export function computeByHour(incidents) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  incidents.forEach((incident) => {
    const hour = new Date(incident.timestamp).getHours();
    if (Number.isFinite(hour)) buckets[hour].count += 1;
  });
  return buckets;
}

// A single summary object used across dashboard cards, PDF, and CSV.
export function computeReportSummary(incidents) {
  const overall = computeOverallCompliance(incidents);
  const breakdown = computePpeBreakdown(incidents);
  const totalWorkers = sum(incidents, 'detectedWorkers');
  const totalCompliant = sum(incidents, 'compliant');
  const highRisk = incidents.filter((i) => ['high', 'critical'].includes(i.severity)).length;
  const open = incidents.filter((i) => (i.status || 'open') === 'open').length;
  const resolved = incidents.filter((i) => i.status === 'resolved').length;

  const avgConfidence = incidents.length
    ? incidents.reduce((s, i) => s + (i.detectionConfidence || 0), 0) / incidents.length
    : 0;

  const hazardCounts = incidents.reduce((counts, i) => {
    counts[i.hazardType] = (counts[i.hazardType] || 0) + 1;
    return counts;
  }, {});
  const topHazard = Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  const worstItem = [...breakdown].sort((a, b) => a.complianceRate - b.complianceRate)[0];

  return {
    totalIncidents: incidents.length,
    totalWorkers,
    totalCompliant,
    highRisk,
    open,
    resolved,
    overallCompliance: overall.complianceRate,
    avgConfidence,
    topHazard,
    breakdown,
    worstItem,
  };
}

import { describe, expect, it } from 'vitest';
import {
  computePpeBreakdown,
  computeOverallCompliance,
  computeComplianceTrend,
  computeByCamera,
  computeByHour,
  computeReportSummary,
} from '../utils/analytics';

const incidents = [
  {
    date: '1/1/2026',
    timestamp: '2026-01-01T09:00:00.000Z',
    cameraSource: '192.168.1.10',
    severity: 'high',
    status: 'open',
    detectedWorkers: 4,
    compliant: 1,
    helmets: 3, noHelmets: 1,
    vests: 2, noVests: 2,
    shoes: 4, noShoes: 0,
    detectionConfidence: 0.8,
    hazardType: 'Missing Hard Hat',
  },
  {
    date: '1/2/2026',
    timestamp: '2026-01-02T14:00:00.000Z',
    cameraSource: '192.168.1.11',
    severity: 'medium',
    status: 'resolved',
    detectedWorkers: 2,
    compliant: 2,
    helmets: 2, noHelmets: 0,
    vests: 2, noVests: 0,
    shoes: 2, noShoes: 0,
    detectionConfidence: 0.6,
    hazardType: 'Missing Safety Vest',
  },
];

describe('analytics', () => {
  it('computes per-item PPE breakdown with compliance rates', () => {
    const breakdown = computePpeBreakdown(incidents);
    const helmet = breakdown.find((b) => b.item === 'Helmet');
    expect(helmet.present).toBe(5);
    expect(helmet.missing).toBe(1);
    expect(Math.round(helmet.complianceRate)).toBe(83);
  });

  it('computes overall compliance across all items', () => {
    const overall = computeOverallCompliance(incidents);
    // present = 3+2+2+2+4+2 = 15, missing = 1+2 = 3 -> 15/18 = 83.3%
    expect(Math.round(overall.complianceRate)).toBe(83);
  });

  it('builds a chronological compliance trend', () => {
    const trend = computeComplianceTrend(incidents);
    expect(trend).toHaveLength(2);
    expect(trend[0].date).toBe('1/1/2026');
    expect(trend[1].complianceRate).toBe(100);
  });

  it('aggregates violations by camera sorted by count', () => {
    const byCamera = computeByCamera(incidents);
    expect(byCamera).toHaveLength(2);
    expect(byCamera[0].incidents).toBe(1);
  });

  it('buckets violations by hour of day', () => {
    const byHour = computeByHour(incidents);
    expect(byHour).toHaveLength(24);
    const total = byHour.reduce((s, h) => s + h.count, 0);
    expect(total).toBe(2);
  });

  it('produces a report summary with worst item and resolved count', () => {
    const summary = computeReportSummary(incidents);
    expect(summary.totalIncidents).toBe(2);
    expect(summary.totalWorkers).toBe(6);
    expect(summary.resolved).toBe(1);
    expect(summary.worstItem.item).toBe('Vest');
    expect(Math.round(summary.avgConfidence * 100)).toBe(70);
  });
});

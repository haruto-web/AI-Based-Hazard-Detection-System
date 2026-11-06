import { describe, expect, it } from 'vitest';
import {
  buildHazardReport,
  buildMaterialHandlingHazardReport,
  buildProtrudingHazardReport,
  buildScaffoldingHazardReport,
} from '../AI/LM_detection/hazardDetails';

describe('hazard report descriptions', () => {
  it('describes PPE findings clearly with a camera label and correct counts', () => {
    const report = buildHazardReport({
      item: 'Safety Shoes',
      affectedCount: 1,
      personCount: 2,
      compliantCount: 1,
      cameraSource: '172.20.10.5',
    });

    expect(report.description).toContain(
      'AI identified 1 worker without the required safety shoes. Camera: 172.20.10.5.',
    );
    expect(report.description).toContain(
      'Of the 2 workers identified, 1 is non-compliant and 1 is fully compliant.',
    );
    expect(report.description).not.toContain('on camera');
  });

  it('uses clear wording for scaffolding hazards', () => {
    const report = buildScaffoldingHazardReport({
      affectedCount: 1,
      cameraSource: '172.20.10.5',
    });

    expect(report.description).toContain(
      'AI identified 1 scaffold section without a required base.',
    );
    expect(report.severity).toBe('high');
  });

  it('uses clear wording for protruding-object hazards', () => {
    const report = buildProtrudingHazardReport({
      affectedCount: 1,
      cameraSource: '172.20.10.5',
    });

    expect(report.description).toContain(
      'AI identified 1 unprotected protruding object in the work area.',
    );
    expect(report.severity).toBe('high');
  });

  it('uses clear wording for disorganized material hazards', () => {
    const report = buildMaterialHandlingHazardReport({
      affectedCount: 2,
      cameraSource: '172.20.10.5',
    });

    expect(report.description).toContain(
      'AI identified 2 material-handling areas with disorganized material storage.',
    );
    expect(report.severity).toBe('high');
  });
});

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DetectionViewerContent from '../components/DetectionViewerContent';

function renderDetection(detections) {
  return renderToStaticMarkup(createElement(DetectionViewerContent, {
    canvasRef: { current: null },
    loading: false,
    scaffoldingLoading: false,
    protrudingLoading: false,
    materialLoading: false,
    error: null,
    scaffoldingError: null,
    protrudingError: null,
    materialError: null,
    status: '',
    detections,
    detecting: true,
    activeDetectors: ['ppe', 'scaffolding', 'protruding', 'material'],
    toggleDetection: () => {},
  }));
}

describe('DetectionViewerContent severity colors', () => {
  it('marks confirmed PPE violations as danger and no-worker states as caution', () => {
    const markup = renderDetection({
      persons: 1,
      helmets: 0,
      vests: 1,
      shoes: 1,
      noHelmets: 1,
      noVests: 0,
      noShoes: 0,
      compliant: 0,
      violations: 1,
      scaffoldingClasses: {},
      protrudingClasses: {},
      materialClasses: {},
    });

    expect(markup).toContain('ppe-pill danger');
    expect(markup).toContain('Missing (1)');
    expect(markup).toContain('ppe-pill good');
    expect(markup).toContain('Detected');
    expect(markup).toContain('hazard-box');
  });

  it('marks positive safe labels green and positive hazard labels red', () => {
    const markup = renderDetection({
      persons: 0,
      helmets: 0,
      vests: 0,
      shoes: 0,
      noHelmets: 0,
      noVests: 0,
      noShoes: 0,
      compliant: 0,
      violations: 0,
      scaffoldingClasses: { 'Standard Scaffolding Base': 1, 'No Base': 0 },
      protrudingClasses: { 'Potruding Hazard': 1, 'Safety Cap': 0 },
      materialClasses: { Organized: 1, Messy: 0 },
    });

    expect(markup).toContain('detection-safe');
    expect(markup).toContain('scaffolding-hazard');
    expect(markup).toContain('No workers detected');
  });
});

import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import {
  getAutoBrightnessScale,
  getHelmetRegionFromFace,
  resolveHelmetDecision,
} from '../AI/LM_detection/ppeDetection';

describe('TensorFlow model packages', () => {
  it('loads the installed browser ML dependencies', () => {
    expect(tf).toBeTruthy();
    expect(cocoSsd).toBeTruthy();
    expect(blazeface).toBeTruthy();
    expect(typeof cocoSsd.load).toBe('function');
    expect(typeof blazeface.load).toBe('function');
  });
});

describe('Helmet decision logic', () => {
  it('accepts a helmet when the model is close but color evidence is strong', () => {
    const decision = resolveHelmetDecision({
      helmetScore: 0.71,
      noHelmetScore: 0.29,
      regionStats: { lowerColorScore: 0.24, colorScore: 0.14, darkScore: 0.08 },
      colorFallback: true,
    });

    expect(decision.hasHelmet).toBe(true);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('rejects weak color evidence that can come from background pixels', () => {
    const decision = resolveHelmetDecision({
      helmetScore: 0.42,
      noHelmetScore: 0.58,
      regionStats: { lowerColorScore: 0.12, colorScore: 0.2, darkScore: 0.08 },
      colorFallback: true,
    });

    expect(decision.hasHelmet).toBe(false);
  });

  it('keeps the face helmet crop focused above the face', () => {
    const region = getHelmetRegionFromFace({ topLeft: [100, 100], bottomRight: [140, 160] });

    expect(region.y).toBeCloseTo(65.2);
    expect(region.height).toBeCloseTo(34.8);
  });

  it('dims overexposed frames but leaves normal frames unchanged', () => {
    const brightContext = {
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    };
    const normalContext = {
      getImageData: () => ({ data: new Uint8ClampedArray([120, 120, 120, 255]) }),
    };

    expect(getAutoBrightnessScale(brightContext, 1, 1)).toBeLessThan(1);
    expect(getAutoBrightnessScale(normalContext, 1, 1)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import { resolveHelmetDecision } from '../AI/LM_detection/ppeDetection';

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
});

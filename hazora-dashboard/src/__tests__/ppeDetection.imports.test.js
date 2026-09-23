import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  getAutoBrightnessScale,
  parseYoloOutput,
  groupPpeDetections,
  PPE_LABELS,
} from '../AI/LM_detection/ppeDetection';

describe('TensorFlow model packages', () => {
  it('loads the installed browser ML dependencies', () => {
    expect(tf).toBeTruthy();
    expect(cocoSsd).toBeTruthy();
    expect(typeof cocoSsd.load).toBe('function');
  });
});

describe('YOLOv8 output parsing', () => {
  const channels = 4 + PPE_LABELS.length; // 7

  it('parses a channels-last detection in normalized coordinates', () => {
    // One candidate: center (0.5, 0.5), size (0.2, 0.4), class 0 (helmet) score 0.9
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = 0.9; // Safety Helmet
    values[5] = 0.1; // Safety Vest
    values[6] = 0.05; // Safety Shoes

    const shape = [1, 1, channels];
    const result = parseYoloOutput(values, shape, 100, 100);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Safety Helmet');
    expect(result[0].box.x).toBeCloseTo(40); // (0.5 - 0.1) * 100
    expect(result[0].box.width).toBeCloseTo(20);
  });

  it('drops candidates below the confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = 0.1; // below 0.45 threshold

    const shape = [1, 1, channels];
    expect(parseYoloOutput(values, shape, 100, 100)).toHaveLength(0);
  });
});

describe('PPE grouping', () => {
  it('flags vest and shoes missing when the full body is in frame', () => {
    const detections = [
      { label: 'Safety Helmet', score: 0.9, box: { x: 45, y: 10, width: 10, height: 10 } },
    ];
    // Person fills the whole 100px-tall frame -> feet visible -> shoes required.
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 100 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups).toHaveLength(1);
    expect(groups[0].hasHelmet).toBe(true);
    expect(groups[0].missing).toContain('Safety Vest');
    expect(groups[0].missing).toContain('Safety Shoes');
  });

  it('does NOT require shoes for a headshot where feet are out of frame', () => {
    const detections = [
      { label: 'Safety Helmet', score: 0.9, box: { x: 45, y: 5, width: 10, height: 10 } },
    ];
    // Person occupies only the top 30% of a 100px frame -> no feet, no torso.
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 30 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups).toHaveLength(1);
    expect(groups[0].hasHelmet).toBe(true);
    expect(groups[0].missing).not.toContain('Safety Shoes');
    expect(groups[0].missing).not.toContain('Safety Vest');
    expect(groups[0].missing).toHaveLength(0);
  });

  it('still requires a detected item even if body reach is low', () => {
    const detections = [
      { label: 'Safety Vest', score: 0.8, box: { x: 45, y: 5, width: 10, height: 10 } },
    ];
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 25 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);
    // Vest detected -> vest required and satisfied; helmet still required + missing.
    expect(groups[0].hasVest).toBe(true);
    expect(groups[0].missing).toContain('Safety Helmet');
  });
});

describe('Auto brightness', () => {
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

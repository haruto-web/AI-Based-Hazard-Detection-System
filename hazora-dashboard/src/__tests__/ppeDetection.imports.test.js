import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  getAutoBrightnessScale,
  parseYoloOutput,
  groupPpeDetections,
  createPersonTracker,
  PPE_CLASS_CONFIDENCE_THRESHOLDS,
  PPE_CONFIDENCE_THRESHOLD,
  PPE_DETECTION_GRACE_MS,
  PPE_LABELS,
  stabilizePpeDetections,
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

  it('maps letterboxed model coordinates back to the source frame', () => {
    const values = new Float32Array(channels);
    values[0] = 320;
    values[1] = 320;
    values[2] = 100;
    values[3] = 100;
    values[5] = 0.9;

    const result = parseYoloOutput(
      values,
      [1, channels, 1],
      640,
      480,
      { scaleX: 1, scaleY: 1, padX: 0, padY: 80 }
    );

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Safety Vest');
    expect(result[0].box).toEqual({ x: 270, y: 190, width: 100, height: 100 });
  });

  it('detects pixel coordinates even when the first candidate center is near zero', () => {
    const values = new Float32Array(channels * 2);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = 0.1;
    values[channels] = 320;
    values[channels + 1] = 320;
    values[channels + 2] = 64;
    values[channels + 3] = 64;
    values[channels + 4] = 0.9;

    const result = parseYoloOutput(values, [1, 2, channels], 640, 480);

    expect(result).toHaveLength(1);
    expect(result[0].box).toEqual({ x: 288, y: 216, width: 64, height: 48 });
  });

  it('drops candidates below the confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = 0.1; // below every PPE confidence threshold

    const shape = [1, 1, channels];
    expect(parseYoloOutput(values, shape, 100, 100)).toHaveLength(0);
  });

  it('keeps detections at the configured confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = PPE_CONFIDENCE_THRESHOLD + 0.01;

    const shape = [1, 1, channels];
    const result = parseYoloOutput(values, shape, 100, 100);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(PPE_CONFIDENCE_THRESHOLD + 0.01);
  });

  it('drops detections below the configured confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = PPE_CONFIDENCE_THRESHOLD - 0.01;

    const shape = [1, 1, channels];
    expect(parseYoloOutput(values, shape, 100, 100)).toHaveLength(0);
  });

  it('uses the lower threshold for vests while retaining the helmet threshold', () => {
    const vestValues = new Float32Array(channels);
    vestValues[0] = 0.5;
    vestValues[1] = 0.5;
    vestValues[2] = 0.2;
    vestValues[3] = 0.4;
    vestValues[5] = PPE_CLASS_CONFIDENCE_THRESHOLDS['Safety Vest'];

    const helmetValues = new Float32Array(channels);
    helmetValues[0] = 0.5;
    helmetValues[1] = 0.5;
    helmetValues[2] = 0.2;
    helmetValues[3] = 0.4;
    helmetValues[4] = PPE_CONFIDENCE_THRESHOLD - 0.01;

    expect(parseYoloOutput(vestValues, [1, 1, channels], 100, 100)).toHaveLength(1);
    expect(parseYoloOutput(helmetValues, [1, 1, channels], 100, 100)).toHaveLength(0);
  });
});

describe('PPE grouping', () => {
  it('flags vest and shoes missing when the full body and feet are in frame', () => {
    const detections = [
      { label: 'Safety Helmet', score: 0.9, box: { x: 45, y: 10, width: 10, height: 10 } },
    ];
    // The person reaches the lower frame but is not clipped at its bottom.
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 95 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups).toHaveLength(1);
    expect(groups[0].hasHelmet).toBe(true);
    expect(groups[0].missing).toContain('Safety Vest');
    expect(groups[0].missing).toContain('Safety Shoes');
  });

  it('checks helmet and vest but not shoes in a half-body view', () => {
    const detections = [
      { label: 'Safety Helmet', score: 0.9, box: { x: 45, y: 5, width: 10, height: 10 } },
    ];
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 50 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups[0].hasHelmet).toBe(true);
    expect(groups[0].missing).toContain('Safety Vest');
    expect(groups[0].missing).not.toContain('Safety Shoes');
  });

  it('does not require shoes when the person box is clipped by the frame', () => {
    const detections = [
      { label: 'Safety Helmet', score: 0.9, box: { x: 45, y: 5, width: 10, height: 10 } },
    ];
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 100 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups[0].missing).toContain('Safety Vest');
    expect(groups[0].missing).not.toContain('Safety Shoes');
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

describe('PPE detection stability', () => {
  it('keeps recently detected PPE present across a single missed frame', () => {
    const history = {};
    const first = stabilizePpeDetections({
      persons: 1,
      helmets: 1,
      vests: 1,
      shoes: 0,
      noHelmets: 0,
      noVests: 0,
      noShoes: 0,
    }, history, 'camera-a', 1000);
    const missed = stabilizePpeDetections({
      persons: 1,
      helmets: 0,
      vests: 0,
      shoes: 0,
      noHelmets: 1,
      noVests: 1,
      noShoes: 0,
    }, history, 'camera-a', 3000);

    expect(first.helmets).toBe(1);
    expect(missed.helmets).toBe(1);
    expect(missed.vests).toBe(1);
    expect(missed.noHelmets).toBe(0);
    expect(missed.noVests).toBe(0);
    expect(missed.noShoes).toBe(0);
  });

  it('expires remembered detections after the short grace period', () => {
    const history = {};
    stabilizePpeDetections({
      persons: 1,
      helmets: 1,
      vests: 0,
      shoes: 0,
      noHelmets: 0,
      noVests: 1,
      noShoes: 0,
    }, history, 'camera-a', 1000);
    const expired = stabilizePpeDetections({
      persons: 1,
      helmets: 0,
      vests: 0,
      shoes: 0,
      noHelmets: 1,
      noVests: 1,
      noShoes: 0,
    }, history, 'camera-a', 1000 + PPE_DETECTION_GRACE_MS + 1);

    expect(expired.helmets).toBe(0);
    expect(expired.noHelmets).toBe(1);
    expect(expired.noVests).toBe(1);
  });

  it('keeps detection history isolated per camera', () => {
    const history = {};
    stabilizePpeDetections({
      persons: 1,
      helmets: 1,
      vests: 0,
      shoes: 0,
      noHelmets: 0,
      noVests: 1,
      noShoes: 0,
    }, history, 'camera-a', 1000);
    const otherCamera = stabilizePpeDetections({
      persons: 1,
      helmets: 0,
      vests: 0,
      shoes: 0,
      noHelmets: 1,
      noVests: 1,
      noShoes: 0,
    }, history, 'camera-b', 2000);

    expect(otherCamera.helmets).toBe(0);
    expect(otherCamera.noHelmets).toBe(1);
  });
});

describe('Person alert tracking', () => {
  it('does not re-alert for a continuous violation, but resets after the person leaves', () => {
    const tracker = createPersonTracker();
    const group = { person: { box: { x: 10, y: 10, width: 40, height: 80 } } };
    const first = tracker.assign([group])[0];
    tracker.markAlerted(first._track, 'Safety Helmet');

    const nextFrame = tracker.assign([group])[0];
    expect(tracker.hasAlerted(nextFrame._track, 'Safety Helmet')).toBe(true);

    for (let frame = 0; frame < 9; frame += 1) tracker.assign([]);
    const returned = tracker.assign([group])[0];
    expect(tracker.hasAlerted(returned._track, 'Safety Helmet')).toBe(false);
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

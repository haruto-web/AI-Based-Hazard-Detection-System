import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  buildCaptureUrls,
  buildStreamUrls,
  getAutoBrightnessScale,
  parseYoloOutput,
  groupPpeDetections,
  createPersonTracker,
  PPE_CLASS_CONFIDENCE_THRESHOLDS,
  PPE_CONFIDENCE_THRESHOLD,
  PPE_DETECTION_GRACE_MS,
  PPE_LABELS,
  MATERIAL_CONFIDENCE_THRESHOLD,
  MATERIAL_INPUT_SIZE,
  MATERIAL_LABELS,
  PROTRUDING_CONFIDENCE_THRESHOLD,
  PROTRUDING_INPUT_SIZE,
  PROTRUDING_LABELS,
  SCAFFOLDING_CONFIDENCE_THRESHOLD,
  SCAFFOLDING_INPUT_SIZE,
  SCAFFOLDING_LABELS,
  stabilizePpeDetections,
} from '../AI/LM_detection/ppeDetection';

describe('camera capture endpoint compatibility', () => {
  it('tries the standard ESP32 endpoint and the mobile camera stream-port endpoint', () => {
    expect(buildCaptureUrls('192.168.55.105')).toEqual([
      'http://192.168.55.105/capture',
      'http://192.168.55.105:8080/capture',
    ]);
  });

  it('returns no capture URLs for an empty camera address', () => {
    expect(buildCaptureUrls('')).toEqual([]);
  });

  it('tries the mobile app stream port and the ESP32 stream port', () => {
    expect(buildStreamUrls('192.168.55.105')).toEqual([
      'http://192.168.55.105:8081/stream',
      'http://192.168.55.105:81/stream',
    ]);
  });
});

describe('TensorFlow model packages', () => {
  it('loads the installed browser ML dependencies', () => {
    expect(tf).toBeTruthy();
    expect(cocoSsd).toBeTruthy();
    expect(typeof cocoSsd.load).toBe('function');
  });
});

describe('YOLOv8 output parsing', () => {
  const channels = 4 + PPE_LABELS.length; // 11

  it('uses the seven classes in the replacement PPE model', () => {
    expect(PPE_LABELS).toEqual([
      'Safety Helmet',
      'Safety Vest',
      'Safety Shoes',
      'Person',
      'No Safety Helmet',
      'No Safety Vest',
      'No Safety Shoes',
    ]);

    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + 4] = 0.9;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('No Safety Helmet');
  });

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

describe('protruding hazard YOLOv8 output parsing', () => {
  const channels = 4 + PROTRUDING_LABELS.length;

  it('uses the protruding model classes and a 25% confidence threshold', () => {
    expect(PROTRUDING_LABELS).toEqual(['Potruding Hazard', 'Safety Cap']);
    expect(PROTRUDING_CONFIDENCE_THRESHOLD).toBe(0.25);

    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = PROTRUDING_CONFIDENCE_THRESHOLD;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: PROTRUDING_LABELS,
      inputSize: PROTRUDING_INPUT_SIZE,
      confidenceThreshold: PROTRUDING_CONFIDENCE_THRESHOLD,
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Potruding Hazard');
    expect(result[0].score).toBeCloseTo(0.25);
  });

  it('rejects protruding detections below the 25% confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4] = PROTRUDING_CONFIDENCE_THRESHOLD - 0.01;

    expect(parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: PROTRUDING_LABELS,
      inputSize: PROTRUDING_INPUT_SIZE,
      confidenceThreshold: PROTRUDING_CONFIDENCE_THRESHOLD,
    })).toHaveLength(0);
  });

  it('recognizes the safety-cap class at the same confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + PROTRUDING_LABELS.indexOf('Safety Cap')] = PROTRUDING_CONFIDENCE_THRESHOLD;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: PROTRUDING_LABELS,
      inputSize: PROTRUDING_INPUT_SIZE,
      confidenceThreshold: PROTRUDING_CONFIDENCE_THRESHOLD,
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Safety Cap');
  });
});

describe('material-handling YOLOv8 output parsing', () => {
  const channels = 4 + MATERIAL_LABELS.length;

  it('uses the material-handling classes and a 25% confidence threshold', () => {
    expect(MATERIAL_LABELS).toEqual(['Organized', 'Messy']);
    expect(MATERIAL_CONFIDENCE_THRESHOLD).toBe(0.25);

    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + MATERIAL_LABELS.indexOf('Messy')] = MATERIAL_CONFIDENCE_THRESHOLD;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: MATERIAL_LABELS,
      inputSize: MATERIAL_INPUT_SIZE,
      confidenceThreshold: MATERIAL_CONFIDENCE_THRESHOLD,
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Messy');
    expect(result[0].score).toBeCloseTo(MATERIAL_CONFIDENCE_THRESHOLD);
  });

  it('rejects material-handling detections below the 25% confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + MATERIAL_LABELS.indexOf('Messy')] = MATERIAL_CONFIDENCE_THRESHOLD - 0.01;

    expect(parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: MATERIAL_LABELS,
      inputSize: MATERIAL_INPUT_SIZE,
      confidenceThreshold: MATERIAL_CONFIDENCE_THRESHOLD,
    })).toHaveLength(0);
  });

  it('keeps material detections at or above the configured threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + MATERIAL_LABELS.indexOf('Messy')] = 0.26;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: MATERIAL_LABELS,
      inputSize: MATERIAL_INPUT_SIZE,
      confidenceThreshold: MATERIAL_CONFIDENCE_THRESHOLD,
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Messy');
  });
});

describe('scaffolding YOLOv8 output parsing', () => {
  const channels = 4 + SCAFFOLDING_LABELS.length;

  it('uses the scaffold model classes and a 25% confidence threshold', () => {
    expect(SCAFFOLDING_LABELS).toEqual([
      'Standard Scaffolding Base',
      'Diagonal Ridger Brace',
      'Scaffolding',
      'CrossRidge Brace',
      'Standard Scaffolding Ladder',
      'No Base',
    ]);
    expect(SCAFFOLDING_CONFIDENCE_THRESHOLD).toBe(0.25);

    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + SCAFFOLDING_LABELS.indexOf('No Base')] = 0.25;

    const result = parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: SCAFFOLDING_LABELS,
      inputSize: SCAFFOLDING_INPUT_SIZE,
      confidenceThreshold: SCAFFOLDING_CONFIDENCE_THRESHOLD,
    });

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('No Base');
    expect(result[0].score).toBeCloseTo(0.25);
  });

  it('rejects scaffold detections below the 25% confidence threshold', () => {
    const values = new Float32Array(channels);
    values[0] = 0.5;
    values[1] = 0.5;
    values[2] = 0.2;
    values[3] = 0.4;
    values[4 + SCAFFOLDING_LABELS.indexOf('No Base')] = 0.249;

    expect(parseYoloOutput(values, [1, channels, 1], 100, 100, null, {
      labels: SCAFFOLDING_LABELS,
      inputSize: SCAFFOLDING_INPUT_SIZE,
      confidenceThreshold: SCAFFOLDING_CONFIDENCE_THRESHOLD,
    })).toHaveLength(0);
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

  it('does not treat explicit no-PPE classes as equipment present', () => {
    const detections = [
      { label: 'No Safety Helmet', score: 0.9, box: { x: 45, y: 5, width: 10, height: 10 } },
      { label: 'No Safety Vest', score: 0.9, box: { x: 45, y: 30, width: 10, height: 20 } },
    ];
    const persons = [{ score: 0.95, box: { x: 20, y: 0, width: 60, height: 50 } }];

    const groups = groupPpeDetections(detections, 100, persons, 100);

    expect(groups[0].hasHelmet).toBe(false);
    expect(groups[0].hasVest).toBe(false);
    expect(groups[0].missing).toContain('Safety Helmet');
    expect(groups[0].missing).toContain('Safety Vest');
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

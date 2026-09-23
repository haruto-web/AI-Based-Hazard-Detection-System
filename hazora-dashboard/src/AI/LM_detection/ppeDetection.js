import * as tf from '@tensorflow/tfjs';
import * as tflite from '@tensorflow/tfjs-tflite/dist/tf-tflite.es2017.js';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export const PPE_MODEL_URL = '/models/ppe/yolov8n.tflite';
export const PPE_LABELS = ['Safety Helmet', 'Safety Vest', 'Safety Shoes'];
export const PPE_INPUT_SIZE = 640;
export const PPE_CONFIDENCE_THRESHOLD = 0.45;
export const PPE_IOU_THRESHOLD = 0.45;
const TFLITE_WASM_PATH = '/tflite/';

// Logged once so the real YOLOv8 output tensor layout can be verified in the console.
let outputShapeLogged = false;

export function buildCaptureUrl(value) {
  if (!value) return '';
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return `http://${value}/capture`;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}/capture`;
  } catch {
    return '';
  }
}

export function getAutoBrightnessScale(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let luminanceTotal = 0;
  let sampledPixels = 0;
  let brightPixels = 0;

  for (let index = 0; index < data.length; index += 64) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    luminanceTotal += luminance;
    sampledPixels++;
    if (luminance >= 0.94) brightPixels++;
  }

  if (!sampledPixels) return 1;

  const averageLuminance = luminanceTotal / sampledPixels;
  const brightPixelRatio = brightPixels / sampledPixels;
  if (averageLuminance <= 0.72 && brightPixelRatio <= 0.28) return 1;

  const averageScale = 0.72 / Math.max(averageLuminance, 0.72);
  const highlightScale = brightPixelRatio > 0.45 ? 0.72 : 0.84;
  return Math.max(0.55, Math.min(1, averageScale, highlightScale));
}

export async function loadPpeDetectionModels() {
  await tf.ready();
  tflite.setWasmPath(TFLITE_WASM_PATH);

  const ppeModel = await tflite.loadTFLiteModel(PPE_MODEL_URL, {
    numThreads: Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
  });

  const personModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

  return {
    ppeModel,
    personModel,
    ppeLabels: PPE_LABELS,
  };
}

function iou(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function nonMaximumSuppression(detections) {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept = [];

  while (sorted.length) {
    const best = sorted.shift();
    kept.push(best);
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      if (sorted[index].label === best.label && iou(sorted[index].box, best.box) > PPE_IOU_THRESHOLD) {
        sorted.splice(index, 1);
      }
    }
  }

  return kept;
}

// YOLOv8 boxes can come out normalized (0..1) or in input-pixel space (0..640).
// Detect which by sampling a coordinate, then scale to the canvas accordingly.
function resolveCoordinateScale(sampleValue, canvasSize, inputSize) {
  const normalized = sampleValue <= 1.5;
  const base = normalized ? canvasSize : canvasSize / inputSize;
  return { normalized, base };
}

export function parseYoloOutput(values, shape, canvasWidth, canvasHeight) {
  const channels = 4 + PPE_LABELS.length;
  // Layout A (channels-first): [1, channels, N]  -> value at [c * N + i]
  // Layout B (channels-last):  [1, N, channels]  -> value at [i * channels + c]
  const channelsFirst = shape[shape.length - 2] === channels;
  const candidateCount = channelsFirst ? shape[shape.length - 1] : shape[shape.length - 2];

  const getValue = (channel, index) => (channelsFirst
    ? values[channel * candidateCount + index]
    : values[index * channels + channel]);

  // Sample a center-x from the first candidate to decide normalized vs pixel space.
  const scaleX = resolveCoordinateScale(getValue(0, 0), canvasWidth, PPE_INPUT_SIZE);
  const scaleY = resolveCoordinateScale(getValue(1, 0), canvasHeight, PPE_INPUT_SIZE);

  const detections = [];
  for (let index = 0; index < candidateCount; index += 1) {
    let bestClass = -1;
    let bestScore = 0;
    for (let classIndex = 0; classIndex < PPE_LABELS.length; classIndex += 1) {
      const score = getValue(4 + classIndex, index);
      if (score > bestScore) {
        bestScore = score;
        bestClass = classIndex;
      }
    }

    if (bestClass < 0 || bestScore < PPE_CONFIDENCE_THRESHOLD) continue;

    const centerX = getValue(0, index) * scaleX.base;
    const centerY = getValue(1, index) * scaleY.base;
    const width = getValue(2, index) * scaleX.base;
    const height = getValue(3, index) * scaleY.base;

    const x = Math.max(0, centerX - width / 2);
    const y = Math.max(0, centerY - height / 2);
    detections.push({
      label: PPE_LABELS[bestClass],
      score: bestScore,
      box: {
        x,
        y,
        width: Math.min(canvasWidth, centerX + width / 2) - x,
        height: Math.min(canvasHeight, centerY + height / 2) - y,
      },
    });
  }

  return nonMaximumSuppression(detections);
}

// Some YOLOv8 TFLite exports expect NCHW ([1,3,H,W]) instead of the NHWC
// ([1,H,W,3]) that tf.browser.fromPixels produces. Inspect the model's declared
// input shape and transpose only when the channel dimension is at index 1.
function modelExpectsChannelsFirst(ppeModel) {
  try {
    const inputs = ppeModel.inputs || ppeModel.modelRunner?.inputs;
    const shape = inputs?.[0]?.shape;
    // NCHW looks like [1, 3, 640, 640]; NHWC looks like [1, 640, 640, 3].
    if (Array.isArray(shape) && shape.length === 4) {
      return shape[1] === 3;
    }
  } catch {
    // Fall through to default below.
  }
  return false;
}

export async function detectPpeObjects({ ppeModel, canvas }) {
  if (!ppeModel || !canvas) return [];

  const channelsFirst = modelExpectsChannelsFirst(ppeModel);
  const input = tf.tidy(() => {
    const nhwc = tf.browser.fromPixels(canvas)
      .resizeBilinear([PPE_INPUT_SIZE, PPE_INPUT_SIZE])
      .toFloat()
      .div(255)
      .expandDims(0);
    // Transpose [1,H,W,3] -> [1,3,H,W] when the model wants NCHW.
    return channelsFirst ? nhwc.transpose([0, 3, 1, 2]) : nhwc;
  });

  let output;
  let runInput = input;
  let transposed = null;
  try {
    try {
      output = ppeModel.predict(runInput);
    } catch (err) {
      // Fallback: if the layout guess was wrong, flip NHWC<->NCHW and retry once.
      if (/shape mismatch/i.test(err?.message || '')) {
        transposed = channelsFirst
          ? runInput.transpose([0, 2, 3, 1]) // NCHW -> NHWC
          : runInput.transpose([0, 3, 1, 2]); // NHWC -> NCHW
        runInput = transposed;
        output = ppeModel.predict(runInput);
      } else {
        throw err;
      }
    }

    const shape = output.shape || [];
    if (!outputShapeLogged) {
      // One-time diagnostic so the exported model's real tensor layout is visible.
      console.info('[PPE] YOLOv8 output shape:', JSON.stringify(shape));
      outputShapeLogged = true;
    }
    const values = await output.data();
    return parseYoloOutput(values, shape, canvas.width, canvas.height);
  } finally {
    output?.dispose?.();
    transposed?.dispose?.();
    input.dispose();
  }
}

export async function detectPersons({ personModel, canvas }) {
  if (!personModel || !canvas) return [];
  const predictions = await personModel.detect(canvas);
  return predictions
    .filter((prediction) => prediction.class === 'person')
    .map((prediction) => ({
      score: prediction.score,
      box: {
        x: prediction.bbox[0],
        y: prediction.bbox[1],
        width: prediction.bbox[2],
        height: prediction.bbox[3],
      },
    }));
}

function boxCenter(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pointInBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

// Group PPE detections by the person that contains them. When no person model
// output is available, fall back to spatial clustering by horizontal position.
export function groupPpeDetections(detections, canvasWidth, persons = []) {
  if (persons.length > 0) {
    return persons.map((person) => {
      const owned = detections.filter((detection) => pointInBox(boxCenter(detection.box), person.box));
      const labels = new Set(owned.map((detection) => detection.label));
      return {
        person,
        detections: owned,
        hasHelmet: labels.has('Safety Helmet'),
        hasVest: labels.has('Safety Vest'),
        hasShoes: labels.has('Safety Shoes'),
        missing: PPE_LABELS.filter((label) => !labels.has(label)),
      };
    });
  }

  const groups = [];
  const groupingDistance = canvasWidth * 0.25;

  detections.forEach((detection) => {
    const centerX = detection.box.x + detection.box.width / 2;
    const group = groups.find((candidate) => Math.abs(candidate.centerX - centerX) < groupingDistance);
    if (group) {
      group.detections.push(detection);
      group.centerX = group.detections.reduce((sum, item) => sum + item.box.x + item.box.width / 2, 0) / group.detections.length;
    } else {
      groups.push({ centerX, detections: [detection] });
    }
  });

  return groups.map((group) => {
    const labels = new Set(group.detections.map((detection) => detection.label));
    return {
      detections: group.detections,
      hasHelmet: labels.has('Safety Helmet'),
      hasVest: labels.has('Safety Vest'),
      hasShoes: labels.has('Safety Shoes'),
      missing: PPE_LABELS.filter((label) => !labels.has(label)),
    };
  });
}

export function drawPpeResult(ctx, detection) {
  const colorByLabel = {
    'Safety Helmet': '#22c55e',
    'Safety Vest': '#f59e0b',
    'Safety Shoes': '#38bdf8',
  };
  const color = colorByLabel[detection.label] || '#ffffff';
  const { x, y, width, height } = detection.box;
  const label = `${detection.label} ${Math.round(detection.score * 100)}%`;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);
  ctx.font = 'bold 13px Arial';
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = color;
  ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
  ctx.fillStyle = '#000';
  ctx.fillText(label, x + 5, Math.max(14, y - 6));
}

export function drawPersonResult(ctx, person) {
  const { x, y, width, height } = person.box;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 14px Arial';
  const label = `Person ${Math.round(person.score * 100)}%`;
  const textWidth = ctx.measureText(label).width;
  ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
  ctx.fillStyle = '#000';
  ctx.fillText(label, x + 5, Math.max(14, y - 6));
}

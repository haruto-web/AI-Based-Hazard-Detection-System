import * as tf from '@tensorflow/tfjs';
import * as tflite from '@tensorflow/tfjs-tflite/dist/tf-tflite.es2017.js';

export const HELMET_MODEL_URL = '/models/helmet/model.json';
export const HELMET_METADATA_URL = '/models/helmet/metadata.json';
export const PPE_MODEL_URL = '/models/ppe/yolov8n.tflite';
export const PPE_LABELS = ['Safety Helmet', 'Safety Vest', 'Safety Shoes'];
export const PPE_INPUT_SIZE = 640;
export const PPE_CONFIDENCE_THRESHOLD = 0.45;
export const PPE_IOU_THRESHOLD = 0.45;

const HELMET_COLOR_THRESHOLD = 0.14;
const HELMET_CONFIDENCE_THRESHOLD = 0.65;

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

  const ppeModel = await tflite.loadTFLiteModel(PPE_MODEL_URL, {
    numThreads: Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
  });

  return {
    ppeModel,
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

export async function detectPpeObjects({ ppeModel, canvas }) {
  if (!ppeModel || !canvas) return [];

  const input = tf.tidy(() => (
    tf.browser.fromPixels(canvas)
      .resizeBilinear([PPE_INPUT_SIZE, PPE_INPUT_SIZE])
      .toFloat()
      .div(255)
      .expandDims(0)
  ));

  let output;
  try {
    output = ppeModel.predict(input);
    const shape = output.shape || [];
    const values = await output.data();
    const channelsFirst = shape[shape.length - 2] === 4 + PPE_LABELS.length;
    const candidateCount = channelsFirst ? shape[shape.length - 1] : shape[shape.length - 2];
    const detections = [];
    const scaleX = canvas.width / PPE_INPUT_SIZE;
    const scaleY = canvas.height / PPE_INPUT_SIZE;

    for (let index = 0; index < candidateCount; index += 1) {
      const getValue = (channel) => channelsFirst
        ? values[channel * candidateCount + index]
        : values[index * (4 + PPE_LABELS.length) + channel];
      let bestClass = -1;
      let bestScore = 0;
      for (let classIndex = 0; classIndex < PPE_LABELS.length; classIndex += 1) {
        const score = getValue(4 + classIndex);
        if (score > bestScore) {
          bestScore = score;
          bestClass = classIndex;
        }
      }

      if (bestClass < 0 || bestScore < PPE_CONFIDENCE_THRESHOLD) continue;

      const centerX = getValue(0);
      const centerY = getValue(1);
      const width = getValue(2);
      const height = getValue(3);
      detections.push({
        label: PPE_LABELS[bestClass],
        score: bestScore,
        box: {
          x: Math.max(0, (centerX - width / 2) * scaleX),
          y: Math.max(0, (centerY - height / 2) * scaleY),
          width: Math.min(canvas.width, (centerX + width / 2) * scaleX) - Math.max(0, (centerX - width / 2) * scaleX),
          height: Math.min(canvas.height, (centerY + height / 2) * scaleY) - Math.max(0, (centerY - height / 2) * scaleY),
        },
      });
    }

    return nonMaximumSuppression(detections);
  } finally {
    output?.dispose?.();
    input.dispose();
  }
}

export function groupPpeDetections(detections, canvasWidth) {
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
    const missing = PPE_LABELS.filter((label) => !labels.has(label));
    return {
      detections: group.detections,
      hasHelmet: labels.has('Safety Helmet'),
      hasVest: labels.has('Safety Vest'),
      hasShoes: labels.has('Safety Shoes'),
      missing,
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

function getHelmetRegionStats(imageData) {
  const data = imageData.data;
  const { width, height } = imageData;
  let helmetPixels = 0;
  let lowerHelmetPixels = 0;
  let darkPixels = 0;
  let visiblePixels = 0;
  let lowerVisiblePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const px = pixelIndex % width;
    const py = Math.floor(pixelIndex / width);
    const inCenter = px > width * 0.12 && px < width * 0.88;
    const inLowerBand = py > height * 0.32;

    if (!inCenter) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const brightness = max / 255;

    if (brightness < 0.18) continue;
    visiblePixels++;
    if (inLowerBand) lowerVisiblePixels++;

    const darkHairLike = brightness < 0.32 && saturation < 0.55;
    if (darkHairLike && inLowerBand) {
      darkPixels++;
    }

    const yellow = r > 125 && g > 95 && b < 105 && saturation > 0.22;
    const orange = r > 135 && g > 55 && g < 175 && b < 105 && saturation > 0.28;
    const red = r > 125 && g < 115 && b < 115 && saturation > 0.28;
    const blue = b > 95 && r < 130 && g > 50 && saturation > 0.24;
    const green = g > 95 && r < 130 && b < 135 && saturation > 0.24;
    const brightWhite = r > 165 && g > 165 && b > 155 && saturation < 0.3;
    const lowLightWhite =
      brightness > 0.45 &&
      saturation < 0.26 &&
      Math.abs(r - g) < 55 &&
      Math.abs(g - b) < 65;

    if (yellow || orange || red || blue || green || brightWhite || lowLightWhite) {
      helmetPixels++;
      if (inLowerBand) lowerHelmetPixels++;
    }
  }

  return {
    colorScore: visiblePixels > 0 ? helmetPixels / visiblePixels : 0,
    lowerColorScore: lowerVisiblePixels > 0 ? lowerHelmetPixels / lowerVisiblePixels : 0,
    darkScore: lowerVisiblePixels > 0 ? darkPixels / lowerVisiblePixels : 0,
  };
}

export function resolveHelmetDecision({
  helmetScore,
  noHelmetScore,
  regionStats,
  colorFallback,
}) {
  const helmetScoreValue = helmetScore || 0;
  const noHelmetScoreValue = noHelmetScore || 0;
  const lowerColorScore = regionStats?.lowerColorScore || 0;
  const colorScore = regionStats?.colorScore || 0;
  const darkScore = regionStats?.darkScore || 0;

  const strongHelmetEvidence =
    helmetScoreValue >= 0.65 &&
    helmetScoreValue > noHelmetScoreValue + 0.12 &&
    lowerColorScore >= 0.12;

  const fallbackHelmet =
    colorFallback &&
    ((lowerColorScore >= 0.2 &&
      helmetScoreValue >= 0.55 &&
      helmetScoreValue > noHelmetScoreValue) || (
      colorScore >= HELMET_COLOR_THRESHOLD &&
      helmetScoreValue >= HELMET_CONFIDENCE_THRESHOLD &&
      helmetScoreValue > noHelmetScoreValue
    )) &&
    darkScore < 0.18;

  const hasHelmet = strongHelmetEvidence || fallbackHelmet;

  return {
    hasHelmet,
    confidence: Math.max(helmetScoreValue, noHelmetScoreValue),
  };
}

export function clampRegion(region, canvas) {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const right = Math.min(canvas.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(canvas.height, Math.ceil(region.y + region.height));

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export function getHelmetRegionFromFace(face) {
  const [x1, y1] = face.topLeft;
  const [x2, y2] = face.bottomRight;
  const faceWidth = x2 - x1;
  const faceHeight = y2 - y1;

  return {
    x: x1 - faceWidth * 0.08,
    y: y1 - faceHeight * 0.72,
    width: faceWidth * 1.16,
    height: faceHeight * 0.72,
  };
}

export function getHelmetRegionFromPerson(person) {
  const [x, y, width, height] = person.bbox;
  return {
    x: x + width * 0.2,
    y,
    width: width * 0.6,
    height: height * 0.22,
  };
}

function hasHelmetByColor(ctx, canvas, region) {
  const safeRegion = clampRegion(region, canvas);
  if (safeRegion.width < 8 || safeRegion.height < 8) return false;

  const imageData = ctx.getImageData(
    safeRegion.x,
    safeRegion.y,
    safeRegion.width,
    safeRegion.height
  );

  const stats = getHelmetRegionStats(imageData);

  if (stats.darkScore > 0.24 && stats.lowerColorScore < 0.2) {
    return false;
  }

  return (
    stats.lowerColorScore >= 0.2 ||
    (stats.colorScore >= HELMET_COLOR_THRESHOLD && stats.darkScore < 0.18)
  );
}

export async function classifyHelmetRegion({
  ctx,
  canvas,
  region,
  helmetModel,
  helmetMetadata,
  cropCanvas,
}) {
  if (!helmetModel || !helmetMetadata) {
    return { hasHelmet: hasHelmetByColor(ctx, canvas, region), confidence: null };
  }

  const safeRegion = clampRegion(region, canvas);
  if (safeRegion.width < 8 || safeRegion.height < 8) {
    return { hasHelmet: false, confidence: 0 };
  }

  const imageData = ctx.getImageData(
    safeRegion.x,
    safeRegion.y,
    safeRegion.width,
    safeRegion.height
  );
  const regionStats = getHelmetRegionStats(imageData);

  if (regionStats.darkScore > 0.22 && regionStats.lowerColorScore < 0.2) {
    return { hasHelmet: false, confidence: 1 };
  }

  const imageSize = helmetMetadata.imageSize || 96;
  cropCanvas.width = imageSize;
  cropCanvas.height = imageSize;

  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(
    canvas,
    safeRegion.x,
    safeRegion.y,
    safeRegion.width,
    safeRegion.height,
    0,
    0,
    imageSize,
    imageSize
  );

  const channels = helmetMetadata.grayscale ? 1 : 3;
  const input = tf.tidy(() => (
    tf.browser.fromPixels(cropCanvas, channels)
      .toFloat()
      .div(255)
      .expandDims(0)
  ));

  try {
    const output = helmetModel.predict(input);
    const scores = await output.data();
    output.dispose();

    const labels = helmetMetadata.labels || [];
    const predictions = labels.map((label, index) => ({
      label: label.trim().toLowerCase(),
      probability: scores[index] || 0,
    }));
    const helmetPrediction = predictions.find((prediction) => (
      prediction.label.includes('helmet') && !prediction.label.includes('no')
    ));
    const noHelmetPrediction = predictions.find((prediction) => (
      prediction.label.includes('no') && prediction.label.includes('helmet')
    ));

    if (!helmetPrediction && !noHelmetPrediction) {
      return { hasHelmet: hasHelmetByColor(ctx, canvas, region), confidence: null };
    }

    const helmetScore = helmetPrediction?.probability || 0;
    const noHelmetScore = noHelmetPrediction?.probability || 0;
    const decision = resolveHelmetDecision({
      helmetScore,
      noHelmetScore,
      regionStats,
      colorFallback: hasHelmetByColor(ctx, canvas, region),
    });

    return decision;
  } finally {
    input.dispose();
  }
}

export function findFaceForPerson(person, faces) {
  const [px, py, pw, ph] = person.bbox;
  return faces.find(face => {
    const [fx1, fy1] = face.topLeft;
    const [fx2, fy2] = face.bottomRight;
    const centerX = (fx1 + fx2) / 2;
    const centerY = (fy1 + fy2) / 2;

    return (
      centerX >= px &&
      centerX <= px + pw &&
      centerY >= py &&
      centerY <= py + ph * 0.55
    );
  });
}

export function drawPersonResult(ctx, prediction) {
  const [x, y, width, height] = prediction.bbox;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 14px Arial';
  const label = `Person ${Math.round(prediction.score * 100)}%`;
  const textWidth = ctx.measureText(label).width;
  ctx.fillRect(x, y - 22, textWidth + 10, 22);
  ctx.fillStyle = '#000';
  ctx.fillText(label, x + 5, y - 6);
}

export function drawHelmetResult(ctx, region, hasHelmet) {
  const color = hasHelmet ? '#22c55e' : '#ff3b30';
  const label = hasHelmet ? 'Helmet' : 'No helmet';

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(region.x, region.y, region.width, region.height);

  ctx.fillStyle = color;
  ctx.font = 'bold 13px Arial';
  const textWidth = ctx.measureText(label).width;
  ctx.fillRect(region.x, Math.max(0, region.y - 22), textWidth + 10, 22);
  ctx.fillStyle = '#000';
  ctx.fillText(label, region.x + 5, Math.max(14, region.y - 6));
}

export function drawFaceResult(ctx, face) {
  const start = face.topLeft;
  const end = face.bottomRight;
  const size = [end[0] - start[0], end[1] - start[1]];

  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 2;
  ctx.strokeRect(start[0], start[1], size[0], size[1]);

  ctx.fillStyle = '#00d4aa';
  ctx.font = 'bold 12px Arial';
  const prob = Math.round(face.probability[0] * 100);
  const faceLabel = `Face ${prob}%`;
  const textWidth = ctx.measureText(faceLabel).width;
  ctx.fillRect(start[0], start[1] - 18, textWidth + 8, 18);
  ctx.fillStyle = '#000';
  ctx.fillText(faceLabel, start[0] + 4, start[1] - 4);
}

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';

export const HELMET_MODEL_URL = '/models/helmet/model.json';
export const HELMET_METADATA_URL = '/models/helmet/metadata.json';

const HELMET_COLOR_THRESHOLD = 0.08;
const HELMET_CONFIDENCE_THRESHOLD = 0.8;

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

export async function loadPpeDetectionModels() {
  await tf.ready();

  const [personModel, faceModel, helmetModel, helmetMetaResponse] = await Promise.all([
    cocoSsd.load({ base: 'lite_mobilenet_v2' }),
    blazeface.load(),
    tf.loadLayersModel(HELMET_MODEL_URL),
    fetch(HELMET_METADATA_URL),
  ]);

  const helmetMetadata = await helmetMetaResponse.json();

  return {
    personModel,
    faceModel,
    helmetModel,
    helmetMetadata,
  };
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
    (lowerColorScore >= 0.18 || colorScore >= HELMET_COLOR_THRESHOLD) &&
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
    y: y1 - faceHeight * 0.92,
    width: faceWidth * 1.16,
    height: faceHeight * 0.92,
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

  if (stats.darkScore > 0.24 && stats.lowerColorScore < 0.16) {
    return false;
  }

  return (
    stats.lowerColorScore >= 0.12 ||
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

  if (regionStats.darkScore > 0.22 && regionStats.lowerColorScore < 0.14) {
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

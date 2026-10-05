import * as tf from '@tensorflow/tfjs';
import * as tflite from '@tensorflow/tfjs-tflite/dist/tf-tflite.es2017.js';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';

export const PPE_MODEL_URL = '/models/ppe/yolov8n.tflite';
export const PPE_LABELS = ['Safety Helmet', 'Safety Vest', 'Safety Shoes'];
export const PPE_INPUT_SIZE = 640;
export const PPE_CONFIDENCE_THRESHOLD = 0.77;
export const PPE_IOU_THRESHOLD = 0.70;
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

  // Face detector for evidence face-crops on violations. Non-fatal if it fails
  // to load (detection still works, just without face crops).
  let faceModel = null;
  try {
    faceModel = await blazeface.load();
  } catch (err) {
    console.warn('Face model failed to load; face capture disabled:', err?.message);
  }

  return {
    ppeModel,
    personModel,
    faceModel,
    ppeLabels: PPE_LABELS,
  };
}

// Detect faces in the current canvas. Returns boxes in canvas pixel space.
export async function detectFaces({ faceModel, canvas }) {
  if (!faceModel || !canvas) return [];
  try {
    const predictions = await faceModel.estimateFaces(canvas, false);
    return predictions.map((p) => {
      const [x1, y1] = p.topLeft;
      const [x2, y2] = p.bottomRight;
      return {
        score: Array.isArray(p.probability) ? p.probability[0] : (p.probability || 0),
        box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
      };
    });
  } catch {
    return [];
  }
}

// Crop the face that best falls within a person's box into a small JPEG data
// URL for evidence. Returns '' when no suitable face is found.
export function cropFaceForPerson(sourceCanvas, personBox, faces) {
  if (!sourceCanvas || !personBox || !faces?.length) return '';

  // Prefer a face whose center is inside the person's (head-region) box.
  const headRegion = {
    x: personBox.x,
    y: personBox.y - personBox.height * 0.15,
    width: personBox.width,
    height: personBox.height * 0.6,
  };

  let chosen = null;
  let bestScore = 0;
  faces.forEach((face) => {
    const center = { x: face.box.x + face.box.width / 2, y: face.box.y + face.box.height / 2 };
    const inside = center.x >= headRegion.x && center.x <= headRegion.x + headRegion.width &&
      center.y >= headRegion.y && center.y <= headRegion.y + headRegion.height;
    if (inside && face.score >= bestScore) {
      bestScore = face.score;
      chosen = face;
    }
  });

  if (!chosen) return '';

  // Pad the crop a little so the whole face/head is captured.
  const pad = chosen.box.width * 0.3;
  const cx = Math.max(0, chosen.box.x - pad);
  const cy = Math.max(0, chosen.box.y - pad);
  const cw = Math.min(sourceCanvas.width - cx, chosen.box.width + pad * 2);
  const ch = Math.min(sourceCanvas.height - cy, chosen.box.height + pad * 2);
  if (cw <= 0 || ch <= 0) return '';

  try {
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = Math.round(cw);
    faceCanvas.height = Math.round(ch);
    const fctx = faceCanvas.getContext('2d');
    fctx.drawImage(sourceCanvas, cx, cy, cw, ch, 0, 0, faceCanvas.width, faceCanvas.height);
    return faceCanvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
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

// Fraction of box A that overlaps box B (intersection / area of A). Used to
// attribute a PPE box to a person even when their edges don't perfectly align.
function overlapRatio(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = a.width * a.height;
  return areaA > 0 ? intersection / areaA : 0;
}

// Adaptive requirement: decide which PPE items to evaluate based on how far
// down the frame the person's body reaches. Avoids flagging "missing shoes"
// when the feet aren't even visible. An item is always required if it was
// actually detected. Returns { helmet, vest, shoes }.
function inferRequiredPpe(bottomReach, labels, feetVisible) {
  return {
    helmet: true, // head is essentially always in view when a person is detected
    vest: labels.has('Safety Vest') || bottomReach >= 0.45,
    shoes: labels.has('Safety Shoes') || feetVisible,
  };
}

function buildGroup(ownedDetections, bottomReach, feetVisible = bottomReach >= 0.85) {
  const labels = new Set(ownedDetections.map((detection) => detection.label));
  const required = inferRequiredPpe(bottomReach, labels, feetVisible);

  const hasHelmet = labels.has('Safety Helmet');
  const hasVest = labels.has('Safety Vest');
  const hasShoes = labels.has('Safety Shoes');

  const missing = [];
  if (required.helmet && !hasHelmet) missing.push('Safety Helmet');
  if (required.vest && !hasVest) missing.push('Safety Vest');
  if (required.shoes && !hasShoes) missing.push('Safety Shoes');

  return {
    detections: ownedDetections,
    hasHelmet,
    hasVest,
    hasShoes,
    required,
    missing,
  };
}

// Group PPE detections by the person that contains them. When no person model
// output is available, fall back to spatial clustering by horizontal position.
// `canvasHeight` enables adaptive visibility (only require shoes/vest when the
// relevant body region is actually in frame).
export function groupPpeDetections(detections, canvasWidth, persons = [], canvasHeight = 0) {
  if (persons.length > 0) {
    return persons.map((person) => {
      // Person boxes from coco-ssd often stop at the chin/shoulders, so a hard
      // hat sitting on top of the head can fall just above the box and get
      // dropped. Expand the region upward (and a little sideways) before
      // attributing PPE so head-top helmets are captured.
      const p = person.box;
      const expanded = {
        x: p.x - p.width * 0.1,
        y: p.y - p.height * 0.2,
        width: p.width * 1.2,
        height: p.height * 1.25,
      };
      // Overlap-based attribution is more forgiving than center-in-box, so
      // present PPE isn't dropped when boxes are tight or partially framed.
      const owned = detections.filter((detection) => (
        overlapRatio(detection.box, expanded) >= 0.2 ||
        pointInBox(boxCenter(detection.box), expanded)
      ));
      const personBottom = person.box.y + person.box.height;
      const bottomReach = canvasHeight > 0 ? personBottom / canvasHeight : 1;
      const feetVisible = canvasHeight > 0 && bottomReach >= 0.85 &&
        personBottom < canvasHeight * 0.98;
      return { person, ...buildGroup(owned, bottomReach, feetVisible) };
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
    // Without a person box, estimate reach from the lowest detection.
    const lowest = group.detections.reduce(
      (max, d) => Math.max(max, d.box.y + d.box.height),
      0
    );
    const bottomReach = canvasHeight > 0 ? lowest / canvasHeight : 1;
    return buildGroup(group.detections, bottomReach);
  });
}

// ---------------------------------------------------------------------------
// Lightweight person tracker (IoU-based) so we can alert ONCE per person per
// missing item instead of re-firing every cooldown while the same person
// stands in frame. This is the anti-spam solution: identity by position/overlap
// across frames, not face recognition.
// ---------------------------------------------------------------------------
export function createPersonTracker({ iouMatchThreshold = 0.3, maxMissingFrames = 8 } = {}) {
  let nextId = 1;
  // tracks: [{ id, box, missing (frames unseen), alerted: Set<item> }]
  let tracks = [];

  return {
    // Match this frame's person boxes to existing tracks; return each group
    // augmented with a stable trackId.
    assign(groups) {
      const usedTrackIndexes = new Set();

      const result = groups.map((group) => {
        const box = group.person?.box;
        if (!box) return { ...group, trackId: null };

        let bestIndex = -1;
        let bestIou = iouMatchThreshold;
        tracks.forEach((track, index) => {
          if (usedTrackIndexes.has(index)) return;
          const overlap = iou(track.box, box);
          if (overlap >= bestIou) {
            bestIou = overlap;
            bestIndex = index;
          }
        });

        let track;
        if (bestIndex >= 0) {
          track = tracks[bestIndex];
          track.box = box;
          track.missing = 0;
          usedTrackIndexes.add(bestIndex);
        } else {
          track = { id: nextId++, box, missing: 0, alerted: new Set() };
          tracks.push(track);
          usedTrackIndexes.add(tracks.length - 1);
        }

        return { ...group, trackId: track.id, _track: track };
      });

      // Age out tracks not matched this frame; drop the long-gone ones so a
      // person who leaves and returns later is treated as new (re-alertable).
      tracks.forEach((track, index) => {
        if (!usedTrackIndexes.has(index)) track.missing += 1;
      });
      tracks = tracks.filter((track) => track.missing <= maxMissingFrames);

      return result;
    },

    // Has this person already been alerted for this missing item?
    hasAlerted(track, item) {
      return track && track.alerted.has(item);
    },

    markAlerted(track, item) {
      if (track) track.alerted.add(item);
    },

    reset() {
      tracks = [];
      nextId = 1;
    },
  };
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

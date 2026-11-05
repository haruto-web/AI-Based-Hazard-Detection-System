import base64
import io
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageOps, ImageStat
from ai_edge_litert.interpreter import Interpreter

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ROOT_DIR / "hazora-dashboard" / "public" / "models" / "ppe" / "yolov8n.tflite"
MODEL_PATH = Path(os.environ.get("AI_MODEL_PATH") or DEFAULT_MODEL_PATH)
PERSON_CLASS_ID = 0
PPE_LABELS = [
    "Safety Helmet",
    "Safety Vest",
    "Safety Shoes",
    "Person",
    "No Safety Helmet",
    "No Safety Vest",
    "No Safety Shoes",
]
YOLO_INPUT_SIZE = 640
YOLO_IOU_THRESHOLD = 0.70
HAZARD_MODEL_CONFIG = {
    "scaffolding": {
        "path": Path(os.environ.get("AI_SCAFFOLDING_MODEL_PATH") or ROOT_DIR / "hazora-dashboard" / "public" / "models" / "scaffolding" / "scaffolding1.tflite"),
        "labels": [
            "Standard Scaffolding Base",
            "Diagonal Ridger Brace",
            "Scaffolding",
            "CrossRidge Brace",
            "Standard Scaffolding Ladder",
            "No Base",
        ],
        "reportable": {"No Base"},
    },
    "protruding": {
        "path": Path(os.environ.get("AI_PROTRUDING_MODEL_PATH") or ROOT_DIR / "hazora-dashboard" / "public" / "models" / "protruding" / "protruding.tflite"),
        "labels": ["Potruding Hazard", "Safety Cap"],
        "reportable": {"Potruding Hazard"},
    },
    "material": {
        "path": Path(os.environ.get("AI_MATERIAL_MODEL_PATH") or ROOT_DIR / "hazora-dashboard" / "public" / "models" / "material" / "material.tflite"),
        "labels": ["Organized", "Messy"],
        "reportable": {"Messy"},
    },
}
PPE_CONFIDENCE_THRESHOLD = 0.35
HAZARD_CONFIDENCE_THRESHOLD = 0.30
PPE_CLASS_CONFIDENCE_THRESHOLDS = {
    "helmet": PPE_CONFIDENCE_THRESHOLD,
    "vest": 0.20,
    "shoe": PPE_CONFIDENCE_THRESHOLD,
}
LOW_LIGHT_MEAN_LUMINANCE = 80
LOW_LIGHT_AUTOCONTRAST_CUTOFF = 1
hazard_models = {}
HAZARD_MODEL_ERRORS = {}
MODEL_INFERENCE_LOCK = threading.RLock()
model = None
MODEL_LOAD_ERROR = None


class TFLiteYoloModel:
    def __init__(self, model_path: Path, labels: List[str]):
        if not model_path.is_file():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        self.labels = labels
        self.interpreter = Interpreter(model_path=str(model_path), num_threads=2)
        self.interpreter.allocate_tensors()
        self.input_detail = self.interpreter.get_input_details()[0]
        self.output_detail = self.interpreter.get_output_details()[0]
        self.input_shape = self.input_detail["shape"]
        if len(self.input_shape) != 4 or self.input_shape[0] != 1:
            raise ValueError(f"Unsupported model input shape: {self.input_shape}")
        if self.input_detail["dtype"] != np.float32 or self.output_detail["dtype"] != np.float32:
            raise ValueError("Only float32 YOLO TFLite models are supported")
        if int(self.input_shape[1]) == 3:
            self.input_height = int(self.input_shape[2])
            self.input_width = int(self.input_shape[3])
            self.channels_first = True
        elif int(self.input_shape[3]) == 3:
            self.input_height = int(self.input_shape[1])
            self.input_width = int(self.input_shape[2])
            self.channels_first = False
        else:
            raise ValueError(f"Unsupported model input shape: {self.input_shape}")

        self.names = dict(enumerate(labels))
        self._output_channels_first = None
        self._candidate_count = None
        self._validate_output_shape()

    def _validate_output_shape(self):
        shape = self.output_detail["shape"]
        if len(shape) != 3 or shape[0] != 1:
            raise ValueError(f"Unsupported YOLO output shape: {shape}")
        if int(shape[1]) == 4 + len(self.labels):
            self._output_channels_first = True
            self._candidate_count = int(shape[2])
        elif int(shape[2]) == 4 + len(self.labels):
            self._output_channels_first = False
            self._candidate_count = int(shape[1])
        else:
            raise ValueError(
                f"YOLO output channels do not match {len(self.labels)} labels: {shape}"
            )

    def __call__(self, image: Image.Image, conf: float = 0.20):
        image_width, image_height = image.size
        scale = min(
            self.input_width / image_width,
            self.input_height / image_height,
        )
        resized_width = max(1, round(image_width * scale))
        resized_height = max(1, round(image_height * scale))
        pad_x = (self.input_width - resized_width) // 2
        pad_y = (self.input_height - resized_height) // 2

        resized = image.convert("RGB").resize(
            (resized_width, resized_height),
            Image.Resampling.BILINEAR,
        )
        letterboxed = Image.new(
            "RGB",
            (self.input_width, self.input_height),
            (114, 114, 114),
        )
        letterboxed.paste(resized, (pad_x, pad_y))
        pixels = np.asarray(letterboxed, dtype=np.float32) / 255.0
        if self.channels_first:
            pixels = np.transpose(pixels, (2, 0, 1))
        tensor = np.ascontiguousarray(np.expand_dims(pixels, axis=0), dtype=np.float32)

        self.interpreter.set_tensor(self.input_detail["index"], tensor)
        self.interpreter.invoke()
        output = self.interpreter.get_tensor(self.output_detail["index"])[0]
        boxes = _decode_yolo_output(
            output,
            image.size,
            scale,
            pad_x,
            pad_y,
            self.input_width,
            self.input_height,
            conf,
            self._output_channels_first,
            self._candidate_count,
        )
        return [SimpleNamespace(boxes=boxes, names=self.names)]


def _decode_yolo_output(
    output,
    image_size,
    scale,
    pad_x,
    pad_y,
    input_width,
    input_height,
    confidence_threshold,
    channels_first,
    candidate_count,
):
    image_width, image_height = image_size
    predictions = output if channels_first else output.T
    coordinates = predictions[:4]
    normalized = float(np.max(np.abs(coordinates), initial=0.0)) <= 1.5
    coordinate_scale_x = input_width if normalized else 1.0
    coordinate_scale_y = input_height if normalized else 1.0
    candidates = []

    for candidate_index in range(candidate_count):
        class_scores = predictions[4:, candidate_index]
        class_id = int(np.argmax(class_scores))
        confidence = float(class_scores[class_id])
        if not np.isfinite(confidence) or confidence < confidence_threshold:
            continue

        center_x = float(coordinates[0, candidate_index]) * coordinate_scale_x
        center_y = float(coordinates[1, candidate_index]) * coordinate_scale_y
        width = float(coordinates[2, candidate_index]) * coordinate_scale_x
        height = float(coordinates[3, candidate_index]) * coordinate_scale_y
        left = max(0.0, min(image_width, (center_x - width / 2 - pad_x) / scale))
        top = max(0.0, min(image_height, (center_y - height / 2 - pad_y) / scale))
        right = max(0.0, min(image_width, (center_x + width / 2 - pad_x) / scale))
        bottom = max(0.0, min(image_height, (center_y + height / 2 - pad_y) / scale))
        if right <= left or bottom <= top:
            continue

        candidates.append({
            "class_id": class_id,
            "confidence": confidence,
            "coordinates": [left, top, right, bottom],
        })

    candidates.sort(key=lambda candidate: candidate["confidence"], reverse=True)
    kept = []
    while candidates:
        best = candidates.pop(0)
        kept.append(best)
        left, top, right, bottom = best["coordinates"]
        best_area = (right - left) * (bottom - top)
        remaining = []
        for candidate in candidates:
            if candidate["class_id"] != best["class_id"]:
                remaining.append(candidate)
                continue
            other_left, other_top, other_right, other_bottom = candidate["coordinates"]
            intersection_width = max(0.0, min(right, other_right) - max(left, other_left))
            intersection_height = max(0.0, min(bottom, other_bottom) - max(top, other_top))
            intersection = intersection_width * intersection_height
            other_area = (other_right - other_left) * (other_bottom - other_top)
            union = best_area + other_area - intersection
            if union <= 0 or intersection / union <= YOLO_IOU_THRESHOLD:
                remaining.append(candidate)
        candidates = remaining

    return [
        SimpleNamespace(
            cls=[np.asarray([candidate["class_id"]])],
            conf=[np.asarray([candidate["confidence"]])],
            xyxy=[np.asarray(candidate["coordinates"])],
        )
        for candidate in kept
    ]


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, MODEL_LOAD_ERROR

    warmup_image = Image.new("RGB", (640, 480))
    try:
        model = TFLiteYoloModel(MODEL_PATH, PPE_LABELS)
        model(warmup_image, conf=0.20)
    except Exception as exc:
        model = None
        MODEL_LOAD_ERROR = str(exc)
    yield


app = FastAPI(title="Hazora AI Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    imageUrl: Optional[str] = None
    imageBase64: Optional[str] = None
    cameraIp: Optional[str] = None
    source: Optional[str] = None


class DetectResponse(BaseModel):
    ok: bool
    status: str
    detections: Dict[str, Any]
    alerts: List[Dict[str, Any]] = []
    model: str
    modelErrors: Dict[str, str] = {}


def _prepare_ppe_image(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    mean_luminance = ImageStat.Stat(image.convert("L")).mean[0]
    if mean_luminance < LOW_LIGHT_MEAN_LUMINANCE:
        return ImageOps.autocontrast(image, cutoff=LOW_LIGHT_AUTOCONTRAST_CUTOFF)
    return image


def _ppe_confidence_threshold(label: str) -> float:
    lower_label = label.lower()
    if "vest" in lower_label or "jacket" in lower_label:
        return PPE_CLASS_CONFIDENCE_THRESHOLDS["vest"]
    if "shoe" in lower_label or "boot" in lower_label:
        return PPE_CLASS_CONFIDENCE_THRESHOLDS["shoe"]
    return PPE_CLASS_CONFIDENCE_THRESHOLDS["helmet"]


def _load_hazard_model(name: str):
    if name in hazard_models:
        return hazard_models[name]
    if name in HAZARD_MODEL_ERRORS:
        return None

    model_path = HAZARD_MODEL_CONFIG[name]["path"]
    try:
        hazard_models[name] = TFLiteYoloModel(
            model_path,
            HAZARD_MODEL_CONFIG[name]["labels"],
        )
    except Exception as exc:
        HAZARD_MODEL_ERRORS[name] = str(exc)
        print(f"Failed to load {name} hazard model at {model_path}: {exc}")
        return None
    return hazard_models[name]


def _summarize_hazard_results(result, labels, reportable, confidence_threshold=HAZARD_CONFIDENCE_THRESHOLD):
    counts = {label: 0 for label in labels}
    alerts = []
    names = getattr(result, "names", {}) or {}

    for box in getattr(result, "boxes", None) or []:
        class_id = int(box.cls[0].item())
        raw_label = str(names.get(class_id, ""))
        label = next(
            (known for known in labels if known.lower() == raw_label.lower()),
            labels[class_id] if 0 <= class_id < len(labels) else raw_label,
        )
        confidence = float(box.conf[0].item())
        if label not in counts or confidence < confidence_threshold:
            continue

        counts[label] += 1
        if label in reportable:
            alerts.append({
                "label": label,
                "confidence": round(confidence, 3),
                "bbox": [round(float(value), 2) for value in box.xyxy[0].tolist()],
            })

    return counts, alerts


def _detect_hazards(image):
    detections = {}
    alerts = []
    model_errors = {}

    with MODEL_INFERENCE_LOCK:
        for name, config in HAZARD_MODEL_CONFIG.items():
            model = _load_hazard_model(name)
            if model is None:
                model_errors[name] = HAZARD_MODEL_ERRORS[name]
                continue

            try:
                result = model(
                    image,
                    conf=HAZARD_CONFIDENCE_THRESHOLD,
                )[0]
                counts, model_alerts = _summarize_hazard_results(
                    result,
                    config["labels"],
                    config["reportable"],
                )
            except Exception as exc:
                model_errors[name] = str(exc)
                HAZARD_MODEL_ERRORS[name] = str(exc)
                print(f"{name.capitalize()} hazard inference failed: {exc}")
                continue

            detections[f"{name}Classes"] = counts
            detections[f"{name}Confidence"] = (
                sum(alert["confidence"] for alert in model_alerts) / len(model_alerts)
                if model_alerts else 0
            )
            HAZARD_MODEL_ERRORS.pop(name, None)
            alerts.extend({**alert, "model": name} for alert in model_alerts)

    detections["noBase"] = detections.get("scaffoldingClasses", {}).get("No Base", 0)
    detections["protrudingHazardCount"] = detections.get("protrudingClasses", {}).get("Potruding Hazard", 0)
    detections["messyMaterialAreas"] = detections.get("materialClasses", {}).get("Messy", 0)
    return detections, alerts, model_errors


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "status": "healthy" if model is not None and not HAZARD_MODEL_ERRORS else "degraded",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "error": MODEL_LOAD_ERROR,
        "person_detection_in_ppe_model": True,
        "hazard_models": {
            name: {
                "loaded": name in hazard_models,
                "path": str(config["path"]),
                "error": HAZARD_MODEL_ERRORS.get(name),
            }
            for name, config in HAZARD_MODEL_CONFIG.items()
        },
    }


def _read_image_from_url(url: str) -> Image.Image:
    req = Request(url, headers={"User-Agent": "Hazora-AI-Server/1.0"})
    with urlopen(req, timeout=15) as response:
        payload = response.read()

    try:
        image = Image.open(io.BytesIO(payload)).convert("RGB")
    except Exception as exc:  # pragma: no cover - image decode failure path
        raise HTTPException(status_code=400, detail=f"Invalid image returned by URL: {exc}") from exc
    return image


def _read_image_from_base64(value: str) -> Image.Image:
    if not value:
        raise HTTPException(status_code=400, detail="Empty imageBase64 payload")

    try:
        header, encoded = value.split(",", 1) if "," in value else (None, value)
        if header and header.startswith("data:"):
            encoded = encoded.strip()
        payload = base64.b64decode(encoded, validate=True)
    except Exception as exc:  # pragma: no cover - base64 decode failure path
        raise HTTPException(status_code=400, detail=f"Invalid imageBase64 payload: {exc}") from exc

    try:
        image = Image.open(io.BytesIO(payload)).convert("RGB")
    except Exception as exc:  # pragma: no cover - image decode failure path
        raise HTTPException(status_code=400, detail=f"Invalid image bytes in base64 payload: {exc}") from exc
    return image


def _overlap_ratio(box: List[float], person: List[float]) -> float:
    left = max(box[0], person[0])
    top = max(box[1], person[1])
    right = min(box[2], person[2])
    bottom = min(box[3], person[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    area = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])
    return intersection / area if area > 0 else 0.0


def _expand_person_box(box: List[float]) -> List[float]:
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    return [
        x1 - width * 0.1,
        y1 - height * 0.2,
        x2 + width * 0.1,
        y2 + height * 0.05,
    ]


def _summarize_results(result, people_result=None, frame_size=None) -> Dict[str, Any]:
    boxes = result.boxes
    counts = {
        "persons": 0,
        "helmets": 0,
        "vests": 0,
        "shoes": 0,
        "noHelmets": 0,
        "noVests": 0,
        "noShoes": 0,
        "compliant": 0,
        "violations": 0,
    }
    alerts: List[Dict[str, Any]] = []
    ppe_items = []
    model_people = []

    names = getattr(result, "names", {}) or {}
    for box in boxes or []:
        coordinates = [float(value) for value in box.xyxy[0].tolist()]
        label_id = int(box.cls[0].item())
        label = str(names.get(label_id, label_id))
        confidence = float(box.conf[0].item())
        lower_label = label.lower()

        if lower_label == "person":
            if confidence >= 0.25:
                model_people.append(coordinates)
            continue

        if confidence < _ppe_confidence_threshold(label):
            continue

        is_missing = lower_label.startswith(("no ", "no-", "missing ", "without "))
        if "helmet" in lower_label or "hard hat" in lower_label:
            if not is_missing:
                counts["helmets"] += 1
                ppe_items.append((lower_label, coordinates))
        elif "vest" in lower_label or "jacket" in lower_label:
            if not is_missing:
                counts["vests"] += 1
                ppe_items.append((lower_label, coordinates))
        elif "shoe" in lower_label or "boot" in lower_label:
            if not is_missing:
                counts["shoes"] += 1
                ppe_items.append((lower_label, coordinates))

        alerts.append({
            "label": label,
            "confidence": round(confidence, 3),
            "bbox": [round(value, 2) for value in coordinates],
        })

    people = []
    if people_result is not None:
        person_names = getattr(people_result, "names", {}) or {}
        for box in people_result.boxes or []:
            class_id = int(box.cls[0].item())
            if class_id == PERSON_CLASS_ID or str(person_names.get(class_id, "")).lower() == "person":
                people.append([float(value) for value in box.xyxy[0].tolist()])
    if not people:
        people = model_people

    if people and frame_size:
        frame_height = frame_size[1]
        counts["persons"] = len(people)
        compliant = 0
        for person in people:
            expanded = _expand_person_box(person)
            owned_labels = set()
            for label, box in ppe_items:
                center_x = (box[0] + box[2]) / 2
                center_y = (box[1] + box[3]) / 2
                inside = (
                    expanded[0] <= center_x <= expanded[2]
                    and expanded[1] <= center_y <= expanded[3]
                )
                if inside or _overlap_ratio(box, expanded) >= 0.2:
                    owned_labels.add(label)

            bottom_reach = max(0.0, min(1.0, person[3] / frame_height)) if frame_height else 1.0
            missing = []
            if not any("helmet" in label or "hard hat" in label for label in owned_labels):
                counts["noHelmets"] += 1
                missing.append("helmet")
            if bottom_reach >= 0.45 and not any("vest" in label or "jacket" in label for label in owned_labels):
                counts["noVests"] += 1
                missing.append("vest")
            feet_visible = bottom_reach >= 0.85 and person[3] < frame_height * 0.98
            if feet_visible and not any("shoe" in label or "boot" in label for label in owned_labels):
                counts["noShoes"] += 1
                missing.append("shoes")
            if not missing:
                compliant += 1

        counts["compliant"] = compliant
    else:
        # Retain PPE-derived worker estimates if neither person detector found people.
        counts["persons"] = max(counts["helmets"], counts["vests"], counts["shoes"])
        counts["noHelmets"] = max(0, counts["persons"] - counts["helmets"])
        counts["noVests"] = max(0, counts["persons"] - counts["vests"])
        counts["noShoes"] = max(0, counts["persons"] - counts["shoes"])
        counts["compliant"] = min(
            counts["persons"], counts["helmets"], counts["vests"], counts["shoes"]
        ) if counts["persons"] else 0

    counts["violations"] = max(0, counts["persons"] - counts["compliant"])
    return counts, alerts


@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest) -> Dict[str, Any]:
    if model is None:
        raise HTTPException(status_code=500, detail=f"AI model failed to load: {MODEL_LOAD_ERROR}")

    if not request.imageUrl and not request.imageBase64:
        raise HTTPException(status_code=400, detail="Provide imageUrl or imageBase64")

    try:
        if request.imageBase64:
            image = _read_image_from_base64(request.imageBase64)
        else:
            image = _read_image_from_url(request.imageUrl)

        image = _prepare_ppe_image(image)
        with MODEL_INFERENCE_LOCK:
            result = model(
                image,
                conf=0.20,
            )[0]
            detections, alerts = _summarize_results(
                result,
                frame_size=image.size,
            )
            hazard_detections, hazard_alerts, model_errors = _detect_hazards(image)
        detections.update(hazard_detections)
        alerts.extend(hazard_alerts)
        return {
            "ok": True,
            "status": f"AI analysis complete for {request.cameraIp or request.source or 'camera'}",
            "detections": detections,
            "alerts": alerts,
            "model": str(MODEL_PATH.name),
            "modelErrors": model_errors,
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - inference driver errors
        raise HTTPException(status_code=500, detail=f"Detection failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=False)

import base64
import io
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ROOT_DIR / "runs" / "detect" / "training" / "runs" / "ppe-yolov8n" / "weights" / "best.pt"
MODEL_PATH = Path(os.environ.get("AI_MODEL_PATH") or DEFAULT_MODEL_PATH)
DEFAULT_PERSON_MODEL_PATH = ROOT_DIR / "yolov8n.pt"
PERSON_MODEL_PATH = Path(os.environ.get("AI_PERSON_MODEL_PATH") or DEFAULT_PERSON_MODEL_PATH)
PERSON_CLASS_ID = 0

try:
    model = YOLO(str(MODEL_PATH))
except Exception as exc:  # pragma: no cover - startup validation path
    model = None
    MODEL_LOAD_ERROR = str(exc)
else:
    MODEL_LOAD_ERROR = None

try:
    person_model = YOLO(str(PERSON_MODEL_PATH))
except Exception as exc:  # pragma: no cover - startup validation path
    person_model = None
    PERSON_MODEL_LOAD_ERROR = str(exc)
else:
    PERSON_MODEL_LOAD_ERROR = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    warmup_image = Image.new("RGB", (640, 480))
    if model is not None:
        model(warmup_image, imgsz=640, conf=0.35, verbose=False)
    if person_model is not None:
        person_model(
            warmup_image,
            imgsz=640,
            conf=0.25,
            classes=[PERSON_CLASS_ID],
            verbose=False,
        )
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


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "status": "healthy" if model is not None and person_model is not None else "degraded",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "error": MODEL_LOAD_ERROR,
        "person_model_loaded": person_model is not None,
        "person_model_path": str(PERSON_MODEL_PATH),
        "person_model_error": PERSON_MODEL_LOAD_ERROR,
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

    names = getattr(result, "names", {}) or {}
    for box in boxes or []:
        coordinates = [float(value) for value in box.xyxy[0].tolist()]
        label_id = int(box.cls[0].item())
        label = str(names.get(label_id, label_id))
        confidence = float(box.conf[0].item())
        lower_label = label.lower()

        if "helmet" in lower_label or "hard hat" in lower_label:
            counts["helmets"] += 1
        elif "vest" in lower_label or "jacket" in lower_label:
            counts["vests"] += 1
        elif "shoe" in lower_label or "boot" in lower_label:
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
        # Retain PPE-derived worker estimates if the person detector is not
        # available or did not find people in the frame.
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
async def detect(request: DetectRequest) -> Dict[str, Any]:
    if model is None:
        raise HTTPException(status_code=500, detail=f"AI model failed to load: {MODEL_LOAD_ERROR}")

    if not request.imageUrl and not request.imageBase64:
        raise HTTPException(status_code=400, detail="Provide imageUrl or imageBase64")

    try:
        if request.imageBase64:
            image = _read_image_from_base64(request.imageBase64)
        else:
            image = _read_image_from_url(request.imageUrl)

        result = model(image, imgsz=640, conf=0.35, verbose=False)[0]
        people_result = None
        if person_model is not None:
            people_result = person_model(
                image,
                imgsz=640,
                conf=0.25,
                classes=[PERSON_CLASS_ID],
                verbose=False,
            )[0]
        detections, alerts = _summarize_results(
            result,
            people_result=people_result,
            frame_size=image.size,
        )
        return {
            "ok": True,
            "status": f"AI analysis complete for {request.cameraIp or request.source or 'camera'}",
            "detections": detections,
            "alerts": alerts,
            "model": str(MODEL_PATH.name),
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - inference driver errors
        raise HTTPException(status_code=500, detail=f"Detection failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=False)

import base64
import io
import json
import os
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

app = FastAPI(title="Hazora AI Service", version="1.0.0")
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

try:
    model = YOLO(str(MODEL_PATH))
except Exception as exc:  # pragma: no cover - startup validation path
    model = None
    MODEL_LOAD_ERROR = str(exc)
else:
    MODEL_LOAD_ERROR = None


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
        "status": "healthy",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "error": MODEL_LOAD_ERROR,
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


def _summarize_results(result) -> Dict[str, Any]:
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

    if boxes is None:
        return counts, alerts

    names = getattr(result, "names", {}) or {}
    for box in boxes:
        xyxy = box.xyxy[0].tolist()
        label_id = int(box.cls[0].item())
        label = str(names.get(label_id, label_id))
        confidence = float(box.conf[0].item())

        if label.lower() in {"person", "people", "man", "woman"}:
            counts["persons"] += 1
        if "helmet" in label.lower() or "hard hat" in label.lower():
            counts["helmets"] += 1
        if "vest" in label.lower() or "jacket" in label.lower():
            counts["vests"] += 1
        if "shoe" in label.lower() or "boot" in label.lower():
            counts["shoes"] += 1

        alerts.append({
            "label": label,
            "confidence": round(confidence, 3),
            "bbox": [round(value, 2) for value in xyxy],
        })

    # The trained PPE model reports PPE items rather than explicit person boxes,
    # so estimate the worker count from the strongest signal available and use
    # that to derive missing PPE counts the dashboard expects.
    detected_persons = counts["persons"]
    estimated_persons = max(detected_persons, counts["helmets"], counts["vests"], counts["shoes"])
    counts["persons"] = estimated_persons
    counts["noHelmets"] = max(0, counts["persons"] - counts["helmets"])
    counts["noVests"] = max(0, counts["persons"] - counts["vests"])
    counts["noShoes"] = max(0, counts["persons"] - counts["shoes"])
    counts["compliant"] = min(counts["persons"], counts["helmets"], counts["vests"], counts["shoes"]) if counts["persons"] else 0
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

        result = model(image, imgsz=640, conf=0.35, verbose=False)[0]
        detections, alerts = _summarize_results(result)
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

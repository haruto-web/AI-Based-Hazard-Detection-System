# Hazora AI Service

This service runs PPE and person analysis outside the browser so the dashboard can keep streaming smoothly. It loads the PPE checkpoint and the repository's COCO `yolov8n.pt` checkpoint to count people even when no PPE is detected. Set `AI_MODEL_PATH` or `AI_PERSON_MODEL_PATH` to override either model path.

## PPE model accuracy

The checked-in training data currently contains 18 training images and 1 validation image. This is too little validation data to establish reliable helmet, vest, or shoe recall across different people, camera angles, and lighting. The backend uses confidence thresholds of 0.35 for helmets and shoes and 0.20 for vests; the browser fallback uses 0.56 for helmets and shoes and 0.20 for vests. Backend frames with mean luminance below 80/255 receive an autocontrast adjustment before inference; high-light frames are left unchanged because the available validation data does not establish a safe correction for glare or clipped highlights. The dashboard temporarily keeps a recent PPE detection for up to 5 seconds to avoid a one-frame flicker, but improving general accuracy requires adding varied, correctly labeled images and retraining the PPE model.

## Start

```bash
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

## Check health

```bash
curl http://localhost:8001/health
```

## Use from the dashboard

Set this in the dashboard .env file:

```env
VITE_AI_API_URL=http://localhost:8001
```

When set, the dashboard uses the backend AI service and loads the larger browser models only if the service is unavailable. Restart the dashboard after changing this value.

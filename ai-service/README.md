# Hazora AI Service

This service runs PPE and person analysis outside the browser so the dashboard can keep streaming smoothly. It loads the PPE checkpoint and the repository's COCO `yolov8n.pt` checkpoint to count people even when no PPE is detected. Set `AI_MODEL_PATH` or `AI_PERSON_MODEL_PATH` to override either model path.

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

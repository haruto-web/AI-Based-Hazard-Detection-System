# Hazora AI Service

This service runs PPE and person analysis outside the browser so the dashboard can keep streaming smoothly. The backend and browser use the same PPE TFLite model at `hazora-dashboard/public/models/ppe/yolov8n.tflite`; it is tracked with Git LFS. The backend also loads the repository's COCO `yolov8n.pt` checkpoint to count people even when no PPE is detected. Set `AI_MODEL_PATH` or `AI_PERSON_MODEL_PATH` to override either model path. The TFLite model requires the `ai-edge-litert` dependency, which is included in `requirements.txt`.

## PPE model accuracy

The model has seven classes: Safety Helmet, Safety Vest, Safety Shoes, Person, No Safety Helmet, No Safety Vest, and No Safety Shoes. Class names are supplied to the backend in `ppe-model.yaml` and to the browser in `hazora-dashboard/public/models/ppe/labels.txt`. The backend uses confidence thresholds of 0.35 for helmets and shoes and 0.20 for vests; the browser uses 0.56 for helmets and shoes and 0.20 for vests. These thresholds have not yet been validated against a labeled evaluation set for the new model. Backend frames with mean luminance below 80/255 receive an autocontrast adjustment. The dashboard temporarily keeps a recent PPE detection for up to 5 seconds to avoid a one-frame flicker.

On Windows, an application-control policy may block the native `ai-edge-litert` runtime even after it is installed. If that happens, the AI service still starts, but `/health` reports a degraded status and the model loading error; ask your administrator to allow the runtime rather than disabling the policy.

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

# Hazora AI Service

This service runs PPE, person, scaffolding, protruding-hazard, and material-handling detection outside the browser. The browser sends the ESP32 camera's capture URL to this service; keep the service on a computer that can reach the camera over the local network. All four models are TFLite files stored under `hazora-dashboard/public/models/` and tracked with Git LFS. The service runs them directly with LiteRT, loads the three hazard models lazily, and reuses loaded interpreters. Person boxes come from the `Person` class in the PPE model; no separate `.pt` model or PyTorch runtime is needed. Set `AI_MODEL_PATH`, `AI_SCAFFOLDING_MODEL_PATH`, `AI_PROTRUDING_MODEL_PATH`, or `AI_MATERIAL_MODEL_PATH` to override model paths. TFLite inference requires `ai-edge-litert`, included in `requirements.txt`.

The hazard models use a 0.30 confidence threshold. Their classes are `No Base` for scaffolding, `Potruding Hazard` and `Safety Cap` for protruding hazards, and `Organized` and `Messy` for material handling. Only `No Base`, `Potruding Hazard`, and `Messy` are returned as incident-worthy hazard alerts.

## PPE model accuracy

The model has seven classes: Safety Helmet, Safety Vest, Safety Shoes, Person, No Safety Helmet, No Safety Vest, and No Safety Shoes. Class names are supplied to the backend in `ppe-model.yaml` and to the browser in `hazora-dashboard/public/models/ppe/labels.txt`. The backend uses confidence thresholds of 0.35 for helmets and shoes and 0.20 for vests; the browser uses 0.56 for helmets and shoes and 0.20 for vests. These thresholds have not yet been validated against a labeled evaluation set for the new model. Backend frames with mean luminance below 80/255 receive an autocontrast adjustment. The dashboard temporarily keeps a recent PPE detection for up to 5 seconds to avoid a one-frame flicker.

The service uses LiteRT directly and does not import Ultralytics or PyTorch. If Windows Application Control blocks a LiteRT runtime file, `/health` reports a degraded status and the model loading error. Review the matching Code Integrity event and only change application-control rules if you are authorized and understand the security impact.

## Start locally on Windows

Double-click `run-local.bat` (or run it from Command Prompt). On first run it creates an `ai-service/.venv` virtual environment and installs the dependencies. Keep its window open while using the dashboard.

Start the dashboard separately with `hazora-dashboard/deploy/run-local.bat`. The dashboard's `.env` should contain `VITE_AI_API_URL=http://localhost:8001`.

To start the service manually, run these commands from `ai-service` after installing the dependencies:

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

When set, the dashboard uses the local AI service for all detections and does not fall back to loading the large hazard models in the browser if the service is unavailable. Start the AI service and restart the dashboard after changing this value.

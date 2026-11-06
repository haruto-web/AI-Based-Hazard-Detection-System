# Hazora AI Service

This service runs PPE, person, scaffolding, protruding-hazard, and material-handling detection outside the browser. The dashboard captures a JPEG frame from the ESP32 camera in the browser and sends the image to this API; the service computer does not need to fetch the camera URL itself. All four models are TFLite files stored under `hazora-dashboard/public/models/` and tracked with Git LFS. The service runs them directly with LiteRT using four CPU threads, loads the three hazard models lazily, and reuses loaded interpreters. Person boxes come from the `Person` class in the PPE model; no separate `.pt` model or PyTorch runtime is needed. Set `AI_MODEL_PATH`, `AI_SCAFFOLDING_MODEL_PATH`, `AI_PROTRUDING_MODEL_PATH`, or `AI_MATERIAL_MODEL_PATH` to override model paths. TFLite inference requires `ai-edge-litert`, included in `requirements.txt`.

The scaffolding, protruding/tripping, and material-handling models use confidence thresholds of 0.25. All three use 640x640 float32 input and a 0.70 IoU threshold. Scaffolding classes are `Standard Scaffolding Base`, `Diagonal Ridger Brace`, `Scaffolding`, `CrossRidge Brace`, `Standard Scaffolding Ladder`, and `No Base`; only `No Base` is an incident-worthy scaffolding alert. The supplied scaffolding model reports 99.5% mAP50, 98.6% mAP50-95, 99.7% precision, and 99.4% recall. The material model classes are `Organized` and `Messy`; the protruding/tripping model classes are `Potruding Hazard` and `Safety Cap`. These dataset evaluation metrics are not guarantees of live-camera accuracy; validate against representative site footage before relying on detections for safety decisions. The supplied camera frame used during material-model integration did not produce `Messy` above the configured 0.25 cutoff. Only `No Base`, `Potruding Hazard`, and `Messy` are returned as incident-worthy hazard alerts.

## PPE model accuracy

The model has seven classes: Safety Helmet, Safety Vest, Safety Shoes, Person, No Safety Helmet, No Safety Vest, and No Safety Shoes. Class names are supplied to the backend in `ppe-model.yaml` and to the browser in `hazora-dashboard/public/models/ppe/labels.txt`. Both backend and browser use a 0.20 confidence threshold for helmet, vest, and shoe detections, and 0.25 for person detections. These thresholds have not yet been validated against a labeled evaluation set for the new model. Backend frames with mean luminance below 80/255 receive an autocontrast adjustment. The dashboard temporarily keeps a recent PPE detection for up to 5 seconds to avoid a one-frame flicker.

The service uses LiteRT directly and does not import Ultralytics or PyTorch. If Windows Application Control blocks a LiteRT runtime file, `/health` reports a degraded status and the model loading error. Review the matching Code Integrity event and only change application-control rules if you are authorized and understand the security impact.

## Start locally on Windows

Double-click `run-local.bat` (or run it from Command Prompt). On first run it creates an `ai-service/.venv` virtual environment and installs the dependencies. Keep its window open while using the dashboard.

To choose detectors during a session, an authorized head-office safety role can expand **Operator detector settings** in the AI Detection panel and select PPE, scaffolding, protruding hazard, and/or material handling. The active selection appears in the existing detection status and is saved in that user's browser. A detector change takes effect on the next frame and does not require restarting either service. The optional `local-settings.bat` still sets the service's default mode before a dashboard selection is made; `AI_ACTIVE_DETECTORS` accepts `all` or a comma-separated selection.

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

# Hazora AI Service

This service runs the AI analysis outside the browser so the dashboard can keep streaming smoothly.

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

When set, the dashboard prefers the backend AI service and falls back to the browser model only if the service is unavailable.

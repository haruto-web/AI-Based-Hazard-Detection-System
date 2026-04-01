# 🏗️ AI-Based Hazard Detection System

A Django web application that uses Google Gemini AI to analyze construction site images for safety hazards and automatically notify engineers via email.

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Django](https://img.shields.io/badge/Django-5.2-green)
![Gemini](https://img.shields.io/badge/Google%20Gemini-2.0--flash-orange)

## Features

- 📷 **Camera Capture** – Take photos directly from your browser
- 📁 **Image Upload** – Upload existing site images
- 🤖 **AI Analysis** – Gemini 2.0 Flash identifies hazards and suggests precautions
- ⚠️ **Severity Rating** – LOW / MEDIUM / HIGH / CRITICAL classification
- 📧 **Email Alerts** – Automatic notifications to site engineers
- 📋 **Report History** – Browse recent hazard reports

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/AI-Based-Hazard-Detection-System.git
cd AI-Based-Hazard-Detection-System
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 2. Configure environment

```bash
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux
```

Edit `.env` with your credentials:

| Variable | Description |
|---|---|
| `DJANGO_SECRET_KEY` | Django secret key |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) API key |
| `NOTIFY_EMAIL` | Engineer email to receive alerts |
| `SMTP_USER` | Gmail address for sending |
| `SMTP_PASSWORD` | Gmail [App Password](https://myaccount.google.com/apppasswords) |
| `DB_NAME` | PostgreSQL database name (default: `hazard_detection`) |
| `DB_USER` | PostgreSQL user (default: `postgres`) |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_HOST` | Database host (default: `localhost`) |
| `DB_PORT` | Database port (default: `5432`) |

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE hazard_detection;"
```

### 4. Run

```bash
python manage.py migrate
python manage.py runserver
```

Open http://127.0.0.1:8000

## Project Structure

```
├── core/               # Django project settings & root URL config
├── detection/
│   ├── models.py       # HazardReport model
│   ├── views.py        # API endpoints & index view
│   ├── services.py     # Gemini AI analysis & email notification
│   ├── urls.py         # App routes
│   └── templates/      # Frontend (Tailwind CSS)
├── media/uploads/      # Uploaded images (git-ignored)
├── .env.example        # Environment variable template
├── requirements.txt    # Python dependencies
└── manage.py
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web interface |
| `POST` | `/api/analyze` | Upload & analyze image (multipart form: `image`) |
| `GET` | `/api/records` | Get recent 20 hazard reports (JSON) |

## License

[MIT](LICENSE)

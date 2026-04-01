import json
from pathlib import Path
from django.conf import settings
from django.core.mail import send_mail
from google import genai

PROMPT = """You are a construction site safety inspector AI.
Analyze this image and respond ONLY with valid JSON (no markdown, no code fences):
{
  "hazards_found": "description of all hazards detected, or 'No hazards detected'",
  "precautions": "recommended safety precautions",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL"
}
If no construction-related hazards are visible, set severity to LOW and describe what you see."""


def analyze_image(image_path: str) -> dict:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return {
            "hazards_found": "AI analysis unavailable – GEMINI_API_KEY not configured.",
            "precautions": "Please configure the API key in .env file.",
            "severity": "LOW",
        }

    client = genai.Client(api_key=api_key)
    img = client.files.upload(file=Path(image_path))
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[PROMPT, img],
    )

    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(text)


def notify_engineer(report):
    if not all([settings.NOTIFY_EMAIL, settings.EMAIL_HOST_USER]):
        return
    try:
        send_mail(
            subject=f"⚠️ Hazard Detected – Severity: {report.severity}",
            message=(
                f"Hazard Report – {report.created_at:%Y-%m-%d %H:%M}\n"
                f"Severity: {report.severity}\n\n"
                f"Hazards Found:\n{report.hazards_found}\n\n"
                f"Precautions:\n{report.precautions}"
            ),
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[settings.NOTIFY_EMAIL],
            fail_silently=True,
        )
    except Exception as e:
        print(f"Email notification failed: {e}")

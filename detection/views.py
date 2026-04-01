from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .models import HazardReport
from .services import analyze_image, notify_engineer


def index(request):
    return render(request, "detection/index.html")


@require_POST
def api_analyze(request):
    image = request.FILES.get("image")
    if not image:
        return JsonResponse({"error": "No image provided"}, status=400)

    report = HazardReport(image=image)
    report.save()

    result = analyze_image(report.image.path)
    report.hazards_found = result["hazards_found"]
    report.precautions = result["precautions"]
    report.severity = result["severity"]
    report.save()

    notify_engineer(report)

    return JsonResponse({
        "id": report.id,
        "image_url": report.image.url,
        "hazards_found": report.hazards_found,
        "precautions": report.precautions,
        "severity": report.severity,
        "created_at": report.created_at.isoformat(),
    })


def api_records(request):
    reports = HazardReport.objects.all()[:20]
    data = [
        {
            "id": r.id,
            "image_url": r.image.url,
            "hazards_found": r.hazards_found,
            "precautions": r.precautions,
            "severity": r.severity,
            "created_at": r.created_at.isoformat(),
        }
        for r in reports
    ]
    return JsonResponse(data, safe=False)

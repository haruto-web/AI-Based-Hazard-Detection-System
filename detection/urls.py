from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/analyze", views.api_analyze, name="api_analyze"),
    path("api/records", views.api_records, name="api_records"),
]

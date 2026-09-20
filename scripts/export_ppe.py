from ultralytics import YOLO
model = YOLO("runs/detect/training/runs/ppe-yolov8n/weights/best.pt")
exported = model.export(format="tflite", imgsz=640, nms=False, device="cpu")
print("Exported:", exported)

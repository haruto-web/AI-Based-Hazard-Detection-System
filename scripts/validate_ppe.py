from ultralytics import YOLO
model = YOLO("runs/detect/training/runs/ppe-yolov8n/weights/best.pt")
metrics = model.val(data="training/ppe/ppe.yaml", imgsz=640, batch=1, device="cpu", workers=0, project="training/validation", name="ppe-yolov8n")
print("mAP50:", metrics.box.map50)
print("mAP50-95:", metrics.box.map)
print("per-class mAP50:", metrics.box.maps)

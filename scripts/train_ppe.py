from ultralytics import YOLO

model = YOLO("yolov8n.pt")
model.train(
    data="training/ppe/ppe.yaml",
    epochs=50,
    imgsz=640,
    batch=4,
    device="cpu",
    workers=0,
    project="training/runs",
    name="ppe-yolov8n",
)

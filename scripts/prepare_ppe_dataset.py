import json
import sys
from pathlib import Path
from urllib.request import urlopen, Request

source = Path(r"D:\Downloads\ppe.ndjson")
output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("training/ppe")
records = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
dataset = next(record for record in records if record.get("type") == "dataset")
images = [record for record in records if record.get("type") == "image"]
class_names = [dataset["class_names"][str(index)] for index in range(len(dataset["class_names"]))]

for split in ("train", "val"):
    (output / "images" / split).mkdir(parents=True, exist_ok=True)
    (output / "labels" / split).mkdir(parents=True, exist_ok=True)

for index, record in enumerate(images):
    split = record.get("split", "train") if record.get("split") in {"train", "val"} else "train"
    suffix = Path(record["file"]).suffix or ".jpg"
    stem = f"{index:04d}"
    image_path = output / "images" / split / f"{stem}{suffix}"
    label_path = output / "labels" / split / f"{stem}.txt"
    if not image_path.exists():
        request = Request(record["url"], headers={"User-Agent": "HAZORA-training-dataset/1.0"})
        with urlopen(request, timeout=60) as response:
            image_path.write_bytes(response.read())
    boxes = record.get("annotations", {}).get("boxes", [])
    label_path.write_text("\n".join("%d %.6f %.6f %.6f %.6f" % tuple(box) for box in boxes) + ("\n" if boxes else ""), encoding="utf-8")

yaml_path = output / "ppe.yaml"
yaml_path.write_text(
    "path: %s\ntrain: images/train\nval: images/val\nnames:\n%s\n"
    % (output.resolve().as_posix(), "".join(f"  {index}: {name}\n" for index, name in enumerate(class_names))),
    encoding="utf-8",
)
print(f"Prepared {len(images)} images in {output}")
print(f"Classes: {class_names}")
print(f"Dataset YAML: {yaml_path}")

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

import app
from app import _prepare_ppe_image, _summarize_results


def detection(class_id, coordinates, confidence=0.9):
    return SimpleNamespace(
        cls=[SimpleNamespace(item=lambda: class_id)],
        xyxy=[SimpleNamespace(tolist=lambda: coordinates)],
        conf=[SimpleNamespace(item=lambda: confidence)],
    )


class SummarizeResultsTests(unittest.TestCase):
    def test_applies_the_lower_vest_confidence_threshold(self):
        ppe_result = SimpleNamespace(
            boxes=[detection(1, [40, 30, 60, 55], confidence=0.2)],
            names={1: "Safety Vest"},
        )

        counts, _ = _summarize_results(ppe_result)

        self.assertEqual(counts["vests"], 1)

    def test_drops_detections_below_their_class_confidence_threshold(self):
        ppe_result = SimpleNamespace(
            boxes=[
                detection(0, [40, 10, 60, 25], confidence=0.34),
                detection(1, [40, 30, 60, 55], confidence=0.19),
            ],
            names={0: "Safety Helmet", 1: "Safety Vest"},
        )

        counts, alerts = _summarize_results(ppe_result)

        self.assertEqual(counts["helmets"], 0)
        self.assertEqual(counts["vests"], 0)
        self.assertEqual(alerts, [])

    def test_autocontrasts_underexposed_frames_only(self):
        dark = Image.new("RGB", (100, 1))
        dark.putdata([(value, value, value) for value in range(20, 70)])
        normal = Image.new("RGB", (100, 1))
        normal.putdata([(value, value, value) for value in range(100, 200)])
        bright = Image.new("RGB", (100, 1))
        bright.putdata([(value, value, value) for value in range(200, 250)])

        prepared_dark = _prepare_ppe_image(dark)
        prepared_normal = _prepare_ppe_image(normal)
        prepared_bright = _prepare_ppe_image(bright)

        self.assertEqual(prepared_dark.convert("L").getextrema(), (0, 255))
        self.assertEqual(prepared_normal.tobytes(), normal.tobytes())
        self.assertEqual(prepared_bright.tobytes(), bright.tobytes())

    def test_detects_missing_helmet_for_person_wearing_vest_without_false_shoes(self):
        ppe_result = SimpleNamespace(
            boxes=[detection(1, [40, 30, 60, 55])],
            names={1: "Safety Vest"},
        )
        people_result = SimpleNamespace(
            boxes=[detection(0, [10, 5, 90, 99])],
            names={0: "person"},
        )

        counts, alerts = _summarize_results(
            ppe_result,
            people_result=people_result,
            frame_size=(100, 100),
        )

        self.assertEqual(counts["persons"], 1)
        self.assertEqual(counts["vests"], 1)
        self.assertEqual(counts["noHelmets"], 1)
        self.assertEqual(counts["noVests"], 0)
        self.assertEqual(counts["noShoes"], 0)
        self.assertEqual(counts["violations"], 1)
        self.assertEqual([alert["label"] for alert in alerts], ["Safety Vest"])

    def test_reports_a_person_missing_helmet_and_vest_even_when_no_ppe_is_detected(self):
        ppe_result = SimpleNamespace(boxes=[], names={})
        people_result = SimpleNamespace(
            boxes=[detection(0, [10, 5, 90, 75])],
            names={0: "person"},
        )

        counts, alerts = _summarize_results(
            ppe_result,
            people_result=people_result,
            frame_size=(100, 100),
        )

        self.assertEqual(counts["persons"], 1)
        self.assertEqual(counts["helmets"], 0)
        self.assertEqual(counts["vests"], 0)
        self.assertEqual(counts["noHelmets"], 1)
        self.assertEqual(counts["noVests"], 1)
        self.assertEqual(counts["violations"], 1)
        self.assertEqual(alerts, [])

    def test_keeps_ppe_count_fallback_when_person_detector_is_unavailable(self):
        ppe_result = SimpleNamespace(
            boxes=[detection(0, [40, 10, 60, 25])],
            names={0: "Safety Helmet"},
        )

        counts, _ = _summarize_results(ppe_result)

        self.assertEqual(counts["persons"], 1)
        self.assertEqual(counts["helmets"], 1)
        self.assertEqual(counts["noHelmets"], 0)
        self.assertEqual(counts["violations"], 1)

    def test_handles_explicit_missing_ppe_and_person_classes(self):
        ppe_result = SimpleNamespace(
            boxes=[
                detection(3, [10, 5, 90, 99]),
                detection(1, [40, 30, 60, 55]),
                detection(4, [40, 10, 60, 25]),
            ],
            names={
                0: "Safety Helmet",
                1: "Safety Vest",
                2: "Safety Shoes",
                3: "Person",
                4: "No Safety Helmet",
                5: "No Safety Vest",
                6: "No Safety Shoes",
            },
        )

        counts, alerts = _summarize_results(ppe_result, frame_size=(100, 100))

        self.assertEqual(counts["persons"], 1)
        self.assertEqual(counts["helmets"], 0)
        self.assertEqual(counts["vests"], 1)
        self.assertEqual(counts["noHelmets"], 1)
        self.assertEqual(counts["noVests"], 0)
        self.assertEqual(
            [alert["label"] for alert in alerts],
            ["Safety Vest", "No Safety Helmet"],
        )


class ModelStartupTests(unittest.IsolatedAsyncioTestCase):
    async def test_tflite_runtime_failure_is_reported_without_stopping_service(self):
        class BlockedModel:
            def __call__(self, *_args, **_kwargs):
                raise ImportError("TFLite runtime blocked")

        with (
            patch.object(app, "model", BlockedModel()),
            patch.object(app, "MODEL_LOAD_ERROR", None),
            patch.object(app, "person_model", None),
        ):
            async with app.lifespan(app.app):
                self.assertIsNone(app.model)
                self.assertEqual(app.MODEL_LOAD_ERROR, "TFLite runtime blocked")

    def test_default_model_path_uses_latest_tflite_file(self):
        self.assertEqual(
            app.DEFAULT_MODEL_PATH,
            app.ROOT_DIR / "hazora-dashboard" / "public" / "models" / "ppe" / "yolov8n.tflite",
        )


if __name__ == "__main__":
    unittest.main()

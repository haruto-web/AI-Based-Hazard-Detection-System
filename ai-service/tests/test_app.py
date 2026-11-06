import unittest
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

import app
from app import (
    _decode_yolo_output,
    _prepare_ppe_image,
    _summarize_hazard_results,
    _summarize_results,
)


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

        self.assertEqual(counts["helmets"], 1)
        self.assertEqual(counts["vests"], 0)
        self.assertEqual([alert["label"] for alert in alerts], ["Safety Helmet"])

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


class DecodeYoloOutputTests(unittest.TestCase):
    def test_decodes_letterboxed_boxes_and_suppresses_overlaps_per_class(self):
        output = app.np.zeros((6, 3), dtype=app.np.float32)
        output[:4, :] = app.np.asarray([
            [0.5, 0.51, 0.5],
            [0.5, 0.5, 0.5],
            [0.25, 0.25, 0.25],
            [0.25, 0.25, 0.25],
        ])
        output[4:, :] = app.np.asarray([
            [0.8, 0.7, 0.1],
            [0.1, 0.1, 0.9],
        ])

        boxes = _decode_yolo_output(
            output,
            image_size=(320, 320),
            scale_x=2,
            scale_y=2,
            pad_x=0,
            pad_y=0,
            input_width=640,
            input_height=640,
            confidence_threshold=0.3,
            channels_first=True,
            candidate_count=3,
        )

        self.assertEqual([int(box.cls[0][0]) for box in boxes], [1, 0])
        self.assertEqual(boxes[1].xyxy[0].tolist(), [120.0, 120.0, 200.0, 200.0])


class SummarizeHazardResultsTests(unittest.TestCase):
    def test_active_detector_setting_accepts_single_and_combined_modes(self):
        self.assertEqual(app._parse_active_detectors("ppe"), ("ppe",))
        self.assertEqual(
            app._parse_active_detectors("ppe, scaffolding"),
            ("ppe", "scaffolding"),
        )
        self.assertEqual(app._parse_active_detectors("all"), app.DETECTOR_NAMES)

    def test_active_detector_setting_rejects_unknown_names(self):
        with self.assertRaisesRegex(ValueError, "AI_ACTIVE_DETECTORS"):
            app._parse_active_detectors("ppe,unknown")

    def test_counts_material_classes_but_only_reports_messy(self):
        result = SimpleNamespace(
            boxes=[
                detection(0, [10, 10, 30, 30], confidence=0.8),
                detection(1, [40, 40, 70, 70], confidence=0.3),
                detection(1, [75, 75, 90, 90], confidence=0.29),
            ],
            names={0: "Organized", 1: "Messy"},
        )

        counts, alerts = _summarize_hazard_results(
            result,
            ["Organized", "Messy"],
            {"Messy"},
        )

        self.assertEqual(counts, {"Organized": 1, "Messy": 1})
        self.assertEqual([alert["label"] for alert in alerts], ["Messy"])
        self.assertEqual(alerts[0]["confidence"], 0.3)

    def test_scaffolding_uses_the_20_percent_threshold_for_inference_and_counts(self):
        result = SimpleNamespace(
            boxes=[
                detection(5, [10, 10, 30, 30], confidence=0.2),
                detection(5, [40, 40, 70, 70], confidence=0.19),
            ],
            names={5: "No Base"},
        )
        model_thresholds = []

        def fake_model(_image, conf):
            model_thresholds.append(conf)
            return [result]

        with (
            patch.dict(
                app.HAZARD_MODEL_CONFIG,
                {
                    "scaffolding": {
                        "path": app.Path("scaffolding.tflite"),
                        "labels": [
                            "Standard Scaffolding Base",
                            "Diagonal Ridger Brace",
                            "Scaffolding",
                            "CrossRidge Brace",
                            "Standard Scaffolding Ladder",
                            "No Base",
                        ],
                        "reportable": {"No Base"},
                        "confidence_threshold": 0.2,
                    }
                },
                clear=True,
            ),
            patch.object(app, "_load_hazard_model", return_value=fake_model),
        ):
            detections, alerts, errors = app._detect_hazards(
                Image.new("RGB", (20, 20)),
                active_detectors=("scaffolding",),
            )

        self.assertEqual(model_thresholds, [0.2])
        self.assertEqual(detections["scaffoldingClasses"]["No Base"], 1)
        self.assertEqual(detections["noBase"], 1)
        self.assertEqual([alert["label"] for alert in alerts], ["No Base"])
        self.assertEqual(errors, {})

    def test_uses_the_model_class_order_when_names_are_missing(self):
        result = SimpleNamespace(
            boxes=[detection(1, [10, 10, 30, 30], confidence=0.6)],
            names={},
        )

        counts, alerts = _summarize_hazard_results(
            result,
            ["Organized", "Messy"],
            {"Messy"},
        )

        self.assertEqual(counts["Messy"], 1)
        self.assertEqual([alert["label"] for alert in alerts], ["Messy"])

    def test_runs_hazard_models_sequentially_and_returns_confidence(self):
        result = SimpleNamespace(
            boxes=[detection(1, [10, 10, 30, 30], confidence=0.8)],
            names={0: "Organized", 1: "Messy"},
        )
        fake_model = lambda *_args, **_kwargs: [result]

        with (
            patch.dict(
                app.HAZARD_MODEL_CONFIG,
                {
                    "material": {
                        "path": app.Path("material.tflite"),
                        "labels": ["Organized", "Messy"],
                        "reportable": {"Messy"},
                    }
                },
                clear=True,
            ),
            patch.object(app, "_load_hazard_model", return_value=fake_model),
        ):
            detections, alerts, errors = app._detect_hazards(Image.new("RGB", (20, 20)))

        self.assertEqual(detections["materialClasses"], {"Organized": 0, "Messy": 1})
        self.assertEqual(detections["messyMaterialAreas"], 1)
        self.assertEqual(detections["materialConfidence"], 0.8)
        self.assertEqual([alert["label"] for alert in alerts], ["Messy"])
        self.assertEqual(errors, {})

    def test_only_loads_selected_hazard_models(self):
        result = SimpleNamespace(boxes=[], names={0: "Organized", 1: "Messy"})
        fake_model = lambda *_args, **_kwargs: [result]
        with (
            patch.object(app, "_load_hazard_model", return_value=fake_model) as load_model,
            patch.dict(app.HAZARD_MODEL_ERRORS, {}, clear=True),
        ):
            detections, alerts, errors = app._detect_hazards(
                Image.new("RGB", (20, 20)),
                active_detectors=("material",),
            )

        load_model.assert_called_once_with("material")
        self.assertEqual(detections["scaffoldingClasses"]["No Base"], 0)
        self.assertEqual(detections["protrudingClasses"]["Potruding Hazard"], 0)
        self.assertEqual(detections["materialClasses"]["Messy"], 0)
        self.assertEqual(alerts, [])
        self.assertEqual(errors, {})


class ModelStartupTests(unittest.IsolatedAsyncioTestCase):
    async def test_tflite_runtime_failure_is_reported_without_stopping_service(self):
        class BlockedModel:
            def __call__(self, *_args, **_kwargs):
                raise ImportError("TFLite runtime blocked")

        with patch.object(app, "TFLiteYoloModel", return_value=BlockedModel()), patch.object(
            app, "MODEL_LOAD_ERROR", None
        ):
            async with app.lifespan(app.app):
                self.assertIsNone(app.model)
                self.assertEqual(app.MODEL_LOAD_ERROR, "TFLite runtime blocked")

    def test_default_model_path_uses_latest_tflite_file(self):
        self.assertEqual(
            app.DEFAULT_MODEL_PATH,
            app.ROOT_DIR / "hazora-dashboard" / "public" / "models" / "ppe" / "yolov8n.tflite",
        )

    def test_detect_only_runs_the_active_detector_selection(self):
        image = Image.new("RGB", (20, 20))
        with (
            patch.object(app, "ACTIVE_DETECTORS", ("ppe", "scaffolding", "protruding", "material")),
            patch.object(app, "model", None),
            patch.object(app, "_read_image_from_base64", return_value=image),
            patch.object(
                app,
                "_detect_hazards",
                return_value=(
                    {
                        "scaffoldingClasses": {"No Base": 0},
                        "scaffoldingConfidence": 0,
                        "noBase": 0,
                        "protrudingClasses": {"Potruding Hazard": 0, "Safety Cap": 0},
                        "protrudingConfidence": 0,
                        "protrudingHazardCount": 0,
                        "materialClasses": {"Organized": 0, "Messy": 0},
                        "materialConfidence": 0,
                        "messyMaterialAreas": 0,
                    },
                    [],
                    {},
                ),
            ) as detect_hazards,
        ):
            response = app.detect(
                app.DetectRequest(
                    imageBase64="image",
                    activeDetectors=["scaffolding"],
                )
            )

        detect_hazards.assert_called_once_with(image, ("scaffolding",))
        self.assertEqual(response["activeDetectors"], ["scaffolding"])
        self.assertIn("AI analysis complete", response["status"])
        self.assertEqual(response["detections"]["persons"], 0)
        self.assertEqual(response["detections"]["noBase"], 0)


if __name__ == "__main__":
    unittest.main()

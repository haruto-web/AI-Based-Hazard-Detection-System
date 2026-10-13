import unittest
from types import SimpleNamespace

from app import _summarize_results


def detection(class_id, coordinates, confidence=0.9):
    return SimpleNamespace(
        cls=[SimpleNamespace(item=lambda: class_id)],
        xyxy=[SimpleNamespace(tolist=lambda: coordinates)],
        conf=[SimpleNamespace(item=lambda: confidence)],
    )


class SummarizeResultsTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()

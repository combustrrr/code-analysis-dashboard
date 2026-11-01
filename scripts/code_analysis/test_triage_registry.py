import json
import unittest
from datetime import UTC, datetime
from pathlib import Path

from scripts.code_analysis.monitoring import EvidenceError, effective_triage

ROOT = Path(__file__).resolve().parents[2]


class TriageRegistryTests(unittest.TestCase):
    def test_checked_in_decisions_are_current_and_auditable(self):
        registry = json.loads((ROOT / "config/code-analysis/triage-registry.json").read_text())
        decisions = registry["decisions"]

        self.assertEqual(len(decisions), 54)
        effective = effective_triage(registry, datetime(2026, 11, 1, tzinfo=UTC))
        self.assertEqual(len(effective), len(decisions))
        self.assertEqual({row["effective_status"] for row in effective.values()}, {"FALSE_POSITIVE"})

    def test_duplicate_decisions_fail_closed(self):
        decision = {"stable_id": "sid-v1:test", "status": "UNREVIEWED"}
        with self.assertRaisesRegex(EvidenceError, "duplicate"):
            effective_triage({"decisions": [decision, decision]})


if __name__ == "__main__":
    unittest.main()

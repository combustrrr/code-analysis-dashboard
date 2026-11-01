import unittest

from scripts.code_analysis.status_contract import (
    COMPLETE_STATUSES,
    CONTRACT,
    NOT_RUN_STATUSES,
    REPLACEMENT_ELIGIBLE_STATUSES,
    REUSABLE_STATUSES,
    is_complete,
    is_not_run,
    is_report_incomplete,
    is_replacement_eligible,
    is_reusable,
    semantics,
)


class ChannelStatusContractTests(unittest.TestCase):
    def test_only_retained_complete_evidence_is_reusable_or_replacement_eligible(self):
        expected = {
            "COMPLETED", "COMPLETED_OPTIONAL", "CONFIGURED_COMPLETE", "POLICY_FINDINGS",
        }
        self.assertEqual(COMPLETE_STATUSES, expected)
        self.assertEqual(REUSABLE_STATUSES, expected)
        self.assertEqual(REPLACEMENT_ELIGIBLE_STATUSES, expected)
        for status in ("NOT_APPLICABLE", "DEFERRED", "NOT_SELECTED"):
            self.assertFalse(is_complete(status))
            self.assertFalse(is_reusable(status))
            self.assertFalse(is_replacement_eligible(status))

    def test_every_declared_terminal_and_incomplete_state_obeys_its_contract(self):
        for status, expected in CONTRACT["statuses"].items():
            with self.subTest(status=status):
                self.assertEqual(is_complete(status), expected["complete"])
                self.assertEqual(is_reusable(status), expected["reusable"])
                self.assertEqual(is_replacement_eligible(status), expected["replacement_eligible"])
                self.assertEqual(is_report_incomplete(status), expected["report_incomplete"])
                self.assertEqual(is_not_run(status), expected["not_run"])
        self.assertEqual(NOT_RUN_STATUSES, {"NOT_APPLICABLE", "DEFERRED", "NOT_SELECTED"})

    def test_unknown_status_fails_closed_as_incomplete(self):
        self.assertEqual(semantics("NEW_PROVIDER_STATE")["category"], "unknown")
        self.assertFalse(is_complete("NEW_PROVIDER_STATE"))
        self.assertFalse(is_reusable("NEW_PROVIDER_STATE"))
        self.assertFalse(is_replacement_eligible("NEW_PROVIDER_STATE"))
        self.assertTrue(is_report_incomplete("NEW_PROVIDER_STATE"))


if __name__ == "__main__":
    unittest.main()

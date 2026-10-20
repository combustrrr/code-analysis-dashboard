import unittest

from scripts.code_analysis.queue_contract import scanner_target


class QueueContractTests(unittest.TestCase):
    def intent(self):
        request_id = "11111111-1111-4111-8111-111111111111"
        return {"request_id": request_id, "generation": 4, "lease_token": "lease-token", "intent": {
            "schema_version": "analysis-request-v4", "request_id": request_id,
            "idempotency_key": request_id, "actor_id": 73,
            "execution_repository_id": 1360051890,
            "project_id": "1278177697", "source_repository": "combustrrr/Agentic-Kibana",
            "source_repository_id": 1278177697, "source_sha": "a" * 40, "target_sha": "a" * 40,
            "tooling_sha": "b" * 40, "profile_digest": "c" * 64,
            "profile_mode": "portable", "selection": {"kind": "branch", "ref": "Testing"},
            "resolved_selection": {"repository": "combustrrr/Agentic-Kibana",
                                   "repository_id": 1278177697, "kind": "commit", "ref": "a" * 40},
            "requested_channels": ["semgrep"],
        }}

    def test_claim_becomes_pinned_target_with_embedded_envelope(self):
        claim = self.intent()
        row = scanner_target(claim)
        self.assertEqual(row["head_sha"], "a" * 40)
        self.assertEqual(row["source_repository"], "combustrrr/Agentic-Kibana")
        self.assertEqual(row["queue_intent"], claim["intent"])
        self.assertEqual(row["execution_channels"], ["semgrep"])

    def test_unpinned_or_identity_changed_claim_fails_closed(self):
        claim = self.intent()
        claim["intent"]["resolved_selection"]["ref"] = "d" * 40
        with self.assertRaises(ValueError):
            scanner_target(claim)
        claim = self.intent()
        claim["intent"]["resolved_selection"]["repository_id"] = 1
        with self.assertRaises(ValueError):
            scanner_target(claim)


if __name__ == "__main__":
    unittest.main()

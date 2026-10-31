import json
import tempfile
import unittest
from pathlib import Path

from scripts.code_analysis.workflow_annotations import ApiFailure, apply, collect, safe_path


SHA = "a" * 40
TOOLING = "b" * 40
PROFILE = "c" * 64


class FakeGitHub:
    def __init__(self, annotations=None, *, failure=None, summary=""):
        self.annotations = annotations or []
        self.failure = failure
        self.summary = summary
        self.paths = []

    def __call__(self, path):
        self.paths.append(path)
        if self.failure and "/annotations" in path:
            raise self.failure
        headers = {"x-ratelimit-remaining": "100"}
        if "/jobs?" in path:
            return {"jobs": [{"id": 22, "name": "build", "check_run_url": "https://api.github.com/repos/o/r/check-runs/33"}]}, headers
        if path.endswith("/check-runs/33"):
            return {"id": 33, "name": "build", "app": {"slug": "github-actions"},
                    "output": {"summary": self.summary}}, headers
        if "/annotations?" in path:
            page = int(path.rsplit("page=", 1)[1])
            return (self.annotations if page == 1 else []), headers
        raise AssertionError(path)


def identity(**values):
    result = dict(execution_repository="o/r", source_repository="s/r", source_sha=SHA,
                  workflow=".github/workflows/ci.yml", run_id=10, run_attempt=2,
                  tooling_sha=TOOLING, profile_digest=PROFILE)
    result.update(values)
    return result


class WorkflowAnnotationCollectionTests(unittest.TestCase):
    def test_collects_levels_ranges_missing_location_and_exact_attempt(self):
        rows = [
            {"id": 1, "annotation_level": "notice", "title": "R1", "message": "hello"},
            {"id": 2, "annotation_level": "warning", "title": "R2", "message": "warn",
             "path": "src/a.py", "start_line": 2, "end_line": 4, "start_column": 1, "end_column": 8},
            {"id": 3, "annotation_level": "failure", "title": "R3", "message": "bad", "path": "src/b.ts", "start_line": 7},
        ]
        fake = FakeGitHub(rows)
        result = collect(**identity(), fetch=fake)
        self.assertEqual(result["status"], "complete")
        self.assertEqual([row["level"] for row in result["annotations"]], ["notice", "warning", "failure"])
        self.assertEqual(result["annotations"][0]["location_kind"], "workflow")
        self.assertEqual(result["annotations"][1]["end_line"], 4)
        self.assertIn("/runs/10/attempts/2/jobs", fake.paths[0])
        self.assertTrue(all(row["source_sha"] == SHA and row["run_attempt"] == 2 for row in result["annotations"]))

    def test_sanitizes_polyglot_secrets_and_rejects_malicious_paths(self):
        rows = [
            {"annotation_level": "warning", "title": "<img onerror=alert(1)>",
             "message": "å¤šè¨€èªž <script>alert(1)</script> token=super-secret-value",
             "raw_details": "Authorization: Bearer never-retain-this", "path": "../../etc/passwd", "start_line": 1},
            {"annotation_level": "failure", "message": "signed https://x/y?signature=abcdef123456", "path": "C:\\runner\\temp.py"},
        ]
        result = collect(**identity(), fetch=FakeGitHub(rows))
        first, second = result["annotations"]
        self.assertIsNone(first["file"])
        self.assertIsNone(second["file"])
        self.assertIn("å¤šè¨€èªž <script>", first["message"])
        self.assertNotIn("super-secret-value", first["message"])
        self.assertNotIn("abcdef123456", second["message"])
        self.assertTrue(first["raw_details_withheld"])

    def test_error_states_are_explicit(self):
        for status, expected in ((403, "permission_denied"), (404, "unavailable"),
                                 (429, "rate_limited"), (500, "operational_failure")):
            with self.subTest(status=status):
                result = collect(**identity(), fetch=FakeGitHub(failure=ApiFailure(status, "failed", rate_limited=status == 429)))
                self.assertEqual(result["status"], expected)
                self.assertEqual(result["annotations"], [])
                self.assertEqual(result["diagnostics"][0]["http_status"], status)

    def test_partial_read_is_not_measured_zero(self):
        rows = [{"id": i, "annotation_level": "warning", "message": f"warning {i}"} for i in range(100)]
        class Partial(FakeGitHub):
            def __call__(self, path):
                if "/annotations" in path and "page=2" in path:
                    raise ApiFailure(500, "later page failed")
                return super().__call__(path)
        result = collect(**identity(), fetch=Partial(rows))
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["annotations"]), 100)
        self.assertIn("partial_read", {row["code"] for row in result["diagnostics"]})

    def test_summary_is_inventory_observation_and_plain_text(self):
        result = collect(**identity(), fetch=FakeGitHub(summary="### Build\n<script>x</script>"))
        self.assertEqual(result["annotations"][0]["source"], "job-summary")
        self.assertEqual(result["annotations"][0]["message"], "### Build\n<script>x</script>")

    def test_paths(self):
        self.assertEqual(safe_path("src/main.py"), "src/main.py")
        for path in ("../a", "/etc/a", "C:/a", "/home/runner/work/a", "a\x00b"):
            self.assertIsNone(safe_path(path))


class WorkflowAnnotationReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "details").mkdir()
        report = {"schema_version": "hosted-report-v1", "analyzed_sha": SHA, "generated_at": "2026-01-01T00:00:00Z",
                  "report_generation_timestamp": "2026-01-01T00:00:00Z", "status": "current", "finding_count": 1,
                  "observation_count": 1, "incomplete_channels": [], "severities": {"HIGH": 1},
                  "channels": [{"channel": "semgrep", "name": "Semgrep", "class": "security", "status": "COMPLETED",
                                "findings": 1, "observation_count": 1, "observation_ids": ["native-1"], "reason": "", "workflow": "ci"}],
                  "producer_runs": [{"id": "10", "url": "https://github.com/o/r/actions/runs/10"}],
                  "publication_gate": {"satisfied": True}}
        finding = {"id": "finding-1", "severity": "HIGH", "category": "SECURITY", "message": "SQL injection",
                   "file": "src/a.py", "line": 5, "scanners": ["Semgrep"], "rules": ["python.sql-injection"],
                   "observation_count": 1, "scanner_family_count": 1, "page": 0}
        detail = {**finding, "origins": [{"scanner_family": "Semgrep", "rule": "python.sql-injection", "file": "src/a.py",
                                           "start_line": 5, "raw_artifact": "semgrep.json", "observation_id": "native-1"}],
                  "source": None, "source_start": None, "source_url": None}
        for name, value in (("report.json", report), ("findings.json", [finding]), ("details/0.json", [detail])):
            path = self.root / name
            path.write_text(json.dumps(value), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def envelope(self, annotations, status="complete"):
        return {"schema_version": "workflow-annotation-evidence-v1", "identity": identity(), "status": status,
                "annotations": annotations, "diagnostics": [], "truncated": status == "truncated", "inventory": []}

    def annotation(self, **values):
        row = {"annotation_id": "workflow-annotation:1", "level": "warning", "title": "python.sql-injection",
               "message": "SQL injection", "file": "src/a.py", "start_line": 5, "end_line": 5,
               "source": "check-run", "workflow": ".github/workflows/ci.yml", "run_id": 10, "run_attempt": 2,
               "job": "semgrep", "step": None, "check_run_id": 33, "action_identity": "semgrep",
               "correlation": {"status": "unmatched", "finding_id": None, "scanner": None}}
        row.update(values)
        return row

    def test_exact_correlation_preserves_support_without_double_counting(self):
        result = apply(self.root, self.envelope([self.annotation()]))
        self.assertEqual(result["finding_count"], 1)
        details = json.loads((self.root / "details/0.json").read_text())
        self.assertEqual(len(details[0]["origins"]), 2)
        evidence = json.loads((self.root / "workflow-annotations.json").read_text())
        self.assertEqual(evidence["annotations"][0]["correlation"]["status"], "supporting")

    def test_unmatched_annotation_becomes_visible_workflow_finding(self):
        result = apply(self.root, self.envelope([self.annotation(annotation_id="workflow-annotation:2", title="build-warning",
                                                                  action_identity="github-actions", file=None,
                                                                  start_line=None, message="Build warning")]))
        self.assertEqual(result["finding_count"], 2)
        findings = json.loads((self.root / "findings.json").read_text())
        self.assertEqual(findings[1]["category"], "WORKFLOW")
        self.assertEqual(findings[1]["annotation"]["job"], "semgrep")

    def test_unavailable_keeps_native_sibling_and_marks_report_partial(self):
        envelope = self.envelope([], "permission_denied")
        envelope["diagnostics"] = [{"message": "missing actions read permission"}]
        result = apply(self.root, envelope)
        self.assertEqual(result["finding_count"], 1)
        self.assertEqual(result["status"], "partial")
        channel = next(row for row in result["channels"] if row["channel"] == "workflow-annotations")
        self.assertIsNone(channel["findings"])
        self.assertEqual(channel["status"], "NOT_AVAILABLE")


if __name__ == "__main__":
    unittest.main()


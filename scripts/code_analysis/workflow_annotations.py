"""Bounded collection and reconciliation of GitHub Actions annotations.

This module runs only in trusted publication tooling after the producer run and
attempt have been validated.  It never accepts a run identifier from a browser.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath
from typing import Callable

from scripts.code_analysis.hosted import digest, load, write
from scripts.code_analysis.project_overview import build_project_overview
from scripts.code_analysis.workspace_documents import build_workspace_documents

SCHEMA = "workflow-annotation-evidence-v1"
MAX_PAGES = 10
PAGE_SIZE = 100
MAX_ANNOTATIONS = 1000
MAX_MESSAGE = 4000
MAX_SUMMARY = 8000
LEVELS = {"notice", "warning", "failure"}
SHA = re.compile(r"^[0-9a-f]{40}$")
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SECRET = re.compile(
    r"(?i)(bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:token|secret|password|api[_-]?key)\s*[:=]\s*\S+|"
    r"https?://[^\s?#]+\?[^\s]*(?:token|signature|sig|key)=[^\s&]+|gh[opusr]_[A-Za-z0-9]{20,})"
)
AUTHORIZATION = re.compile(
    r"(?i)\b(?:proxy-)?authorization\s*[:=]\s*(?:basic|bearer|digest|token)\s+[A-Za-z0-9._~+/=-]+"
)
ENVIRONMENT_CREDENTIAL = re.compile(
    r"(?i)\b(?:AWS|R2|S3|CLOUDFLARE|CLOUDFLARE_R2)_"
    r"(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN|API_TOKEN|API_KEY|TOKEN|SECRET|PASSWORD)"
    r"\s*[:=]\s*(?:\"[^\"\r\n]*\"|'[^'\r\n]*'|[^\s,;]+)"
)
RUNNER_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|/(?:home/runner|opt/hostedtoolcache|tmp|__w)/)", re.I)
WORKFLOW_UPDATE = re.compile(
    r"(?i)\b(?:deprecated|deprecation|outdated|no longer supported|"
    r"will be forced to run using node|uses? node(?:\.js)?\s*[0-9]+)\b"
)

# Validation annotations may be downgraded only by an exact, reviewed execution
# identity. Annotation, job, and check text are provider-controlled evidence and
# are never treated as fixture provenance merely because they contain words such
# as "canary" or "negative test".
VALIDATION_FIXTURE_RULES = ({
    "rule_id": "canary-coverage-workflow-v1",
    "workflow": ".github/workflows/06-canary-validation.yml",
    "job": "Scan Canary Suite with All Tools",
    "check_name": "Scan Canary Suite with All Tools",
    "action_identity": "github-actions",
},)

# Exact aliases connect reviewed GitHub check-job identities to the canonical
# scanner families retained in native evidence. There is deliberately no
# substring fallback: an unrecognized identity remains an unmatched workflow
# observation instead of being silently deduplicated.
SCANNER_IDENTITY_ALIASES = {
    "bandit": "bandit",
    "banditpythonsecurity": "bandit",
    "coderabbit": "coderabbit",
    "isolatedcoderabbitevidence": "coderabbit",
    "checkov": "checkov",
    "checkoviacsecurity": "checkov",
    "codeql": "codeql",
    "codeqlsemanticsast": "codeql",
    "eslint": "eslint",
    "eslinttsctypescriptreact": "eslint",
    "coveragepy": "coveragepy",
    "pytestcoverage": "coveragepy",
    "gitleaks": "gitleaks",
    "gitleakssecretsdetection": "gitleaks",
    "hadolint": "hadolint",
    "hadolintdockerfilelint": "hadolint",
    "osvscanner": "osvscanner",
    "osvscannerdependencycves": "osvscanner",
    "openssfscorecard": "openssfscorecard",
    "scorecard": "openssfscorecard",
    "pyright": "pyright",
    "pyrightpythontypechecking": "pyright",
    "radon": "radon",
    "radoncomplexitymetrics": "radon",
    "repositorysecurityposture": "repositorysecurityposture",
    "ruff": "ruff",
    "ruffpythonlintformat": "ruff",
    "semgrep": "semgrep",
    "semgreppatternanalysis": "semgrep",
    "shippingimagetrivy": "shippingimagetrivy",
    "sbompolicy": "sbompolicy",
    "snyk": "snyk",
    "isolatedsnykevidence": "snyk",
    "sonarqubecloud": "sonarqubecloud",
    "isolatedsonarqubeevidence": "sonarqubecloud",
    "trivy": "trivy",
    "trivyfilesystemcontainersecurity": "trivy",
    "typescript": "typescript",
    "atheris": "atheris",
    "atherisstatemachinefuzzing": "atheris",
    "schemathesis": "schemathesis",
    "schemathesisapifuzzing": "schemathesis",
    "vulture": "vulture",
    "vulturedeadcodedetection": "vulture",
    "xenon": "xenon",
    "xenoncomplexitythresholds": "xenon",
    "zizmor": "zizmor",
    "githubactionssecurityzizmor": "zizmor",
    "njsscan": "njsscan",
    "trufflehog": "trufflehog",
    "grype": "grype",
}


class ApiFailure(RuntimeError):
    def __init__(self, status: int, reason: str, *, rate_limited: bool = False):
        super().__init__(reason)
        self.status = status
        self.rate_limited = rate_limited


def _text(value: object, limit: int = MAX_MESSAGE) -> str:
    text = CONTROL.sub("", str(value or "")).replace("\r\n", "\n").replace("\r", "\n")
    text = AUTHORIZATION.sub("Authorization: [credential withheld]", text)
    text = ENVIRONMENT_CREDENTIAL.sub("[credential environment value withheld]", text)
    text = SECRET.sub("[credential withheld]", text)
    return text[:limit]


def safe_path(value: object) -> str | None:
    text = str(value or "").replace("\\", "/")
    if not text or CONTROL.search(text) or RUNNER_PATH.search(text):
        return None
    path = PurePosixPath(text)
    if path.is_absolute() or ".." in path.parts or ":" in text or text.startswith("~"):
        return None
    return path.as_posix()


def _int(value: object) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _policy(identity: dict, job: dict, check: dict, level: str) -> tuple[str, dict]:
    provenance = {
        "workflow": identity.get("workflow"),
        "job": str(job.get("name") or ""),
        "check_name": str(check.get("name") or ""),
        "action_identity": str(check.get("app", {}).get("slug") or "")
        if isinstance(check.get("app"), dict) else "",
    }
    for rule in VALIDATION_FIXTURE_RULES:
        if all(provenance[key] == rule[key] for key in (
                "workflow", "job", "check_name", "action_identity")):
            return "validation_fixture", {
                "rule_id": rule["rule_id"],
                "basis": "reviewed_exact_execution_identity",
            }
    return ("advisory" if level == "notice" else "actionable"), {
        "rule_id": "annotation-level-policy-v1",
        "basis": "annotation_level",
    }


def _annotation_kind(title: object, message: object) -> str:
    return "workflow_update" if WORKFLOW_UPDATE.search(f"{title or ''}\n{message or ''}") else "workflow_observation"


def _status(error: ApiFailure) -> str:
    if error.rate_limited or error.status == 429:
        return "rate_limited"
    if error.status == 403:
        return "permission_denied"
    if error.status == 404:
        return "unavailable"
    if error.status >= 500:
        return "operational_failure"
    return "invalid"


class GitHubReader:
    """Small read-only GitHub client which retains status and rate-limit headers."""

    def __init__(self, repository: str, token: str | None = None):
        if not REPOSITORY.fullmatch(repository):
            raise ValueError("invalid execution repository")
        self.repository = repository
        self.token = token if token is not None else os.environ.get("GH_TOKEN", "")

    def get(self, path: str) -> tuple[object, dict[str, str]]:
        url = "https://api.github.com/" + path.lstrip("/")
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "workflow-annotation-collector/1",
                   "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read(5_000_001)
                if len(body) > 5_000_000:
                    raise ApiFailure(413, "GitHub response exceeded the bounded payload")
                return json.loads(body or b"null"), {key.lower(): value for key, value in response.headers.items()}
        except urllib.error.HTTPError as error:
            headers = {key.lower(): value for key, value in error.headers.items()}
            limited = headers.get("x-ratelimit-remaining") == "0" or error.code == 429
            raise ApiFailure(error.code, f"GitHub annotation API returned HTTP {error.code}", rate_limited=limited) from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ApiFailure(503, "GitHub annotation API was unavailable") from error


def _page(fetch: Callable[[str], tuple[object, dict[str, str]]], path: str, field: str | None,
          *, maximum: int = MAX_ANNOTATIONS) -> tuple[list[dict], bool, list[dict]]:
    rows: list[dict] = []
    diagnostics: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        separator = "&" if "?" in path else "?"
        try:
            value, headers = fetch(f"{path}{separator}per_page={PAGE_SIZE}&page={page}")
        except ApiFailure as error:
            if not rows:
                raise
            diagnostics.append({"code": "partial_read", "http_status": error.status,
                                "message": "GitHub API failed after a bounded partial read"})
            return rows, True, diagnostics
        current = value.get(field) if field and isinstance(value, dict) else value
        if not isinstance(current, list) or any(not isinstance(row, dict) for row in current):
            raise ApiFailure(422, "GitHub annotation response had an invalid shape")
        rows.extend(current[:max(0, maximum - len(rows))])
        remaining = headers.get("x-ratelimit-remaining")
        if remaining == "0":
            diagnostics.append({"code": "rate_limit_exhausted", "message": "GitHub rate limit reached after a partial read"})
            return rows, True, diagnostics
        if len(rows) >= maximum:
            diagnostics.append({"code": "result_limit", "message": f"Collection stopped at {maximum} records"})
            return rows, True, diagnostics
        if len(current) < PAGE_SIZE:
            return rows, False, diagnostics
    diagnostics.append({"code": "page_limit", "message": f"Collection stopped after {MAX_PAGES} pages"})
    return rows, True, diagnostics


def _record(annotation: dict, *, job: dict, check: dict, identity: dict, source: str = "check-run") -> dict | None:
    level = str(annotation.get("annotation_level") or "notice").lower()
    if level not in LEVELS:
        return None
    path = safe_path(annotation.get("path"))
    native_id = annotation.get("id")
    stable = str(native_id) if native_id is not None else digest([
        check.get("id"), path, annotation.get("start_line"), annotation.get("end_line"),
        annotation.get("title"), annotation.get("message"),
    ])[:24]
    policy, policy_provenance = _policy(identity, job, check, level)
    run_url = f"https://github.com/{identity['execution_repository']}/actions/runs/{identity['run_id']}/attempts/{identity['run_attempt']}"
    file_url = (f"https://github.com/{identity['source_repository']}/blob/{identity['source_sha']}/{path}"
                + (f"#L{annotation.get('start_line')}" if path and _int(annotation.get("start_line")) else "")) if path else None
    return {
        "annotation_id": "workflow-annotation:" + stable,
        "native_id": native_id,
        "source": source,
        "level": level,
        "title": _text(annotation.get("title"), 500),
        "message": _text(annotation.get("message")),
        "raw_details_withheld": bool(annotation.get("raw_details")),
        "location_kind": "source" if path else "workflow",
        "file": path,
        "start_line": _int(annotation.get("start_line")),
        "end_line": _int(annotation.get("end_line")),
        "start_column": _int(annotation.get("start_column")),
        "end_column": _int(annotation.get("end_column")),
        "execution_repository": identity["execution_repository"],
        "source_repository": identity["source_repository"],
        "source_sha": identity["source_sha"],
        "workflow": identity["workflow"],
        "run_id": identity["run_id"],
        "run_attempt": identity["run_attempt"],
        "job_id": job.get("id"),
        "job": _text(job.get("name"), 300),
        "step": None,
        "step_provenance": {
            "status": "unavailable",
            "reason": "github_check_run_annotations_do_not_expose_step_identity",
        },
        "check_run_id": check.get("id"),
        "check_name": _text(check.get("name"), 300),
        "action_identity": _text(check.get("app", {}).get("slug"), 100) if isinstance(check.get("app"), dict) else "",
        "tooling_sha": identity["tooling_sha"],
        "profile_digest": identity["profile_digest"],
        "policy": policy,
        "policy_provenance": policy_provenance,
        "kind": _annotation_kind(annotation.get("title"), annotation.get("message")),
        "contributes_to_needs_attention": policy == "actionable",
        "run_url": run_url,
        "check_url": f"https://github.com/{identity['execution_repository']}/runs/{check.get('id')}" if check.get("id") else None,
        "file_url": file_url,
        "correlation": {"status": "unmatched", "finding_id": None, "scanner": None},
    }


def collect(*, execution_repository: str, source_repository: str, source_sha: str,
            workflow: str, run_id: int, run_attempt: int, tooling_sha: str,
            profile_digest: str, fetch: Callable[[str], tuple[object, dict[str, str]]] | None = None) -> dict:
    if (not REPOSITORY.fullmatch(execution_repository) or not REPOSITORY.fullmatch(source_repository)
            or not SHA.fullmatch(source_sha) or not SHA.fullmatch(tooling_sha)
            or not re.fullmatch(r"[0-9a-f]{64}", profile_digest or "")
            or type(run_id) is not int or run_id <= 0 or type(run_attempt) is not int or run_attempt <= 0):
        raise ValueError("annotation collection identity is invalid")
    identity = locals().copy()
    reader = GitHubReader(execution_repository)
    fetch = fetch or reader.get
    envelope = {
        "schema_version": SCHEMA, "identity": {key: identity[key] for key in (
            "execution_repository", "source_repository", "source_sha", "workflow", "run_id",
            "run_attempt", "tooling_sha", "profile_digest")},
        "status": "measured_zero", "annotations": [], "diagnostics": [], "truncated": False,
        "inventory": [
            {"source": "check-run", "coverage": "collected"},
            {"source": "workflow-command", "coverage": "via-check-run-annotations"},
            {"source": "problem-matcher", "coverage": "via-check-run-annotations"},
            {"source": "action-generated", "coverage": "via-check-run-annotations"},
            {"source": "job-summary", "coverage": "reviewed-sanitized-summary"},
        ],
    }
    try:
        jobs, truncated, diagnostics = _page(
            fetch, f"repos/{execution_repository}/actions/runs/{run_id}/attempts/{run_attempt}/jobs", "jobs", maximum=500)
        envelope["truncated"] |= truncated
        envelope["diagnostics"].extend(diagnostics)
        for job in jobs:
            check_url = str(job.get("check_run_url") or "")
            match = re.search(r"/check-runs/([1-9][0-9]*)$", check_url)
            if not match:
                envelope["diagnostics"].append({"code": "missing_check_identity", "job_id": job.get("id"),
                                                "message": "Job did not expose a trusted check-run identity"})
                continue
            check_id = int(match.group(1))
            check_value, _ = fetch(f"repos/{execution_repository}/check-runs/{check_id}")
            if not isinstance(check_value, dict) or check_value.get("id") != check_id:
                raise ApiFailure(422, "Check-run identity did not reconcile")
            annotations, cut, notes = _page(fetch, f"repos/{execution_repository}/check-runs/{check_id}/annotations", None,
                                             maximum=max(0, MAX_ANNOTATIONS - len(envelope["annotations"])))
            envelope["truncated"] |= cut
            envelope["diagnostics"].extend(notes)
            for annotation in annotations:
                row = _record(annotation, job=job, check=check_value, identity=envelope["identity"])
                if row:
                    envelope["annotations"].append(row)
            summary = check_value.get("output", {}).get("summary") if isinstance(check_value.get("output"), dict) else None
            if summary and len(envelope["annotations"]) < MAX_ANNOTATIONS:
                row = _record({"annotation_level": "notice", "title": "Job summary",
                               "message": _text(summary, MAX_SUMMARY)}, job=job, check=check_value,
                              identity=envelope["identity"], source="job-summary")
                if row:
                    envelope["annotations"].append(row)
            if len(envelope["annotations"]) >= MAX_ANNOTATIONS:
                envelope["truncated"] = True
                envelope["diagnostics"].append({"code": "result_limit", "message": "Annotation envelope is truncated"})
                break
    except ApiFailure as error:
        envelope["status"] = _status(error) if not envelope["annotations"] else "partial"
        envelope["diagnostics"].append({"code": envelope["status"], "http_status": error.status,
                                        "message": str(error)})
        return envelope
    if any(row.get("code") == "partial_read" for row in envelope["diagnostics"]):
        envelope["status"] = "partial"
    elif envelope["truncated"]:
        envelope["status"] = "truncated"
    elif envelope["diagnostics"]:
        envelope["status"] = "partial"
    elif envelope["annotations"]:
        envelope["status"] = "complete"
    return envelope


def _scanner_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _canonical_scanner_identity(value: object) -> str | None:
    key = _scanner_key(str(value or ""))
    return SCANNER_IDENTITY_ALIASES.get(key)


def _annotation_scanner_identities(annotation: dict) -> set[str]:
    identities: set[str] = set()
    for field in ("action_identity", "check_name", "job"):
        value = str(annotation.get(field) or "")
        candidates = [value]
        if " / " in value:
            candidates.append(value.rsplit(" / ", 1)[-1])
        for candidate in candidates:
            canonical = _canonical_scanner_identity(candidate)
            if canonical:
                identities.add(canonical)
    return identities


def _correlate(annotation: dict, details: list[dict], source_sha: str) -> dict | None:
    if (annotation.get("source_sha") != source_sha or not SHA.fullmatch(str(source_sha or ""))
            or annotation.get("file") is None or annotation.get("start_line") is None):
        return None
    annotation_path = safe_path(annotation.get("file"))
    title = _scanner_key(str(annotation.get("title") or ""))
    annotation_scanners = _annotation_scanner_identities(annotation)
    if not annotation_path or not title or not annotation_scanners:
        return None
    candidates = []
    for detail in details:
        if safe_path(detail.get("file")) != annotation_path or detail.get("line") != annotation["start_line"]:
            continue
        if (detail.get("end_line") or detail.get("line")) != (annotation.get("end_line") or annotation.get("start_line")):
            continue
        rules = {_scanner_key(str(value)) for value in detail.get("rules", [])}
        scanner_values = list(detail.get("scanners", [])) + [
            origin.get("scanner_family") for origin in detail.get("origins", []) if isinstance(origin, dict)
        ]
        scanners = {_canonical_scanner_identity(value) for value in scanner_values}
        scanners.discard(None)
        exact_rule = title in rules
        exact_scanner = bool(annotation_scanners & scanners)
        if exact_rule and exact_scanner:
            candidates.append(detail)
    return candidates[0] if len(candidates) == 1 else None


def apply(destination: Path, envelope: dict) -> dict:
    """Apply annotations without allowing annotation failure to erase scanner evidence."""
    if envelope.get("schema_version") != SCHEMA:
        raise ValueError("unsupported workflow annotation envelope")
    report = load(destination / "report.json")
    findings = load(destination / "findings.json")
    detail_paths = sorted((destination / "details").glob("*.json"), key=lambda path: int(path.stem))
    details = [row for path in detail_paths for row in load(path)]
    by_id = {row["id"]: row for row in details}
    snapshot_path = destination / "snapshot.json"
    snapshot = load(snapshot_path) if snapshot_path.exists() else None
    snapshot_findings = {row.get("stable_id"): row for row in snapshot.get("canonical_findings", [])} if snapshot else {}
    unique = []
    for annotation in envelope.get("annotations", []):
        correlated = _correlate(annotation, details, report["analyzed_sha"])
        origin = {
            "scanner_family": "Workflow annotations", "rule": annotation.get("title") or "workflow-annotation",
            "file": annotation.get("file") or "", "start_line": annotation.get("start_line") or 0,
            "raw_artifact": "workflow-annotations.json", "observation_id": annotation["annotation_id"],
            "annotation": {key: annotation.get(key) for key in (
                "source", "level", "run_id", "run_attempt", "job", "step", "step_provenance",
                "check_run_id", "policy", "policy_provenance", "kind")},
        }
        if correlated:
            annotation["correlation"] = {"status": "supporting", "finding_id": correlated["id"],
                                         "scanner": correlated.get("scanners", [None])[0] if correlated.get("scanners") else None}
            target = by_id[correlated["id"]]
            annotation_meta = {key: annotation.get(key) for key in (
                "source", "level", "workflow", "run_id", "run_attempt", "job", "step", "step_provenance",
                "check_run_id", "check_name", "action_identity", "source_sha", "correlation", "policy",
                "policy_provenance", "kind", "contributes_to_needs_attention", "run_url", "check_url", "file_url")}
            correlated.setdefault("annotation", annotation_meta)
            target.setdefault("annotation", annotation_meta)
            if not any(value.get("observation_id") == annotation["annotation_id"] for value in target["origins"]):
                target["origins"].append(origin)
                target["observation_count"] = len(target["origins"])
                correlated["observation_count"] = target["observation_count"]
            if correlated["id"] in snapshot_findings:
                snapshot_findings[correlated["id"]].setdefault("observation_ids", []).append(annotation["annotation_id"])
            continue
        fid = annotation["annotation_id"]
        severity = "INFO" if annotation.get("policy") == "validation_fixture" else {"failure": "HIGH", "warning": "MEDIUM", "notice": "INFO"}[annotation["level"]]
        category = ("VALIDATION" if annotation.get("policy") == "validation_fixture"
                    else "WORKFLOW_UPDATE" if annotation.get("kind") == "workflow_update" else "WORKFLOW")
        row = {"id": fid, "severity": severity, "category": category, "message": annotation["message"],
               "file": annotation.get("file") or "", "line": annotation.get("start_line") or 0,
               "scanners": ["Workflow annotations"], "rules": [annotation.get("title") or "workflow-annotation"],
               "observation_count": 1, "scanner_family_count": 1, "page": 0,
               "annotation": {key: annotation.get(key) for key in (
                   "source", "level", "workflow", "run_id", "run_attempt", "job", "step", "step_provenance",
                   "check_run_id", "check_name", "action_identity", "source_sha", "correlation", "policy",
                   "policy_provenance", "kind", "contributes_to_needs_attention", "run_url", "check_url", "file_url")}}
        detail = {**row, "origins": [origin], "source": None, "source_start": None, "source_url": None}
        findings.append(row)
        details.append(detail)
        by_id[fid] = detail
        unique.append(fid)
        if snapshot is not None:
            snapshot["canonical_findings"].append({
                "stable_id": fid, "severity": severity, "category": category,
                "concept": "workflow-annotation", "message": annotation["message"],
                "file": annotation.get("file") or "", "start_line": annotation.get("start_line") or 0,
                "end_line": annotation.get("end_line") or annotation.get("start_line") or 0,
                "supporting_scanner_families": ["Workflow annotations"],
                "observation_ids": [annotation["annotation_id"]],
            })
    for index, row in enumerate(findings):
        row["page"] = index // 100
    for path in detail_paths:
        path.unlink()
    for start in range(0, len(details), 100):
        write(destination / "details" / f"{start // 100}.json", details[start:start + 100])
    status = envelope.get("status")
    complete = status in {"complete", "measured_zero"}
    state_reasons = {
        "complete": "Workflow annotations were collected completely for the exact run and attempt.",
        "measured_zero": "GitHub returned zero workflow annotations for the exact run and attempt.",
        "partial": "Some workflow annotations were retained, but collection was incomplete.",
        "truncated": "Workflow annotation collection reached a reviewed bound and was truncated.",
        "permission_denied": "GitHub denied permission to read workflow annotations.",
        "rate_limited": "GitHub rate limiting prevented workflow annotation collection.",
        "unavailable": "GitHub workflow annotation evidence was unavailable.",
        "invalid": "GitHub returned invalid workflow annotation evidence.",
        "operational_failure": "Workflow annotation collection failed operationally.",
    }
    diagnostic_reason = "; ".join(row.get("message", "") for row in envelope.get("diagnostics", []))[:1000]
    channel = {"channel": "workflow-annotations", "name": "Workflow annotations", "class": "reliability",
               "status": "COMPLETED_OPTIONAL" if complete else "PARTIAL" if envelope.get("annotations") else "NOT_AVAILABLE",
               "evidence_state": status or "unknown",
               "findings": len(unique) if complete else None, "observation_count": len(envelope.get("annotations", [])),
               "observation_ids": [row["annotation_id"] for row in envelope.get("annotations", [])],
               "reason": diagnostic_reason or state_reasons.get(status, "Workflow annotation evidence state is unknown."),
               "workflow": report.get("producer_runs", [{}])[0].get("url", "")}
    report["channels"] = [row for row in report.get("channels", []) if row.get("channel") != channel["channel"]] + [channel]
    report["finding_count"] = len(findings)
    report["observation_count"] = int(report.get("observation_count") or 0) + len(envelope.get("annotations", []))
    report["severities"] = {level: sum(row.get("severity") == level for row in findings)
                            for level in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")}
    report["annotation_evidence"] = {"schema_version": SCHEMA, "status": status,
                                     "count": len(envelope.get("annotations", [])),
                                      "unique_findings": len(unique),
                                      "actionable_count": sum(bool(row.get("contributes_to_needs_attention"))
                                                               for row in envelope.get("annotations", [])),
                                      "validation_fixture_count": sum(row.get("policy") == "validation_fixture"
                                                                      for row in envelope.get("annotations", [])),
                                      "workflow_update_count": sum(row.get("kind") == "workflow_update"
                                                                   for row in envelope.get("annotations", [])),
                                      "truncated": bool(envelope.get("truncated"))}
    if not complete:
        report["status"] = "partial"
        if "workflow-annotations" not in report.setdefault("incomplete_channels", []):
            report["incomplete_channels"].append("workflow-annotations")
    write(destination / "workflow-annotations.json", envelope)
    if snapshot is not None:
        annotation_observations = [{
            "observation_id": row["annotation_id"], "scanner_family": "Workflow annotations",
            "channel": "workflow-annotations", "rule": row.get("title") or "workflow-annotation",
            "rule_concept": "workflow-annotation", "severity": {"failure": "HIGH", "warning": "MEDIUM", "notice": "INFO"}[row["level"]],
            "message": row["message"], "file": row.get("file") or "", "start_line": row.get("start_line") or 0,
            "end_line": row.get("end_line") or row.get("start_line") or 0, "raw_artifact": "workflow-annotations.json",
            "evidence_source": "GITHUB_ACTIONS_ANNOTATION",
        } for row in envelope.get("annotations", [])]
        existing = {row.get("observation_id") for row in snapshot.get("observations", [])}
        snapshot["observations"].extend(row for row in annotation_observations if row["observation_id"] not in existing)
        snapshot["analysis_channels"] = [row for row in snapshot.get("analysis_channels", []) if row.get("channel") != "workflow-annotations"] + [channel]
        snapshot["analysis_channel_count"] = len(snapshot["analysis_channels"])
        snapshot["finding_count"] = len(snapshot.get("canonical_findings", [])) + len(snapshot.get("ai_advisories", []))
        snapshot["observation_count"] = len(snapshot["observations"])
        write(snapshot_path, snapshot)
    write(destination / "findings.json", findings)
    write(destination / "report.json", report)
    write(destination / "project-overview.json", build_project_overview(report, findings))
    for name, value in build_workspace_documents(report, findings).items():
        write(destination / name, value)
    return report



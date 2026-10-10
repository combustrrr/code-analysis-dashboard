#!/usr/bin/env python3
"""Collect exact-head CodeRabbit PR review evidence as optional AI advisories."""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API = "https://api.github.com"
BOT_LOGINS = {"coderabbitai[bot]", "coderabbitai"}
MAX_PAGES = 10


class CollectionUnavailable(RuntimeError):
    """A bounded GitHub read could not establish complete evidence."""

    def __init__(self, reason: str, *, partial: bool = False):
        super().__init__(reason)
        self.reason = reason
        self.partial = partial


def request_json(url: str, token: str) -> Any:
    request = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "agentic-soc-coderabbit-advisory-collector/1",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def paged(url: str, token: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        separator = "&" if "?" in url else "?"
        try:
            batch = request_json(f"{url}{separator}per_page=100&page={page}", token)
        except Exception as exc:
            raise CollectionUnavailable(f"GitHub collection request failed: {type(exc).__name__}", partial=bool(rows)) from exc
        if not isinstance(batch, list):
            raise ValueError("GitHub API returned a non-list collection")
        rows.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise CollectionUnavailable("GitHub pagination exceeded the bounded collection limit", partial=True)
    return rows


def severity(body: str) -> str:
    text = body.lower()
    if re.search(r"\b(critical|blocker)\b", text):
        return "CRITICAL"
    if re.search(r"\b(high|major)\b", text):
        return "HIGH"
    if re.search(r"\b(medium|moderate)\b", text):
        return "MEDIUM"
    if re.search(r"\b(low|minor|nitpick)\b", text):
        return "LOW"
    return "INFO"


def unavailable(repository: str, branch: str, commit: str, reason: str,
                provenance: dict[str, Any] | None, *, pr_number: int | None = None) -> tuple[dict, dict]:
    evidence = {"schema_version": "1", "repository": repository, "branch": branch,
                "commit_sha": commit, "pull_requests": [], "pr_number": pr_number,
                "head_branch": branch, "head_sha": commit, "provenance": provenance or {},
                "completion_signals": [], "advisories": []}
    status = {"schema_version": "1", "scanner_family": "CodeRabbit", "status": "UNAVAILABLE",
              "reason": reason, "finding_count": 0, "observation_count": 0,
              "commit_sha": commit, "pr_number": pr_number, "provenance": provenance or {},
              "partial_reasons": [], "unavailable_reasons": [reason]}
    return evidence, status


def collect(repository: str, branch: str, commit: str, token: str, *, pr_number: int | None = None,
            base_sha: str | None = None, base_branch: str | None = None,
            provenance: dict[str, Any] | None = None) -> tuple[dict, dict]:
    commit = commit.lower()
    if not token.strip():
        return ({"schema_version": "1", "repository": repository, "branch": branch,
                 "commit_sha": commit, "pull_requests": [], "provenance": provenance or {},
                 "completion_signals": [], "advisories": []},
                {"schema_version": "1", "scanner_family": "CodeRabbit", "status": "UNAVAILABLE",
                 "reason": "CODERABBIT_GITHUB_TOKEN credential contract is not configured",
                 "finding_count": 0, "observation_count": 0, "commit_sha": commit,
                 "provenance": provenance or {}, "partial_reasons": [], "unavailable_reasons": ["credential contract"]})
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("commit must be a full SHA")
    try:
        pulls = ([request_json(f"{API}/repos/{repository}/pulls/{pr_number}", token)] if pr_number
                 else request_json(f"{API}/repos/{repository}/commits/{commit}/pulls", token))
    except Exception as exc:
        return unavailable(repository, branch, commit,
                           f"GitHub pull-request lookup failed: {type(exc).__name__}",
                           provenance, pr_number=pr_number)
    relevant = [row for row in pulls if (pr_number is not None or row.get("state") == "open") and
                row.get("head", {}).get("sha", "").lower() == commit and
                row.get("head", {}).get("ref") == branch and
                row.get("head", {}).get("repo", {}).get("full_name") == repository and
                row.get("base", {}).get("repo", {}).get("full_name") == repository and
                (base_sha is None or row.get("base", {}).get("sha", "").lower() == base_sha.lower()) and
                (base_branch is None or row.get("base", {}).get("ref") == base_branch)]
    advisories: list[dict[str, Any]] = []
    review_seen = False
    completion_signals: list[str] = []
    pr_numbers: list[int] = []
    partial_reasons: list[str] = []
    unavailable_reasons: list[str] = []
    for pull in relevant:
        number = int(pull["number"])
        pr_numbers.append(number)
        try:
            reviews = paged(f"{API}/repos/{repository}/pulls/{number}/reviews", token)
        except CollectionUnavailable as exc:
            (partial_reasons if exc.partial else unavailable_reasons).append(f"reviews: {exc.reason}")
            continue
        review_seen = review_seen or any(
            str(row.get("user", {}).get("login", "")).lower() in BOT_LOGINS and
            str(row.get("commit_id") or "").lower() == commit
            for row in reviews
        )
        if review_seen:
            completion_signals.append("exact-head-review")
        try:
            comments = paged(f"{API}/repos/{repository}/pulls/{number}/comments", token)
        except CollectionUnavailable as exc:
            (partial_reasons if exc.partial else unavailable_reasons).append(f"comments: {exc.reason}")
            continue
        for row in comments:
            login = str(row.get("user", {}).get("login", "")).lower()
            if login not in BOT_LOGINS or row.get("in_reply_to_id") is not None:
                continue
            if str(row.get("commit_id") or "").lower() != commit:
                continue
            path = str(row.get("path") or "")
            line = int(row.get("line") or row.get("original_line") or 0)
            body = str(row.get("body") or "").strip()[:8000]
            if not path or not body:
                continue
            advisories.append({
                "id": f"coderabbit-review-comment-{row['id']}",
                "native_result_id": str(row["id"]),
                "native_url": str(row.get("html_url") or ""),
                "pr_number": str(number),
                "file": path,
                "start_line": line,
                "end_line": line,
                "rule_id": "coderabbit-pr-advisory",
                "rule_concept": "ai-pr-review-advisory",
                "severity": severity(body),
                "category": "AI_REVIEW",
                "message": body,
                "commit": commit,
                "branch": branch,
                "analysis_category": f"github-pr-review:{number}",
                "evidence_source": "AI_ADVISORY",
            })
    if relevant and not review_seen:
        try:
            combined = request_json(f"{API}/repos/{repository}/commits/{commit}/status", token)
            statuses = combined.get("statuses", []) if isinstance(combined, dict) else []
        except Exception as exc:
            unavailable_reasons.append(f"status: {type(exc).__name__}")
            statuses = []
        if any(str(row.get("context") or "").strip().lower() == "coderabbit" and
               str(row.get("state") or "").strip().lower() == "success" and
               str(row.get("description") or "").strip().lower().startswith("review completed")
               for row in statuses):
            review_seen = True
            completion_signals.append("exact-head-success-status")
    if unavailable_reasons:
        status = "UNAVAILABLE"
    elif partial_reasons:
        status = "PARTIAL"
    else:
        status = "COMPLETED_OPTIONAL" if review_seen else "NOT_AVAILABLE" if pr_number else "NOT_APPLICABLE"
    reason = ("Selected PR is not an eligible same-repository PR with the expected base/head identity" if pr_number and not relevant else
              "; ".join(unavailable_reasons) if unavailable_reasons else
              "; ".join(partial_reasons) if partial_reasons else
              "No open same-repository PR exists for this branch head" if not relevant else
              "CodeRabbit review evidence collected for the exact PR head" if review_seen else
              "The selected PR has no CodeRabbit review for the expected head" if pr_number else
              "An open PR exists, but CodeRabbit has not submitted an exact-head review")
    selected = relevant[0] if relevant else {}
    evidence = {"schema_version": "1", "repository": repository, "branch": branch,
                 "commit_sha": commit, "pull_requests": pr_numbers,
                 "pr_number": pr_number, "head_branch": branch, "head_sha": commit,
                 "base_branch": selected.get("base", {}).get("ref", base_branch),
                 "base_sha": selected.get("base", {}).get("sha", base_sha),
                 "provenance": provenance or {},
                 "completion_signals": sorted(set(completion_signals)),
                 "advisories": advisories}
    status_doc = {"schema_version": "1", "scanner_family": "CodeRabbit", "status": status,
                  "reason": reason, "finding_count": len(advisories),
                  "observation_count": len(advisories), "commit_sha": commit,
                  "pr_number": pr_number, "base_sha": evidence["base_sha"],
                  "base_branch": evidence["base_branch"], "head_sha": commit,
                  "provenance": provenance or {},
                  "partial_reasons": partial_reasons, "unavailable_reasons": unavailable_reasons}
    return evidence, status_doc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--pr-number", type=int)
    parser.add_argument("--base-sha")
    parser.add_argument("--base-branch")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("CODERABBIT_GITHUB_TOKEN", "").strip()
    if not token:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "coderabbit-status.json").write_text(json.dumps({
            "schema_version": "1", "scanner_family": "CodeRabbit", "status": "UNAVAILABLE",
            "reason": "CODERABBIT_GITHUB_TOKEN credential contract is not configured",
            "finding_count": 0, "observation_count": 0,
        }, indent=2) + "\n", encoding="utf-8")
        return
    selected_pr = args.pr_number
    if selected_pr is None and os.environ.get("PR_NUMBER", "").isdigit():
        selected_pr = int(os.environ["PR_NUMBER"])
    evidence, status = collect(args.repository, args.branch, args.commit, token,
                               pr_number=selected_pr, base_sha=args.base_sha, base_branch=args.base_branch,
                               provenance={"collector": "collect_coderabbit.py", "collector_revision": os.environ.get("COLLECTOR_SHA", "")})
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "coderabbit-advisories.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.output_dir / "coderabbit-status.json").write_text(
        json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

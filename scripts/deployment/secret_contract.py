#!/usr/bin/env python3
"""Validate the versioned secret-name contract without reading secret values."""
from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "config/secret-manifest-v1.json"
SECRET_REF = re.compile(r"\$\{\{\s*secrets\.([A-Z0-9_]+)")
VARIABLE_REF = re.compile(r"\$\{\{\s*vars\.([A-Z0-9_]+)")
SECRET_VALUE_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    "Sonar token": re.compile(r"\bsqu_[A-Za-z0-9]{30,}\b"),
}
TEXT_SUFFIXES = {".cjs", ".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".py", ".sh", ".ts", ".tsx", ".txt", ".yaml", ".yml"}


def load_manifest(path: Path = MANIFEST) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != "secret-manifest-v1":
        raise ValueError("secret manifest schema_version must be secret-manifest-v1")
    required = {"name", "store", "environment", "consumers", "required_scope", "rotation_days", "required", "source_job_allowed"}
    names: set[str] = set()
    for entry in value.get("secrets", []):
        missing = required - set(entry)
        if missing:
            raise ValueError(f"secret {entry.get('name', '<unnamed>')} lacks {sorted(missing)}")
        name = entry["name"]
        if name in names or not re.fullmatch(r"[A-Z][A-Z0-9_]+", name):
            raise ValueError(f"invalid or duplicate secret name: {name}")
        names.add(name)
    return value


def _tracked_text_files(root: Path) -> list[Path]:
    result = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True)
    return [root / item.decode("utf-8") for item in result.stdout.split(b"\0") if item and (root / item.decode("utf-8")).suffix.lower() in TEXT_SUFFIXES]


def _excluded(relative: str, manifest: dict) -> bool:
    normalized = relative.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, entry["path"]) for entry in manifest.get("scan_exclusions", []))


def contract_errors(root: Path = ROOT, manifest_path: Path | None = None) -> list[str]:
    manifest = load_manifest(manifest_path or root / "config/secret-manifest-v1.json")
    entries = {entry["name"]: entry for entry in manifest["secrets"]}
    errors: list[str] = []
    referenced: set[str] = set()
    variables: set[str] = set()
    workflow_roots = (root / ".github/workflows", root / "config/code-analysis/workflow-templates")
    for base in workflow_roots:
        if not base.exists():
            continue
        for path in (*base.rglob("*.yml"), *base.rglob("*.yaml")):
            text = path.read_text(encoding="utf-8")
            referenced.update(SECRET_REF.findall(text))
            variables.update(VARIABLE_REF.findall(text))
    absent = referenced - set(entries)
    if absent:
        errors.append(f"workflow secret references absent from manifest: {sorted(absent)}")
    forbidden_variables = variables & set(entries)
    if forbidden_variables:
        errors.append(f"secrets are configured as ordinary GitHub variables: {sorted(forbidden_variables)}")
    allowlist = set(manifest.get("ordinary_variable_allowlist", []))
    unexpected_variables = variables - allowlist
    if unexpected_variables:
        errors.append(f"ordinary workflow variables lack manifest review: {sorted(unexpected_variables)}")
    for name in ("reusable-source.yml", "reusable-source-full.yml", "11-source-analysis.yml"):
        path = root / ".github/workflows" / name
        if not path.exists():
            continue
        for reference in SECRET_REF.findall(path.read_text(encoding="utf-8")):
            if not entries.get(reference, {}).get("source_job_allowed", False):
                errors.append(f"source-executing workflow {name} receives forbidden secret {reference}")
    wrangler_path = root / "analysis-launcher/wrangler.jsonc"
    if wrangler_path.exists():
        wrangler = json.loads(wrangler_path.read_text(encoding="utf-8"))
        declared = set(wrangler.get("secrets", {}).get("required", []))
        expected = {name for name, entry in entries.items() if entry["store"] in {"cloudflare_worker", "dual_github_repository_cloudflare_worker"} and entry["required"]}
        if declared != expected:
            errors.append(f"Worker required secret declarations differ from manifest: expected {sorted(expected)}, got {sorted(declared)}")
        leaked_vars = set(wrangler.get("vars", {})) & set(entries)
        if leaked_vars:
            errors.append(f"Worker secrets are configured as ordinary variables: {sorted(leaked_vars)}")
    for path in _tracked_text_files(root):
        relative = path.relative_to(root).as_posix()
        if relative == manifest_path or _excluded(relative, manifest):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in SECRET_VALUE_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"repository content resembles a real {label}: {relative}")
    return sorted(set(errors))


def provider_name_errors(root: Path = ROOT, run=subprocess.run, providers: set[str] | None = None) -> list[str]:
    """Verify configured provider secret names; values are never requested."""
    manifest = load_manifest(root / "config/secret-manifest-v1.json")
    entries = manifest["secrets"]
    errors: list[str] = []
    secret_names = {entry["name"] for entry in entries}
    commands = (
        (["gh", "secret", "list", "--app", "actions", "--json", "name"], {entry["name"] for entry in entries if entry["store"] in {"github_repository", "dual_github_repository_cloudflare_worker"} and entry["required"]}, root, "GitHub repository"),
        (["gh", "secret", "list", "--env", "production", "--app", "actions", "--json", "name"], {entry["name"] for entry in entries if entry["store"] == "github_environment" and entry["required"]}, root, "GitHub production environment"),
        (["gh", "variable", "list", "--json", "name"], set(), root, "GitHub repository variables"),
        (["gh", "variable", "list", "--env", "production", "--json", "name"], set(), root, "GitHub production environment variables"),
        (["npx", "--yes", "wrangler@4.129.1", "secret", "list", "--format", "json"], {entry["name"] for entry in entries if entry["store"] in {"cloudflare_worker", "dual_github_repository_cloudflare_worker"} and entry["required"]}, root / "analysis-launcher", "Cloudflare Worker"),
    )
    selected = providers or {"github", "cloudflare"}
    for index, (command, required, cwd, label) in enumerate(commands):
        provider = "cloudflare" if index == 4 else "github"
        if provider not in selected:
            continue
        completed = run(command, cwd=cwd, check=True, capture_output=True, text=True)
        names = {item["name"] for item in json.loads(completed.stdout)}
        missing = required - names
        if missing:
            errors.append(f"{label} lacks required secret names: {sorted(missing)}")
        if index in {2, 3}:
            misplaced = names & secret_names
            if misplaced:
                errors.append(f"{label} contain secret names: {sorted(misplaced)}")
    return errors


def main(argv: list[str] | None = None) -> int:
    arguments = argv or sys.argv[1:]
    verify_providers = "--verify-provider-names" in arguments
    verify_cloudflare = "--verify-cloudflare-names" in arguments
    errors = contract_errors()
    if (verify_providers or verify_cloudflare) and not errors:
        errors.extend(provider_name_errors(providers={"cloudflare"} if verify_cloudflare else None))
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("OK: secret manifest, workflow references, source isolation, and repository content validated")
    if verify_providers or verify_cloudflare:
        print("OK: required GitHub and Cloudflare secret names are configured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

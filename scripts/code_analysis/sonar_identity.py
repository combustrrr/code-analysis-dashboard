"""Derive and validate the Sonar identity for one source repository."""

from __future__ import annotations

import os


def project_identity(source_repository: str) -> tuple[str, str]:
    """Return Sonar organization and project key for ``owner/repository``."""
    parts = source_repository.strip().split("/")
    if len(parts) != 2 or not all(parts) or any(part in {".", ".."} for part in parts):
        raise ValueError("SOURCE_REPOSITORY must be an owner/repository identity")
    organization, repository = parts
    return organization, f"{organization}_{repository}"


def environment_identity() -> tuple[str, str]:
    source_repository = os.environ.get("SOURCE_REPOSITORY", "").strip()
    if not source_repository:
        raise SystemExit("SOURCE_REPOSITORY is required for Sonar identity")
    try:
        return project_identity(source_repository)
    except ValueError as error:
        raise SystemExit(str(error)) from error

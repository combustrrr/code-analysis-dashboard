"""Resolve the small reviewed set of external service executables."""
from __future__ import annotations

import shutil
from pathlib import Path

ALLOWED_EXECUTABLES = frozenset({"aws", "curl", "git", "schemathesis"})


def required_executable(name: str) -> str:
    if name not in ALLOWED_EXECUTABLES:
        raise ValueError("Executable is not in the reviewed service allowlist")
    resolved = shutil.which(name)
    if not resolved:
        raise RuntimeError(f"Required executable is unavailable: {name}")
    return str(Path(resolved).resolve())

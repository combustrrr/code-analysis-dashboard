"""Small fail-closed boundary for scanner-service HTTP requests."""
from __future__ import annotations

import urllib.request
from collections.abc import Collection
from typing import Any
from urllib.parse import urlsplit


def open_url(
    request: str | urllib.request.Request,
    *,
    timeout: int,
    allowed_hosts: Collection[str],
    allowed_schemes: Collection[str] = ("https",),
) -> Any:
    """Open only an explicitly allowed scheme and exact destination host."""
    url = request.full_url if isinstance(request, urllib.request.Request) else request
    parsed = urlsplit(url)
    hosts = {host.lower() for host in allowed_hosts}
    schemes = {scheme.lower() for scheme in allowed_schemes}
    if (
        parsed.scheme.lower() not in schemes
        or not parsed.hostname
        or parsed.hostname.lower() not in hosts
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise ValueError("Outbound request destination is not allowed")
    # The exact scheme and destination host are validated before this call.
    return urllib.request.urlopen(request, timeout=timeout)  # nosec B310

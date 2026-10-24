"""Tests for cross-platform command selection in register_github_app.py."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / "deployment"))
from register_github_app import _find_npx, _find_openssl


class FakePath:
    """Minimal path implementation for platform-independent Windows-path tests."""

    existing: set[str] = set()

    def __init__(self, value):
        self.value = str(value).replace("\\", "/")

    @classmethod
    def home(cls):
        return cls("C:/Users/test")

    def __truediv__(self, part):
        return type(self)(f"{self.value}/{part}")

    def exists(self):
        return self.value in self.existing

    def __str__(self):
        return self.value


class TestFindNpx:
    """Tests for _find_npx cross-platform detection."""

    @patch("shutil.which")
    def test_finds_npx_on_unix(self, mock_which):
        mock_which.side_effect = lambda cmd: "/usr/bin/npx" if cmd == "npx" else None
        with patch("sys.platform", "linux"):
            result = _find_npx()
        assert result == ["/usr/bin/npx"]

    @patch("shutil.which")
    def test_finds_npx_cmd_on_windows(self, mock_which):
        mock_which.side_effect = lambda cmd: "C:\\Program Files\\nodejs\\npx.cmd" if cmd == "npx.cmd" else None
        with patch("sys.platform", "win32"):
            result = _find_npx()
        assert result == ["C:\\Program Files\\nodejs\\npx.cmd"]

    @patch("shutil.which", return_value=None)
    def test_fallback_to_npx(self, mock_which):
        with patch("sys.platform", "win32"):
            result = _find_npx()
        assert result == ["npx"]


class TestFindOpenSSL:
    """Tests for _find_openssl cross-platform detection."""

    @patch("shutil.which")
    def test_finds_openssl_on_unix(self, mock_which):
        mock_which.return_value = "/usr/bin/openssl"
        with patch("sys.platform", "linux"):
            result = _find_openssl()
        assert result == "/usr/bin/openssl"

    @patch("shutil.which")
    @patch("register_github_app.Path", FakePath)
    def test_finds_openssl_in_git_for_windows(self, mock_which):
        mock_which.return_value = None
        git_path = "C:/Program Files/Git/usr/bin/openssl.exe"
        FakePath.existing = {git_path}
        try:
            with patch("sys.platform", "win32"):
                result = _find_openssl()
        finally:
            FakePath.existing = set()
        # Normalize path separators for comparison
        assert os.path.normpath(result) == os.path.normpath(git_path)

    @patch("shutil.which")
    @patch("register_github_app.Path", FakePath)
    def test_finds_openssl_in_scoop(self, mock_which):
        mock_which.return_value = None
        scoop_path = "C:/Users/test/scoop/apps/openssl/current/bin/openssl.exe"
        FakePath.existing = {scoop_path}
        try:
            with patch("sys.platform", "win32"):
                result = _find_openssl()
        finally:
            FakePath.existing = set()
        assert result is not None
        assert "openssl.exe" in result

    @patch("shutil.which", return_value=None)
    @patch("register_github_app.Path", FakePath)
    def test_returns_none_when_not_found(self, mock_which):
        FakePath.existing = set()
        with patch("sys.platform", "win32"):
            result = _find_openssl()
        assert result is None
def test_app_registration_requests_only_used_permissions():
    source = (Path(__file__).parent / "register_github_app.py").read_text(encoding="utf-8")
    assert "manifest[\"default_permissions\"][\"workflows\"]" not in source
    assert "\"actions\": \"read\"" in source
    assert "\"contents\": \"read\"" in source
    assert "\"actions\": \"write\"" not in source
    assert "\"contents\": \"write\"" not in source
    assert "\"pull_requests\": \"read\"" in source

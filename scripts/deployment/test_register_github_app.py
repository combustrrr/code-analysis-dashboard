"""Tests for cross-platform command selection in register_github_app.py."""
import sys
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "deployment"))
from register_github_app import _find_npx, _find_openssl


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
    @patch("pathlib.Path")
    def test_finds_openssl_in_git_for_windows(self, mock_path_class, mock_which):
        mock_which.return_value = None
        git_path = "C:/Program Files/Git/usr/bin/openssl.exe"
        # Create mock Path instances for each candidate
        mock_candidates = []
        for candidate_str in [
            git_path,
            "C:/Program Files (x86)/Git/usr/bin/openssl.exe",
            "C:/Users/test/scoop/apps/openssl/current/bin/openssl.exe",
            "C:/OpenSSL-Win64/bin/openssl.exe",
            "C:/OpenSSL-Win32/bin/openssl.exe",
        ]:
            mock_path = MagicMock()
            mock_path.__str__ = lambda self, s=candidate_str: s
            mock_path.exists.return_value = (candidate_str == git_path)
            mock_candidates.append(mock_path)
        mock_path_class.side_effect = mock_candidates
        mock_path_class.home.return_value = Path("C:/Users/test")

        with patch("sys.platform", "win32"):
            result = _find_openssl()
        # Normalize path separators for comparison
        assert os.path.normpath(result) == os.path.normpath(git_path)

    @patch("shutil.which")
    @patch("pathlib.Path")
    def test_finds_openssl_in_scoop(self, mock_path_class, mock_which):
        mock_which.return_value = None
        scoop_path = "C:/Users/test/scoop/apps/openssl/current/bin/openssl.exe"
        mock_candidates = []
        for candidate_str in [
            "C:/Program Files/Git/usr/bin/openssl.exe",
            "C:/Program Files (x86)/Git/usr/bin/openssl.exe",
            scoop_path,
            "C:/OpenSSL-Win64/bin/openssl.exe",
            "C:/OpenSSL-Win32/bin/openssl.exe",
        ]:
            mock_path = MagicMock()
            mock_path.__str__ = lambda self, s=candidate_str: s
            mock_path.exists.return_value = (candidate_str == scoop_path)
            mock_candidates.append(mock_path)
        mock_path_class.side_effect = mock_candidates
        mock_path_class.home.return_value = Path("C:/Users/test")

        with patch("sys.platform", "win32"):
            result = _find_openssl()
        assert result is not None
        assert "openssl.exe" in result

    @patch("shutil.which", return_value=None)
    @patch("pathlib.Path.exists", return_value=False)
    def test_returns_none_when_not_found(self, mock_exists, mock_which):
        with patch("sys.platform", "win32"):
            result = _find_openssl()
        assert result is None
def test_app_registration_requests_only_used_permissions():
    source = (Path(__file__).parent / "register_github_app.py").read_text(encoding="utf-8")
    assert "manifest[\"default_permissions\"][\"workflows\"]" not in source
    assert "\"actions\": \"write\"" in source
    assert "\"contents\": \"write\" if args.application else \"read\"" in source
    assert "\"pull_requests\": \"read\"" in source
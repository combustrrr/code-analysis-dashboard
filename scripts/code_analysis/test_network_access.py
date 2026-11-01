import unittest
import urllib.request
from unittest.mock import patch

from scripts.code_analysis.network_access import open_url


class NetworkAccessTests(unittest.TestCase):
    def test_exact_https_destination_is_allowed(self):
        request = urllib.request.Request("https://api.github.com/repos/o/r")
        marker = object()
        with patch("scripts.code_analysis.network_access.urllib.request.urlopen", return_value=marker) as urlopen:
            self.assertIs(open_url(request, timeout=30, allowed_hosts={"api.github.com"}), marker)
        urlopen.assert_called_once_with(request, timeout=30)

    def test_untrusted_scheme_host_credentials_and_fragment_fail_closed(self):
        urls = (
            "http://api.github.com/repos/o/r",
            "https://example.com/repos/o/r",
            "https://user@api.github.com/repos/o/r",
            "https://api.github.com/repos/o/r#unexpected",
        )
        with patch("scripts.code_analysis.network_access.urllib.request.urlopen") as urlopen:
            for url in urls:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    open_url(url, timeout=30, allowed_hosts={"api.github.com"})
        urlopen.assert_not_called()

    def test_reviewed_loopback_http_can_be_allowed_explicitly(self):
        marker = object()
        with patch("scripts.code_analysis.network_access.urllib.request.urlopen", return_value=marker):
            self.assertIs(open_url(
                "http://127.0.0.1:4173/openapi.json",
                timeout=2,
                allowed_hosts={"127.0.0.1"},
                allowed_schemes={"http"},
            ), marker)

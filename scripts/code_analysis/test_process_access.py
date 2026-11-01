import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.code_analysis.process_access import required_executable


class ProcessAccessTests(unittest.TestCase):
    def test_reviewed_executable_resolves_to_an_absolute_command(self):
        with patch("scripts.code_analysis.process_access.shutil.which", return_value="/usr/bin/git"):
            self.assertEqual(required_executable("git"), str(Path("/usr/bin/git").resolve()))

    def test_unknown_or_missing_executable_fails_closed(self):
        with self.assertRaises(ValueError):
            required_executable("unreviewed")
        with patch("scripts.code_analysis.process_access.shutil.which", return_value=None), \
                self.assertRaises(RuntimeError):
            required_executable("git")

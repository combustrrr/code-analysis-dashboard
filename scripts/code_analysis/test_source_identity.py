import unittest
from unittest.mock import patch

from scripts.code_analysis.source_identity import execution_jobs_with_terminal_conclusions


class ExecutionJobConsistencyTests(unittest.TestCase):
    def test_retries_until_selected_jobs_have_terminal_conclusions(self):
        pending = [
            {'name': 'CodeQL (Semantic SAST) (javascript-typescript)', 'conclusion': None},
            {'name': 'Portable osv-scanner', 'conclusion': None},
        ]
        complete = [
            {'name': 'CodeQL (Semantic SAST) (javascript-typescript)', 'conclusion': 'success'},
            {'name': 'Portable osv-scanner', 'conclusion': 'success'},
        ]
        with patch('scripts.code_analysis.source_identity.pages', side_effect=[pending, complete]) as pages, \
                patch('scripts.code_analysis.source_identity.time.sleep') as sleep:
            result = execution_jobs_with_terminal_conclusions(
                'owner/repo', '123', 1, ['codeql', 'osv-scanner'], {'osv-scanner': ['osv']},
            )
        self.assertEqual(result, complete)
        self.assertEqual(pages.call_count, 2)
        sleep.assert_called_once_with(2)

    def test_returns_final_projection_after_bounded_retries(self):
        pending = [{'name': 'CodeQL (Semantic SAST) (python)', 'conclusion': None}]
        with patch('scripts.code_analysis.source_identity.pages', return_value=pending) as pages, \
                patch('scripts.code_analysis.source_identity.time.sleep') as sleep:
            result = execution_jobs_with_terminal_conclusions(
                'owner/repo', '123', 1, ['codeql'], {}, retries=3, delay_seconds=0.5,
            )
        self.assertEqual(result, pending)
        self.assertEqual(pages.call_count, 3)
        self.assertEqual(sleep.call_count, 2)


if __name__ == '__main__':
    unittest.main()

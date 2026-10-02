import unittest

from scripts.code_analysis.evaluation import can_dispatch, idempotency_key, profile_digest, state_for, consume


class EvaluationGuardTests(unittest.TestCase):
    def test_key_is_deterministic_and_profile_bound(self):
        project = {'enabled_scanners': ['semgrep', 'codeql'], 'deferred_channels': {'snyk': 'vendor'}, 'profile': {'mode': 'agentic-soc'}}
        digest = profile_digest(project)
        key = idempotency_key('ARYDESTROYER/Kavach-AgenticSOC', 'a' * 40, 'b' * 40, digest)
        self.assertEqual(key, idempotency_key('ARYDESTROYER/Kavach-AgenticSOC', 'a' * 40, 'b' * 40, digest))
        self.assertNotEqual(digest, profile_digest({**project, 'enabled_scanners': ['semgrep']}))
        state = state_for({}, 'ARYDESTROYER/Kavach-AgenticSOC', 'a' * 40, 'b' * 40, digest)
        self.assertTrue(can_dispatch(state, 'a' * 40)[0])
        consumed = consume(state, 'request', key)
        self.assertFalse(can_dispatch(consumed, 'a' * 40)[0])

    def test_pause_and_frozen_sha_fail_closed(self):
        state = {'evaluation_paused': True, 'evaluation_target_sha': 'a' * 40, 'evaluation_dispatches_used': 0}
        self.assertIn('paused', can_dispatch(state, 'a' * 40)[1])
        state['evaluation_paused'] = False
        self.assertIn('frozen', can_dispatch(state, 'b' * 40)[1])


if __name__ == '__main__':
    unittest.main()

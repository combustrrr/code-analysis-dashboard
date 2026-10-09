"""Tests for Worker deployment configuration validation."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "deployment"))
from validate_deployment import missing_worker_configuration, required_worker_secrets


def test_repository_mode_requires_app_oauth_and_webhook_configuration():
    config = {
        "vars": {"APPLICATION_MODE": "repositories"},
        "secrets": {"required": ["GITHUB_CLIENT_SECRET", "SESSION_KEY", "WORKER_API_TOKEN"]},
    }
    assert missing_worker_configuration(config) == {
        "NEXT_GITHUB_CLIENT_ID",
        "NEXT_GITHUB_APP_ID",
        "NEXT_GITHUB_APP_SLUG",
        "NEXT_GITHUB_CLIENT_SECRET",
        "NEXT_GITHUB_APP_PRIVATE_KEY",
        "NEXT_GITHUB_WEBHOOK_SECRET",
    }


def test_repository_mode_configuration_is_complete_without_secret_values():
    config = {
        "vars": {
            "APPLICATION_MODE": "repositories",
            "NEXT_GITHUB_CLIENT_ID": "client-id",
            "NEXT_GITHUB_APP_ID": "app-id",
            "NEXT_GITHUB_APP_SLUG": "app-slug",
        },
        "secrets": {
            "required": [
                "GITHUB_CLIENT_SECRET",
                "NEXT_GITHUB_CLIENT_SECRET",
                "NEXT_GITHUB_APP_PRIVATE_KEY",
                "NEXT_GITHUB_WEBHOOK_SECRET",
                "SESSION_KEY",
                "WORKER_API_TOKEN",
            ]
        },
    }
    assert missing_worker_configuration(config) == set()
    assert required_worker_secrets(config) == set(config["secrets"]["required"])


def test_legacy_mode_requires_explicit_minimum_oauth_scope():
    config = {
        "vars": {"APPLICATION_MODE": "legacy", "GITHUB_OAUTH_SCOPES": "public_repo"},
        "secrets": {"required": ["GITHUB_CLIENT_SECRET", "SESSION_KEY", "WORKER_API_TOKEN"]},
    }
    assert missing_worker_configuration(config) == set()

def test_repository_mode_does_not_require_oauth_scopes():
    config = {"vars": {"APPLICATION_MODE": "repositories"}, "secrets": {"required": []}}
    assert "GITHUB_OAUTH_SCOPES" not in missing_worker_configuration(config)
"""Tests for Worker deployment configuration validation."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "deployment"))
from validate_deployment import deployment_workflow_errors, missing_worker_configuration, required_worker_secrets


def test_repository_mode_requires_canonical_app_configuration():
    config = {
        "vars": {"APPLICATION_MODE": "repositories"},
        "secrets": {"required": ["GITHUB_CLIENT_SECRET", "SESSION_KEY", "WORKER_API_TOKEN"]},
    }
    assert missing_worker_configuration(config) == {
        "GITHUB_CLIENT_ID",
        "GITHUB_APP_ID",
        "GITHUB_APP_SLUG",
        "ANALYSIS_REPOSITORY",
        "ANALYSIS_REPOSITORY_ID",
        "DASHBOARD_ORIGIN",
        "DASHBOARD_BASE_PATH",
        "GITHUB_APP_PRIVATE_KEY",
    }


def test_repository_mode_configuration_is_complete_without_secret_values():
    config = {
        "vars": {
            "APPLICATION_MODE": "repositories",
            "GITHUB_CLIENT_ID": "client-id",
            "GITHUB_APP_ID": "app-id",
            "GITHUB_APP_SLUG": "app-slug",
            "ANALYSIS_REPOSITORY": "combustrrr/code-analysis-dashboard",
            "ANALYSIS_REPOSITORY_ID": "1360051890",
            "DASHBOARD_ORIGIN": "https://combustrrr.github.io",
            "DASHBOARD_BASE_PATH": "/code-analysis-dashboard/",
        },
        "secrets": {
            "required": [
                "GITHUB_CLIENT_SECRET",
                "GITHUB_APP_PRIVATE_KEY",
                "SESSION_KEY",
                "WORKER_API_TOKEN",
            ]
        },
    }
    assert missing_worker_configuration(config) == set()
    assert required_worker_secrets(config) == set(config["secrets"]["required"])


def test_non_repository_mode_is_rejected():
    config = {
        "vars": {"APPLICATION_MODE": "retired"},
        "secrets": {"required": ["GITHUB_CLIENT_SECRET", "SESSION_KEY", "WORKER_API_TOKEN"]},
    }
    assert "APPLICATION_MODE" in missing_worker_configuration(config)

def test_repository_mode_does_not_require_oauth_scopes():
    config = {"vars": {"APPLICATION_MODE": "repositories"}, "secrets": {"required": []}}
    assert "GITHUB_OAUTH_SCOPES" not in missing_worker_configuration(config)


def test_repository_mode_rejects_another_execution_host_or_pages_path():
    config = {
        "vars": {
            "APPLICATION_MODE": "repositories",
            "ANALYSIS_REPOSITORY": "owner/other",
            "ANALYSIS_REPOSITORY_ID": "1",
            "DASHBOARD_ORIGIN": "https://example.test",
            "DASHBOARD_BASE_PATH": "/",
        },
        "secrets": {"required": []},
    }
    assert {"ANALYSIS_REPOSITORY", "ANALYSIS_REPOSITORY_ID", "DASHBOARD_ORIGIN", "DASHBOARD_BASE_PATH"} <= missing_worker_configuration(config)


def test_deployment_workflows_keep_coordinator_scanners_pages_and_worker_isolated():
    root = Path(__file__).resolve().parents[2]
    assert deployment_workflow_errors(root) == []

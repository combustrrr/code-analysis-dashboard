import json
from unittest.mock import Mock, patch

from scripts.deployment.rotate_worker_api_token import rotate
from scripts.deployment.secret_contract import contract_errors, load_manifest, provider_name_errors


def test_repository_secret_contract_passes():
    assert contract_errors() == []


def test_manifest_has_dual_store_rotation_metadata():
    manifest = load_manifest()
    worker = next(entry for entry in manifest["secrets"] if entry["name"] == "WORKER_API_TOKEN")
    assert worker["dual_store"] == {
        "github_secret": "WORKER_API_TOKEN",
        "cloudflare_secret": "WORKER_API_TOKEN",
        "transition_secret": "WORKER_API_TOKEN_NEXT",
        "rotation_script": "scripts/deployment/rotate_worker_api_token.py",
    }


def test_provider_name_validation_reports_only_missing_names():
    manifest = load_manifest()
    repository = [{"name": entry["name"]} for entry in manifest["secrets"] if entry["store"] in {"github_repository", "dual_github_repository_cloudflare_worker"} and entry["required"]]
    environment = [{"name": entry["name"]} for entry in manifest["secrets"] if entry["store"] == "github_environment" and entry["required"]]
    worker = [{"name": entry["name"]} for entry in manifest["secrets"] if entry["store"] in {"cloudflare_worker", "dual_github_repository_cloudflare_worker"} and entry["required"]]
    responses = [Mock(stdout=json.dumps(repository)), Mock(stdout=json.dumps(environment)), Mock(stdout="[]"), Mock(stdout="[]"), Mock(stdout=json.dumps(worker))]
    assert provider_name_errors(run=Mock(side_effect=responses)) == []
    worker_missing = [entry for entry in worker if entry["name"] != "WORKER_API_TOKEN"]
    responses = [Mock(stdout=json.dumps(repository)), Mock(stdout=json.dumps(environment)), Mock(stdout="[]"), Mock(stdout="[]"), Mock(stdout=json.dumps(worker_missing))]
    assert provider_name_errors(run=Mock(side_effect=responses)) == ["Cloudflare Worker lacks required secret names: ['WORKER_API_TOKEN']"]

    responses = [Mock(stdout=json.dumps(repository)), Mock(stdout=json.dumps(environment)), Mock(stdout='[{"name":"SONAR_TOKEN"}]'), Mock(stdout="[]"), Mock(stdout=json.dumps(worker))]
    assert provider_name_errors(run=Mock(side_effect=responses)) == ["GitHub repository variables contain secret names: ['SONAR_TOKEN']"]


def test_rotation_uses_stdin_and_preserves_transition_order():
    calls = []
    def run(command, **kwargs):
        calls.append((command, kwargs))
        return Mock(returncode=0)
    response = Mock(status=204)
    with patch("scripts.deployment.rotate_worker_api_token._command", side_effect=lambda name: name):
        rotate("https://worker.example", "owner/repo", run=run, opener=Mock(return_value=response), token="n" * 64)
    assert [call[0][-2:] for call in calls] == [
        ["put", "WORKER_API_TOKEN_NEXT"],
        ["--repo", "owner/repo"],
        ["put", "WORKER_API_TOKEN"],
        ["delete", "WORKER_API_TOKEN_NEXT"],
    ]
    for command, kwargs in calls[:3]:
        assert "n" * 64 not in command
        assert kwargs["input"] == "n" * 64 + "\n"
    assert calls[3][1]["input"] == "y\n"

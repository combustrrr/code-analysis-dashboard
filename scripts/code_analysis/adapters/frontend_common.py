"""Shared, reviewed frontend scanner execution for configured source projects."""
from __future__ import annotations

import json
import subprocess
import time
import urllib.request
from pathlib import Path


TOOLING_ROOT = Path(__file__).resolve().parents[3]


def profile() -> dict:
    config = json.loads((TOOLING_ROOT / 'config/code-analysis/service.json').read_text(encoding='utf-8'))
    value = config.get('profile')
    if not isinstance(value, dict):
        raise ValueError('Reviewed project profile is unavailable')
    return value


def frontend(source: Path) -> tuple[Path, dict]:
    value = profile()
    root = value.get('javascript_root')
    if not isinstance(root, str) or not root or root.startswith(('/', '\\')) or '..' in Path(root).parts:
        raise ValueError('Reviewed frontend root is invalid')
    ui = (source / root).resolve()
    if not ui.is_relative_to(source.resolve()) or not (ui / 'package-lock.json').is_file():
        raise ValueError('Reviewed frontend project is unavailable')
    return ui, value


def command(value: dict, key: str) -> list[str]:
    raw = value.get(key)
    if not isinstance(raw, list) or not 1 <= len(raw) <= 16 or not all(isinstance(item, str) and item for item in raw):
        raise ValueError(f'Reviewed {key} is unavailable')
    return raw


def run(argv: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=timeout, check=False)


def install(ui: Path, value: dict) -> subprocess.CompletedProcess[str]:
    return run(command(value, 'javascript_install_command'), ui, 900)


def start_preview(ui: Path, value: dict) -> subprocess.Popen[bytes]:
    process = subprocess.Popen(command(value, 'frontend_preview_command'), cwd=ui,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = value.get('frontend_preview_url')
    if not isinstance(url, str) or not url.startswith('http://127.0.0.1:'):
        process.kill()
        raise ValueError('Reviewed preview URL is invalid')
    for _ in range(80):
        if process.poll() is not None:
            raise RuntimeError('Frontend preview stopped before it became ready')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return process
        except OSError:
            time.sleep(.25)
    process.kill()
    raise TimeoutError('Frontend preview did not become ready')


def stop_preview(process: subprocess.Popen[bytes]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def write_result(path: Path, target: dict, status: str, reason: str, findings: list[dict]) -> None:
    path.write_text(json.dumps({
        'source_repository': target['source_repository'],
        'source_sha': target['head_sha'],
        'status': status,
        'reason': reason,
        'findings': findings,
    }, separators=(',', ':')), encoding='utf-8')

"""Execute trusted repository-profile commands in an unprivileged scanner job."""
import argparse
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from defusedxml import ElementTree as ET

from scripts.code_analysis.hosted import load, write

SERVICE_CONFIG = Path(__file__).resolve().parents[2] / 'config/code-analysis/service.json'
TASK_PROFILE_FIELDS = {
    'python-install': ('python_root', 'python_requirements'),
    'python-test': ('python_root', 'python_test_command'),
    'javascript-install': ('javascript_root', 'javascript_install_command'),
    'javascript-test': ('javascript_root', 'javascript_test_command'),
    'api': ('python_root', 'api_command'),
    'api-fuzz': ('python_root', 'api_command', 'openapi_url'),
}


def load_profile(task):
    if not SERVICE_CONFIG.is_file():
        raise SystemExit(f'Explicit service profile configuration is required: {SERVICE_CONFIG}')
    try:
        config = load(SERVICE_CONFIG)
    except (OSError, ValueError) as error:
        raise SystemExit(f'Unable to load explicit service profile configuration: {error}') from error
    profile = config.get('profile') if isinstance(config, dict) else None
    if not isinstance(profile, dict) or not profile:
        raise SystemExit('Explicit service profile configuration is missing a non-empty profile')
    missing = [field for field in TASK_PROFILE_FIELDS[task] if field not in profile]
    if missing:
        raise SystemExit(f'Explicit profile is missing required field(s) for {task}: {", ".join(missing)}')
    return profile


def main():
    p = argparse.ArgumentParser()
    p.add_argument('task', choices=['python-install', 'python-test', 'javascript-install', 'javascript-test', 'api', 'api-fuzz'])
    p.add_argument('--source', type=Path, required=True)
    a = p.parse_args()
    profile = load_profile(a.task)
    root = a.source.resolve(strict=True)
    cwd = root / profile['javascript_root' if a.task.startswith('javascript') else 'python_root']
    if not cwd.resolve().is_relative_to(root):
        raise ValueError('profile working directory escapes source checkout')
    # Source installs/tests do not inherit job credentials, even if this helper is
    # accidentally called from a token-bearing step in the future.
    env = {k: v for k, v in os.environ.items() if not any(s in k.upper() for s in ('TOKEN', 'SECRET', 'PASSWORD', 'CREDENTIAL'))}
    if a.task == 'api-fuzz':
        env.update(profile.get('api_environment', {}))
        process = subprocess.Popen(profile['api_command'], cwd=cwd, env=env)
        status = 'OPERATIONAL_FAILURE'
        reason = 'API startup or bounded Schemathesis execution failed'
        try:
            url = profile['openapi_url']
            for _ in range(60):
                try:
                    with urllib.request.urlopen(url, timeout=2) as response:
                        (root / 'schema.json').write_bytes(response.read())
                    break
                except OSError:
                    if process.poll() is not None:
                        raise RuntimeError('API exited before schema discovery')
                    time.sleep(1)
            else:
                raise RuntimeError('API schema startup deadline exceeded')
            parsed = urlsplit(url)
            result = subprocess.run(['schemathesis', 'run', str(root / 'schema.json'),
                '--experimental=openapi-3.1', '--base-url', f'{parsed.scheme}://{parsed.netloc}',
                '--checks', 'all', '--max-response-time', '5000', '--hypothesis-max-examples', '50',
                '--junit-xml=' + str(root / 'fuzzing-results.xml')], cwd=cwd, env=env, timeout=300, check=False)
            ET.parse(root / 'fuzzing-results.xml')
            if result.returncode not in (0, 1):
                raise RuntimeError('Schemathesis execution failed')
            status, reason = 'COMPLETED', 'Bounded API campaign completed; JUnit findings retained'
        finally:
            write(root / 'schemathesis-status.json', {'scanner_family': 'Schemathesis', 'status': status, 'reason': reason})
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        return
    if a.task == 'python-install':
        command = [sys.executable, '-m', 'pip', 'install', '-r', str(root / profile['python_requirements'])]
        development = profile.get('python_development_requirements')
        if development:
            command += ['-r', str(root / development)]
    else:
        command = profile[{'python-test': 'python_test_command', 'javascript-install': 'javascript_install_command',
                           'javascript-test': 'javascript_test_command', 'api': 'api_command'}[a.task]]
    if a.task == 'python-test':
        for name in ('coverage.json', 'coverage.xml', '.coverage'):
            candidate = cwd / name
            if candidate.is_file() or candidate.is_symlink():
                candidate.unlink()
    test_timeout = 900
    if a.task == 'python-test':
        configured_timeout = profile.get('python_test_timeout_seconds', 900)
        if not isinstance(configured_timeout, int) or not 60 <= configured_timeout <= 2400:
            raise ValueError('python_test_timeout_seconds must be an integer between 60 and 2400')
        test_timeout = configured_timeout
    try:
        result = subprocess.run(
            command, cwd=cwd, env=env, check=False,
            timeout=test_timeout if a.task == 'python-test' else 900 if a.task == 'javascript-test' else None,
        )
    except subprocess.TimeoutExpired:
        if a.task == 'javascript-test':
            write(root / 'typescript-test-status.json', {
                'scanner_family': 'TypeScript',
                'status': 'OPERATIONAL_FAILURE',
                'test_exit_code': None,
                'reason': 'JavaScript tests exceeded the trusted 900-second limit',
            })
            return
        if a.task != 'python-test':
            raise
        measured = (cwd / 'coverage.json').is_file()
        write(cwd / 'coverage-status.json', {
            'schema_version': '1',
            'scanner_family': 'Coverage.py',
            'status': 'COMPLETED' if measured else 'OPERATIONAL_FAILURE',
            'test_exit_code': None,
            'reason': f'Tests exceeded the trusted {test_timeout}-second limit; coverage output ' +
                      ('retained' if measured else 'missing'),
        })
        return
    if a.task == 'python-test':
        measured = (cwd / 'coverage.json').is_file()
        write(cwd / 'coverage-status.json', {'schema_version': '1', 'scanner_family': 'Coverage.py',
              'status': 'COMPLETED' if measured else 'OPERATIONAL_FAILURE', 'test_exit_code': result.returncode,
              'reason': f'Test exit={result.returncode}; coverage output ' + ('retained' if measured else 'missing')})
        return
    if a.task == 'javascript-test':
        write(root / 'typescript-test-status.json', {'scanner_family': 'TypeScript',
            'status': 'COMPLETED', 'test_exit_code': result.returncode,
            'reason': f'JavaScript tests exited {result.returncode}; inspect producer test log'})
        return
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()

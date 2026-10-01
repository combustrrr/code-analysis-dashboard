"""Convert upload-artifact steps in workflows to R2 aws s3 upload run steps.

This script rewrites workflows in .github/workflows/*.yml replacing
uses: actions/upload-artifact@... steps with a run step that calls
aws s3 cp --recursive to the configured R2 bucket. It preserves
the original step 'if' condition when present.

Use this to migrate existing workflows to the R2 broker pattern.
"""
from pathlib import Path
import yaml


WORKFLOWS = Path('.github/workflows')


def convert_step(step: dict) -> dict:
    uses = step.get('uses', '')
    if not isinstance(uses, str) or not uses.startswith('actions/upload-artifact@'):
        return step
    options = step.get('with', {})
    name = options.get('name', '')
    path = options.get('path', '.')
    r2_step = {
        'name': f'Upload {name or path} to R2',
        'if': step.get('if', 'always()'),
        'env': {
            'AWS_ACCESS_KEY_ID': '${{ secrets.R2_ACCESS_KEY }}',
            'AWS_SECRET_ACCESS_KEY': '${{ secrets.R2_SECRET_KEY }}',
            'AWS_DEFAULT_REGION': 'auto'
        },
        'run': (
            'python -m pip install --disable-pip-version-check --upgrade pip awscli\n'
            + f"aws s3 cp {path} s3://${{ secrets.R2_BUCKET_NAME }}/temp-runs/${{ github.run_id }}/${{ github.run_attempt }}/{name or ''} "
            + "--recursive --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com"
        )
    }
    return r2_step


def convert_workflow(path: Path) -> bool:
    changed = False
    text = path.read_text(encoding='utf-8')
    doc = yaml.safe_load(text)
    if not doc or 'jobs' not in doc:
        return False
    for job in doc['jobs'].values():
        steps = job.get('steps')
        if not steps:
            continue
        new_steps = []
        for step in steps:
            new = convert_step(step)
            if new is not step:
                changed = True
            new_steps.append(new)
        job['steps'] = new_steps
    if changed:
        path.write_text(yaml.safe_dump(doc, sort_keys=False, width=120), encoding='utf-8')
    return changed


def main():
    if not WORKFLOWS.exists():
        print('.github/workflows not found; nothing to convert')
        return
    for path in sorted(WORKFLOWS.glob('*.yml')):
        try:
            if convert_workflow(path):
                print(f'Converted uploads in {path}')
        except Exception as e:
            print(f'Failed to convert {path}: {e}')


if __name__ == '__main__':
    main()

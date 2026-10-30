"""Build compact, immutable documents for project workspace loading boundaries."""
from __future__ import annotations

import re

FINDINGS_PAGE_SIZE = 500


def locator_bucket(finding_id: str) -> str:
    tail = str(finding_id).rsplit(':', 1)[-1].lower()
    match = re.match(r'[0-9a-f]', tail)
    return match.group(0) if match else 'other'


def build_workspace_documents(report: dict, findings: list[dict]) -> dict[str, object]:
    pages = [findings[start:start + FINDINGS_PAGE_SIZE]
             for start in range(0, len(findings), FINDINGS_PAGE_SIZE)]
    documents: dict[str, object] = {
        'coverage.json': {
            'schema_version': 'project-coverage-v1',
            'analyzed_sha': report.get('analyzed_sha'),
            'generated_at': report.get('generated_at'),
            'report_generation_timestamp': report.get('report_generation_timestamp') or report.get('generated_at'),
            'status': report.get('status'),
            'finding_count': report.get('finding_count', len(findings)),
            'observation_count': report.get('observation_count', 0),
            'severities': report.get('severities', {}),
            'channels': [{key: row.get(key) for key in (
                'channel', 'name', 'class', 'status', 'findings', 'observation_count',
                'reason', 'workflow',
            )} for row in report.get('channels', []) if isinstance(row, dict)],
            'publication_gate': report.get('publication_gate', {}),
        },
        'findings-catalog.json': {
            'schema_version': 'findings-catalog-v1',
            'total': len(findings),
            'page_size': FINDINGS_PAGE_SIZE,
            'pages': len(pages),
        },
    }
    for page, rows in enumerate(pages):
        documents[f'findings-pages/{page}.json'] = rows
    locators: dict[str, list[dict]] = {}
    for row in findings:
        bucket = locator_bucket(str(row.get('id') or ''))
        locators.setdefault(bucket, []).append({
            'id': row.get('id'),
            'detail_page': row.get('page'),
        })
    for bucket, rows in locators.items():
        documents[f'finding-locators/{bucket}.json'] = rows
    return documents

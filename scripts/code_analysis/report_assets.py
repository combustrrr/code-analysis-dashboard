"""Content-addressed JSON shards for current reports (no report history)."""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import PurePosixPath

ASSET_LIMIT = 100_000_000


def safe_path(name: str) -> bool:
    path = PurePosixPath(name)
    return (isinstance(name, str) and bool(name) and not path.is_absolute()
            and '..' not in path.parts and '\\' not in name and ':' not in name
            and name == path.as_posix() and name.endswith('.json'))


def encode(documents: dict) -> bytes:
    return gzip.compress(json.dumps(documents, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False, allow_nan=False).encode(), mtime=0)


def shard(documents: dict, *, asset_limit: int = ASSET_LIMIT, budget: int = 900_000_000) -> tuple[dict, dict]:
    if not documents or asset_limit <= 0 or budget <= 0:
        raise ValueError('Documents and positive limits are required')
    assets, references, current = {}, {}, {}

    def flush():
        if not current:
            return
        data = encode(current)
        name = 'analysis-' + hashlib.sha256(data).hexdigest() + '.json.gz'
        assets[name] = data
        for path in current:
            references[path] = name
        current.clear()

    for path, value in sorted(documents.items()):
        if not safe_path(path):
            raise ValueError('Unsafe report document path')
        if len(encode({path: value})) > asset_limit:
            raise ValueError('Report detail exceeds asset limit; paginate the producer output')
        if current and len(encode({**current, path: value})) > asset_limit:
            flush()
        current[path] = value
    flush()
    size = sum(map(len, assets.values()))
    if size > budget:
        raise ValueError('Current report budget exceeded; retain previous manifest')
    return {'schema_version': 'analysis-assets-v1', 'documents': references,
            'assets': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                       for name, data in assets.items()}, 'compressed_bytes': size}, assets


def verify_asset(name: str, content: bytes, expected: dict) -> dict:
    if len(content) != expected['bytes'] or hashlib.sha256(content).hexdigest() != expected['sha256']:
        raise ValueError('Report asset integrity mismatch')
    if name != 'analysis-' + expected['sha256'] + '.json.gz':
        raise ValueError('Invalid content-addressed asset name')
    documents = json.loads(gzip.decompress(content))
    if not isinstance(documents, dict) or not all(safe_path(path) for path in documents):
        raise ValueError('Unsafe asset documents')
    return documents

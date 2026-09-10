"""Content-addressed JSON shards for current reports (no report history)."""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import PurePosixPath

ASSET_LIMIT = 100_000_000


def safe_path(name: str) -> bool:
    if not isinstance(name, str):
        return False
    path = PurePosixPath(name)
    return (bool(name) and not path.is_absolute() and '..' not in path.parts
            and '\\' not in name and ':' not in name and name == path.as_posix() and name.endswith('.json'))


def encode(documents: dict) -> bytes:
    return gzip.compress(json.dumps(documents, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False, allow_nan=False).encode(), mtime=0)


def shard(documents: dict, *, asset_limit: int = 4_000_000, budget: int = 900_000_000) -> tuple[dict, dict]:
    if not documents or asset_limit <= 0 or budget <= 0:
        raise ValueError('Documents and positive limits are required')
    asset_limit = min(asset_limit, ASSET_LIMIT)
    assets, references, current = {}, {}, {}
    estimated, unpacked = 0, 0

    def emit(batch):
        if not batch:
            return
        data = encode(batch)
        if len(data)>asset_limit:
            if len(batch)==1:
                raise ValueError('Report detail exceeds asset limit; paginate producer output')
            items=list(batch.items());middle=len(items)//2
            emit(dict(items[:middle]));emit(dict(items[middle:]));return
        name='analysis-'+hashlib.sha256(data).hexdigest()+'.json.gz'
        assets[name]=data
        for path in batch:
            references[path]=name

    for path, value in sorted(documents.items()):
        if not safe_path(path):
            raise ValueError('Unsafe report document path')
        raw_bytes=len(json.dumps({path:value}, ensure_ascii=False, allow_nan=False).encode())
        if raw_bytes>16_000_000:
            raise ValueError('Report document exceeds unpacked delivery limit; paginate producer output')
        size=len(encode({path:value}))
        if size>asset_limit:
            raise ValueError('Report detail exceeds asset limit; paginate producer output')
        if current and (estimated+size>asset_limit or unpacked+raw_bytes>24_000_000):
            emit(current);current={};estimated=0;unpacked=0
        current[path]=value;estimated+=size;unpacked+=raw_bytes
    emit(current)
    size=sum(map(len,assets.values()))
    if size>budget:
        raise ValueError('Current report budget exceeded; retain previous manifest')
    return {'schema_version':'analysis-assets-v1','documents':references,
            'assets':{name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in assets.items()},
            'compressed_bytes':size},assets


def verify_asset(name: str, content: bytes, expected: dict) -> dict:
    if len(content)!=expected['bytes'] or hashlib.sha256(content).hexdigest()!=expected['sha256']:
        raise ValueError('Report asset integrity mismatch')
    if name!='analysis-'+expected['sha256']+'.json.gz':
        raise ValueError('Invalid content-addressed asset name')
    documents=json.loads(gzip.decompress(content))
    if not isinstance(documents,dict) or not all(safe_path(path) for path in documents):
        raise ValueError('Unsafe asset documents')
    return documents

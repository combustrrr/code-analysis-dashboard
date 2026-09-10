"""Copy current reports to a new execution host without rewriting producer evidence."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
from scripts.code_analysis import github_service as github, release_manifest


def migrated_manifest(manifest, source, destination):
    result = copy.deepcopy(manifest)
    if result.get('schema_version') != 'analysis-current-v1' or result.get('analysis_repository') != source:
        raise ValueError('Source manifest identity mismatch')
    result['analysis_repository'] = destination
    result['relationship'] = 'connected' if result.get('source_repository', '').lower() == destination.lower() else 'observer'
    result['migration'] = {'from_execution_repository':source, 'producer_evidence':'preserved'}
    for target in result.get('targets', []):
        target['producer_repository'] = target.get('producer_repository', source)
        target['migration_producer'] = {'repository':source, 'run_id':target.get('scan_run_id'), 'attempt':target.get('run_attempt')}
        if result['relationship'] == 'observer':
            if 'native_feedback' in target:
                target['previous_native_feedback'] = target['native_feedback']
            target['native_feedback'] = {'status':'not_applicable','reason':'External read-only source; native writes prohibited'}
    return result


def migrate(source, destination, project):
    if destination.lower() == 'arydestroyer/kavach-agenticsoc' or source == destination:
        raise ValueError('Invalid migration destination')
    src = github.release(source, 'analysis-current-' + project)
    if src is None:
        raise ValueError('Current source report release is missing')
    original = release_manifest.read(source, src)
    manifest = migrated_manifest(original, source, destination)
    references = {name:meta for target in manifest['targets'] for name,meta in target.get('assets', {}).items()}
    dst = github.release(destination, 'analysis-current-' + project, create=True)
    existing = release_manifest.read(destination, dst)
    if existing and existing.get('migration', {}).get('from_execution_repository') != source:
        raise ValueError('Destination already has independent current reports')
    available = {a['name']:a for a in github.pages(f"repos/{source}/releases/{src['id']}/assets")}
    uploaded = {a['name']:a for a in github.pages(f"repos/{destination}/releases/{dst['id']}/assets")}
    with tempfile.TemporaryDirectory(prefix='analysis-migration-') as directory:
        for name, meta in references.items():
            if name != 'analysis-' + meta['sha256'] + '.json.gz' or meta['bytes'] > 100000000:
                raise ValueError('Invalid report shard reference')
            if name in uploaded:
                if uploaded[name]['size'] != meta['bytes']:
                    raise ValueError('Destination asset size mismatch')
                continue
            asset = available.get(name)
            if not asset:
                raise ValueError('Source asset is missing')
            data = github.gh('api', f"repos/{source}/releases/assets/{asset['id']}", '-H', 'Accept: application/octet-stream', binary=True)
            if len(data) != meta['bytes'] or hashlib.sha256(data).hexdigest() != meta['sha256']:
                raise ValueError('Source asset checksum mismatch')
            path = Path(directory) / name
            path.write_bytes(data)
            github.gh('release','upload',dst['tag_name'],str(path),'--repo',destination)
            path.unlink()
    release_manifest.write(destination, dst, manifest)
    verified = release_manifest.read(destination, github.release(destination, dst['tag_name']))
    if verified != manifest:
        raise ValueError('Published migration manifest mismatch')
    return {'project':project,'targets':len(manifest['targets']),'assets':len(references),'bytes':sum(m['bytes'] for m in references.values()),'verified':True}


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True)
    parser.add_argument('--destination',required=True)
    parser.add_argument('--project',required=True)
    args=parser.parse_args()
    print(json.dumps(migrate(args.source,args.destination,args.project)))

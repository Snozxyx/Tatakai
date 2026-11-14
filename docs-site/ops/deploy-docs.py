"""Promote a verified static documentation release on the Tatakai server."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
import urllib.request
import zipfile

RELEASES = pathlib.Path('/srv/tatakai/releases')
RUNTIME = pathlib.Path('/srv/tatakai/docs')
RECEIPTS = pathlib.Path('/srv/tatakai/private/docs-deployments')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Documentation runtime command failed: ' + result.stderr[-800:])
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--release', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-f0-9]{64}', args.sha256) or not re.fullmatch(r'docs-[a-z0-9-]{8,80}', args.release):
        raise ValueError('Invalid release identity')
    archive = pathlib.Path(args.archive).resolve()
    if digest(archive) != args.sha256:
        raise ValueError('Archive checksum mismatch')
    destination = (RELEASES / args.release).resolve()
    if destination.parent != RELEASES.resolve():
        raise ValueError('Release escaped its directory')
    with zipfile.ZipFile(archive) as source:
        if sum(item.file_size for item in source.infolist()) > 200_000_000:
            raise ValueError('Documentation archive exceeded its budget')
        metadata = json.loads(source.read('release.json'))
        if metadata.get('component') != 'docs' or metadata.get('hostname') != 'docs.tatakai.app':
            raise ValueError('Unexpected documentation artifact')
        if source.testzip() is not None:
            raise ValueError('Corrupt documentation archive')
    spec = importlib.util.spec_from_file_location('release_extractor', '/srv/tatakai/infra/tools/extract-release.py')
    extractor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extractor)
    if destination.exists():
        saved = json.loads((destination / 'release.json').read_text())
        if saved != metadata:
            raise ValueError('Existing release differs from the candidate')
    else:
        destination.mkdir(mode=0o755)
        extractor.extract(archive, destination)
    for relative, expected in metadata['files'].items():
        path = (destination / 'website' / relative).resolve()
        if not path.is_relative_to(destination / 'website') or digest(path) != expected:
            raise ValueError('Extracted documentation checksum mismatch')
    for path in destination.rglob('*'):
        path.chmod(0o755 if path.is_dir() else 0o644)
    RUNTIME.mkdir(mode=0o755, parents=True, exist_ok=True)
    RECEIPTS.mkdir(mode=0o700, parents=True, exist_ok=True)
    marker = RUNTIME / '.tatakai-docs-managed'
    if not marker.exists() and any(RUNTIME.iterdir()):
        raise ValueError('Existing documentation runtime is not managed by this tool')
    pointer = RELEASES / 'docs-current'
    if pointer.exists() and not pointer.is_symlink():
        raise ValueError('Documentation pointer is not a symlink')
    old_target = str(pointer.readlink()) if pointer.is_symlink() else None
    backup = RECEIPTS / (args.release + '-before')
    backup.mkdir(mode=0o700, exist_ok=True)
    source_root = pathlib.Path(__file__).parent
    for name in ['compose.yml', 'nginx.conf']:
        current = RUNTIME / name
        if current.exists():
            shutil.copy2(current, backup / name)
        current.write_bytes((source_root / name).read_bytes())
        current.chmod(0o644)
    marker.write_text('Tatakai static documentation\n')
    compose = ['docker', 'compose', '--project-directory', str(RUNTIME), '-f', str(RUNTIME / 'compose.yml')]
    command(compose + ['config', '--quiet'])
    candidate = RELEASES / '.docs-current-candidate'
    if candidate.is_symlink():
        candidate.unlink()
    candidate.symlink_to(args.release)
    os.replace(candidate, pointer)
    receipt = {'component':'docs','release':args.release,'archive_sha256':args.sha256,'previous':old_target,'pages':len(metadata['pages']),'status':'running'}
    try:
        command(compose + ['up', '-d', '--no-build'])
        command(compose + ['exec', '-T', 'docs', 'nginx', '-t'])
        command(compose + ['exec', '-T', 'docs', 'nginx', '-s', 'reload'])
        ready = False
        for attempt in range(20):
            try:
                request = urllib.request.Request('http://127.0.0.1:8085/health/ready', headers={'Host':'docs.tatakai.app'})
                with urllib.request.urlopen(request, timeout=2) as response:
                    ready = response.status == 200 and json.load(response)['service'] == 'tatakai-docs'
                if ready:
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not ready:
            raise RuntimeError('Documentation readiness check failed')
        for page in metadata['pages']:
            route = '/' if page['path'] == 'welcome-to-tatakai.md' else '/' + page['path'].removesuffix('.md')
            request = urllib.request.Request('http://127.0.0.1:8085' + route, headers={'Host':'docs.tatakai.app'})
            with urllib.request.urlopen(request, timeout=3) as response:
                if response.status != 200 or b'<title>' not in response.read():
                    raise RuntimeError('Documentation page verification failed')
        receipt['status'] = 'succeeded'
    except Exception:
        if old_target is None:
            pointer.unlink()
            subprocess.run(compose + ['stop', 'docs'], capture_output=True)
        else:
            candidate.symlink_to(old_target)
            os.replace(candidate, pointer)
            for name in ['compose.yml', 'nginx.conf']:
                if (backup / name).exists():
                    (RUNTIME / name).write_bytes((backup / name).read_bytes())
            subprocess.run(compose + ['up', '-d', '--no-build'], capture_output=True)
            subprocess.run(compose + ['exec', '-T', 'docs', 'nginx', '-s', 'reload'], capture_output=True)
        receipt['status'] = 'rolled_back'
        raise
    finally:
        (RECEIPTS / (args.release + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))

if __name__ == '__main__':
    RELEASES.mkdir(parents=True, exist_ok=True)
    with (RELEASES / '.docs-release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        main()

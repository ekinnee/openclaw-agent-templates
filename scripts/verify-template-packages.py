#!/usr/bin/env python3
"""Verify both packaging boundaries without registry access or agent creation.

Requires a compatible OpenClaw CLI, npm and Pillow. Output is retained for review.
Use a fresh --out directory; no existing evidence or OpenClaw state is overwritten.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

from PIL import Image


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--openclaw', default='openclaw')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    cli = shutil.which(args.openclaw)
    npm = shutil.which('npm')
    assert cli and npm, 'OpenClaw and npm must be available'
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    for directory in ['home', 'state', 'tmp', 'cache', 'config']:
        (out / directory).mkdir(mode=0o700)
    config = out / 'state/openclaw.json'
    config.write_text(json.dumps({'logging': {'file': str(out / 'openclaw.log')}}))
    # No operator config, tokens, model keys, npm credentials, or live Gateway URL.
    env = {key: os.environ[key] for key in ['PATH', 'LANG', 'TZ'] if key in os.environ}
    env.update({
        'HOME': str(out / 'home'), 'TMPDIR': str(out / 'tmp'),
        'XDG_CACHE_HOME': str(out / 'cache'), 'XDG_CONFIG_HOME': str(out / 'config'),
        'OPENCLAW_STATE_DIR': str(out / 'state'), 'OPENCLAW_CONFIG_PATH': str(config),
        'OPENCLAW_TMP_DIR': str(out / 'tmp'), 'npm_config_cache': str(out / 'cache/npm'),
        'npm_config_userconfig': str(out / 'npm-user.conf'),
        'npm_config_globalconfig': str(out / 'npm-global.conf'),
        'npm_config_update_notifier': 'false',
    })
    (out / 'npm-user.conf').write_text('')
    (out / 'npm-global.conf').write_text('')

    def run(label, command, cwd=root, structured=True):
        result = subprocess.run(command, cwd=cwd, env=env, capture_output=True,
                                text=True, timeout=120)
        (out / (label + '.stdout')).write_text(result.stdout)
        (out / (label + '.stderr')).write_text(result.stderr)
        assert result.returncode == 0, f'{label}: exit {result.returncode}; see {out}'
        return json.loads(result.stdout) if structured else result.stdout.strip()

    summary = {'openclaw': run('version', [cli, '--version'], structured=False),
               'npm': run('npm-version', [npm, '--version'], structured=False),
               'templates': []}
    for slug in ['language-conversation-partner', 'campaign-keeper']:
        source = root / 'templates' / slug
        metadata = json.loads((source / 'package.json').read_text())
        validation = run(slug + '-validate', [cli, 'templates', 'validate', str(source), '--json'])
        assert validation['ok'] is True
        manifest = validation['manifest']
        assert manifest.get('categories') == ['entertainment']
        avatar = manifest['agent']['identity']['avatar']
        mappings = manifest['workspace']['files']
        selected_icon = [f for f in mappings if f['path'] == avatar]
        assert selected_icon == [{'source': 'assets/icon.png', 'path': avatar}], selected_icon
        icon = (source / 'assets/icon.png').read_bytes()
        assert len(icon) <= 512 * 1024, 'ClawHub catalog icon exceeds 512 KiB'
        with Image.open(source / 'assets/icon.png') as image:
            assert image.format == 'PNG'
            dimensions = image.size
            image.verify()
        assert manifest.get('plugins', []) == ([{
            'ref': '@ekinnee/campaign-keeper-solo-engine', 'version': '0.1.0'
        }] if slug == 'campaign-keeper' else [])
        assert manifest['agent']['tools'] == {
            'profile': 'full', 'allow': ['read', 'campaign_keeper_solo_intent']
            if slug == 'campaign-keeper' else ['read'], 'fs': {'workspaceOnly': True}
        }
        selected = {f['source'] for f in mappings}
        selected.update(f['source'] for f in manifest['workspace']['bootstrapFiles'].values())
        assert all((source / p).stat().st_size <= 1024 * 1024 for p in selected)
        assert sum((source / p).stat().st_size for p in selected) <= 4 * 1024 * 1024
        expected = selected | {'package.json', 'CLAW.md', 'LICENSE', 'BOOTSTRAP.md'}
        official = out / (slug + '-official.tgz')
        run(slug + '-build', [cli, 'templates', 'build', str(source), '--out', str(official), '--json'])
        npm_dir = out / (slug + '-npm')
        npm_dir.mkdir()
        packed = run(slug + '-npm-pack', [npm, 'pack', str(source), '--json',
                     '--ignore-scripts', '--pack-destination', str(npm_dir)])
        entry = packed[0] if isinstance(packed, list) else next(iter(packed.values()))
        npm_archive = npm_dir / entry['filename']
        artifacts = []
        for kind, archive in [('official', official), ('npm', npm_archive)]:
            extracted = out / (slug + '-' + kind + '-extracted')
            extracted.mkdir()
            with tarfile.open(archive) as tar:
                files = {m.name.removeprefix('package/'): m for m in tar.getmembers() if m.isfile()}
                assert set(files) == expected, (kind, set(files) ^ expected)
                assert not any(m.issym() or m.islnk() for m in tar.getmembers())
                for name, member in files.items():
                    content = tar.extractfile(member).read()
                    if name == 'package.json':
                        expected_metadata = metadata if kind == 'npm' else {
                            k: v for k, v in metadata.items() if k != 'files'
                        }
                        assert json.loads(content) == expected_metadata
                    else:
                        assert content == (source / name).read_bytes(), (kind, name)
                tar.extractall(extracted, filter='data')
            report = run(slug + '-' + kind + '-extracted-validate',
                         [cli, 'templates', 'validate', str(extracted / 'package'), '--json'])
            assert report['ok'] is True
            artifacts.append({'kind': kind, 'path': str(archive),
                              'sha256': sha256(archive.read_bytes()), 'files': sorted(files)})
        summary['templates'].append({'name': metadata['name'], 'version': metadata['version'],
            'avatar': avatar, 'iconBytes': len(icon), 'dimensions': dimensions,
            'iconSha256': sha256(icon), 'artifacts': artifacts})
    (out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()

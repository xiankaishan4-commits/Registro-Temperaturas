"""Publish only the already verified APK; never handle signing material here."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

REPO = 'xiankaishan4-commits/Registro-Temperaturas'

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    version = os.environ['APP_VERSION']
    code = os.environ['APP_VERSION_CODE']
    source = os.environ['GITHUB_SHA']
    assert os.environ['GITHUB_REPOSITORY'] == REPO
    assert os.environ['GITHUB_REF'] == 'refs/heads/main'
    assert re.fullmatch(r'\d+\.\d+\.\d+', version)
    assert re.fullmatch(r'\d+', code) and re.fullmatch(r'[0-9a-f]{40}', source)
    tag = 'v' + version
    name = 'Registro_Temperaturas_' + tag + '_Firmado.apk'
    apk = Path(os.environ['RUNNER_TEMP']) / name
    assert apk.is_file() and apk.stat().st_size > 0
    expected = sha(apk)
    releases = [r for page in json.loads(gh('api', '--paginate', '--slurp', f'repos/{REPO}/releases?per_page=100')) for r in page]
    existing = [r for r in releases if r['tag_name'] == tag]
    assert len(existing) <= 1
    # A published version is immutable: a rerun may verify it, but never replace it.
    if existing:
        release = existing[0]
        assert release['target_commitish'] == source and not release['prerelease']
        assets = {a['name']: a for a in release['assets']}
        assert name in assets and assets[name]['digest'] == 'sha256:' + expected
        assert 'SHA256SUMS' in assets
    else:
        stable = [r for r in releases if not r['draft'] and not r['prerelease'] and re.fullmatch(r'v\d+\.\d+\.\d+', r['tag_name'])]
        assert all(tuple(map(int, r['tag_name'][1:].split('.'))) < tuple(map(int, version.split('.'))) for r in stable), 'A newer release already exists'
        refs = json.loads(gh('api', f'repos/{REPO}/git/matching-refs/tags/{tag}'))
        exact = [r for r in refs if r['ref'] == 'refs/tags/' + tag]
        assert not exact or (len(exact) == 1 and exact[0]['object']['type'] == 'commit' and exact[0]['object']['sha'] == source)
        notes = f'''# Registro de Temperaturas {tag}

- Versión {version}, versionCode {code}; Android 10 o posterior.
- Temperaturas reales guardables dentro o fuera del rango propio de cada equipo, con alerta roja. Acción correctiva opcional.
- Acciones posteriores con autor, fecha y auditoría sin alterar la medición original.
- Versión instalada desde BuildConfig y búsqueda manual de actualizaciones oficiales en Ajustes.
- Se conservan equipos, fotos, responsables, fechas, historial y copias ZIP/JSON. Sin instalación automática.
- Paquete: `com.shanfoodsgroup.temperaturas`; misma firma permanente que v1.6.0.
- Certificado SHA-256: `CA948872880E588B54F63077AC25BDDCC13CE8C5126CBC38AF27DC26B30129CA`.
- Commit: `{source}`.
- [Compilación y pruebas](https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}).

Instala como actualización sobre una versión con la misma firma para conservar los datos. No desinstales la aplicación. Puedes guardar antes una copia ZIP desde Ajustes.
'''
        notes_file = apk.parent / 'release-notes.md'
        notes_file.write_text(notes, encoding='utf-8')
        sums = apk.parent / 'SHA256SUMS'
        sums.write_text(f'{expected}  {name}\n', encoding='utf-8')
        gh('release', 'create', tag, str(apk), str(sums), '--repo', REPO, '--target', source,
           '--title', 'Registro de Temperaturas ' + tag, '--notes-file', str(notes_file), '--draft')
        # Drafts are visible to the authenticated runner via the list endpoint.
        releases = [r for page in json.loads(gh('api', '--paginate', '--slurp', f'repos/{REPO}/releases?per_page=100')) for r in page]
        release, = [r for r in releases if r['tag_name'] == tag]
    # Download draft assets and compare bytes before publishing.
    with tempfile.TemporaryDirectory() as directory:
        gh('release', 'download', tag, '--repo', REPO, '--dir', directory)
        assert sha(Path(directory) / name) == expected
        assert (Path(directory) / 'SHA256SUMS').read_text() == f'{expected}  {name}\n'
    if release['draft']:
        gh('release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest')
    # No authentication: verify what phone users can actually download.
    with urllib.request.urlopen(f'https://api.github.com/repos/{REPO}/releases/tags/{tag}', timeout=30) as response:
        public = json.load(response)
    assert public['tag_name'] == tag and not public['draft'] and not public['prerelease']
    url = f'https://github.com/{REPO}/releases/download/{tag}/{name}'
    assert any(a['browser_download_url'] == url and a['state'] == 'uploaded' and a['digest'] == 'sha256:' + expected for a in public['assets'])
    with urllib.request.urlopen(url, timeout=60) as response:
        assert hashlib.sha256(response.read()).hexdigest() == expected
    print('Public Release:', public['html_url'])
    print('Verified public APK:', url)
    print('APK SHA-256:', expected)
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
        summary.write(f"Version: {version} ({code})\n\nRelease: {public['html_url']}\n\nAPK: {url}\n\nSHA-256: `{expected}`\n")

if __name__ == '__main__':
    main()

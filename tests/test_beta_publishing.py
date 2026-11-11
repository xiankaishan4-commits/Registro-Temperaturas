import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('beta', ROOT / 'scripts/publish_beta.py')
beta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(beta)


class BetaPublishingTest(unittest.TestCase):
    def test_prerelease_keeps_stable_and_verifies_actual_download(self):
        with tempfile.TemporaryDirectory() as directory:
            version = '1.7.0-beta.1'
            tag = 'v' + version
            name = 'Registro_Temperaturas_' + tag + '_Firmado.apk'
            apk = Path(directory, name)
            apk.write_bytes(b'signed-apk-fixture')
            digest = beta.sha(apk)
            url = f'https://github.com/{beta.REPO}/releases/download/{tag}/{name}'
            stable = {'id':10, 'tag_name':'v1.6.1', 'draft':False, 'prerelease':False}
            release = {'id':11, 'tag_name':tag, 'draft':True, 'prerelease':True,
                       'target_commitish':'a'*40, 'html_url':f'https://github.com/{beta.REPO}/releases/tag/{tag}',
                       'assets':[{'name':name,'digest':'sha256:'+digest,'state':'uploaded','browser_download_url':url}]}
            releases = [stable]
            calls = []
            def gh(*args):
                calls.append(args)
                if args[0] == 'api':
                    endpoint = args[-1]
                    if endpoint.endswith('/latest'): return json.dumps(stable)
                    if '/matching-refs/' in endpoint: return '[]'
                    return json.dumps([releases])
                if args[:2] == ('release', 'create'):
                    self.assertIn('--prerelease', args)
                    self.assertIn('--latest=false', args)
                    self.assertIn('--draft', args)
                    releases.append(release)
                elif args[:2] == ('release', 'download'):
                    dest = Path(args[args.index('--dir')+1])
                    (dest/name).write_bytes(apk.read_bytes())
                    (dest/'SHA256SUMS').write_text(f'{digest}  {name}\n')
                elif args[:2] == ('release', 'edit'):
                    self.assertIn('--latest=false', args)
                    self.assertIn('--prerelease', args)
                    release['draft'] = False
                return ''
            def public_fetch(request_url, **kwargs):
                if request_url == url: return io.BytesIO(apk.read_bytes())
                return io.BytesIO(json.dumps(release).encode())
            env = {'APP_VERSION':version, 'APP_VERSION_CODE':'12', 'GITHUB_SHA':'a'*40,
                   'GITHUB_REPOSITORY':beta.REPO, 'GITHUB_REF':'refs/heads/feature/registro-limpieza-local',
                   'RUNNER_TEMP':directory, 'GITHUB_RUN_ID':'123', 'GITHUB_STEP_SUMMARY':directory+'/summary'}
            with patch.dict(os.environ, env), patch.object(beta, 'gh', side_effect=gh), patch.object(beta.urllib.request, 'urlopen', side_effect=public_fetch):
                beta.main()
            self.assertTrue(release['prerelease'])
            self.assertFalse(release['draft'])
            self.assertEqual(len([c for c in calls if c[:2] == ('release','edit')]),1)
            self.assertEqual(stable['id'],10)
            self.assertIn(url, Path(directory,'summary').read_text())

    def test_ref_and_version_guard_reject_before_any_remote_write(self):
        for ref, version in [('refs/heads/main','1.7.0-beta.1'),
                             ('refs/heads/feature/registro-limpieza-local','1.7.0')]:
            env = {'APP_VERSION':version,'APP_VERSION_CODE':'12','GITHUB_SHA':'a'*40,
                   'GITHUB_REPOSITORY':beta.REPO,'GITHUB_REF':ref}
            with patch.dict(os.environ,env),patch.object(beta,'gh') as gh:
                with self.assertRaises(AssertionError): beta.main()
                gh.assert_not_called()


if __name__ == '__main__': unittest.main()

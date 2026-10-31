import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('publish', ROOT / 'scripts/publish_release.py')
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

class ReleasePublishingTest(unittest.TestCase):
    def run_rejected(self, releases):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'Registro_Temperaturas_v1.6.1_Firmado.apk').write_bytes(b'fixture-apk')
            env = {'APP_VERSION':'1.6.1','APP_VERSION_CODE':'11','GITHUB_SHA':'a'*40,
                   'GITHUB_REPOSITORY':publish.REPO,'GITHUB_REF':'refs/heads/main','RUNNER_TEMP':directory}
            with patch.dict(os.environ, env), patch.object(publish, 'gh', return_value=json.dumps([releases])) as gh:
                with self.assertRaises(AssertionError): publish.main()
                self.assertEqual(gh.call_count, 1, 'Must stop before creating or changing any Release')

    def test_never_replace_published_asset_with_different_bytes(self):
        self.run_rejected([{'tag_name':'v1.6.1','draft':False,'prerelease':False,
            'target_commitish':'a'*40,'assets':[{'name':'Registro_Temperaturas_v1.6.1_Firmado.apk','digest':'sha256:wrong'}]}])

    def test_never_publish_older_than_existing_stable(self):
        self.run_rejected([{'tag_name':'v1.7.0','draft':False,'prerelease':False}])

    def test_never_attach_to_unrelated_commit(self):
        self.run_rejected([{'tag_name':'v1.6.1','draft':True,'prerelease':False,'target_commitish':'b'*40}])

if __name__ == '__main__': unittest.main()

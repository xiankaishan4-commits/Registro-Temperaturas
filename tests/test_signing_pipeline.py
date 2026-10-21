import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

class SigningPipelineTest(unittest.TestCase):
    def test_app_version_and_package_are_stable(self):
        gradle=(ROOT/'app/build.gradle').read_text(encoding='utf-8')
        self.assertIn("applicationId 'com.shanfoodsgroup.temperaturas'",gradle)
        self.assertIn('versionCode 8',gradle)
        self.assertIn("versionName '1.4.0'",gradle)
        self.assertIn('signingConfig signingConfigs.release',gradle)
        self.assertIn("tasks.register('requirePermanentSigningKey')",gradle)
    def test_secrets_are_not_embedded_in_git(self):
        gradle=(ROOT/'app/build.gradle').read_text(encoding='utf-8')
        workflow=(ROOT/'.github/workflows/build-android-apk.yml').read_text(encoding='utf-8')
        for secret in ('ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'):
            self.assertIn('${{ secrets.'+secret+' }}',workflow)
        self.assertIn('ANDROID_KEYSTORE_FILE',gradle)
        self.assertNotIn('assembleDebug',workflow)
        self.assertIn(':app:assembleRelease',workflow)
        self.assertIn('apksigner',workflow)
        self.assertIn('if-no-files-found: error',workflow)
        for f in ROOT.rglob('*'):
            if f.is_file():
                self.assertNotIn(f.suffix.lower(),('.p12','.jks','.keystore'),str(f))
    def test_same_fingerprint_expected_each_build(self):
        workflow=(ROOT/'.github/workflows/build-android-apk.yml').read_text(encoding='utf-8')
        m=re.search(r'EXPECTED_CERT_SHA256:\s*([A-F0-9]{64})',workflow)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1),'CA948872880E588B54F63077AC25BDDCC13CE8C5126CBC38AF27DC26B30129CA')

if __name__=='__main__': unittest.main()

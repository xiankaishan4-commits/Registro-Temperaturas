import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'app/src/main/assets'

class AssetsTest(unittest.TestCase):
    def test_referenced_html_ids_exist(self):
        html=(ASSETS/'index.html').read_text(encoding='utf-8')
        for required in ('deviceActiveInput','btnShareZip','btnExportZip','importZipInput','recordPhotoInput','recordTempInput'):
            self.assertIn(f'id="{required}"',html)
    def test_android_bridge_matches_native(self):
        js=(ASSETS/'app.js').read_text(encoding='utf-8')
        java=(ROOT/'app/src/main/java/com/shanfoodsgroup/temperaturas/MainActivity.java').read_text(encoding='utf-8')
        self.assertNotIn('window.Android.saveBackupZip',js)
        for method in ('begin','append','finish','cancel'):
            self.assertIn(f'bridge.{method}(',js)
            self.assertIn(f'void {method}(',java)
    def test_data_migration_uses_both_origins(self):
        js=(ASSETS/'app.js').read_text(encoding='utf-8')
        for value in ("ShanTemperaturasDB", "shanfood_temperaturas_offline", 'legacySnapshot()', 'migrateLegacyData()', "'photos'", "'equipos'", "'registros'"):
            self.assertIn(value,js)

if __name__=='__main__': unittest.main()
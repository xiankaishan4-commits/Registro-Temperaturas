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

    def test_reporting_and_audit_ui_exist(self):
        html=(ASSETS/'index.html').read_text(encoding='utf-8')
        js=(ASSETS/'app.js').read_text(encoding='utf-8')
        core=(ASSETS/'records-core.js').read_text(encoding='utf-8')
        for id in ('recordEntryMode','priorMeasureAt','omittedReason','correctionReason','exportDeviceFilter','exportFromDate','exportToDate','btnExportCSV','btnExportPDF','pastMissingList'):
            self.assertIn('id="'+id+'"',html)
        for term in ('recordedAt','supersedesId','slotProgramado','registroTipo','migrateLegacyData','backup_datos.json','informe_temperaturas.csv'):
            self.assertIn(term,js)
        for fn in ('effective', 'slotSatisfied', 'exportRows', 'csv'):
            self.assertIn(fn,core)
    def test_android_pdf_and_legacy_backups(self):
        java=(ROOT/'app/src/main/java/com/shanfoodsgroup/temperaturas/MainActivity.java').read_text(encoding='utf-8')
        self.assertIn(r'records-core\\.js',java)
        self.assertIn('exportPdf(',java)
        self.assertIn('PdfDocument',java)
        self.assertIn('.pdf',java)
        gradle=(ROOT/'app/build.gradle').read_text(encoding='utf-8')
        self.assertIn('versionCode 3',gradle)

if __name__=='__main__': unittest.main()

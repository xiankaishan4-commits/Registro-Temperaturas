$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    foreach ($test in @('test_company_settings','test_records_core','test_report_core','test_excel_core','test_updates','test_cleaning_core','test_cleaning_exports','test_temperature_app','test_cleaning_app')) {
        & node "tests/$test.cjs"
        if ($LASTEXITCODE -ne 0) { throw "Test failed: $test" }
    }
    & python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Python checks failed' }
} finally { Pop-Location }

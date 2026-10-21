const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=path.join(__dirname,'../app/src/main/assets');
const ctx={}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'excel-core.js'),'utf8'),ctx);
const X=ctx.RTExcel;
const sample=[
  {equipo:'Congelador 1',fecha:'2026-10-20',hora:'21:30',temperatura:'-21,5',minTemp:-24,maxTemp:-18,responsable:'Ana',observaciones:'',id:'1'},
  {equipo:'Mural 1 Carnes',fecha:'2026-10-21',hora:'09:12',temperatura:'3,5',minTemp:0,maxTemp:4,responsable:'Luis',observaciones:'',id:'2'},
  {equipo:'Mural 1 Carnes',fecha:'2026-10-21',hora:'21:18',temperatura:'',minTemp:0,maxTemp:4,responsable:'',observaciones:'Sin medición',id:'3'},
  {equipo:'Mural 2',fecha:'2026-09-29',hora:'08:40',temperatura:'5,0',minTemp:0,maxTemp:4,responsable:'=HYPERLINK("x")',observaciones:'',id:'4'}
];
assert.equal(X.excelDate('2026-10-21'),46316);
assert.equal(X.excelDate('2026-02-30'),null);
assert.equal(X.excelTime('21:30'),21.5/24);
assert.equal(X.excelTime('24:00'),null);
const rows=X.normalized(sample);
assert.equal(rows[0].fecha,'2026-10-21');
assert.equal(rows[0].equipo,'Mural 1 Carnes');
assert.equal(rows.find(x=>x.equipo==='Mural 2').estado,'FUERA DE RANGO');
assert.equal(rows.find(x=>x.hora==='21:18').estado,'SIN MEDICIÓN');
const files=X.build(sample),byName=new Map(files.map(e=>[e.name,e.data]));
assert.equal(byName.size,10); // OOXML base 5 files + 5 worksheets (2 monthly tabs)
assert(byName.get('[Content_Types].xml').includes('spreadsheetml.sheet.main+xml'));
assert(byName.get('xl/workbook.xml').includes('Resumen diario'));
assert(byName.get('xl/workbook.xml').includes('2026-09'));
assert(byName.get('xl/workbook.xml').includes('2026-10'));
assert(byName.get('xl/worksheets/sheet3.xml').includes('autoFilter ref="A1:I5"'));
assert(byName.get('xl/worksheets/sheet3.xml').includes('state="frozen"'));
assert(byName.get('xl/worksheets/sheet3.xml').includes('t="inlineStr"'));
assert(!byName.get('xl/worksheets/sheet3.xml').includes('<f>'));
assert(byName.get('xl/worksheets/sheet3.xml').includes('&quot;x&quot;'));
assert(!byName.get('xl/worksheets/sheet3.xml').includes('Registro tardío'));
assert(byName.get('xl/worksheets/sheet3.xml').includes('>46316</v>')); // actual Excel dates
assert(byName.get('xl/worksheets/sheet3.xml').includes('>-21.5</v>')); // numeric temp
assert(byName.get('xl/worksheets/sheet3.xml').includes('r="D3" s="4"/')); // missing temp stays blank
const daily=byName.get('xl/worksheets/sheet1.xml');
assert(daily.includes('A1:F4'));
assert.throws(()=>X.build([]),/No hay/);
assert.throws(()=>X.build(Array(25001).fill(sample[0])),/Demasiados/);
console.log('Excel export: 20 checks passed');
// Produce a small fixture for ZIP / spreadsheet reader validation.
fs.writeFileSync(path.join(__dirname, 'excel_fixture.json'), JSON.stringify(files));

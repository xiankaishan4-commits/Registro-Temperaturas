const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assets=path.join(__dirname,'../app/src/main/assets');
const ExcelJS=require(path.join(assets,'vendor/exceljs.min.js'));
const ctx={ExcelJS,Intl,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(assets,'excel-core.js'),'utf8'),ctx);
const X=ctx.RTExcel;
const devices=[{id:'10',nombre:'Mural 10'},{id:'1',nombre:'Mural 1'},{id:'2',nombre:'Mural 2'},{id:'x',nombre:'Cámara Árbol'},{id:'ordered',nombre:'Nevera especial',orden:1}];
const rows=[
 {equipo:'Mural 10',fecha:'2026-10-03',hora:'21:00',temperatura:'4,0',responsable:'Ana',observaciones:'Descarche',id:'r10'},
 {equipo:'Mural 1',fecha:'2026-10-02',hora:'09:13',temperatura:'3,0',responsable:'Luis',observaciones:'',id:'r1'},
 {equipo:'Mural 1',fecha:'2026-10-02',hora:'21:13',temperatura:'4.0',responsable:'Luis',observaciones:'',id:'r2'},
 {equipo:'Mural 2',fecha:'2026-10-02',hora:'15:00',temperatura:'-22,5',responsable:'=HYPERLINK("x")',observaciones:'',id:'r3'},
 {equipo:'Mural 2',fecha:'2026-10-03',hora:'',temperatura:'',responsable:'',observaciones:'Sin medición',id:'r4'},
 {equipo:'Cámara Árbol',fecha:'2026-09-29',hora:'09:10',temperatura:'2,0',responsable:'Eva',observaciones:'',id:'old'}
];
const m=X.prepare(rows,devices,{month:'2026-10',deviceId:'ALL'});
assert.equal(m.month.days,31);
assert.deepEqual(Array.from(m.matrix.map(x=>x.name)),['Nevera especial','Cámara Árbol','Mural 1','Mural 2','Mural 10']);
assert.equal(m.matrix.length,5);
assert(m.matrix.find(x=>x.name==='Mural 1').cells[1].value.includes('09:13: 3.0°C\n21:13: 4.0°C'));
assert.equal(m.matrix.find(x=>x.name==='Mural 2').cells[2].value,'');
assert(m.matrix.find(x=>x.name==='Mural 10').cells[2].highlight);
assert(m.matrix.find(x=>x.name==='Mural 10').cells[2].value.includes('Descarche'));
assert(m.matrix.find(x=>x.name==='Nevera especial').cells.every(c=>!c.value));
assert.equal(m.details.length,5);
assert.equal(m.details[0].fecha,'2026-10-02');
assert.equal(m.details[0].hora,'09:13');
assert.equal(m.details.find(x=>x.temperatura===-22.5).temperatura,-22.5);
assert.equal(X.prepare([],devices,{month:'2026-02'}).month.days,28);
assert.equal(X.prepare([],devices,{month:'2028-02'}).month.days,29);
assert.throws(()=>X.prepare([],devices,{month:'2026-13'}),/válido/);
(async()=>{
 const bytes=await X.build(rows,devices,{month:'2026-10'});
 assert(ArrayBuffer.isView(bytes) && bytes.length>5000);
 assert.equal(Buffer.from(bytes).toString('ascii',0,2),'PK');
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(bytes));
 assert.deepEqual(book.worksheets.map(s=>s.name),['Resumen Mensual','Registro Detallado']);
 const matrix=book.getWorksheet('Resumen Mensual');
 assert.equal(matrix.getCell('A3').value,'Equipo');
 assert.equal(matrix.getCell('B3').value,'01');
 assert.equal(matrix.getCell('AF3').value,'31');
 assert.equal(matrix.getCell('A4').value,'Nevera especial');
 const all=matrix.getRows(4,5);
 const mural10=all.find(r=>r.getCell(1).value==='Mural 10');
 assert(mural10.getCell(4).value.includes('Descarche'));
 assert.equal(mural10.getCell(4).fill.fgColor.argb,'FFFFEFBE');
 const mural1=all.find(r=>r.getCell(1).value==='Mural 1');
 assert(mural1.getCell(3).value.includes('\n'));
 const detail=book.getWorksheet('Registro Detallado');
 assert.deepEqual(detail.getRow(1).values.slice(1),['Equipo','Fecha de medición','Hora de medición','Temperatura (°C)','Responsable','Observaciones']);
 assert.equal(detail.getRow(2).getCell(4).value,3);
 assert.equal(detail.getRow(2).getCell(4).numFmt,'0.0');
 assert(detail.getRow(2).getCell(2).value instanceof Date);
 assert.equal(detail.getRow(2).getCell(3).numFmt,'hh:mm');
 assert.equal(detail.getRow(5).getCell(4).value,null);
 assert(detail.views[0].state==='frozen');
 assert(detail.autoFilter);
 console.log('ExcelJS Monthly Matrix + Details: 25 checks passed');
 fs.writeFileSync(path.join(__dirname,'excel_new_fixture.xlsx'),bytes);
})().catch(e=>{console.error(e);process.exitCode=1;});
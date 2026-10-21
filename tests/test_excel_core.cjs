const assert=require('node:assert/strict');
const ExcelJS=require('../app/src/main/assets/vendor/exceljs.min.js');
global.ExcelJS=ExcelJS;
require('../app/src/main/assets/excel-core.js');
const X=global.RTExcel;
const devices=[{id:'a',nombre:'Mural 10'},{id:'b',nombre:'Mural 1'},{id:'c',nombre:'Mural 2'},{id:'d',nombre:'Nevera propia',orden:1}];
const rows=[
 {equipo:'Mural 1',fecha:'2026-10-21',hora:'09:00',temperatura:'3,0',responsable:'Leo',id:'a'},
 {equipo:'Mural 1',fecha:'2026-10-21',hora:'21:00',temperatura:'4.0',responsable:'Leo',id:'b'},
 {equipo:'Mural 10',fecha:'2026-11-02',hora:'10:00',temperatura:'-19,5',observaciones:'Descarche',id:'c'},
 {equipo:'Mural 2',fecha:'2026-11-02',hora:'',temperatura:'',observaciones:'Sin medición',id:'d'},
 {equipo:'Mural 2',fecha:'2026-09-01',hora:'09:00',temperatura:'4,0',id:'outside'}
];
const m=X.prepare(rows,devices,{from:'2026-10-21',to:'2026-11-10'});
assert.deepEqual(m.months.map(x=>x.key),['2026-10','2026-11']);
assert.equal(m.months[0].dateColumns[0],21);
assert.equal(m.months[0].dateColumns.at(-1),31);
assert.equal(m.months[1].dateColumns[0],1);
assert.equal(m.months[1].dateColumns.at(-1),10);
assert.deepEqual(m.equipments.map(x=>x.name),['Nevera propia','Mural 1','Mural 2','Mural 10']);
assert.equal(m.details.length,4);
assert(m.months[0].matrix.find(x=>x.name==='Mural 1').cells[0].value.includes('\n'));
assert.equal(m.months[1].matrix.find(x=>x.name==='Mural 10').cells[1].highlight,true);
assert.equal(m.months[1].matrix.find(x=>x.name==='Mural 2').cells[1].value,'');
assert.equal(X.prepare(rows,devices,{from:'2026-10-21',to:'2026-10-21'}).months[0].dateColumns.length,1);
assert.equal(X.prepare([],devices,{from:'2028-02-01',to:'2028-02-29'}).months[0].days,29);
assert.equal(X.prepare([],devices,{from:'2026-02-01',to:'2026-02-28'}).months[0].days,28);
assert.throws(()=>X.prepare([],devices,{from:'2026-02-29',to:'2026-03-01'}),/válida/);
assert.throws(()=>X.prepare([],devices,{from:'2026-11-02',to:'2026-10-02'}),/posterior/);
assert.throws(()=>X.prepare([],devices,{from:'2020-01-01',to:'2026-10-02'}),/36 meses/);
assert.throws(()=>X.prepare([],devices,{}),/Selecciona/);
assert.deepEqual(X.prepare(rows,devices,{from:'2026-10-01',to:'2026-10-31',deviceId:'b'}).details.map(x=>x.equipo),['Mural 1','Mural 1']);
assert.equal(X.prepare(rows,devices,{month:'2026-10'}).months.length,1);
(async()=>{
 const b=new ExcelJS.Workbook();
 const bytes=await X.build(rows,devices,{from:'2026-10-21',to:'2026-11-10'});
 assert.equal(Buffer.from(bytes).toString('ascii',0,2),'PK');
 await b.xlsx.load(Buffer.from(bytes));
 assert.deepEqual(b.worksheets.map(x=>x.name),['Resumen 2026-10','Resumen 2026-11','Registro Detallado']);
 assert.equal(b.getWorksheet('Resumen 2026-10').getCell('B3').value,'21');
 assert.equal(b.getWorksheet('Resumen 2026-11').getCell('K3').value,'10');
 assert.equal(b.getWorksheet('Resumen 2026-11').getCell('A4').value,'Nevera propia');
 const oct=b.getWorksheet('Resumen 2026-10');
 const mural1=oct.getRows(4,4).find(x=>x.getCell(1).value==='Mural 1');
 assert(mural1.getCell(2).value.includes('\n'));
 const nov=b.getWorksheet('Resumen 2026-11');
 const mural10=nov.getRows(4,4).find(x=>x.getCell(1).value==='Mural 10');
 assert.equal(mural10.getCell(3).fill.fgColor.argb,'FFFFEFBE');
 const detail=b.getWorksheet('Registro Detallado');
 assert.deepEqual(detail.getRow(1).values.slice(1),['Equipo','Fecha de medición','Hora de medición','Temperatura (°C)','Responsable','Observaciones']);
 assert.equal(detail.getRow(2).getCell(4).value,3);
 assert.equal(detail.getRow(2).getCell(4).numFmt,'0.0');
 assert(detail.getRow(2).getCell(2).value instanceof Date);
 assert(detail.views[0].state==='frozen');
 assert.equal(detail.getRow(4).getCell(4).value,null); // omitted check does not fabricate a temperature
 const single=new ExcelJS.Workbook();
 await single.xlsx.load(Buffer.from(await X.build(rows,devices,{from:'2026-10-21',to:'2026-10-21'})));
 assert.deepEqual(single.worksheets.map(s=>s.name),['Resumen Mensual','Registro Detallado']);
 assert.equal(single.getWorksheet('Resumen Mensual').getCell('B3').value,'21');
 console.log('ExcelJS: dynamic date range, monthly matrices and detailed rows passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plan,done}=require('./test_cleaning_core.cjs');
const dir=path.resolve(__dirname,'../app/src/main/assets');
globalThis.ExcelJS=require(dir+'/vendor/exceljs.min.js');globalThis.PDFLib=require(dir+'/cleaning-vendor/pdf-lib.min.js');globalThis.fontkit=require(dir+'/cleaning-vendor/fontkit.min.js');require(dir+'/cleaning-export.js');
(async()=>{
 const rows=RTCleaningCore.rows([plan],[done],{from:'2026-01-01',to:'2026-03-31'},'2026-03-31');
 const options={company:'Supermercado García',from:'2026-01-01',to:'2026-03-31'};
 const xlsx=await RTCleaningExport.excel(rows,options),book=new ExcelJS.Workbook();await book.xlsx.load(xlsx);
 assert.deepEqual(book.worksheets.map(s=>s.name),['Resumen de Limpieza','Registros Detallados']);
 assert.equal(book.worksheets[1].rowCount,183);assert.equal(book.worksheets[1].getCell('E4').fill.fgColor.argb,'FFDDF2E1');assert.equal(book.worksheets[1].getCell('E5').fill.fgColor.argb,'FFFADADB');
 assert.equal(book.worksheets[1].getCell('A183').value,'2026-03-31');
 const pdf=await RTCleaningExport.pdf(rows,options,new Uint8Array(fs.readFileSync(dir+'/cleaning-vendor/NotoSans-Regular.ttf')));
 const parsed=await PDFLib.PDFDocument.load(pdf);assert(parsed.getPageCount()>10);
 const out=process.env.RT_CLEANING_OUTPUT;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'limpieza-prueba.xlsx'),xlsx);fs.writeFileSync(path.join(out,'limpieza-prueba.pdf'),pdf);}
 console.log('Cleaning export: 90 days, 180 records, two XLSX sheets, green/red states, PDF pagination passed ('+parsed.getPageCount()+' pages)');
})().catch(e=>{console.error(e);process.exitCode=1;});

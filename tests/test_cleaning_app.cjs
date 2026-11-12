const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.ttf')?'font/ttf':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
async function snapshot(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('ShanTemperaturasDB');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const result={};for(const s of ['equipos','registros','limpiezaPlanes','limpiezaEventos'])result[s]=await new Promise(resolve=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>resolve(q.result);});db.close();return result;});}
const wait=(page,fn)=>page.waitForFunction(fn);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/index.html';
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cleaning-test-'));
 try{
  await page.goto(url);await wait(page,()=>!!window.RTCleaning&&document.querySelector('#clAddDaily'));
  const original=await snapshot(page);
  const cleaningNav = page.getByRole('button', {name:'Registro de Limpieza', exact:true});
  await page.setViewportSize({width:320,height:844});
  const navLabels = page.locator('.m3-bottom-nav .nav-label');
  assert.deepEqual(await navLabels.allTextContents(), ['Inicio','Registrar','Historial','Informes','Limpieza','Ajustes']);
  assert(await navLabels.evaluateAll(labels => labels.every(label => {
    const text = label.getBoundingClientRect();
    const button = label.closest('button').getBoundingClientRect();
    return text.left >= button.left && text.right <= button.right;
  })));
  await page.locator('[data-target="view-devices"]').click();
  await cleaningNav.click();
  assert(await page.locator('#view-cleaning.active').isVisible());
  assert(await page.locator('#navCleaning.active').isVisible());
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-cl-tab="clAdmin"]').click();await page.locator('#clAddDaily').click();await page.locator('#clPlanArea').fill('Horno');await page.locator('#clAssignee').fill('Ana');await page.locator('#clPlanForm button[type=submit]').click();await page.locator('#clPlanModal').waitFor({state:'hidden'});
  await page.locator('[data-cl-tab="clDaily"]').click();assert.equal(await page.locator('#clDailyRows .cleaning-record').count(),2);
  await page.locator('#clDailyRows [data-complete]').first().click();await page.locator('#clPerson').fill('Luis');await page.locator('#clNotes').fill('Limpieza y desinfección');
  // Real aborted transaction must retain form and original pending state.
  await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){IDBObjectStore.prototype.add=add;const req=add.apply(this,args);this.transaction.abort();return req;};});
  await page.locator('#clRecordForm button[type=submit]').click();await wait(page,()=>document.querySelector('#m3Snackbar').textContent.includes('No se pudo guardar'));assert.equal((await snapshot(page)).limpiezaEventos.length,0);
  await page.locator('#clRecordForm button[type=submit]').click();await page.locator('#clRecordModal').waitFor({state:'hidden'});assert.equal(await page.locator('#clDailyRows .cl-done').count(),1);assert.equal(await page.locator('#clDailyRows .cl-pending').count(),1);
  const completed=(await snapshot(page)).limpiezaEventos[0];assert(completed.completedAt>0&&completed.recordedAt===completed.completedAt&&completed.person==='Luis');
  await page.reload();await wait(page,()=>document.querySelector('#clAddDaily'));await page.locator('#btnOpenCleaning').click();assert.equal(await page.locator('#clDailyRows .cl-done').count(),1);
  // UI periodic task creation and future-effective plan edits.
  await page.locator('[data-cl-tab="clAdmin"]').click();await page.locator('#clAddPeriodic').click();await page.locator('#clPlanArea').fill('Almacén');await page.locator('#clInstructions').fill('Revisar estanterías');await page.locator('#clPlanForm button[type=submit]').click();await page.locator('#clPlanModal').waitFor({state:'hidden'});
  await page.locator('[data-cl-tab="clPeriodic"]').click();assert.equal(await page.locator('#clPeriodicRows .cl-pending').count(),1);
  await page.locator('[data-cl-tab="clAdmin"]').click();await page.locator('#clPlans .m3-card').filter({hasText:'Horno'}).locator('[data-plan-edit]').click();await page.locator('#clSlots').fill('Mañana | 08:30\nNoche | 22:00');await page.locator('#clPlanForm button[type=submit]').click();await page.locator('#clPlanModal').waitFor({state:'hidden'});
  await page.locator('#clPlans .m3-card').filter({hasText:'Almacén'}).locator('[data-plan-delete]').click();await wait(page,()=>document.querySelectorAll('#clPlans [data-plan-edit]').length===1);
  await page.locator('[data-cl-tab="clPeriodic"]').click();assert.equal(await page.locator('#clPeriodicRows .cl-pending').count(),1); // Today is retained.
  // Seed an untouched historical plan; reopening must reconstruct every missed slot.
  await page.evaluate(async()=>{const now=RTCleaningCore.date(),past=RTCleaningCore.next(now,-40),base=RTCleaning.snapshot().plans.find(p=>p.kind==='daily'&&p.active&&p.effectiveFrom<=now);const plan={...base,id:'historical-plan',taskId:'historical-task',area:'Baño',effectiveFrom:past,startDate:past};const db=await new Promise(r=>{const q=indexedDB.open('ShanTemperaturasDB');q.onsuccess=()=>r(q.result);});await new Promise((r,j)=>{const tx=db.transaction('limpiezaPlanes','readwrite');tx.objectStore('limpiezaPlanes').add(plan);tx.oncomplete=r;tx.onabort=()=>j(tx.error);});db.close();});
  await page.locator('[data-cl-tab="clHistory"]').click();const from=await page.evaluate(()=>RTCleaningCore.next(RTCleaningCore.date(),-40));await page.locator('#clFrom').fill(from);await page.locator('#clFrom').dispatchEvent('input');await wait(page,()=>document.querySelectorAll('#clHistoryRows .cleaning-record').length===85);
  await page.locator('#clStatusFilter').selectOption('Realizado');await page.locator('#clStatusFilter').dispatchEvent('input');assert.equal(await page.locator('#clHistoryRows .cleaning-record').count(),1);
  for(const [button,name] of [['#clExcel','report.xlsx'],['#clPdf','report.pdf']]){const d=page.waitForEvent('download');await page.locator(button).click();await(await d).saveAs(path.join(temp,name));}
  const ExcelJS=require(root+'/vendor/exceljs.min.js'),book=new ExcelJS.Workbook();await book.xlsx.load(fs.readFileSync(path.join(temp,'report.xlsx')));assert.equal(book.worksheets[1].rowCount,88);assert(book.worksheets[1].getColumn(5).values.includes('Pendiente'));assert.equal(fs.readFileSync(path.join(temp,'report.pdf')).subarray(0,4).toString(),'%PDF');
  const before=await snapshot(page);assert.deepEqual(before.equipos,original.equipos);assert.deepEqual(before.registros,original.registros);
  await page.locator('[data-target="view-devices"]').click();const dl=page.waitForEvent('download');await page.locator('#btnExportZip').click();const zip=path.join(temp,'backup.zip');await(await dl).saveAs(zip);
  const clean=await browser.newContext();const restored=await clean.newPage();restored.on('dialog',d=>d.accept());await restored.goto(url);await wait(restored,()=>document.querySelector('#clAddDaily'));await restored.locator('[data-target="view-devices"]').click();
  async function restore(file){await restored.locator('#backupStatusText').evaluate(el=>el.textContent='');await restored.locator('#importZipInput').setInputFiles(file);await wait(restored,()=>document.querySelector('#backupStatusText').textContent.includes('Importación completada'));}
  await restore(zip);assert.deepEqual(await snapshot(restored),before);await restore(zip);assert.deepEqual(await snapshot(restored),before);
  const old={equipos:before.equipos,registros:before.registros};await restore({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});assert.deepEqual(await snapshot(restored),before);
  const invalid={...old,limpieza:{schema:1,plans:[{id:'bad'}],events:[]}};
  await restored.locator('#importZipInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await wait(restored,()=>document.querySelector('#backupStatusText').textContent.includes('Error'));assert.deepEqual(await snapshot(restored),before);
  await restored.locator('[data-target="view-home"]').click();await restored.locator('#btnOpenCleaning').click();await wait(restored,()=>document.querySelectorAll('#clDailyRows .cl-done').length===1);
  if(process.env.RT_CLEANING_OUTPUT){await page.locator('[data-target="view-home"]').click();await page.locator('#btnOpenCleaning').click();await page.screenshot({path:path.join(process.env.RT_CLEANING_OUTPUT,'cleaning-mobile.png'),fullPage:true});}
  assert.deepEqual(errors,[]);await clean.close();console.log('Cleaning browser: real persistence, rollback/retry, separate shifts, edit/delete history, 40 missed days, filtered XLSX/PDF, ZIP roundtrip/dedup, old backup and malformed rollback passed');
 }finally{await browser.close();server.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

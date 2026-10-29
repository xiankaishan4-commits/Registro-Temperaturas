// npm install --no-save playwright@1.56.1 && npx playwright install chromium
// Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for an installed Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../app/src/main/assets');
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=', 'base64');
const server = http.createServer((req,res) => {
  if (req.url === '/seed') return res.end('<html></html>');
  const file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) {res.writeHead(404); return res.end('<html></html>');}
  try {res.setHeader('Content-Type', file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'); res.end(fs.readFileSync(file));}
  catch {res.writeHead(404); res.end();}
});
const waitFor = (page, fn, arg) => page.waitForFunction(fn,arg);
async function readDB(page) {
  return page.evaluate(async()=>{
    const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('ShanTemperaturasDB'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);});
    const data = await Promise.all(['equipos','registros'].map(s=>new Promise(resolve=>{const r=db.transaction(s).objectStore(s).getAll(); r.onsuccess=()=>resolve(r.result);}))); db.close();
    return {devices:data[0],records:data[1]};
  });
}
function assertPreserved(actual, expected) {
  for(const group of ['devices','records']) {
    assert.equal(actual[group].length,expected[group].length);
    for(const old of expected[group]) {
      const restored=actual[group].find(row=>row.id===old.id); assert(restored);
      for(const [key,value] of Object.entries(old)) if(value !== undefined) assert.deepEqual(restored[key],value,old.id+'.'+key);
    }
  }
}
async function nav(page, view) {await page.locator(`[data-target="view-${view}"]`).click();}
async function addDevice(page, name, type, min, max) {
  await nav(page,'devices'); await page.locator('#btnOpenAddDevice').click();
  await page.locator('#deviceNameInput').fill(name);
  await page.locator('#deviceMinTempInput').fill(min); await page.locator('#deviceMaxTempInput').fill(max);
  for (const category of ['AMBIENTE','ALIMENTOS_CALIENTES','PERSONALIZADO','REFRIGERACION','CONGELACION',type]) {
    await page.locator('#deviceTypeSelect').selectOption(category);
    assert.equal(await page.locator('#deviceMinTempInput').inputValue(),min);
    assert.equal(await page.locator('#deviceMaxTempInput').inputValue(),max);
  }
  await page.locator('#deviceForm button[type=submit]').click();
  await page.locator('#deviceModal').waitFor({state:'hidden'});
  return (await readDB(page)).devices.find(d=>d.nombre===name).id;
}
async function attachPhoto(page) {
  await page.locator('#recordPhotoInput').setInputFiles({name:'termometro.png',mimeType:'image/png',buffer:photo});
  await page.locator('#photoPreviewState').waitFor({state:'visible'});
}
async function save(page, count) {
  await page.locator('#btnSaveRecord').click();
  await page.locator('#view-home').waitFor({state:'visible'});
  assert.equal((await readDB(page)).records.length,count);
}
async function exportZip(page) {
  await nav(page,'devices');
  const download = page.waitForEvent('download'); await page.locator('#btnExportZip').click();
  const file = path.join(os.tmpdir(),`rt-test-${process.pid}-${Date.now()}.zip`);
  await (await download).saveAs(file); return file;
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  try {
    await page.goto(base+'/seed');
    // Existing v1.5 DB plus an older separate DB with Blob photographs.
    await page.evaluate(async(photo64)=>{
      localStorage.setItem('rt_company_name_v1','Empresa anterior 食品');
      for (const [name,version,stores] of [['ShanTemperaturasDB',7,['equipos','registros']],['shanfood_temperaturas_offline',1,['devices','records','photos']]]) {
        const db=await new Promise(resolve=>{const r=indexedDB.open(name,version); r.onupgradeneeded=()=>stores.forEach(s=>r.result.createObjectStore(s,{keyPath:'id'})); r.onsuccess=()=>resolve(r.result);});
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(stores,'readwrite');
          if(name==='ShanTemperaturasDB') {
            tx.objectStore('equipos').put({id:'old-device',nombre:'Nevera antigua',minTemp:0,maxTemp:5,tipo:'REFRIGERACION'});
            tx.objectStore('registros').put({id:'old-record',equipoId:'old-device',temperatura:3.5,timestamp:Date.now()-86400000,fecha:'2026-10-01',foto:null});
          } else {
            tx.objectStore('devices').put({id:'legacy-device',name:'Equipo legado',min:-22,max:-16});
            tx.objectStore('records').put({id:'legacy-record',deviceId:'legacy-device',temp:-19,timestamp:Date.now()-86400000});
            tx.objectStore('photos').put({id:'legacy-record',blob:new Blob([Uint8Array.from(atob(photo64),c=>c.charCodeAt(0))],{type:'image/png'})});
          }
          tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error);
        }); db.close();
      }
    },photo.toString('base64'));
    await page.goto(base+'/index.html');
    await waitFor(page,()=>document.querySelector('#manageDevicesList').children.length===2);
    let data=await readDB(page);
    assert.equal(data.records.length,2); assert(data.records.find(r=>r.id==='legacy-record').foto.startsWith('data:image/png;base64,'));
    assert.equal(await page.locator('#companyNameDisplay').textContent(),'Empresa anterior 食品');
    const aht=await addDevice(page,'AHT 01','CONGELACION','−24,5','−18');
    await addDevice(page,'Sala','AMBIENTE','+5.25','40,5');
    const hot=await addDevice(page,'Cocina','ALIMENTOS_CALIENTES','60','150');
    await addDevice(page,'Personal','PERSONALIZADO','-30','+30');
    await addDevice(page,'Nevera nueva','REFRIGERACION','0','4.5');
    // Invalid bounds must leave storage unchanged and the form open.
    await page.locator('#btnOpenAddDevice').click(); await page.locator('#deviceNameInput').fill('Inválido');
    await page.locator('#deviceMinTempInput').fill('5'); await page.locator('#deviceMaxTempInput').fill('4');
    await page.locator('#deviceForm button[type=submit]').click();
    assert.equal((await readDB(page)).devices.length,7); await page.locator('#btnCancelDeviceModal').click();
    await page.reload(); await waitFor(page,()=>document.querySelector('#manageDevicesList').children.length===7);
    const prior=new Date(); prior.setDate(prior.getDate()-1);
    const date=`${prior.getFullYear()}-${String(prior.getMonth()+1).padStart(2,'0')}-${String(prior.getDate()).padStart(2,'0')}`;
    async function late(hour,temp) {
      await nav(page,'record'); await page.locator('#recordDeviceSelect').selectOption(aht);
      await page.locator('#recordEntryMode').selectOption('late');
      await page.locator('#priorMeasureAt').fill(date+'T'+hour); await page.locator('#priorReason').fill('Transcripción de medición real');
      await page.locator('#recordTempInput').fill(temp);
    }
    await late('09:00','−19.2'); await page.locator('#recordEmployeeInput').fill('Ana');
    await page.locator('#btnSaveRecord').click();
    await waitFor(page,()=>document.querySelector('#m3Snackbar').textContent.includes('foto'));
    assert.equal((await readDB(page)).records.length,2);
    await attachPhoto(page); await page.locator('#recordEmployeeInput').fill(''); await page.locator('#btnSaveRecord').click();
    await waitFor(page,()=>document.querySelector('#m3Snackbar').textContent.includes('quién'));
    assert.equal((await readDB(page)).records.length,2);
    await page.locator('#recordEmployeeInput').fill('Ana'); await save(page,3);
    await late('21:00','-17,5'); await attachPhoto(page); await page.locator('#recordEmployeeInput').fill('Luis');
    assert.equal(await page.locator('#tempWarningBanner').isVisible(),true);
    assert.equal(await page.locator('#recordNotesInput').getAttribute('aria-required'),'true');
    assert.equal(await page.locator('#tempWarningBanner').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(186, 26, 26)');
    await page.locator('#btnSaveRecord').click();
    await waitFor(page,()=>document.querySelector('#m3Snackbar').textContent.includes('Acción correctiva'));
    assert.equal((await readDB(page)).records.length,3);
    if(process.env.RT_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.RT_SCREENSHOT_DIR,'temperature-alert.png'),fullPage:true});
    await page.locator('#recordNotesInput').fill('Trasladar producto y revisar el equipo'); await save(page,4);
    data=await readDB(page); const pair=data.records.filter(r=>r.equipoId===aht);
    assert.deepEqual(pair.map(r=>r.temperatura).sort((a,b)=>a-b),[-19.2,-17.5]);
    assert(pair.every(r=>r.fecha===date && r.foto && r.responsable && r.minTemp===-24.5 && r.maxTemp===-18));
    assert.equal(new Set(pair.map(r=>r.id)).size,2);
    // Current hot reading >100 C, and current photo requirement.
    await nav(page,'record'); await page.locator('#recordEntryMode').selectOption('current'); await page.locator('#recordDeviceSelect').selectOption(hot);
    await page.locator('#recordTempInput').fill('+125.5'); await page.locator('#recordEmployeeInput').fill('Ana');
    await page.locator('#btnSaveRecord').click(); await waitFor(page,()=>document.querySelector('#m3Snackbar').textContent.includes('foto'));
    await attachPhoto(page);
    // Abort a real IndexedDB write: retain the form and allow retry.
    await page.evaluate(()=>{
      const original=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(...args) {IDBObjectStore.prototype.add=original; const r=original.apply(this,args); this.transaction.abort(); return r;};
    });
    await page.locator('#btnSaveRecord').click();
    await waitFor(page,()=>document.querySelector('#m3Snackbar').textContent.includes('No se pudo guardar'));
    assert.equal((await readDB(page)).records.length,4);
    assert.equal(await page.locator('#recordTempInput').inputValue(),'+125.5');
    await save(page,5);
    // Changing AHT's limits cannot reinterpret its saved alert or change other devices.
    await nav(page,'devices'); const row=page.locator('.manage-device-item').filter({hasText:'AHT 01'}); await row.locator('[data-edit]').click();
    await page.locator('#deviceTypeSelect').selectOption('AMBIENTE');
    assert.equal(await page.locator('#deviceMaxTempInput').inputValue(),'-18');
    await page.locator('#deviceMinTempInput').fill('-30'); await page.locator('#deviceMaxTempInput').fill('0');
    await page.locator('#deviceForm button[type=submit]').click(); await page.locator('#deviceModal').waitFor({state:'hidden'});
    assert.equal((await readDB(page)).devices.find(d=>d.id===hot).maxTemp,150);
    await nav(page,'history'); await page.locator('#historyFilterDevice').selectOption(aht);
    await waitFor(page,()=>document.querySelectorAll('.history-card').length===2);
    assert.equal(await page.locator('.history-alert').count(),1);
    // Correction uses the original measurement range, preserves original, reuses its photo.
    await page.locator('.history-alert button').click();
    assert((await page.locator('#selectedDeviceRangeInfo').textContent()).includes('-18'));
    await page.locator('#recordTempInput').fill('-20'); await page.locator('#correctionReason').fill('Error de transcripción');
    await save(page,6);
    data=await readDB(page); assert.equal(data.records.filter(r=>r.equipoId===aht).length,3);
    assert.equal(data.records.find(r=>r.registroTipo==='correction').maxTemp,-18);
    // Real ZIP download, clean-profile restore, same-ID deduplication, photos, metadata.
    await nav(page,'devices'); await page.locator('#companyNameInput').fill('Empresa nueva 食品'); await page.locator('#companySettingsForm button').click();
    const zip=await exportZip(page); const original=await readDB(page);
    const clean=await browser.newContext(); const restored=await clean.newPage(); restored.on('dialog',d=>d.accept());
    await restored.goto(base+'/index.html'); await nav(restored,'devices');
    async function restore(file) {
      await restored.locator('#backupStatusText').evaluate(el=>el.textContent='');
      await restored.locator('#importZipInput').setInputFiles(file);
      await waitFor(restored,()=>document.querySelector('#backupStatusText').textContent.includes('Importación completada'));
    }
    await restore(zip); assertPreserved(await readDB(restored),original);
    const restoredSnapshot=await readDB(restored);
    assert.equal(await restored.locator('#companyNameDisplay').textContent(),'Empresa nueva 食品');
    await restore(zip); assert.deepEqual(await readDB(restored),restoredSnapshot);
    // Old JSON without settings, photos or author is accepted without inventing them.
    await restored.locator('#importZipInput').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({devices:[{id:'old-device',name:'Do not overwrite',min:99,max:100}],records:[{id:'import-old',deviceId:'old-device',temp:-21.7,timestamp:Date.now()}]}))});
    await waitFor(restored,()=>document.querySelector('#backupStatusText').textContent.includes('1 registros nuevos'));
    const merged=await readDB(restored); assert.equal(merged.records.length,7);
    assert.equal(merged.devices.find(d=>d.id==='old-device').nombre,'Nevera antigua');
    assert.equal(await restored.locator('#companyNameDisplay').textContent(),'Empresa nueva 食品');
    // Corrupted ZIP leaves both data and company unchanged.
    const corrupt=fs.readFileSync(zip); corrupt[60]^=1;
    await restored.locator('#importZipInput').setInputFiles({name:'bad.zip',mimeType:'application/zip',buffer:corrupt});
    await waitFor(restored,()=>document.querySelector('#backupStatusText').textContent.includes('Error'));
    assert.deepEqual(await readDB(restored),merged);
    await restored.reload(); await waitFor(restored,()=>document.querySelector('#manageDevicesList').children.length===7);
    assert.deepEqual(await readDB(restored),merged); assert.equal(await restored.locator('#companyNameDisplay').textContent(),'Empresa nueva 食品');
    assert.deepEqual(errors,[]); fs.unlinkSync(zip); await clean.close();
    console.log('Browser: five categories, independent decimal limits, legacy migration, required fields, AHT morning/evening, red alert, correction, persistence, ZIP/JSON merge, photos and corrupt backup passed');
  } finally {await browser.close(); server.close();}
})().catch(error=>{console.error(error); server.close(); process.exitCode=1;});

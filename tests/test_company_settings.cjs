const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8');

function app(storage = new Map()) {
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, {textContent:'', value:'', classList:{add(){},remove(){}}});
    return elements.get(id);
  };
  const writes = [];
  const ctx = {
    window:{RTRecords:{}}, document:{getElementById:node,addEventListener(){}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    Blob, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer,
    Date, Map, Set, console, setTimeout:()=>0, clearTimeout(){},
    confirm:()=>true, atob:x=>Buffer.from(x,'base64').toString('binary'),
    btoa:x=>Buffer.from(x,'binary').toString('base64')
  };
  vm.createContext(ctx);
  // Expose the existing closure only inside the test VM; no test API is shipped.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.api = {saveCompanyName, displayCompanyName, backupData,
      assertBackupShape, importBackupFile, createStoredZip,
      reload() { companyName = localStorage.getItem(COMPANY_KEY) || ''; renderCompanyName(); },
      seed(ds, rs) { devicesCache=ds; recordsCache=rs; },
      mockDB(fail = false) {
        dbGetAll = async store => store === STORE_DEVICES ? devicesCache : recordsCache;
        loadAllData = async () => {}; renderAll = () => {};
        dbInstance={transaction() {
          const tx={objectStore:store=>({put:value=>globalThis.writes.push({store,value})})};
          Promise.resolve().then(()=>{ if(fail) { tx.error=Error('Disk full'); tx.onabort(); } else tx.oncomplete(); }); return tx;
        }};
      }
    };
  })();`), ctx);
  ctx.writes = writes;
  return {ctx, api:ctx.api, node, storage, writes};
}
const jsonFile = data => ({name:'backup.json',size:100,text:async()=>JSON.stringify(data)});

(async()=>{
  const a = app();
  assert.equal(a.api.displayCompanyName(),'Mi empresa');
  a.api.saveCompanyName('  Alimentos García & Hijos 食品  ');
  assert.equal(a.node('companyNameDisplay').textContent,'Alimentos García & Hijos 食品');
  assert.equal(a.ctx.document.title,'Alimentos García & Hijos 食品 — Registro de Temperaturas');
  const restarted=app(a.storage); restarted.api.reload();
  assert.equal(restarted.api.displayCompanyName(),a.api.displayCompanyName());
  a.api.saveCompanyName('<img src=x onerror=alert(1)>');
  assert.equal(a.node('companyNameDisplay').textContent,'<img src=x onerror=alert(1)>');
  for (const bad of ['', '   ', '\n\t', 'x'.repeat(121), null, 2, {}]) assert.throws(()=>a.api.saveCompanyName(bad));
  a.api.saveCompanyName('x'.repeat(120));
  a.api.saveCompanyName('Nombre\nseguro');
  assert.equal(a.api.displayCompanyName(),'Nombre seguro');
  const old=a.api.displayCompanyName();
  a.ctx.localStorage.setItem=()=>{throw Error('Storage unavailable');};
  assert.throws(()=>a.api.saveCompanyName('Not saved'),/Storage/);
  assert.equal(a.api.displayCompanyName(),old);
  assert.equal(a.node('companyNameDisplay').textContent,old);

  const origin=app(); origin.api.saveCompanyName('Empresa original');
  const devices=[{id:'a',nombre:'Nevera',minTemp:0,maxTemp:5}];
  const records=[{id:'r',equipoId:'a',temperatura:3,foto:'data:image/jpeg;base64,/9j/2Q==',supersedesId:'old'}];
  origin.api.seed(devices,records);
  const backup=JSON.parse(JSON.stringify(origin.api.backupData()));
  assert.equal(backup.format,'SHANFOODSGROUP_M3'); assert.equal(backup.version,2);
  assert.deepEqual(backup.equipos,devices); assert.deepEqual(backup.registros,records);
  assert.equal(backup.settings.companyName,'Empresa original');
  const target=app(); target.api.mockDB(); target.api.saveCompanyName('Otra');
  await target.api.importBackupFile(jsonFile(backup));
  assert.equal(target.api.displayCompanyName(),'Empresa original');
  assert.equal(target.writes.length,2);
  assert.equal(target.writes[1].value.foto,records[0].foto);
  assert.equal(target.writes[1].value.supersedesId,'old');

  const zipped=origin.api.createStoredZip([{name:'backup_datos.json',data:JSON.stringify(backup)}]);
  target.api.saveCompanyName('Otra');
  await target.api.importBackupFile({name:'backup.zip',size:zipped.size,arrayBuffer:()=>zipped.arrayBuffer()});
  assert.equal(target.api.displayCompanyName(),'Empresa original');
  delete backup.settings;
  await target.api.importBackupFile(jsonFile(backup));
  assert.equal(target.api.displayCompanyName(),'Empresa original');
  await target.api.importBackupFile(jsonFile({devices:[],records:[],settings:{companyName:''}}));
  assert.equal(target.api.displayCompanyName(),'Empresa original');
  target.ctx.confirm=()=>false;
  backup.settings={companyName:'Cancelada'};
  const count=target.writes.length;
  await target.api.importBackupFile(jsonFile(backup));
  assert.equal(target.api.displayCompanyName(),'Empresa original'); assert.equal(target.writes.length,count);
  target.ctx.confirm=()=>true;
  for(const value of [null,123,{},' ', 'x'.repeat(121)]) {
    backup.settings={companyName:value};
    await target.api.importBackupFile(jsonFile(backup));
    assert.match(target.node('backupStatusText').textContent,/Error/);
    assert.equal(target.api.displayCompanyName(),'Empresa original'); assert.equal(target.writes.length,count);
  }
  // Duplicate IDs are rejected before restoring the company setting.
  backup.settings={companyName:'No aplicar'}; backup.equipos=[...devices,...devices];
  await target.api.importBackupFile(jsonFile(backup));
  assert.equal(target.api.displayCompanyName(),'Empresa original'); assert.equal(target.writes.length,count);
  // A failed transaction must never change company metadata.
  const failed=app(); failed.api.mockDB(true); failed.api.saveCompanyName('Conservada');
  await failed.api.importBackupFile(jsonFile(origin.api.backupData()));
  assert.equal(failed.api.displayCompanyName(),'Conservada');
  assert.match(failed.node('backupStatusText').textContent,/Disk full/);
  // Even an empty backup restores its configured company name.
  await target.api.importBackupFile(jsonFile({equipos:[],registros:[],settings:{companyName:'Solo empresa'}}));
  assert.equal(target.api.displayCompanyName(),'Solo empresa');
  console.log('Company settings: persistence, validation, ZIP/JSON, legacy, cancellation, failed restore and photos passed');
})().catch(e=>{console.error(e);process.exit(1);});

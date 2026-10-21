(function () {
  'use strict';

  const DB_NAME = 'ShanTemperaturasDB';
  const LEGACY_DB_NAME = 'shanfood_temperaturas_offline';
  const STORE_DEVICES = 'equipos';
  const STORE_RECORDS = 'registros';

  let dbInstance = null;
  let devicesCache = [];
  let recordsCache = [];
  let currentCompressedPhoto = null;
  let showOnlyAlertsHistory = false;
  let correctionTargetId = null;
  const RecordCore = window.RTRecords;

  const DEFAULT_DEVICES = [
    { id: 'eq-1', nombre: 'Cámara Refrigeración 1', tipo: 'REFRIGERACION', minTemp: 0, maxTemp: 4, ubicacion: 'Almacén' },
    { id: 'eq-2', nombre: 'Mural Lácteos y Charcutería', tipo: 'REFRIGERACION', minTemp: 0, maxTemp: 5, ubicacion: 'Sala de Ventas' },
    { id: 'eq-3', nombre: 'Mural Carne y Aves', tipo: 'REFRIGERACION', minTemp: 0, maxTemp: 4, ubicacion: 'Carnicería' },
    { id: 'eq-4', nombre: 'Vitrina Bebidas y Fruta', tipo: 'REFRIGERACION', minTemp: 1, maxTemp: 6, ubicacion: 'Entrada' },
    { id: 'eq-5', nombre: 'Cámara Congelación Principal', tipo: 'CONGELACION', minTemp: -24, maxTemp: -18, ubicacion: 'Almacén' },
    { id: 'eq-6', nombre: 'Arcón Congelador Islas', tipo: 'CONGELACION', minTemp: -24, maxTemp: -18, ubicacion: 'Sala de Ventas' }
  ];

  function getTodayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function formatDisplayDate(isoDate) {
    if (!isoDate) return '';
    const p = isoDate.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : isoDate;
  }

  function formatTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function showSnackbar(msg) {
    const bar = document.getElementById('m3Snackbar');
    if (!bar) return;
    bar.textContent = msg;
    bar.classList.remove('hidden');
    clearTimeout(bar._timer);
    bar._timer = setTimeout(() => bar.classList.add('hidden'), 3000);
  }

  // Use a fixed database for the modern UI, not the first unrelated IndexedDB
  // reported by indexedDB.databases(). Keep the original Android DB untouched.
  async function initDatabase() {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('Cierra las otras ventanas antes de actualizar los datos.'));
      open.onsuccess = () => {
        const current = open.result;
        const needsStores = [STORE_DEVICES, STORE_RECORDS].some(name => !current.objectStoreNames.contains(name));
        if (!needsStores) { dbInstance = current; return resolve(current); }
        const nextVersion = current.version + 1;
        current.close();
        const upgrade = indexedDB.open(DB_NAME, nextVersion);
        upgrade.onupgradeneeded = () => {
          for (const name of [STORE_DEVICES, STORE_RECORDS]) {
            if (!upgrade.result.objectStoreNames.contains(name)) upgrade.result.createObjectStore(name, { keyPath: 'id' });
          }
        };
        upgrade.onsuccess = () => { dbInstance = upgrade.result; resolve(dbInstance); };
        upgrade.onerror = () => reject(upgrade.error);
        upgrade.onblocked = () => reject(new Error('Cierra las otras ventanas antes de actualizar los datos.'));
      };
    });
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pueden leer los datos antiguos.'));
    });
  }

  function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('No se puede copiar la foto antigua.'));
      reader.readAsDataURL(blob);
    });
  }

  async function legacySnapshot() {
    // Opening a non-existent legacy database only creates an empty one; it never
    // edits the existing old database or drops any of its object stores.
    const legacy = await new Promise((resolve, reject) => {
      const req = indexedDB.open(LEGACY_DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const names = ['devices', 'records', 'photos', 'equipos', 'registros'].filter(n => legacy.objectStoreNames.contains(n));
      if (!names.length) return { legacyDevices: [], legacyRecords: [], legacyPhotos: [], m3Devices: [], m3Records: [] };
      const tx = legacy.transaction(names, 'readonly');
      const tasks = names.map(n => requestResult(tx.objectStore(n).getAll()));
      const result = await Promise.all(tasks);
      const grouped = Object.fromEntries(names.map((n, i) => [n, result[i]]));
      return {
        legacyDevices: grouped.devices || [], legacyRecords: grouped.records || [], legacyPhotos: grouped.photos || [],
        m3Devices: grouped.equipos || [], m3Records: grouped.registros || []
      };
    } finally { legacy.close(); }
  }

  async function migrateLegacyData() {
    const marker = 'rt_m3_legacy_migration_completed_v3';
    if (localStorage.getItem(marker) === '1') return;
    const snap = await legacySnapshot();
    const existingDevices = new Set((await dbGetAll(STORE_DEVICES)).map(d => String(d.id)));
    const existingRecords = new Set((await dbGetAll(STORE_RECORDS)).map(r => String(r.id)));
    const newDevices = [];
    const newRecords = [];
    for (const d of [...snap.legacyDevices, ...snap.m3Devices]) {
      const value = normalizeDevice(d);
      if (!existingDevices.has(value.id)) { existingDevices.add(value.id); newDevices.push(value); }
    }
    const photos = new Map(snap.legacyPhotos.map(row => [String(row.id), row.blob]));
    for (const row of [...snap.legacyRecords, ...snap.m3Records]) {
      const rec = normalizeRecord(row);
      if (existingRecords.has(rec.id)) continue;
      const photo = photos.get(rec.id);
      if (!rec.foto && photo instanceof Blob) rec.foto = await blobAsDataUrl(photo);
      existingRecords.add(rec.id);
      newRecords.push(rec);
    }
    // One atomic transaction: an error cannot leave half-migrated records.
    if (newDevices.length || newRecords.length) {
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction([STORE_DEVICES, STORE_RECORDS], 'readwrite');
        for (const d of newDevices) tx.objectStore(STORE_DEVICES).put(d);
        for (const r of newRecords) tx.objectStore(STORE_RECORDS).put(r);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('No se puede completar la migración.'));
        tx.onabort = () => reject(tx.error || new Error('Migración abortada.'));
      });
    }
    localStorage.setItem(marker, '1');
    if (newDevices.length || newRecords.length) showSnackbar(`Datos antiguos recuperados: ${newDevices.length} equipos, ${newRecords.length} registros.`);
  }

  function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = dbInstance.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(storeName, item) {
    return new Promise((resolve, reject) => {
      const req = dbInstance.transaction(storeName, 'readwrite').objectStore(storeName).put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = dbInstance.transaction(storeName, 'readwrite').objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function normalizeDevice(raw) {
    const minT = raw.minTemp !== undefined ? Number(raw.minTemp) : (raw.min !== undefined ? Number(raw.min) : 0);
    const maxT = raw.maxTemp !== undefined ? Number(raw.maxTemp) : (raw.max !== undefined ? Number(raw.max) : 5);
    return {
      ...raw,
      id: String(raw.id || 'eq-' + Date.now()),
      nombre: raw.nombre || raw.name || 'Equipo Frigorífico',
      tipo: raw.tipo || (maxT <= -10 ? 'CONGELACION' : 'REFRIGERACION'),
      minTemp: minT,
      maxTemp: maxT,
      ubicacion: raw.ubicacion || raw.location || '',
      activo: raw.activo !== undefined ? Boolean(raw.activo) : raw.active !== false
    };
  }

  function localDateOf(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? getTodayISO() :
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function normalizeRecord(raw) {
    const tempRaw = raw.temperatura !== undefined ? raw.temperatura : raw.temp;
    const tempVal = raw.registroTipo === 'omitted' || tempRaw == null || tempRaw === '' ? null : Number(tempRaw);
    const ts = raw.timestamp || raw.fechaHora || Date.now();
    const dateStr = raw.fecha || raw.date || new Date(ts).toISOString().split('T')[0];
    return {
      ...raw,
      id: String(raw.id || 'rec-' + ts),
      equipoId: String(raw.equipoId || raw.deviceId || ''),
      equipoNombre: raw.equipoNombre || raw.deviceName || '',
      temperatura: tempVal,
      fecha: dateStr,
      timestamp: typeof ts === 'number' ? ts : new Date(ts).getTime(),
      foto: raw.foto || raw.photo || raw.imagen || null,
      responsable: raw.responsable || raw.operario || raw.person || '',
      observaciones: raw.observaciones || raw.notas || raw.notes || '',
      fueraDeRango: raw.fueraDeRango !== undefined ? Boolean(raw.fueraDeRango) : Boolean(raw.outOfRange),
      registroTipo: raw.registroTipo || 'current',
      recordedAt: Number(raw.recordedAt || raw.createdAt || raw.timestamp || Date.now()),
      supersedesId: raw.supersedesId || null,
      motivoCorreccion: raw.motivoCorreccion || '',
      slotProgramado: raw.slotProgramado || null
    };
  }

  async function loadAllData() {
    const rawDevices = await dbGetAll(STORE_DEVICES);
    if (rawDevices.length === 0) {
      // Empty is a valid state (all devices may have been intentionally removed).
      devicesCache = [];
    } else {
      devicesCache = rawDevices.map(normalizeDevice);
    }
    const rawRecords = await dbGetAll(STORE_RECORDS);
    recordsCache = rawRecords.map(normalizeRecord).sort((a, b) => b.timestamp - a.timestamp);
  }

  function isTempOutOfRange(device, tempValue) {
    if (!device || isNaN(tempValue)) return false;
    return tempValue < device.minTemp || tempValue > device.maxTemp;
  }

  function compressImageFile(file, maxWidth = 1024, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Notification state contains IDs and timestamps only; photo data never leaves IndexedDB.
  function getReminderSlot(now = Date.now()) {
    const t = new Date(now);
    let start = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours() >= 21 ? 21 : 9);
    if (t.getHours() < 9) start.setDate(start.getDate() - 1), start.setHours(21);
    return { start: start.getTime(), label: start.getHours() === 9 ? 'mañana (09:00)' : 'noche (21:00)' };
  }

  function syncAndroidReminders() {
    if (!window.ReminderBridge || typeof window.ReminderBridge.sync !== 'function') return;
    const devices = devicesCache.filter(d => d.activo !== false).map(d => ({ id: d.id, name: d.nombre }));
    const cutoff = Date.now() - 48 * 3600000;
    const entries = RecordCore.effective(recordsCache).filter(r => RecordCore.isMeasurement(r) && r.timestamp >= cutoff)
      .map(r => ({ deviceId: r.equipoId, timestamp: r.timestamp }));
    try { window.ReminderBridge.sync(JSON.stringify({ devices, entries })); }
    catch (error) { console.error('No se pudo sincronizar las notificaciones', error); }
  }

  // Declared date/time of actual measurement is distinct from the moment of input.
  function dateTimeLocal(ts) {
    const d = new Date(ts);
    return `${RecordCore.dateISO(ts)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function toggleEntryMode() {
    const mode = document.getElementById('recordEntryMode').value;
    document.getElementById('priorMeasureFields').classList.toggle('hidden', mode !== 'late');
    document.getElementById('omissionFields').classList.toggle('hidden', mode !== 'omitted');
    document.getElementById('correctionFields').classList.toggle('hidden', mode !== 'correction');
    document.getElementById('measurementFields').classList.toggle('hidden', mode === 'omitted');
    document.getElementById('recordPhotoSection').classList.toggle('hidden', mode === 'omitted');
    const save = document.getElementById('btnSaveRecord');
    save.textContent = mode === 'omitted' ? 'GUARDAR CONTROL SIN MEDICIÓN' : mode === 'correction' ? 'GUARDAR CORRECCIÓN' : 'GUARDAR REGISTRO DE TEMPERATURA';
    validateLiveTemperatureInput();
  }
  function resetEntryMode() {
    correctionTargetId = null;
    document.getElementById('recordEntryMode').value = 'current';
    document.getElementById('recordDeviceSelect').disabled = false;
    document.getElementById('priorMeasureAt').value = dateTimeLocal(Date.now());
    document.getElementById('omittedDate').value = getTodayISO();
    document.getElementById('correctionReason').value = '';
    toggleEntryMode();
  }
  function startCorrection(id) {
    const rec = recordsCache.find(r=>r.id === id);
    if (!rec || !RecordCore.isMeasurement(rec)) return;
    correctionTargetId = rec.id;
    switchView('view-record');
    document.getElementById('recordEntryMode').value = 'correction';
    document.getElementById('recordDeviceSelect').value = rec.equipoId;
    document.getElementById('recordDeviceSelect').disabled = true;
    document.getElementById('recordTempInput').value = rec.temperatura;
    document.getElementById('recordEmployeeInput').value = rec.responsable || '';
    document.getElementById('recordNotesInput').value = rec.observaciones || '';
    document.getElementById('correctionDetails').textContent = `Registro original: ${formatDisplayDate(rec.fecha)} a las ${formatTime(rec.timestamp)}. Se conservará el original.`;
    toggleEntryMode();
  }
  function missedSlots(days = 7) {
    // Avoid retrospectively inventing missed controls before first app update.
    const since = Number(localStorage.getItem('rt_monitoring_since_v2')) || Date.now();
    const now = Date.now(), result = [];
    const anchor = new Date(); anchor.setHours(0,0,0,0);
    for (let offset = days-1; offset >= 0; offset--) {
      const day = new Date(anchor.getTime()); day.setDate(day.getDate()-offset);
      for (const hour of [9,21]) {
        const start = new Date(day.getFullYear(),day.getMonth(),day.getDate(),hour).getTime();
        if (start < since || now < start + 60*60*1000) continue;
        const key = RecordCore.slotKey(start);
        for (const dev of devicesCache.filter(d=>d.activo!==false)) {
          if (Number(dev.createdAt || 0) > start) continue;
          const declared = recordsCache.some(r => r.registroTipo === 'omitted' && String(r.equipoId) === String(dev.id) && r.slotProgramado === key);
          if (!declared && !RecordCore.slotSatisfied(recordsCache,dev.id,key)) result.push({dev,key,start});
        }
      }
    }
    return result;
  }
  function renderMissedSlots() {
    const list = document.getElementById('pastMissingList');
    const entries = missedSlots().slice(-40);
    document.getElementById('pastMissingCount').textContent = entries.length;
    list.textContent = '';
    if (!entries.length) { list.innerHTML = '<div class="empty-placeholder">No hay controles anteriores pendientes.</div>'; return; }
    for (const item of entries) {
      const row = document.createElement('div'); row.className = 'device-status-card';
      row.innerHTML = `<div class="device-info-col"><strong>${escapeHtml(item.dev.nombre)}</strong><div class="device-meta-line">${formatDisplayDate(RecordCore.dateISO(item.start))} · ${item.key.endsWith('/09')?'09:00':'21:00'}</div></div>`;
      const btn = document.createElement('button'); btn.type='button'; btn.className='m3-btn m3-btn-outline m3-btn-sm'; btn.textContent='Revisar';
      btn.addEventListener('click', () => { switchView('view-record'); resetEntryMode(); document.getElementById('recordDeviceSelect').value=item.dev.id; document.getElementById('recordEntryMode').value='omitted'; document.getElementById('omittedDate').value=RecordCore.dateISO(item.start); document.getElementById('omittedSlot').value=item.key.endsWith('/09')?'09':'21'; toggleEntryMode(); });
      row.appendChild(btn);list.appendChild(row);
    }
  }
  function exportFilter() {
    const from=document.getElementById('exportFromDate').value, to=document.getElementById('exportToDate').value;
    if (from && to && from > to) throw new Error('La fecha inicial es posterior a la final');
    return {deviceId:document.getElementById('exportDeviceFilter').value, from, to};
  }
  function reportRows(filter = exportFilter()) { return RecordCore.exportRows(recordsCache, devicesCache, filter); }
  async function exportExcelReport() {
    const button = document.getElementById('btnExportExcel');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const filter = exportFilter();
      const rows = reportRows(filter);
      if (!rows.length) return showSnackbar('No hay registros en el periodo seleccionado');
      const entries = RTExcel.build(rows, filter);
      const blob = createStoredZip(entries);
      await saveFile(blob, `Registro_Temperaturas_${getTodayISO()}.xlsx`);
      showSnackbar('Excel preparado: resumen diario, resumen por equipo, registros y hojas mensuales.');
    } catch (e) { showSnackbar('Error Excel: ' + e.message); }
    finally { button.disabled = false; }
  }
  function applyExportPreset(preset) {
    const now = new Date();
    const from = document.getElementById('exportFromDate');
    const to = document.getElementById('exportToDate');
    const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (preset === 'all') { from.value=''; to.value=''; }
    else if (preset === 'today') { from.value=to.value=localDate(now); }
    else if (preset === 'week') {
      const earlier = new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);
      from.value=localDate(earlier);to.value=localDate(now);
    } else if (preset === 'month') {
      from.value=localDate(new Date(now.getFullYear(),now.getMonth(),1));
      to.value=localDate(now);
    } else if (preset === 'previous') {
      from.value=localDate(new Date(now.getFullYear(),now.getMonth()-1,1));
      to.value=localDate(new Date(now.getFullYear(),now.getMonth(),0));
    }
    document.querySelectorAll('[data-export-preset]').forEach(b=>b.classList.toggle('selected', b.dataset.exportPreset === preset));
  }
  async function exportCSVReport() {
    try {
      const rows = reportRows();
      if (!rows.length) return showSnackbar('No hay registros en el periodo seleccionado');
      const blob = new Blob([RecordCore.csv(rows)], {type:'text/csv;charset=utf-8'});
      await saveFile(blob, `Registro_Temperaturas_${getTodayISO()}.csv`);
      showSnackbar('Selecciona dónde guardar el CSV para Excel.');
    } catch(e) { showSnackbar('Error CSV: ' + e.message); }
  }
  let pdfExportBusy = false;
  async function exportPDFReport(filterOverride = null) {
    if (pdfExportBusy) return showSnackbar('Ya se está preparando un informe.');
    const btn = document.getElementById('btnExportPDF');
    const quick = document.getElementById('btnQuickPDF');
    pdfExportBusy = true;
    if (btn) btn.disabled = true;
    if (quick) quick.disabled = true;
    try {
      const filter = filterOverride || exportFilter();
      const rows = reportRows(filter);
      if (!rows.length) return showSnackbar('No hay controles registrados para el periodo seleccionado.');
      if (!window.AndroidBridge || typeof window.AndroidBridge.begin !== 'function') {
        return showSnackbar('Para crear el informe PDF con fotografías usa la aplicación Android.');
      }
      const selectedDevice = devicesCache.find(d => String(d.id) === String(filter.deviceId));
      const entries = RTReports.packageReport(rows, {...filter, equipoNombre:selectedDevice ? selectedDevice.nombre : 'Todos los equipos'});
      const packageZip = createStoredZip(entries);
      // Archivo temporal privado para el motor PDF nativo. No se muestra ni se exporta al usuario.
      await nativeExport(packageZip, 'informe_interno.zip', 'pdfReport');
      showSnackbar('Generando el PDF con fotografías. Selecciona dónde guardarlo.');
    } catch(e) { showSnackbar('Error al crear el informe PDF: ' + e.message); }
    finally {
      pdfExportBusy = false;
      if (btn) btn.disabled = false;
      if (quick) quick.disabled = false;
    }
  }
  function refreshExportDevices() {
    const select=document.getElementById('exportDeviceFilter'), old=select.value;
    select.innerHTML='<option value="ALL">Todos los equipos</option>';
    for(const d of devicesCache) {const o=document.createElement('option');o.value=d.id;o.textContent=d.nombre;select.appendChild(o);}
    if([...select.options].some(o=>o.value===old)) select.value=old;
  }
  async function saveFile(blob,name) {
    if(window.AndroidBridge) await nativeExport(blob,name,'save');
    else {const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);}
  }
  function renderAll() {
    document.getElementById('currentDateBadge').textContent = formatDisplayDate(getTodayISO());
    renderHomeView();
    renderRecordFormSelectors();
    renderHistoryView();
    renderManageDevicesView();
    refreshExportDevices();
    renderMissedSlots();
    syncAndroidReminders();
  }

  function renderHomeView() {
    const today = getTodayISO();
    const slot = getReminderSlot();
    const todayRecords = RecordCore.effective(recordsCache).filter(r => RecordCore.isMeasurement(r) && r.timestamp >= slot.start && r.timestamp <= Date.now());
    const heading = document.getElementById('reminderSlotHeading');
    if (heading) heading.textContent = `Pendientes de revisar — turno de ${slot.label}`;
    const pendingContainer = document.getElementById('pendingDevicesList');
    const checkedContainer = document.getElementById('checkedDevicesList');
    pendingContainer.innerHTML = '';
    checkedContainer.innerHTML = '';

    let pendingCount = 0, checkedCount = 0, alertsToday = 0;

    devicesCache.filter(device => device.activo !== false).forEach(device => {
      const recs = todayRecords.filter(r => r.equipoId === device.id || r.equipoNombre === device.nombre);
      if (recs.length === 0) {
        pendingCount++;
        const card = document.createElement('div');
        card.className = 'device-status-card';
        card.innerHTML = `
          <div class="device-info-col">
            <div class="device-title-line"><span>${device.minTemp < 0 ? '❄️' : '🧊'}</span><span>${escapeHtml(device.nombre)}</span></div>
            <div class="device-meta-line">Rango: ${device.minTemp}°C a ${device.maxTemp}°C ${device.ubicacion ? '• ' + escapeHtml(device.ubicacion) : ''}</div>
          </div>
          <button type="button" class="m3-btn m3-btn-tonal m3-btn-sm">🌡️ Registrar</button>
        `;
        card.querySelector('button').addEventListener('click', () => openRecordForDevice(device.id));
        pendingContainer.appendChild(card);
      } else {
        checkedCount++;
        const latest = recs[0];
        const out = isTempOutOfRange(device, latest.temperatura);
        if (out) alertsToday++;
        const card = document.createElement('div');
        card.className = 'device-status-card' + (out ? ' card-alert-border' : '');
        card.innerHTML = `
          <div class="device-info-col">
            <div class="device-title-line"><span>${out ? '🚨' : '✅'}</span><span>${escapeHtml(device.nombre)}</span></div>
            <div class="device-meta-line">Hora: ${formatTime(latest.timestamp)} ${latest.responsable ? '• ' + escapeHtml(latest.responsable) : ''}</div>
          </div>
          <div class="temp-display-badge ${out ? 'temp-alert' : 'temp-ok'}">${latest.temperatura.toFixed(1)} °C</div>
        `;
        card.addEventListener('click', () => openRecordForDevice(device.id));
        checkedContainer.appendChild(card);
      }
    });

    if (!pendingCount) pendingContainer.innerHTML = `<div class="empty-placeholder">🎉 ¡Todos los equipos han sido revisados hoy!</div>`;
    if (!checkedCount) checkedContainer.innerHTML = `<div class="empty-placeholder">Aún no se ha registrado ningún equipo hoy.</div>`;

    const total = devicesCache.filter(device => device.activo !== false).length;
    document.getElementById('kpiTotalDevices').textContent = total;
    document.getElementById('kpiPendingToday').textContent = pendingCount;
    document.getElementById('kpiCheckedToday').textContent = checkedCount;
    document.getElementById('kpiAlertsToday').textContent = alertsToday;
    document.getElementById('dailyProgressBadge').textContent = `${total ? Math.round((checkedCount / total) * 100) : 0}%`;
    document.getElementById('pendingCountChip').textContent = pendingCount;
    document.getElementById('checkedCountChip').textContent = checkedCount;
  }

  function renderRecordFormSelectors() {
    const recSelect = document.getElementById('recordDeviceSelect');
    const histSelect = document.getElementById('historyFilterDevice');
    const curRec = recSelect.value, curHist = histSelect.value;

    recSelect.innerHTML = '';
    devicesCache.filter(d => d.activo !== false).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.nombre} (${d.minTemp}°C a ${d.maxTemp}°C)`;
      recSelect.appendChild(opt);
    });
    if (curRec && devicesCache.some(d => d.id === curRec)) recSelect.value = curRec;

    histSelect.innerHTML = '<option value="ALL">Todos los equipos</option>';
    devicesCache.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.nombre;
      histSelect.appendChild(opt);
    });
    if (curHist) histSelect.value = curHist;
    updateSelectedDeviceRangeBanner();
  }

  function getSelectedRecordDevice() {
    const id = document.getElementById('recordDeviceSelect').value;
    return devicesCache.find(d => d.id === id) || devicesCache[0] || null;
  }

  function updateSelectedDeviceRangeBanner() {
    const dev = getSelectedRecordDevice();
    document.getElementById('selectedDeviceRangeInfo').textContent = dev
      ? `Rango seguro permitido: de ${dev.minTemp} °C a ${dev.maxTemp} °C`
      : 'No hay equipos configurados.';
    validateLiveTemperatureInput();
  }

  function validateLiveTemperatureInput() {
    const dev = getSelectedRecordDevice();
    const rawVal = document.getElementById('recordTempInput').value;
    const container = document.getElementById('tempInputContainer');
    const banner = document.getElementById('tempWarningBanner');
    if (!dev || rawVal === '' || isNaN(Number(rawVal))) {
      container.classList.remove('is-out-of-range');
      banner.classList.add('hidden');
      return;
    }
    const temp = parseFloat(rawVal);
    if (isTempOutOfRange(dev, temp)) {
      container.classList.add('is-out-of-range');
      banner.classList.remove('hidden');
      document.getElementById('tempWarningText').textContent =
        `Valor: ${temp.toFixed(1)}°C (Límite de ${dev.nombre}: ${dev.minTemp}°C a ${dev.maxTemp}°C).`;
    } else {
      container.classList.remove('is-out-of-range');
      banner.classList.add('hidden');
    }
  }

  function renderHistoryView() {
    const devFilter = document.getElementById('historyFilterDevice').value;
    const dateFilter = document.getElementById('historyFilterDate').value;
    const listEl = document.getElementById('historyRecordsList');
    listEl.innerHTML = '';

    const filtered = RecordCore.effective(recordsCache).filter(rec => {
      const devObj = devicesCache.find(d => d.id === rec.equipoId || d.nombre === rec.equipoNombre);
      const out = RecordCore.isMeasurement(rec) && (devObj ? isTempOutOfRange(devObj, rec.temperatura) : rec.fueraDeRango);
      if (devFilter && devFilter !== 'ALL' && rec.equipoId !== devFilter) return false;
      if (dateFilter && rec.fecha !== dateFilter) return false;
      if (showOnlyAlertsHistory && !out) return false;
      return true;
    });

    document.getElementById('historyResultsCount').textContent = `${filtered.length} registros encontrados`;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-placeholder">No hay registros para los filtros seleccionados.</div>`;
      return;
    }

    filtered.forEach(rec => {
      const devObj = devicesCache.find(d => d.id === rec.equipoId || d.nombre === rec.equipoNombre);
      const out = RecordCore.isMeasurement(rec) && (devObj ? isTempOutOfRange(devObj, rec.temperatura) : rec.fueraDeRango);
      const devName = devObj ? devObj.nombre : (rec.equipoNombre || 'Equipo');
      const card = document.createElement('div');
      card.className = 'history-card' + (out ? ' history-alert' : '');
      card.innerHTML = `
        ${rec.foto ? `<img src="${rec.foto}" class="history-thumb" alt="Foto" />` : `<div class="history-thumb-placeholder">🌡️</div>`}
        <div class="history-body">
          <div class="history-top-row">
            <span class="history-device-name">${escapeHtml(devName)}</span>
            <span class="temp-display-badge ${out ? 'temp-alert' : 'temp-ok'}">${RecordCore.isMeasurement(rec) ? Number(rec.temperatura).toFixed(1) + ' °C' : '—'}</span>
          </div>
          <div class="history-meta">📅 ${formatDisplayDate(rec.fecha)} • 🕒 ${RecordCore.isMeasurement(rec) ? formatTime(rec.timestamp) : 'Sin medición'} ${rec.responsable ? '• 👤 ' + escapeHtml(rec.responsable) : ''}</div>
          ${out ? '<div style="color:#ba1a1a;font-size:12px;font-weight:700;margin-top:4px;">⚠️ TEMPERATURA FUERA DE RANGO</div>' : ''}
          ${rec.observaciones ? `<div class="history-notes">📝 ${escapeHtml(rec.observaciones)}</div>` : ''}

        </div>
      `;
      const imgEl = card.querySelector('.history-thumb');
      if (imgEl) imgEl.addEventListener('click', () => {
        document.getElementById('photoViewerImg').src = rec.foto;
        document.getElementById('photoViewerCaption').textContent = `${devName} (${Number(rec.temperatura).toFixed(1)}°C)`;
        document.getElementById('photoViewerModal').classList.remove('hidden');
      });
      if (RecordCore.isMeasurement(rec)) {
        const modify = document.createElement('button');
        modify.className = 'm3-btn m3-btn-tonal m3-btn-sm';
        modify.type = 'button'; modify.textContent = '✏️ Corregir';
        modify.addEventListener('click', () => startCorrection(rec.id));
        card.querySelector('.history-body').appendChild(modify);
      }
      listEl.appendChild(card);
    });
  }

  function renderManageDevicesView() {
    const container = document.getElementById('manageDevicesList');
    container.innerHTML = '';
    devicesCache.forEach(dev => {
      const row = document.createElement('div');
      row.className = 'manage-device-item';
      row.innerHTML = `
        <div class="device-info-col">
          <div class="device-title-line"><span>${dev.minTemp < 0 ? '❄️' : '🧊'}</span><span>${escapeHtml(dev.nombre)}</span></div>
          <div class="device-meta-line">Rango: <strong>${dev.minTemp}°C a ${dev.maxTemp}°C</strong> ${dev.activo === false ? '• INACTIVO' : ''} ${dev.ubicacion ? '• ' + escapeHtml(dev.ubicacion) : ''}</div>
        </div>
        <div class="manage-actions">
          <button type="button" class="m3-btn m3-btn-tonal m3-btn-sm" data-edit>✏️</button>
          <button type="button" class="m3-btn m3-btn-danger-outline m3-btn-sm" data-del>🗑️</button>
        </div>
      `;
      row.querySelector('[data-edit]').addEventListener('click', () => openDeviceModal(dev));
      row.querySelector('[data-del]').addEventListener('click', async () => {
        if (recordsCache.some(r => r.equipoId === dev.id)) return showSnackbar('No se puede eliminar un equipo con historial. Desactívalo en Editar.');
        if (confirm(`¿Eliminar "${dev.nombre}"?`)) {
          await dbDelete(STORE_DEVICES, dev.id);
          await loadAllData();
          renderAll();
          showSnackbar('Equipo eliminado');
        }
      });
      container.appendChild(row);
    });
  }

  function switchView(targetId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === targetId));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.target === targetId));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openRecordForDevice(deviceId) {
    switchView('view-record');
    if (deviceId) {
      document.getElementById('recordDeviceSelect').value = deviceId;
      updateSelectedDeviceRangeBanner();
    }
  }

  function openDeviceModal(device = null) {
    document.getElementById('deviceModalTitle').textContent = device ? 'Editar Equipo' : 'Añadir Equipo';
    document.getElementById('deviceIdInput').value = device ? device.id : '';
    document.getElementById('deviceNameInput').value = device ? device.nombre : '';
    document.getElementById('deviceTypeSelect').value = device ? (device.tipo || 'PERSONALIZADO') : 'REFRIGERACION';
    document.getElementById('deviceMinTempInput').value = device ? device.minTemp : 0;
    document.getElementById('deviceMaxTempInput').value = device ? device.maxTemp : 4;
    document.getElementById('deviceLocationInput').value = device ? (device.ubicacion || '') : '';
    document.getElementById('deviceActiveInput').checked = !device || device.activo !== false;
    document.getElementById('deviceModal').classList.remove('hidden');
  }

  // Motor ZIP nativo JS
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ u8[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function createStoredZip(files) {
    const enc = new TextEncoder(), localParts = [], centralParts = [];
    let offset = 0;
    files.forEach(f => {
      const nameB = enc.encode(f.name);
      const dataB = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
      const crc = crc32(dataB), size = dataB.length;
      const lh = new Uint8Array(30 + nameB.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, nameB.length, true);
      lh.set(nameB, 30);
      localParts.push(lh, dataB);

      const ch = new Uint8Array(46 + nameB.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
      cv.setUint16(28, nameB.length, true); cv.setUint32(42, offset, true);
      ch.set(nameB, 46);
      centralParts.push(ch);
      offset += lh.length + size;
    });
    const cSize = centralParts.reduce((a, p) => a + p.length, 0);
    const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true); ev.setUint32(12, cSize, true); ev.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  async function extractStoredZip(buf) {
    const bytes = new Uint8Array(buf), view = new DataView(buf), dec = new TextDecoder();
    const out = new Map(); let pos = 0, entries = 0;
    while (pos + 4 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
      if (++entries > 45000 || pos + 30 > bytes.length) throw new Error('ZIP demasiado grande o incompleto');
      const flags = view.getUint16(pos + 6, true), method = view.getUint16(pos + 8, true);
      const crc = view.getUint32(pos + 14, true), size = view.getUint32(pos + 18, true);
      const nLen = view.getUint16(pos + 26, true), extra = view.getUint16(pos + 28, true);
      const begin = pos + 30, start = begin + nLen + extra, end = start + size;
      if (method !== 0 || (flags & 0x08)) throw new Error('ZIP no compatible: solo copias sin compresión de esta App');
      if (end > bytes.length || start < begin) throw new Error('ZIP truncado');
      const name = dec.decode(bytes.subarray(begin, begin + nLen));
      if (!name || name.includes('..') || name.startsWith('/') || out.has(name)) throw new Error('Nombre ZIP no válido o duplicado');
      const part = bytes.slice(start, end);
      if (crc32(part) !== crc) throw new Error('ZIP dañado: integridad incorrecta para ' + name);
      out.set(name, part); pos = end;
    }
    if (!out.size || pos + 4 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP inválido o incompleto');
    return out;
  }

  async function nativeExport(blob, name, mode = 'save') {
    const bridge = window.AndroidBridge;
    if (!bridge || typeof bridge.begin !== 'function' || typeof bridge.append !== 'function' || typeof bridge.finish !== 'function') throw new Error('Interfaz de Android no disponible');
    bridge.begin(name);
    try {
      const step = 64 * 1024;
      for (let i = 0; i < blob.size; i += step) {
        const bytes = new Uint8Array(await blob.slice(i, i + step).arrayBuffer());
        let binary = '';
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
        bridge.append(btoa(binary));
      }
      bridge.finish(mode);
    } catch (err) { bridge.cancel(); throw err; }
  }

  // El formato SHANFOODSGROUP_M3 v2 y todos los datos y fotos se mantienen sin cambios.
  function backupData() {
    return {format: 'SHANFOODSGROUP_M3', version: 2, exportedAt: new Date().toISOString(),
      equipos: devicesCache, registros: recordsCache};
  }
  async function exportBackupJson() {
    try {
      const json = JSON.stringify(backupData());
      await saveFile(new Blob([json], {type:'application/json'}), `SHANFOODSGROUP_Backup_${getTodayISO()}.json`);
      showSnackbar('Copia técnica JSON guardada. No es el informe para entregar.');
    } catch(e) { showSnackbar('Error al guardar JSON: ' + e.message); }
  }
  async function exportBackupZip(mode = 'save') {
    const statusEl = document.getElementById('backupStatusText');
    const btn = document.getElementById(mode === 'share' ? 'btnShareZip' : 'btnExportZip');
    btn.disabled = true;
    try {
      const payload = JSON.stringify(backupData());
      const zipBlob = createStoredZip([
        { name: 'backup_datos.json', data: payload },
        { name: 'informe_temperaturas.csv', data: RecordCore.csv(RecordCore.exportRows(recordsCache,devicesCache)) }
      ]);
      const fileName = `SHANFOODSGROUP_Backup_${getTodayISO()}.zip`;
      if (window.AndroidBridge) {
        await nativeExport(zipBlob, fileName, mode);
        statusEl.textContent = mode === 'share' ? 'Selecciona Drive u otra aplicación y comprueba que se ha subido.' :
          'Selecciona dónde guardar el archivo ZIP; verifica que esté en Archivos o Drive.';
      } else if (mode === 'share' && navigator.canShare && navigator.canShare({files:[new File([zipBlob],fileName,{type:'application/zip'})]})) {
        await navigator.share({files:[new File([zipBlob],fileName,{type:'application/zip'})]});
        statusEl.textContent = 'Copia compartida. Comprueba que se ha guardado.';
      } else {
        const href = URL.createObjectURL(zipBlob), a = document.createElement('a');
        a.href = href; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 60000);
        statusEl.textContent = `Descarga solicitada: ${fileName}. Comprueba el archivo.`;
      }
    } catch (e) { statusEl.textContent = '❌ Error al exportar: ' + e.message; }
    finally { btn.disabled = false; }
  }

  function assertBackupShape(data) {
    if (!data || typeof data !== 'object') throw new Error('El contenido JSON no es válido');
    const ds = data.equipos || data.devices, rs = data.registros || data.records;
    if (!Array.isArray(ds) || !Array.isArray(rs) || ds.length > 10000 || rs.length > 40000) throw new Error('Datos incompletos o límites de seguridad excedidos');
    for (const d of ds) if (!d || !d.id || !(d.nombre || d.name) || !Number.isFinite(Number(d.minTemp ?? d.min)) ||
      !Number.isFinite(Number(d.maxTemp ?? d.max))) throw new Error('Equipo inválido en copia');
    for (const r of rs) if (!r || !r.id || (r.registroTipo !== 'omitted' && !Number.isFinite(Number(r.temperatura ?? r.temp))) || !(r.equipoId || r.deviceId))
      throw new Error('Registro inválido en copia');
    return {ds, rs};
  }

  async function importBackupFile(file) {
    const statusEl = document.getElementById('backupStatusText');
    try {
      if (file.size > 600 * 1024 * 1024) throw new Error('Archivo demasiado grande (máximo 600 MB).');
      const isJson = /\.json$/i.test(file.name);
      const files = isJson ? null : await extractStoredZip(await file.arrayBuffer());
      let records, devices;
      if (isJson) {
        ({ds: devices, rs: records} = assertBackupShape(JSON.parse(await file.text())));
      } else if (files.has('backup_datos.json')) {
        ({ds: devices, rs: records} = assertBackupShape(JSON.parse(new TextDecoder().decode(files.get('backup_datos.json')))));
      } else if (files.has('registro.json')) {
        const manifest = JSON.parse(new TextDecoder().decode(files.get('registro.json')));
        ({ds: devices, rs: records} = assertBackupShape(manifest));
        records = await Promise.all(records.map(async row => {
          const photoBytes = files.get(`fotos/${row.id}.jpg`);
          if (!photoBytes) throw new Error('Foto ausente para el registro ' + row.id);
          const binary = new Blob([photoBytes], {type:'image/jpeg'});
          return {...row, foto: await blobAsDataUrl(binary)};
        }));
      } else throw new Error('Falta backup_datos.json o registro.json en la copia ZIP');
      const newDevices = new Map(); const newRecords = new Map();
      for (const d of devices) { const n = normalizeDevice(d); if (newDevices.has(n.id)) throw new Error('Equipo duplicado en ZIP'); newDevices.set(n.id, n); }
      for (const r of records) { const n = normalizeRecord(r); if (newRecords.has(n.id)) throw new Error('Registro duplicado en ZIP'); newRecords.set(n.id, n); }
      const existingDevices = new Set((await dbGetAll(STORE_DEVICES)).map(d => String(d.id)));
      const existingRecords = new Set((await dbGetAll(STORE_RECORDS)).map(r => String(r.id)));
      const newDs = [...newDevices.values()].filter(d => !existingDevices.has(d.id));
      const newRs = [...newRecords.values()].filter(r => !existingRecords.has(r.id));
      if (!confirm(`Se añadirán ${newDs.length} equipos y ${newRs.length} registros NUEVOS. Los datos existentes NO se borrarán ni sobrescribirán. ¿Continuar?`)) return;
      if (newDs.length || newRs.length) await new Promise((resolve,reject) => {
        const tx = dbInstance.transaction([STORE_DEVICES,STORE_RECORDS], 'readwrite');
        for (const d of newDs) tx.objectStore(STORE_DEVICES).put(d);
        for (const r of newRs) tx.objectStore(STORE_RECORDS).put(r);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Error de importación'));
        tx.onabort = () => reject(tx.error || new Error('Restauración interrumpida'));
      });
      await loadAllData(); renderAll();
      statusEl.textContent = `✅ Importación completada: ${newDs.length} equipos, ${newRs.length} registros nuevos; existentes conservados.`;
      showSnackbar('Copia importada; registros existentes conservados.');
    } catch (e) { statusEl.textContent = '❌ Error al importar: ' + e.message; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.target)));
    document.getElementById('recordDeviceSelect').addEventListener('change', updateSelectedDeviceRangeBanner);
    document.getElementById('recordEntryMode').addEventListener('change', () => { correctionTargetId=null; document.getElementById('recordDeviceSelect').disabled=false; toggleEntryMode(); });
    document.getElementById('btnExportExcel').addEventListener('click', exportExcelReport);
    document.querySelectorAll('[data-export-preset]').forEach(b => b.addEventListener('click', () => applyExportPreset(b.dataset.exportPreset)));
    applyExportPreset('month');
    document.getElementById('btnExportCSV').addEventListener('click', exportCSVReport);
    document.getElementById('btnExportPDF').addEventListener('click', () => exportPDFReport());
    document.getElementById('btnQuickPDF').addEventListener('click', () => exportPDFReport({deviceId:'ALL', from:getTodayISO(), to:getTodayISO()}));
    const tempInput = document.getElementById('recordTempInput');
    tempInput.addEventListener('input', validateLiveTemperatureInput);
    document.getElementById('btnTempMinus').addEventListener('click', () => { tempInput.value = ((parseFloat(tempInput.value) || 0) - 0.5).toFixed(1); validateLiveTemperatureInput(); });
    document.getElementById('btnTempPlus').addEventListener('click', () => { tempInput.value = ((parseFloat(tempInput.value) || 0) + 0.5).toFixed(1); validateLiveTemperatureInput(); });
    document.getElementById('btnToggleSign').addEventListener('click', () => {
      if (!tempInput.value) { tempInput.value = '-'; return; }
      const v = parseFloat(tempInput.value);
      if (!isNaN(v)) { tempInput.value = (-v).toFixed(1); validateLiveTemperatureInput(); }
    });

    const photoInput = document.getElementById('recordPhotoInput');
    document.getElementById('photoEmptyState').addEventListener('click', () => photoInput.click());
    document.getElementById('btnRetakePhoto').addEventListener('click', () => photoInput.click());
    document.getElementById('btnRemovePhoto').addEventListener('click', () => {
      currentCompressedPhoto = null; photoInput.value = '';
      document.getElementById('photoPreviewState').classList.add('hidden');
      document.getElementById('photoEmptyState').classList.remove('hidden');
    });
    photoInput.addEventListener('change', async e => {
      if (!e.target.files || !e.target.files[0]) return;
      try { currentCompressedPhoto = await compressImageFile(e.target.files[0], 1024, 0.72); }
      catch (err) { currentCompressedPhoto = null; showSnackbar('No se puede leer la foto: ' + err.message); return; }
      document.getElementById('recordPhotoPreview').src = currentCompressedPhoto;
      document.getElementById('photoEmptyState').classList.add('hidden');
      document.getElementById('photoPreviewState').classList.remove('hidden');
    });

    document.getElementById('recordForm').addEventListener('submit', async e => {
      e.preventDefault();
      const mode=document.getElementById('recordEntryMode').value;
      const dev=getSelectedRecordDevice();
      if(!dev) return showSnackbar('Selecciona un equipo');
      const now=Date.now();let measuredAt=now,base=null,reason='';
      if(mode==='omitted') {
        const date=document.getElementById('omittedDate').value;
        const hour=document.getElementById('omittedSlot').value;
        reason=document.getElementById('omittedReason').value.trim();
        if(!date||!['09','21'].includes(hour)||!reason) return showSnackbar('Indica fecha, turno y motivo del control no realizado.');
        const scheduled=new Date(date+'T'+hour+':00:00').getTime();
        if(!Number.isFinite(scheduled)||scheduled>now) return showSnackbar('No se puede registrar un control futuro.');
        const key=RecordCore.slotKey(scheduled);
        if(RecordCore.slotSatisfied(recordsCache,dev.id,key)) return showSnackbar('Ya existe una medición para ese turno.');
        if(recordsCache.some(r=>r.registroTipo==='omitted'&&r.equipoId===dev.id&&r.slotProgramado===key))return showSnackbar('Este turno ya está declarado como no realizado.');
        await dbPut(STORE_RECORDS,{id:'omit-'+now+'-'+Math.random().toString(36).slice(2,8),equipoId:dev.id,equipoNombre:dev.nombre,temperatura:null,
          fecha:date,timestamp:scheduled,recordedAt:now,foto:null,responsable:document.getElementById('recordEmployeeInput').value.trim(),observaciones:reason,
          registroTipo:'omitted',slotProgramado:key,fueraDeRango:false});
      } else {
        const raw=tempInput.value.trim(), tempVal=Number(raw);
        if(!raw||!Number.isFinite(tempVal)||tempVal< -100||tempVal>100) return showSnackbar('Introduce una temperatura válida');
        if(mode==='late') {
          measuredAt=new Date(document.getElementById('priorMeasureAt').value).getTime();
          reason=document.getElementById('priorReason').value.trim();
          if(!Number.isFinite(measuredAt)||measuredAt>now||measuredAt<now-366*86400000||!reason)
            return showSnackbar('Indica la hora real de medición (máx. 1 año) y motivo del registro posterior.');
          if(!document.getElementById('recordEmployeeInput').value.trim())return showSnackbar('Indica quién realizó la medición.');
        } else if(mode==='correction') {
          base=recordsCache.find(r=>r.id===correctionTargetId);
          reason=document.getElementById('correctionReason').value.trim();
          if(!base||!RecordCore.isMeasurement(base)||!reason)return showSnackbar('Selecciona el registro y explica la corrección.');
          measuredAt=base.timestamp;
        } else if(!currentCompressedPhoto) return showSnackbar('Haz una foto del termómetro antes de guardar.');
        const out=isTempOutOfRange(dev,tempVal);
        const notes=document.getElementById('recordNotesInput').value.trim();
        if(out&&!notes)return showSnackbar('Temperatura fuera de rango: escribe la medida correctora.');
        const record={id:'rec-'+now+'-'+Math.random().toString(36).slice(2,8),equipoId:dev.id,equipoNombre:dev.nombre,temperatura:tempVal,
          fecha:RecordCore.dateISO(measuredAt),timestamp:measuredAt,recordedAt:now,
          foto:currentCompressedPhoto||(base&&base.foto)||null,
          fotoCapturadaEn:currentCompressedPhoto?now:(base&&base.fotoCapturadaEn)||null,
          responsable:document.getElementById('recordEmployeeInput').value.trim(),observaciones:notes,fueraDeRango:out,
          registroTipo:mode, motivoRegistro:mode==='late'?reason:'', motivoCorreccion:mode==='correction'?reason:'',
          supersedesId:mode==='correction'?base.id:null};
        await dbPut(STORE_RECORDS,record);
      }
      await loadAllData();
      tempInput.value='';document.getElementById('recordNotesInput').value='';
      document.getElementById('priorReason').value='';document.getElementById('omittedReason').value='';
      document.getElementById('recordEmployeeInput').value='';
      currentCompressedPhoto=null;photoInput.value='';
      document.getElementById('photoPreviewState').classList.add('hidden');
      document.getElementById('photoEmptyState').classList.remove('hidden');
      resetEntryMode();renderAll();showSnackbar('Registro guardado sin borrar el historial');switchView('view-home');
    });

    document.getElementById('historyFilterDevice').addEventListener('change', renderHistoryView);
    document.getElementById('historyFilterDate').addEventListener('change', renderHistoryView);
    document.getElementById('btnFilterToday').addEventListener('click', () => { document.getElementById('historyFilterDate').value = getTodayISO(); showOnlyAlertsHistory = false; renderHistoryView(); });
    document.getElementById('btnFilterAlerts').addEventListener('click', () => { showOnlyAlertsHistory = !showOnlyAlertsHistory; renderHistoryView(); });
    document.getElementById('btnFilterClear').addEventListener('click', () => { document.getElementById('historyFilterDevice').value = 'ALL'; document.getElementById('historyFilterDate').value = ''; showOnlyAlertsHistory = false; renderHistoryView(); });

    document.getElementById('btnOpenAddDevice').addEventListener('click', () => openDeviceModal(null));
    document.getElementById('btnCloseDeviceModal').addEventListener('click', () => document.getElementById('deviceModal').classList.add('hidden'));
    document.getElementById('btnCancelDeviceModal').addEventListener('click', () => document.getElementById('deviceModal').classList.add('hidden'));
    document.getElementById('deviceTypeSelect').addEventListener('change', e => {
      if (e.target.value === 'REFRIGERACION') { document.getElementById('deviceMinTempInput').value = 0; document.getElementById('deviceMaxTempInput').value = 4; }
      else if (e.target.value === 'CONGELACION') { document.getElementById('deviceMinTempInput').value = -24; document.getElementById('deviceMaxTempInput').value = -18; }
    });
    document.getElementById('deviceForm').addEventListener('submit', async e => {
      e.preventDefault();
      await dbPut(STORE_DEVICES, {
        id: document.getElementById('deviceIdInput').value || ('eq-' + Date.now()),
        nombre: document.getElementById('deviceNameInput').value.trim(),
        tipo: document.getElementById('deviceTypeSelect').value,
        minTemp: parseFloat(document.getElementById('deviceMinTempInput').value),
        maxTemp: parseFloat(document.getElementById('deviceMaxTempInput').value),
        ubicacion: document.getElementById('deviceLocationInput').value.trim(),
        activo: document.getElementById('deviceActiveInput').checked,
        createdAt: (devicesCache.find(d=>d.id===document.getElementById('deviceIdInput').value)||{}).createdAt||Date.now()
      });
      await loadAllData();
      renderAll();
      document.getElementById('deviceModal').classList.add('hidden');
      showSnackbar('Equipo guardado');
    });

    document.getElementById('btnClosePhotoViewer').addEventListener('click', () => document.getElementById('photoViewerModal').classList.add('hidden'));
    document.getElementById('btnExportJson').addEventListener('click', exportBackupJson);
    document.getElementById('btnExportZip').addEventListener('click', () => exportBackupZip('save'));
    document.getElementById('btnShareZip').addEventListener('click', () => exportBackupZip('share'));
    document.getElementById('importZipInput').addEventListener('change', async e => { if (e.target.files[0]) await importBackupFile(e.target.files[0]); e.target.value = ''; });

    try {
      await initDatabase();
      await migrateLegacyData();
      await loadAllData();
      if(!localStorage.getItem('rt_monitoring_since_v2')) localStorage.setItem('rt_monitoring_since_v2',String(Date.now()));
      resetEntryMode();
    } catch (error) {
      showSnackbar('ERROR AL INICIAR: ' + error.message + '. Los datos antiguos no se han borrado.');
      console.error(error);
      return;
    }
    renderAll();
  });
})();

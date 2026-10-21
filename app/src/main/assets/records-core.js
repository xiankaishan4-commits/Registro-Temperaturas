(function (root) {
  'use strict';
  // The stored schema remains backwards compatible with all previous ZIP backups.
  function isMeasurement(rec) {
    return rec && rec.registroTipo !== 'omitted' && rec.temperatura !== null &&
      rec.temperatura !== '' && Number.isFinite(Number(rec.temperatura)) && Number.isFinite(Number(rec.timestamp));
  }
  function effective(records) {
    const replaced = new Set(records.filter(r => r.registroTipo === 'correction' && r.supersedesId)
      .map(r => String(r.supersedesId)));
    return records.filter(r => !replaced.has(String(r.id)));
  }
  function dateISO(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function timeHHMM(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function exportRows(records, devices, options = {}) {
    const byId = new Map(devices.map(d => [String(d.id), d]));
    return effective(records).filter(r => {
      if (options.deviceId && options.deviceId !== 'ALL' && String(r.equipoId) !== String(options.deviceId)) return false;
      const date = r.registroTipo === 'omitted' ? (r.fecha || '') : dateISO(Number(r.timestamp));
      if (options.from && date < options.from) return false;
      if (options.to && date > options.to) return false;
      return true;
    }).map(r => {
      const d = byId.get(String(r.equipoId));
      const measured = isMeasurement(r);
      return {
        equipo: String((d && d.nombre) || r.equipoNombre || 'Equipo'),
        fecha: measured ? dateISO(Number(r.timestamp)) : String(r.fecha || ''),
        hora: measured ? timeHHMM(Number(r.timestamp)) : '',
        temperatura: measured ? Number(r.temperatura).toFixed(1).replace('.', ',') : '',
        responsable: String(r.responsable || ''),
        observaciones: measured ? String(r.observaciones || '') : 'Sin medición',
        foto: measured ? (r.foto || null) : null,
        id: String(r.id || '')
      };
    }).sort((a,b) => (a.fecha+a.hora+a.equipo).localeCompare(b.fecha+b.hora+b.equipo,'es'));
  }
  function csv(rows) {
    const escaped = (value, index) => {
      let v = String(value == null ? '' : value);
      if (!(index === 3 && /^-?\d+,\d+$/.test(v)) && /^[\s\t]*[=+@\-]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g,'""') + '"';
    };
    const columns = ['Equipo', 'Fecha de medición', 'Hora de medición', 'Temperatura (°C)', 'Responsable', 'Observaciones'];
    return '\uFEFF' + [columns, ...rows.map(r=>[r.equipo,r.fecha,r.hora,r.temperatura,r.responsable,r.observaciones])]
      .map(a => a.map((v,i)=>escaped(v,i)).join(';')).join('\r\n') + '\r\n';
  }
  function slotKey(ms) {
    const d = new Date(ms);
    const day = dateISO(ms);
    if (d.getHours() >= 21) return `${day}/21`;
    if (d.getHours() >= 9) return `${day}/09`;
    const prior = new Date(d.getFullYear(), d.getMonth(), d.getDate()-1).getTime();
    return `${dateISO(prior)}/21`;
  }
  function slotSatisfied(records, deviceId, targetKey) {
    return effective(records).some(r => String(r.equipoId) === String(deviceId) && isMeasurement(r) && slotKey(Number(r.timestamp)) === targetKey);
  }
  root.RTRecords = { isMeasurement, effective, dateISO, timeHHMM, exportRows, csv, slotKey, slotSatisfied };
})(typeof window !== 'undefined' ? window : globalThis);

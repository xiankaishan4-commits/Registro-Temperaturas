(function (root) {
  'use strict';
  // Informe de lectura humana: el ZIP temporal es exclusivamente un transporte
  // interno entre WebView y Android, nunca una copia de seguridad para empleados.
  const MAX_ROWS = 180;
  const MAX_TOTAL_PHOTO_BYTES = 100 * 1024 * 1024;

  function photoBytes(dataUrl) {
    if (typeof dataUrl !== 'string') throw new Error('Fotografía no válida');
    const match = /^data:image\/(jpeg|png|webp);base64,/i.exec(dataUrl);
    if (!match) throw new Error('Formato de fotografía no compatible');
    const mime = match[1].toLowerCase();
    const raw = dataUrl.slice(match[0].length);
    const binary = atob(raw);
    if (binary.length > 8 * 1024 * 1024) throw new Error('Fotografía demasiado grande');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, ext: mime === 'jpeg' ? 'jpg' : mime };
  }

  function packageReport(rows, filter = {}) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('No hay registros para el informe');
    if (rows.length > MAX_ROWS) throw new Error('Seleccione un periodo menor (máximo 180 registros por PDF)');
    const images = [], safeRows = [];
    let totalBytes = 0;
    rows.forEach((row, i) => {
      const {foto, ...cleanRow} = row;
      if (foto) {
        const photo = photoBytes(foto);
        totalBytes += photo.bytes.length;
        if (totalBytes > MAX_TOTAL_PHOTO_BYTES) throw new Error('Demasiadas fotografías; reduzca el periodo');
        const name = `fotos/${String(i + 1).padStart(5, '0')}.${photo.ext}`;
        images.push({ name, data: photo.bytes });
        cleanRow.fotoArchivo = name;
      }
      safeRows.push(cleanRow);
    });
    const meta = {
      format: 'SHANFOODSGROUP_PDF_REPORT_V1',
      title: 'REGISTRO DE TEMPERATURAS',
      company: typeof filter.company === 'string' && filter.company.trim() ? filter.company.trim().slice(0, 120) : 'Mi empresa',
      desde: filter.from || '', hasta: filter.to || '',
      equipoFiltro: filter.equipoNombre || 'Todos los equipos',
      generadoEn: new Date().toISOString(),
      rows: safeRows
    };
    return [{ name: 'informe.json', data: JSON.stringify(meta) }, ...images];
  }
  root.RTReports = { packageReport, photoBytes, MAX_ROWS };
})(typeof window !== 'undefined' ? window : globalThis);

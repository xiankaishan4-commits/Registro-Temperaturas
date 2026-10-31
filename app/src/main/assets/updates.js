(function (root) {
  'use strict';
  const REPO = 'https://github.com/xiankaishan4-commits/Registro-Temperaturas';
  function versionParts(version) {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.exec(version);
    if (!match) throw Error('Versión no válida');
    const parts = match.slice(1, 4).map(Number);
    if (!parts.every(Number.isSafeInteger)) throw Error('Versión no válida');
    return parts;
  }
  function compare(a, b) {
    const x = versionParts(a), y = versionParts(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  function trustedLink(url, kind) {
    if (typeof url !== 'string') return false;
    return url.startsWith(REPO + '/releases/' + kind + '/') &&
      !/[\s\\?#]/.test(url) && (kind !== 'download' || url.toLowerCase().endsWith('.apk'));
  }
  function releaseInfo(release, current) {
    if (!release || release.draft !== false || release.prerelease !== false ||
        !trustedLink(release.html_url, 'tag')) throw Error('Respuesta de GitHub no válida');
    const newer = compare(release.tag_name, current) > 0;
    const apk = (Array.isArray(release.assets) ? release.assets : []).find(a =>
      a.state === 'uploaded' && a.size > 0 && trustedLink(a.browser_download_url, 'download'));
    return {newer, version:release.tag_name, release:release.html_url, apk:apk ? apk.browser_download_url : null};
  }
  let current = null, pending = null, requestId = 0;
  function receive(id, value) { if (pending && id === requestId) pending(value); }
  async function query() {
    if (root.UpdateBridge && typeof root.UpdateBridge.check === 'function') {
      return new Promise((resolve, reject) => {
        const id = ++requestId;
        const timer = setTimeout(() => { pending = null; reject(Error('Tiempo de espera agotado')); }, 25000);
        pending = result => { clearTimeout(timer); pending = null; result.error ? reject(Error(result.error)) : resolve(result); };
        try { root.UpdateBridge.check(id); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.github.com/repos/xiankaishan4-commits/Registro-Temperaturas/releases/latest',
        {signal:controller.signal, cache:'no-store', headers:{Accept:'application/vnd.github+json'}});
      if (!response.ok) throw Error('GitHub HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function addLink(url, label) {
    const a = document.createElement('a'); a.href = url; a.textContent = label;
    a.className = 'm3-btn m3-btn-outline'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.addEventListener('click', e => {
      if (root.UpdateBridge) { e.preventDefault(); root.UpdateBridge.openRelease(url); }
    });
    document.getElementById('updateLinks').appendChild(a);
  }
  function init() {
    try {
      current = root.UpdateBridge ? root.UpdateBridge.getVersionName() : null;
      if (current) versionParts(current);
    } catch (_) { current = null; }
    document.getElementById('appVersion').textContent = current ? 'Versión ' + current : 'Versión: disponible en la aplicación Android';
    const btn = document.getElementById('btnCheckUpdates');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const status = document.getElementById('updateStatus');
      document.getElementById('updateLinks').replaceChildren();
      status.textContent = 'Buscando actualizaciones…';
      try {
        if (!current) throw Error('No se pudo leer la versión instalada. Abre la aplicación Android');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Error('Sin conexión a Internet');
        const info = releaseInfo(await query(), current);
        status.textContent = info.newer ? `Nueva versión disponible: ${info.version}.` : 'Ya tienes la última versión disponible.';
        if (info.newer) {
          addLink(info.release, 'Ver Release en GitHub');
          if (info.apk) addLink(info.apk, 'Descargar APK');
          else status.textContent += ' El APK todavía no está disponible; consulta el Release.';
        }
      } catch (error) { status.textContent = 'No se pudo comprobar: ' + error.message + '. Inténtalo de nuevo cuando tengas conexión.'; }
      finally { btn.disabled = false; }
    });
  }
  root.RTUpdates = {compare, trustedLink, releaseInfo, receive, init};
})(typeof window !== 'undefined' ? window : globalThis);

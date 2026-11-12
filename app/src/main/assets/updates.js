(function (root) {
  'use strict';
  const REPO = 'https://github.com/xiankaishan4-commits/Registro-Temperaturas';
  const RELEASES_API = 'https://api.github.com/repos/xiankaishan4-commits/Registro-Temperaturas/releases';
  const CHANNEL_KEY = 'rt_update_channel';
  const PAGE_SIZE = 30;
  function versionParts(version) {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    if (!match || match[0] !== version) throw Error('Versión no válida');
    const parts = match.slice(1, 4).map(Number);
    if (!parts.every(Number.isSafeInteger)) throw Error('Versión no válida');
    parts.pre = match[4] ? match[4].split('.') : [];
    if (parts.pre.some(p => /^\d+$/.test(p) && p.length > 1 && p[0] === '0')) throw Error('Versión no válida');
    return parts;
  }
  function compare(a, b) {
    const x = versionParts(a), y = versionParts(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
      const a = x.pre[i], b = y.pre[i];
      if (a === b) continue;
      if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
      const an = /^\d+$/.test(a), bn = /^\d+$/.test(b);
      if (an !== bn) return an ? -1 : 1;
      if (an && a.length !== b.length) return a.length > b.length ? 1 : -1;
      return a > b ? 1 : -1;
    }
    return 0;
  }
  function trustedLink(url, kind) {
    if (typeof url !== 'string') return false;
    return url.startsWith(REPO + '/releases/' + kind + '/') &&
      !/[\s\\?#]/.test(url) && (kind !== 'download' || url.toLowerCase().endsWith('.apk'));
  }
  function releaseInfo(release, current, beta = false) {
    if (!release || release.draft !== false || release.prerelease !== beta ||
        !trustedLink(release.html_url, 'tag')) throw Error('Respuesta de GitHub no válida');
    const prerelease = versionParts(release.tag_name).pre;
    if (beta ? prerelease[0] !== 'beta' : prerelease.length !== 0) throw Error('Respuesta de GitHub no válida');
    const newer = compare(release.tag_name, current) > 0;
    const apk = (Array.isArray(release.assets) ? release.assets : []).find(a =>
      a && a.state === 'uploaded' && a.size > 0 && trustedLink(a.browser_download_url, 'download'));
    return {newer, version:release.tag_name, release:release.html_url, apk:apk ? apk.browser_download_url : null};
  }
  let current = null, pending = null, requestId = 0;
  function receive(id, value) { if (pending && id === requestId) pending(value); }
  async function query(beta, page = 1) {
    if (root.UpdateBridge && typeof root.UpdateBridge.check === 'function') {
      return new Promise((resolve, reject) => {
        const id = ++requestId;
        const timer = setTimeout(() => { pending = null; reject(Error('Tiempo de espera agotado')); }, 25000);
        pending = result => { clearTimeout(timer); pending = null; result.error ? reject(Error(result.error)) : resolve(result); };
        try { root.UpdateBridge.check(id, beta, page); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = RELEASES_API + (beta ? '?per_page=' + PAGE_SIZE + '&page=' + page : '/latest');
      const response = await fetch(url,
        {signal:controller.signal, cache:'no-store', headers:{Accept:'application/vnd.github+json'}});
      if (!response.ok) throw Error('GitHub HTTP ' + response.status);
      const result = await response.json();
      return beta ? {releases:result} : result;
    } finally { clearTimeout(timer); }
  }
  async function checkChannel(beta) {
    if (!beta) return releaseInfo(await query(false), current);
    let latest = null;
    for (let page = 1; ; page++) {
      const {releases} = await query(true, page);
      if (!Array.isArray(releases)) throw Error('Respuesta de GitHub no válida');
      for (const release of releases) {
        let info;
        try { info = releaseInfo(release, current, true); }
        catch (_) { continue; } // Ignore stable, draft, non-Beta and invalid releases.
        if (!latest || compare(info.version, latest.version) > 0) latest = info;
      }
      if (releases.length < PAGE_SIZE) return latest;
    }
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
    const channel = document.getElementById('updateChannel');
    const status = document.getElementById('updateStatus');
    const links = document.getElementById('updateLinks');
    try { if (root.localStorage.getItem(CHANNEL_KEY) === 'beta') channel.value = 'beta'; }
    catch (_) { /* The selector still works without storage. */ }
    channel.addEventListener('change', () => {
      try { root.localStorage.setItem(CHANNEL_KEY, channel.value); }
      catch (_) { /* The current selection remains active. */ }
      status.textContent = '';
      links.replaceChildren();
    });
    btn.addEventListener('click', async () => {
      btn.disabled = channel.disabled = true;
      const beta = channel.value === 'beta';
      links.replaceChildren();
      status.textContent = 'Buscando actualizaciones…';
      try {
        if (!current) throw Error('No se pudo leer la versión instalada. Abre la aplicación Android');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Error('Sin conexión a Internet');
        const info = await checkChannel(beta);
        if (!info) {
          status.textContent = 'No hay versiones Beta publicadas.';
          return;
        }
        if (info.newer) status.textContent = `Nueva versión ${beta ? 'Beta ' : ''}disponible: ${info.version}.`;
        else if (beta) status.textContent = `No hay una actualización Beta más reciente. Última Beta: ${info.version}. Versión instalada: ${current}.`;
        else if (versionParts(current).pre.length) status.textContent = `No hay una actualización oficial más reciente. Última versión oficial: ${info.version}. Versión instalada: ${current}.`;
        else status.textContent = 'Ya tienes la última versión disponible.';
        if (info.newer) {
          addLink(info.release, 'Ver Release en GitHub');
          if (info.apk) addLink(info.apk, 'Descargar APK');
          else status.textContent += ' El APK todavía no está disponible; consulta el Release.';
        }
      } catch (error) { status.textContent = 'No se pudo comprobar: ' + error.message + '. Inténtalo de nuevo cuando tengas conexión.'; }
      finally { btn.disabled = channel.disabled = false; }
    });
  }
  root.RTUpdates = {compare, trustedLink, releaseInfo, receive, init};
})(typeof window !== 'undefined' ? window : globalThis);

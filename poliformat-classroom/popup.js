// Ventana del botón de la extensión: estado y activar/desactivar la interfaz en la pestaña
// actual, y añadir o quitar otras aulas virtuales Sakai (permiso por sitio).
const BUILT_IN = ['https://poliformat.upv.es', 'https://aulavirtual.um.es'];
const OFF_KEY = 'gc-classroom-off';
const $ = id => document.getElementById(id);
const scriptId = origin => 'site-' + origin.replace(/[^a-z0-9]/gi, '_');

// Escribe la preferencia directamente en la página y la recarga. Funciona aunque el
// script de la extensión no se haya cargado en esa pestaña (p. ej. abierta antes).
async function setOff(tabId, off) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (key, value) => { if (value) localStorage.setItem(key, '1'); else localStorage.removeItem(key); },
    args: [OFF_KEY, off],
  });
  await chrome.tabs.reload(tabId);
}

async function readOff(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: key => localStorage.getItem(key) === '1',
    args: [OFF_KEY],
  }).catch(() => [null]);
  return res ? res.result : false;
}

function showStatus(cls, text, action) {
  const el = $('status');
  el.className = 'status ' + cls;
  el.textContent = text;
  const btn = $('action');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = action.run;
  }
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try { origin = new URL(tab.url).origin; } catch { /* pestaña sin URL accesible */ }
  if (!origin || !origin.startsWith('https://')) { $('unsupported').hidden = false; return; }
  $('host').textContent = new URL(origin).hostname;

  const registered = (await chrome.scripting.getRegisteredContentScripts()).some(s => s.id === scriptId(origin));
  const enabled = BUILT_IN.includes(origin) || registered;

  if (!enabled) {
    $('off-site').hidden = false;
    $('add').addEventListener('click', async () => {
      const ok = await chrome.permissions.request({ origins: [origin + '/*'] });
      if (!ok) return;
      await chrome.scripting.registerContentScripts([{
        id: scriptId(origin),
        matches: [origin + '/*'],
        js: ['content.js'],
        css: ['boot.css'],
        runAt: 'document_start',
        persistAcrossSessions: true,
      }]);
      await chrome.tabs.reload(tab.id);
      window.close();
    });
    return;
  }

  $('on-site').hidden = false;
  const state = await chrome.tabs.sendMessage(tab.id, { type: 'gc-state' }).catch(() => null);
  const off = state ? state.off : await readOff(tab.id);

  const toggle = $('toggle');
  toggle.classList.toggle('on', !off);
  toggle.setAttribute('aria-checked', String(!off));
  toggle.addEventListener('click', async () => {
    toggle.classList.toggle('on');
    await setOff(tab.id, !off ? true : false);
    window.close();
  });

  const reload = { label: 'Recargar la página', run: async () => { await chrome.tabs.reload(tab.id); window.close(); } };
  const goHome = { label: 'Ir a la página principal', run: async () => { await chrome.tabs.update(tab.id, { url: origin + '/portal' }); window.close(); } };

  if (!state) {
    showStatus('warn', 'La extensión todavía no se ha cargado en esta pestaña (se abrió antes de instalarla o actualizarla).', reload);
  } else if (state.off) {
    showStatus('', 'Desactivada: estás viendo la interfaz original.');
  } else if (state.status === 'on') {
    showStatus('ok', 'Activa.');
  } else if (state.status === 'nologin') {
    showStatus('warn', 'El aula virtual indica que no has iniciado sesión en ella (tener abierta la intranet de tu universidad no basta). Entra con tu usuario y la interfaz aparecerá. (Detalle: ' + (state.detail || '—') + ')', reload);
  } else if (state.status === 'ruta') {
    showStatus('warn', 'Esta página no es la del portal (' + state.path + '), así que se muestra tal cual.', goHome);
  } else if (state.status === 'error') {
    showStatus('bad', 'No se pudo cargar la interfaz: ' + (state.detail || 'error desconocido') + '. Se muestra la original.', reload);
  } else {
    showStatus('', 'Cargando…', reload);
  }

  if (registered) {
    $('remove').hidden = false;
    $('remove').addEventListener('click', async () => {
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] });
      await chrome.permissions.remove({ origins: [origin + '/*'] });
      await chrome.tabs.reload(tab.id);
      window.close();
    });
  }
}

main();

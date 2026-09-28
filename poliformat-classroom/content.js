/*
 * Nueva interfaz para Sakai (PoliformaT, Aula Virtual UM…)
 * Sustituye la interfaz del portal Sakai por una al estilo de Google Classroom.
 * Los datos se leen de la API REST de Sakai (/direct/...) con la sesión del usuario.
 * Las herramientas que no se reimplementan se muestran incrustadas, con un estilo
 * adaptado para que encajen con el resto de la interfaz.
 */
(() => {
  'use strict';

  if (window.top !== window.self) return;

  const OFF_KEY = 'gc-classroom-off';
  const RAIL_KEY = 'gc-rail';

  // Estado de la extensión en esta pestaña (lo muestra el botón de la barra de Brave).
  //   on: interfaz activa · off: desactivada por el usuario · nologin: sin sesión iniciada
  //   ruta: página que no es del portal · error: fallo al montar · start: cargando
  const STATUS = { code: 'start', detail: '' };
  const setStatus = (code, detail = '') => { STATUS.code = code; STATUS.detail = String(detail || ''); };

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (!msg) return;
      if (msg.type === 'gc-state') {
        reply({ off: localStorage.getItem(OFF_KEY) === '1', status: STATUS.code, detail: STATUS.detail, path: location.pathname });
      } else if (msg.type === 'gc-set') {
        if (msg.off) localStorage.setItem(OFF_KEY, '1');
        else localStorage.removeItem(OFF_KEY);
        reply({ ok: true });
        location.reload();
      } else if (msg.type === 'gc-toggle') {
        if (localStorage.getItem(OFF_KEY) === '1') localStorage.removeItem(OFF_KEY);
        else localStorage.setItem(OFF_KEY, '1');
        location.reload();
      }
    });
  } catch { /* fuera del contexto de la extensión */ }

  const PATH = location.pathname;
  if (!/^\/portal(\/|$)/.test(PATH)) { setStatus('ruta', PATH); return; }
  // Rutas del portal que no son páginas de navegación (herramientas sueltas, login…).
  if (/^\/portal\/(tool|tool-reset|page|directtool|pda|xlogin|relogin|login|logout|help|presence|favorites|timeout)(\/|$)/.test(PATH)) { setStatus('ruta', PATH); return; }

  const SWITCH_CSS = `
    .switch{display:inline-flex;align-items:center;gap:10px;height:36px;padding:0 6px 0 12px;border:0;border-radius:18px;background:none;
      font:500 14px "Google Sans",Roboto,"Segoe UI",Arial,sans-serif;color:#3c4043;cursor:pointer;white-space:nowrap}
    .switch:hover{background:rgba(60,64,67,.08)}
    .track{position:relative;width:36px;height:14px;border-radius:7px;background:#bdc1c6;transition:background .15s;flex:none}
    .thumb{position:absolute;top:-3px;left:-2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .15s,background .15s}
    .switch.on .track{background:#8ab4f8}.switch.on .thumb{transform:translateX(20px);background:#1a73e8}`;
  const switchHtml = on => `<button type="button" class="switch${on ? ' on' : ''}" data-act="toggle" role="switch" aria-checked="${on}"
      title="${on ? 'Desactivar la nueva interfaz y volver a la vista original' : 'Activar la nueva interfaz'}">
      <span class="switch-lbl">Nueva interfaz</span><span class="track"><span class="thumb"></span></span></button>`;

  // Interruptor (apagado) en la vista original. Se inserta como un elemento más de la
  // cabecera de Sakai, justo donde empieza el grupo de la derecha (tras el elemento
  // con "me-auto"), para no tapar nada. Sin cabecera, va abajo a la izquierda.
  function addOffSwitch() {
    if (document.getElementById('gc-off-switch')) return;
    const host = document.createElement('div');
    host.id = 'gc-off-switch';
    const header = document.querySelector('header.portal-header, .Mrphs-topHeader, #portalHeader');
    const pusher = header && header.querySelector(':scope > .me-auto');
    if (header) {
      host.style.cssText = 'display:flex;align-items:center;flex:none;margin:0 8px;color:inherit';
      if (pusher) pusher.after(host);
      else header.appendChild(host);
    } else {
      host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;border-radius:18px;background:#fff;color:#3c4043;box-shadow:0 1px 3px rgba(60,64,67,.3),0 4px 8px 3px rgba(60,64,67,.15)';
      document.body.appendChild(host);
    }
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${SWITCH_CSS}
      .switch{color:inherit;font-size:13px}
      .switch:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
      @media (max-width:700px){.switch-lbl{display:none}}</style>${switchHtml(false)}`;
    const b = sh.querySelector('button');
    b.addEventListener('click', () => {
      b.classList.add('on');
      localStorage.removeItem(OFF_KEY);
      setTimeout(() => location.reload(), 180);
    });
  }

  if (localStorage.getItem(OFF_KEY) === '1') {
    setStatus('off');
    onReady(addOffSwitch);
    return;
  }

  const ROOT = document.documentElement;
  ROOT.classList.add('gc-boot');
  let mounted = false;
  const failSafe = setTimeout(() => { if (!mounted) unboot(); }, 10000);

  // ---------------------------------------------------------------- constantes

  // Dentro de la app Android «Aula Sakai» el script inyectado define window.__gcApp:
  // se usa un diseño de app nativa (barra inferior, flecha atrás…) en vez del de escritorio.
  const APP = !!window.__gcApp;

  const DAY = 864e5;
  const MONTH = 30 * DAY;
  const PALETTE = ['#1967d2', '#137333', '#e37400', '#c5221f', '#9334e6', '#007b83', '#b80672', '#1a73e8', '#0d652d', '#d56e0c', '#a50e0e', '#5f6368', '#129eaf', '#7627bb', '#185abc'];
  const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Google+Sans+Text:wght@400;500&family=Roboto:wght@400;500&display=swap';

  const TOOLS = {
    ann: ['sakai.announcements'],
    asg: ['sakai.assignment.grades', 'sakai.assignment'],
    res: ['sakai.resources'],
    roster: ['sakai.site.roster2', 'sakai.site.roster'],
    grades: ['sakai.gradebookng', 'sakai.gradebook.tool', 'sakai.gradebook.gwt.rpc'],
    tests: ['sakai.samigo'],
    lessons: ['sakai.lessonbuildertool'],
  };

  const TOOL_ICON = {
    'sakai.announcements': 'campaign',
    'sakai.assignment.grades': 'assignment',
    'sakai.assignment': 'assignment',
    'sakai.resources': 'folder',
    'sakai.dropbox': 'folder',
    'sakai.site.roster2': 'people',
    'sakai.site.roster': 'people',
    'sakai.gradebookng': 'grade',
    'sakai.gradebook.tool': 'grade',
    'sakai.schedule': 'event',
    'sakai.summary.calendar': 'event',
    'sakai.forums': 'forum',
    'sakai.chat': 'forum',
    'sakai.messages': 'mail',
    'sakai.mailbox': 'mail',
    'sakai.samigo': 'exam',
    'sakai.lessonbuildertool': 'book',
    'sakai.syllabus': 'description',
    'sakai.iframe.site': 'home',
    'sakai.iframe.myworkspace': 'home',
    'sakai.siteinfo': 'info',
    'sakai.preferences': 'info',
    'sakai.profile2': 'people',
  };

  const ICONS = {
    menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    school: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    todo: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
    assignment: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
    work: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm0 4c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm6 12H6v-1.4c0-2 4-3.1 6-3.1s6 1.1 6 3.1V19z',
    exam: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5.99 13c-.59 0-1.05-.47-1.05-1.05 0-.59.47-1.04 1.05-1.04.59 0 1.04.45 1.04 1.04-.01.58-.45 1.05-1.04 1.05zm2.5-6.17c-.63.93-1.23 1.21-1.56 1.81-.13.24-.18.4-.18 1.18h-1.52c0-.41-.06-1.08.26-1.65.41-.73 1.18-1.16 1.63-1.8.48-.68.21-1.94-1.14-1.94-.88 0-1.32.67-1.5 1.23l-1.37-.57C11.51 5.96 12.52 5 13.99 5c1.23 0 2.08.56 2.51 1.26.37.59.58 1.7.01 2.57z',
    folder: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
    file: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    campaign: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 9h-2V5h2v6zm0 4h-2v-2h2v2z',
    people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    grade: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
    event: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
    forum: 'M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z',
    mail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
    description: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    apps: 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
    attach: 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
    open: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    chevL: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    chevR: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    palette: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    starO: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    drag: 'M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
    down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    stream: 'M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z',
    expand: 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
    comment: 'M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  };

  // ---------------------------------------------------------------- utilidades

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  const domReady = () => new Promise(onReady);

  function unboot() {
    ROOT.classList.remove('gc-boot');
  }

  function loadFonts(doc) {
    if (doc.getElementById('gc-fonts')) return;
    const l = doc.createElement('link');
    l.id = 'gc-fonts';
    l.rel = 'stylesheet';
    l.href = FONTS_URL;
    (doc.head || doc.documentElement).appendChild(l);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.apps}"/></svg>`;
  const initial = name => (String(name || '?').trim().charAt(0) || '?').toUpperCase();

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  const colorFor = key => PALETTE[hash(String(key)) % PALETTE.length];

  function toDate(v) {
    if (v == null || v === '') return null;
    let d = null;
    if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
    else if (typeof v === 'string') d = /^\d+$/.test(v) ? toDate(Number(v)) : new Date(v);
    else if (typeof v === 'object') {
      if (v.epochSecond != null) d = new Date(v.epochSecond * 1000);
      else if (v.time != null) d = new Date(v.time);
    }
    return d && !isNaN(d) ? d : null;
  }
  const num = v => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  };
  const fmtNum = n => (Math.round(n * 100) / 100).toLocaleString('es-ES');

  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const DF = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const DFY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const TF = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
  const WD = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
  const WDS = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });

  // "hoy, 23:55" / "mañana, 23:55" / "viernes, 23:55" / "3 oct, 23:55"
  function fmtWhen(d) {
    const today = startOfDay(new Date());
    const diff = Math.round((startOfDay(d) - today) / DAY);
    const t = TF.format(d);
    if (diff === 0) return `hoy, ${t}`;
    if (diff === 1) return `mañana, ${t}`;
    if (diff === -1) return `ayer, ${t}`;
    if (diff > 1 && diff < 7) return `${WD.format(d)}, ${t}`;
    return `${(d.getFullYear() === new Date().getFullYear() ? DF : DFY).format(d)}, ${t}`;
  }
  function fmtDate(d) {
    if (!d) return '';
    if (startOfDay(d) === startOfDay(new Date())) return TF.format(d);
    return (d.getFullYear() === new Date().getFullYear() ? DF : DFY).format(d);
  }

  // El HTML de anuncios y enunciados viene del propio aula virtual; aun así se limpia.
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script,style,link,meta,base,object,embed,form').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(el => {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
        }
      }
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
    });
    return doc.body.innerHTML;
  }

  function avatar(uid, name, size = 32) {
    const img = uid ? `<img src="/direct/profile/${enc(uid)}/image/thumb" alt="" loading="lazy" data-fb>` : '';
    return `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;background:${colorFor(name || uid || '?')}">${esc(initial(name))}${img}</span>`;
  }

  // Cabecera ilustrada generada a partir del id de la asignatura.
  function banner(site) {
    const r = rng(hash(site.id));
    let shapes = '';
    for (let i = 0; i < 6; i++) {
      shapes += `<circle cx="${(560 + r() * 440) | 0}" cy="${(r() * 240) | 0}" r="${(18 + r() * 95) | 0}" fill="#fff" fill-opacity="${(0.05 + r() * 0.12).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 7; i++) {
      shapes += `<path d="M${(520 + r() * 460) | 0} ${(r() * 240) | 0}l${(40 + r() * 120) | 0} ${(-40 + r() * 80) | 0}" stroke="#fff" stroke-opacity=".2" stroke-width="${(2 + r() * 5) | 0}" stroke-linecap="round"/>`;
    }
    shapes += `<rect x="${(700 + r() * 200) | 0}" y="${(30 + r() * 120) | 0}" width="${(40 + r() * 60) | 0}" height="${(40 + r() * 60) | 0}" rx="8" fill="#fff" fill-opacity=".1" transform="rotate(${(r() * 40 - 20) | 0} 800 120)"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 240" preserveAspectRatio="xMaxYMid slice"><rect width="1000" height="240" fill="${site.color}"/>${shapes}</svg>`;
    return `url('data:image/svg+xml,${enc(svg)}')`;
  }

  const loading = () => '<div class="loading"><div class="spin"></div></div>';
  const empty = (title, text = '') => `<div class="empty"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  const errorBox = (msg, href) => `<div class="empty"><b>${esc(msg)}</b><div class="empty-actions">${href ? `<a class="btn" data-nav href="${href}">Abrir la herramienta</a>` : ''}<button class="btn o" data-act="toggle">Vista original</button></div></div>`;

  // Nombre y logo del aula virtual, tomados de la página original antes de ocultarla
  // ("PoliformaT : …" → PoliformaT, "Aula Virtual : …" → Aula Virtual).
  let SITE_NAME = location.hostname;
  let LOGO = '';
  let LOGO_SRC = null;
  let HEADER_BG = '';
  function findLogo() {
    const sel = ['.portal-header-logo .btn-logo', '.portal-header-logo img', '.Mrphs-headerLogo--institution', '.Mrphs-headerLogo img', '.Mrphs-headerLogo',
      '#portal-header-logo img', 'header .navbar-brand img', 'header img[alt*="logo" i]', 'header img[src*="logo" i]', 'img[src*="logo" i]'];
    for (const s of sel) {
      for (const el of document.querySelectorAll(s)) {
        if (el.tagName === 'IMG' && el.currentSrc) return el.currentSrc;
        const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
        if (m) return m[1];
      }
    }
    return null;
  }
  const logoTxt = () => `<span class="logo-txt">${esc(SITE_NAME)}</span>`;
  function initLogo() {
    const t = (document.title || '').split(/\s+[:|·–-]\s+/)[0].trim();
    if (t && t.length <= 40) SITE_NAME = t;
    try {
      const header = document.querySelector('header.portal-header, .Mrphs-topHeader, header');
      const bg = header && getComputedStyle(header).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) HEADER_BG = bg;
      LOGO_SRC = findLogo();
    } catch { /* cabecera distinta */ }
    if (LOGO_SRC) {
      // Si la imagen no carga, el manejador de errores la cambia por el texto.
      LOGO = `<img class="logo-img" src="${esc(LOGO_SRC)}" alt="${esc(SITE_NAME)}" data-logo>`;
    } else {
      const fav = document.querySelector('link[rel~="icon"]');
      LOGO = `${fav ? `<img class="logo-ico" src="${esc(fav.href)}" alt="">` : ''}${logoTxt()}`;
    }
  }
  // Logos claros (pensados para cabeceras oscuras, como el de la UM) se muestran
  // sobre una pastilla con el color de la cabecera original para que se vean.
  function checkLogoContrast() {
    if (!LOGO_SRC) return;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = Math.min(img.naturalWidth, 300);
        c.height = Math.max(1, Math.round(img.naturalHeight * c.width / img.naturalWidth));
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let n = 0, lum = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { n++; lum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; }
        if (n && lum / n > 185) {
          $app.style.setProperty('--hdr', HEADER_BG || '#202124');
          $app.classList.add('logo-light');
        }
      } catch { /* imagen de otro dominio: no se puede analizar */ }
    };
    img.src = LOGO_SRC;
  }

  // ---------------------------------------------------------------- API Sakai

  async function api(url) {
    const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  const cache = new Map();
  function memo(key, fn) {
    if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; }));
    return cache.get(key);
  }

  // Colores elegidos por el usuario para cada asignatura (se guardan en el navegador).
  const COLORS_KEY = 'gc-colors';
  function customColors() {
    try { return JSON.parse(localStorage.getItem(COLORS_KEY)) || {}; } catch { return {}; }
  }
  const siteColor = id => customColors()[id] || colorFor(id);

  // Curso académico: propiedad "term" del sitio o, si no la hay, el año del id
  // (p. ej. GRA_11546_2025 → "2025-26").
  function termOf(props, id) {
    const t = props.term || props.term_eid;
    if (t) return String(t);
    const m = String(id).match(/(?:^|[_-])(20\d\d)(?!.*20\d\d)/);
    if (!m) return '';
    const y = Number(m[1]);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  }

  function normSite(s) {
    const id = s.id || s.entityId;
    const props = s.props || {};
    const term = termOf(props, id);
    const short = s.shortDescription || '';
    return {
      id,
      title: s.title || s.entityTitle || id,
      type: s.type || '',
      term,
      sub: term || short,
      // El contacto suele ser el profesor, pero en muchos sitios es la cuenta técnica ("Sakai Administrator").
      owner: [s.contactName, s.siteOwner && s.siteOwner.userDisplayName].find(n => n && !/admin|sakai|system|sistema/i.test(n)) || '',
      color: siteColor(id),
      fav: false,
    };
  }

  const getSites = () => memo('sites', async () => {
    const [data, fav] = await Promise.all([
      api('/direct/site.json?_limit=1000'),
      api('/portal/favorites/list').catch(() => null),
    ]);
    const favs = (fav && fav.favoriteSiteIds) || [];
    syncFavsFromServer(fav);
    return (data.site_collection || [])
      .map(x => ({ ...normSite(x), fav: favs.includes(x.id || x.entityId) }))
      .filter(s => s.id && !s.id.startsWith('~') && !s.id.startsWith('!'))
      .sort((a, b) => {
        const fa = favs.indexOf(a.id), fb = favs.indexOf(b.id);
        if (fa !== fb && (fa < 0 || fb < 0)) return fa < 0 ? 1 : -1;
        if (fa !== fb) return fa - fb;
        return a.title.localeCompare(b.title, 'es');
      });
  });

  async function getSite(id) {
    const sites = await getSites().catch(() => []);
    return sites.find(s => s.id === id) || memo('site:' + id, () => api(`/direct/site/${enc(id)}.json`).then(normSite));
  }

  const getPages = id => memo('pages:' + id, async () => {
    const d = await api(`/direct/site/${enc(id)}/pages.json`);
    const arr = Array.isArray(d) ? d : (d.site_page_collection || d.page_collection || []);
    return arr.map(p => ({
      id: p.id,
      title: p.title || '',
      tools: (p.tools || []).map(t => ({ id: t.id || t.placementId, toolId: t.toolId, title: t.title })),
    })).filter(p => p.tools.length);
  });

  function findTool(pages, ids) {
    for (const p of pages) for (const t of p.tools) if (ids.includes(t.toolId)) return { ...t, pageId: p.id };
    return null;
  }

  function normAtt(x) {
    if (typeof x === 'string') {
      return { name: decodeURIComponent(x.split('/').filter(Boolean).pop() || 'Adjunto'), url: x.startsWith('/content') ? '/access' + x : x };
    }
    const ref = x.ref || x.reference || x.id || '';
    return { name: x.name || x.title || decodeURIComponent(String(ref).split('/').pop() || 'Adjunto'), url: x.url || (String(ref).startsWith('/content') ? '/access' + ref : ref) };
  }

  // Tareas y exámenes comparten el mismo formato ("trabajo").
  function normAsg(a) {
    return {
      kind: 'asg',
      id: a.id,
      title: a.title || 'Tarea',
      siteId: a.context || a.siteId || '',
      due: toDate(a.dueTime ?? a.dueDate),
      open: toDate(a.openTime ?? a.openDate),
      close: toDate(a.closeTime ?? a.closeDate),
      instructions: a.instructions || '',
      ref: a.entityReference || a.reference || '',
      atts: (a.attachments || []).map(normAtt).filter(x => x.url),
      draft: !!a.draft,
    };
  }

  function normExam(e, siteId) {
    return {
      kind: 'exam',
      id: e.publishedAssessmentId || e.id || e.entityId,
      title: e.title || 'Examen',
      siteId: e.ownerSiteId || e.context || siteId,
      due: toDate(e.dueDate ?? e.retractDate),
      open: toDate(e.startDate),
      close: toDate(e.retractDate),
      instructions: e.description || '',
      ref: '',
      atts: [],
      draft: false,
    };
  }

  const getSiteAssignments = id => memo('asg:' + id, () =>
    api(`/direct/assignment/site/${enc(id)}.json`).then(d => (d.assignment_collection || []).map(a => ({ ...normAsg(a), siteId: a.context || id }))));

  // Exámenes publicados (Samigo); solo los que tienen fecha.
  const getSiteExams = id => memo('exam:' + id, () =>
    api(`/direct/sam_pub/context/${enc(id)}.json`).then(d => {
      const arr = Array.isArray(d) ? d : (d.sam_pub_collection || d.publishedAssessment_collection || []);
      return arr.map(e => normExam(e, id)).filter(e => e.due || e.open);
    }));

  const myAssignments = () => memo('my', async () => {
    try {
      const d = await api('/direct/assignment/my.json');
      return (d.assignment_collection || []).map(normAsg);
    } catch {
      const sites = await getSites();
      const all = await Promise.allSettled(sites.map(s => getSiteAssignments(s.id)));
      return all.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    }
  });

  const allExams = () => memo('exams', async () => {
    const sites = await getSites();
    const all = await Promise.allSettled(sites.map(s => getSiteExams(s.id)));
    return all.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  });

  const myWork = () => Promise.all([myAssignments().catch(() => []), allExams().catch(() => [])])
    .then(([a, e]) => [...a, ...e].filter(w => !w.draft));

  const siteWork = id => Promise.allSettled([getSiteAssignments(id), getSiteExams(id)]).then(([a, e]) => {
    if (a.status === 'rejected' && e.status === 'rejected') throw a.reason;
    return [...(a.status === 'fulfilled' ? a.value : []), ...(e.status === 'fulfilled' ? e.value : [])];
  });

  const workIcon = w => (w.kind === 'exam' ? 'exam' : 'assignment');

  const getAnnouncements = id => memo('ann:' + id, () =>
    api(`/direct/announcement/site/${enc(id)}.json?n=100&d=3650`).then(d => (d.announcement_collection || []).map(a => ({
      id: a.id,
      title: a.title || '',
      body: a.body || '',
      author: a.createdByDisplayName || '',
      date: toDate(a.createdOn),
      atts: (a.attachments || []).map(normAtt).filter(x => x.url),
    }))));

  // Calificaciones del alumno. Se prueban, por orden:
  //  1. la tabla de notas de la propia herramienta Calificaciones (lo mismo que ve el alumno);
  //  2. la API de Sakai 23+ (/api/sites/{id}/grades);
  //  3. la API antigua (/direct/gradebook).
  // Devuelve null si no hay datos propios (p. ej. si eres profesor): se usa la herramienta.
  function parseDay(txt) {
    const m = String(txt).match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) return new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]));
    const d = txt ? new Date(txt) : null;
    return d && !isNaN(d) ? d : null;
  }
  function parseScore(txt) {
    const t = String(txt || '').replace(/\s+/g, ' ').trim();
    if (!t || /^[-–—]$/.test(t)) return { raw: null, grade: null, max: null };
    const m = t.match(/(-?\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?/);
    return { raw: t, grade: m ? num(m[1]) : null, max: m && m[2] ? num(m[2]) : /%/.test(t) ? 100 : null };
  }

  async function gradesFromTool(pages) {
    const t = findTool(pages, TOOLS.grades);
    if (!t) return null;
    const r = await fetch(`/portal/tool/${enc(t.id)}`, { credentials: 'same-origin' });
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const cellText = c => (c ? c.textContent.replace(/\s+/g, ' ').trim() : '');
    for (const table of doc.querySelectorAll('table')) {
      const headRow = table.querySelector('thead tr') || table.querySelector('tr');
      if (!headRow) continue;
      const heads = [...headRow.children].map(c => cellText(c).toLowerCase());
      // Cada columna se asigna una sola vez ("Elemento de calificación" no es la de la nota).
      const used = new Set();
      const col = re => {
        const i = heads.findIndex((h, k) => !used.has(k) && re.test(h));
        if (i >= 0) used.add(i);
        return i;
      };
      const cName = col(/elemento|t[ií]tulo|item|title|nombre|element|activ|tarea/);
      const cGrade = col(/nota|calificaci|qualificaci|grade|score|puntuaci/);
      if (cName < 0 || cGrade < 0) continue;
      const cDue = col(/fecha|due|venc|l[ií]mite|data/);
      const cCom = col(/coment|comment|observ/);
      const cCat = col(/categor/);
      const items = [];
      let cat = '';
      const rows = table.tBodies.length ? [...table.tBodies].flatMap(b => [...b.rows]) : [...table.rows].slice(1);
      for (const tr of rows) {
        const cells = [...tr.children];
        if (cells.length <= Math.max(cName, cGrade)) { cat = cellText(tr).slice(0, 80); continue; } // fila de categoría
        const nameCell = cells[cName];
        const name = cellText(nameCell.querySelector('a, .gb-summary-assignment-title, span') || nameCell) || cellText(nameCell);
        if (!name) continue;
        const sc = parseScore(cellText(cells[cGrade]));
        items.push({
          name: name.slice(0, 200), ...sc,
          comment: cCom >= 0 ? cellText(cells[cCom]) : '',
          due: cDue >= 0 ? parseDay(cellText(cells[cDue])) : null,
          cat: (cCat >= 0 ? cellText(cells[cCat]) : '') || cat,
        });
      }
      if (items.length) return items;
    }
    return null;
  }

  function normGradeItem(g) {
    const score = g.score ?? g.grade ?? g.pointsEarned ?? g.displayGrade ?? null;
    return {
      name: g.name || g.itemName || g.title || g.assignmentName || 'Elemento',
      raw: score == null ? null : String(score),
      grade: num(score),
      max: num(g.points ?? g.pointsPossible ?? g.maxPoints ?? g.total ?? g.outOf),
      userId: g.userId,
      comment: g.comment || g.comments || '',
      due: toDate(g.dueDate ?? g.dueTime),
      cat: g.categoryName || g.category || '',
      canGrade: !!(g.canGrade || g.instructor),
      siteId: g.siteId,
    };
  }

  async function gradesFromApi(id) {
    let d;
    try { d = await api(`/api/sites/${enc(id)}/grades`); } catch {
      const all = await api('/api/users/me/grades');
      d = (Array.isArray(all) ? all : all.grades || []).filter(g => g.siteId === id);
    }
    const list = (Array.isArray(d) ? d : d.grades || d.items || []).map(normGradeItem);
    if (!list.length || list.some(i => i.canGrade)) return null;
    return list;
  }

  async function gradesFromDirect(id) {
    const d = await api(`/direct/gradebook/site/${enc(id)}.json`);
    let list = (d.assignments || d.gradeItems || d.items || (Array.isArray(d) ? d : [])).map(normGradeItem);
    const users = new Set(list.map(i => i.userId).filter(Boolean));
    if (users.size > 1) list = list.filter(i => i.userId === S.user.id);
    return list.length ? list : null;
  }

  const getGrades = (id, pages) => memo('grades:' + id, async () => {
    for (const source of [() => gradesFromTool(pages), () => gradesFromApi(id), () => gradesFromDirect(id)]) {
      try {
        const items = await source();
        if (items && items.length) return items;
      } catch { /* se prueba la siguiente fuente */ }
    }
    return null;
  });

  // Recursos: lista plana de /direct/content → carpetas de primer nivel ("temas").
  const getResources = id => memo('res:' + id, async () => {
    const d = await api(`/direct/content/site/${enc(id)}.json`);
    const rootPath = `/group/${id}/`;
    const folders = new Map();
    const rootFiles = [];
    const folder = (key, title) => {
      if (!folders.has(key)) folders.set(key, { title: title || key, items: [] });
      else if (title) folders.get(key).title = title;
      return folders.get(key);
    };
    for (const it of d.content_collection || []) {
      let p;
      try { p = decodeURIComponent(new URL(it.url, location.origin).pathname).replace(/^\/access\/content/, ''); } catch { continue; }
      if (!p.startsWith(rootPath) || p === rootPath) continue;
      const parts = p.slice(rootPath.length).split('/').filter(Boolean);
      if (it.type === 'collection' || p.endsWith('/')) {
        if (parts.length === 1) folder(parts[0], it.title);
        continue;
      }
      const file = {
        title: it.title || parts[parts.length - 1],
        url: it.url,
        date: toDate(it.modifiedDate),
        link: /url/i.test(it.type || ''),
        path: parts.slice(1, -1).join(' / '),
      };
      if (parts.length === 1) rootFiles.push(file);
      else folder(parts[0]).items.push(file);
    }
    const byTitle = (a, b) => (a.path + a.title).localeCompare(b.path + b.title, 'es', { numeric: true });
    rootFiles.sort(byTitle);
    const list = [...folders.values()].sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true }));
    list.forEach(f => f.items.sort(byTitle));
    return { rootFiles, folders: list };
  });

  // ---------------------------------------------------------------- rutas

  const siteHref = (id, tab) => `/portal/site/${enc(id)}${tab && tab !== 'stream' ? `#gc/${tab}` : ''}`;
  const toolHref = (siteId, t) => `/portal/site/${enc(siteId)}/tool/${enc(t.id)}`;
  const pageHref = (siteId, p) => (p.tools.length === 1 ? toolHref(siteId, p.tools[0]) : `/portal/site/${enc(siteId)}/page/${enc(p.id)}`);
  const pageIcon = p => TOOL_ICON[p.tools[0] && p.tools[0].toolId] || 'apps';

  function workHref(site, pages, w) {
    if (w.kind === 'exam') {
      const t = findTool(pages, TOOLS.tests);
      return t ? toolHref(site.id, t) : siteHref(site.id, 'classwork');
    }
    const t = findTool(pages, TOOLS.asg);
    if (!t) return siteHref(site.id, 'classwork');
    const ref = w.ref || `/assignment/a/${w.siteId || site.id}/${w.id}`;
    return `${toolHref(site.id, t)}?assignmentReference=${enc(ref)}&sakai_action=doView_submission`;
  }

  function route() {
    let p = location.pathname.replace(/\/+$/, '');
    try { p = decodeURIComponent(p); } catch { /* ruta ya decodificada */ }
    const h = location.hash;
    const m = p.match(/^\/portal\/site\/([^/]+)(?:\/(tool|page)\/([^/]+))?/);
    if (m && m[1].startsWith('!')) return { view: 'home' }; // sitios especiales (portada pública…)
    if (m) {
      if (m[2]) return { view: 'tool', siteId: m[1], kind: m[2], ref: m[3] };
      if (!m[1].startsWith('~')) return { view: 'class', siteId: m[1], tab: (h.match(/^#gc\/(\w+)/) || [])[1] || 'stream' };
    }
    if (h.startsWith('#gc/todo')) return { view: 'todo' };
    if (h.startsWith('#gc/calendar')) return { view: 'calendar' };
    return { view: 'home' };
  }

  const routable = path => /^\/portal(\/site\/.*)?\/?$/.test(path);

  function go(href) {
    const u = new URL(href, location.href);
    if (u.origin !== location.origin || !routable(u.pathname)) { location.href = u.href; return; }
    if (u.href !== location.href) history.pushState(null, '', u.href);
    render();
  }

  // ---------------------------------------------------------------- arranque

  let shadow, $app, $top, $main, $drawer, $menu, $bottom;
  const S = {};
  let calOffset = 0;

  start();

  // Usuario con sesión iniciada. Primero la API de Sakai; si no responde con un usuario,
  // se lee de la propia página (Sakai 23+ pone el id en la cabecera y en la configuración
  // del portal). USER_DIAG guarda lo ocurrido para mostrarlo en el botón de la extensión.
  let USER_DIAG = '';
  async function userFromApi() {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch('/direct/user/current.json', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
        USER_DIAG = `current.json: HTTP ${r.status}`;
        if (r.ok) {
          const u = await r.json();
          if (u && u.id) return u;
          USER_DIAG += ' sin usuario';
        }
      } catch (e) { USER_DIAG = `current.json: ${e.message}`; }
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  }
  function userFromPage() {
    if (document.body && document.body.classList.contains('is-logged-out')) return null;
    let id = '', name = '';
    const el = document.querySelector('[user-id], [data-user-id], [data-userid]');
    if (el) id = el.getAttribute('user-id') || el.getAttribute('data-user-id') || el.getAttribute('data-userid') || '';
    const text = [...document.scripts].filter(x => !x.src).map(x => x.textContent).join('\n');
    if (!id) {
      const m = text.match(/["']?user["']?\s*[:=]\s*\{[^}]*?["']?id["']?\s*:\s*["']([^"']+)["']/)
        || text.match(/["']?(?:userId|currentUserId)["']?\s*[:=]\s*["']([^"']{3,})["']/);
      if (m) id = m[1];
    }
    const n = text.match(/["']?(?:userDisplayName|displayName)["']?\s*:\s*["']([^"']+)["']/);
    if (n) name = n[1];
    return id ? { id, displayName: name } : null;
  }

  async function start() {
    let user = await userFromApi();
    await domReady();
    if (!user) user = userFromPage();
    if (!user) {
      const out = document.body && document.body.classList.contains('is-logged-out');
      setStatus('nologin', `${USER_DIAG}${out ? ' · la página indica que no hay sesión' : ' · no se encontró el usuario en la página'}`);
      unboot();
      return;
    }
    S.user = { id: user.id, name: user.displayName || user.eid || '' };
    // La portada pública (/portal/site/!gateway…) se trata como la página principal.
    if (/^\/portal\/site\/!/.test(location.pathname)) history.replaceState(null, '', '/portal');
    try {
      mount();
      setStatus('on');
    } catch (err) {
      setStatus('error', err && err.message);
      console.error('[Nueva interfaz Sakai] No se pudo montar la interfaz', err);
      const host = document.getElementById('gc-root');
      if (host) host.remove();
      ROOT.classList.remove('gc-on');
      unboot();
      addOffSwitch();
    }
  }

  function mount() {
    initLogo();
    loadFonts(document);
    setTimeout(checkLogoContrast, 0);

    const host = document.createElement('div');
    host.id = 'gc-root';
    shadow = host.attachShadow({ mode: 'open' });

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = chrome.runtime.getURL('app.css');
    shadow.appendChild(css);

    $app = document.createElement('div');
    $app.className = 'app';
    if (localStorage.getItem(RAIL_KEY) === '1') $app.classList.add('rail');
    if (APP) $app.classList.add('app-mode');
    $app.innerHTML = '<header class="topbar"></header><div class="scrim" data-act="drawer-close"></div><nav class="drawer"></nav><main class="main"></main><nav class="bottomnav"></nav><div class="menu" hidden></div>';
    shadow.appendChild($app);
    $top = $app.querySelector('.topbar');
    $main = $app.querySelector('.main');
    $drawer = $app.querySelector('.drawer');
    $menu = $app.querySelector('.menu');
    $bottom = $app.querySelector('.bottomnav');
    setupDrawerDnd();
    // Botón atrás de Android: primero cierra menús y el menú lateral.
    window.__gcBack = () => {
      if ($menu && !$menu.hidden) { closeMenu(); return true; }
      if ($app.classList.contains('drawer-open')) { closeDrawer(); return true; }
      return false;
    };

    document.body.appendChild(host);

    const show = () => {
      if (mounted) return;
      mounted = true;
      clearTimeout(failSafe);
      ROOT.classList.add('gc-on');
      ROOT.classList.remove('gc-boot');
    };
    css.addEventListener('load', show);
    css.addEventListener('error', show);
    setTimeout(show, 1500);

    shadow.addEventListener('click', onClick);
    shadow.addEventListener('change', e => {
      if (e.target.dataset.change === 'cls') {
        sessionStorage.setItem('gc-cls', e.target.value);
        render();
      } else if (e.target.dataset.change === 'sideterm') {
        localStorage.setItem(SIDE_TERM_KEY, e.target.value);
        buildDrawer();
      }
    });
    // Foto de perfil inexistente → se queda la inicial.
    shadow.addEventListener('error', e => {
      if (e.target.tagName === 'IMG' && e.target.hasAttribute('data-fb')) e.target.remove();
      if (e.target.tagName === 'IMG' && e.target.hasAttribute('data-logo')) {
        LOGO = logoTxt();
        e.target.outerHTML = LOGO;
      }
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeDrawer(); } });
    window.addEventListener('popstate', render);

    render();
    buildDrawer();
  }

  const isNarrow = () => window.matchMedia('(max-width: 999px)').matches;

  async function onClick(e) {
    const el = e.target.closest && e.target.closest('[data-nav],[data-act]');
    if (!el || (!el.closest('.menu') && !['apps', 'colors', 'sitemenu'].includes(el.dataset.act))) closeMenu();
    if (el && el.closest('.menu') && el.dataset.act === 'fav') closeMenu();
    if (!el) return;

    if (el.hasAttribute('data-nav')) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      go(el.getAttribute('href'));
      return;
    }

    switch (el.dataset.act) {
      case 'drawer':
        if (isNarrow()) $app.classList.toggle('drawer-open');
        else localStorage.setItem(RAIL_KEY, $app.classList.toggle('rail') ? '1' : '0');
        break;
      case 'drawer-close': closeDrawer(); break;
      case 'back':
        if (history.length > 1) history.back();
        else go('/portal');
        break;
      case 'drawer-edit':
        drawerEditing = !drawerEditing;
        $drawer.classList.toggle('editing', drawerEditing);
        el.classList.toggle('on', drawerEditing);
        break;
      case 'favmove': moveFav(el.dataset.site, Number(el.dataset.dir)); break;
      case 'toggle':
        localStorage.setItem(OFF_KEY, '1');
        shadow.querySelectorAll('.switch').forEach(s => { s.classList.remove('on'); s.setAttribute('aria-checked', 'false'); });
        setTimeout(() => location.reload(), 180);
        break;
      case 'apps': openSiteMenu(el, { tools: true }); break;
      case 'colors': e.preventDefault(); openSiteMenu(el, { colors: true }); break;
      case 'sitemenu': openSiteMenu(el, { colors: true, tools: true }); break;
      case 'setcolor': setColor(el.dataset.site, el.dataset.color); closeMenu(); break;
      case 'fav': e.preventDefault(); toggleFav(el.dataset.site); break;
      case 'term':
        localStorage.setItem(SIDE_TERM_KEY, el.dataset.term);
        buildDrawer();
        render();
        break;
      case 'more':
        el.nextElementSibling.hidden = false;
        el.remove();
        break;
      case 'week':
        calOffset = el.dataset.d === '0' ? 0 : calOffset + Number(el.dataset.d);
        render();
        break;
      case 'scroll': {
        const t = el.dataset.target ? shadow.getElementById(el.dataset.target) : null;
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
        el.parentElement.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        break;
      }
      case 'opentool': {
        const pages = await getPages(el.dataset.site).catch(() => []);
        const t = findTool(pages, TOOLS[el.dataset.tool] || []);
        go(t ? toolHref(el.dataset.site, t) : siteHref(el.dataset.site));
        break;
      }
    }
  }

  function closeDrawer() { $app.classList.remove('drawer-open'); }
  function closeMenu() { if ($menu) $menu.hidden = true; }

  // Menú de una asignatura: paleta de colores y/o lista de herramientas.
  let menuFor = null;
  async function openSiteMenu(btn, { colors = false, tools = false }) {
    if (!$menu.hidden && menuFor === btn) { closeMenu(); return; }
    menuFor = btn;
    const siteId = btn.dataset.site || route().siteId;
    let html = '';
    if (colors && tools) {
      const sites = await getSites().catch(() => []);
      const isFav = favIds(sites).includes(siteId);
      html += `<button class="menu-btn fav-btn" data-act="fav" data-site="${esc(siteId)}">${icon(isFav ? 'star' : 'starO')}${isFav ? 'Quitar de favoritas' : 'Añadir a favoritas'}</button><div class="menu-sep"></div>`;
    }
    if (colors) {
      const cur = siteColor(siteId);
      html += `<div class="menu-h">Color de la asignatura</div>
        <div class="swatches">${PALETTE.map(c => `<button class="sw${c === cur ? ' on' : ''}" style="background:${c}" data-act="setcolor" data-site="${esc(siteId)}" data-color="${c}" title="Usar este color"></button>`).join('')}</div>
        ${customColors()[siteId] ? `<button class="menu-btn" data-act="setcolor" data-site="${esc(siteId)}" data-color="">Restablecer el color original</button>` : ''}`;
    }
    if (tools) {
      const pages = await getPages(siteId).catch(() => []);
      html += (colors ? '<div class="menu-sep"></div><div class="menu-h">Herramientas</div>' : '') + (pages.length
        ? pages.map(p => `<a data-nav href="${pageHref(siteId, p)}">${icon(pageIcon(p))}<span>${esc(p.title)}</span></a>`).join('')
        : '<div class="muted pad">No hay herramientas</div>');
    }
    $menu.innerHTML = html;
    $menu.hidden = false;
    const rect = btn.getBoundingClientRect();
    const h = $menu.offsetHeight;
    $menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - h - 8))}px`;
    if (rect.left < window.innerWidth / 2) { $menu.style.left = `${Math.max(8, rect.left)}px`; $menu.style.right = ''; }
    else { $menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`; $menu.style.left = ''; }
  }

  async function setColor(siteId, color) {
    const map = customColors();
    if (color) map[siteId] = color;
    else delete map[siteId];
    localStorage.setItem(COLORS_KEY, JSON.stringify(map));
    const sites = await getSites().catch(() => []);
    const s = sites.find(x => x.id === siteId);
    if (s) s.color = siteColor(siteId);
    buildDrawer();
    render({ keep: true });
  }

  // ---------------------------------------------------------------- estructura

  // Barra superior: ☰  logo  ›  asignatura            [Nueva interfaz ●]  ⋮⋮⋮  (avatar)
  function setTop({ site = null, crumb = null, sub = null } = {}) {
    $app.style.setProperty('--c', site ? site.color : '#1967d2');
    let crumbHtml = '';
    if (site) {
      const subtitle = sub ?? site.sub;
      crumbHtml = `<span class="crumb-sep">${icon('chevR')}</span>
        <a class="crumb" data-nav href="${siteHref(site.id)}"><span class="t1">${esc(site.title)}</span>${subtitle ? `<span class="t2">${esc(subtitle)}</span>` : ''}</a>`;
    } else if (crumb) {
      crumbHtml = `<span class="crumb-sep">${icon('chevR')}</span><span class="crumb"><span class="t1">${esc(crumb)}</span></span>`;
    }
    $top.classList.toggle('has-crumb', !!crumbHtml);
    const lead = APP && (site || crumb)
      ? `<button class="ibtn" data-act="back" title="Atrás">${icon('back')}</button>`
      : `<button class="ibtn" data-act="drawer" title="Menú principal">${icon('menu')}</button>`;
    $top.innerHTML = `
      ${lead}
      <a class="brand" data-nav href="/portal">${LOGO}</a>
      ${crumbHtml}
      <div class="top-right">
        ${APP ? '' : switchHtml(true)}
        ${site && !site.id.startsWith('~') ? `<button class="ibtn" data-act="apps" title="Todas las herramientas de la asignatura">${icon(APP ? 'more' : 'apps')}</button>` : ''}
        ${APP && site ? '' : `<span class="me" title="${esc(S.user.name)}">${avatar(S.user.id, S.user.name, 32)}</span>`}
      </div>`;
  }

  const TABS = [['stream', 'Tablón'], ['classwork', 'Trabajo de clase'], ['people', 'Personas'], ['grades', 'Calificaciones']];
  const TAB_ICONS = { stream: 'stream', classwork: 'assignment', people: 'people', grades: 'grade' };
  const TAB_SHORT = { stream: 'Tablón', classwork: 'Trabajo', people: 'Personas', grades: 'Notas' };
  function tabBar(site, active) {
    if (APP) {
      $bottom.innerHTML = TABS.map(([k]) => `
        <a data-nav href="${siteHref(site.id, k)}" class="bn${k === active ? ' on' : ''}">
          <span class="bn-ico">${icon(TAB_ICONS[k])}</span><span class="bn-lbl">${TAB_SHORT[k]}</span></a>`).join('');
      $app.classList.add('has-bottom');
      return '';
    }
    return `<nav class="tabbar">${TABS.map(([k, label]) =>
      `<a data-nav href="${siteHref(site.id, k)}" class="tab${k === active ? ' on' : ''}">${label}</a>`).join('')}</nav>`;
  }

  const SIDE_TERM_KEY = 'gc-side-term';
  const MORE_KEY = 'gc-side-more';
  const FAVS_KEY = 'gc-favs';

  const FAVS_SYNCED_KEY = 'gc-favs-synced';

  // Favoritas: son las asignaturas «fijadas» de Sakai (/portal/favorites), así que se
  // comparten entre el ordenador, el móvil y la propia web de Sakai. El orden también.
  // La primera vez, lo que se hubiera marcado solo en este navegador se sube a Sakai.
  function syncFavsFromServer(fav) {
    const server = fav && Array.isArray(fav.favoriteSiteIds) ? fav.favoriteSiteIds : null;
    if (!server) return;
    S.favPayload = fav;
    let local = null;
    try { local = JSON.parse(localStorage.getItem(FAVS_KEY)); } catch { /* sin datos locales */ }
    // La app Android nunca sube su lista antigua: manda lo que haya en Sakai (lo marcado en el PC).
    if (!APP && Array.isArray(local) && localStorage.getItem(FAVS_SYNCED_KEY) !== '1') {
      S.favs = local;
      pushFavs(local);
    } else {
      S.favs = server.slice();
      localStorage.setItem(FAVS_KEY, JSON.stringify(S.favs));
      localStorage.setItem(FAVS_SYNCED_KEY, '1');
    }
  }

  let pushTimer = null;
  function pushFavs(ids) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        const cur = await api(`/portal/favorites/list?_${Date.now()}`).catch(() => S.favPayload || {});
        const body = new URLSearchParams();
        body.append('userFavorites', JSON.stringify({ ...cur, favoriteSiteIds: ids }));
        const r = await fetch('/portal/favorites/update', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        localStorage.setItem(FAVS_SYNCED_KEY, '1');
      } catch (err) {
        console.warn('[Nueva interfaz Sakai] No se pudieron guardar las favoritas en Sakai', err);
      }
    }, 500);
  }

  // Lista ordenada de ids de asignaturas favoritas.
  function favIds(sites) {
    if (S.favs) return S.favs;
    try {
      const v = JSON.parse(localStorage.getItem(FAVS_KEY));
      if (Array.isArray(v)) return v;
    } catch { /* valor corrupto: se vuelve a importar */ }
    return sites.filter(x => x.fav).map(x => x.id);
  }
  function saveFavs(ids) {
    S.favs = ids.slice();
    localStorage.setItem(FAVS_KEY, JSON.stringify(S.favs));
    pushFavs(S.favs);
  }

  // Mover una favorita arriba/abajo (modo edición del menú lateral, pensado para pantallas táctiles).
  let drawerEditing = false;
  async function moveFav(siteId, dir) {
    const visible = [...$drawer.querySelectorAll('.dn-row.dfav')].map(r => r.dataset.site);
    const i = visible.indexOf(siteId), j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    [visible[i], visible[j]] = [visible[j], visible[i]];
    const sites = await getSites().catch(() => []);
    const favs = favIds(sites).slice();
    const slots = favs.map((id, k) => (visible.includes(id) ? k : -1)).filter(k => k >= 0);
    slots.forEach((slot, k) => { favs[slot] = visible[k]; });
    saveFavs(favs);
    buildDrawer();
    if (route().view === 'home') render({ keep: true });
  }

  // Ordena: primero las favoritas en su orden, luego el resto alfabéticamente.
  function byFavs(list, favs) {
    const pos = new Map(favs.map((id, i) => [id, i]));
    return [...list].sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id) : Infinity, pb = pos.has(b.id) ? pos.get(b.id) : Infinity;
      return pa !== pb ? pa - pb : a.title.localeCompare(b.title, 'es');
    });
  }

  async function toggleFav(siteId) {
    const sites = await getSites().catch(() => []);
    const favs = favIds(sites).slice();
    const i = favs.indexOf(siteId);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(siteId);
    saveFavs(favs);
    buildDrawer();
    if (route().view === 'home') render({ keep: true });
  }

  // Arrastrar y soltar para reordenar las favoritas del menú lateral.
  let dragRow = null;
  function setupDrawerDnd() {
    $drawer.addEventListener('dragstart', e => {
      const row = e.target.closest && e.target.closest('.dn-row.dfav');
      if (!row) return;
      dragRow = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.site);
    });
    $drawer.addEventListener('dragover', e => {
      if (!dragRow) return;
      const over = e.target.closest && e.target.closest('.dn-row.dfav');
      e.preventDefault();
      if (!over || over === dragRow) return;
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(dragRow, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    });
    $drawer.addEventListener('drop', e => { if (dragRow) e.preventDefault(); });
    $drawer.addEventListener('dragend', async () => {
      if (!dragRow) return;
      dragRow.classList.remove('dragging');
      dragRow = null;
      // Nuevo orden de las visibles, respetando la posición de las favoritas de otros cursos.
      const visible = [...$drawer.querySelectorAll('.dn-row.dfav')].map(r => r.dataset.site);
      const sites = await getSites().catch(() => []);
      const favs = favIds(sites).slice();
      const slots = favs.map((id, i) => (visible.includes(id) ? i : -1)).filter(i => i >= 0);
      slots.forEach((slot, k) => { favs[slot] = visible[k]; });
      saveFavs(favs);
      if (route().view === 'home') render({ keep: true });
    });
  }

  async function buildDrawer() {
    const [sites, ws] = await Promise.all([
      getSites().catch(() => []),
      getPages('~' + S.user.id).catch(() => []),
    ]);
    const item = (href, key, ic, label, sub = '') => `
      <a class="dn" data-nav href="${href}" data-key="${esc(key)}" title="${esc(label)}">${ic}
        <span class="lbl"><span class="dn-t">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>`;
    const favList = favIds(sites);
    const siteItem = s => {
      const fav = favList.includes(s.id);
      return `
      <div class="dn-row${fav ? ' dfav' : ''}" data-site="${esc(s.id)}"${fav ? ' draggable="true"' : ''}>
        ${fav ? `<span class="dn-drag" title="Arrastra para reordenar">${icon('drag')}</span>` : ''}
        ${item(siteHref(s.id), s.id, `<span class="dav" style="background:${s.color}">${esc(initial(s.title))}</span>`, s.title, s.sub).replace('<a ', '<a draggable="false" ')}
        <span class="dn-actions">
          ${fav ? `<button class="dn-act dn-move" data-act="favmove" data-dir="-1" data-site="${esc(s.id)}" title="Subir">${icon('up')}</button>
          <button class="dn-act dn-move" data-act="favmove" data-dir="1" data-site="${esc(s.id)}" title="Bajar">${icon('down')}</button>` : ''}
          <button class="dn-act${fav ? ' on' : ''}" data-act="fav" data-site="${esc(s.id)}" title="${fav ? 'Quitar de favoritas' : 'Añadir a favoritas'}">${icon(fav ? 'star' : 'starO')}</button>
          <button class="dn-act" data-act="colors" data-site="${esc(s.id)}" title="Cambiar el color de ${esc(s.title)}">${icon('palette')}</button>
        </span>
      </div>`;
    };

    // Curso académico que se muestra (por defecto, el más reciente).
    const terms = [...new Set(sites.map(s => s.term).filter(Boolean))].sort().reverse();
    let term = localStorage.getItem(SIDE_TERM_KEY) || terms[0] || 'all';
    if (term !== 'all' && !terms.includes(term)) term = terms[0] || 'all';
    const inTerm = term === 'all' ? sites : sites.filter(s => s.term === term);
    // Favoritas (en su orden) a la vista; el resto, dentro de "Mostrar más".
    const favs = byFavs(inTerm.filter(s => favList.includes(s.id)), favList);
    const rest = byFavs(inTerm.filter(s => !favList.includes(s.id)), []);
    const moreOpen = sessionStorage.getItem(MORE_KEY) === '1';

    $drawer.innerHTML = `
      ${item('/portal', 'home', icon('home'), 'Página principal')}
      ${item('/portal#gc/calendar', 'calendar', icon('event'), 'Calendario')}
      <div class="dsep"></div>
      <div class="dh" title="Inscrito">${icon('school')}<span class="lbl">Inscrito</span>
        <button class="dh-edit lbl${drawerEditing ? ' on' : ''}" data-act="drawer-edit" title="Editar favoritas, orden y colores">${icon('edit')}<span>Editar</span></button></div>
      ${item('/portal#gc/todo', 'todo', icon('todo'), 'Pendientes')}
      ${terms.length ? `<div class="dterm lbl"><select class="sel dsel" data-change="sideterm" aria-label="Curso académico">
        ${terms.map(t => `<option value="${esc(t)}"${t === term ? ' selected' : ''}>Curso ${esc(t)}</option>`).join('')}
        <option value="all"${term === 'all' ? ' selected' : ''}>Todos los cursos</option>
      </select></div>` : ''}
      ${!inTerm.length ? '<div class="dhint lbl">No hay asignaturas en este curso.</div>'
        : !favs.length ? '<div class="dhint lbl">Pulsa ☆ en una asignatura de "Mostrar más" para tenerla siempre a la vista.</div>' : ''}
      ${favs.map(siteItem).join('')}
      ${rest.length ? `<details class="dmore"${moreOpen || !favs.length ? ' open' : ''}>
        <summary class="dn" title="Mostrar más">${icon('expand')}<span class="lbl"><span class="more-closed">Mostrar más (${rest.length})</span><span class="more-open">Mostrar menos</span></span></summary>
        ${rest.map(siteItem).join('')}
      </details>` : ''}
      ${ws.length ? `<div class="dsep"></div><div class="dh" title="Mi espacio">${icon('home')}<span class="lbl">Mi espacio</span></div>
        ${ws.map(p => item(pageHref('~' + S.user.id, p), p.id, icon(pageIcon(p)), p.title)).join('')}` : ''}
      ${APP ? `<div class="dsep"></div><div class="dswitch">${switchHtml(true)}</div>` : ''}`;
    $drawer.classList.toggle('editing', drawerEditing);
    const more = $drawer.querySelector('.dmore');
    if (more) more.addEventListener('toggle', () => sessionStorage.setItem(MORE_KEY, more.open ? '1' : '0'));
    highlightDrawer(route());
  }

  function highlightDrawer(r) {
    const key = r.view === 'class' || r.view === 'tool' ? r.siteId : r.view;
    $drawer.querySelectorAll('.dn').forEach(a => a.classList.toggle('on', a.dataset.key === key));
  }

  function clsSelect(sites, cls) {
    return `<select class="sel" data-change="cls" aria-label="Filtrar por clase">
      <option value="all">Todas las clases</option>
      ${sites.map(s => `<option value="${esc(s.id)}"${s.id === cls ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}
    </select>`;
  }
  function currentCls(sites) {
    const c = sessionStorage.getItem('gc-cls') || 'all';
    return sites.some(s => s.id === c) ? c : 'all';
  }

  // ---------------------------------------------------------------- render

  let seqCounter = 0;
  let current = 0;
  const stale = seq => seq !== current;
  const q = sel => $main.querySelector(sel);

  // keep: repintar la vista actual sin cerrar el menú lateral ni volver arriba
  // (al marcar favoritas, reordenar o cambiar colores desde el menú).
  async function render(opts) {
    const keep = !!(opts && opts.keep === true);
    const seq = current = ++seqCounter;
    const r = route();
    closeMenu();
    if (!keep) closeDrawer();
    highlightDrawer(r);
    $app.classList.remove('has-bottom');
    const y = window.scrollY;
    if (!keep) {
      $main.innerHTML = loading();
      window.scrollTo(0, 0);
    }
    try {
      if (r.view === 'home') await viewHome(seq);
      else if (r.view === 'todo') await viewTodo(seq);
      else if (r.view === 'calendar') await viewCalendar(seq);
      else if (r.view === 'class') await viewClass(r, seq);
      else await viewTool(r, seq);
      if (keep) window.scrollTo(0, y);
    } catch (err) {
      console.error('[Nueva interfaz Sakai]', err);
      if (!stale(seq)) $main.innerHTML = errorBox(`No se pudo cargar esta página (${err.message}).`);
    }
  }

  // ---- Página principal: tarjetas de clases

  async function viewHome(seq) {
    setTop();
    document.title = SITE_NAME;
    const sites = await getSites();
    if (stale(seq)) return;
    if (!sites.length) { $main.innerHTML = empty('No estás inscrito en ninguna asignatura'); return; }

    // Mismo curso que el menú lateral; solo las favoritas (si no hay ninguna, todas con un aviso).
    const terms = [...new Set(sites.map(s => s.term).filter(Boolean))].sort().reverse();
    let term = localStorage.getItem(SIDE_TERM_KEY) || terms[0] || 'all';
    if (term !== 'all' && !terms.includes(term)) term = terms[0] || 'all';
    const favList = favIds(sites);
    const inTerm = term === 'all' ? sites : sites.filter(s => s.term === term);
    const favs = byFavs(inTerm.filter(s => favList.includes(s.id)), favList);
    const shown = favs.length ? favs : byFavs(inTerm, []);
    const hint = !inTerm.length ? 'No hay asignaturas en este curso.'
      : !favs.length ? 'Aún no tienes asignaturas favoritas en este curso, así que se muestran todas. Márcalas con ☆ (menú ⋮ de cada tarjeta o «Editar» en el menú lateral) para ver solo esas.' : '';
    const groups = [['', shown]];

    const card = s => `
      <li class="card" style="--c:${s.color}">
        <div class="card-head" style="background-image:${banner(s)}">
          <a class="card-title" data-nav href="${siteHref(s.id)}">${esc(s.title)}</a>
          <a class="card-sub" data-nav href="${siteHref(s.id)}">${esc(s.sub)}</a>
          ${s.owner ? `<span class="card-owner">${esc(s.owner)}</span>` : ''}
          <button class="card-more" data-act="sitemenu" data-site="${esc(s.id)}" title="Color y herramientas de la asignatura">${icon('more')}</button>
        </div>
        <span class="card-av" style="background:${colorFor(s.owner || s.id + 'x')}">${esc(initial(s.owner || s.title))}</span>
        <div class="card-body" data-site="${esc(s.id)}"></div>
        <div class="card-foot">
          <a class="ibtn" data-nav href="${siteHref(s.id, 'grades')}" title="Abrir tu trabajo de &quot;${esc(s.title)}&quot;">${icon('work')}</a>
          <button class="ibtn" data-act="opentool" data-site="${esc(s.id)}" data-tool="res" title="Abrir la carpeta de recursos de &quot;${esc(s.title)}&quot;">${icon('folder')}</button>
        </div>
      </li>`;

    $main.innerHTML = `
      <div class="home">
        ${terms.length > 1 ? `<div class="chips">${[...terms, 'all'].map(t => `<button class="chip${t === term ? ' on' : ''}" data-act="term" data-term="${esc(t)}">${t === 'all' ? 'Todos los cursos' : esc(t)}</button>`).join('')}</div>` : ''}
        ${hint ? `<p class="home-hint">${esc(hint)}</p>` : ''}
        ${groups.map(([h, list]) => `${h ? `<h2 class="home-h">${esc(h)}</h2>` : ''}<ul class="cards">${list.map(card).join('')}</ul>`).join('')}
      </div>`;

    // Entregas y exámenes de los próximos 7 días en cada tarjeta.
    myWork().then(list => {
      if (stale(seq)) return;
      const now = Date.now(), limit = now + 7 * DAY, by = {};
      list.filter(w => w.due && +w.due > now && +w.due < limit)
        .sort((a, b) => a.due - b.due)
        .forEach(w => (by[w.siteId] = by[w.siteId] || []).push(w));
      $main.querySelectorAll('.card-body').forEach(el => {
        el.innerHTML = (by[el.dataset.site] || []).slice(0, 3).map(w => `
          <a class="up" data-nav href="${siteHref(el.dataset.site, 'classwork')}">
            <span class="up-d">${w.kind === 'exam' ? 'Examen' : 'Fecha de entrega'}: ${fmtWhen(w.due)}</span>
            <span class="up-t">${esc(w.title)}</span>
          </a>`).join('');
      });
    }).catch(() => {});
  }

  // ---- Pendientes (todas las asignaturas)

  async function viewTodo(seq) {
    setTop({ crumb: 'Pendientes' });
    document.title = `Pendientes · ${SITE_NAME}`;
    const [sites, all] = await Promise.all([getSites(), myWork()]);
    if (stale(seq)) return;
    const byId = new Map(sites.map(s => [s.id, s]));
    const cls = currentCls(sites);
    const list = cls === 'all' ? all : all.filter(w => w.siteId === cls);

    const now = Date.now();
    const today = startOfDay(new Date());
    const endWeek = today + (7 - ((new Date().getDay() + 6) % 7)) * DAY; // lunes siguiente
    const endNext = endWeek + 7 * DAY;
    const groups = [['Sin fecha de entrega', []], ['Esta semana', []], ['La semana que viene', []], ['Más adelante', []], ['Fecha pasada', []]];
    for (const w of list) {
      const t = w.due ? +w.due : null;
      groups[t == null ? 0 : t < now ? 4 : t < endWeek ? 1 : t < endNext ? 2 : 3][1].push(w);
    }
    groups.forEach(([, l], i) => l.sort((a, b) => (i === 4 ? b.due - a.due : (a.due || 0) - (b.due || 0))));

    const item = w => {
      const s = byId.get(w.siteId);
      return `<a class="titem" data-nav href="${siteHref(w.siteId, 'classwork')}" style="--c:${s ? s.color : '#1967d2'}">
        <span class="item-ico">${icon(workIcon(w))}</span>
        <span class="item-t">${esc(w.title)}<small>${w.kind === 'exam' ? 'Examen · ' : ''}${esc(s ? s.title : w.siteId)}</small></span>
        <span class="item-d">${w.due ? fmtWhen(w.due) : ''}</span></a>`;
    };
    const groupBody = (l, i) => {
      if (!l.length) return '<div class="muted pad">No hay tareas</div>';
      if (i !== 4) return l.map(item).join('');
      // Fecha pasada: lo de hace más de un mes queda tras "Mostrar más".
      const recent = l.filter(w => now - w.due <= MONTH);
      const older = l.filter(w => now - w.due > MONTH);
      return `${recent.map(item).join('') || '<div class="muted pad">Nada en el último mes</div>'}
        ${older.length ? `<button class="more" data-act="more">Mostrar más (${older.length})</button><div hidden>${older.map(item).join('')}</div>` : ''}`;
    };

    $main.innerHTML = `
      <div class="page todo">
        <div class="page-top">${clsSelect(sites, cls)}</div>
        ${groups.map(([h, l], i) => `
          <details class="tgroup"${l.length && i > 0 ? ' open' : ''}>
            <summary><span>${h}</span><span class="count">${l.length}</span></summary>
            ${groupBody(l, i)}
          </details>`).join('')}
      </div>`;
  }

  // ---- Calendario semanal

  async function viewCalendar(seq) {
    setTop({ crumb: 'Calendario' });
    document.title = `Calendario · ${SITE_NAME}`;
    const [sites, all] = await Promise.all([getSites(), myWork()]);
    if (stale(seq)) return;
    const byId = new Map(sites.map(s => [s.id, s]));
    const cls = currentCls(sites);
    const list = cls === 'all' ? all : all.filter(w => w.siteId === cls);

    const t = new Date();
    const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) + calOffset * 7);
    const days = [...Array(7)].map((_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    const today = startOfDay(t);
    const last = days[6];
    const range = monday.getMonth() === last.getMonth()
      ? `${monday.getDate()}–${DFY.format(last)}`
      : `${DF.format(monday)} – ${DFY.format(last)}`;

    $main.innerHTML = `
      <div class="page cal">
        <div class="page-top">
          ${clsSelect(sites, cls)}
          <div class="cal-nav">
            <button class="ibtn sm" data-act="week" data-d="-1" title="Semana anterior">${icon('chevL')}</button>
            <span class="cal-range">${range}</span>
            <button class="ibtn sm" data-act="week" data-d="1" title="Semana siguiente">${icon('chevR')}</button>
            ${calOffset ? '<button class="btn o sm" data-act="week" data-d="0">Hoy</button>' : ''}
          </div>
        </div>
        <div class="cal-grid">
          ${days.map(d => {
            const k = startOfDay(d);
            const items = list.filter(w => w.due && startOfDay(w.due) === k).sort((a, b) => a.due - b.due);
            return `<div class="cal-col${k === today ? ' today' : ''}">
              <div class="cal-h"><span class="cal-wd">${WDS.format(d).replace('.', '')}</span><span class="cal-n">${d.getDate()}</span></div>
              <div class="cal-items">${items.map(w => {
                const s = byId.get(w.siteId);
                return `<a class="cal-item" data-nav href="${siteHref(w.siteId, 'classwork')}" style="--c:${s ? s.color : '#1967d2'}" title="${esc(`${w.title} · ${s ? s.title : ''} · ${TF.format(w.due)}`)}">
                  ${icon(workIcon(w))}<span>${esc(w.title)}</span></a>`;
              }).join('')}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ---- Asignatura

  async function viewClass(r, seq) {
    const site = await getSite(r.siteId);
    if (stale(seq)) return;
    setTop({ site });
    document.title = `${site.title} · ${SITE_NAME}`;
    const pages = await getPages(site.id).catch(() => []);
    if (stale(seq)) return;
    const view = { stream: viewStream, classwork: viewClasswork, people: viewPeople, grades: viewGrades }[r.tab] || viewStream;
    await view(site, pages, seq, tabBar(site, r.tab in { stream: 1, classwork: 1, people: 1, grades: 1 } ? r.tab : 'stream'));
  }

  const attList = atts => (atts.length ? `<div class="atts">${atts.map(a => `
    <a class="att" href="${esc(a.url)}" target="_blank" rel="noopener">
      <span class="att-ico">${icon('attach')}</span><span class="att-n">${esc(a.name)}</span>
    </a>`).join('')}</div>` : '');

  async function viewStream(site, pages, seq, tabs) {
    const annTool = findTool(pages, TOOLS.ann);
    $main.innerHTML = `${tabs}
      <div class="page">
        <div class="banner" style="background-image:${banner(site)}">
          <h1>${esc(site.title)}</h1>
          ${site.sub ? `<div class="banner-sub">${esc(site.sub)}</div>` : ''}
          <button class="banner-btn" data-act="colors" data-site="${esc(site.id)}">${icon('palette')}<span>Personalizar</span></button>
        </div>
        <div class="stream-grid">
          <aside>
            <section class="box">
              <h3>Próximamente</h3>
              <div class="js-up"><div class="muted">Cargando…</div></div>
              <a class="box-link" data-nav href="${siteHref(site.id, 'classwork')}">Ver todo</a>
            </section>
          </aside>
          <div>
            ${annTool ? `<a class="compose" data-nav href="${toolHref(site.id, annTool)}">${avatar(S.user.id, S.user.name, 40)}<span>Anuncia algo a tu clase</span></a>` : ''}
            <div class="js-feed">${loading()}</div>
          </div>
        </div>
      </div>`;

    const [annR, workR] = await Promise.allSettled([getAnnouncements(site.id), siteWork(site.id)]);
    if (stale(seq)) return;
    const work = workR.status === 'fulfilled' ? workR.value.filter(w => !w.draft) : [];
    const now = Date.now();

    const up = work.filter(w => w.due && +w.due > now).sort((a, b) => a.due - b.due).slice(0, 3);
    q('.js-up').innerHTML = up.length
      ? up.map(w => `<a class="upc" data-nav href="${workHref(site, pages, w)}"><span class="upc-d">${w.kind === 'exam' ? 'Examen' : 'Fecha de entrega'}: ${fmtWhen(w.due)}</span><span class="upc-t">${esc(w.title)}</span></a>`).join('')
      : '<div class="muted">¡Bien! No tienes que entregar ningún trabajo pronto.</div>';

    const feed = [
      ...(annR.status === 'fulfilled' ? annR.value.map(a => ({ ann: true, t: a.date ? +a.date : 0, a })) : []),
      ...work.map(w => ({ ann: false, t: +(w.open || w.due || 0), a: w })),
    ].sort((x, y) => y.t - x.t);

    const who = site.owner || 'El profesor';
    const annCard = a => `
      <article class="post">
        <header class="post-h">${avatar(null, a.author, 40)}<div class="post-who"><div class="post-author">${esc(a.author)}</div><div class="post-date">${fmtDate(a.date)}</div></div>
          <span class="ibtn sm muted">${icon('more')}</span></header>
        ${a.title ? `<div class="post-title">${esc(a.title)}</div>` : ''}
        <div class="post-body rich">${sanitize(a.body)}</div>
        ${attList(a.atts)}
      </article>`;
    const workPost = w => `
      <a class="post post-asg" data-nav href="${workHref(site, pages, w)}">
        <span class="pico">${icon(workIcon(w))}</span>
        <span class="post-who"><span class="post-author">${esc(who)} ha publicado ${w.kind === 'exam' ? 'un nuevo examen' : 'una nueva tarea'}: ${esc(w.title)}</span>
        <span class="post-date">${fmtDate(w.open || w.due)}</span></span>
        <span class="ibtn sm muted">${icon('more')}</span>
      </a>`;

    q('.js-feed').innerHTML = feed.length
      ? feed.map(it => (it.ann ? annCard(it.a) : workPost(it.a))).join('')
      : annR.status === 'rejected'
        ? errorBox('No se pudieron cargar los anuncios.', annTool && toolHref(site.id, annTool))
        : `<div class="stream-empty">${icon('comment')}<b>Aquí es donde te comunicas con tu clase</b><span>Usa el tablón para ver anuncios y responder a preguntas.</span></div>`;
  }

  async function viewClasswork(site, pages, seq, tabs) {
    const [workR, resR] = await Promise.allSettled([siteWork(site.id), getResources(site.id)]);
    if (stale(seq)) return;

    const workItem = w => `
      <details class="item">
        <summary>
          <span class="item-ico">${icon(workIcon(w))}</span>
          <span class="item-t">${esc(w.title)}${w.draft ? '<small>Borrador</small>' : ''}</span>
          <span class="item-d">${w.due ? `Fecha de entrega: ${fmtWhen(w.due)}` : w.open ? `Publicado: ${fmtDate(w.open)}` : ''}</span>
          <span class="ibtn sm muted">${icon('more')}</span>
        </summary>
        <div class="item-body">
          <div class="item-meta">${[w.open && `${w.kind === 'exam' ? 'Disponible desde' : 'Publicado'}: ${fmtWhen(w.open)}`, w.close && `Cierre: ${fmtWhen(w.close)}`].filter(Boolean).join(' · ')}</div>
          ${w.instructions ? `<div class="rich">${sanitize(w.instructions)}</div>` : ''}
          ${attList(w.atts)}
        </div>
        <div class="item-foot"><a class="lnk" data-nav href="${workHref(site, pages, w)}">${w.kind === 'exam' ? 'Ver examen' : 'Ver tarea'}</a></div>
      </details>`;
    const fileItem = f => `
      <a class="item file" href="${esc(f.url)}" target="_blank" rel="noopener">
        <span class="item-ico">${icon(f.link ? 'link' : 'file')}</span>
        <span class="item-t">${esc(f.title)}${f.path ? `<small>${esc(f.path)}</small>` : ''}</span>
        <span class="item-d">${f.date ? `Publicado: ${fmtDate(f.date)}` : ''}</span>
      </a>`;

    const topics = [];
    if (workR.status === 'fulfilled' && workR.value.length) {
      const sorted = [...workR.value].sort((a, b) => (b.due || b.open || 0) - (a.due || a.open || 0));
      const hasExams = sorted.some(w => w.kind === 'exam');
      topics.push({ title: hasExams ? 'Tareas y exámenes' : 'Tareas', html: sorted.map(workItem).join('') });
    }
    if (resR.status === 'fulfilled') {
      const { rootFiles, folders } = resR.value;
      if (rootFiles.length) topics.push({ title: 'Material', html: rootFiles.map(fileItem).join('') });
      folders.forEach(f => topics.push({ title: f.title, html: f.items.map(fileItem).join('') || '<div class="muted pad">Este tema está vacío</div>' }));
    }
    topics.forEach((t, i) => { t.id = `topic-${i}`; });

    const res = findTool(pages, TOOLS.res);
    const actions = `
      <a class="btn t" data-nav href="${siteHref(site.id, 'grades')}">${icon('work')}Ver tu trabajo</a>
      <a class="btn t" data-nav href="/portal#gc/calendar">${icon('event')}Calendario</a>
      ${res ? `<a class="btn t" data-nav href="${toolHref(site.id, res)}">${icon('folder')}Carpeta de la clase</a>` : ''}`;

    $main.innerHTML = `${tabs}
      <div class="page wide">
        <div class="cw-actions">${actions}</div>
        ${topics.length ? `
          <div class="cw-grid">
            <aside class="cw-topics">
              <button class="topic-link on" data-act="scroll">Todos los temas</button>
              ${topics.map(t => `<button class="topic-link" data-act="scroll" data-target="${t.id}">${esc(t.title)}</button>`).join('')}
            </aside>
            <div>${topics.map(t => `<section class="topic" id="${t.id}"><h2 class="topic-h">${esc(t.title)}</h2>${t.html}</section>`).join('')}</div>
          </div>`
        : workR.status === 'rejected' && resR.status === 'rejected'
          ? errorBox('No se pudo cargar el trabajo de clase.')
          : `<div class="stream-empty">${icon('assignment')}<b>Aquí es donde verás el trabajo de clase</b><span>Las tareas, exámenes y materiales de la asignatura aparecerán aquí.</span></div>`}
      </div>`;
  }

  async function viewPeople(site, pages, seq, tabs) {
    let members = null;
    try {
      const d = await api(`/direct/membership/site/${enc(site.id)}.json?_limit=5000`);
      members = (d.membership_collection || []).filter(m => m.active !== false);
    } catch { /* sin permiso: se usa la herramienta Participantes */ }
    if (stale(seq)) return;
    if (!members || !members.length) { embedTool(site, pages, TOOLS.roster, tabs); return; }

    const isTeacher = m => /prof|instructor|teacher|maintain|coordin|docent|organi/i.test(m.memberRole || '');
    const byName = (a, b) => String(a.userSortName || a.userDisplayName || '').localeCompare(String(b.userSortName || b.userDisplayName || ''), 'es');
    const teachers = members.filter(isTeacher).sort(byName);
    const students = members.filter(m => !isTeacher(m)).sort(byName);
    const row = m => `
      <li class="person">
        ${avatar(m.userId, m.userDisplayName || m.userEid, 32)}
        <span class="nm">${esc(m.userDisplayName || m.userEid)}</span>
        ${m.userEmail ? `<a class="ibtn sm" href="mailto:${esc(m.userEmail)}" title="Enviar correo a ${esc(m.userDisplayName)}">${icon('mail')}</a>` : ''}
      </li>`;

    $main.innerHTML = `${tabs}
      <div class="page people">
        <section><h2 class="people-h">Profesores</h2><ul>${teachers.map(row).join('') || '<li class="person muted">—</li>'}</ul></section>
        <section><h2 class="people-h">Compañeros de clase <span>${students.length} alumno${students.length === 1 ? '' : 's'}</span></h2><ul>${students.map(row).join('')}</ul></section>
      </div>`;
  }

  // Calificaciones propias, al estilo de "Ver tu trabajo" de Classroom.
  async function viewGrades(site, pages, seq, tabs) {
    let items = null;
    try { items = await getGrades(site.id, pages); } catch { /* sin datos: se usa la herramienta */ }
    if (stale(seq)) return;
    const gbTool = findTool(pages, TOOLS.grades);
    if (!items || !items.length) {
      if (gbTool) { embedTool(site, pages, TOOLS.grades, tabs); return; }
      $main.innerHTML = `${tabs}<div class="page"><div class="stream-empty">${icon('grade')}<b>Todavía no hay calificaciones</b><span>Cuando el profesorado publique notas, aparecerán aquí.</span></div></div>`;
      return;
    }

    const graded = items.filter(i => i.grade != null && i.max);
    const avg = graded.length ? graded.reduce((s, i) => s + (i.grade / i.max) * 10, 0) / graded.length : null;
    const row = i => {
      const val = i.grade != null
        ? `<span class="gr-val">${fmtNum(i.grade)}${i.max ? `<span>/${fmtNum(i.max)}</span>` : ''}</span>`
        : i.raw ? `<span class="gr-val">${esc(i.raw)}</span>` : '<span class="gr-none">Sin calificar</span>';
      return `
        <li class="gr-row">
          <span class="item-ico">${icon('assignment')}</span>
          <span class="item-t">${esc(i.name)}<small>${[i.cat, i.due && `Fecha de entrega: ${fmtDate(i.due)}`].filter(Boolean).map(esc).join(' · ')}</small>
            ${i.comment ? `<span class="gr-com">${icon('comment')}${esc(i.comment)}</span>` : ''}</span>
          ${val}
        </li>`;
    };

    $main.innerHTML = `${tabs}
      <div class="page grades">
        <div class="gr-head">
          ${avatar(S.user.id, S.user.name, 56)}
          <div class="gr-who"><div class="gr-name">${esc(S.user.name)}</div><div class="muted">${esc(site.title)}</div></div>
          ${avg != null ? `<div class="gr-avg"><b>${fmtNum(avg)}</b><span>Media de las notas publicadas (sobre 10)</span></div>` : ''}
        </div>
        <ul class="gr-list">${items.map(row).join('')}</ul>
        ${gbTool ? `<div class="gr-foot"><a class="lnk" data-nav href="${toolHref(site.id, gbTool)}">Abrir el libro de calificaciones completo</a></div>` : ''}
      </div>`;
  }

  // ---- Herramientas originales incrustadas (con estilo adaptado)

  function toolSkin(color) {
    return `
      html,body{background:#fff!important}
      body,p,div,td,th,li,label,input,button,select,textarea,h1,h2,h3,h4,h5,h6,legend,dt,dd{font-family:"Google Sans Text","Google Sans",Roboto,"Segoe UI",Arial,sans-serif!important}
      body{color:#3c4043!important;font-size:14px!important;-webkit-font-smoothing:antialiased}
      h1,h2,h3,h4,h5,h6{font-family:"Google Sans",Roboto,Arial,sans-serif!important;color:#202124!important;font-weight:400!important}
      .Mrphs-toolTitleNav,.portletTitleWrap,.portletTitle{display:none!important}
      .portletBody,.Mrphs-container,#content{padding:24px 32px!important;max-width:1200px;margin:0 auto!important;background:#fff!important;border:0!important;box-shadow:none!important}
      a{color:${color}}
      .navIntraTool,ul.navIntraTool,.nav-tabs{display:flex!important;flex-wrap:wrap;gap:8px;border:0!important;background:none!important;padding:0!important;margin:0 0 24px!important}
      .navIntraTool li,.nav-tabs li{list-style:none;border:0!important;background:none!important;margin:0!important;padding:0!important}
      .navIntraTool li::before,.navIntraTool li::after{display:none!important}
      .navIntraTool a,.navIntraTool span.current,.navIntraTool .current,.nav-tabs a{display:inline-flex!important;align-items:center;height:32px;padding:0 14px!important;border:1px solid #dadce0!important;border-radius:8px!important;color:#3c4043!important;background:#fff!important;text-decoration:none!important;font-weight:500}
      .navIntraTool a:hover,.nav-tabs a:hover{background:#f1f3f4!important}
      .navIntraTool .current,.nav-tabs .active a{background:#e8f0fe!important;border-color:transparent!important;color:#1967d2!important}
      input[type=submit],input[type=button],input[type=reset],button,.btn,.button{border-radius:4px!important;font-weight:500!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important}
      input[type=submit].active,input.active,.btn-primary,.button.active,button.active{background:${color}!important;border-color:${color}!important;color:#fff!important}
      input[type=text],input[type=number],input[type=password],select,textarea{border:1px solid #dadce0!important;border-radius:4px!important;box-shadow:none!important}
      table{border-collapse:collapse!important}
      table.listHier,table.table,table.lines,.table{border:0!important;background:#fff!important}
      table.listHier th,table.table th,.table th,table.lines th{background:#fff!important;color:#5f6368!important;font-weight:500!important;border:0!important;border-bottom:1px solid #dadce0!important;padding:12px 8px!important}
      table.listHier td,table.table td,.table td,table.lines td{border:0!important;border-bottom:1px solid #e8eaed!important;padding:12px 8px!important;background:#fff!important}
      .panel,.card,.well,.sak-banner-info,.messageInformation,.instruction{border-radius:8px!important;border-color:#dadce0!important;box-shadow:none!important}
      .panel-heading{background:#fff!important;border-color:#dadce0!important}
      @media (max-width:600px){.portletBody,.Mrphs-container,#content{padding:12px!important}
        table{display:block;overflow-x:auto;max-width:100%}
        input[type=text],select,textarea{max-width:100%}}`;
  }

  function frame(src, color, tabs = '') {
    $main.innerHTML = `${tabs}<div class="framewrap${tabs ? ' with-tabs' : ''}"><iframe class="frame" src="${esc(src)}" allow="fullscreen; clipboard-write; autoplay"></iframe></div>`;
    const f = q('iframe');
    f.addEventListener('load', () => {
      let doc, loc;
      try { doc = f.contentDocument; loc = f.contentWindow.location; } catch { return; }
      if (!doc || !loc || !doc.head) return;
      if (routable(loc.pathname) && loc.pathname !== location.pathname) {
        // Un enlace dentro de la herramienta lleva a otra página del portal.
        location.assign(loc.href);
        return;
      }
      loadFonts(doc);
      const st = doc.createElement('style');
      st.textContent = toolSkin(color) + (routable(loc.pathname)
        // El servidor ha devuelto el portal completo: ocultamos su cabecera y menú.
        ? 'header,#portal-nav-sidebar,#skipNav,.Mrphs-topHeader,.Mrphs-siteHierarchy,.Mrphs-toolsNav__container,.Mrphs-mainHeader,#footer,.Mrphs-footer,.portal-header,.site-hierarchy{display:none!important}'
        : '');
      doc.head.appendChild(st);
    });
  }

  function embedTool(site, pages, ids, tabs = '') {
    const t = findTool(pages, ids);
    if (!t) { $main.innerHTML = `${tabs}${empty('Esta asignatura no tiene esta herramienta activada.')}`; return; }
    frame(`/portal/tool/${enc(t.id)}`, site.color, tabs);
  }

  async function viewTool(r, seq) {
    const ws = r.siteId.startsWith('~');
    const site = ws
      ? { id: r.siteId, title: 'Mi espacio', sub: '', color: '#1967d2' }
      : await getSite(r.siteId).catch(() => ({ id: r.siteId, title: r.siteId, sub: '', color: colorFor(r.siteId) }));
    const pages = await getPages(r.siteId).catch(() => []);
    if (stale(seq)) return;
    const page = r.kind === 'page' ? pages.find(p => p.id === r.ref) : pages.find(p => p.tools.some(t => t.id === r.ref));
    const title = page ? page.title : '';
    setTop({ site, sub: title || site.sub });
    document.title = `${title || 'Herramienta'} · ${site.title}`;
    frame(`/portal/${r.kind}/${enc(r.ref)}${location.search}`, site.color, ws ? '' : tabBar(site, ''));
  }
})();

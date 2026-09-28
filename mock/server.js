// Servidor de prueba: imita las rutas de Sakai para ver la extensión sin PoliformaT.
const http = require('http');
const fs = require('fs');
const path = require('path');
const EXT = path.join(__dirname, '..', 'poliformat-classroom');
const now = Date.now(), D = 864e5;

const sites = [
  ['GRA_11546_2026', 'Física I', '2026-27', 'Ana García'],
  ['GRA_11547_2026', 'Cálculo', '2026-27', 'Luis Pérez'],
  ['GRA_11548_2026', 'Programación', '2026-27', 'Marta Ruiz'],
  ['GRA_11550_2026', 'Estadística', '', 'Eva Mora'],
  ['GRA_11551_2026', 'Inglés', '', 'John Smith'],
  ['GRA_11549_2025', 'Química', '2025-26', 'Jorge Sanz'],
].map(([id, title, term, owner]) => ({ id, title, type: 'course', props: term ? { term } : {}, contactName: owner, shortDescription: '' }));

const tools = [['Anuncios', 'sakai.announcements'], ['Tareas', 'sakai.assignment.grades'], ['Recursos', 'sakai.resources'], ['Calificaciones', 'sakai.gradebookng'], ['Participantes', 'sakai.site.roster2'], ['Exámenes', 'sakai.samigo']];
const pages = sid => tools.map(([t, tid], i) => ({ id: `p${i}`, title: t, tools: [{ id: `${sid}-t${i}`, toolId: tid, title: t }] }));
const asg = sid => [
  { id: 'a1', title: 'Práctica 1: introducción', context: sid, dueTime: { epochSecond: (now + 2 * D) / 1000 | 0 }, openTime: { epochSecond: (now - 3 * D) / 1000 | 0 }, instructions: '<p>Entregad el <b>informe</b> en PDF.</p>', attachments: [] },
  { id: 'a2', title: 'Ejercicios tema 2', context: sid, dueTime: { epochSecond: (now + 9 * D) / 1000 | 0 }, openTime: { epochSecond: (now - 1 * D) / 1000 | 0 }, instructions: '' },
  { id: 'a3', title: 'Cuestionario inicial', context: sid, dueTime: { epochSecond: (now - 5 * D) / 1000 | 0 }, openTime: { epochSecond: (now - 12 * D) / 1000 | 0 } },
  { id: 'a4', title: 'Tarea del curso pasado', context: sid, dueTime: { epochSecond: (now - 50 * D) / 1000 | 0 }, openTime: { epochSecond: (now - 60 * D) / 1000 | 0 } },
];
const exams = sid => [
  { publishedAssessmentId: 'e1', title: 'Examen parcial 1', startDate: now + 3 * D, dueDate: now + 3 * D + 7200e3, description: 'Temas 1 y 2.' },
  { publishedAssessmentId: 'e2', title: 'Test de repaso', startDate: now - 40 * D, dueDate: now - 38 * D },
  { publishedAssessmentId: 'e3', title: 'Autoevaluación sin fecha' },
];
const grades = { assignments: [
  { itemName: 'Práctica 1', grade: '8.5', points: 10, userId: 'u1', comment: 'Buen trabajo, revisa las unidades.' },
  { itemName: 'Test de repaso', grade: '7', points: 10, userId: 'u1' },
  { itemName: 'Examen parcial 1', grade: null, points: 10, userId: 'u1' },
] };
const base = 'http://localhost:' + (process.env.PORT || 8123) + '/access/content/group/';
const routes = {
  '/direct/user/current.json': { id: 'u1', eid: 'mcox', displayName: 'Miguel Cox' },
  '/direct/site.json': { site_collection: sites },
  '/portal/favorites/list': { favoriteSiteIds: ['GRA_11548_2026', 'GRA_11546_2026', 'GRA_11549_2025'] },
  '/direct/assignment/my.json': { assignment_collection: sites.flatMap(s => asg(s.id)) },
};
function handle(p) {
  if (routes[p]) return routes[p];
  let m;
  if ((m = p.match(/^\/direct\/site\/([^/]+)\/pages\.json$/))) return pages(m[1]);
  if ((m = p.match(/^\/direct\/assignment\/site\/([^/]+)\.json$/))) return { assignment_collection: asg(m[1]) };
  if ((m = p.match(/^\/direct\/sam_pub\/context\/([^/]+)\.json$/))) return { sam_pub_collection: exams(m[1]) };

  if ((m = p.match(/^\/direct\/announcement\/site\/([^/]+)\.json$/))) return { announcement_collection: [
    { id: 'n1', title: 'Bienvenidos a la asignatura', body: '<p>Hola a todos, las clases empiezan el lunes. Revisad la guía docente.</p>', createdByDisplayName: 'Ana García', createdOn: now - 2 * D, attachments: [{ name: 'Guía docente.pdf', url: '/x.pdf' }] },
    { id: 'n2', title: 'Cambio de aula', body: 'La sesión del jueves será en el aula 2.1.', createdByDisplayName: 'Ana García', createdOn: now - 6 * D },
  ] };
  if ((m = p.match(/^\/direct\/content\/site\/([^/]+)\.json$/))) return { content_collection: [
    { url: `${base}${m[1]}/`, type: 'collection', title: 'root' },
    { url: `${base}${m[1]}/Tema%201/`, type: 'collection', title: 'Tema 1 - Cinemática' },
    { url: `${base}${m[1]}/Tema%201/apuntes.pdf`, type: 'application/pdf', title: 'Apuntes tema 1', modifiedDate: now - 8 * D },
    { url: `${base}${m[1]}/Tema%201/ej/boletin.pdf`, type: 'application/pdf', title: 'Boletín', modifiedDate: now - 7 * D },
    { url: `${base}${m[1]}/Tema%202/`, type: 'collection', title: 'Tema 2 - Dinámica' },
    { url: `${base}${m[1]}/guia.pdf`, type: 'application/pdf', title: 'Guía docente', modifiedDate: now - 20 * D },
  ] };
  if ((m = p.match(/^\/direct\/membership\/site\/([^/]+)\.json$/))) return { membership_collection: [
    { userId: 'x1', userDisplayName: 'Ana García', memberRole: 'profesor', userEmail: 'ana@upv.es' },
    ...['Carlos López', 'Lucía Martín', 'Pablo Gómez'].map((n, i) => ({ userId: 's' + i, userDisplayName: n, memberRole: 'alumno' })),
  ] };
  return null;
}

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/ext/')) {
    const type = p.endsWith('.css') ? 'text/css; charset=utf-8' : p.endsWith('.png') ? 'image/png' : 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true' });
    return res.end(fs.readFileSync(path.join(EXT, p.slice(5))));
  }
  const data = handle(p);
  if (data) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(data)); }
  if (/^\/direct\/gradebook\//.test(p)) { res.writeHead(501); return res.end('Not Implemented'); }
  if (p === '/logo-white.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><rect x="4" y="10" width="40" height="40" rx="6" fill="#fff"/><text x="56" y="42" font-family="Arial" font-size="30" font-weight="bold" fill="#fff">Aula Virtual</text></svg>');
  }
  // Página de Calificaciones para el alumno (tabla como la de GradebookNG).
  if (/^\/portal\/tool\/[^/]+-t3$/.test(p)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<html><body><table class="table"><thead><tr><th>Elemento de calificación</th><th>Fecha de entrega</th><th>Calificación</th><th>Comentarios</th></tr></thead><tbody>
      <tr><td colspan="4">Prácticas</td></tr>
      <tr><td><span>Práctica 1</span></td><td>30/09/2026</td><td>8,5 / 10</td><td>Buen trabajo, revisa las unidades.</td></tr>
      <tr><td><span>Práctica 2</span></td><td>14/10/2026</td><td>-</td><td></td></tr>
      <tr><td colspan="4">Exámenes</td></tr>
      <tr><td><span>Test de repaso</span></td><td></td><td>7 / 10</td><td></td></tr>
    </tbody></table></body></html>`);
  }
  if (p.startsWith('/portal/tool/')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<body style="font-family:sans-serif;padding:24px"><h2>Herramienta original de Sakai</h2><p>${p}</p></body>`); }
  if (p.startsWith('/portal')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><html><head><title>Aula Virtual : Bienvenida : Inicio</title><link rel="icon" href="/ext/icons/icon48.png"><link rel="stylesheet" href="/ext/boot.css"><script>window.chrome={runtime:{getURL:p=>'/ext/'+p}}</script><script src="/ext/content.js"></script></head><body style="margin:0;font-family:sans-serif"><header class="portal-header" style="display:flex;align-items:center;justify-content:space-between;height:56px;background:#002028;color:#fff;padding:0 12px"><div class="portal-header-logo"><a class="btn btn-logo" style="display:inline-block;width:160px;height:40px;background:url(/logo-white.svg) no-repeat left center/contain"></a></div><a class="sak-sysInd-systemAlerts me-auto" style="margin-right:auto"></a><button style="margin:0 6px">🔔</button><span id="userav" style="width:32px;height:32px;border-radius:50%;background:#888;display:inline-block"></span></header><div id="sakai">PORTAL ORIGINAL DE SAKAI</div></body></html>`);
  }
  res.writeHead(404); res.end();
}).listen(process.env.PORT || 8123, () => console.log('mock on http://localhost:8123/portal'));

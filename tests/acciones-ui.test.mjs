import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };
function app() {
 const dom = new JSDOM(html, { url: 'https://ladra.test', runScripts: 'outside-only' });
 const w = dom.window;
 w.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
 w.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
 w.auraLadraDb = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'real-user' } } } }), onAuthStateChange() {} },
  rpc: async () => ({ error: { code: 'PGRST202', message: 'Could not find function' } })
 };
 return { dom, w, d: w.document };
}
test('La página pública no carga aportes simulados ni ofrece ejemplos o menús vacíos', () => {
 const a = app(); try {
  assert.equal(a.d.querySelector('script[src*="acciones.js"]'), null);
  assert.equal(a.d.querySelector('.market-more-causes'), null);
  assert.equal(a.d.querySelector('[data-services-demo]'), null);
  assert.equal(a.d.querySelector('.nav-pronto'), null);
  assert.doesNotMatch(a.d.body.textContent, /\bdemo\b|aportes simulados|ejemplos del diseño/i);
  assert.ok(a.d.querySelector('[aria-label="Únete a la comunidad"] a[href="#mi-espacio"]'));
  assert.match(a.d.querySelector('[data-cal-demo]').textContent, /no se publican ni se sincronizan/);
 } finally { a.w.close(); }
});
test('Error de puestos no muestra datos ficticios, tampoco desde almacenamiento antiguo', async () => {
 const a = app(); try {
  a.w.localStorage.setItem('auraladra.demo.puestos.v5', JSON.stringify({ puestos: [{ id: 'fake', nombre: 'Puesto ficticio' }] }));
  a.w.eval(await readFile(new URL('../js/puestos.js', import.meta.url), 'utf8'));
  await flush();
  assert.equal(a.w.auraLadraPuestos.lista().length, 0);
  assert.equal(a.w.auraLadraPuestos.lugares().length, 0);
  assert.match(a.d.querySelector('[data-puestos-modo]').textContent, /No pudimos cargar/);
  assert.doesNotMatch(a.d.querySelector('#comida-agua').textContent, /Puesto ficticio|\bdemo\b/i);
 } finally { a.w.close(); }
});
test('Error del árbol no construye vínculos ficticios', async () => {
 const a = app(); try {
  a.w.eval(await readFile(new URL('../js/arbol.js', import.meta.url), 'utf8'));
  await flush();
  assert.match(a.d.body.textContent, /No pudimos cargar tus vínculos/);
  assert.doesNotMatch(a.d.body.textContent, /Abuela Elena|Rosa \(ejemplo\)|\bdemo\b/i);
 } finally { a.w.close(); }
});
test('Una campaña real conserva meta y equipo y muestra una sola condición de devolución', async () => {
 const a = app(); try {
  const campaign = {id:'campana-real',titulo:'Comedero real',tipo:'comida',meta_ac:100000,plazo_recaudacion_dias:60,plazo_habilitacion_dias:60,recaudacion_hasta:'2026-12-14T12:00:00Z',permiso_estado:'sin_consultar',equipo:[{alias:'Responsable real',rol:'responsable'}],condiciones_devolucion:'Propuesta: no se entrega nada.',descripcion:'Construcción comunitaria.',para_que:'Fabricar un comedero.',direccion_publica:'Por definir',comuna:'Maipú'};
  a.w.auraLadraDb.rpc = async name => ({data: name === 'listar_avisos_puestos' ? [campaign] : name === 'estado_patrocinio_ac' ? {habilitado:true,estado:'recaudando',recaudado_ac:0} : []});
  a.w.eval(await readFile(new URL('../js/puestos.js', import.meta.url), 'utf8'));
  await flush();
  assert.equal(a.w.auraLadraPuestos.lista().length, 1);
  const content = a.d.querySelector('[data-puestos-detalle]').textContent;
  assert.match(content, /Comedero real/);
  assert.match(content, /Responsable real/);
  assert.match(content, /se devuelve automáticamente/);
  assert.doesNotMatch(content, /Propuesta: no se entrega nada|regla prevalece/);
 } finally { a.w.close(); }
});

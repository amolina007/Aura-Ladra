import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const code = await readFile(new URL('../js/mi-espacio.js', import.meta.url), 'utf8');
const vistas = await readFile(new URL('../js/vistas.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
async function app({ actor = 'persona', pending = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://ladra.test/#mi-espacio', runScripts: 'outside-only' }), w = dom.window, doc = w.document;
  w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.matchMedia = () => ({ matches: false });
  let resolve; const calls = [];
  w.auraLadraRed = { sesion: () => actor ? { user: { id: actor } } : null, propias: () => [{ id: 'pet' }] };
  w.auraLadraFeed = { propias: () => pending ? new Promise(r => { resolve = r; }) : Promise.resolve([]), publicar: tipo => calls.push(tipo), tarjetaPropia: p => { const n = doc.createElement('article'); n.textContent = p.texto; return n; } };
  doc.querySelector('[data-my-profile]').hidden = !actor;
  w.eval(vistas); w.eval(code); await flush();
  return { w, doc, calls, close: () => w.close(), resolve: posts => resolve(posts), user: async id => { actor = id; doc.dispatchEvent(new w.CustomEvent('sesion:cambio')); await flush(); } };
}

test('Mi espacio reemplaza el rótulo y conserva las rutas anteriores sin duplicar acceso', async () => {
  const a = await app();
  try {
    assert.equal(a.doc.querySelector('[data-tabbar-link=perfil]').textContent, 'Mi espacio');
    assert.equal(a.doc.querySelector('[data-my-profile-panel=perfil] [data-magic-form]'), null);
    a.w.auraLadraVistas.ir('mi-perfil'); assert.equal(a.w.auraLadraVistas.actual(), 'cuenta');
    assert.equal(a.doc.querySelector('[data-my-profile]').hidden, false);
    assert.ok(a.doc.querySelector('[data-space-vinculos] [data-link-requests-section]'));
    assert.ok(a.doc.querySelector('[data-my-profile-panel=actividad] [data-my-reports-section]'));
  } finally { a.close(); }
});

test('Los accesos crean contenido, abren consultas y muestran guardados sin filtros anteriores', async () => {
  const a = await app();
  try {
    a.doc.querySelector('[data-space-crear=post]').click(); assert.deepEqual(a.calls, ['post']);
    let consultas = false; a.doc.querySelector('[data-services-panel=consultas]').addEventListener('click', () => { consultas = true; });
    a.doc.querySelector('[data-space-consultas]').click(); assert.equal(a.w.auraLadraVistas.actual(), 'servicios'); assert.ok(consultas);
    a.doc.querySelector('[data-desc-filtros] [name=especie]').value = 'gato';
    a.doc.querySelector('[data-space-guardados]').click();
    assert.equal(a.w.auraLadraVistas.actual(), 'red'); assert.equal(a.doc.querySelector('[name=guardados]').checked, true);
    assert.equal(a.doc.querySelector('[data-desc-filtros] [name=especie]').value, '');
  } finally { a.close(); }
});

test('Al cerrar sesión borra el contenido privado y una respuesta antigua no vuelve a mostrarlo', async () => {
  const a = await app({ pending: true });
  try {
    await a.user(null); a.resolve([{ tipo: 'post', texto: 'Contenido de la cuenta anterior' }]); await flush();
    assert.equal(a.doc.querySelector('[data-my-profile]').hidden, true);
    assert.equal(a.doc.querySelector('[data-space-signed-out]').hidden, false);
    assert.doesNotMatch(a.doc.querySelector('[data-space-contenido=post]').textContent, /cuenta anterior/);
  } finally { a.close(); }
});

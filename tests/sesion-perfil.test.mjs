import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const descubrir = await readFile(new URL('../js/descubrir.js', import.meta.url), 'utf8');
const clientCode = await readFile(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const compact = await readFile(new URL('../js/sesion-cookie.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

test('Existe una sola instancia de Auth para Ladra, menú y canje de correos', () => {
  const dom = new JSDOM('', { url: 'https://ladra.convergenciaaura.cl', runScripts: 'outside-only' });
  const w = dom.window;
  let creates = 0;
  const instance = { auth: { getSession() {}, refreshSession() {} } };
  w.supabase = { createClient: () => { creates++; return instance; } };
  try {
    w.eval(compact); w.eval(clientCode);
    assert.equal(creates, 1);
    assert.equal(w.auraClient, w.auraLadraDb);
    assert.equal(w.auraClient.auth, instance.auth);
    assert.doesNotMatch(html, /src="https:\/\/convergenciaaura\.cl\/aura-auth\.js"/);
  } finally { w.close(); }
});

async function ficha({ session = null, own = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://ladra.test', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document, animal = { id: 'pet', nombre: 'Leia' };
  let state = session;
  w.auraLadraRed = { sesion: () => state, propias: () => own ? [animal] : [], animales: () => [animal], fichaActual: () => animal, redibujar() {}, tarjeta: () => doc.createElement('div') };
  w.auraLadraDb = { rpc: async () => ({ data: [] }) };
  doc.querySelector('[data-pet-profile-view]').innerHTML = '<div class="pet-profile-hero"></div>';
  w.eval(descubrir); doc.dispatchEvent(new w.CustomEvent('mascota:perfil')); await flush();
  return { w, doc, setSession: async s => { state = s; doc.dispatchEvent(new w.CustomEvent('sesion:cambio', { detail: { session: s } })); await flush(); }, setOwn: async v => { own = v; doc.dispatchEvent(new w.CustomEvent('red:cambio')); await flush(); }, close: () => w.close() };
}

test('Una ficha abierta sin sesión cambia inmediatamente a Seguir y Guardar al entrar', async () => {
  const a = await ficha();
  try {
    assert.match(a.doc.querySelector('.ficha-social').textContent, /Inicia sesión/);
    await a.setSession({ user: { id: 'persona' } });
    assert.ok(a.doc.querySelector('[data-ficha-seguir]')); assert.ok(a.doc.querySelector('[data-ficha-guardar]'));
    assert.doesNotMatch(a.doc.querySelector('.ficha-social').textContent, /Inicia sesión/);
    assert.equal(a.doc.querySelectorAll('.ficha-social').length, 1);
    await a.setSession(null);
    assert.equal(a.doc.querySelector('[data-ficha-seguir]'), null);
    assert.match(a.doc.querySelector('.ficha-social').textContent, /Inicia sesión/);
  } finally { a.close(); }
});

test('Con sesión desde el inicio nunca pide entrar; renovar la sesión no duplica controles', async () => {
  const a = await ficha({ session: { user: { id: 'persona' } } });
  try {
    assert.ok(a.doc.querySelector('[data-ficha-seguir]'));
    await a.setSession({ user: { id: 'persona' }, access_token: 'renovado' });
    assert.equal(a.doc.querySelectorAll('.ficha-social').length, 1);
    assert.doesNotMatch(a.doc.querySelector('.ficha-social').textContent, /Inicia sesión/);
    await a.setOwn(true); assert.equal(a.doc.querySelector('.ficha-social'), null);
  } finally { a.close(); }
});

test('La respuesta inicial lenta sin sesión no pisa un acceso que llegó durante la carga del mapa', async () => {
  const a = main.indexOf('  async function initialize() {'), b = main.indexOf('\n  // La barra de abajo', a);
  assert.ok(a > 0 && b > a);
  const dom = new JSDOM('<span data-year></span>', { runScripts: 'outside-only' }), w = dom.window;
  let authCallback, resolveInitial;
  const sessions = [];
  w.db = { auth: { getSession: () => new Promise(resolve => { resolveInitial = resolve; }), onAuthStateChange: cb => { authCallback = cb; } } };
  w.syncSession = async s => sessions.push(s?.user?.id || null);
  for (const name of ['setDefaultObservedDate', 'initializeMap', 'verifyBackend', 'loadPlaces', 'loadAnimalNetwork', 'completeMagicLinkReturn', 'refreshWanted']) w[name] = async () => {};
  try {
    w.eval(main.slice(a, b) + '\nwindow.initializing = initialize();');
    assert.equal(typeof authCallback, 'function');
    authCallback('SIGNED_IN', { user: { id: 'persona' } }); await flush();
    resolveInitial({ data: { session: null } }); await w.initializing;
    assert.deepEqual(sessions, ['persona']);
  } finally { w.close(); }
});

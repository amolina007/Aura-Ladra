import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, CookieJar } from 'jsdom';
const code = await readFile(new URL('../js/sesion-cookie.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const key = 'convergencia-aura-auth';
const session = (token = 'access', extra = {}) => ({ access_token: token, refresh_token: 'refresh', expires_at: 1900000000, token_type: 'bearer', user: { id: 'persona', email: 'prueba@example.invalid', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Persona de prueba' } }, ...extra });
function app(jar = new CookieJar()) {
  const dom = new JSDOM('', { url: 'https://dev.ladra.convergenciaaura.cl/', runScripts: 'outside-only', cookieJar: jar });
  const w = dom.window; w.eval(code);
  let options; w.supabase = { createClient: (_u, _k, o) => { options = o; return {}; } }; w.eval(client);
  return { w, jar, store: options.auth.storage, cookie(name, value) { w.document.cookie = `${name}=${value}; domain=.convergenciaaura.cl; path=/; Secure`; }, close: () => w.close() };
}
function fragments(a, value, marker = false) {
  const encoded = encodeURIComponent(value), parts = encoded.match(/.{1,3000}/g);
  for (let i = parts.length - 1; i >= 0; i--) a.cookie(key + '.' + i, parts[i]);
  if (marker) a.cookie(key + '.chunks', String(parts.length));
  return parts.length;
}

test('Lee la cookie compartida simple y los dos formatos fragmentados existentes', () => {
  for (const mode of ['simple', 'Ritmos', 'Convergencia']) {
    const a = app();
    try {
      const value = JSON.stringify(session('token', { user: { ...session().user, user_metadata: { full_name: 'María 🌿'.repeat(400) } } }));
      if (mode === 'simple') a.cookie(key, encodeURIComponent(value)); else fragments(a, value, mode === 'Convergencia');
      assert.equal(a.store.getItem(key), value);
    } finally { a.close(); }
  }
});

test('Una sesión grande se guarda por partes menores al límite y se conserva al recargar', () => {
  let a = app(); const jar = a.jar, value = JSON.stringify(session('x'.repeat(7000)));
  try {
    a.store.setItem(key, value);
    assert.ok(a.w.document.cookie.includes(key + '.chunks='));
    for (const item of a.w.document.cookie.split('; ')) assert.ok(item.length < 3200);
    assert.equal(JSON.parse(a.store.getItem(key)).access_token, 'x'.repeat(7000));
    a.close(); a = app(jar);
    assert.equal(JSON.parse(a.store.getItem(key)).refresh_token, 'refresh');
    a.store.setItem(key, JSON.stringify(session('nuevo')));
    assert.doesNotMatch(a.w.document.cookie, /convergencia-aura-auth\./);
    assert.equal(JSON.parse(a.store.getItem(key)).access_token, 'nuevo');
  } finally { a.close(); }
});

test('Admite una cookie simple nueva aunque otro sitio dejara un contador antiguo', () => {
  const a = app();
  try {
    a.cookie(key + '.chunks', '3'); a.cookie(key, encodeURIComponent(JSON.stringify(session('actual'))));
    assert.equal(JSON.parse(a.store.getItem(key)).access_token, 'actual');
  } finally { a.close(); }
});

test('No reconstruye una sesión incompleta o con caracteres dañados', () => {
  const a = app();
  try {
    a.cookie(key + '.0', '%7B'); a.cookie(key + '.2', '%7D'); assert.equal(a.store.getItem(key), null);
    a.store.removeItem(key); a.cookie(key + '.chunks', '2'); a.cookie(key + '.0', '%7B'); assert.equal(a.store.getItem(key), null);
    a.store.removeItem(key); a.cookie(key, '%E0%A4%A'); assert.equal(a.store.getItem(key), null);
    a.store.removeItem(key); a.cookie(key + '.chunks', '100000'); assert.equal(a.store.getItem(key), null);
  } finally { a.close(); }
});

test('Cerrar sesión retira todas las partes, contador y copias propias del host sin tocar otras cookies', () => {
  const a = app();
  try {
    a.store.setItem(key, JSON.stringify(session('x'.repeat(7000))));
    a.w.document.cookie = `${key}=host-anterior; path=/; Secure`;
    a.cookie('preferencia-ladra', 'conservar');
    a.store.removeItem(key);
    assert.equal(a.store.getItem(key), null);
    assert.equal(a.w.document.cookie, 'preferencia-ladra=conservar');
  } finally { a.close(); }
});

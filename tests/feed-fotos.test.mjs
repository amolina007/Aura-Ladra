import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const code = await readFile(new URL('../js/feed-fotos.js', import.meta.url), 'utf8');
const datosCode = await readFile(new URL('../js/feed-datos.js', import.meta.url), 'utf8');
const feedCode = await readFile(new URL('../js/feed.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

async function app({ decodeFails = false, bitmapWorks = false, canvasWorks = true, store = { posts: [], files: new Map() }, actor = 'persona', legacy = [], lostResponse = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://ladra.test', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document;
  const calls = { revoked: [], bitmaps: 0, closed: 0, draws: [] };
  w.fetch = globalThis.fetch;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.URL.createObjectURL = () => 'blob:foto';
  w.URL.revokeObjectURL = url => calls.revoked.push(url);
  w.FileReader = class { constructor() { throw Error('No debe crear base64 de la foto original'); } };
  w.Image = class {
    naturalWidth = 4000; naturalHeight = 3000;
    set src(value) { assert.equal(value, 'blob:foto'); queueMicrotask(() => decodeFails ? this.onerror() : this.onload()); }
  };
  w.createImageBitmap = async () => {
    calls.bitmaps++;
    if (!bitmapWorks) throw Error('Archivo no legible');
    return { width: 4000, height: 3000, close: () => calls.closed++ };
  };
  w.HTMLCanvasElement.prototype.getContext = () => canvasWorks ? { drawImage: (...args) => calls.draws.push(args.slice(1)) } : null;
  w.HTMLCanvasElement.prototype.toBlob = callback => callback(new w.Blob(['foto'], { type: 'image/jpeg' }));
  w.auraLadraDb = {
    auth: { getSession: async () => ({ data: { session: actor ? { user: { id: actor } } : null } }), getUser: async () => ({ data: { user: actor ? { id: actor } : null } }), onAuthStateChange: () => {} },
    storage: { from: () => ({
      getPublicUrl: path => ({ data: { publicUrl: 'https://ladra.test/fotos/' + path } }),
      upload: async (path, blob) => { store.files.set(path, blob); return { data: { path } }; },
      remove: async paths => { paths.forEach(path => store.files.delete(path)); return { data: [] }; },
    }) },
    from(table) {
      const q = { op: 'select', filters: [], select() { return this; }, order() { return this; }, limit() { return this; }, eq(k, v) { this.filters.push([k, v]); return this; }, maybeSingle() { this.one = true; return this; }, insert(v) { this.op = 'insert'; this.value = v; return this; }, update(v) { this.op = 'update'; this.value = v; return this; }, delete() { this.op = 'delete'; return this; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          if (table === 'medios_mascota') return { data: [] };
          let rows = store.posts.filter(p => this.filters.every(([k, v]) => p[k] === v));
          if (this.op === 'insert') {
            if (store.posts.some(p => p.id === this.value.id)) return { error: { code: '23505' } };
            const p = { ...this.value, autor_id: actor, creado_en: new Date().toISOString(), revision: 1, animales: { id: 'luna', nombre: 'Luna' } };
            store.posts.push(p); rows = [p];
            if (lostResponse) { lostResponse = false; throw Error('Respuesta perdida'); }
          }
          if (this.op === 'update') rows.forEach(p => Object.assign(p, this.value, { revision: p.revision + 1 }));
          if (this.op === 'delete') { store.posts = store.posts.filter(p => !rows.includes(p)); rows = []; }
          return { data: this.one ? structuredClone(rows[0] || null) : structuredClone(rows) };
        }).then(resolve, reject); },
      }; return q;
    },
  };
  w.localStorage.setItem('auraladra.demo.feed.v1', JSON.stringify(legacy));
  w.eval(code); w.eval(datosCode); w.eval(feedCode);
  await flush();
  doc.dispatchEvent(new w.CustomEvent('mascotas:cambio', { detail: { animales: [{ id: 'luna', nombre: 'Luna' }] } }));
  doc.querySelector('[data-feed-publicar]').click();
  const form = doc.querySelector('[data-feed-form]');
  form.elements.texto.value = 'Paseo con Luna';
  return {
    w, doc, form, calls, store,
    choose(type = 'image/jpeg', name = 'foto.jpg', size) {
      const file = new w.File(['foto'], name, { type });
      if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
      Object.defineProperty(form.elements.imagen, 'files', { value: [file], configurable: true });
      form.elements.imagen.dispatchEvent(new w.Event('change', { bubbles: true }));
    },
    async submit() { await flush(); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await flush(); },
    posts: () => store.posts,
    message: () => doc.querySelector('[data-feed-message]').textContent,
    retryWithReadablePhoto() { decodeFails = false; canvasWorks = true; },
    close: () => w.close(),
  };
}

test('Fotos JPG, PNG, WebP y JPG sin MIME se reducen sin FileReader; admite historias', async () => {
  for (const [type, name, kind] of [['image/jpeg', 'foto.jpg', 'post'], ['image/png', 'foto.png', 'historia'], ['image/webp', 'foto.webp', 'post'], ['', 'FOTO.JPG', 'post']]) {
    const a = await app();
    try {
      a.choose(type, name); a.form.elements.tipo.value = kind;
      await a.submit();
      assert.equal(a.posts().length, 1);
      assert.equal(a.posts()[0].tipo, kind);
      assert.equal(a.store.files.size, 1);
      assert.deepEqual(a.calls.draws.at(-1), [0, 0, 4000, 3000, 0, 0, 960, 720]);
      assert.deepEqual(a.calls.revoked, ['blob:foto']);
      assert.equal(a.doc.querySelector('[data-feed-dialog]').open, false);
    } finally { a.close(); }
  }
});

test('Si Image no abre el archivo, intenta ImageBitmap y libera ambos recursos', async () => {
  const a = await app({ decodeFails: true, bitmapWorks: true });
  try {
    a.choose(); await a.submit();
    assert.equal(a.posts().length, 1);
    assert.equal(a.calls.bitmaps, 1); assert.equal(a.calls.closed, 1);
    assert.deepEqual(a.calls.revoked, ['blob:foto']);
  } finally { a.close(); }
});

test('Foto ilegible conserva texto, explica cómo reintentar y deja publicar otra foto', async () => {
  const a = await app({ decodeFails: true });
  try {
    a.choose(); await flush();
    assert.match(a.message(), /Google Fotos/);
    await a.submit();
    assert.equal(a.posts().length, 0);
    assert.equal(a.form.elements.texto.value, 'Paseo con Luna');
    assert.equal(a.form.querySelector('[type=submit]').disabled, false);
    assert.equal(a.doc.querySelector('[data-feed-dialog]').open, true);
    a.retryWithReadablePhoto(); a.choose(); await a.submit();
    assert.equal(a.posts().length, 1);
  } finally { a.close(); }
});

test('Un fallo de canvas termina con error recuperable en vez de dejar el envío pendiente', async () => {
  const a = await app({ canvasWorks: false });
  try {
    a.choose(); await a.submit();
    assert.equal(a.posts().length, 0);
    assert.match(a.message(), /preparar la foto/);
    assert.equal(a.form.querySelector('[type=submit]').disabled, false);
  } finally { a.close(); }
});

test('HEIC y archivos de más de 20 MB se explican antes de intentar decodificar', async () => {
  const a = await app();
  try {
    a.choose('image/heic', 'foto.heic'); await flush(); assert.match(a.message(), /expórtala como JPG/);
    a.choose('image/jpeg', 'foto.jpg', 21 * 1024 * 1024); await flush(); assert.match(a.message(), /20 MB/);
    assert.equal(a.posts().length, 0); assert.equal(a.calls.revoked.length, 0);
  } finally { a.close(); }
});

test('Pulsar Publicar dos veces durante la lectura guarda una sola publicación', async () => {
  const a = await app();
  try {
    a.choose();
    const one = a.submit(); const two = a.submit(); await Promise.all([one, two]);
    assert.equal(a.posts().length, 1);
  } finally { a.close(); }
});

test('La publicación aparece en otro navegador sin copiar localStorage; editar y eliminar se reflejan allí', async () => {
  const store = { posts: [], files: new Map() };
  const a = await app({ store });
  let b;
  try {
    a.choose(); await a.submit();
    b = await app({ store });
    assert.equal(b.doc.querySelectorAll('.fd-post').length, 1);
    assert.equal(JSON.parse(b.w.localStorage.getItem('auraladra.demo.feed.v1')).length, 0);
    b.doc.querySelector('[data-feed-dialog]').close();
    [...b.doc.querySelectorAll('.fd-propias button')].find(n => n.textContent === 'Editar').click();
    b.form.elements.texto.value = 'Texto editado desde el celular';
    b.form.dispatchEvent(new b.w.Event('input', { bubbles: true }));
    // El selector de archivos de jsdom conserva el estado vacío en esta segunda sesión.
    await b.submit();
    assert.equal(store.posts[0].texto, 'Texto editado desde el celular');
    assert.equal(store.posts[0].revision, 2);
    assert.equal(store.files.size, 1);
    [...b.doc.querySelectorAll('.fd-propias button')].find(n => n.textContent === 'Eliminar').click();
    assert.equal(store.posts.length, 1, 'La eliminación exige confirmar');
    b.doc.querySelector('[data-feed-confirmar-borrado]').click(); await flush();
    assert.equal(store.posts.length, 0); assert.equal(store.files.size, 0);
  } finally { a.close(); b?.close(); }
});

test('Sin ejemplos al iniciar o con una demo antigua; conserva las publicaciones locales reales', async () => {
  const legacy = [{ id: 'ej-1', ejemplo: true }, { id: 'real', tipo: 'post', mascota: { id: 'luna', nombre: 'Leia' }, texto: 'Mi foto anterior', creado: new Date().toISOString() }];
  const a = await app({ legacy });
  try {
    assert.equal(a.doc.querySelectorAll('.fd-post').length, 1);
    assert.match(a.doc.querySelector('.fd-post').textContent, /Mi foto anterior/);
    assert.match(a.doc.querySelector('.fd-post').textContent, /Compartir entre dispositivos/);
    assert.equal(JSON.parse(a.w.localStorage.getItem('auraladra.demo.feed.v1')).length, 1);
    assert.equal(a.store.posts.length, 0, 'No comparte automáticamente archivos locales');
  } finally { a.close(); }
});

test('Una respuesta perdida se reintenta con la misma clave y no duplica la foto ni la publicación', async () => {
  const a = await app({ lostResponse: true });
  try {
    a.choose(); await a.submit();
    assert.equal(a.posts().length, 1);
    assert.equal(a.doc.querySelector('[data-feed-dialog]').open, true);
    await a.submit();
    assert.equal(a.posts().length, 1); assert.equal(a.store.files.size, 1);
    assert.equal(a.doc.querySelector('[data-feed-dialog]').open, false);
  } finally { a.close(); }
});

test('El recorte guarda exactamente el área elegida, con límites al mover y acercar', async () => {
  const a = await app();
  try {
    a.choose(); await flush();
    a.form.elements.encuadre.value = '1';
    a.form.elements.foto_zoom.value = '2';
    a.form.elements.foto_x.value = '100'; a.form.elements.foto_y.value = '-100';
    a.form.elements.foto_zoom.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    await a.submit();
    assert.deepEqual(a.calls.draws.at(-1), [2500, 0, 1500, 1500, 0, 0, 960, 960]);
    const r = a.w.auraLadraFeedFotos.rectangulo(4000, 3000, 1, 3, 1000, -1000);
    assert.equal(r.x + r.w, 4000); assert.equal(r.y, 0);
  } finally { a.close(); }
});

test('No muestra controles para editar o eliminar una publicación de otra persona', async () => {
  const a = await app(); let b;
  try {
    a.choose(); await a.submit();
    b = await app({ store: a.store, actor: 'otra-persona' });
    assert.equal(b.doc.querySelectorAll('.fd-post').length, 1);
    assert.equal(b.doc.querySelector('.fd-post .fd-propias'), null);
  } finally { a.close(); b?.close(); }
});

test('Compartir una foto local antigua la guarda en el servidor y retira solo esa copia local', async () => {
  const id = '20000000-0000-0000-0000-000000000001';
  const legacy = [{ id, tipo: 'post', mascota: { id: 'luna', nombre: 'Leia' }, texto: 'Foto de Leia', imagen: 'data:image/jpeg;base64,Zm90bw==', creado: new Date().toISOString() }];
  const a = await app({ legacy });
  try {
    a.doc.querySelector('[data-feed-dialog]').close();
    [...a.doc.querySelectorAll('.fd-propias button')].find(n => n.textContent === 'Compartir entre dispositivos').click();
    await a.submit();
    assert.equal(a.store.posts.length, 1); assert.equal(a.store.posts[0].id, id);
    assert.equal(a.store.files.size, 1);
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem('auraladra.demo.feed.v1')), []);
  } finally { a.close(); }
});

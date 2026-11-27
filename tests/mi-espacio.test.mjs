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

test('Mi perfil conserva las rutas anteriores y sus opciones privadas sin duplicar acceso', async () => {
  const a = await app();
  try {
    assert.equal(a.doc.querySelector('[data-ladra-tabbar-link=perfil]').textContent.trim(), 'Mi perfil');
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

test('Las pestañas cambian el contenido y admiten teclado; las opciones privadas se mantienen separadas', async () => {
 const a=await app();
 try {
  const historia=a.doc.querySelector('[data-profile-content-tab=historia]');historia.click();
  assert.equal(historia.getAttribute('aria-selected'),'true');
  assert.equal(a.doc.querySelector('[data-profile-content-panel=post]').hidden,true);
  assert.equal(a.doc.querySelector('[data-profile-content-panel=historia]').hidden,false);
  historia.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(a.doc.querySelector('[data-profile-content-tab=aportes]').getAttribute('aria-selected'),'true');
  assert.equal(a.doc.querySelector('[data-profile-content-panel=aportes]').hidden,false);
  assert.equal(a.doc.querySelector('.profile-content-heading [data-space-crear]').hidden,true);
  assert.ok(a.doc.querySelector('.profile-private [data-space-guardados]'));
 }finally{a.close()}
});

test('La galería combina publicaciones propias y medios de sus mascotas, excluye otras mascotas y se vacía al salir',async()=>{
 const a=await app();
 try{
  a.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  a.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new a.w.Event('close'));};
  a.w.auraLadraFeed.propias=async()=>[{id:'mio',tipo:'post',texto:'Mi momento',mascota:{id:'pet',nombre:'Leia'},imagen:'https://photos.example/own.jpg'}];
  a.w.auraLadraFeed.posts=()=>[{id:'foto-ficha',tipo:'post',compartido:true,mascota:{id:'pet',nombre:'Leia'},imagen:'https://photos.example/pet.jpg'},{id:'ajeno',tipo:'post',compartido:true,mascota:{id:'otra'},imagen:'https://photos.example/other.jpg'}];
  a.doc.dispatchEvent(new a.w.CustomEvent('feed:cambio'));await flush();
  assert.equal(a.doc.querySelectorAll('[data-profile-gallery=post] button').length,2);
  assert.equal(a.doc.querySelector('[data-space-open=ajeno]'),null);
  a.doc.querySelector('[data-space-open=mio]').click();
  assert.equal(a.doc.querySelector('[data-profile-post-dialog]').open,true);
  assert.match(a.doc.querySelector('[data-profile-post-content]').textContent,/Mi momento/);
  await a.user(null);
  assert.equal(a.doc.querySelector('[data-profile-post-dialog]').open,false);
  assert.equal(a.doc.querySelector('[data-profile-post-content]').children.length,0);
  assert.equal(a.doc.querySelectorAll('[data-profile-gallery] img').length,0);
 }finally{a.close()}
});

test('Una respuesta de la foto Aura anterior no sustituye la identidad de la sesión nueva',async()=>{
 const main=await readFile(new URL('../js/main.js',import.meta.url),'utf8');
 const a=main.indexOf("  let coreAvatarUrl = ''"),b=main.indexOf('  const renderMyProfilePets',a);
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;const pendientes=[];
 w.currentSession={user:{id:'anterior'}};w.ownPublicProfile=null;w.renderMyProfile=()=>{};
 w.db={schema:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>pendientes.push(resolve))})})})}),storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:'https://photos.example/'+p}})})}};
 try{
  w.eval(main.slice(a,b)+'\nwindow.cargarAvatar=loadCoreAvatar;window.fotoActual=()=>coreAvatarUrl;');
  const anterior=w.cargarAvatar();w.currentSession={user:{id:'nueva'}};const nueva=w.cargarAvatar();
  pendientes[1]({data:{avatar_path:'nueva.jpg'}});await nueva;
  pendientes[0]({data:{avatar_path:'anterior.jpg'}});await anterior;
  assert.equal(w.fotoActual(),'https://photos.example/nueva.jpg');
 }finally{w.close()}
});

test('El visor existe antes de que el navegador inicialice su controlador',()=>{
 assert.ok(html.indexOf('data-profile-post-dialog') < html.indexOf('src="js/mi-espacio.js'));
});

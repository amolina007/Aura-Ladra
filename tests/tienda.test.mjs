import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../data/tienda.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../js/tienda.js',import.meta.url),'utf8');
const views=await readFile(new URL('../js/vistas.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<3;i++)await new Promise(r=>setTimeout(r,0));};
async function app(hash='#ayudar',fail=false){
 const dom=new JSDOM(html,{url:'https://ladra.test/'+hash,runScripts:'outside-only'});
 const w=dom.window;w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 let requests=[];w.fetch=async(url)=>{requests.push(url);if(fail){fail=false;throw Error('Sin conexión');}return {ok:true,json:async()=>structuredClone(catalog)};};
 w.eval(views);w.eval(source);await flush();return {dom,w,requests,doc:w.document};
}
test('Usar AC muestra Causas y Tienda; enlace directo a tienda conserva la sección 4',async()=>{
 const a=await app('#tienda');try{
  assert.equal(a.doc.body.dataset.vista,'ayudar');
  assert.equal(a.doc.querySelector('#causas').hidden,true);
  assert.equal(a.doc.querySelector('#tienda').hidden,false);
  a.doc.querySelector('[data-market-tab=causas]').click();
  assert.equal(a.doc.querySelector('#causas').hidden,false);
  assert.equal(a.doc.querySelector('#tienda').hidden,true);
  a.doc.querySelector('[data-market-tab=causas]').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(a.doc.querySelector('#tienda').hidden,false);
  assert.equal(a.doc.querySelector('[data-market-tab=tienda]').getAttribute('aria-selected'),'true');
  assert.equal(a.doc.querySelector('[data-tabbar-link=ayudar]').textContent.trim(),'Usar AC');
  assert.equal(a.doc.querySelector('[data-tabbar-link=ayudar]').getAttribute('aria-current'),'true');
  assert.equal(a.doc.querySelector('#causas-title').textContent,'Causas comunitarias');
  assert.equal(a.doc.querySelector('#tienda-title').textContent,'Tienda');
  assert.equal(a.doc.querySelectorAll('[data-puestos-resumen]').length,1);
  assert.equal(a.doc.querySelector('[data-ayudar-vista-lista]').hidden,false);
  assert.equal(a.doc.querySelector('[data-ayudar-filtros]').closest('#causas')?.id,'causas');
  a.w.auraLadraVistas.ir('comida-agua');
  assert.equal(a.doc.querySelector('[data-tabbar-link=ayudar]').getAttribute('aria-current'),'true');
  assert.equal(a.doc.querySelector('#comida-agua .market-return').getAttribute('href'),'#causas');
 }finally{a.dom.window.close();}
});
test('AirTag a 30.000 AC abre su ficha y consulta al perfil correcto y muestra espacio de compra',async()=>{
 const a=await app('#tienda');try{
  const button=a.doc.querySelector('[data-producto]');button.click();
  const dialog=a.doc.querySelector('[data-tienda-dialog]');assert.equal(dialog.open,true);
  assert.match(dialog.textContent,/AirTag \+ porta AirTag para collar de perro/);
  assert.match(dialog.querySelector('.shop-price').textContent,/30.000 AC/);
  assert.match(dialog.textContent,/Alejandro/);assert.match(dialog.textContent,/collar no incluido/);
  const link=dialog.querySelector('.shop-contact');assert.equal(link.href,'https://core.convergenciaaura.cl/perfil.html?u=amolina007');assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);
  assert.deepEqual(a.requests,['data/tienda.json?v=2']);
  a.doc.querySelector('[data-tienda-cerrar]').click();assert.equal(dialog.open,false);assert.equal(a.doc.activeElement,button);
 }finally{a.dom.window.close();}
});
test('Búsqueda por vendedor y producto; estado vacío, limpiar y reintento de carga',async()=>{
 const a=await app('#ayudar',true);try{
  assert.match(a.doc.querySelector('[data-tienda-lista]').textContent,/No pudimos cargar/);
  a.doc.querySelector('[data-tienda-reintentar]').click();await flush();assert.equal(a.doc.querySelectorAll('.shop-card').length,1);
  const input=a.doc.querySelector('[data-tienda-busqueda] input');
  for(const query of ['ALEJANDRO','AirTag']){input.value=query;input.dispatchEvent(new a.w.Event('input',{bubbles:true}));assert.equal(a.doc.querySelectorAll('.shop-card').length,1);}
  input.value='inexistente';input.dispatchEvent(new a.w.Event('input',{bubbles:true}));assert.equal(a.doc.querySelectorAll('.shop-card').length,0);assert.match(a.doc.querySelector('[data-tienda-lista]').textContent,/No encontramos/);
  a.doc.querySelector('[data-tienda-busqueda]').reset();await flush();assert.equal(a.doc.querySelectorAll('.shop-card').length,1);
 }finally{a.dom.window.close();}
});

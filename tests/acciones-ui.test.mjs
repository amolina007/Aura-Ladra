import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../js/acciones.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
async function app(demo=false){
 const dom=new JSDOM(html,{url:'https://ladra.test/#causas',runScripts:'outside-only'}),w=dom.window;
 w.Element.prototype.scrollIntoView=()=>{};
 w.auraLadraPuestos={lista:()=>[{estado:'campana'}]};
 w.auraLadraDb={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}},rpc:async()=>demo?{error:{code:'PGRST202',message:'Could not find function'}}:{data:[]}};
 w.eval(source);await flush();return {dom,w,d:w.document};
}
test('El resumen de acciones no cuenta campañas de otro bloque y muestra estado vacío',async()=>{
 const a=await app();try{assert.equal(a.d.querySelector('[data-ayd-tiles] strong').textContent,'0');assert.match(a.d.querySelector('[data-ayudar-lista]').textContent,/Aún no hay acciones/);assert.equal(a.d.querySelector('.funding-filters').open,false);}finally{a.w.close();}
});
test('Tarjetas demo conservan precio en pesos, filtros y apertura del detalle',async()=>{
 const a=await app(true);try{
 assert.ok(a.d.querySelectorAll('.funding-card').length>0);assert.match(a.d.querySelector('.funding-card').textContent,/demo/);assert.match(a.d.querySelector('.funding-amount').textContent,/CLP/);
 const category=a.d.querySelector('[name=categoria]');category.value='salud';category.dispatchEvent(new a.w.Event('change',{bubbles:true}));await flush();
 for(const card of a.d.querySelectorAll('.funding-card'))assert.equal(card.querySelector('.funding-category').textContent,'Salud');
 a.d.querySelector('[data-abrir]').click();await flush();assert.equal(a.d.querySelector('[data-ayudar-detalle]').hidden,false);assert.ok(a.d.querySelector('[data-detalle-titulo]'));
 }finally{a.w.close();}
});

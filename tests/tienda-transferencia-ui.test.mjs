import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../js/tienda-transferencia.js',import.meta.url),'utf8');
const product=JSON.parse(await readFile(new URL('../data/tienda.json',import.meta.url),'utf8')).productos[0];
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setTimeout(r,0));};
async function app(options={}){
 const dom=new JSDOM('<section data-compra-ac></section>',{url:'https://ladra.test',runScripts:'outside-only'});
 const w=dom.window,calls=[];let authChange;let user=options.signedOut?null:{id:'comprador-de-prueba'};
 w.auraLadraDb={auth:{getSession:async()=>({data:{session:user?{user}:null}}),onAuthStateChange:fn=>{authChange=fn;}},schema:name=>{assert.equal(name,'public');return {rpc:async(name,args)=>{
 if(name==='fn_ac_transferir'){calls.push(structuredClone(args));if(options.lost && calls.length===1)return {error:{message:'Failed to fetch'}};return {data:{operacion_id:'12345678-1234-1234-1234-123456789abc'}};}
 return {data:name==='fn_ac_mi_saldo'?{disponible:options.balance??60000,operaciones_habilitadas:true}:name==='fn_ac_mi_alias'?(options.self?'amolina007':'comprador'):{requerida:true,aceptada:!options.termsPending}};
 }}}};
 w.eval(source);
 const open=async()=>{w.document.dispatchEvent(new w.CustomEvent('tienda:producto',{detail:{producto:product}}));await flush();};
 await open();
 const click=selector=>{const e=w.document.querySelector(selector);assert.ok(e,selector);e.click();};
 const review=()=>{w.document.querySelector('select').value='acordada';click('[data-compra-revisar]');};
 return {dom,w,calls,open,click,review,change:async()=>{user={id:'otro-comprador'};authChange();await flush();},text:()=>w.document.body.textContent};
}
test('Compra exige elegir entrega y confirmar monto y vendedor; doble clic no duplica',async()=>{
 const a=await app();try{
 a.click('[data-compra-revisar]');assert.equal(a.w.document.querySelector('[data-compra-confirmar]'),null);
 a.review();assert.match(a.text(),/30.000 AC/);assert.match(a.text(),/Alejandro · @amolina007/);assert.match(a.text(),/Entrega acordada con el comprador/);assert.equal(a.calls.length,0);
 a.click('[data-compra-confirmar]');a.click('[data-compra-confirmar]');await flush();assert.equal(a.calls.length,1);
 assert.equal(a.calls[0].p_monedas,30000);assert.equal(a.calls[0].p_destino_alias,'amolina007');assert.match(a.calls[0].p_referencia,/entrega=acordada_con_comprador/);
 assert.match(a.text(),/Transferencia realizada/);await a.open();assert.equal(a.w.document.querySelector('[data-compra-confirmar]'),null);assert.equal(a.calls.length,1);
 }finally{a.dom.window.close();}
});
test('Respuesta perdida y reapertura conservan exactamente la misma clave',async()=>{
 const a=await app({lost:true});try{a.review();a.click('[data-compra-confirmar]');await flush();assert.match(a.text(),/evitar duplicados/);await a.open();a.click('[data-compra-confirmar]');await flush();assert.deepEqual(a.calls[0],a.calls[1]);assert.match(a.text(),/Transferencia realizada/);}finally{a.dom.window.close();}
});
test('Sesión, saldo, términos y publicación propia impiden transferir',async()=>{
 for(const [options,message] of [[{signedOut:true},/Inicia sesión/],[{balance:10},/Necesitas 30.000/],[{termsPending:true},/Acepta los términos/],[{self:true},/publicación es tuya/]]){
 const a=await app(options);try{assert.match(a.text(),message);assert.equal(a.w.document.querySelector('[data-compra-revisar]'),null);assert.equal(a.calls.length,0);}finally{a.dom.window.close();}
 }
});
test('Cambiar de cuenta descarta la revisión anterior',async()=>{
 const a=await app();try{a.review();await a.change();assert.equal(a.w.document.querySelector('[data-compra-confirmar]'),null);assert.equal(a.calls.length,0);}finally{a.dom.window.close();}
});

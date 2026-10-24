import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../js/patrocinio-ac.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
async function app(options={}){
 const dom=new JSDOM('<section><div data-patrocinio-ac></div></section><script src="https://core.convergenciaaura.cl/js/aura-hub.js"></script>',{url:'https://ladra.test',runScripts:'outside-only'});
 const w=dom.window;const calls=[];let fail=!!options.fail;
 let data={habilitado:true,estado:'recaudando',meta_ac:1000,recaudado_ac:0,reservado_ac:0,liberado_ac:0,devuelto_ac:0,mi_aporte_ac:0,soy_responsable:false,puedo_moderar:false,hitos:[],...options.state};
 let recorded=new Set();
 w.crypto.randomUUID=randomUUID;
 w.auraLadraDb={auth:{getSession:async()=>({data:{session:options.anon?null:{user:{id:'usuario'}}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='estado_patrocinio_ac')return {data};
  if(name==='saldo_patrocinio_ac')return {data:{disponible:200,operaciones_habilitadas:true,terminos:{aceptada:!options.terms}}};
  if(name==='patrocinar_campana_ac'){
   if(!recorded.has(args.p_clave)){recorded.add(args.p_clave);data={...data,recaudado_ac:args.p_monto,reservado_ac:args.p_monto,mi_aporte_ac:args.p_monto};}
   if(fail){fail=false;return {error:{message:'Failed to fetch'}};}
   return {data:{...data,repetida:recorded.size===1}};
  }
  return {data};
 }};
 w.eval(source);w.document.dispatchEvent(new w.CustomEvent('puestos:campana',{detail:{id:'campana'}}));await flush();
 return {w,dom,calls,recorded,box:w.document.querySelector('[data-patrocinio-ac]')};
}
function submit(a,form,submitter){form.dispatchEvent(new a.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter}));}

test('Solo se reserva tras revisar monto y pulsar la confirmación explícita',async()=>{
 const a=await app();try{
  a.box.querySelector('[name=monto]').value='100';submit(a,a.box.querySelector('form'));await flush();assert.match(a.box.textContent,/Confirmar reserva de 100 AC/);
  assert.equal(a.calls.filter(x=>x.name==='patrocinar_campana_ac').length,0);
  const btn=a.box.querySelector('[data-ac-confirmar]');btn.click();btn.click();await flush();
  assert.equal(a.calls.filter(x=>x.name==='patrocinar_campana_ac').length,1);assert.match(a.box.textContent,/Patrocinio confirmado/);assert.equal(a.recorded.size,1);
 }finally{a.dom.window.close();}
});
test('Respuesta perdida conserva clave y reintentar no duplica la reserva',async()=>{
 const a=await app({fail:true});try{
  a.box.querySelector('[name=monto]').value='100';submit(a,a.box.querySelector('form'));await flush();a.box.querySelector('[data-ac-confirmar]').click();await flush();
  assert.match(a.box.textContent,/confirmación pendiente/);a.box.querySelector('[data-ac-confirmar]').click();await flush();
  const calls=a.calls.filter(x=>x.name==='patrocinar_campana_ac');assert.equal(calls.length,2);assert.equal(calls[0].args.p_clave,calls[1].args.p_clave);assert.equal(a.recorded.size,1);
 }finally{a.dom.window.close();}
});
test('Anónimo y términos pendientes muestran el siguiente paso sin permitir aporte',async()=>{
 for(const options of [{anon:true},{terms:true}]){const a=await app(options);try{assert.equal(a.box.querySelector('[data-ac-monto]'),null);assert.ok(a.box.querySelector('a'));assert.equal(a.calls.filter(x=>x.name==='patrocinar_campana_ac').length,0);}finally{a.dom.window.close();}}
});
test('Moderación exige confirmar evidencia; la autorización definitiva pertenece al servidor',async()=>{
 const a=await app({state:{estado:'meta_alcanzada',recaudado_ac:1000,reservado_ac:1000,puedo_moderar:true,hitos:[{id:'hito',titulo:'Instalación documentada',monto_ac:100,evidencia_url:'https://example.org/foto',estado:'en_revision'}]}});
 try{const f=a.box.querySelector('[data-ac-revision]');f.querySelector('textarea').value='Trabajo y permisos revisados.';submit(a,f,f.querySelector('[value=aprobar]'));await flush();assert.equal(a.calls.filter(x=>x.name==='revisar_hito_patrocinio_ac').length,0);f.querySelector('[type=checkbox]').checked=true;submit(a,f,f.querySelector('[value=aprobar]'));await flush();assert.equal(a.calls.filter(x=>x.name==='revisar_hito_patrocinio_ac').length,1);assert.equal(a.box.querySelector('[value=aprobar]').disabled,false);}finally{a.dom.window.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,CookieJar} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const code=await readFile(new URL('../js/login-google.js',import.meta.url),'utf8');
const compact=await readFile(new URL('../js/sesion-cookie.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/supabase-client.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
async function app({url='https://dev.ladra.convergenciaaura.cl/?auth=magic&token_hash=secret#servicios',session=null,fail=false,stored=null}={}){
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window;let callback;const calls=[];
 if(stored)w.sessionStorage.setItem('ladra-google-retorno',stored);
 w.auraLadraVistas={mostrar:view=>calls.push({view})};
 w.auraLadraDb={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:f=>{callback=f},signInWithOAuth:async payload=>{calls.push(payload);return {error:fail?{code:'provider_disabled'}:null}}}};
 w.eval(code);await flush();return {w,doc:w.document,calls,auth:async value=>{session=value;callback(value?'SIGNED_IN':'SIGNED_OUT',value);await flush()},close:()=>w.close()};
}
test('Google se ofrece en cuenta y cabecera junto al correo, y usa el cliente propio de Ladra',async()=>{
 const a=await app();try{
 assert.equal(a.doc.querySelectorAll('[data-login-google]').length,2);assert.equal(a.doc.querySelectorAll('[data-magic-form]').length,2);
 a.doc.querySelector('[data-login-google]').click();a.doc.querySelectorAll('[data-login-google]')[1].click();await flush();
 assert.equal(a.calls.length,1);assert.equal(a.calls[0].provider,'google');assert.equal(a.calls[0].options.scopes,'openid email profile');
 assert.equal(a.calls[0].options.redirectTo,'https://dev.ladra.convergenciaaura.cl/?auth=google');
 assert.equal(a.calls[0].options.queryParams.prompt,'select_account');assert.equal(a.w.sessionStorage.getItem('ladra-google-retorno'),'servicios');
 }finally{a.close()}
});
test('Con sesión se oculta Google y al cerrar sesión vuelve a estar disponible',async()=>{
 const a=await app({session:{user:{id:'persona'}}});try{
 assert.ok([...a.doc.querySelectorAll('[data-login-google-zone]')].every(n=>n.hidden));await a.auth(null);
 assert.ok([...a.doc.querySelectorAll('[data-login-google-zone]')].every(n=>!n.hidden));
 }finally{a.close()}
});
test('Error de red habilita el reintento sin eliminar el acceso por correo',async()=>{
 const a=await app({fail:true});try{a.doc.querySelector('[data-login-google]').click();await flush();assert.equal(a.doc.querySelector('[data-login-google]').disabled,false);assert.match(a.doc.querySelector('[data-login-google-message]').textContent,/correo/);assert.equal(a.doc.querySelectorAll('[data-magic-form]').length,2)}finally{a.close()}
});
test('Retorno a la sección inicial una sola vez y cancelación en español',async()=>{
 let a=await app({url:'https://dev.ladra.convergenciaaura.cl/?auth=google',session:{user:{id:'persona'}},stored:'servicios'});try{
 assert.equal(a.w.location.hash,'#servicios');await a.auth({user:{id:'persona'}});assert.equal(a.w.location.hash,'#servicios');assert.equal(a.calls.filter(c=>c.view).length,1);
 }finally{a.close()}
 a=await app({url:'https://dev.ladra.convergenciaaura.cl/?auth=google#error=access_denied&error_description=private',stored:'servicios'});try{assert.match(a.doc.querySelector('[data-login-google-message]').textContent,/Cancelaste/);assert.equal(a.w.location.search,'');assert.equal(a.w.location.hash,'#cuenta')}finally{a.close()}
});
test('Retorno manipulado no navega fuera del sitio',async()=>{
 const a=await app({url:'https://dev.ladra.convergenciaaura.cl/?auth=google',session:{user:{id:'persona'}},stored:'https://evil.example'});try{assert.equal(a.w.location.href,'https://dev.ladra.convergenciaaura.cl/#cuenta')}finally{a.close()}
});
test('Una ruta con doble barra mantiene el retorno dentro del origen de Ladra',async()=>{
 const a=await app({url:'https://dev.ladra.convergenciaaura.cl//evil.example#cuenta'});try{a.doc.querySelector('[data-login-google]').click();await flush();assert.equal(new URL(a.calls[0].options.redirectTo).origin,'https://dev.ladra.convergenciaaura.cl')}finally{a.close()}
});
test('Sesión grande de Google cabe en cookie y se conserva al recargar, sin tokens de proveedor',()=>{
 const jar=new CookieJar();
 const setup=()=>{const dom=new JSDOM('',{url:'https://dev.ladra.convergenciaaura.cl/',runScripts:'outside-only',cookieJar:jar});let options;dom.window.supabase={createClient:(_u,_k,o)=>{options=o;return {}}};dom.window.eval(compact);dom.window.eval(client);return {dom,options}};
 let a=setup();const key=a.options.auth.storageKey;
 const session={access_token:'access-jwt',refresh_token:'refresh-token',expires_at:1900000000,token_type:'bearer',provider_token:'x'.repeat(6000),provider_refresh_token:'z'.repeat(1000),user:{id:'persona',email:'test@example.invalid',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Persona de prueba',extra:'y'.repeat(6000)},identities:[{id:'identity',provider:'google',identity_data:{data:'z'.repeat(6000)}}]}};
 a.options.auth.storage.setItem(key,JSON.stringify(session));assert.ok(a.dom.window.document.cookie.length<4000);a.dom.window.close();
 a=setup();const restored=JSON.parse(a.options.auth.storage.getItem(key));assert.equal(restored.access_token,session.access_token);assert.equal(restored.refresh_token,session.refresh_token);assert.deepEqual(restored.user.app_metadata,session.user.app_metadata);assert.equal(restored.provider_token,undefined);assert.equal(restored.user.identities[0].provider,'google');
 a.options.auth.storage.removeItem(key);assert.equal(a.options.auth.storage.getItem(key),null);a.dom.window.close();
});
test('En el alias de Netlify continúa usando el almacenamiento normal del navegador',()=>{
 const dom=new JSDOM('',{url:'https://dev--auraladra-convergencia-aura.netlify.app',runScripts:'outside-only'});let options;
 dom.window.supabase={createClient:(_u,_k,o)=>{options=o;return {}}};dom.window.eval(compact);dom.window.eval(client);
 assert.equal(options.auth.storage,undefined);assert.equal(options.auth.persistSession,true);dom.window.close();
});

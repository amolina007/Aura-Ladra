import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';

const base = await readFile(new URL('../supabase/migrations/20261105205645_ladra_avisos_externos.sql',import.meta.url),'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261106011601_ladra_avisos_contacto_y_fotos.sql',import.meta.url),'utf8');
const owner='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const path=`${owner}/${other}.webp`;

test('Contacto público, galería validada y edición exclusiva del autor', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema ladra;
   create table auth.users(id uuid primary key);
   insert into auth.users values('${owner}'),('${other}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,ladra to anon,authenticated;`);
  await db.exec(base.split('insert into storage.buckets')[0]);
  await db.exec(migration);
  const as=async(id,role='authenticated')=>{await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec(`set role ${role}`);};
  await as(owner);
  await db.query("insert into ladra.avisos_externos(nombre,zona,fuente,celular,domicilio,fotos_paths) values('Prueba','Maipú','SOSAFE','+56 9 1234 5678','Dirección de prueba',$1)",[[path]]);
  await assert.rejects(db.query('update ladra.avisos_externos set fotos_paths=$1',[[`${other}/${owner}.webp`]]),/check constraint/i);
  await assert.rejects(db.query('update ladra.avisos_externos set fotos_paths=$1',[[...Array(7).fill(path)]]),/check constraint/i);
  await assert.rejects(db.exec("update ladra.avisos_externos set celular='abc'"),/check constraint/i);
  await as('','anon');
  const row=(await db.query('select * from ladra.avisos_externos')).rows[0];
  assert.equal(row.celular,'+56 9 1234 5678'); assert.equal(row.domicilio,'Dirección de prueba'); assert.deepEqual(row.fotos_paths,[path]);
  await as(other);
  assert.equal((await db.query("update ladra.avisos_externos set domicilio='Ajeno' returning id")).rows.length,0);
  await as(owner); await db.exec("update ladra.avisos_externos set estado='retirado'");
  await as('','anon'); assert.equal((await db.query('select * from ladra.avisos_externos')).rows.length,0);
 } finally {await db.close();}
});

test('Formulario: fotos múltiples, contacto público, conservación, eliminación y límite',async()=>{
 const dom=new JSDOM('<button data-externo-nuevo>Agregar</button><p data-externos-mensaje></p><div data-externos-lista></div><div data-externos-propios></div>',{url:'https://example.test',runScripts:'outside-only'});
 const w=dom.window; const writes=[]; let uploads=0;
 let rows=[{id:'aviso',autor_id:owner,nombre:'Luna',zona:'Maipú',fuente:'SOSAFE',estado:'extraviada',foto_path:path,celular:'+56 9 1234 5678',domicilio:'<b>Dirección</b>'}];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.auraLadraServiciosFotos={validate:()=>{},prepare:async()=>new w.Blob(['foto'])};
 w.auraLadraDb={auth:{onAuthStateChange:()=>{},getSession:async()=>({data:{session:{user:{id:owner}}}})},storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:`https://example.test/${p}`}}),upload:async()=>{uploads++;return {};}})},from:()=>{
  let payload;
  const q={select:()=>q,order:async()=>({data:rows}),eq:()=>q,update:p=>{payload=p;return q;},insert:p=>{payload=p;return q;},single:async()=>{writes.push(payload);rows=[{...rows[0],...payload}];return {data:{id:'aviso'}};}};return q;
 }};
 const tick=()=>new Promise(r=>setTimeout(r,15));
 try {
  w.eval(await readFile(new URL('../js/avisos-externos.js',import.meta.url),'utf8')); await tick();
  assert.match(w.document.querySelector('[data-externos-lista]').textContent,/Dirección/);
  assert.equal(w.document.querySelector('[data-externos-lista] b'),null);
  assert.equal(w.document.querySelector('a[href^="tel:"]').getAttribute('href'),'tel:+56912345678');
  const form=w.document.querySelector('form');
  const edit=()=>w.document.querySelector('[data-externo-editar]').click();
  const submit=async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
  edit(); assert.equal(form.elements.foto.multiple,true);
  await submit(); assert.deepEqual(Array.from(writes.at(-1).fotos_paths),[path]);
  edit();
  Object.defineProperty(form.elements.foto,'files',{configurable:true,value:[{name:'a.jpg'},{name:'b.jpg'}]});
  await submit(); assert.equal(writes.at(-1).fotos_paths.length,3); assert.equal(uploads,2);
  edit(); Object.defineProperty(form.elements.foto,'files',{configurable:true,value:Array(4).fill({name:'extra.jpg'})});
  const before=writes.length; await submit(); assert.equal(writes.length,before); assert.equal(uploads,2);
  assert.match(w.document.querySelector('[data-form-status]').textContent,/hasta 6 fotos/);
  Object.defineProperty(form.elements.foto,'files',{configurable:true,value:[]});
  while(w.document.querySelector('[data-quitar-foto]')) w.document.querySelector('[data-quitar-foto]').click();
  await submit(); assert.equal(writes.at(-1).foto_path,null); assert.equal(writes.at(-1).fotos_paths.length,0);
 } finally {dom.window.close();}
});

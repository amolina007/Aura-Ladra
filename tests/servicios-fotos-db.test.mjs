import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Fotos y edición: aislamiento frente a permisos heredados, revisión e historial',async t=>{
 const db=new PGlite(),owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 const path=owner+'/10000000-0000-0000-0000-000000000001.webp',replacement=owner+'/10000000-0000-0000-0000-000000000002.webp';
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]||{})[0];
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 let service;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema ladra;create schema storage;
   create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table ladra.animales(id uuid primary key,nombre text,creado_por uuid,es_conmemorativa boolean default false);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
   create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
   grant usage on schema auth,ladra,storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
   alter table storage.objects enable row level security;
   create policy inherited_select on storage.objects for select using(true);
   create policy inherited_insert on storage.objects for insert with check(true);
   create policy inherited_update on storage.objects for update using(true) with check(true);
   create policy inherited_delete on storage.objects for delete using(true);`);
  for(const id of [owner,other])await db.query('insert into auth.users values($1)',[id]);
  for(const filename of ['20261028023325_ladra_servicios_y_consultas.sql','20261028031950_ladra_servicios_fotos_y_edicion.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'));
  await t.test('Solo el propietario sube y lee su carpeta aunque existan políticas amplias',async()=>{
   await as(other);await assert.rejects(db.query("insert into storage.objects(bucket_id,name)values('servicios-ladra',$1)",[path]),/row-level security/i);
   await as(owner);await db.query("insert into storage.objects(bucket_id,name)values('servicios-ladra',$1)",[path]);
   service=await scalar("insert into ladra.servicios(titulo,prestador,categoria,zona,modalidad,descripcion,foto_path)values('Servicio','Prestador','estetica','Maipú','local','Descripción suficientemente larga de la prestación.',$1)returning id",[path]);
   assert.match(await scalar('select foto_url from ladra.servicios where id=$1',[service]),/servicios-ladra/);
   await as(other);assert.equal(await scalar("select count(*)::int from storage.objects where bucket_id='servicios-ladra'"),0);
  });
  await t.test('Ajeno no edita servicios, adjunta fotos ajenas ni borra o sobrescribe archivos',async()=>{
   await as(other);assert.equal((await db.query("update ladra.servicios set precio_clp=10 where id=$1 returning id",[service])).rows.length,0);
   await assert.rejects(db.query("insert into ladra.servicios(titulo,prestador,categoria,zona,modalidad,descripcion,foto_path)values('Servicio','Prestador','estetica','Maipú','local','Descripción suficientemente larga de la prestación.',$1)",[path]),/propia cuenta/i);
   assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
   await as(owner);assert.equal((await db.query("update storage.objects set name='otro.webp' where name=$1 returning id",[path])).rows.length,0);
   assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
  });
  await t.test('Editar incrementa revisión; solo elimina la foto anterior después de reemplazarla',async()=>{
   await db.query("insert into storage.objects(bucket_id,name)values('servicios-ladra',$1)",[replacement]);
   await db.query('update ladra.servicios set precio_clp=28000,descripcion=$2,foto_path=$3 where id=$1 and revision=1',[service,'Nueva descripción del servicio con condiciones actualizadas.',replacement]);
   assert.equal(await scalar('select revision from ladra.servicios where id=$1',[service]),2);
   assert.equal((await db.query('update ladra.servicios set precio_clp=100 where id=$1 and revision=1 returning id',[service])).rows.length,0);
   assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,1);
   await assert.rejects(db.query('update ladra.servicios set propietario_id=$2 where id=$1',[service,other]),/permission denied/i);
   await assert.rejects(db.query('update ladra.servicios set revision=10 where id=$1',[service]),/permission denied/i);
   await db.query('update ladra.servicios set foto_path=null,foto_url=null where id=$1',[service]);
   assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[replacement])).rows.length,1);
  });
  await t.test('La creación tiene clave única por propietario y no modifica los otros contenedores',async()=>{
   const key='20000000-0000-0000-0000-000000000001';
   await db.query('update ladra.servicios set publicado=false where id=$1',[service]);
   await db.exec('reset role');await db.query('update ladra.servicios set creacion_clave=$2 where id=$1',[service,key]);await as(owner);
   await assert.rejects(db.query("insert into ladra.servicios(titulo,prestador,categoria,zona,modalidad,descripcion,creacion_clave)values('Servicio','Prestador','estetica','Maipú','local','Descripción suficientemente larga de la prestación.',$1)",[key]),/unique/i);
   await db.exec("insert into storage.objects(bucket_id,name)values('otro-bucket','libre.jpg');update storage.objects set name='editado.jpg' where bucket_id='otro-bucket';delete from storage.objects where bucket_id='otro-bucket'");
  });
 }finally{await db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Mi negocio exige trabajador, aísla gestión y enlaza pedidos/citas a consultas propias',async()=>{
 const db=new PGlite(), owner='00000000-0000-0000-0000-000000000001',client='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003';
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ladra;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,ladra,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;
 create policy photo_owner on storage.objects for select to authenticated using(split_part(name,'/',1)=(select auth.uid())::text);
 create table ladra.servicios(id uuid default gen_random_uuid() primary key,propietario_id uuid default auth.uid(),prestador text,zona text,categoria text constraint servicios_categoria_check check(categoria in ('estetica')));
 create table ladra.market_productos(id uuid default gen_random_uuid() primary key,propietario_id uuid default auth.uid(),vendedor_alias text default '',titulo text,descripcion text,categoria text,condicion text,precio_clp int,comuna text,entrega text,foto_path text,estado text default 'publicado',creado_en timestamptz default now(),actualizado_en timestamptz);
 create table ladra.market_consultas(id uuid primary key,vendedor_id uuid,comprador_id uuid);
 create table ladra.servicio_consultas(id uuid primary key,prestador_id uuid,solicitante_id uuid);
 alter table ladra.servicios enable row level security;alter table ladra.market_productos enable row level security;alter table ladra.market_consultas enable row level security;alter table ladra.servicio_consultas enable row level security;
 grant select,insert,update on ladra.servicios,ladra.market_productos to authenticated;grant select on ladra.market_consultas,ladra.servicio_consultas to authenticated;
 create policy services_owner on ladra.servicios to authenticated using(propietario_id=(select auth.uid())) with check(propietario_id=(select auth.uid()));
 create policy products_owner on ladra.market_productos to authenticated using(propietario_id=(select auth.uid())) with check(propietario_id=(select auth.uid()));
 create policy market_queries on ladra.market_consultas for select to authenticated using(vendedor_id=(select auth.uid()) or comprador_id=(select auth.uid()));
 create policy service_queries on ladra.servicio_consultas for select to authenticated using(prestador_id=(select auth.uid()) or solicitante_id=(select auth.uid()));`);
 for(const id of [owner,client,other])await db.query('insert into auth.users values($1)',[id]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261125012017_ladra_negocios_servicios.sql',import.meta.url),'utf8'));
 await as(client);await assert.rejects(db.exec("insert into ladra.servicios(prestador,zona,categoria)values('Intruso','Maipú','veterinaria')"),/trabajador/);
 await as(owner);await db.exec("insert into ladra.negocios(nombre,categoria,descripcion,comuna)values('Patitas','peluqueria','Cuidados profesionales para mascotas del barrio.','Maipú')");
 await db.exec("insert into ladra.servicios(prestador,zona,categoria)values('Patitas','Maipú','veterinaria')");
 await as(other);await db.exec("insert into ladra.negocios(nombre,categoria,descripcion,comuna)values('Otro negocio','tienda','Productos de calidad para animales del barrio.','Maipú')");
 assert.equal((await db.query("update ladra.negocios set nombre='Ajeno' where propietario_id=$1 returning *",[owner])).rows.length,0);
 assert.equal((await db.query('select * from ladra.servicios')).rows.length,0);
 await as(null,'anon');assert.equal((await db.query('select * from ladra.negocios')).rows.length,2);await assert.rejects(db.query('select * from ladra.negocio_pedidos'),/permission denied/);
 await db.exec('reset role');
 await db.query('insert into ladra.market_consultas values($1,$2,$3)',[owner,owner,client]);await db.query('insert into ladra.servicio_consultas values($1,$2,$3)',[owner,owner,client]);
 await as(other);await assert.rejects(db.query('insert into ladra.negocio_pedidos(consulta_id)values($1)',[owner]),/row-level security/);await assert.rejects(db.query("insert into ladra.negocio_citas(consulta_id,dia,hora)values($1,'2026-12-01','10:30')",[owner]),/row-level security/);
 await as(owner);await db.query('insert into ladra.negocio_pedidos(consulta_id)values($1)',[owner]);await db.query("insert into ladra.negocio_citas(consulta_id,dia,hora)values($1,'2026-12-01','10:30')",[owner]);
 await assert.rejects(db.query('insert into ladra.negocio_pedidos(consulta_id)values($1)',[owner]),/unique/);
 await as(client);assert.equal((await db.query('select * from ladra.negocio_pedidos')).rows.length,0);assert.equal((await db.query("update ladra.negocio_citas set estado='cancelada' returning id")).rows.length,0);
 await as(owner);assert.equal((await db.query("update ladra.negocio_pedidos set estado='listo' returning id")).rows.length,1);
 }finally{await db.close();}
});

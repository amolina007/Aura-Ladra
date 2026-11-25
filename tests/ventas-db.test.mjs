import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-0000-0000-000000000001',buyer='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003';
test('Ventas: borradores, galería privada, stock transaccional y mensajes entre participantes',async()=>{
 const db=new PGlite();const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};const file=async name=>db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ladra;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema auth,ladra,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to anon,authenticated;
 create table ladra.perfiles_publicos(usuario_id uuid,alias text,estado text,visibilidad text,creado_en timestamptz);
 create table ladra.servicios(id uuid primary key default gen_random_uuid(),propietario_id uuid,prestador text,zona text,categoria text constraint servicios_categoria_check check(categoria in('estetica')));
 create table ladra.servicio_consultas(id uuid primary key,prestador_id uuid,solicitante_id uuid);grant select on ladra.servicio_consultas to authenticated;
 `);
 for(const id of [owner,buyer,other])await db.query('insert into auth.users values($1)',[id]);
 await file('20261117025208_ladra_market_comunidad.sql');await file('20261117025717_ladra_market_fotos_rls_restrictivo.sql');await file('20261125012017_ladra_negocios_servicios.sql');await file('20261125205143_ladra_ventas_galeria_stock.sql');
 await as(owner);await db.exec("insert into ladra.negocios(nombre,categoria,descripcion,comuna)values('Tienda del barrio','tienda','Productos de calidad para las mascotas del barrio.','Maipú')");
 const draft=(await db.query("insert into ladra.market_productos(titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega,estado,stock)values('','','accesorios','nuevo',0,'','','borrador',0)returning id")).rows[0].id;
 await as(buyer);assert.equal((await db.query('select id from ladra.market_productos')).rows.length,0);
 await as(owner);const photos=[`${owner}/10000000-0000-0000-0000-000000000001.webp`,`${owner}/10000000-0000-0000-0000-000000000002.webp`];
 for(const path of photos)await db.query("insert into storage.objects(bucket_id,name)values('market-ladra',$1)",[path]);
 await db.query("update ladra.market_productos set fotos=$1,titulo='Arnés ajustable',descripcion='Arnés ajustable verde en tallas S y M.',comuna='Maipú',entrega='Retiro acordado',stock=2,precio_clp=12990 where id=$2",[photos,draft]);
 await as(buyer);assert.equal((await db.query("select name from storage.objects where bucket_id='market-ladra'")).rows.length,0);
 await as(owner);await db.query("update ladra.market_productos set estado='publicado' where id=$1",[draft]);
 await as(null,'anon');assert.equal((await db.query('select id,fotos,stock from ladra.market_productos')).rows.length,1);assert.equal((await db.query("select name from storage.objects where bucket_id='market-ladra'")).rows.length,2);
 await as(buyer);const c=(await db.query("select ladra.market_contactar_producto($1,'Me interesa el arnés para mi perro.') id",[draft])).rows[0].id;
 await db.query("insert into ladra.ventas_mensajes(consulta_id,texto)values($1,'¿Tienes talla S?')",[c]);
 await as(other);assert.equal((await db.query('select * from ladra.ventas_mensajes')).rows.length,0);await assert.rejects(db.query("insert into ladra.ventas_mensajes(consulta_id,texto)values($1,'Intruso')",[c]),/row-level security/);
 await as(owner);assert.equal((await db.query('select * from ladra.ventas_mensajes')).rows.length,1);const o=(await db.query('insert into ladra.negocio_pedidos(consulta_id,cantidad)values($1,2)returning id',[c])).rows[0].id;
 await db.query("update ladra.negocio_pedidos set estado='preparando' where id=$1",[o]);assert.equal((await db.query('select stock from ladra.market_productos where id=$1',[draft])).rows[0].stock,0);
 await db.query("update ladra.negocio_pedidos set estado='listo' where id=$1",[o]);assert.equal((await db.query('select stock from ladra.market_productos where id=$1',[draft])).rows[0].stock,0);
 await db.query("update ladra.negocio_pedidos set estado='cancelado' where id=$1",[o]);assert.equal((await db.query('select stock from ladra.market_productos where id=$1',[draft])).rows[0].stock,2);
 await assert.rejects(db.query("update ladra.negocio_pedidos set estado='preparando' where id=$1",[o]),/cerrado/);
 await assert.rejects(db.query('update ladra.market_productos set fotos=$1 where id=$2',[[`${other}/10000000-0000-0000-0000-000000000003.webp`],draft]),/subidas por tu cuenta/);
 await db.query("delete from storage.objects where name=$1",[photos[1]]);
 assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,2);
 }finally{await db.close();}
});

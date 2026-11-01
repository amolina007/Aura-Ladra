// Base PostgreSQL WASM desechable: jamás se conecta a Supabase.
// AURA_COIN_FIXTURES apunta a las migraciones privadas del libro central Aura (00, 01, 02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const root = resolve(import.meta.dirname, '..');
const fixtures = process.env.AURA_COIN_FIXTURES;
if (!fixtures) throw Error('Define AURA_COIN_FIXTURES con 00_base.sql, 01_libro.sql y 02_operaciones.sql del repositorio privado Convergencia-Aura.');
const ids = {owner:'00000000-0000-0000-0000-000000000001',a:'00000000-0000-0000-0000-000000000002',b:'00000000-0000-0000-0000-000000000003',mod:'00000000-0000-0000-0000-000000000004',poor:'00000000-0000-0000-0000-000000000005'};
const key = (n) => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('Patrocinios AC: reservas, permisos, idempotencia, hitos, devoluciones y contabilidad', async(t) => {
 const db = new PGlite();
 const exec = (q) => db.exec(q);
 const scalar = async(q,args=[]) => Object.values((await db.query(q,args)).rows[0])[0];
 const as = async(u,role='authenticated') => { await exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u||'']); await exec(`set role ${role}`); };
 const rpc = (fn,args) => scalar(`select ladra.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 try {
  await exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous',coalesce(current_setting('test.anonymous',true),'false')) $$; create schema core; create table core.perfiles(id uuid primary key,alias text); create function core.hay_bloqueo(uuid,uuid) returns boolean language sql stable as $$ select false $$; create function public.es_admin_plataforma() returns boolean language sql stable as $$ select auth.uid()='${ids.mod}'::uuid $$; create schema ladra; create table ladra.moderadores(usuario_id uuid primary key); create table ladra.cuentas_baneadas(usuario_id uuid primary key); create table ladra.perfiles_publicos(id uuid default gen_random_uuid(),usuario_id uuid unique,alias text,estado text default 'publicado'); grant usage on schema auth,ladra to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role; create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;`);
  for(const name of ['00_base','01_libro','02_operaciones']) await exec(await readFile(resolve(fixtures,name+'.sql'),'utf8'));
  // La versión vigente fija search_path en los helpers. Se reproduce el mismo aislamiento.
  await exec(`do $$ declare r record; begin for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aura_coin' loop execute format('alter function %s set search_path=aura_coin,public,pg_temp',r.signature); end loop; end $$; create function public.fn_ac_mi_aceptacion() returns jsonb language sql as $$ select jsonb_build_object('aceptada',coalesce(current_setting('test.terminos',true),'true')<>'false') $$; create function public.fn_ac_mi_saldo() returns jsonb language sql security definer set search_path=pg_catalog,aura_coin as $$ select jsonb_build_object('disponible',coalesce((select saldo_disponible from aura_coin.cuenta where usuario_id=auth.uid()),0),'operaciones_habilitadas',true) $$;`);
  for(const name of ['20261015120000_avisos_de_puestos.sql','20261015220000_campanas_de_puestos.sql','20261015230000_interacciones_de_avisos.sql','20261024194611_patrocinio_ac_campanas.sql']) await exec(await readFile(resolve(root,'supabase/migrations',name),'utf8'));
  for(const [name,id] of Object.entries(ids)){ await db.query('insert into auth.users values($1)',[id]); await db.query('insert into core.perfiles values($1,$2)',[id,name]); }
  await db.query('insert into ladra.moderadores values($1),($2)',[ids.mod,ids.owner]);
  // Saldos falsos, emitidos y distribuidos con el propio libro real de Aura, solo en WASM.
  await as(ids.mod);
  await exec('reset role'); await exec("update aura_coin.config set valor='true' where clave='operaciones_habilitadas'");
  await scalar("select public.fn_ac_emitir(10000,'Prueba local','laboratorio','test-emision')");
  await scalar("select public.fn_ac_distribuir('a',5000,'Prueba local','laboratorio','test-distribucion-a')");
  await scalar("select public.fn_ac_distribuir('b',5000,'Prueba local','laboratorio','test-distribucion-b')");
  await exec("insert into aura_coin.parametro(clave,valor,estado,referencia) values('equivalencia_clp',1,'aprobado','Solo prueba local de protección ante canje')");
  const campana = async(meta=100,dias=30)=>{
   await as(ids.owner);
   const id = await rpc('crear_campana_puesto',['Campaña de laboratorio','Campaña de laboratorio para agua y alimento.','ambos','Maipú',null,'Habilitar un puesto de agua y comida para el barrio.',meta,dias,30,'Se devuelve el saldo que no se haya entregado.']);
   await rpc('enviar_aviso_puesto',[id]); await as(ids.mod);await rpc('moderar_aviso_puesto',[id,true,null]); return id;
  };
  const c = await campana();
  await t.test('anónimo no aporta ni lee tablas; estado público no revela identidad',async()=>{
   await as(null,'anon'); await assert.rejects(rpc('patrocinar_campana_ac',[c,10,key(1)]),/permission denied/);
   const state = await rpc('estado_patrocinio_ac',[c]); assert.equal(state.recaudado_ac,0); assert.ok(!JSON.stringify(state).includes(ids.owner));
   await assert.rejects(db.query('select * from ladra.patrocinios_ac'),/permission denied/);
  });
  await t.test('sesión, baneo, términos, saldo y dueño se verifican en servidor',async()=>{
   await as(ids.owner);await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(2)]),/responsable/);
   await as(ids.poor);await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(3)]),/Saldo insuficiente/);
   await as(ids.a);await db.query("select set_config('test.terminos','false',false)");await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(4)]),/términos/);await db.query("select set_config('test.terminos','true',false)");
   await db.query("select set_config('test.anonymous','true',false)");await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(5)]),/SESION_REQUERIDA/);await db.query("select set_config('test.anonymous','false',false)");
   await exec('reset role');await db.query('insert into ladra.cuentas_baneadas values($1)',[ids.a]);await as(ids.a);await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(6)]),/PERMISO_DENEGADO/);await exec('reset role');await exec('delete from ladra.cuentas_baneadas');
  });
  await t.test('reserva saldo disponible; repetir no duplica y no se supera la meta',async()=>{
   await as(ids.a);const before = await rpc('saldo_patrocinio_ac',[]); const first = await rpc('patrocinar_campana_ac',[c,60,key(10)]);assert.equal(first.reservado_ac,60);
   assert.equal((await rpc('saldo_patrocinio_ac',[])).disponible,before.disponible-60);
   assert.equal((await rpc('patrocinar_campana_ac',[c,60,key(10)])).repetida,true);
   await assert.rejects(rpc('patrocinar_campana_ac',[c,61,key(10)]),/otra|otro/);
   await assert.rejects(rpc('patrocinar_campana_ac',[c,41,key(11)]),/supera/);
   await assert.rejects(rpc('patrocinar_campana_ac',[c,0,key(12)]),/cantidad/);
   await assert.rejects(rpc('patrocinar_campana_ac',[c,1,null]),/cantidad/);
   await as(ids.b);assert.equal((await rpc('patrocinar_campana_ac',[c,40,key(13)])).estado,'meta_alcanzada');
   await assert.rejects(rpc('patrocinar_campana_ac',[c,1,key(14)]),/no recibe/);
  });
  await t.test('billetera no puede cancelar ni canjear una reserva comprometida',async()=>{
   await exec('reset role');const op=await scalar('select reserva_op from ladra.patrocinios_ac where clave=$1',[key(10)]);await as(ids.a);
   await assert.rejects(scalar("select public.fn_ac_cancelar_reserva($1,1,'Prueba de protección','test-cancelar-externa')",[op]),/respalda una campaña/);
   await assert.rejects(scalar("select public.fn_ac_canjear(1,'auraladra','Prueba','test-canje-externo',$1,'laboratorio')",[op]),/respalda una campaña/);
  });
  let h;
  await t.test('solo responsable propone evidencia HTTPS y nunca se autoaprueba',async()=>{
   await as(ids.a);await assert.rejects(rpc('proponer_hito_patrocinio_ac',[c,'Primera entrega','https://example.org/prueba',70,key(20)]),/PERMISO_DENEGADO/);
   await as(ids.owner);await assert.rejects(rpc('proponer_hito_patrocinio_ac',[c,'Primera entrega','javascript:alert(1)',70,key(20)]),/check constraint/);
   h=await rpc('proponer_hito_patrocinio_ac',[c,'Primera entrega','https://example.org/prueba',70,key(20)]);
   assert.equal(await rpc('proponer_hito_patrocinio_ac',[c,'Primera entrega','https://example.org/prueba',70,key(20)]),h);
   await assert.rejects(rpc('revisar_hito_patrocinio_ac',[h,true,'Verificación de laboratorio']),/Otro moderador/);
   await as(ids.a);await assert.rejects(rpc('revisar_hito_patrocinio_ac',[h,true,'Verificación de laboratorio']),/PERMISO_DENEGADO/);
  });
  await t.test('aprobar libera exactamente el hito y no repite transferencias',async()=>{
   await as(ids.mod);const state=await rpc('revisar_hito_patrocinio_ac',[h,true,'Evidencia revisada y permisos comprobados.']);assert.equal(state.liberado_ac,70);assert.equal(state.reservado_ac,30);
   assert.equal((await rpc('revisar_hito_patrocinio_ac',[h,true,'Reintento de revisión'])).repetida,true);
   await exec('reset role');assert.equal(await scalar('select saldo_disponible from aura_coin.cuenta where usuario_id=$1',[ids.owner]),70);
  });
  await t.test('vencer tras una entrega devuelve solo las AC restantes, una sola vez',async()=>{
   await exec('reset role');await db.query("update ladra.campanas_patrocinio_ac set entrega_hasta=now()-interval '1 second' where aviso_id=$1",[c]);
   await exec('set role service_role');await rpc('vencer_patrocinios_ac',[]);await rpc('vencer_patrocinios_ac',[]);
   await as(ids.a);const state=await rpc('estado_patrocinio_ac',[c]);assert.equal(state.devuelto_ac,30);assert.equal(state.reservado_ac,0);assert.equal(state.liberado_ac,70);assert.equal(state.estado,'expirada');
  });
  await t.test('campaña incompleta devuelve todo; retiro también devuelve automáticamente',async()=>{
   const c2=await campana();await as(ids.a);await rpc('patrocinar_campana_ac',[c2,10,key(30)]);await exec('reset role');
   // El aviso publicado es inmutable: solo se adelanta el reloj en el laboratorio.
   await exec('alter table ladra.avisos_puestos disable trigger user');await db.query("update ladra.avisos_puestos set recaudacion_hasta=now()-interval '1 second' where id=$1",[c2]);await exec('alter table ladra.avisos_puestos enable trigger user');
   await rpc('vencer_patrocinios_ac',[]);assert.equal((await rpc('estado_patrocinio_ac',[c2])).devuelto_ac,10);
   const c3=await campana();await as(ids.a);await rpc('patrocinar_campana_ac',[c3,10,key(31)]);await as(ids.owner);await rpc('retirar_aviso_puesto',[c3]);assert.equal((await rpc('estado_patrocinio_ac',[c3])).devuelto_ac,10);
  });
  await t.test('entrega completa cierra la campaña y rechazo conserva las reservas',async()=>{
   const c4=await campana(10);await as(ids.a);await rpc('patrocinar_campana_ac',[c4,10,key(40)]);await as(ids.owner);
   const rejected=await rpc('proponer_hito_patrocinio_ac',[c4,'Entrega incompleta','https://example.org/prueba',10,key(41)]);await as(ids.mod);const r=await rpc('revisar_hito_patrocinio_ac',[rejected,false,'No se acredita el trabajo solicitado.']);assert.equal(r.reservado_ac,10);
   await as(ids.owner);const ok=await rpc('proponer_hito_patrocinio_ac',[c4,'Entrega completada','https://example.org/prueba-final',10,key(42)]);await as(ids.mod);assert.equal((await rpc('revisar_hito_patrocinio_ac',[ok,true,'Trabajo verificado y permisos revisados.'])).estado,'completada');
  });
  await t.test('reservas ajenas a Ladra conservan su cancelación normal',async()=>{
   await as(ids.a);const r=await scalar("select public.fn_ac_reservar_producto(3,'otro','Reserva ajena de prueba','test-reserva-ajena','laboratorio')");
   await scalar("select public.fn_ac_cancelar_reserva($1,3,'Cancelación normal','test-cancelacion-ajena')",[r.operacion_id]);
   await exec('reset role');assert.equal(await scalar('select restante from aura_coin.bloqueo where operacion_id=$1',[r.operacion_id]),0);
  });
  await t.test('pausa central impide nuevos aportes, pero permite devolver lo ya reservado',async()=>{
   const c5=await campana();await as(ids.a);await rpc('patrocinar_campana_ac',[c5,5,key(50)]);
   await exec('reset role');await exec("update aura_coin.config set valor='false' where clave='operaciones_habilitadas'");
   await as(ids.b);await assert.rejects(rpc('patrocinar_campana_ac',[c5,5,key(51)]),/deshabilitadas/);
   await as(ids.owner);await rpc('retirar_aviso_puesto',[c5]);assert.equal((await rpc('estado_patrocinio_ac',[c5])).devuelto_ac,5);
   await exec('reset role');await exec("update aura_coin.config set valor='true' where clave='operaciones_habilitadas'");
  });
  await t.test('helpers privados y libro contable cuadran tras todos los movimientos',async()=>{
   await as(ids.a);await assert.rejects(rpc('_devolver_patrocinio_ac',[c,'cancelada']),/permission denied/);await assert.rejects(db.query('update ladra.patrocinios_ac set liberado_ac=0'),/permission denied/);
   await exec('reset role');
   assert.equal(await scalar('select count(*)::int from (select operacion_id from aura_coin.asiento group by operacion_id having sum(delta)<>0)q'),0);
   assert.equal(await scalar("select count(*)::int from aura_coin.cuenta c where saldo_bloqueado<>coalesce((select sum(restante) from aura_coin.bloqueo b where b.cuenta_id=c.id),0)"),0);
   assert.equal(await scalar("select count(*)::int from aura_coin.cuenta c where saldo_disponible<>coalesce((select sum(delta) from aura_coin.asiento a where a.cuenta_id=c.id and columna='disponible'),0)"),0);
   assert.equal(await scalar("select count(*)::int from aura_coin.asiento_clp"),0);
  });
 } finally { await db.close(); }
});

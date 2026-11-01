// Libro central real en PostgreSQL WASM desechable: nunca se conecta a Supabase.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
const fixtures=process.env.AURA_COIN_FIXTURES;
test('Transferencia central: 30.000 AC, reintento sin duplicar y rechazo sin saldo', {skip:!fixtures},async()=>{
 const db=new PGlite();
 const buyer='00000000-0000-0000-0000-000000000001',seller='00000000-0000-0000-0000-000000000002',admin='00000000-0000-0000-0000-000000000003';
 const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
 try{
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema core; create table core.perfiles(id uuid primary key,alias text); create function core.hay_bloqueo(uuid,uuid) returns boolean language sql as $$select false$$; create function public.es_admin_plataforma() returns boolean language sql as $$select auth.uid()='${admin}'::uuid$$;`);
 for(const name of ['00_base','01_libro','02_operaciones']) await db.exec(await readFile(resolve(fixtures,name+'.sql'),'utf8'));
 await db.exec(`do $$ declare r record; begin for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aura_coin' loop execute format('alter function %s set search_path=aura_coin,public,pg_temp',r.signature); end loop; end $$;`);
 for(const [id,alias] of [[buyer,'comprador'],[seller,'amolina007'],[admin,'admin']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into core.perfiles values($1,$2)',[id,alias]);}
 await db.exec("update aura_coin.config set valor='true' where clave='operaciones_habilitadas'");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 await scalar("select public.fn_ac_emitir(60000,'Prueba local','laboratorio','test-emision-tienda')");
 await scalar("select public.fn_ac_distribuir('comprador',60000,'Prueba local','laboratorio','test-distribucion-tienda')");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[buyer]);
 const transfer=(key,amount=30000)=>scalar("select public.fn_ac_transferir('amolina007',$1,'Compra AirTag',$2,null,'ladra:tienda:airtag-portacollar-alejandro;entrega=acordada_con_comprador')",[amount,key]);
 const first=await transfer('test-compra-airtag');const repeated=await transfer('test-compra-airtag');
 assert.equal(first.operacion_id,repeated.operacion_id);assert.equal(repeated.repetida,true);
 assert.equal(Number(await scalar('select saldo_disponible from aura_coin.cuenta where usuario_id=$1',[buyer])),30000);
 assert.equal(Number(await scalar('select saldo_disponible from aura_coin.cuenta where usuario_id=$1',[seller])),30000);
 await assert.rejects(transfer('test-compra-sin-saldo',30001),/insuficiente/i);
 await assert.rejects(scalar("select public.fn_ac_transferir('comprador',1,'Propia','test-compra-propia')"),/mismo/i);
 assert.equal(await scalar('select count(*)::int from (select operacion_id from aura_coin.asiento group by operacion_id having sum(delta)<>0)q'),0);
 }finally{await db.close();}
});

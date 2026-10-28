import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Servicios: permisos reales, mascotas privadas, consultas y reintentos en PostgreSQL local', async t => {
  const db = new PGlite();
  const owner='00000000-0000-0000-0000-000000000001', buyer='00000000-0000-0000-0000-000000000002', stranger='00000000-0000-0000-0000-000000000003';
  const pet='00000000-0000-0000-0000-000000000010', memorial='00000000-0000-0000-0000-000000000011';
  const key='00000000-0000-0000-0000-000000000020';
  const as = async (id,role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']); await db.exec(`set role ${role}`); };
  const scalar = async (sql,params=[]) => Object.values((await db.query(sql,params)).rows[0] || {})[0];
  let service, inquiry;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema ladra;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,ladra to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create table ladra.animales(id uuid primary key, nombre text, creado_por uuid, es_conmemorativa boolean default false);
      alter table ladra.animales enable row level security;
      create policy own_pets on ladra.animales for select to authenticated using(creado_por=(select auth.uid()));
      grant select on ladra.animales to authenticated;`);
    for (const id of [owner,buyer,stranger]) await db.query('insert into auth.users values($1)',[id]);
    await db.query("insert into ladra.animales values($1,'Luna',$2,false),($3,'Recuerdo',$2,true)",[pet,buyer,memorial]);
    await db.exec(await readFile(new URL('../supabase/migrations/20261028023325_ladra_servicios_y_consultas.sql',import.meta.url),'utf8'));
    await t.test('Publicación propia y catálogo público, sin privilegios de autor ajeno',async()=>{
      await as(owner);
      service=await scalar("insert into ladra.servicios(titulo,prestador,categoria,zona,modalidad,descripcion,precio_clp) values('Baño y cepillado','Prestador','estetica','Maipú','local','Baño y cepillado con condiciones reales.',25000) returning id");
      await assert.rejects(db.query("insert into ladra.servicios(propietario_id,titulo,prestador,categoria,zona,modalidad,descripcion) values($1,'Prueba','Prestador','estetica','Maipú','local','Una descripción suficientemente larga.')",[buyer]),/permission denied/i);
      await as(null,'anon'); assert.equal(await scalar('select count(*)::int from ladra.servicios'),1);
      await assert.rejects(db.exec("insert into ladra.servicios(titulo) values('Intruso')"),/permission denied/i);
      await assert.rejects(db.exec('select * from ladra.servicio_consultas'),/permission denied/i);
    });
    const insert = async (animal=pet,request=key,date="(now() at time zone 'America/Santiago')::date + 1") => scalar(`insert into ladra.servicio_consultas(solicitud_clave,servicio_id,animal_id,dia_preferido,horario,mensaje) values($1,$2,$3,${date},'manana','Consulta por baño y cepillado.') returning id`,[request,service,animal]);
    await t.test('Consulta enlazada a mascota propia privada y copia mínima para prestador',async()=>{
      await as(buyer); inquiry=await insert();
      const row=(await db.query('select * from ladra.servicio_consultas')).rows[0];
      assert.equal(row.mascota_nombre,'Luna'); assert.equal(row.prestador_id,owner); assert.equal(row.solicitante_id,buyer);
      await as(owner); assert.equal(await scalar('select count(*)::int from ladra.animales'),0);
      assert.equal(await scalar('select mascota_nombre from ladra.servicio_consultas'),'Luna');
    });
    await t.test('Reintento único y rechazo de mascotas ajenas, conmemorativas o fechas pasadas',async()=>{
      await as(buyer); await assert.rejects(insert(),/unique/i);
      await assert.rejects(insert(memorial),/propia y viva/i);
      await assert.rejects(insert(pet,'00000000-0000-0000-0000-000000000021',"(now() at time zone 'America/Santiago')::date - 1"),/Selecciona un día/i);
      await as(stranger); await assert.rejects(insert(),/propia y viva/i);
      assert.equal(await scalar('select count(*)::int from ladra.servicio_consultas'),0);
    });
    await t.test('Tutor y terceros no pueden responder ni mover consultas',async()=>{
      await as(buyer);
      assert.equal((await db.query("update ladra.servicio_consultas set estado='respondida',respuesta='Intento del tutor.' returning id")).rows.length,0);
      await assert.rejects(db.query('update ladra.servicio_consultas set prestador_id=$1 where id=$2',[stranger,inquiry]),/permission denied/i);
      await as(stranger); assert.equal((await db.query("update ladra.servicio_consultas set estado='respondida',respuesta='Intento tercero.' returning id")).rows.length,0);
    });
    await t.test('Retirar conserva consultas; propietario responde sin leer ficha privada',async()=>{
      await as(owner); await db.query('update ladra.servicios set publicado=false where id=$1',[service]);
      await db.query("update ladra.servicio_consultas set estado='respondida',respuesta='Tengo disponibilidad por la mañana, valor $25.000.' where id=$1",[inquiry]);
      await assert.rejects(db.query("update ladra.servicio_consultas set respuesta='Otra respuesta distinta.' where id=$1",[inquiry]),/pendiente/i);
      await as(buyer); assert.match(await scalar('select respuesta from ladra.servicio_consultas'),/25.000/);
      assert.equal(await scalar('select count(*)::int from ladra.servicios'),0);
      await assert.rejects(insert(pet,'00000000-0000-0000-0000-000000000022'),/no está disponible/i);
    });
  } finally { await db.close(); }
});

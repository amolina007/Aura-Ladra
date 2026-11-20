import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';

const migration = readFileSync(new URL('../supabase/migrations/20261120145941_ladra_misiones_experiencia.sql', import.meta.url), 'utf8');
const script = readFileSync(new URL('../js/misiones-exp.js', import.meta.url), 'utf8');

test('server awards persisted actions, enforces caps and idempotency, and waits for validation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema ladra;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table ladra.perfiles_publicos(id uuid default gen_random_uuid(),usuario_id uuid,alias text,biografia text,estado text,visibilidad text default 'basico');
      create table ladra.animales(id uuid primary key default gen_random_uuid(),creado_por uuid,estado text,es_comunitario boolean default false,es_conmemorativa boolean default false,foto_url text,foto_urls text[]);
      create table ladra.momentos(id uuid default gen_random_uuid(),autor_id uuid,tipo text,fecha date,visibilidad text default 'privado');
      create table ladra.propuestas_lugares(id uuid default gen_random_uuid(),creado_por uuid,estado text);
      create table ladra.publicaciones_feed(id uuid default gen_random_uuid(),autor_id uuid,tipo text,texto text);
      create table ladra.medios_mascota(id uuid default gen_random_uuid(),autor_id uuid,animal_id uuid,tipo text,titulo text,estado text,ruta_archivo text);
      create table ladra.comentarios_feed(id uuid default gen_random_uuid(),autor_id uuid,publicacion_id uuid,medio_id uuid,texto text);
      create table ladra.animales_seguidos(usuario_id uuid,animal_id uuid);
      create table ladra.animales_guardados(usuario_id uuid,animal_id uuid);
      create table ladra.vinculos_animales(id uuid default gen_random_uuid(),creado_por uuid,animal_a_id uuid,animal_b_id uuid,estado text);
      create table ladra.vinculos_animal_humano(id uuid default gen_random_uuid(),creado_por uuid,animal_id uuid,perfil_publico_id uuid,estado text);
      create table ladra.avisos_most_wanted(id uuid default gen_random_uuid(),dueno_id uuid,animal_id uuid,estado text,foto_path text);
      create table ladra.avisos_externos(id uuid default gen_random_uuid(),autor_id uuid,estado text,descripcion text,foto_path text,fotos_paths text[],fuente_url text);
      create table ladra.alertas_mascotas(id uuid default gen_random_uuid(),reportante_id uuid,nombre text,descripcion text,direccion_publica text,animal_id uuid);
      create table ladra.reclamos_most_wanted(id uuid default gen_random_uuid(),reclamante_id uuid,aviso_id uuid,estado text);
      create table ladra.reportes_canil(id uuid default gen_random_uuid(),reportante_id uuid,estado text);
      create table ladra.reportes_red(id uuid default gen_random_uuid(),reportante_id uuid,estado text);
      create table ladra.market_productos(id uuid default gen_random_uuid(),propietario_id uuid,estado text,foto_path text);
      create table ladra.servicios(id uuid default gen_random_uuid(),propietario_id uuid,publicado boolean,descripcion text);
      create table ladra.market_consultas(id uuid default gen_random_uuid(),vendedor_id uuid,comprador_id uuid,respuesta text);
      create table ladra.servicio_consultas(id uuid default gen_random_uuid(),prestador_id uuid,solicitante_id uuid,respuesta text);
    `);
    for (const path of ['20261119110000_ladra_experiencia_ranking.sql','20261119120000_ladra_experiencia_ranking_solo_puntajes.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${path}`,import.meta.url),'utf8'));
    }
    await db.exec(migration);
    const actor='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values ($1),($2)',[actor,other]);
    const total = async event => Number((await db.query('select coalesce(sum(puntos),0) as total from ladra.experiencia_eventos where usuario_id=$1 and evento=$2',[actor,event])).rows[0].total);
    await db.query("insert into ladra.publicaciones_feed(autor_id,tipo,texto) values ($1,'post','Uno'),($1,'post','Dos')",[actor]);
    assert.equal(await total('publicacion_feed'),5,'daily cap despite two new posts');
    await db.query("insert into ladra.momentos(autor_id,tipo,fecha) values ($1,'paseo',current_date-1),($1,'paseo',(now() at time zone 'America/Santiago')::date),($1,'paseo',(now() at time zone 'America/Santiago')::date),($1,'juego',(now() at time zone 'America/Santiago')::date)",[actor]);
    assert.equal(await total('paseo_diario'),5); assert.equal(await total('juego_diario'),5);
    await db.query("insert into ladra.medios_mascota(autor_id,animal_id,tipo,titulo,estado,ruta_archivo) values ($1,$2,'video','Sentado','aprendido','video1'),($1,$2,'video','sentado','aprendido','video2')",[actor,other]);
    assert.equal(await total('video_truco'),8); assert.equal(await total('truco_aprendido'),10,'same named trick cannot be repeated');
    await db.query("insert into ladra.reportes_canil(reportante_id,estado) values ($1,'pendiente')",[actor]);
    assert.equal(await total('reporte_canil'),0);
    await db.query("update ladra.reportes_canil set estado='verificado' where reportante_id=$1",[actor]);
    await db.query("update ladra.reportes_canil set estado='verificado' where reportante_id=$1",[actor]);
    assert.equal(await total('reporte_canil'),15,'validation once, not repeated by update');
    await db.query("insert into ladra.propuestas_lugares(creado_por,estado) values ($1,'pendiente')",[actor]);
    assert.equal(await total('recurso_validado'),0);
    await db.query("update ladra.propuestas_lugares set estado='aprobada'",[]);
    assert.equal(await total('recurso_validado'),15,'existing veterinary-place flow still awards');
    await db.query("insert into ladra.animales_seguidos(usuario_id,animal_id) values($1,$2)",[actor,other]);
    assert.equal(await total('seguir_mascota'),0,'nonexistent target gives nothing');
    await db.query("insert into ladra.animales(id,creado_por,estado) values($1,$2,'publicado')",[other,other]);
    await db.query("insert into ladra.animales_seguidos(usuario_id,animal_id) values($1,$2),($1,$2)",[actor,other]);
    assert.equal(await total('seguir_mascota'),2);
    await db.query("insert into ladra.comentarios_feed(autor_id,publicacion_id,texto) select $1,id,'Un comentario propio' from ladra.publicaciones_feed limit 1",[actor]);
    assert.equal(await total('comentario_feed'),0,'own comments do not award');
    await db.query("insert into ladra.comentarios_feed(autor_id,publicacion_id,texto) select $1,id,'Un comentario ajeno' from ladra.publicaciones_feed limit 1",[other]);
    assert.equal(Number((await db.query("select sum(puntos) total from ladra.experiencia_eventos where usuario_id=$1 and evento='comentario_feed'",[other])).rows[0].total),2);
    await db.query("insert into ladra.perfiles_publicos(usuario_id,alias,biografia,estado) values($1,'Usuario prueba','Biografía de prueba','publicado')",[actor]);
    await db.query("update ladra.perfiles_publicos set biografia='Una biografía actualizada' where usuario_id=$1",[actor]);
    assert.equal(await total('perfil_publico'),10);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    const missions=(await db.query('select * from ladra.mis_misiones_experiencia()')).rows;
    assert.equal(missions.length,27);
    const mine=(await db.query('select * from ladra.mi_experiencia()')).rows[0];
    assert.equal(missions.reduce((n,m)=>n+Number(m.exp_total),0),Number(mine.puntos_exp),'mission totals match ranking total');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.ok((await db.query('select * from ladra.mis_misiones_experiencia()')).rows.every(m=>!m.con_sesion && Number(m.exp_total)===0),'anonymous receives no private progress');
    assert.equal((await db.query("select has_function_privilege('authenticated','ladra.registrar_experiencia_interna(uuid,text,text)','execute') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});

test('missions open from profile and the existing floating panel, render safely, and close on navigation', async () => {
  const dom=new JSDOM('<section data-exp-ranking></section><div data-globo-aura></div>',{runScripts:'outside-only',url:'https://dev.ladra.convergenciaaura.cl'});
  const {window:w}=dom;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const shadow=w.document.querySelector('[data-globo-aura]').attachShadow({mode:'open'});
  shadow.innerHTML='<button class="info" aria-expanded="true">i</button><section class="misiones"></section>';
  const data=[{clave:'paseo_diario',titulo:'Paseo <img src=x onerror=alert(1)>',grupo:'Día a día',descripcion:'Registra un paseo hoy.',puntos:5,limite_diario:1,una_vez:false,destino:'#inicio',completadas_hoy:1,completadas_total:3,exp_total:15,con_sesion:true}];
  w.auraLadraDb={rpc:async()=>({data,error:null})};
  try {
    w.eval(script);
    w.document.querySelector('[data-exp-open-missions]').click();
    await new Promise(r=>setTimeout(r,0));
    assert.equal(w.document.querySelector('dialog').open,true);
    assert.match(w.document.querySelector('.exp-missions-summary').textContent,/15 EXP/);
    assert.match(w.document.querySelector('.exp-mission-status').textContent,/1\/1 hoy/);
    assert.equal(w.document.querySelectorAll('img').length,0);
    assert.ok(w.document.querySelector('.exp-mission.is-complete'));
    w.document.querySelector('.exp-mission-go').click();
    assert.equal(w.document.querySelector('dialog').open,false);
    shadow.querySelector('[data-ladra-exp-missions]').click();
    assert.equal(w.document.querySelector('dialog').open,true);
    shadow.querySelector('.misiones').replaceChildren();
    await new Promise(r=>setTimeout(r,0));
    assert.equal(shadow.querySelectorAll('[data-ladra-exp-missions]').length,1,'Core repaint preserves one local entry');
  } finally { dom.window.close(); }
});

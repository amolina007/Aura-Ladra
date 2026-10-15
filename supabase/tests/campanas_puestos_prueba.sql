-- Prueba de laboratorio de Campañas de puestos. Solo en una base Postgres DESECHABLE, desde la raíz del repositorio:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/campanas_puestos_prueba.sql
\set ON_ERROR_STOP on
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema ladra;
grant usage on schema auth, ladra to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create table ladra.moderadores (usuario_id uuid primary key references auth.users(id));
create table ladra.perfiles_publicos (id uuid default gen_random_uuid(), usuario_id uuid unique, alias text, estado text default 'publicado');
\i supabase/migrations/20261015120000_avisos_de_puestos.sql
\i supabase/migrations/20261015220000_campanas_de_puestos.sql

create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t.res values (coalesce(cond, false), nombre); end $$;
create function t.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin execute q; insert into t.res values (false, nombre || ' (debió fallar)');
exception when others then insert into t.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 70));
end $$;
create function t.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
create table t.ids (k text primary key, v uuid); grant all on t.ids to public;
grant execute on all functions in schema t to public;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000d1');
insert into ladra.moderadores values ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.perfiles_publicos (usuario_id, alias) values
  ('00000000-0000-0000-0000-00000000000a', 'Alejandro'), ('00000000-0000-0000-0000-0000000000d1', 'Vecina Colaboradora');
\set O '00000000-0000-0000-0000-00000000000a'
\set M '00000000-0000-0000-0000-0000000000c1'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set D1 '00000000-0000-0000-0000-0000000000d1'

set role authenticated;
select t.como('');
select t.falla('anónimo no crea campaña', $q$select ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',100000,60,60,'Propuesta: si no se llega a la meta no se entrega nada.')$q$, 'SESION_REQUERIDA');
select t.como(:'O');
insert into t.ids select 'c1', ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',100000,60,60,'Propuesta: si no se llega a la meta no se entrega nada.');
select t.chk('campaña guardada con dirección por definir', (select direccion_publica like 'Por definir%' and estado = 'borrador' from ladra.mis_avisos_puestos() limit 1));
select t.falla('plazo de financiamiento > 60 días no vale', $q$select ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',100000,61,60,'Propuesta: si no se llega a la meta no se entrega nada.')$q$, 'check constraint');
select t.falla('entrega > 60 días no vale en campaña', $q$select ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',100000,60,61,'Propuesta: si no se llega a la meta no se entrega nada.')$q$, 'check constraint');
select t.falla('meta obligatoria', $q$select ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',null,60,60,'Propuesta: si no se llega a la meta no se entrega nada.')$q$, 'CAMPANA_INCOMPLETA');
select t.falla('meta 0 no vale', $q$select ladra.crear_campana_puesto('Puesto de comida con financiamiento','Puesto de comida para animales del barrio.','comida','Maipú',null,'Juntar la meta para definir y habilitar el puesto.',0,60,60,'Propuesta: si no se llega a la meta no se entrega nada.')$q$, 'check constraint');
select ladra.enviar_aviso_puesto(v) from t.ids where k = 'c1';
select t.falla('no se edita directo', $q$update ladra.avisos_puestos set meta_ac = 1$q$, 'permission denied');

select t.como(:'M');
select t.chk('moderador ve la campaña en revisión con meta y alias', (select count(*) = 1 and max(meta_ac) = 100000 and max(autor_alias) = 'Alejandro' from ladra.avisos_puestos_en_revision()));
select ladra.moderar_aviso_puesto(v, true) from t.ids where k = 'c1';

select t.como('');
reset role; set role anon;
select t.chk('anónimo ve la campaña publicada', (select count(*) = 1 from ladra.listar_avisos_puestos()));
select t.chk('plazo corre desde la publicación (~60 días)', (select recaudacion_hasta between now() + interval '59 days' and now() + interval '61 days' from ladra.listar_avisos_puestos()));
select t.chk('equipo: responsable con alias', (select equipo->0->>'alias' = 'Alejandro' and equipo->0->>'rol' = 'responsable' from ladra.listar_avisos_puestos()));
select t.chk('anónimo: es_mio es falso', (select es_mio = false from ladra.listar_avisos_puestos()));
select t.chk('no se expone el id del autor', (select not (to_jsonb(l)::text ~ '00000000-0000-0000-0000-00000000000a') from ladra.listar_avisos_puestos() l));
select t.falla('anónimo no lee integrantes', 'select * from ladra.aviso_integrantes', 'permission denied');
select t.falla('anónimo no llama equipo_aviso_puesto', $q$select ladra.equipo_aviso_puesto(gen_random_uuid(), gen_random_uuid())$q$, 'permission denied');
reset role;

-- Integrantes (los agrega por ahora el administrador): se ven con alias; sin alias publicado no se ven.
insert into ladra.aviso_integrantes (aviso_id, usuario_id) select v, :'D1' from t.ids where k = 'c1';
insert into ladra.aviso_integrantes (aviso_id, usuario_id) select v, :'A1' from t.ids where k = 'c1';
set role anon;
select t.chk('equipo incluye integrante con alias y omite al que no tiene', (select jsonb_array_length(equipo) = 2 and equipo->1->>'alias' = 'Vecina Colaboradora' from ladra.listar_avisos_puestos()));
reset role;

-- Avisos antiguos (sin meta) siguen funcionando con sus reglas.
set role authenticated;
select t.como(:'O');
select t.chk('aviso clásico sigue creándose', ladra.crear_aviso_puesto('Bebedero clásico de ejemplo','Bebedero y comedero para perros en una plaza.','ambos','Maipú','Plaza de ejemplo, Maipú',-33.51,-70.75,'Habilitar y sostener un bebedero con cada paso documentado.',array['Agua y limpieza'],array['Fotos de cada recarga'],100,20,30,'sin_consultar','Propuesta: se devuelve lo no entregado.') is not null);
select t.falla('aviso clásico sin lista sigue inválido', $q$select ladra.crear_aviso_puesto('Bebedero clásico de ejemplo','Bebedero y comedero para perros en una plaza.','ambos','Maipú','Plaza de ejemplo, Maipú',-33.51,-70.75,'Habilitar y sostener un bebedero con cada paso documentado.',array[]::text[],array['Fotos de cada recarga'],100,20,30,'sin_consultar','Propuesta: se devuelve lo no entregado.')$q$, 'violates');
reset role;

select count(*) filter (where ok) as ok, count(*) as total from t.res;
select nombre from t.res where not ok;

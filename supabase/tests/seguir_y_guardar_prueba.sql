-- Prueba de laboratorio de seguir/guardar animales. Base Postgres DESECHABLE (nunca Supabase real).
-- Preparación: laboratorio_piezas_falsas.sql, create role authenticator nologin, migraciones de AuraLadra
-- (omitiendo las dos de AuraRitmos y las de 202610030*), Core (identidad, seguimientos y «Parte 1» de bloqueos)
-- y por último 20261010000000_seguir_y_guardar_animales.sql.
-- Uso: psql -d <base> -f supabase/tests/seguir_y_guardar_prueba.sql
\set ON_ERROR_STOP on
create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t.res values (coalesce(cond, false), nombre); end $$;
create function t.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin
  execute q;
  insert into t.res values (false, nombre || ' (debió fallar)');
exception when others then
  insert into t.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 80));
end $$;
create function t.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
grant execute on all functions in schema t to public;

\set YO '00000000-0000-0000-0000-0000000000a1'
\set ANA '00000000-0000-0000-0000-0000000000a2'
\set BLO '00000000-0000-0000-0000-0000000000a3'
insert into auth.users (id) values (:'YO'), (:'ANA'), (:'BLO');
insert into core.perfiles (id, alias) values (:'YO', 'usuario_yo'), (:'ANA', 'usuaria_ana'), (:'BLO', 'usuario_blo');
insert into ladra.animales (id, slug, nombre, especie, estado, creado_por, mostrar_en_red) values
  ('10000000-0000-0000-0000-000000000001', 'luna', 'Luna', 'perro', 'publicado', :'ANA', true),
  ('10000000-0000-0000-0000-000000000002', 'oculta', 'Oculta', 'gato', 'publicado', :'ANA', false),
  ('10000000-0000-0000-0000-000000000003', 'mia', 'Mía', 'perro', 'publicado', :'YO', true),
  ('10000000-0000-0000-0000-000000000004', 'borrador', 'Borrador', 'gato', 'pendiente', :'ANA', true),
  ('10000000-0000-0000-0000-000000000005', 'de-blo', 'DeBlo', 'perro', 'publicado', :'BLO', true);
insert into core.bloqueos (bloqueador_id, bloqueado_id) values (:'YO', :'BLO');

set role authenticated;
select t.como(null);
select t.falla('sin sesión no sigue', $$select ladra.seguir_animal('10000000-0000-0000-0000-000000000001')$$, 'Inicia sesión');
select t.chk('sin sesión: lista vacía', (select count(*) from ladra.mis_animales_seguidos()) = 0);
select t.como(:'YO');
select t.chk('seguir devuelve true', ladra.seguir_animal('10000000-0000-0000-0000-000000000001'));
select ladra.seguir_animal('10000000-0000-0000-0000-000000000001');
select t.chk('seguir dos veces no duplica', (select count(*) from ladra.mis_animales_seguidos()) = 1);
select t.chk('guardar funciona', ladra.guardar_animal('10000000-0000-0000-0000-000000000001'));
select t.chk('seguido y guardado a la vez', (select seguido and guardado from ladra.mis_animales_seguidos() where animal_id = '10000000-0000-0000-0000-000000000001'));
select t.falla('no sigue su propia mascota', $$select ladra.seguir_animal('10000000-0000-0000-0000-000000000003')$$, 'tus mascotas');
select t.falla('no sigue perfil oculto de la red', $$select ladra.seguir_animal('10000000-0000-0000-0000-000000000002')$$, 'no está disponible');
select t.falla('no sigue ficha no publicada', $$select ladra.seguir_animal('10000000-0000-0000-0000-000000000004')$$, 'no está disponible');
select t.falla('no sigue si hay bloqueo', $$select ladra.seguir_animal('10000000-0000-0000-0000-000000000005')$$, 'no está disponible');
select t.falla('no lee la tabla directo', $$select * from ladra.animales_seguidos$$, 'permission denied');
select t.falla('no escribe la tabla directo', $$insert into ladra.animales_seguidos (usuario_id, animal_id) values (auth.uid(), '10000000-0000-0000-0000-000000000001')$$, 'permission denied');
select t.como(:'ANA');
select t.chk('otra persona no ve mis listas', (select count(*) from ladra.mis_animales_seguidos()) = 0);
select t.como(:'YO');
select t.chk('dejar de seguir', ladra.seguir_animal('10000000-0000-0000-0000-000000000001', false) = false);
select t.chk('sigue guardado tras dejar de seguir', (select not seguido and guardado from ladra.mis_animales_seguidos()));
select ladra.guardar_animal('10000000-0000-0000-0000-000000000001', false);
select t.chk('quitar de guardados vacía la lista', (select count(*) from ladra.mis_animales_seguidos()) = 0);
-- Si luego aparece un bloqueo, el perfil seguido desaparece de la lista.
select ladra.seguir_animal('10000000-0000-0000-0000-000000000001');
reset role;
insert into core.bloqueos (bloqueador_id, bloqueado_id) values (:'ANA', :'YO');
set role authenticated;
select t.como(:'YO');
select t.chk('un bloqueo posterior oculta el perfil seguido', (select count(*) from ladra.mis_animales_seguidos()) = 0);
reset role;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;
select nombre from t.res where not ok;

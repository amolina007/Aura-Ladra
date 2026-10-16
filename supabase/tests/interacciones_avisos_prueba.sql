-- Prueba de laboratorio de me gusta y comentarios. Solo en una base Postgres DESECHABLE, desde la raíz del repositorio.
\set ON_ERROR_STOP on
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema ladra;
grant usage on schema auth, ladra to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create table ladra.moderadores (usuario_id uuid primary key references auth.users(id));
create table ladra.perfiles_publicos (id uuid default gen_random_uuid(), usuario_id uuid unique, alias text, estado text default 'publicado');
\i supabase/migrations/20261015120000_avisos_de_puestos.sql
\i supabase/migrations/20261015220000_campanas_de_puestos.sql
\i supabase/migrations/20261015230000_interacciones_de_avisos.sql

create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$ begin insert into t.res values (coalesce(cond, false), nombre); end $$;
create function t.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin execute q; insert into t.res values (false, nombre || ' (debió fallar)');
exception when others then insert into t.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 70)); end $$;
create function t.como(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
create table t.ids (k text primary key, v uuid); grant all on t.ids to public;
grant execute on all functions in schema t to public;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.moderadores values ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.perfiles_publicos (usuario_id, alias) values ('00000000-0000-0000-0000-0000000000a1', 'Vecina Amable');
\set O '00000000-0000-0000-0000-00000000000a'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set M '00000000-0000-0000-0000-0000000000c1'

-- Campaña publicada (la dueña es O) y un borrador sin publicar.
insert into ladra.avisos_puestos (autor_id, titulo, descripcion, tipo, comuna, direccion_publica, para_que, incluye, documentacion, meta_ac, plazo_recaudacion_dias, plazo_habilitacion_dias, condiciones_devolucion, estado)
values (:'O', 'Campaña publicada de prueba', 'Campaña de prueba para me gusta y comentarios.', 'comida', 'Maipú', 'Por definir', 'Juntar la meta para definir el puesto.', '{}', '{}', 100000, 60, 60, 'Propuesta: no se entrega nada.', 'publicado');
insert into ladra.avisos_puestos (autor_id, titulo, descripcion, tipo, comuna, direccion_publica, para_que, incluye, documentacion, meta_ac, plazo_recaudacion_dias, plazo_habilitacion_dias, condiciones_devolucion, estado)
values (:'O', 'Campaña en borrador prueba', 'Campaña de prueba sin publicar todavía.', 'comida', 'Maipú', 'Por definir', 'Juntar la meta para definir el puesto.', '{}', '{}', 100000, 60, 60, 'Propuesta: no se entrega nada.', 'borrador');
insert into t.ids select 'pub', id from ladra.avisos_puestos where estado = 'publicado';
insert into t.ids select 'bor', id from ladra.avisos_puestos where estado = 'borrador';

set role anon;
select t.como('');
select t.chk('anónimo ve contadores en 0', (select me_gusta_total = 0 and comentarios_total = 0 and yo_di_me_gusta = false from ladra.listar_avisos_puestos()));
select t.falla('anónimo no da me gusta', $q$select ladra.alternar_me_gusta_aviso((select v from t.ids where k='pub'))$q$, 'permission denied');
select t.falla('anónimo no comenta', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), 'Hola vecinos')$q$, 'permission denied');
select t.falla('acceso directo a me gusta denegado', 'select * from ladra.avisos_me_gusta', 'permission denied');
select t.falla('acceso directo a comentarios denegado', 'select * from ladra.avisos_comentarios', 'permission denied');
reset role;

set role authenticated;
select t.como(:'A1');
select t.chk('me gusta se pone', ladra.alternar_me_gusta_aviso((select v from t.ids where k='pub')) = true);
select t.chk('contador 1 y marcado como mío', (select me_gusta_total = 1 and yo_di_me_gusta from ladra.listar_avisos_puestos()));
select t.como(:'B1');
select t.chk('otra persona ve contador 1 pero no marcado', (select me_gusta_total = 1 and not yo_di_me_gusta from ladra.listar_avisos_puestos()));
select t.chk('B también da me gusta', ladra.alternar_me_gusta_aviso((select v from t.ids where k='pub')) = true);
select t.chk('contador 2', (select me_gusta_total = 2 from ladra.listar_avisos_puestos()));
select t.chk('B quita su me gusta', ladra.alternar_me_gusta_aviso((select v from t.ids where k='pub')) = false);
select t.chk('contador vuelve a 1', (select me_gusta_total = 1 from ladra.listar_avisos_puestos()));
select t.falla('no se da me gusta a un borrador', $q$select ladra.alternar_me_gusta_aviso((select v from t.ids where k='bor'))$q$, 'AVISO_NO_DISPONIBLE');

select t.como(:'A1');
insert into t.ids select 'c1', ladra.comentar_aviso((select v from t.ids where k='pub'), 'Qué buena idea, cuenten conmigo');
select t.falla('comentario muy corto', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), 'a')$q$, 'TEXTO_INVALIDO');
select t.falla('comentario muy largo', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), repeat('a', 501))$q$, 'TEXTO_INVALIDO');
select t.falla('sin enlaces (https)', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), 'mira https://spam.example')$q$, 'ENLACES_NO_PERMITIDOS');
select t.falla('sin enlaces (www)', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), 'entra a www.spam.example')$q$, 'ENLACES_NO_PERMITIDOS');
select t.falla('no se comenta un borrador', $q$select ladra.comentar_aviso((select v from t.ids where k='bor'), 'Hola desde el borrador')$q$, 'AVISO_NO_DISPONIBLE');
select t.chk('contador de comentarios 1', (select comentarios_total = 1 from ladra.listar_avisos_puestos()));
select t.chk('comentario muestra alias público', (select autor_alias = 'Vecina Amable' and es_mio and puede_ocultar from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));

select t.como(:'B1');
select t.chk('sin alias → Persona de la comunidad; ajeno no puede ocultar', (select count(*) = 1 and not bool_or(es_mio) and not bool_or(puede_ocultar) from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));
select t.falla('persona ajena no oculta', $q$select ladra.ocultar_comentario_aviso((select v from t.ids where k='c1'))$q$, 'PERMISO_DENEGADO');
select t.chk('B comenta', ladra.comentar_aviso((select v from t.ids where k='pub'), 'Yo también ayudo') is not null);
select t.chk('B figura como Persona de la comunidad', (select bool_or(autor_alias = 'Persona de la comunidad') from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));

-- límite: 5 comentarios cada 10 minutos
select ladra.comentar_aviso((select v from t.ids where k='pub'), 'Comentario ' || g) from generate_series(1, 4) g;
select t.falla('límite de 5 comentarios en 10 minutos', $q$select ladra.comentar_aviso((select v from t.ids where k='pub'), 'Uno más de la cuenta')$q$, 'DEMASIADOS_COMENTARIOS');

select t.como(:'O');
select t.chk('la dueña de la campaña puede ocultar comentarios ajenos', (select bool_and(puede_ocultar) from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));
select ladra.ocultar_comentario_aviso((select v from t.ids where k='c1'));
select t.chk('comentario oculto ya no se lista', (select count(*) = 5 and not bool_or(texto like 'Qué buena%') from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));
select t.falla('no se oculta dos veces', $q$select ladra.ocultar_comentario_aviso((select v from t.ids where k='c1'))$q$, 'PERMISO_DENEGADO');

select t.como(:'M');
select t.chk('moderación puede ocultar', (select bool_and(puede_ocultar) from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));
reset role;

set role anon; select t.como('');
select t.chk('anónimo lee comentarios sin poder ocultar', (select count(*) = 5 and not bool_or(puede_ocultar) and not bool_or(es_mio) from ladra.listar_comentarios_aviso((select v from t.ids where k='pub'))));
select t.chk('anónimo: contador de comentarios 5', (select comentarios_total = 5 from ladra.listar_avisos_puestos()));
select t.chk('borrador no lista comentarios', (select count(*) = 0 from ladra.listar_comentarios_aviso((select v from t.ids where k='bor'))));
reset role;

select count(*) filter (where ok) as ok, count(*) as total from t.res;
select nombre from t.res where not ok;

-- Prueba de laboratorio de Avisos de puestos (Comida y agua).
-- Se ejecuta en una base Postgres DESECHABLE (nunca en Supabase real), desde la raíz del repositorio:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/avisos_puestos_prueba.sql
-- Crea piezas mínimas falsas (auth, ladra.moderadores, ladra.perfiles_publicos) y luego la migración.
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

create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t.res values (coalesce(cond, false), nombre); end $$;
create function t.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin
  execute q;
  insert into t.res values (false, nombre || ' (debió fallar)');
exception when others then
  insert into t.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 70));
end $$;
create function t.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
-- Crea un aviso válido con el título que se indique (para no repetir 15 parámetros en cada prueba).
create function t.nuevo(p_titulo text) returns uuid language sql as $$
  select ladra.crear_aviso_puesto(p_titulo, 'Bebedero y comedero para perros en una plaza del barrio.', 'ambos', 'Maipú',
    'Plaza de ejemplo, Maipú', -33.51, -70.75, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.',
    array['Alimento seco', 'Agua y limpieza'], array['Fabricación con fotos', 'Recargas con fecha'],
    100, 20, 30, 'sin_consultar', 'Propuesta: si no se habilita, se devuelve lo no entregado.') $$;
create table t.ids (k text primary key, v uuid); grant all on t.ids to public;
grant execute on all functions in schema t to public;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.moderadores values ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.perfiles_publicos (usuario_id, alias) values ('00000000-0000-0000-0000-00000000000a', 'Vecina Ejemplo');

\set O  '00000000-0000-0000-0000-00000000000a'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set S  '00000000-0000-0000-0000-0000000000b1'
\set M  '00000000-0000-0000-0000-0000000000c1'

-- ===== 1. Crear y validar =====
set role authenticated;
select t.como('');
select t.falla('anónimo no crea', $q$select t.nuevo('Puesto de ejemplo uno')$q$, 'SESION_REQUERIDA');
select t.como(:'O');
insert into t.ids select 'p1', t.nuevo('Puesto de ejemplo uno');
select t.chk('autora ve su borrador', (select estado = 'borrador' and costo_mensual_ac = 100 from ladra.mis_avisos_puestos() limit 1));
select t.falla('acceso directo a la tabla denegado', 'select * from ladra.avisos_puestos', 'permission denied');
select t.falla('no se escribe directo', $q$update ladra.avisos_puestos set estado = 'publicado'$q$, 'permission denied');
select t.falla('título demasiado corto', $q$select t.nuevo('corto')$q$, 'check constraint');
select t.falla('lista con elemento demasiado corto', $q$select ladra.crear_aviso_puesto('Puesto de ejemplo dos', 'Bebedero y comedero para perros en una plaza del barrio.', 'ambos', 'Maipú', 'Plaza de ejemplo, Maipú', null, null, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.', array['ab'], array['Fabricación con fotos'], 100, null, 30, null, 'Propuesta de devolución.')$q$, 'LISTA_INVALIDA');
select t.falla('tipo inválido', $q$select ladra.crear_aviso_puesto('Puesto de ejemplo dos', 'Bebedero y comedero para perros en una plaza del barrio.', 'jaula', 'Maipú', 'Plaza de ejemplo, Maipú', null, null, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.', array['Alimento seco'], array['Fabricación con fotos'], 100, null, 30, null, 'Propuesta de devolución.')$q$, 'check constraint');
select t.falla('latitud sin longitud', $q$select ladra.crear_aviso_puesto('Puesto de ejemplo dos', 'Bebedero y comedero para perros en una plaza del barrio.', 'ambos', 'Maipú', 'Plaza de ejemplo, Maipú', -33.5, null, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.', array['Alimento seco'], array['Fabricación con fotos'], 100, null, 30, null, 'Propuesta de devolución.')$q$, 'ubicacion_completa');
select t.falla('costo mensual cero', $q$select ladra.crear_aviso_puesto('Puesto de ejemplo dos', 'Bebedero y comedero para perros en una plaza del barrio.', 'ambos', 'Maipú', 'Plaza de ejemplo, Maipú', null, null, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.', array['Alimento seco'], array['Fabricación con fotos'], 0, null, 30, null, 'Propuesta de devolución.')$q$, 'check constraint');
select t.falla('plazo mayor a 180 días', $q$select ladra.crear_aviso_puesto('Puesto de ejemplo dos', 'Bebedero y comedero para perros en una plaza del barrio.', 'ambos', 'Maipú', 'Plaza de ejemplo, Maipú', null, null, 'Habilitar y sostener un bebedero y un comedero con cada paso documentado.', array['Alimento seco'], array['Fabricación con fotos'], 100, null, 400, null, 'Propuesta de devolución.')$q$, 'check constraint');

select t.como('');
select t.chk('un borrador NO es público', (select count(*) from ladra.listar_avisos_puestos()) = 0);
select t.falla('sin sesión no se ven "mis avisos"', 'select * from ladra.mis_avisos_puestos()', 'SESION_REQUERIDA');

-- ===== 2. Enviar a revisión y moderar =====
select t.como(:'S');
select t.falla('un extraño no envía el borrador', format('select ladra.enviar_aviso_puesto(%L)', (select v from t.ids where k='p1')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select ladra.enviar_aviso_puesto((select v from t.ids where k='p1'));
select t.falla('no se envía dos veces', format('select ladra.enviar_aviso_puesto(%L)', (select v from t.ids where k='p1')), 'TRANSICION_INVALIDA');
select t.falla('la autora no se aprueba sola', format('select ladra.moderar_aviso_puesto(%L, true)', (select v from t.ids where k='p1')), 'PERMISO_DENEGADO');
select t.falla('la autora no ve la bandeja de moderación', 'select * from ladra.avisos_puestos_en_revision()', 'PERMISO_DENEGADO');
select t.como(:'A1');
select t.falla('otra persona no modera', format('select ladra.moderar_aviso_puesto(%L, true)', (select v from t.ids where k='p1')), 'PERMISO_DENEGADO');
select t.como('');
select t.chk('en revisión tampoco es público', (select count(*) from ladra.listar_avisos_puestos()) = 0);

select t.como(:'M');
select t.chk('moderador ve el aviso con el alias de la autora', (select count(*) = 1 and bool_and(autor_alias = 'Vecina Ejemplo') from ladra.avisos_puestos_en_revision()));
select t.falla('rechazar exige un motivo', format('select ladra.moderar_aviso_puesto(%L, false)', (select v from t.ids where k='p1')), 'MOTIVO_REQUERIDO');
select t.falla('el motivo no puede ser mínimo', format($f$select ladra.moderar_aviso_puesto(%L, false, 'no')$f$, (select v from t.ids where k='p1')), 'MOTIVO_REQUERIDO');
select ladra.moderar_aviso_puesto((select v from t.ids where k='p1'), false, 'Falta confirmar el permiso del lugar.');
select t.falla('no se modera dos veces', format('select ladra.moderar_aviso_puesto(%L, true)', (select v from t.ids where k='p1')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select t.chk('la autora ve el rechazo y su motivo',
  (select estado = 'rechazado' and motivo_rechazo = 'Falta confirmar el permiso del lugar.' from ladra.mis_avisos_puestos() where id = (select v from t.ids where k='p1')));
select t.como('');
select t.chk('un rechazado no es público', (select count(*) from ladra.listar_avisos_puestos()) = 0);

-- ===== 3. Publicar y ver =====
select t.como(:'O');
insert into t.ids select 'p2', t.nuevo('Puesto de ejemplo publicable');
select ladra.enviar_aviso_puesto((select v from t.ids where k='p2'));
select t.como(:'M');
select ladra.moderar_aviso_puesto((select v from t.ids where k='p2'), true);
select t.como('');
select t.chk('publicado: lo ve cualquiera sin cuenta', (select count(*) from ladra.listar_avisos_puestos()) = 1);
select t.chk('publicado: es_mio es falso para anónimo', (select not es_mio from ladra.listar_avisos_puestos() limit 1));
select t.chk('el listado público NO expone quién lo creó',
  not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'ladra' and p.proname = 'listar_avisos_puestos'
                 and p.proargnames::text ilike '%autor%'));
select t.como(:'O');
select t.chk('publicado: es_mio es verdadero para la autora', (select es_mio from ladra.listar_avisos_puestos() limit 1));
select t.como(:'S');
select t.chk('publicado: es_mio es falso para un extraño', (select not es_mio from ladra.listar_avisos_puestos() limit 1));
select t.chk('el aviso publicado pide 100 AC al mes (solo solicitud)', (select costo_mensual_ac = 100 from ladra.listar_avisos_puestos() limit 1));

-- El rol anon real (visitante sin cuenta) solo puede LEER los avisos publicados.
set role anon;
select t.chk('rol anon lee los avisos publicados', (select count(*) = 1 from ladra.listar_avisos_puestos()));
select t.falla('rol anon no crea avisos', $q$select t.nuevo('Puesto de ejemplo anónimo')$q$, 'permission denied');
select t.falla('rol anon no ve "mis avisos"', 'select * from ladra.mis_avisos_puestos()', 'permission denied');
select t.falla('rol anon no modera', format('select ladra.moderar_aviso_puesto(%L, true)', (select v from t.ids where k='p2')), 'permission denied');
select t.falla('rol anon no ve la bandeja', 'select * from ladra.avisos_puestos_en_revision()', 'permission denied');
set role authenticated;

-- ===== 4. El contenido queda bloqueado =====
reset role;
select t.falla('no se cambia el contenido de un aviso publicado', $q$update ladra.avisos_puestos set titulo = 'Título cambiado a escondidas' where estado = 'publicado'$q$, 'AVISO_BLOQUEADO');
select t.falla('movimiento_ac solo puede ser ninguno', $q$update ladra.avisos_puestos set movimiento_ac = 'entregado' where estado = 'rechazado'$q$, 'check constraint');
select t.chk('todos los avisos tienen movimiento_ac = ninguno', (select bool_and(movimiento_ac = 'ninguno') from ladra.avisos_puestos));

-- ===== 5. Retirar =====
set role authenticated;
select t.como(:'S');
select t.falla('un extraño no retira un aviso ajeno', format('select ladra.retirar_aviso_puesto(%L)', (select v from t.ids where k='p2')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select ladra.retirar_aviso_puesto((select v from t.ids where k='p2'));
select t.falla('no se retira dos veces', format('select ladra.retirar_aviso_puesto(%L)', (select v from t.ids where k='p2')), 'TRANSICION_INVALIDA');
select t.como('');
select t.chk('un aviso retirado deja de ser público', (select count(*) from ladra.listar_avisos_puestos()) = 0);

-- ===== 6. Límite de avisos sin cerrar =====
select t.como(:'A1');
select t.nuevo('Puesto límite número uno');
select t.nuevo('Puesto límite número dos');
select t.nuevo('Puesto límite número tres');
select t.falla('máximo 3 avisos sin cerrar', $q$select t.nuevo('Puesto límite número cuatro')$q$, 'LIMITE_AVISOS');
select ladra.retirar_aviso_puesto((select id from ladra.mis_avisos_puestos() order by creado_en limit 1));
select t.chk('al retirar uno se puede crear otro', t.nuevo('Puesto límite número cuatro') is not null);

reset role;
select case when ok then 'PASS' else 'FAIL' end as r, nombre from t.res order by ok, nombre;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;

-- Prueba de laboratorio de Acciones por financiar.
-- Se ejecuta en una base Postgres DESECHABLE (nunca en Supabase real).
-- Crea piezas mínimas falsas (auth, ladra.animales, etc.) y luego las dos migraciones.
\set ON_ERROR_STOP on
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema ladra;
grant usage on schema auth, ladra to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create table ladra.animales (id uuid primary key default gen_random_uuid(), slug text, nombre text, foto_url text, estado text default 'publicado');
create table ladra.moderadores (usuario_id uuid primary key references auth.users(id));
create table ladra.perfiles_publicos (id uuid default gen_random_uuid(), usuario_id uuid unique, alias text, estado text default 'publicado');
\i supabase/migrations/20261003180000_acciones_financiables_tablas.sql
\i supabase/migrations/20261003181000_acciones_financiables_funciones.sql

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
grant execute on all functions in schema t to public;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
 ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.moderadores values ('00000000-0000-0000-0000-0000000000c1');
insert into ladra.perfiles_publicos (usuario_id, alias) values ('00000000-0000-0000-0000-00000000000a', 'Cuidadora Ejemplo');
insert into ladra.animales (id, slug, nombre) values ('11111111-1111-1111-1111-111111111111', 'rocco', 'Rocco');
insert into ladra.animales (id, slug, nombre, estado) values ('22222222-2222-2222-2222-222222222222', 'oculto', 'Oculto', 'pendiente');
create table t.ids (k text primary key, v uuid); grant all on t.ids to public;

-- Atajos para cambiar de persona
create function t.como(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;
grant execute on function t.como(text) to public;

\set O '00000000-0000-0000-0000-00000000000a'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set S  '00000000-0000-0000-0000-0000000000b1'
\set M  '00000000-0000-0000-0000-0000000000c1'

-- ===== 1. Crear, revisar y publicar =====
set role authenticated;
select t.como('');
select t.falla('anónimo no crea', $q$select ladra.crear_accion('Alojamiento temporal tres días','Alojamiento con alimento y baño para un perro',
  'alojamiento','Maipú','alta',null,'{}','{}','Cancelación hasta 48 horas antes','Devolución total si no se completa',now()+interval '10 days',7,null,
  '[{"concepto":"Alojamiento","monto_clp":90000}]'::jsonb)$q$, 'SESION_REQUERIDA');
select t.como(:'O');
insert into t.ids select 'a1', ladra.crear_accion('Alojamiento temporal tres días','Alojamiento con alimento y baño para un perro',
  'alojamiento','Maipú','alta','11111111-1111-1111-1111-111111111111','{Alimento,Baño}','{Veterinario}','Cancelación hasta 48 horas antes',
  'Devolución total si no se completa la meta',now()+interval '10 days',7,'Lun a vie',
  '[{"concepto":"Alojamiento y alimento","tipo":"prestacion","monto_clp":90000},{"concepto":"Comisión plataforma","tipo":"comision_plataforma","monto_clp":7000},{"concepto":"Costo de pago","tipo":"costo_pago","monto_clp":3000}]'::jsonb);
select t.chk('meta calculada en servidor = 100000', (select meta_clp from ladra.mis_acciones() limit 1) = 100000);
select t.falla('fecha límite pasada', $q$select ladra.crear_accion('Alojamiento temporal tres días','Alojamiento con alimento y baño para un perro','alojamiento','Maipú','normal',null,'{}','{}','Cancelación hasta 48 horas antes','Devolución total si no se completa',now()-interval '1 day',7,null,'[{"concepto":"x y z","monto_clp":5000}]'::jsonb)$q$, 'FECHA_LIMITE');
select t.falla('animal no público', $q$select ladra.crear_accion('Alojamiento temporal tres días','Alojamiento con alimento y baño para un perro','alojamiento','Maipú','normal','22222222-2222-2222-2222-222222222222','{}','{}','Cancelación hasta 48 horas antes','Devolución total si no se completa',now()+interval '5 days',7,null,'[{"concepto":"x y z","monto_clp":5000}]'::jsonb)$q$, 'ANIMAL_INVALIDO');
select t.falla('acceso directo a tabla denegado', 'select * from ladra.acciones_financiables', 'permission denied');
select t.falla('no se puede escribir meta directo', $q$update ladra.acciones_financiables set recaudado_clp = 100000$q$, 'permission denied');

select t.como('');
select t.chk('borrador no es público', (select count(*) from ladra.acciones_publicas()) = 0);
select t.chk('detalle de borrador oculto para anónimo', ladra.accion_detalle((select v from t.ids where k='a1')) is null);
select t.como(:'S');
select t.falla('extraño no envía a revisión', format('select ladra.enviar_accion_a_revision(%L)', (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select ladra.enviar_accion_a_revision((select v from t.ids where k='a1'));
select t.falla('responsable no se autoaprueba', format('select ladra.moderar_accion(%L, true)', (select v from t.ids where k='a1')), 'PERMISO_DENEGADO');
select t.falla('aportar antes de aprobar', format($f$select * from ladra.aportar_simulado(%L, 5000, 'clave-previa-1')$f$, (select v from t.ids where k='a1')), 'ACCION_NO_RECAUDANDO');
select t.como(:'M');
select ladra.moderar_accion((select v from t.ids where k='a1'), true);
select ladra.marcar_verificacion_responsable((select v from t.ids where k='a1'), 'en_revision');
select t.como('');
select t.chk('publicada: anónimo la ve con alias real', (select responsable_alias from ladra.acciones_publicas() limit 1) = 'Cuidadora Ejemplo');
select t.chk('filtro por categoría', (select count(*) from ladra.acciones_publicas('salud')) = 0 and (select count(*) from ladra.acciones_publicas('alojamiento','maipú')) = 1);

-- ===== 2. Aportes: duplicado, exceso, propio =====
select t.como(:'A1');
select t.chk('aporte 40000 ok', (select recaudado_clp from ladra.aportar_simulado((select v from t.ids where k='a1'), 40000, 'clave-a1-0001')) = 40000);
select t.chk('doble toque con misma clave no duplica',
  (select repetido and recaudado_clp = 40000 from ladra.aportar_simulado((select v from t.ids where k='a1'), 40000, 'clave-a1-0001')));
select t.chk('solo 1 aporte registrado', (select count(*) from ladra.mis_aportes()) = 1);
select t.chk('aporte marcado simulado', (select simulado from ladra.mis_aportes() limit 1));
select t.falla('monto menor al mínimo', format($f$select * from ladra.aportar_simulado(%L, 500, 'clave-a1-0002')$f$, (select v from t.ids where k='a1')), 'MONTO_INVALIDO');
select t.falla('excede la meta', format($f$select * from ladra.aportar_simulado(%L, 70000, 'clave-a1-0003')$f$, (select v from t.ids where k='a1')), 'EXCEDE_META');
select t.como(:'O');
select t.falla('responsable no aporta a lo suyo', format($f$select * from ladra.aportar_simulado(%L, 5000, 'clave-own-0001')$f$, (select v from t.ids where k='a1')), 'APORTE_PROPIO');
reset role;
select t.falla('no cambia meta con aportes (trigger)', $q$update ladra.acciones_financiables set meta_clp = 5000$q$, 'ACCION_BLOQUEADA');
set role authenticated;
select t.falla('no cambia presupuesto con aportes', format($f$insert into ladra.acciones_partidas(accion_id, concepto, monto_clp) values (%L,'extra',1000)$f$, (select v from t.ids where k='a1')), 'permission denied');
reset role;
select t.falla('partidas bloqueadas con aportes (trigger)', format($f$insert into ladra.acciones_partidas(accion_id, concepto, monto_clp) values (%L,'extra',1000)$f$, (select v from t.ids where k='a1')), 'PRESUPUESTO_BLOQUEADO');
set role authenticated;

-- ===== 3. Meta alcanzada, ejecución y cierre =====
select t.como(:'A2');
select t.chk('A2 completa la meta', (select estado from ladra.aportar_simulado((select v from t.ids where k='a1'), 60000, 'clave-a2-0001')) = 'meta_alcanzada');
select t.falla('con meta alcanzada ya no se aporta', format($f$select * from ladra.aportar_simulado(%L, 1000, 'clave-a2-0002')$f$, (select v from t.ids where k='a1')), 'ACCION_NO_RECAUDANDO');
select t.chk('meta alcanzada NO libera fondos', (select (ladra.accion_detalle((select v from t.ids where k='a1')))->'accion'->>'desembolso') = 'no_liberado');
select t.como(:'S');
select t.falla('extraño no programa', format($f$select ladra.programar_accion(%L, now()+interval '3 days')$f$, (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select t.falla('no se puede saltar a ejecución', format('select ladra.iniciar_ejecucion_accion(%L)', (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select ladra.programar_accion((select v from t.ids where k='a1'), now()+interval '3 days');
select ladra.iniciar_ejecucion_accion((select v from t.ids where k='a1'));
select t.falla('cierre sin evidencia', format('select ladra.solicitar_cierre_accion(%L)', (select v from t.ids where k='a1')), 'EVIDENCIA_REQUERIDA');
select t.falla('url no https', format($f$select ladra.publicar_avance_accion(%L,'evidencia','Fotos del día','http://x.cl/a.jpg')$f$, (select v from t.ids where k='a1')), 'check');
select ladra.publicar_avance_accion((select v from t.ids where k='a1'), 'evidencia', 'Fotos del perro bañado y alimentado', 'https://ejemplo.cl/foto.jpg');
select t.como(:'S');
select t.falla('extraño no publica avances', format($f$select ladra.publicar_avance_accion(%L,'avance','Hola mundo')$f$, (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select t.falla('extraño no cancela', format($f$select ladra.cancelar_accion(%L,'x')$f$, (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select t.como(:'O');
select ladra.solicitar_cierre_accion((select v from t.ids where k='a1'));
select t.chk('completada y desembolso aún no liberado',
  (ladra.accion_detalle((select v from t.ids where k='a1'))->'accion'->>'estado') = 'completada'
  and (ladra.accion_detalle((select v from t.ids where k='a1'))->'accion'->>'desembolso') = 'no_liberado');
select t.falla('completada no se cancela', format($f$select ladra.cancelar_accion(%L,'x')$f$, (select v from t.ids where k='a1')), 'TRANSICION_INVALIDA');
select t.chk('historial registra cambios de estado', jsonb_array_length(ladra.accion_detalle((select v from t.ids where k='a1'))->'historial') >= 6);
select t.chk('actualizaciones visibles', jsonb_array_length(ladra.accion_detalle((select v from t.ids where k='a1'))->'actualizaciones') = 1);

-- ===== 4. Vencimiento y cancelación =====
select t.como(:'O');
insert into t.ids select 'a2', ladra.crear_accion('Control veterinario de un gato rescatado','Consulta y vacuna para un gato comunitario de Maipú',
  'salud','Maipú','normal',null,'{}','{}','Cancelación hasta 48 horas antes','Devolución total si no se completa la meta',now()+interval '5 days',7,null,'[{"concepto":"Consulta","monto_clp":30000}]'::jsonb);
insert into t.ids select 'a3', ladra.crear_accion('Paseos acompañados durante dos semanas','Paseos diarios para un perro de canil con poca movilidad',
  'cuidado','Maipú','normal',null,'{}','{}','Cancelación hasta 48 horas antes','Devolución total si no se completa la meta',now()+interval '5 days',7,null,'[{"concepto":"Paseos","monto_clp":50000}]'::jsonb);
select ladra.enviar_accion_a_revision((select v from t.ids where k='a2'));
select ladra.enviar_accion_a_revision((select v from t.ids where k='a3'));
select t.como(:'M');
select ladra.moderar_accion((select v from t.ids where k='a2'), true);
select ladra.moderar_accion((select v from t.ids where k='a3'), true);
select t.como(:'A1');
select ladra.aportar_simulado((select v from t.ids where k='a2'), 10000, 'clave-a1-exp-1');
select ladra.aportar_simulado((select v from t.ids where k='a3'), 5000, 'clave-a1-can-1');
reset role;
set session_replication_role = replica;
update ladra.acciones_financiables set fecha_limite = now() - interval '1 minute' where id = (select v from t.ids where k='a2');
set session_replication_role = origin;
set role authenticated;
select t.como(:'A3');
select t.falla('no se aporta tras vencer', format($f$select * from ladra.aportar_simulado(%L, 1000, 'clave-a3-exp-1')$f$, (select v from t.ids where k='a2')), 'ACCION_NO_RECAUDANDO');
select t.como(:'A1');
select t.chk('vencida pasa a expirada con devolución pendiente',
  (select accion_estado = 'expirada' and estado_devolucion = 'pendiente' from ladra.mis_aportes() where accion_id = (select v from t.ids where k='a2')));
select t.chk('el aporte NO cambió de destino (sigue confirmado)',
  (select estado = 'confirmado' from ladra.mis_aportes() where accion_id = (select v from t.ids where k='a2')));
select t.como(:'O');
select ladra.cancelar_accion((select v from t.ids where k='a3'), 'Ya no hay disponibilidad');
select t.chk('cancelada con aportes deja devolución pendiente',
  (select estado = 'cancelada' and estado_devolucion = 'pendiente' from ladra.mis_acciones() where id = (select v from t.ids where k='a3')));
select t.como(:'A1');
select t.falla('no se aporta a cancelada', format($f$select * from ladra.aportar_simulado(%L, 1000, 'clave-a1-can-2')$f$, (select v from t.ids where k='a3')), 'ACCION_NO_RECAUDANDO');
select t.chk('aportante ve acción cancelada (no pública)', ladra.accion_detalle((select v from t.ids where k='a3')) is not null);
select t.como(:'S');
select t.chk('extraño NO ve acción cancelada', ladra.accion_detalle((select v from t.ids where k='a3')) is null);

reset role;
select case when ok then 'PASS' else 'FAIL' end as r, nombre from t.res order by ok, nombre;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;

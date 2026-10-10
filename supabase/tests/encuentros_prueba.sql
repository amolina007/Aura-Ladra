-- Prueba de laboratorio de encuentros. Base Postgres DESECHABLE (nunca Supabase real).
-- Preparación igual que seguir_y_guardar_prueba.sql, más 20261010010000_encuentros.sql.
\set ON_ERROR_STOP on
create schema t2; grant usage on schema t2 to public;
create table t2.res (ok boolean, nombre text); grant all on t2.res to public;
create function t2.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t2.res values (coalesce(cond, false), nombre); end $$;
create function t2.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin
  execute q;
  insert into t2.res values (false, nombre || ' (debió fallar)');
exception when others then
  insert into t2.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 80));
end $$;
create function t2.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
create function t2.ids(u text) returns text language sql stable as
  $$ select coalesce(string_agg(titulo, ',' order by titulo), '') from ladra.encuentros_visibles(now(), now() + interval '30 days') $$;
create table t2.k (k text, v uuid); grant all on t2.k to public;
grant execute on all functions in schema t2 to public;

\set ORG '00000000-0000-0000-0000-0000000000b1'
\set AMI '00000000-0000-0000-0000-0000000000b2'
\set EXT '00000000-0000-0000-0000-0000000000b3'
\set BLO '00000000-0000-0000-0000-0000000000b4'
insert into auth.users (id) values (:'ORG'), (:'AMI'), (:'EXT'), (:'BLO');
insert into core.perfiles (id, alias) values (:'ORG', 'org_uno'), (:'AMI', 'ami_dos'), (:'EXT', 'ext_tres'), (:'BLO', 'blo_cuatro');
insert into ladra.animales (id, slug, nombre, especie, estado, creado_por) values
  ('20000000-0000-0000-0000-000000000001', 'rex-b', 'Rex', 'perro', 'publicado', :'AMI'),
  ('20000000-0000-0000-0000-000000000002', 'ajeno-b', 'Ajeno', 'perro', 'publicado', :'ORG');
insert into core.amistades (usuario_menor, usuario_mayor) values (:'ORG', :'AMI');
insert into core.bloqueos (bloqueador_id, bloqueado_id) values (:'ORG', :'BLO');

set role authenticated;
select t2.como(null);
select t2.falla('sin sesión no crea', $$select ladra.crear_encuentro('paseo', 'X', now() + interval '2 days', null, null, 'Plaza')$$, 'Inicia sesión');
select t2.como(:'ORG');
select t2.falla('no acepta fecha pasada', $$select ladra.crear_encuentro('paseo', 'Pasado', now() - interval '3 days', null, null, 'Plaza')$$, 'futura');
select t2.falla('exige lugar', $$select ladra.crear_encuentro('paseo', 'Sin lugar', now() + interval '2 days')$$, 'check');
select t2.falla('no lee tablas directo', $$select * from ladra.encuentros$$, 'permission denied');
select ladra.crear_encuentro('paseo', 'Paseo privado', now() + interval '2 days', null, null, 'Entrada del parque', 'privado', null, 'Perros con correa', 'Tranquilo con otros perros');
select ladra.crear_encuentro('jornada_adopcion', 'Jornada pública', now() + interval '3 days', null, null, 'Plaza de Maipú', 'publico');
insert into t2.k select 'priv', id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado';
select t2.chk('organizador ve ambos', t2.ids(null) = 'Jornada pública,Paseo privado');
select t2.como(:'EXT');
select t2.chk('ajeno solo ve el público', t2.ids(null) = 'Jornada pública');
select t2.como(null);
select t2.chk('sin sesión solo ve el público', t2.ids(null) = 'Jornada pública');
select t2.como(:'ORG');
select t2.chk('invita solo a amistades (no a bloqueado, a sí mismo ni a no-amigos)', ladra.invitar_a_encuentro((select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado'), array[:'AMI'::uuid, :'BLO'::uuid, :'ORG'::uuid, :'EXT'::uuid]) = 1);
select t2.como(:'AMI');
select t2.chk('invitada ve el privado', t2.ids(null) = 'Jornada pública,Paseo privado');
select t2.chk('mi_estado = invitado', (select mi_estado from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado') = 'invitado');
select t2.falla('no puede llevar mascota ajena', format($$select ladra.responder_encuentro(%L, 'confirmado', 2::smallint, array['20000000-0000-0000-0000-000000000002']::uuid[])$$, (select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado')), 'propias mascotas');
select ladra.responder_encuentro((select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado'), 'confirmado', 2::smallint, array['20000000-0000-0000-0000-000000000001']::uuid[]);
select t2.chk('confirmación cuenta personas y mascotas', (select personas_confirmadas = 2 and animales_confirmados = 1 from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado'));
select t2.como(:'EXT');
select t2.falla('ajeno no responde a un privado', format($$select ladra.responder_encuentro(%L, 'confirmado')$$, (select v from t2.k where k = 'priv')), 'no está disponible');
select ladra.responder_encuentro((select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Jornada pública'), 'confirmado');
select t2.chk('cualquiera confirma un público', (select mi_estado = 'confirmado' from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Jornada pública'));
select t2.como(:'BLO');
select t2.chk('persona bloqueada no ve ningún encuentro del organizador', t2.ids(null) = '');
select t2.como(:'AMI');
select t2.falla('invitada no puede cancelar', format($$select ladra.cancelar_encuentro(%L)$$, (select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado')), 'Solo quien organiza');
select t2.falla('invitada no puede invitar', format($$select ladra.invitar_a_encuentro(%L, array[%L::uuid])$$, (select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado'), :'EXT'), 'Solo quien organiza');
select t2.como(:'ORG');
select ladra.actualizar_encuentro((select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo privado'), 'Paseo de la tarde');
select t2.chk('organizador actualiza', t2.ids(null) like '%Paseo de la tarde%');
select ladra.cancelar_encuentro((select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo de la tarde'), 'Lluvia');
select t2.chk('cancelado queda visible como cancelado', (select estado = 'cancelado' from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo de la tarde'));
select t2.como(:'AMI');
select t2.falla('no se responde a un cancelado', format($$select ladra.responder_encuentro(%L, 'confirmado')$$, (select id from ladra.encuentros_visibles(now(), now() + interval '30 days') where titulo = 'Paseo de la tarde')), 'cancelado');
select t2.falla('rango de fechas limitado', $$select * from ladra.encuentros_visibles(now(), now() + interval '800 days')$$, 'demasiado grande');
reset role;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t2.res;
select nombre from t2.res where not ok;

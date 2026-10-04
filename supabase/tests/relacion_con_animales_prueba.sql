-- Prueba de laboratorio de ladra.mi_relacion_con_animales(). Base Postgres DESECHABLE (nunca Supabase real).
-- Preparación, en este orden:
--   1. supabase/tests/laboratorio_piezas_falsas.sql
--   2. create role authenticator nologin;   (Core lo configura en su primera migración)
--   3. todas las migraciones de AuraLadra (omitiendo las dos de AuraRitmos), SIN las de
--      acciones financiables ni «Mi árbol»: esta función no depende de ellas
--   4. de Convergencia Aura Core (repo AuraCore): 20260920000000_create_core_identity.sql,
--      20260920010000_create_core_follows_and_friendships.sql y la «Parte 1» (bloqueos) de
--      20261002180000_core_bloqueo_reporte_solicitudes_mensaje.sql
--   5. 20261003200000_relacion_con_animales.sql
-- Uso: psql -d <base> -f supabase/tests/relacion_con_animales_prueba.sql
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
-- Lista «Mascota:relación» tal como la ve la persona u (vacío si no hay sesión).
create function t.rel(u text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
  select coalesce(string_agg(a.nombre || ':' || x.relacion, ', ' order by a.nombre), '')
    into r
    from ladra.mi_relacion_con_animales() x
    join ladra.animales a on a.id = x.animal_id;
  return r;
end $$;
grant execute on all functions in schema t to public;

-- Personas (el mismo id sirve en auth, en Core y en AuraLadra, como en el proyecto real)
\set YO   '00000000-0000-0000-0000-000000000001'
\set CATE '00000000-0000-0000-0000-000000000002'
\set DANI '00000000-0000-0000-0000-000000000003'
\set ELISA '00000000-0000-0000-0000-000000000004'
\set FABI '00000000-0000-0000-0000-000000000005'
\set GUS  '00000000-0000-0000-0000-000000000006'
\set HUGO '00000000-0000-0000-0000-000000000007'
\set INES '00000000-0000-0000-0000-000000000008'
\set JOSE '00000000-0000-0000-0000-000000000009'
\set KAI  '00000000-0000-0000-0000-00000000000a'
\set LIA  '00000000-0000-0000-0000-00000000000b'

insert into auth.users (id) values (:'YO'), (:'CATE'), (:'DANI'), (:'ELISA'), (:'FABI'), (:'GUS'), (:'HUGO'), (:'INES'), (:'JOSE'), (:'KAI'), (:'LIA');
insert into core.perfiles (id, alias) values
  (:'YO', 'alejandro'), (:'CATE', 'cate'), (:'DANI', 'dani'), (:'ELISA', 'elisa'), (:'FABI', 'fabi'),
  (:'GUS', 'gus'), (:'HUGO', 'hugo'), (:'INES', 'ines'), (:'JOSE', 'jose'), (:'KAI', 'kai'), (:'LIA', 'lia');
insert into ladra.perfiles_publicos (id, usuario_id, alias, estado) values
  ('a0000000-0000-0000-0000-000000000001', :'YO', 'Alejandro', 'publicado'),
  ('a0000000-0000-0000-0000-000000000008', :'INES', 'Ines', 'publicado'),
  ('a0000000-0000-0000-0000-000000000004', :'ELISA', 'Elisa', 'publicado');
insert into ladra.perfiles_publicos (id, usuario_id, alias, estado, visibilidad) values
  ('a0000000-0000-0000-0000-00000000000a', :'KAI', 'Kai', 'publicado', 'oculto'),
  ('a0000000-0000-0000-0000-00000000000b', :'LIA', 'Lía', 'publicado', 'oculto');

-- Mascotas. Las de Cate las creó ella con su propia cuenta.
insert into ladra.animales (id, slug, nombre, especie, estado, creado_por, mostrar_en_red) values
  ('b0000000-0000-0000-0000-000000000001', 'leia',     'Leia',     'perro', 'publicado', :'YO',    true),
  ('b0000000-0000-0000-0000-000000000002', 'sol',      'Sol',      'gato',  'publicado', :'YO',    false),  -- mía, oculta de la red
  ('b0000000-0000-0000-0000-000000000003', 'pelusa',   'Pelusa',   'perro', 'publicado', :'CATE',  true),
  ('b0000000-0000-0000-0000-000000000004', 'luna',     'Luna',     'perro', 'publicado', :'CATE',  true),
  ('b0000000-0000-0000-0000-000000000005', 'secreta',  'Secreta',  'gato',  'publicado', :'CATE',  false),  -- de Cate, oculta de la red
  ('b0000000-0000-0000-0000-000000000006', 'rocky',    'Rocky',    'perro', 'publicado', :'DANI',  true),   -- sin relación
  ('b0000000-0000-0000-0000-000000000007', 'mora',     'Mora',     'gato',  'publicado', :'ELISA', true),   -- a Elisa la sigo
  ('b0000000-0000-0000-0000-000000000008', 'zeus',     'Zeus',     'perro', 'publicado', :'FABI',  true),   -- yo bloqueé a Fabi
  ('b0000000-0000-0000-0000-000000000009', 'nube',     'Nube',     'gato',  'publicado', :'GUS',   true),   -- Gus me bloqueó
  ('b0000000-0000-0000-0000-00000000000a', 'bruno',    'Bruno',    'perro', 'publicado', :'HUGO',  true),   -- amigo Y bloqueado
  ('b0000000-0000-0000-0000-00000000000b', 'tito',     'Tito',     'perro', 'publicado', :'INES',  true),   -- soy dueño secundario
  ('b0000000-0000-0000-0000-00000000000c', 'kira',     'Kira',     'perro', 'publicado', :'DANI',  true),   -- soy cuidador confirmado
  ('b0000000-0000-0000-0000-00000000000d', 'toto',     'Toto',     'perro', 'publicado', :'DANI',  true),   -- cuidador solo pendiente
  ('b0000000-0000-0000-0000-00000000000e', 'rex',      'Rex',      'perro', 'publicado', :'DANI',  true),   -- colaborador confirmado
  ('b0000000-0000-0000-0000-00000000000f', 'pendi',    'Pendi',    'perro', 'pendiente', :'CATE',  true),   -- ficha aún no publicada
  ('b0000000-0000-0000-0000-000000000010', 'pelon',    'Pelón',    'perro', 'publicado', :'JOSE',  true),   -- José me sigue a mí, yo a él no
  ('b0000000-0000-0000-0000-000000000011', 'fantasma', 'Fantasma', 'gato',  'publicado', :'KAI',   true),   -- Kai oculta su vínculo; yo lo sigo
  ('b0000000-0000-0000-0000-000000000012', 'fantasma2','Fantasma2','gato',  'publicado', :'LIA',   true);   -- Lía oculta su vínculo; es mi amiga

-- Core: yo soy amigo de Cate y de Hugo; sigo a Elisa; bloqueé a Fabi; Gus me bloqueó a mí
insert into core.amistades (usuario_menor, usuario_mayor) values
  (least(:'YO'::uuid, :'CATE'::uuid), greatest(:'YO'::uuid, :'CATE'::uuid)),
  (least(:'YO'::uuid, :'HUGO'::uuid), greatest(:'YO'::uuid, :'HUGO'::uuid)),
  (least(:'YO'::uuid, :'LIA'::uuid), greatest(:'YO'::uuid, :'LIA'::uuid));
insert into core.seguimientos (seguidor_id, seguido_id) values
  (:'YO', :'ELISA'),
  (:'YO', :'KAI'),       -- sigo a Kai, que oculta su vínculo con sus mascotas
  (:'JOSE', :'YO'),      -- José me sigue a mí: no me da relación con las mascotas de José
  (:'DANI', :'YO');
insert into core.bloqueos (bloqueador_id, bloqueado_id) values
  (:'YO', :'FABI'), (:'GUS', :'YO'), (:'YO', :'HUGO');

-- Familia y vínculos dentro de AuraLadra
insert into ladra.humanos_animal (animal_id, perfil_publico_id, rol) values
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'secundario');
-- (El vínculo «dueño principal» del creador con alias público lo crea la propia base al insertar
--  la mascota, como en la app: Leia con el mío, Mora con Elisa, Fantasma con Kai, Fantasma2 con Lía.)
select t.chk('la base crea sola el vínculo público de cada creador con alias (precondición de las pruebas)',
  (select count(*) = 4 from ladra.humanos_animal
    where rol = 'dueno_principal'
      and animal_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007',
                        'b0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000012')));
insert into ladra.vinculos_animal_humano (animal_id, perfil_publico_id, tipo, estado, creado_por) values
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'cuidador',    'confirmado', :'DANI'),
  ('b0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001', 'cuidador',    'pendiente',  :'DANI'),
  ('b0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000001', 'colaborador', 'confirmado', :'DANI');

-- ── Desde mi punto de vista (YO) ─────────────────────────────────────────────
select t.chk('Pelusa y Luna: mascotas de mi amiga Cate -> amistad',
  t.rel(:'YO') ~ 'Luna:amistad' and t.rel(:'YO') ~ 'Pelusa:amistad');
select t.chk('mis mascotas -> propia, incluso la que oculté de la red',
  t.rel(:'YO') ~ 'Leia:propia' and t.rel(:'YO') ~ 'Sol:propia');
select t.chk('la mascota que Cate oculta de la red NO se revela a su amigo', t.rel(:'YO') !~ 'Secreta');
select t.chk('la ficha de Cate aún no publicada NO se revela a su amigo', t.rel(:'YO') !~ 'Pendi');
select t.chk('a Elisa la sigo -> Mora: seguida', t.rel(:'YO') ~ 'Mora:seguida');
select t.chk('un desconocido (Dani) no aparece', t.rel(:'YO') !~ 'Rocky');
select t.chk('que José me siga a mí no me da relación con Pelón', t.rel(:'YO') !~ 'Pelón');
select t.chk('bloqueé a Fabi -> Zeus: bloqueada', t.rel(:'YO') ~ 'Zeus:bloqueada');
select t.chk('Gus me bloqueó -> Nube: bloqueada (también en sentido contrario)', t.rel(:'YO') ~ 'Nube:bloqueada');
select t.chk('amigo y bloqueado a la vez -> el bloqueo manda (Bruno)', t.rel(:'YO') ~ 'Bruno:bloqueada' and t.rel(:'YO') !~ 'Bruno:amistad');
select t.chk('dueño secundario de Tito -> vinculada', t.rel(:'YO') ~ 'Tito:vinculada');
select t.chk('cuidador confirmado de Kira -> vinculada', t.rel(:'YO') ~ 'Kira:vinculada');
select t.chk('cuidador solo pendiente (Toto) -> sin relación', t.rel(:'YO') !~ 'Toto');
select t.chk('colaborador (Rex) -> sin relación; no se trata como familia', t.rel(:'YO') !~ 'Rex');
select t.chk('resultado completo y exacto para mí',
  t.rel(:'YO') = 'Bruno:bloqueada, Fantasma2:amistad, Kira:vinculada, Leia:propia, Luna:amistad, Mora:seguida, Nube:bloqueada, Pelusa:amistad, Sol:propia, Tito:vinculada, Zeus:bloqueada');
select t.chk('sigo a Kai, que ocultó su vínculo: sus mascotas NO se revelan por seguirlo (Fantasma)', t.rel(:'YO') !~ 'Fantasma[^2]');
select t.chk('Lía oculta su vínculo pero es mi AMIGA (aceptó): sí veo sus mascotas (Fantasma2)', t.rel(:'YO') ~ 'Fantasma2:amistad');

-- ── Lo que otras personas NO deben saber ni obtener ─────────────────────────
select t.chk('Dani (desconocido de mi amistad con Cate) no ve a Pelusa ni a Luna', t.rel(:'DANI') !~ 'Pelusa|Luna');
select t.chk('Dani solo ve SU propia relación: sus mascotas, y lo que cuida quien él sigue (yo)',
  t.rel(:'DANI') = 'Kira:propia, Leia:seguida, Rex:propia, Rocky:propia, Tito:seguida, Toto:propia');
select t.chk('Dani sigue a Alejandro, quien figura públicamente como dueño de Tito -> Tito: seguida', t.rel(:'DANI') ~ 'Tito:seguida');
select t.chk('Dani me sigue: ve a Leia como seguida, pero Sol (oculta de la red) no se le revela', t.rel(:'DANI') !~ 'Sol');
select t.chk('Cate ve a sus amigos de vuelta: Leia es de un amigo',
  t.rel(:'CATE') ~ 'Leia:amistad' and t.rel(:'CATE') !~ 'Sol');
select t.chk('Cate no se entera de mi bloqueo a Fabi ni de mis seguidos', t.rel(:'CATE') !~ 'Zeus|Mora');
select t.chk('Fabi (el bloqueado) ve mi mascota como bloqueada y no como amistad ni seguida',
  t.rel(:'FABI') ~ 'Leia:bloqueada' and t.rel(:'FABI') !~ 'Leia:(amistad|seguida)');

-- ── Sin sesión y permisos ────────────────────────────────────────────────────
select t.chk('sin sesión no hay ninguna relación', t.rel(null) = '' and t.rel('') = '');
select t.chk('una sesión de persona inexistente tampoco recibe nada', t.rel('00000000-0000-0000-0000-0000000000ff') = '');
set role anon;
select t.falla('anon no puede ejecutarla', $q$select * from ladra.mi_relacion_con_animales()$q$, 'permission denied');
reset role;
set role authenticated;
select t.chk('una persona con sesión sí puede ejecutarla (no falla por permisos)',
  (select count(*) >= 0 from ladra.mi_relacion_con_animales()));
reset role;
select t.chk('la función no recibe parámetros (la identidad solo sale de la sesión)',
  (select pronargs = 0 from pg_proc where proname = 'mi_relacion_con_animales' and pronamespace = 'ladra'::regnamespace));
select t.chk('es SECURITY DEFINER con search_path fijo',
  (select prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=pg_catalog%')
     from pg_proc where proname = 'mi_relacion_con_animales' and pronamespace = 'ladra'::regnamespace));

-- Core no se modificó: sigue sin referenciar nada de ladra
select t.chk('Core no depende de ladra (ninguna función de core menciona ladra.)',
  not exists (select 1 from pg_proc p where p.pronamespace = 'core'::regnamespace and pg_get_functiondef(p.oid) ilike '%ladra.%'));

select case when ok then 'PASS' else 'FAIL' end as r, nombre from t.res where not ok;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;

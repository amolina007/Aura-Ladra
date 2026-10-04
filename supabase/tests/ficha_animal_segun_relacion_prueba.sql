-- Prueba de laboratorio de ladra.ficha_animal_segun_relacion(). Base Postgres DESECHABLE (nunca Supabase real).
-- Preparación: igual que supabase/tests/relacion_con_animales_prueba.sql (pasos 1 a 5) y después
--   6. 20261003220000_ficha_animal_segun_relacion.sql
-- Uso: psql -d <base> -f supabase/tests/ficha_animal_segun_relacion_prueba.sql
\set ON_ERROR_STOP on
create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t.res values (coalesce(cond, false), nombre); end $$;
-- La ficha tal como la ve la persona u ('' = sin sesión)
create function t.ficha(u text, a uuid) returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
  return ladra.ficha_animal_segun_relacion(a);
end $$;
-- Todas las claves de la lista están presentes / ausentes
create function t.tiene(f jsonb, claves text[]) returns boolean language sql immutable as
  $$ select f is not null and f ?& claves $$;
create function t.sin(f jsonb, claves text[]) returns boolean language sql immutable as
  $$ select f is not null and not (f ?| claves) $$;
grant execute on all functions in schema t to public;

\set YO   '00000000-0000-0000-0000-000000000001'
\set CATE '00000000-0000-0000-0000-000000000002'
\set DANI '00000000-0000-0000-0000-000000000003'
\set ELISA '00000000-0000-0000-0000-000000000004'
\set FABI '00000000-0000-0000-0000-000000000005'
\set HUGO '00000000-0000-0000-0000-000000000007'
\set INES '00000000-0000-0000-0000-000000000008'

insert into auth.users (id) values (:'YO'), (:'CATE'), (:'DANI'), (:'ELISA'), (:'FABI'), (:'HUGO'), (:'INES');
insert into core.perfiles (id, alias) values
  (:'YO', 'alejandro'), (:'CATE', 'cate'), (:'DANI', 'dani'), (:'ELISA', 'elisa'),
  (:'FABI', 'fabi'), (:'HUGO', 'hugo'), (:'INES', 'ines');
insert into ladra.perfiles_publicos (id, usuario_id, alias, estado) values
  ('a0000000-0000-0000-0000-000000000001', :'YO', 'Alejandro', 'publicado'),
  ('a0000000-0000-0000-0000-000000000002', :'CATE', 'Cate', 'publicado'),
  ('a0000000-0000-0000-0000-000000000003', :'DANI', 'Dani', 'publicado'),
  ('a0000000-0000-0000-0000-000000000004', :'ELISA', 'Elisa', 'publicado'),
  ('a0000000-0000-0000-0000-000000000005', :'FABI', 'Fabi', 'publicado'),
  ('a0000000-0000-0000-0000-000000000007', :'HUGO', 'Hugo', 'publicado'),
  ('a0000000-0000-0000-0000-000000000008', :'INES', 'Ines', 'publicado');

-- Cada mascota trae TODOS los datos sensibles llenos, para ver qué se filtra
create function t.mascota(id uuid, nombre text, creador uuid, estado text default 'publicado',
                          en_red boolean default true, extraviada boolean default false) returns void
language plpgsql as $$
begin
  insert into ladra.animales (id, slug, nombre, especie, biografia, estado, creado_por, mostrar_en_red, estado_seguridad,
    raza, tamano, peso_kg, fecha_nacimiento, sexo, color_pelaje, estado_registro, numero_registro,
    senas_particulares, habilidades, caracter_puntaje, caracter_respuestas, diagnostico_nutricional)
  values (id, lower(nombre), nombre, 'perro', 'Una presentación pública', estado, creador, en_red,
    case when extraviada then 'extraviada' else 'segura' end,
    'mestiza', 'mediano', 12.5, date '2020-05-17', 'hembra', 'café', 'registrada', 'CHIP-' || nombre,
    'mancha blanca en la pata', '["sentarse"]'::jsonb, 70,
    '{"personas":4,"animales":4,"manipulacion":4,"recursos":3,"entorno":3}'::jsonb, 'Peso normal');
  insert into ladra.fichas_salud_animal (animal_id, datos) values (id, jsonb_build_object('alergias', 'polen-' || nombre));
end $$;

select t.mascota('b0000000-0000-0000-0000-000000000001', 'Leia',    :'YO');
select t.mascota('b0000000-0000-0000-0000-000000000003', 'Pelusa',  :'CATE');
select t.mascota('b0000000-0000-0000-0000-000000000005', 'Secreta', :'CATE', en_red => false);
select t.mascota('b0000000-0000-0000-0000-00000000000f', 'Pendi',   :'CATE', estado => 'pendiente');
select t.mascota('b0000000-0000-0000-0000-000000000004', 'Luna',    :'CATE', extraviada => true);
select t.mascota('b0000000-0000-0000-0000-000000000006', 'Rocky',   :'DANI');
select t.mascota('b0000000-0000-0000-0000-000000000007', 'Mora',    :'ELISA');
select t.mascota('b0000000-0000-0000-0000-000000000008', 'Zeus',    :'FABI');
select t.mascota('b0000000-0000-0000-0000-00000000000a', 'Bruno',   :'HUGO');
select t.mascota('b0000000-0000-0000-0000-00000000000b', 'Tito',    :'INES');
select t.mascota('b0000000-0000-0000-0000-00000000000c', 'Kira',    :'DANI');
select t.mascota('b0000000-0000-0000-0000-00000000000d', 'Toto',    :'DANI');

-- Core: soy amigo de Cate y de Hugo; sigo a Elisa; bloqueé a Fabi y a Hugo
insert into core.amistades (usuario_menor, usuario_mayor) values
  (least(:'YO'::uuid, :'CATE'::uuid), greatest(:'YO'::uuid, :'CATE'::uuid)),
  (least(:'YO'::uuid, :'HUGO'::uuid), greatest(:'YO'::uuid, :'HUGO'::uuid));
insert into core.seguimientos (seguidor_id, seguido_id) values (:'YO', :'ELISA');
insert into core.bloqueos (bloqueador_id, bloqueado_id) values (:'YO', :'FABI'), (:'YO', :'HUGO');

-- Familia y vínculos
insert into ladra.humanos_animal (animal_id, perfil_publico_id, rol) values
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'secundario');   -- soy dueño secundario de Tito
insert into ladra.vinculos_animal_humano (animal_id, perfil_publico_id, tipo, estado, creado_por) values
  ('b0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'cuidador', 'confirmado', :'DANI'),  -- cuidador confirmado de Kira
  ('b0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001', 'cuidador', 'pendiente',  :'DANI');  -- cuidador solo pendiente de Toto

-- Claves por nivel
\set TODOS    '{id,slug,nombre,especie,biografia,foto_url,caracter_puntaje,estado_seguridad,nivel}'
\set RECONOCER '{raza,tamano,color_pelaje,sexo,senas_particulares}'
\set AMISTAD  '{fecha_nacimiento,peso_kg,diagnostico_nutricional,habilidades,salud}'
\set FAMILIA  '{numero_registro,estado_registro,caracter_respuestas,rol_familiar}'
\set PELUSA 'b0000000-0000-0000-0000-000000000003'

-- 1. Sin sesión y desconocido: solo lo básico y el temperamento
select t.chk('sin sesión: ve nombre, presentación y temperamento', t.tiene(t.ficha('', :'PELUSA'), :'TODOS'));
select t.chk('sin sesión: NO ve cumpleaños, peso, salud, habilidades ni nutrición', t.sin(t.ficha('', :'PELUSA'), :'AMISTAD'));
select t.chk('sin sesión: NO ve raza, tamaño, color, sexo ni señas (no está extraviada)', t.sin(t.ficha('', :'PELUSA'), :'RECONOCER'));
select t.chk('sin sesión: NO ve registro ni respuestas del carácter', t.sin(t.ficha('', :'PELUSA'), :'FAMILIA'));
select t.chk('sin sesión: el nivel es desconocido', t.ficha('', :'PELUSA') ->> 'nivel' = 'desconocido');
select t.chk('desconocido con sesión (Dani): igual que sin sesión', t.sin(t.ficha(:'DANI', :'PELUSA'), :'AMISTAD' ) and t.sin(t.ficha(:'DANI', :'PELUSA'), :'RECONOCER') and t.sin(t.ficha(:'DANI', :'PELUSA'), :'FAMILIA'));
select t.chk('el temperamento sí lo ve el desconocido', (t.ficha(:'DANI', :'PELUSA') ->> 'caracter_puntaje')::int = 70);

-- 2. Amistad: ve salud, cumpleaños, etc., pero no lo reservado a la familia
select t.chk('amistad (yo con Pelusa de Cate): ve cumpleaños, peso, salud, habilidades y nutrición', t.tiene(t.ficha(:'YO', :'PELUSA'), :'AMISTAD'));
select t.chk('amistad: ve raza, tamaño, color, sexo y señas', t.tiene(t.ficha(:'YO', :'PELUSA'), :'RECONOCER'));
select t.chk('amistad: NO ve n.º de registro ni respuestas del carácter', t.sin(t.ficha(:'YO', :'PELUSA'), :'FAMILIA'));
select t.chk('amistad: el nivel es amistad', t.ficha(:'YO', :'PELUSA') ->> 'nivel' = 'amistad');
select t.chk('amistad: la salud trae el contenido real', t.ficha(:'YO', :'PELUSA') #>> '{salud,alergias}' = 'polen-Pelusa');
select t.chk('amistad: el cumpleaños es el real', t.ficha(:'YO', :'PELUSA') ->> 'fecha_nacimiento' = '2020-05-17');

-- 3. Seguir y bloquear no dan acceso
select t.chk('seguir a Elisa NO da acceso a la salud de Mora', t.sin(t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000007'), :'AMISTAD'));
select t.chk('seguidora: el nivel es desconocido', t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000007') ->> 'nivel' = 'desconocido');
select t.chk('bloqueada (Fabi): trato de desconocida', t.sin(t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000008'), :'AMISTAD'));
select t.chk('amigo Y bloqueado (Hugo): gana el bloqueo, trato de desconocido', t.sin(t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000a'), :'AMISTAD'));
select t.chk('el bloqueo no oculta la mascota (solo recorta datos)', t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000008') is not null);

-- 4. Familia y vínculos
select t.chk('mi mascota (Leia): veo todo, incluido el registro', t.tiene(t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000001'), :'AMISTAD') and t.tiene(t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000001'), :'FAMILIA'));
select t.chk('mi mascota: rol dueno_principal', t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000001') ->> 'rol_familiar' = 'dueno_principal');
select t.chk('dueño secundario (Tito): veo todo y mi rol es secundario', t.tiene(t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000b'), :'FAMILIA') and t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000b') ->> 'rol_familiar' = 'secundario');
select t.chk('cuidador confirmado (Kira): nivel amistad, ve salud pero NO el registro', t.tiene(t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000c'), :'AMISTAD') and t.sin(t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000c'), :'FAMILIA'));
select t.chk('cuidador solo pendiente (Toto): trato de desconocido', t.sin(t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000d'), :'AMISTAD'));

-- 5. Mascota extraviada: más datos para reconocerla, nunca salud
select t.chk('extraviada (Luna), sin sesión: ve raza, tamaño, color, sexo y señas', t.tiene(t.ficha('', 'b0000000-0000-0000-0000-000000000004'), :'RECONOCER'));
select t.chk('extraviada, sin sesión: NO ve cumpleaños, peso, salud ni registro', t.sin(t.ficha('', 'b0000000-0000-0000-0000-000000000004'), :'AMISTAD') and t.sin(t.ficha('', 'b0000000-0000-0000-0000-000000000004'), :'FAMILIA'));
select t.chk('extraviada, desconocido (Dani): igual', t.tiene(t.ficha(:'DANI', 'b0000000-0000-0000-0000-000000000004'), :'RECONOCER') and t.sin(t.ficha(:'DANI', 'b0000000-0000-0000-0000-000000000004'), :'AMISTAD'));
select t.chk('extraviada: se marca como extraviada', (t.ficha('', 'b0000000-0000-0000-0000-000000000004') ->> 'extraviada')::boolean);

-- 6. Visibilidad
select t.chk('oculta de la red (Secreta): un amigo no la ve', t.ficha(:'YO', 'b0000000-0000-0000-0000-000000000005') is null);
select t.chk('oculta de la red: sin sesión tampoco', t.ficha('', 'b0000000-0000-0000-0000-000000000005') is null);
select t.chk('oculta de la red: su dueña (Cate) sí', t.ficha(:'CATE', 'b0000000-0000-0000-0000-000000000005') ->> 'nivel' = 'familia');
select t.chk('ficha pendiente de publicar (Pendi): otros no la ven', t.ficha(:'YO', 'b0000000-0000-0000-0000-00000000000f') is null and t.ficha('', 'b0000000-0000-0000-0000-00000000000f') is null);
select t.chk('ficha pendiente: su dueña sí', t.ficha(:'CATE', 'b0000000-0000-0000-0000-00000000000f') is not null);
select t.chk('mascota inexistente: devuelve null sin error', t.ficha(:'YO', '00000000-0000-0000-0000-00000000dead') is null);

-- 7. Permisos
select t.chk('sin sesión (rol anon) puede llamar a la función', has_function_privilege('anon', 'ladra.ficha_animal_segun_relacion(uuid)', 'execute'));
select t.chk('rol anon NO puede llamar directamente a mi_relacion_con_animales', not has_function_privilege('anon', 'ladra.mi_relacion_con_animales()', 'execute'));

select case when ok then 'ok  ' else 'FALLA' end as resultado, nombre from t.res order by ok, nombre;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;

-- Mi árbol de vínculos. Solo schema ladra.
-- PREPARADA PARA REVISIÓN: no se ha ejecutado en producción.
--
-- Principio: las relaciones que ya existen siguen siendo la fuente de verdad
-- (humanos_animal, vinculos_animal_humano, vinculos_animales). Así la ficha animal
-- y «Mi árbol» consultan y editan las MISMAS filas. Aquí solo se agrega lo que faltaba:
--   * vinculos_personas        persona ↔ persona (con aceptación de la contraparte)
--   * arbol_vinculos_privados  integrantes sin cuenta y anotaciones privadas
--   * momentos / participantes registros compartidos (paseos, recuerdos…)
--   * arbol_ramas_ocultas      elección de ocultar la rama de memoria de un animal
-- Todo es privado por defecto. Nada de salud, ubicación exacta ni fotos privadas entra aquí.
-- El navegador no escribe tablas directamente: todo pasa por funciones que validan permisos.

-- ---------------------------------------------------------------------------
-- 1) Extender los vínculos persona ↔ animal existentes
-- ---------------------------------------------------------------------------
alter table ladra.vinculos_animal_humano
  drop constraint if exists vinculos_animal_humano_tipo_check;
alter table ladra.vinculos_animal_humano
  add constraint vinculos_animal_humano_tipo_check
  check (tipo in ('responsable', 'cuidador', 'rescatista', 'colaborador',
                  'familia', 'amistad', 'companero_paseo', 'otro'));
alter table ladra.vinculos_animal_humano
  add column if not exists descripcion text
  check (descripcion is null or char_length(btrim(descripcion)) <= 240);

-- ---------------------------------------------------------------------------
-- 2) Persona ↔ persona
-- ---------------------------------------------------------------------------
create table if not exists ladra.vinculos_personas (
  id uuid primary key default gen_random_uuid(),
  perfil_a_id uuid not null references ladra.perfiles_publicos(id) on delete cascade, -- quien propone
  perfil_b_id uuid not null references ladra.perfiles_publicos(id) on delete cascade, -- quien acepta
  tipo text not null check (tipo in ('familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro')),
  descripcion text check (descripcion is null or char_length(btrim(descripcion)) <= 240),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado', 'revocado')),
  creado_por uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (perfil_a_id <> perfil_b_id)
);
create unique index if not exists vinculos_personas_par_unico
  on ladra.vinculos_personas (least(perfil_a_id, perfil_b_id), greatest(perfil_a_id, perfil_b_id), tipo)
  where estado in ('pendiente', 'confirmado');
create index if not exists vinculos_personas_b_idx on ladra.vinculos_personas (perfil_b_id, estado);

-- ---------------------------------------------------------------------------
-- 3) Integrantes privados y anotaciones personales (nunca recíprocas)
-- ---------------------------------------------------------------------------
create table if not exists ladra.arbol_vinculos_privados (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references auth.users(id) on delete cascade,
  clase text check (clase in ('persona', 'animal')),               -- solo para integrantes con nombre propio
  nombre text check (nombre is null or char_length(btrim(nombre)) between 1 and 60),
  animal_id uuid references ladra.animales(id) on delete cascade,  -- anotación sobre un animal de la red
  perfil_publico_id uuid references ladra.perfiles_publicos(id) on delete cascade, -- anotación sobre una persona
  tipo text not null check (tipo in ('familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro')),
  descripcion text check (descripcion is null or char_length(btrim(descripcion)) <= 240),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint arbol_privado_un_destino check (
    num_nonnulls(animal_id, perfil_publico_id) <= 1
    and ((animal_id is null and perfil_publico_id is null) = (nombre is not null))
    and ((nombre is not null) = (clase is not null))
  )
);
create unique index if not exists arbol_privado_animal_unico
  on ladra.arbol_vinculos_privados (propietario_id, animal_id, tipo) where animal_id is not null;
create unique index if not exists arbol_privado_perfil_unico
  on ladra.arbol_vinculos_privados (propietario_id, perfil_publico_id, tipo) where perfil_publico_id is not null;
create index if not exists arbol_privado_prop_idx on ladra.arbol_vinculos_privados (propietario_id);

-- ---------------------------------------------------------------------------
-- 4) Momentos y participantes
-- ---------------------------------------------------------------------------
create table if not exists ladra.momentos (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('paseo', 'juego', 'cuidado', 'encuentro', 'adopcion', 'recuerdo')),
  fecha date not null,
  texto text check (texto is null or char_length(btrim(texto)) <= 600),
  foto_path text, -- reservado: la subida de fotos aún no está implementada
  visibilidad text not null default 'privado' check (visibilidad in ('privado', 'compartido')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists momentos_autor_idx on ladra.momentos (autor_id, fecha desc);

create table if not exists ladra.momentos_participantes (
  id uuid primary key default gen_random_uuid(),
  momento_id uuid not null references ladra.momentos(id) on delete cascade,
  animal_id uuid references ladra.animales(id) on delete cascade,
  perfil_publico_id uuid references ladra.perfiles_publicos(id) on delete cascade,
  vinculo_privado_id uuid references ladra.arbol_vinculos_privados(id) on delete cascade,
  estado text not null default 'confirmado' check (estado in ('confirmado', 'pendiente', 'rechazado')),
  creado_en timestamptz not null default now(),
  check (num_nonnulls(animal_id, perfil_publico_id, vinculo_privado_id) = 1)
);
create unique index if not exists momentos_part_animal_unico
  on ladra.momentos_participantes (momento_id, animal_id) where animal_id is not null;
create unique index if not exists momentos_part_perfil_unico
  on ladra.momentos_participantes (momento_id, perfil_publico_id) where perfil_publico_id is not null;
create unique index if not exists momentos_part_privado_unico
  on ladra.momentos_participantes (momento_id, vinculo_privado_id) where vinculo_privado_id is not null;
create index if not exists momentos_part_animal_idx on ladra.momentos_participantes (animal_id, estado);
create index if not exists momentos_part_perfil_idx on ladra.momentos_participantes (perfil_publico_id, estado);

-- ---------------------------------------------------------------------------
-- 5) Rama de memoria: el usuario decide si la conserva
-- ---------------------------------------------------------------------------
create table if not exists ladra.arbol_ramas_ocultas (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, animal_id)
);

-- ---------------------------------------------------------------------------
-- 6) Ayudantes de permisos
-- ---------------------------------------------------------------------------
create or replace function ladra.mi_perfil_publico_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select p.id from ladra.perfiles_publicos p
   where p.usuario_id = (select auth.uid()) and p.estado = 'publicado'
   limit 1;
$$;

-- Id del perfil de la persona con sesión (cualquier estado). Lo usan las políticas de lectura.
create or replace function ladra.mi_perfil_id_cualquiera()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select p.id from ladra.perfiles_publicos p where p.usuario_id = (select auth.uid()) limit 1;
$$;

-- Un momento lo ve su autor, o quien participa de él (persona o familia del animal)
-- SOLO si el autor lo marcó como compartido y la participación fue confirmada.
create or replace function ladra.puede_ver_momento(p_momento_id uuid, p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select p_usuario is not null and exists (
    select 1 from ladra.momentos m
     where m.id = p_momento_id
       and (
         m.autor_id = p_usuario
         or (
           m.visibilidad = 'compartido'
           and exists (
             select 1 from ladra.momentos_participantes pp
              where pp.momento_id = m.id and pp.estado = 'confirmado'
                and (
                  (pp.perfil_publico_id is not null and exists (
                     select 1 from ladra.perfiles_publicos pf
                      where pf.id = pp.perfil_publico_id and pf.usuario_id = p_usuario))
                  or (pp.animal_id is not null and ladra.es_familia_de_animal(pp.animal_id, p_usuario))
                )
           )
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 7) Seguridad por filas. Lectura solo de lo propio / lo autorizado; escritura solo por funciones.
-- ---------------------------------------------------------------------------
alter table ladra.vinculos_personas enable row level security;
alter table ladra.vinculos_personas force row level security;
alter table ladra.arbol_vinculos_privados enable row level security;
alter table ladra.arbol_vinculos_privados force row level security;
alter table ladra.momentos enable row level security;
alter table ladra.momentos force row level security;
alter table ladra.momentos_participantes enable row level security;
alter table ladra.momentos_participantes force row level security;
alter table ladra.arbol_ramas_ocultas enable row level security;
alter table ladra.arbol_ramas_ocultas force row level security;

drop policy if exists vinculos_personas_lectura_participantes on ladra.vinculos_personas;
create policy vinculos_personas_lectura_participantes
  on ladra.vinculos_personas for select to authenticated
  using ((select ladra.mi_perfil_id_cualquiera()) in (perfil_a_id, perfil_b_id));

drop policy if exists arbol_privado_solo_propietario on ladra.arbol_vinculos_privados;
create policy arbol_privado_solo_propietario
  on ladra.arbol_vinculos_privados for select to authenticated
  using (propietario_id = (select auth.uid()));

drop policy if exists momentos_lectura_autorizada on ladra.momentos;
create policy momentos_lectura_autorizada
  on ladra.momentos for select to authenticated
  using (ladra.puede_ver_momento(id, (select auth.uid())));

drop policy if exists momentos_part_lectura_autorizada on ladra.momentos_participantes;
create policy momentos_part_lectura_autorizada
  on ladra.momentos_participantes for select to authenticated
  using (
    ladra.puede_ver_momento(momento_id, (select auth.uid()))
    and (
      vinculo_privado_id is null
      or exists (select 1 from ladra.momentos m where m.id = momento_id and m.autor_id = (select auth.uid()))
    )
  );

drop policy if exists arbol_ramas_ocultas_propias on ladra.arbol_ramas_ocultas;
create policy arbol_ramas_ocultas_propias
  on ladra.arbol_ramas_ocultas for select to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on ladra.vinculos_personas, ladra.arbol_vinculos_privados, ladra.momentos,
  ladra.momentos_participantes, ladra.arbol_ramas_ocultas from public, anon, authenticated;
grant select on ladra.vinculos_personas, ladra.arbol_vinculos_privados, ladra.momentos,
  ladra.momentos_participantes, ladra.arbol_ramas_ocultas to authenticated;
grant all on ladra.vinculos_personas, ladra.arbol_vinculos_privados, ladra.momentos,
  ladra.momentos_participantes, ladra.arbol_ramas_ocultas to service_role;

-- ---------------------------------------------------------------------------
-- 8) Funciones: vínculos
-- ---------------------------------------------------------------------------
create or replace function ladra.arbol_vincular_animal(
  p_animal_id uuid, p_tipo text, p_descripcion text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil uuid;
  v_animal ladra.animales%rowtype;
  v_estado text;
  v_desc text := nullif(btrim(p_descripcion), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  v_perfil := ladra.mi_perfil_publico_id();
  if v_perfil is null then
    raise exception using errcode = '22023', message = 'Primero crea tu alias público.';
  end if;
  if p_tipo not in ('cuidador', 'rescatista', 'colaborador', 'familia', 'amistad', 'companero_paseo', 'otro') then
    raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
  end if;
  if v_desc is not null and char_length(v_desc) > 240 then
    raise exception using errcode = '22023', message = 'La descripción admite hasta 240 caracteres.';
  end if;
  select * into v_animal from ladra.animales where id = p_animal_id and estado = 'publicado';
  if not found then
    raise exception using errcode = '22023', message = 'Animal no disponible.';
  end if;
  if ladra.es_familia_de_animal(p_animal_id, v_uid) then
    raise exception using errcode = '22023', message = 'Ya es parte de tu familia; su ficha gestiona esa relación.';
  end if;

  -- Un animal comunitario sin responsable no tiene a quién pedir aceptación.
  v_estado := case when v_animal.es_comunitario or v_animal.creado_por is null then 'confirmado' else 'pendiente' end;

  begin
    insert into ladra.vinculos_animal_humano (
      animal_id, perfil_publico_id, tipo, visible_publicamente, estado, creado_por, descripcion
    ) values (p_animal_id, v_perfil, p_tipo, false, v_estado, v_uid, v_desc);
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Ese vínculo ya existe o está pendiente.';
  end;
  return v_estado;
end;
$$;

create or replace function ladra.arbol_vincular_persona(
  p_perfil_id uuid, p_tipo text, p_descripcion text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil uuid;
  v_desc text := nullif(btrim(p_descripcion), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  v_perfil := ladra.mi_perfil_publico_id();
  if v_perfil is null then
    raise exception using errcode = '22023', message = 'Primero crea tu alias público.';
  end if;
  if p_tipo not in ('familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro') then
    raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
  end if;
  if v_desc is not null and char_length(v_desc) > 240 then
    raise exception using errcode = '22023', message = 'La descripción admite hasta 240 caracteres.';
  end if;
  if p_perfil_id = v_perfil then
    raise exception using errcode = '22023', message = 'No puedes vincularte contigo misma o mismo.';
  end if;
  if not exists (select 1 from ladra.perfiles_publicos p
                  where p.id = p_perfil_id and p.estado = 'publicado' and p.visibilidad <> 'oculto') then
    raise exception using errcode = '22023', message = 'Persona no disponible.';
  end if;
  begin
    insert into ladra.vinculos_personas (perfil_a_id, perfil_b_id, tipo, descripcion, creado_por)
    values (v_perfil, p_perfil_id, p_tipo, v_desc, v_uid);
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Ese vínculo ya existe o está pendiente.';
  end;
  return 'pendiente';
end;
$$;

create or replace function ladra.arbol_responder_vinculo_persona(p_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_decision not in ('confirmado', 'rechazado') then
    raise exception using errcode = '22023', message = 'Decisión inválida.';
  end if;
  update ladra.vinculos_personas v
     set estado = p_decision, actualizado_en = now()
   where v.id = p_id and v.estado = 'pendiente'
     and exists (select 1 from ladra.perfiles_publicos p
                  where p.id = v.perfil_b_id and p.usuario_id = auth.uid());
  if not found then
    raise exception using errcode = '42501', message = 'No puedes responder esta solicitud.';
  end if;
end;
$$;

-- Integrante sin cuenta (p_nombre + p_clase) o anotación privada sobre un animal / persona de la red.
create or replace function ladra.arbol_agregar_privado(
  p_tipo text,
  p_descripcion text default null,
  p_nombre text default null,
  p_clase text default null,
  p_animal_id uuid default null,
  p_perfil_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_nombre text := nullif(btrim(p_nombre), '');
  v_desc text := nullif(btrim(p_descripcion), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_tipo not in ('familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro') then
    raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
  end if;
  if v_desc is not null and char_length(v_desc) > 240 then
    raise exception using errcode = '22023', message = 'La descripción admite hasta 240 caracteres.';
  end if;
  if v_nombre is not null then
    if p_clase is null or p_clase not in ('persona', 'animal') or p_animal_id is not null or p_perfil_id is not null then
      raise exception using errcode = '22023', message = 'Indica si es persona o animal, sin otro destino.';
    end if;
    if char_length(v_nombre) > 60 then
      raise exception using errcode = '22023', message = 'El nombre admite hasta 60 caracteres.';
    end if;
  elsif p_animal_id is not null and p_perfil_id is null then
    if not exists (select 1 from ladra.animales a where a.id = p_animal_id and a.estado = 'publicado') then
      raise exception using errcode = '22023', message = 'Animal no disponible.';
    end if;
  elsif p_perfil_id is not null and p_animal_id is null then
    if not exists (select 1 from ladra.perfiles_publicos p
                    where p.id = p_perfil_id and p.estado = 'publicado' and p.visibilidad <> 'oculto') then
      raise exception using errcode = '22023', message = 'Persona no disponible.';
    end if;
  else
    raise exception using errcode = '22023', message = 'Indica un nombre, un animal o una persona.';
  end if;

  begin
    insert into ladra.arbol_vinculos_privados (propietario_id, clase, nombre, animal_id, perfil_publico_id, tipo, descripcion)
    values (v_uid, case when v_nombre is null then null else p_clase end, v_nombre, p_animal_id, p_perfil_id, p_tipo, v_desc)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Ya tienes esa anotación.';
  end;
  return v_id;
end;
$$;

-- Editar. En vínculos compartidos solo cambia la descripción (y la visibilidad pública, si aplica):
-- el tipo no se cambia a espaldas de la otra parte; para cambiarlo se retira y se crea de nuevo.
create or replace function ladra.arbol_editar_vinculo(
  p_origen text, p_id uuid, p_tipo text default null, p_descripcion text default null, p_publico boolean default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_desc text := nullif(btrim(p_descripcion), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if v_desc is not null and char_length(v_desc) > 240 then
    raise exception using errcode = '22023', message = 'La descripción admite hasta 240 caracteres.';
  end if;
  if p_origen = 'privado' then
    if p_tipo is not null and p_tipo not in ('familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro') then
      raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
    end if;
    update ladra.arbol_vinculos_privados
       set tipo = coalesce(p_tipo, tipo), descripcion = v_desc, actualizado_en = now()
     where id = p_id and propietario_id = v_uid;
  elsif p_origen = 'animal_humano' then
    update ladra.vinculos_animal_humano v
       set descripcion = v_desc,
           visible_publicamente = coalesce(p_publico, v.visible_publicamente),
           actualizado_en = now()
     where v.id = p_id and v.creado_por = v_uid and v.estado in ('pendiente', 'confirmado');
  elsif p_origen = 'personas' then
    update ladra.vinculos_personas v
       set descripcion = v_desc, actualizado_en = now()
     where v.id = p_id and v.creado_por = v_uid and v.estado in ('pendiente', 'confirmado');
  else
    raise exception using errcode = '22023', message = 'Origen de vínculo inválido.';
  end if;
  if not found then
    raise exception using errcode = '42501', message = 'No puedes editar este vínculo.';
  end if;
end;
$$;

-- Retirar: cualquiera de las partes puede retirar un vínculo compartido (queda 'revocado', no se borra
-- el historial); una anotación privada se elimina.
create or replace function ladra.arbol_retirar_vinculo(p_origen text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_origen = 'privado' then
    delete from ladra.arbol_vinculos_privados where id = p_id and propietario_id = v_uid;
  elsif p_origen = 'animal_humano' then
    update ladra.vinculos_animal_humano v set estado = 'revocado', actualizado_en = now()
     where v.id = p_id and v.estado in ('pendiente', 'confirmado')
       and (v.creado_por = v_uid
            or exists (select 1 from ladra.perfiles_publicos p where p.id = v.perfil_publico_id and p.usuario_id = v_uid)
            or ladra.es_dueno_principal_de_animal(v.animal_id, v_uid));
  elsif p_origen = 'animales' then
    update ladra.vinculos_animales v set estado = 'revocado', actualizado_en = now()
     where v.id = p_id and v.estado in ('pendiente', 'confirmado')
       and (ladra.es_dueno_principal_de_animal(v.animal_a_id, v_uid)
            or ladra.es_dueno_principal_de_animal(v.animal_b_id, v_uid));
  elsif p_origen = 'personas' then
    update ladra.vinculos_personas v set estado = 'revocado', actualizado_en = now()
     where v.id = p_id and v.estado in ('pendiente', 'confirmado')
       and exists (select 1 from ladra.perfiles_publicos p
                    where p.id in (v.perfil_a_id, v.perfil_b_id) and p.usuario_id = v_uid);
  else
    raise exception using errcode = '22023', message = 'Origen de vínculo inválido.';
  end if;
  if not found then
    raise exception using errcode = '42501', message = 'No puedes retirar este vínculo.';
  end if;
end;
$$;

create or replace function ladra.arbol_buscar_personas(p_texto text)
returns table (perfil_id uuid, alias text)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_q text := btrim(coalesce(p_texto, ''));
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if char_length(v_q) < 3 then
    return;
  end if;
  return query
  select p.id, p.alias
    from ladra.perfiles_publicos p
   where p.estado = 'publicado' and p.visibilidad <> 'oculto'
     and p.usuario_id <> auth.uid()
     and p.alias ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by p.alias
   limit 8;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Funciones: momentos
-- ---------------------------------------------------------------------------
-- p_participantes: [{"t":"animal"|"perfil"|"privado","id":"<uuid>"}]
create or replace function ladra.arbol_registrar_momento(
  p_tipo text, p_fecha date, p_texto text, p_visibilidad text, p_participantes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_mi_perfil uuid := ladra.mi_perfil_publico_id();
  v_id uuid;
  v_item jsonb;
  v_t text;
  v_ref uuid;
  v_estado text;
  v_hay_ajenos boolean := false;
  v_texto text := nullif(btrim(p_texto), '');
  v_animal ladra.animales%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_tipo not in ('paseo', 'juego', 'cuidado', 'encuentro', 'adopcion', 'recuerdo') then
    raise exception using errcode = '22023', message = 'Tipo de momento inválido.';
  end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < date '1990-01-01' then
    raise exception using errcode = '22023', message = 'La fecha no es válida.';
  end if;
  if v_texto is not null and char_length(v_texto) > 600 then
    raise exception using errcode = '22023', message = 'El texto admite hasta 600 caracteres.';
  end if;
  if p_visibilidad not in ('privado', 'compartido') then
    raise exception using errcode = '22023', message = 'Visibilidad inválida.';
  end if;
  if p_participantes is null or jsonb_typeof(p_participantes) <> 'array'
     or jsonb_array_length(p_participantes) not between 1 and 12 then
    raise exception using errcode = '22023', message = 'Elige entre 1 y 12 participantes.';
  end if;

  insert into ladra.momentos (autor_id, tipo, fecha, texto, visibilidad)
  values (v_uid, p_tipo, p_fecha, v_texto, p_visibilidad)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_participantes) loop
    v_t := v_item->>'t';
    begin
      v_ref := (v_item->>'id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Participante inválido.';
    end;

    if v_t = 'animal' then
      select * into v_animal from ladra.animales a
       where a.id = v_ref and (a.estado = 'publicado' or ladra.es_familia_de_animal(a.id, v_uid));
      if not found then
        raise exception using errcode = '22023', message = 'Animal no disponible.';
      end if;
      if ladra.es_familia_de_animal(v_ref, v_uid) or v_animal.es_comunitario or v_animal.creado_por is null then
        v_estado := 'confirmado';
      else
        v_estado := 'pendiente';
        v_hay_ajenos := true;
      end if;
      insert into ladra.momentos_participantes (momento_id, animal_id, estado) values (v_id, v_ref, v_estado);
    elsif v_t = 'perfil' then
      if v_ref = v_mi_perfil then
        raise exception using errcode = '22023', message = 'Tú participas por ser quien lo registra.';
      end if;
      if not exists (select 1 from ladra.perfiles_publicos p
                      where p.id = v_ref and p.estado = 'publicado' and p.visibilidad <> 'oculto') then
        raise exception using errcode = '22023', message = 'Persona no disponible.';
      end if;
      v_hay_ajenos := true;
      insert into ladra.momentos_participantes (momento_id, perfil_publico_id, estado) values (v_id, v_ref, 'pendiente');
    elsif v_t = 'privado' then
      if not exists (select 1 from ladra.arbol_vinculos_privados x where x.id = v_ref and x.propietario_id = v_uid) then
        raise exception using errcode = '22023', message = 'Integrante privado no disponible.';
      end if;
      insert into ladra.momentos_participantes (momento_id, vinculo_privado_id, estado) values (v_id, v_ref, 'confirmado');
    else
      raise exception using errcode = '22023', message = 'Tipo de participante inválido.';
    end if;
  end loop;

  if v_hay_ajenos and p_visibilidad <> 'compartido' then
    raise exception using errcode = '22023',
      message = 'Para incluir a otras personas o a animales de otros hogares, el momento debe compartirse con ellas.';
  end if;
  return v_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'Un participante está repetido.';
end;
$$;

create or replace function ladra.arbol_editar_momento(
  p_id uuid, p_tipo text, p_fecha date, p_texto text, p_visibilidad text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_texto text := nullif(btrim(p_texto), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_tipo not in ('paseo', 'juego', 'cuidado', 'encuentro', 'adopcion', 'recuerdo')
     or p_visibilidad not in ('privado', 'compartido') then
    raise exception using errcode = '22023', message = 'Datos inválidos.';
  end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < date '1990-01-01' then
    raise exception using errcode = '22023', message = 'La fecha no es válida.';
  end if;
  if v_texto is not null and char_length(v_texto) > 600 then
    raise exception using errcode = '22023', message = 'El texto admite hasta 600 caracteres.';
  end if;
  if p_visibilidad = 'privado' and exists (
       select 1 from ladra.momentos_participantes pp
        where pp.momento_id = p_id and pp.vinculo_privado_id is null and pp.estado <> 'rechazado'
          and (pp.perfil_publico_id is not null
               or not exists (select 1 from ladra.animales a where a.id = pp.animal_id and ladra.es_familia_de_animal(a.id, v_uid)))) then
    raise exception using errcode = '22023',
      message = 'Hay participantes de otros hogares: elimina el momento y vuelve a registrarlo si quieres hacerlo privado.';
  end if;
  update ladra.momentos
     set tipo = p_tipo, fecha = p_fecha, texto = v_texto, visibilidad = p_visibilidad, actualizado_en = now()
   where id = p_id and autor_id = v_uid;
  if not found then
    raise exception using errcode = '42501', message = 'No puedes editar este momento.';
  end if;
end;
$$;

create or replace function ladra.arbol_eliminar_momento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  delete from ladra.momentos where id = p_id and autor_id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = 'No puedes eliminar este momento.';
  end if;
end;
$$;

create or replace function ladra.arbol_responder_participacion(p_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if p_decision not in ('confirmado', 'rechazado') then
    raise exception using errcode = '22023', message = 'Decisión inválida.';
  end if;
  update ladra.momentos_participantes pp set estado = p_decision
   where pp.id = p_id and pp.estado = 'pendiente'
     and (
       (pp.perfil_publico_id is not null and exists (
          select 1 from ladra.perfiles_publicos pf where pf.id = pp.perfil_publico_id and pf.usuario_id = auth.uid()))
       or (pp.animal_id is not null and ladra.es_familia_de_animal(pp.animal_id, auth.uid()))
     );
  if not found then
    raise exception using errcode = '42501', message = 'No puedes responder esta invitación.';
  end if;
end;
$$;

-- Rama de memoria: solo animales con ficha conmemorativa; el usuario elige conservarla u ocultarla.
create or replace function ladra.arbol_alternar_rama_memoria(p_animal_id uuid, p_ocultar boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if not exists (select 1 from ladra.animales a where a.id = p_animal_id and a.es_conmemorativa) then
    raise exception using errcode = '22023', message = 'Solo las fichas conmemorativas tienen rama de memoria.';
  end if;
  if p_ocultar then
    insert into ladra.arbol_ramas_ocultas (usuario_id, animal_id) values (auth.uid(), p_animal_id)
    on conflict do nothing;
  else
    delete from ladra.arbol_ramas_ocultas where usuario_id = auth.uid() and animal_id = p_animal_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Lectura única del árbol (misma información que usan la ficha y la lista alternativa)
-- ---------------------------------------------------------------------------
-- Relaciones de UNA persona (interna: el navegador no puede llamarla con otro usuario).
create or replace function ladra.arbol_relaciones(p_uid uuid)
returns table (
  clave text, clase text, ref_id uuid, nombre text, especie text, foto_url text,
  propio boolean, memoria boolean, comunitario boolean,
  origen text, rel_id uuid, tipo text, descripcion text, estado text,
  editable boolean, retirable boolean, publico boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_perfil uuid;
begin
  select pp.id into v_perfil from ladra.perfiles_publicos pp where pp.usuario_id = p_uid limit 1;

  return query
  -- A) Mis mascotas (familia): humanos_animal, o quien creó la ficha
  select 'animal:' || a.id, 'animal'::text, a.id, a.nombre, a.especie, a.foto_url, true, a.es_conmemorativa, a.es_comunitario,
         'familia'::text, h.id,
         case coalesce(h.rol, 'dueno_principal') when 'dueno_principal' then 'tutor' else 'familia' end,
         null::text, 'confirmado'::text, false, false, null::boolean
    from ladra.animales a
    left join ladra.humanos_animal h on h.animal_id = a.id and h.perfil_publico_id = v_perfil
   where a.estado in ('publicado', 'pendiente')
     and (h.id is not null or (a.creado_por = p_uid and not exists (
            select 1 from ladra.humanos_animal x where x.animal_id = a.id and x.rol = 'dueno_principal')))
  union all
  -- B) Animales de otros con los que me vinculé (persona ↔ animal)
  select 'animal:' || a.id, 'animal'::text, a.id, a.nombre, a.especie, a.foto_url, false, a.es_conmemorativa, a.es_comunitario,
         'animal_humano'::text, v.id, v.tipo, v.descripcion, v.estado, (v.creado_por = p_uid), true, v.visible_publicamente
    from ladra.vinculos_animal_humano v
    join ladra.animales a on a.id = v.animal_id and a.estado = 'publicado'
   where v.perfil_publico_id = v_perfil and v.estado in ('confirmado', 'pendiente')
  union all
  -- C) Personas vinculadas (confirmadas, o pendientes que yo propuse)
  select 'perfil:' || o.id, 'persona'::text, o.id, o.alias, null::text, null::text, false, false, false,
         'personas'::text, v.id, v.tipo, v.descripcion, v.estado, (v.creado_por = p_uid), true, null::boolean
    from ladra.vinculos_personas v
    join ladra.perfiles_publicos o
      on o.id = case when v.perfil_a_id = v_perfil then v.perfil_b_id else v.perfil_a_id end
   where v_perfil in (v.perfil_a_id, v.perfil_b_id)
     and (v.estado = 'confirmado' or (v.estado = 'pendiente' and v.creado_por = p_uid))
  union all
  -- D) Integrantes privados y anotaciones (solo su propietario las ve)
  select case when x.animal_id is not null then 'animal:' || x.animal_id
              when x.perfil_publico_id is not null then 'perfil:' || x.perfil_publico_id
              else 'privado:' || x.id end,
         case when x.animal_id is not null then 'animal'
              when x.perfil_publico_id is not null then 'persona' else x.clase end,
         coalesce(x.animal_id, x.perfil_publico_id, x.id),
         coalesce(x.nombre, an.nombre, pf.alias),
         an.especie, an.foto_url, false, coalesce(an.es_conmemorativa, false), coalesce(an.es_comunitario, false),
         'privado'::text, x.id, x.tipo, x.descripcion, 'privado'::text, true, true, false
    from ladra.arbol_vinculos_privados x
    left join ladra.animales an on an.id = x.animal_id
    left join ladra.perfiles_publicos pf on pf.id = x.perfil_publico_id
   where x.propietario_id = p_uid
  union all
  -- E) Familia de mis mascotas (otras personas), respetando visibilidad "oculto"
  select 'perfil:' || o.id, 'persona'::text, o.id, o.alias, null::text, null::text, false, false, false,
         'familia'::text, h2.id, 'familia'::text, 'Familia de ' || a.nombre, 'confirmado'::text, false, false, null::boolean
    from ladra.humanos_animal h
    join ladra.animales a on a.id = h.animal_id
    join ladra.humanos_animal h2 on h2.animal_id = h.animal_id and h2.perfil_publico_id <> h.perfil_publico_id
    join ladra.perfiles_publicos o on o.id = h2.perfil_publico_id and o.estado = 'publicado' and o.visibilidad <> 'oculto'
   where h.perfil_publico_id = v_perfil
  union all
  -- F) Animales conectados a mis mascotas (animal ↔ animal confirmado)
  select 'animal:' || b.id, 'animal'::text, b.id, b.nombre, b.especie, b.foto_url, false, b.es_conmemorativa, b.es_comunitario,
         'animales'::text, v.id, v.tipo, v.descripcion, 'confirmado'::text, false,
         (ladra.es_dueno_principal_de_animal(v.animal_a_id, p_uid) or ladra.es_dueno_principal_de_animal(v.animal_b_id, p_uid)),
         null::boolean
    from ladra.vinculos_animales v
    join ladra.animales mia on mia.id in (v.animal_a_id, v.animal_b_id) and coalesce(ladra.es_familia_de_animal(mia.id, p_uid), false)
    join ladra.animales b on b.id = case when v.animal_a_id = mia.id then v.animal_b_id else v.animal_a_id end
                          and b.estado = 'publicado' and not coalesce(ladra.es_familia_de_animal(b.id, p_uid), false)
   where v.estado = 'confirmado';
end;
$$;

create or replace function ladra.mi_arbol()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil ladra.perfiles_publicos%rowtype;
  v_integrantes jsonb;
  v_conexiones jsonb;
  v_momentos jsonb;
  v_pend_personas jsonb;
  v_pend_part jsonb;
  v_claves text[];
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  select * into v_perfil from ladra.perfiles_publicos where usuario_id = v_uid limit 1;

  select array_agg(distinct r.clave) into v_claves from ladra.arbol_relaciones(v_uid) r;

  -- Integrantes (una fila por integrante, con todas sus relaciones)
  select coalesce(jsonb_agg(m order by (m->>'propio')::boolean desc, m->>'nombre'), '[]'::jsonb) into v_integrantes
  from (
    select jsonb_build_object(
      'clave', r.clave, 'clase', min(r.clase), 'ref_id', min(r.ref_id::text), 'nombre', min(r.nombre),
      'especie', min(r.especie), 'foto_url', min(r.foto_url),
      'propio', bool_or(r.propio), 'memoria', bool_or(r.memoria), 'comunitario', bool_or(r.comunitario),
      'oculta', exists (select 1 from ladra.arbol_ramas_ocultas o where o.usuario_id = v_uid and ('animal:' || o.animal_id) = r.clave),
      'relaciones', jsonb_agg(jsonb_build_object(
        'origen', r.origen, 'id', r.rel_id, 'tipo', r.tipo, 'descripcion', r.descripcion, 'estado', r.estado,
        'editable', r.editable, 'retirable', r.retirable, 'publico', r.publico))
    ) as m
    from ladra.arbol_relaciones(v_uid) r
    group by r.clave
  ) t;

  -- Conexiones animal ↔ animal entre integrantes del árbol
  select coalesce(jsonb_agg(jsonb_build_object('a', 'animal:' || v.animal_a_id, 'b', 'animal:' || v.animal_b_id, 'tipo', v.tipo)), '[]'::jsonb)
    into v_conexiones
  from ladra.vinculos_animales v
  where v.estado = 'confirmado'
    and ('animal:' || v.animal_a_id) = any (coalesce(v_claves, '{}'))
    and ('animal:' || v.animal_b_id) = any (coalesce(v_claves, '{}'));

  -- Momentos que puedo ver, con participantes (los privados solo para su autor)
  select coalesce(jsonb_agg(mm order by (mm->>'fecha') desc, mm->>'creado_en' desc), '[]'::jsonb) into v_momentos
  from (
    select jsonb_build_object(
      'id', m.id, 'tipo', m.tipo, 'fecha', m.fecha, 'texto', m.texto, 'visibilidad', m.visibilidad,
      'creado_en', m.creado_en, 'es_mio', m.autor_id = v_uid,
      'autor_alias', (select pf.alias from ladra.perfiles_publicos pf where pf.usuario_id = m.autor_id limit 1),
      'participantes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pp.id,
          'clave', case when pp.animal_id is not null then 'animal:' || pp.animal_id
                        when pp.perfil_publico_id is not null then 'perfil:' || pp.perfil_publico_id
                        else 'privado:' || pp.vinculo_privado_id end,
          'nombre', coalesce(a.nombre, pf.alias, vp.nombre),
          'estado', pp.estado))
        from ladra.momentos_participantes pp
        left join ladra.animales a on a.id = pp.animal_id
        left join ladra.perfiles_publicos pf on pf.id = pp.perfil_publico_id
        left join ladra.arbol_vinculos_privados vp on vp.id = pp.vinculo_privado_id
        where pp.momento_id = m.id
          and (m.autor_id = v_uid or (pp.estado = 'confirmado' and pp.vinculo_privado_id is null))
      ), '[]'::jsonb)
    ) as mm
    from ladra.momentos m
    where ladra.puede_ver_momento(m.id, v_uid)
    order by m.fecha desc, m.creado_en desc
    limit 200
  ) t;

  -- Solicitudes que esperan MI respuesta
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'de_alias', o.alias, 'tipo', v.tipo, 'descripcion', v.descripcion)), '[]'::jsonb)
    into v_pend_personas
  from ladra.vinculos_personas v
  join ladra.perfiles_publicos o on o.id = v.perfil_a_id
  where v.estado = 'pendiente' and v.perfil_b_id = v_perfil.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pp.id, 'momento_tipo', m.tipo, 'fecha', m.fecha,
           'de_alias', (select pf.alias from ladra.perfiles_publicos pf where pf.usuario_id = m.autor_id limit 1),
           'participante', coalesce(a.nombre, pf2.alias))), '[]'::jsonb)
    into v_pend_part
  from ladra.momentos_participantes pp
  join ladra.momentos m on m.id = pp.momento_id and m.visibilidad = 'compartido'
  left join ladra.animales a on a.id = pp.animal_id
  left join ladra.perfiles_publicos pf2 on pf2.id = pp.perfil_publico_id
  where pp.estado = 'pendiente'
    and ((pp.perfil_publico_id is not null and pf2.usuario_id = v_uid)
         or (pp.animal_id is not null and ladra.es_familia_de_animal(pp.animal_id, v_uid)));

  return jsonb_build_object(
    'yo', case when v_perfil.id is null then null
               else jsonb_build_object('perfil_id', v_perfil.id, 'alias', v_perfil.alias, 'publicado', v_perfil.estado = 'publicado') end,
    'integrantes', v_integrantes,
    'conexiones', v_conexiones,
    'momentos', v_momentos,
    'pendientes', jsonb_build_object('personas', v_pend_personas, 'participaciones', v_pend_part)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Permisos de ejecución: solo con sesión
-- ---------------------------------------------------------------------------
revoke all on function ladra.mi_perfil_publico_id() from public, anon, authenticated;
revoke all on function ladra.mi_perfil_id_cualquiera() from public, anon, authenticated;
revoke all on function ladra.puede_ver_momento(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.arbol_vincular_animal(uuid, text, text) from public, anon, authenticated;
revoke all on function ladra.arbol_vincular_persona(uuid, text, text) from public, anon, authenticated;
revoke all on function ladra.arbol_responder_vinculo_persona(uuid, text) from public, anon, authenticated;
revoke all on function ladra.arbol_agregar_privado(text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.arbol_editar_vinculo(text, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function ladra.arbol_retirar_vinculo(text, uuid) from public, anon, authenticated;
revoke all on function ladra.arbol_buscar_personas(text) from public, anon, authenticated;
revoke all on function ladra.arbol_registrar_momento(text, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function ladra.arbol_editar_momento(uuid, text, date, text, text) from public, anon, authenticated;
revoke all on function ladra.arbol_eliminar_momento(uuid) from public, anon, authenticated;
revoke all on function ladra.arbol_responder_participacion(uuid, text) from public, anon, authenticated;
revoke all on function ladra.arbol_alternar_rama_memoria(uuid, boolean) from public, anon, authenticated;
revoke all on function ladra.arbol_relaciones(uuid) from public, anon, authenticated;
revoke all on function ladra.mi_arbol() from public, anon, authenticated;

grant execute on function ladra.mi_perfil_publico_id() to authenticated;
grant execute on function ladra.mi_perfil_id_cualquiera() to authenticated;
grant execute on function ladra.puede_ver_momento(uuid, uuid) to authenticated;
grant execute on function ladra.arbol_vincular_animal(uuid, text, text) to authenticated;
grant execute on function ladra.arbol_vincular_persona(uuid, text, text) to authenticated;
grant execute on function ladra.arbol_responder_vinculo_persona(uuid, text) to authenticated;
grant execute on function ladra.arbol_agregar_privado(text, text, text, text, uuid, uuid) to authenticated;
grant execute on function ladra.arbol_editar_vinculo(text, uuid, text, text, boolean) to authenticated;
grant execute on function ladra.arbol_retirar_vinculo(text, uuid) to authenticated;
grant execute on function ladra.arbol_buscar_personas(text) to authenticated;
grant execute on function ladra.arbol_registrar_momento(text, date, text, text, jsonb) to authenticated;
grant execute on function ladra.arbol_editar_momento(uuid, text, date, text, text) to authenticated;
grant execute on function ladra.arbol_eliminar_momento(uuid) to authenticated;
grant execute on function ladra.arbol_responder_participacion(uuid, text) to authenticated;
grant execute on function ladra.arbol_alternar_rama_memoria(uuid, boolean) to authenticated;
grant execute on function ladra.mi_arbol() to authenticated;

notify pgrst, 'reload schema';

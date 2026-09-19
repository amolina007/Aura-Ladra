-- Perfiles y mascotas se publican al crearlos (sin moderación previa).
-- Los vínculos a animales comunitarios o propios se confirman solos;
-- si apuntan a una mascota ajena, el dueño debe autorizar.
-- Cualquiera puede reportar un perfil/mascota; con sesión hay seguimiento.

-- 1) Publicación inmediata de perfiles y animales ---------------------------------
update ladra.perfiles_publicos
set estado = 'publicado', actualizado_en = now()
where estado = 'pendiente';

update ladra.animales
set estado = 'publicado', actualizado_en = now()
where estado = 'pendiente';

drop policy if exists perfiles_creacion_propia on ladra.perfiles_publicos;
create policy perfiles_creacion_propia
  on ladra.perfiles_publicos for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'publicado');

drop policy if exists perfiles_edicion_propia on ladra.perfiles_publicos;
create policy perfiles_edicion_propia
  on ladra.perfiles_publicos for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()) and estado = 'publicado');

drop policy if exists perfiles_moderacion on ladra.perfiles_publicos;
create policy perfiles_moderacion
  on ladra.perfiles_publicos for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

grant update (alias, biografia, estado, actualizado_en)
  on ladra.perfiles_publicos to authenticated;

drop policy if exists animales_creacion_autenticada on ladra.animales;
create policy animales_creacion_autenticada
  on ladra.animales for insert to authenticated
  with check (creado_por = (select auth.uid()) and estado = 'publicado');

-- 2) Lectura/respuesta de solicitudes de vínculo por el dueño ---------------------
drop policy if exists vinculos_humanos_lectura_autenticada on ladra.vinculos_animal_humano;
create policy vinculos_humanos_lectura_autenticada
  on ladra.vinculos_animal_humano for select to authenticated
  using (
    (estado = 'confirmado' and visible_publicamente is true)
    or creado_por = (select auth.uid())
    or exists (
      select 1 from ladra.animales a
      where a.id = animal_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

drop policy if exists vinculos_humanos_moderacion on ladra.vinculos_animal_humano;
drop policy if exists vinculos_humanos_respuesta_dueno on ladra.vinculos_animal_humano;
create policy vinculos_humanos_respuesta_dueno
  on ladra.vinculos_animal_humano for update to authenticated
  using (
    exists (
      select 1 from ladra.animales a
      where a.id = animal_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  )
  with check (
    exists (
      select 1 from ladra.animales a
      where a.id = animal_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

drop policy if exists vinculos_animales_lectura_autenticada on ladra.vinculos_animales;
create policy vinculos_animales_lectura_autenticada
  on ladra.vinculos_animales for select to authenticated
  using (
    estado = 'confirmado'
    or creado_por = (select auth.uid())
    or exists (
      select 1 from ladra.animales a
      where a.id = animal_b_id and a.creado_por = (select auth.uid())
    )
    or exists (
      select 1 from ladra.animales a
      where a.id = animal_a_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

drop policy if exists vinculos_animales_moderacion on ladra.vinculos_animales;
drop policy if exists vinculos_animales_respuesta_dueno on ladra.vinculos_animales;
create policy vinculos_animales_respuesta_dueno
  on ladra.vinculos_animales for update to authenticated
  using (
    exists (
      select 1 from ladra.animales a
      where a.id = animal_b_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  )
  with check (
    exists (
      select 1 from ladra.animales a
      where a.id = animal_b_id and a.creado_por = (select auth.uid())
    )
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

create or replace function ladra.solicitar_vinculo_animal_humano(
  p_animal_id uuid,
  p_tipo text,
  p_visible_publicamente boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_perfil_id uuid;
  v_animal ladra.animales%rowtype;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  select id into v_perfil_id
  from ladra.perfiles_publicos
  where usuario_id = auth.uid() and estado = 'publicado'
  limit 1;

  if v_perfil_id is null then
    raise exception using errcode = '22023', message = 'Primero crea tu alias público.';
  end if;

  select * into v_animal from ladra.animales where id = p_animal_id and estado = 'publicado';
  if not found then
    raise exception using errcode = '22023', message = 'Animal no disponible.';
  end if;

  if p_tipo not in ('responsable', 'cuidador', 'rescatista', 'colaborador') then
    raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
  end if;

  if v_animal.es_comunitario
     or v_animal.creado_por is null
     or v_animal.creado_por = auth.uid() then
    v_estado := 'confirmado';
  else
    v_estado := 'pendiente';
  end if;

  insert into ladra.vinculos_animal_humano (
    animal_id, perfil_publico_id, tipo, visible_publicamente, estado, creado_por
  ) values (
    p_animal_id, v_perfil_id, p_tipo, coalesce(p_visible_publicamente, true), v_estado, auth.uid()
  );

  return v_estado;
end;
$$;

revoke all on function ladra.solicitar_vinculo_animal_humano(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function ladra.solicitar_vinculo_animal_humano(uuid, text, boolean)
  to authenticated;

create or replace function ladra.solicitar_vinculo_animales(
  p_animal_a_id uuid,
  p_animal_b_id uuid,
  p_tipo text,
  p_descripcion text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_animal_a ladra.animales%rowtype;
  v_animal_b ladra.animales%rowtype;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  if p_animal_a_id = p_animal_b_id then
    raise exception using errcode = '22023', message = 'Selecciona dos animales diferentes.';
  end if;

  select * into v_animal_a from ladra.animales where id = p_animal_a_id and estado = 'publicado';
  if not found or v_animal_a.creado_por is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Solo puedes vincular desde tus animales.';
  end if;

  select * into v_animal_b from ladra.animales where id = p_animal_b_id and estado = 'publicado';
  if not found then
    raise exception using errcode = '22023', message = 'El otro animal no está disponible.';
  end if;

  if p_tipo not in ('familia', 'convivencia', 'amistad', 'colonia', 'manada', 'otro') then
    raise exception using errcode = '22023', message = 'Tipo de vínculo inválido.';
  end if;

  if v_animal_b.es_comunitario
     or v_animal_b.creado_por is null
     or v_animal_b.creado_por = auth.uid() then
    v_estado := 'confirmado';
  else
    v_estado := 'pendiente';
  end if;

  insert into ladra.vinculos_animales (
    animal_a_id, animal_b_id, tipo, descripcion, estado, creado_por
  ) values (
    p_animal_a_id,
    p_animal_b_id,
    p_tipo,
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    v_estado,
    auth.uid()
  );

  return v_estado;
end;
$$;

revoke all on function ladra.solicitar_vinculo_animales(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function ladra.solicitar_vinculo_animales(uuid, uuid, text, text)
  to authenticated;

create or replace function ladra.responder_solicitud_vinculo(
  p_tabla text,
  p_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_ok boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  if p_decision not in ('confirmado', 'rechazado') then
    raise exception using errcode = '22023', message = 'Decisión inválida.';
  end if;

  if p_tabla = 'vinculos_animal_humano' then
    update ladra.vinculos_animal_humano v
       set estado = p_decision, actualizado_en = now()
     where v.id = p_id
       and v.estado = 'pendiente'
       and exists (
         select 1 from ladra.animales a
         where a.id = v.animal_id and a.creado_por = auth.uid()
       );
    v_ok := found;
  elsif p_tabla = 'vinculos_animales' then
    update ladra.vinculos_animales v
       set estado = p_decision, actualizado_en = now()
     where v.id = p_id
       and v.estado = 'pendiente'
       and exists (
         select 1 from ladra.animales a
         where a.id = v.animal_b_id and a.creado_por = auth.uid()
       );
    v_ok := found;
  else
    raise exception using errcode = '22023', message = 'Tabla de vínculo inválida.';
  end if;

  if not v_ok then
    raise exception using errcode = '42501', message = 'No puedes responder esta solicitud.';
  end if;
end;
$$;

revoke all on function ladra.responder_solicitud_vinculo(text, uuid, text)
  from public, anon, authenticated;
grant execute on function ladra.responder_solicitud_vinculo(text, uuid, text)
  to authenticated;

-- 3) Reportes de perfiles / mascotas ---------------------------------------------
create table if not exists ladra.reportes_red (
  id uuid primary key default gen_random_uuid(),
  objetivo_tipo text not null
    constraint reportes_red_tipo_valido
    check (objetivo_tipo in ('animal', 'perfil_publico')),
  animal_id uuid references ladra.animales(id) on delete cascade,
  perfil_publico_id uuid references ladra.perfiles_publicos(id) on delete cascade,
  motivo text not null
    constraint reportes_red_motivo_valido
    check (char_length(btrim(motivo)) between 10 and 400),
  estado text not null default 'pendiente'
    constraint reportes_red_estado_valido
    check (estado in ('pendiente', 'revisado', 'accion_tomada', 'descartado')),
  nota_moderacion text
    check (nota_moderacion is null or char_length(btrim(nota_moderacion)) <= 400),
  reportante_id uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  moderado_en timestamptz,
  moderador_id uuid references auth.users(id) on delete set null,
  constraint reportes_red_objetivo_coherente check (
    (objetivo_tipo = 'animal' and animal_id is not null and perfil_publico_id is null)
    or (objetivo_tipo = 'perfil_publico' and perfil_publico_id is not null and animal_id is null)
  )
);

comment on table ladra.reportes_red is
  'Reportes comunitarios sobre perfiles públicos o fichas de mascota. La identidad del reportante no es pública.';

create index if not exists reportes_red_pendientes_idx
  on ladra.reportes_red (creado_en asc)
  where estado = 'pendiente';

create index if not exists reportes_red_reportante_idx
  on ladra.reportes_red (reportante_id, creado_en desc)
  where reportante_id is not null;

alter table ladra.reportes_red enable row level security;
alter table ladra.reportes_red force row level security;

drop policy if exists reportes_red_lectura_propia on ladra.reportes_red;
create policy reportes_red_lectura_propia
  on ladra.reportes_red for select to authenticated
  using (
    reportante_id = (select auth.uid())
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

drop policy if exists reportes_red_moderacion on ladra.reportes_red;
create policy reportes_red_moderacion
  on ladra.reportes_red for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

revoke all on table ladra.reportes_red from public, anon, authenticated;
grant select (
  id, objetivo_tipo, animal_id, perfil_publico_id, motivo, estado,
  nota_moderacion, creado_en, moderado_en
) on ladra.reportes_red to authenticated;
grant update (estado, nota_moderacion, moderado_en, moderador_id)
  on ladra.reportes_red to authenticated;
grant all on table ladra.reportes_red to service_role;

create or replace function ladra.crear_reporte_red(
  p_objetivo_tipo text,
  p_objetivo_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if p_objetivo_tipo not in ('animal', 'perfil_publico') then
    raise exception using errcode = '22023', message = 'Tipo de objetivo inválido.';
  end if;

  if char_length(v_motivo) < 10 or char_length(v_motivo) > 400 then
    raise exception using errcode = '22023', message = 'El motivo debe tener entre 10 y 400 caracteres.';
  end if;

  if p_objetivo_tipo = 'animal' then
    if not exists (select 1 from ladra.animales a where a.id = p_objetivo_id and a.estado = 'publicado') then
      raise exception using errcode = '22023', message = 'Mascota no disponible para reportar.';
    end if;
    insert into ladra.reportes_red (objetivo_tipo, animal_id, motivo, reportante_id)
    values ('animal', p_objetivo_id, v_motivo, auth.uid())
    returning id into v_id;
  else
    if not exists (
      select 1 from ladra.perfiles_publicos p
      where p.id = p_objetivo_id and p.estado = 'publicado'
    ) then
      raise exception using errcode = '22023', message = 'Perfil no disponible para reportar.';
    end if;
    insert into ladra.reportes_red (objetivo_tipo, perfil_publico_id, motivo, reportante_id)
    values ('perfil_publico', p_objetivo_id, v_motivo, auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function ladra.crear_reporte_red(text, uuid, text)
  from public, anon, authenticated;
grant execute on function ladra.crear_reporte_red(text, uuid, text)
  to anon, authenticated;

create or replace function ladra.preparar_moderacion_reporte_red()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
begin
  if new.estado is distinct from old.estado or new.nota_moderacion is distinct from old.nota_moderacion then
    if not exists (
      select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())
    ) then
      raise exception using errcode = '42501', message = 'No autorizado para moderar.';
    end if;
    new.moderado_en := now();
    new.moderador_id := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function ladra.preparar_moderacion_reporte_red() from public, anon, authenticated;

drop trigger if exists reportes_red_preparar_moderacion on ladra.reportes_red;
create trigger reportes_red_preparar_moderacion
before update on ladra.reportes_red
for each row execute function ladra.preparar_moderacion_reporte_red();

update ladra.estado_sistema
set version = '0.4.0', actualizado_en = now()
where id = 'auraladra';

drop function if exists ladra.mi_perfil_publico();
create or replace function ladra.mi_perfil_publico()
returns table (id uuid, alias text, biografia text, estado text)
language sql
stable
security invoker
set search_path = pg_catalog, ladra
as $$
  select p.id, p.alias, p.biografia, p.estado
  from ladra.perfiles_publicos p
  where p.usuario_id = (select auth.uid())
  limit 1;
$$;

revoke all on function ladra.mi_perfil_publico() from public, anon, authenticated;
grant execute on function ladra.mi_perfil_publico() to authenticated;

notify pgrst, 'reload schema';

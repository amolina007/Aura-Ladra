-- AuraLadra: piloto de reportes del Canil Parque 3 Poniente.
-- Mantiene toda la información dentro del schema ladra.

create table ladra.moderadores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nombre_publico text not null default 'Moderación AuraLadra',
  creado_en timestamptz not null default now()
);

comment on table ladra.moderadores is
  'Usuarios autorizados para revisar reportes. No se expone información de contacto.';

alter table ladra.moderadores enable row level security;
alter table ladra.moderadores force row level security;

create policy moderadores_lectura_propia
  on ladra.moderadores
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on table ladra.moderadores from public, anon, authenticated;
grant select (usuario_id, nombre_publico) on table ladra.moderadores to authenticated;
grant all on table ladra.moderadores to service_role;

create table ladra.reportes_canil (
  id uuid primary key default gen_random_uuid(),
  lugar_id uuid not null references ladra.lugares_publicos(id) on delete restrict,
  categoria text not null
    constraint reportes_canil_categoria_valida
    check (categoria in ('agua', 'limpieza', 'seguridad', 'infraestructura')),
  descripcion text not null
    constraint reportes_canil_descripcion_valida
    check (char_length(btrim(descripcion)) between 20 and 600),
  observado_en timestamptz not null,
  estado text not null default 'pendiente'
    constraint reportes_canil_estado_valido
    check (estado in ('pendiente', 'verificado', 'cerrado', 'rechazado')),
  reportante_id uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  moderado_en timestamptz,
  moderador_id uuid references auth.users(id) on delete set null,
  constraint reportes_canil_fecha_valida
    check (
      observado_en >= creado_en - interval '90 days'
      and observado_en <= creado_en + interval '15 minutes'
    )
);

comment on table ladra.reportes_canil is
  'Reportes del piloto. Pendientes y rechazados son privados; verificados y cerrados son públicos.';
comment on column ladra.reportes_canil.reportante_id is
  'Identidad opcional, tomada de auth.uid() por el servidor. Nunca se concede lectura pública de esta columna.';

create index reportes_canil_publicos_fecha_idx
  on ladra.reportes_canil (observado_en desc)
  where estado in ('verificado', 'cerrado');

create index reportes_canil_reportante_fecha_idx
  on ladra.reportes_canil (reportante_id, creado_en desc)
  where reportante_id is not null;

create index reportes_canil_pendientes_fecha_idx
  on ladra.reportes_canil (creado_en asc)
  where estado = 'pendiente';

alter table ladra.reportes_canil enable row level security;
alter table ladra.reportes_canil force row level security;

create policy reportes_canil_publicos_lectura
  on ladra.reportes_canil
  for select
  to anon
  using (estado in ('verificado', 'cerrado'));

create policy reportes_canil_lectura_autenticada
  on ladra.reportes_canil
  for select
  to authenticated
  using (
    estado in ('verificado', 'cerrado')
    or reportante_id = (select auth.uid())
    or exists (
      select 1
      from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

create policy reportes_canil_moderacion
  on ladra.reportes_canil
  for update
  to authenticated
  using (
    exists (
      select 1
      from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

revoke all on table ladra.reportes_canil from public, anon, authenticated;
grant select (
  id,
  lugar_id,
  categoria,
  descripcion,
  observado_en,
  estado,
  creado_en,
  actualizado_en,
  moderado_en
) on table ladra.reportes_canil to anon, authenticated;
grant update (estado) on table ladra.reportes_canil to authenticated;
grant all on table ladra.reportes_canil to service_role;

create or replace function ladra.crear_reporte_canil(
  p_categoria text,
  p_descripcion text,
  p_observado_en timestamptz,
  p_sitio_web text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_reporte_id uuid;
  v_lugar_id uuid;
  v_descripcion text := btrim(p_descripcion);
begin
  -- Campo trampa: una persona no lo ve, los bots suelen completarlo.
  if nullif(btrim(coalesce(p_sitio_web, '')), '') is not null then
    raise exception using errcode = '22023', message = 'Solicitud no válida.';
  end if;

  if p_categoria not in ('agua', 'limpieza', 'seguridad', 'infraestructura') then
    raise exception using errcode = '22023', message = 'Categoría no válida.';
  end if;

  if char_length(v_descripcion) not between 20 and 600 then
    raise exception using errcode = '22023', message = 'La descripción debe tener entre 20 y 600 caracteres.';
  end if;

  if p_observado_en is null
     or p_observado_en < now() - interval '90 days'
     or p_observado_en > now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'La fecha observada no es válida.';
  end if;

  select lp.id
    into v_lugar_id
    from ladra.lugares_publicos lp
   where lp.slug = 'canil-parque-3-poniente'
     and lp.publicado is true
   limit 1;

  if v_lugar_id is null then
    raise exception using errcode = '55000', message = 'El piloto no está disponible temporalmente.';
  end if;

  insert into ladra.reportes_canil (
    lugar_id,
    categoria,
    descripcion,
    observado_en,
    reportante_id
  )
  values (
    v_lugar_id,
    p_categoria,
    v_descripcion,
    p_observado_en,
    (select auth.uid())
  )
  returning id into v_reporte_id;

  return v_reporte_id;
end;
$$;

revoke all on function ladra.crear_reporte_canil(text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function ladra.crear_reporte_canil(text, text, timestamptz, text)
  to anon, authenticated;

create or replace function ladra.preparar_moderacion_reporte()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
begin
  if new.estado is distinct from old.estado then
    if not exists (
      select 1
      from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    ) then
      raise exception using errcode = '42501', message = 'No autorizado para moderar.';
    end if;

    new.moderado_en := now();
    new.moderador_id := (select auth.uid());
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

revoke all on function ladra.preparar_moderacion_reporte() from public, anon, authenticated;

create trigger reportes_canil_preparar_moderacion
before update on ladra.reportes_canil
for each row execute function ladra.preparar_moderacion_reporte();

update ladra.estado_sistema
set version = '0.2.0',
    actualizado_en = now()
where id = 'auraladra';

notify pgrst, 'reload schema';

-- Alertas geolocalizadas de mascotas perdidas para el mapa comunitario.
-- La ubicación y descripción son públicas; la identidad del reportante nunca lo es.

create table ladra.alertas_mascotas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
    constraint alertas_mascotas_nombre_valido
    check (char_length(btrim(nombre)) between 1 and 60),
  especie text not null
    constraint alertas_mascotas_especie_valida
    check (especie in ('perro', 'gato', 'ave', 'otro')),
  descripcion text not null
    constraint alertas_mascotas_descripcion_valida
    check (char_length(btrim(descripcion)) between 10 and 350),
  direccion_publica text not null
    constraint alertas_mascotas_direccion_valida
    check (char_length(btrim(direccion_publica)) between 5 and 180),
  latitud double precision not null
    constraint alertas_mascotas_latitud_maipu
    check (latitud between -33.60 and -33.42),
  longitud double precision not null
    constraint alertas_mascotas_longitud_maipu
    check (longitud between -70.86 and -70.64),
  perdida_en timestamptz not null,
  estado text not null default 'activa'
    constraint alertas_mascotas_estado_valido
    check (estado in ('activa', 'reunificada', 'oculta')),
  reportante_id uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint alertas_mascotas_fecha_valida
    check (
      perdida_en >= creado_en - interval '30 days'
      and perdida_en <= creado_en + interval '15 minutes'
    )
);

comment on table ladra.alertas_mascotas is
  'Alertas públicas geolocalizadas de mascotas perdidas en Maipú. No expone contacto ni identidad del reportante.';
comment on column ladra.alertas_mascotas.reportante_id is
  'Trazabilidad privada opcional obtenida desde auth.uid(); nunca se concede lectura pública.';

create index alertas_mascotas_activas_mapa_idx
  on ladra.alertas_mascotas (perdida_en desc)
  where estado = 'activa';
create index alertas_mascotas_reportante_idx
  on ladra.alertas_mascotas (reportante_id, creado_en desc)
  where reportante_id is not null;

alter table ladra.alertas_mascotas enable row level security;
alter table ladra.alertas_mascotas force row level security;

create policy alertas_mascotas_activas_lectura_anon
  on ladra.alertas_mascotas
  for select
  to anon
  using (estado = 'activa');

create policy alertas_mascotas_lectura_autenticada
  on ladra.alertas_mascotas
  for select
  to authenticated
  using (
    estado = 'activa'
    or reportante_id = (select auth.uid())
    or exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

create policy alertas_mascotas_moderacion
  on ladra.alertas_mascotas
  for update
  to authenticated
  using (
    exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

revoke all on table ladra.alertas_mascotas from public, anon, authenticated;
grant select (
  id, nombre, especie, descripcion, direccion_publica, latitud, longitud,
  perdida_en, estado, creado_en, actualizado_en
) on table ladra.alertas_mascotas to anon, authenticated;
grant update (estado) on table ladra.alertas_mascotas to authenticated;
grant all on table ladra.alertas_mascotas to service_role;

create or replace function ladra.crear_alerta_mascota(
  p_nombre text,
  p_especie text,
  p_descripcion text,
  p_direccion_publica text,
  p_latitud double precision,
  p_longitud double precision,
  p_perdida_en timestamptz,
  p_sitio_web text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_alerta_id uuid;
  v_nombre text := btrim(p_nombre);
  v_descripcion text := btrim(p_descripcion);
  v_direccion text := btrim(p_direccion_publica);
begin
  if nullif(btrim(coalesce(p_sitio_web, '')), '') is not null then
    raise exception using errcode = '22023', message = 'Solicitud no válida.';
  end if;

  if char_length(v_nombre) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'El nombre debe tener entre 1 y 60 caracteres.';
  end if;

  if p_especie not in ('perro', 'gato', 'ave', 'otro') then
    raise exception using errcode = '22023', message = 'La especie no es válida.';
  end if;

  if char_length(v_descripcion) not between 10 and 350 then
    raise exception using errcode = '22023', message = 'La descripción debe tener entre 10 y 350 caracteres.';
  end if;

  if char_length(v_direccion) not between 5 and 180 then
    raise exception using errcode = '22023', message = 'Selecciona una dirección reconocida por el mapa.';
  end if;

  if p_latitud is null or p_longitud is null
     or p_latitud not between -33.60 and -33.42
     or p_longitud not between -70.86 and -70.64 then
    raise exception using errcode = '22023', message = 'La ubicación debe estar dentro de Maipú.';
  end if;

  if p_perdida_en is null
     or p_perdida_en < now() - interval '30 days'
     or p_perdida_en > now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'La fecha indicada no es válida.';
  end if;

  insert into ladra.alertas_mascotas (
    nombre, especie, descripcion, direccion_publica, latitud, longitud,
    perdida_en, reportante_id
  ) values (
    v_nombre, p_especie, v_descripcion, v_direccion, p_latitud, p_longitud,
    p_perdida_en, (select auth.uid())
  )
  returning id into v_alerta_id;

  return v_alerta_id;
end;
$$;

revoke all on function ladra.crear_alerta_mascota(
  text, text, text, text, double precision, double precision, timestamptz, text
) from public, anon, authenticated;
grant execute on function ladra.crear_alerta_mascota(
  text, text, text, text, double precision, double precision, timestamptz, text
) to anon, authenticated;

create or replace function ladra.actualizar_alerta_mascota()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

revoke all on function ladra.actualizar_alerta_mascota() from public, anon, authenticated;

create trigger alertas_mascotas_actualizar_fecha
before update on ladra.alertas_mascotas
for each row execute function ladra.actualizar_alerta_mascota();

update ladra.estado_sistema
set version = '0.5.0', actualizado_en = now()
where id = 'auraladra';

notify pgrst, 'reload schema';

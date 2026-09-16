-- AuraLadra: primera superficie publica y aislada del schema ladra.
-- No modifica objetos de public/AuraRitmos.

create schema if not exists ladra;
comment on schema ladra is 'Datos y API aislados de AuraLadra.';

revoke all on schema ladra from public;
grant usage on schema ladra to anon, authenticated, service_role;

alter default privileges for role postgres in schema ladra
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema ladra
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema ladra
  revoke execute on functions from public, anon, authenticated;

create table if not exists ladra.lugares_publicos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  descripcion text not null,
  direccion_publica text,
  comuna text not null,
  categoria text not null check (categoria in ('canil', 'parque', 'servicio', 'comercio', 'otro')),
  estado_verificacion text not null default 'pendiente'
    check (estado_verificacion in ('pendiente', 'comunitario', 'verificado')),
  latitud numeric(9,6),
  longitud numeric(9,6),
  publicado boolean not null default false,
  actualizado_en timestamptz not null default now()
);

comment on table ladra.lugares_publicos is
  'Lugares comunitarios publicables. No contiene datos personales de tutores ni mascotas.';

alter table ladra.lugares_publicos enable row level security;
alter table ladra.lugares_publicos force row level security;

drop policy if exists lugares_publicados_lectura on ladra.lugares_publicos;
create policy lugares_publicados_lectura
  on ladra.lugares_publicos
  for select
  to anon, authenticated
  using (publicado is true);

revoke all on table ladra.lugares_publicos from public, anon, authenticated;
grant select on table ladra.lugares_publicos to anon, authenticated;
grant all on table ladra.lugares_publicos to service_role;

insert into ladra.lugares_publicos (
  slug,
  nombre,
  descripcion,
  direccion_publica,
  comuna,
  categoria,
  estado_verificacion,
  publicado
)
values (
  'canil-parque-3-poniente',
  'Canil Parque 3 Poniente',
  'Punto de encuentro del piloto comunitario de AuraLadra.',
  'Av. 3 Pte. 108',
  'Maipú',
  'canil',
  'comunitario',
  true
)
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  direccion_publica = excluded.direccion_publica,
  comuna = excluded.comuna,
  categoria = excluded.categoria,
  estado_verificacion = excluded.estado_verificacion,
  publicado = excluded.publicado,
  actualizado_en = now();

notify pgrst, 'reload schema';

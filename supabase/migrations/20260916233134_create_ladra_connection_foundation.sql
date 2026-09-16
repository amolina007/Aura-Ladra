create schema if not exists ladra authorization postgres;

revoke all on schema ladra from public;
grant usage on schema ladra to anon, authenticated, service_role;

alter default privileges for role postgres in schema ladra
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema ladra
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema ladra
  revoke execute on functions from public, anon, authenticated;

create table if not exists ladra.estado_sistema (
  id text primary key,
  nombre text not null,
  estado text not null check (estado in ('operativo', 'mantenimiento')),
  version text not null,
  actualizado_en timestamptz not null default now()
);

alter table ladra.estado_sistema enable row level security;

revoke all on table ladra.estado_sistema from anon, authenticated;
grant select on table ladra.estado_sistema to anon, authenticated;

drop policy if exists estado_sistema_lectura_publica on ladra.estado_sistema;
create policy estado_sistema_lectura_publica
on ladra.estado_sistema
for select
to anon, authenticated
using (true);

insert into ladra.estado_sistema (id, nombre, estado, version)
values ('auraladra', 'AuraLadra', 'operativo', '0.1.0')
on conflict (id) do update
set nombre = excluded.nombre,
    estado = excluded.estado,
    version = excluded.version,
    actualizado_en = now();

comment on schema ladra is
  'Datos aislados de AuraLadra. No contiene tablas de AuraRitmos.';
comment on table ladra.estado_sistema is
  'Registro público mínimo para verificar conectividad del frontend.';

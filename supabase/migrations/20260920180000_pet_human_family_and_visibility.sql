-- Familia de la mascota (dueño principal + secundarios) y visibilidad del humano.
-- Schema ladra. No cambia UI ni políticas de quién puede ver/editar.

-- 1) Visibilidad a nivel de persona (alias público), no por mascota.
alter table ladra.perfiles_publicos
  add column if not exists visibilidad text not null default 'basico';

alter table ladra.perfiles_publicos
  drop constraint if exists perfiles_publicos_visibilidad_check;

alter table ladra.perfiles_publicos
  add constraint perfiles_publicos_visibilidad_check
  check (visibilidad in ('basico', 'ampliado', 'oculto'));

comment on column ladra.perfiles_publicos.visibilidad is
  'Qué tanto se muestra esta persona junto a sus mascotas: basico, ampliado u oculto. No es por mascota.';

-- 2) Relación muchos a muchos mascota–humano, con un rol por pareja.
create table if not exists ladra.humanos_animal (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  perfil_publico_id uuid not null references ladra.perfiles_publicos(id) on delete cascade,
  rol text not null
    constraint humanos_animal_rol_valido
    check (rol in ('dueno_principal', 'secundario')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (animal_id, perfil_publico_id)
);

comment on table ladra.humanos_animal is
  'Familia de una mascota: un dueño principal opcional y cero o más humanos secundarios.';
comment on column ladra.humanos_animal.rol is
  'dueno_principal: un máximo por mascota. secundario: varios permitidos.';

create unique index if not exists humanos_animal_un_principal_por_mascota
  on ladra.humanos_animal (animal_id)
  where rol = 'dueno_principal';

create index if not exists humanos_animal_perfil_idx
  on ladra.humanos_animal (perfil_publico_id);

alter table ladra.humanos_animal enable row level security;
alter table ladra.humanos_animal force row level security;

revoke all on ladra.humanos_animal from public, anon, authenticated;
grant all on ladra.humanos_animal to service_role;

-- 3) Quien ya figura como creador de la ficha pasa a dueño principal,
--    solo si tiene alias público. No se inventan perfiles.
insert into ladra.humanos_animal (animal_id, perfil_publico_id, rol)
select a.id, p.id, 'dueno_principal'
from ladra.animales a
join ladra.perfiles_publicos p on p.usuario_id = a.creado_por
where a.creado_por is not null
on conflict (animal_id, perfil_publico_id) do nothing;

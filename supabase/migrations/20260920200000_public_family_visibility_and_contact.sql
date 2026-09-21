-- Lista pública de humanos de una mascota (respeta visibilidad)
-- y canal de contacto interno. Schema ladra. Sin teléfono ni correo.

create or replace function ladra.humanos_visibles_de_animal(p_animal_id uuid)
returns table (
  perfil_publico_id uuid,
  alias text,
  rol text,
  visibilidad text
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select
    p.id,
    p.alias,
    h.rol,
    p.visibilidad
  from ladra.humanos_animal h
  join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
  join ladra.animales a on a.id = h.animal_id
  where h.animal_id = p_animal_id
    and a.estado = 'publicado'
    and p.estado = 'publicado'
    and p.visibilidad in ('basico', 'ampliado')
  order by
    case h.rol when 'dueno_principal' then 0 else 1 end,
    p.alias;
$$;

comment on function ladra.humanos_visibles_de_animal(uuid) is
  'Humanos vinculados a una mascota publicada. Omite visibilidad oculto. No entrega correo ni teléfono.';

revoke all on function ladra.humanos_visibles_de_animal(uuid) from public, anon, authenticated;
grant execute on function ladra.humanos_visibles_de_animal(uuid) to anon, authenticated, service_role;

create table if not exists ladra.mensajes_contacto (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  destinatario_perfil_id uuid not null references ladra.perfiles_publicos(id) on delete cascade,
  remitente_id uuid not null references auth.users(id) on delete cascade,
  cuerpo text not null
    constraint mensajes_contacto_cuerpo_largo
    check (char_length(btrim(cuerpo)) between 10 and 800),
  creado_en timestamptz not null default now()
);

comment on table ladra.mensajes_contacto is
  'Mensajes internos entre cuentas. El contacto nunca publica teléfono ni correo.';

create index if not exists mensajes_contacto_destinatario_idx
  on ladra.mensajes_contacto (destinatario_perfil_id, creado_en desc);
create index if not exists mensajes_contacto_remitente_idx
  on ladra.mensajes_contacto (remitente_id, creado_en desc);

alter table ladra.mensajes_contacto enable row level security;
alter table ladra.mensajes_contacto force row level security;

revoke all on ladra.mensajes_contacto from public, anon, authenticated;
grant select (id, animal_id, destinatario_perfil_id, remitente_id, cuerpo, creado_en)
  on ladra.mensajes_contacto to authenticated;
grant all on ladra.mensajes_contacto to service_role;

drop policy if exists mensajes_contacto_lectura_propia on ladra.mensajes_contacto;
create policy mensajes_contacto_lectura_propia
on ladra.mensajes_contacto for select to authenticated
using (
  remitente_id = (select auth.uid())
  or exists (
    select 1 from ladra.perfiles_publicos p
    where p.id = destinatario_perfil_id
      and p.usuario_id = (select auth.uid())
  )
);

create or replace function ladra.enviar_mensaje_contacto(
  p_animal_id uuid,
  p_perfil_publico_id uuid,
  p_cuerpo text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_cuerpo text := btrim(coalesce(p_cuerpo, ''));
  v_id uuid;
  v_destinatario uuid;
begin
  if v_me is null then
    raise exception using errcode = '42501', message = 'Inicia sesión para contactar. No compartimos teléfonos ni correos.';
  end if;
  if char_length(v_cuerpo) not between 10 and 800 then
    raise exception using errcode = '22023', message = 'El mensaje debe tener entre 10 y 800 caracteres.';
  end if;

  select p.usuario_id
    into v_destinatario
    from ladra.humanos_visibles_de_animal(p_animal_id) h
    join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
   where h.perfil_publico_id = p_perfil_publico_id
   limit 1;

  if v_destinatario is null then
    raise exception using errcode = '42501', message = 'Esta persona no está disponible para contacto público.';
  end if;
  if v_destinatario = v_me then
    raise exception using errcode = '22023', message = 'No puedes enviarte un mensaje a ti mismo.';
  end if;

  insert into ladra.mensajes_contacto (
    animal_id, destinatario_perfil_id, remitente_id, cuerpo
  ) values (
    p_animal_id, p_perfil_publico_id, v_me, v_cuerpo
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function ladra.enviar_mensaje_contacto(uuid, uuid, text) from public, anon, authenticated;
grant execute on function ladra.enviar_mensaje_contacto(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

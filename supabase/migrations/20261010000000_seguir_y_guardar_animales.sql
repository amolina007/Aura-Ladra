-- Seguir y guardar perfiles de animales («Mi red» y «Descubrir»). Solo schema ladra.
-- PREPARADA PARA REVISIÓN: no se ha ejecutado en producción ni en ninguna rama.
--
-- Seguir un perfil NO es registrar una relación: no da acceso a nada privado de la ficha
-- (eso sigue decidiéndolo ladra.ficha_animal_segun_relacion). Guardar es un favorito personal.
-- Ambas listas son privadas: solo la propia persona las ve.
-- El navegador no escribe estas tablas directamente: todo pasa por funciones que validan permisos.
-- No toca el schema public ni modifica tablas existentes.

do $$
begin
  if to_regprocedure('core.hay_bloqueo(uuid,uuid)') is null then
    raise exception using errcode = '55000',
      message = 'Faltan las migraciones de Convergencia Aura Core (bloqueos). Aplícalas antes de esta.';
  end if;
end $$;

create table if not exists ladra.animales_seguidos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, animal_id)
);
create table if not exists ladra.animales_guardados (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, animal_id)
);
create index if not exists animales_seguidos_animal_idx on ladra.animales_seguidos (animal_id);

-- Sin políticas: nadie lee ni escribe directo (RLS activo y sin permisos de tabla).
alter table ladra.animales_seguidos enable row level security;
alter table ladra.animales_guardados enable row level security;
revoke all on ladra.animales_seguidos, ladra.animales_guardados from public, anon, authenticated;

-- Validación común: el animal debe estar publicado y visible en la red, no ser de quien consulta,
-- y no debe haber bloqueo entre quien consulta y quien creó la ficha (en ninguna dirección).
create or replace function ladra.puede_seguir_o_guardar(p_animal_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_yo uuid := (select auth.uid());
  v_creador uuid;
begin
  if v_yo is null then
    raise exception using errcode = '28000', message = 'Inicia sesión para seguir o guardar perfiles.';
  end if;
  select a.creado_por into v_creador
    from ladra.animales a
   where a.id = p_animal_id and a.estado = 'publicado' and a.mostrar_en_red is not false;
  if not found then
    raise exception using errcode = 'P0002', message = 'Ese perfil no está disponible.';
  end if;
  if v_creador is not distinct from v_yo
     or exists (select 1 from ladra.humanos_animal h
                  join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
                 where h.animal_id = p_animal_id and p.usuario_id = v_yo) then
    raise exception using errcode = '22023', message = 'Es una de tus mascotas: ya está en tu red.';
  end if;
  if v_creador is not null and core.hay_bloqueo(v_yo, v_creador) then
    raise exception using errcode = '42501', message = 'Ese perfil no está disponible.';
  end if;
end $$;

create or replace function ladra.seguir_animal(p_animal_id uuid, p_seguir boolean default true)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  if p_seguir then
    perform ladra.puede_seguir_o_guardar(p_animal_id);
    insert into ladra.animales_seguidos (usuario_id, animal_id) values (v_yo, p_animal_id)
      on conflict do nothing;
  else
    if v_yo is null then
      raise exception using errcode = '28000', message = 'Inicia sesión para seguir o guardar perfiles.';
    end if;
    delete from ladra.animales_seguidos where usuario_id = v_yo and animal_id = p_animal_id;
  end if;
  return p_seguir;
end $$;

create or replace function ladra.guardar_animal(p_animal_id uuid, p_guardar boolean default true)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  if p_guardar then
    perform ladra.puede_seguir_o_guardar(p_animal_id);
    insert into ladra.animales_guardados (usuario_id, animal_id) values (v_yo, p_animal_id)
      on conflict do nothing;
  else
    if v_yo is null then
      raise exception using errcode = '28000', message = 'Inicia sesión para seguir o guardar perfiles.';
    end if;
    delete from ladra.animales_guardados where usuario_id = v_yo and animal_id = p_animal_id;
  end if;
  return p_guardar;
end $$;

-- Mis seguidos y guardados. Solo devuelve perfiles que siguen publicados y visibles, y sin bloqueo.
create or replace function ladra.mis_animales_seguidos()
returns table (animal_id uuid, seguido boolean, guardado boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null then
    return;
  end if;
  return query
    select a.id,
           exists (select 1 from ladra.animales_seguidos s where s.usuario_id = v_yo and s.animal_id = a.id),
           exists (select 1 from ladra.animales_guardados g where g.usuario_id = v_yo and g.animal_id = a.id)
      from ladra.animales a
     where a.estado = 'publicado' and a.mostrar_en_red is not false
       and (exists (select 1 from ladra.animales_seguidos s where s.usuario_id = v_yo and s.animal_id = a.id)
         or exists (select 1 from ladra.animales_guardados g where g.usuario_id = v_yo and g.animal_id = a.id))
       and not (a.creado_por is not null and core.hay_bloqueo(v_yo, a.creado_por));
end $$;

revoke all on function ladra.puede_seguir_o_guardar(uuid) from public, anon, authenticated;
revoke all on function ladra.seguir_animal(uuid, boolean) from public, anon, authenticated;
revoke all on function ladra.guardar_animal(uuid, boolean) from public, anon, authenticated;
revoke all on function ladra.mis_animales_seguidos() from public, anon, authenticated;
grant execute on function ladra.seguir_animal(uuid, boolean) to authenticated, service_role;
grant execute on function ladra.guardar_animal(uuid, boolean) to authenticated, service_role;
grant execute on function ladra.mis_animales_seguidos() to authenticated, service_role;

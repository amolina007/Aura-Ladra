-- ¿Qué relación tiene quien consulta con cada mascota? Schema ladra.
-- Base para «Mi red» (mascotas de amistades y de personas que sigues), la estrellita
-- de amistad y, más adelante, para decidir qué información de la ficha se muestra.
--
-- Solo LEE de Convergencia Aura Core (schema core): amistades, seguimientos y bloqueos.
-- Core no se modifica y no referencia nada de ladra. No toca el schema public.
-- Solo agrega una función: no cambia tablas, políticas ni datos.

-- Falla con un mensaje claro si Core todavía no está aplicado en este proyecto.
do $$
begin
  if to_regclass('core.amistades') is null
     or to_regclass('core.seguimientos') is null
     or to_regprocedure('core.hay_bloqueo(uuid,uuid)') is null
     or to_regprocedure('core.son_amigos(uuid,uuid)') is null then
    raise exception using errcode = '55000',
      message = 'Faltan las migraciones de Convergencia Aura Core (amistades, seguimientos y bloqueos). Aplícalas antes de esta.';
  end if;
end $$;

-- Devuelve SOLO las mascotas con las que quien consulta tiene alguna relación.
-- Las demás son «desconocidas» y no aparecen en el resultado.
--
--   propia     La persona creó la ficha o es su dueña principal.
--   vinculada  Es dueña secundaria, o tiene un vínculo confirmado como responsable o cuidadora.
--   bloqueada  Hay un bloqueo entre ella y alguien que cuida a la mascota (en cualquier dirección).
--   amistad    Es amiga (amistad aceptada en Core) de alguien que cuida a la mascota.
--   seguida    Sigue en Core a alguien que cuida a la mascota Y cuyo vínculo con ella es público
--              (su alias está publicado y no en modo «oculto»). Seguir es unilateral y no pide permiso,
--              así que no debe revelar vínculos que la persona eligió ocultar. Seguir NO da más acceso
--              que ser desconocida.
--
-- Prioridad cuando se cumplen varias: propia > vinculada > bloqueada > amistad > seguida.
-- Una mascota que su dueño oculta de la red pública (mostrar_en_red = false) no se revela
-- a amistades ni a seguidoras: solo a su dueña y a quienes están vinculadas a ella.
-- La identidad sale de la sesión (auth.uid()); la función no recibe parámetros.
create or replace function ladra.mi_relacion_con_animales()
returns table (animal_id uuid, relacion text)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_yo uuid := (select auth.uid());
begin
  if v_yo is null then
    return;
  end if;

  return query
  with base as (
    select a.id as animal_id, a.estado, a.mostrar_en_red
    from ladra.animales a
    where a.estado = 'publicado' or a.creado_por = v_yo
  ),
  -- Quienes cuidan a cada mascota: quien creó la ficha y las personas de su familia registrada.
  duenos as (
    select b.animal_id, a.creado_por as usuario_id, 'dueno_principal'::text as rol
    from base b
    join ladra.animales a on a.id = b.animal_id
    where a.creado_por is not null
    union
    select h.animal_id, p.usuario_id, h.rol
    from ladra.humanos_animal h
    join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
    join base b on b.animal_id = h.animal_id
  ),
  -- Vínculos que la persona deja ver públicamente (misma regla que humanos_visibles_de_animal).
  duenos_publicos as (
    select h.animal_id, p.usuario_id
    from ladra.humanos_animal h
    join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
    join base b on b.animal_id = h.animal_id
    where p.estado = 'publicado'
      and p.visibilidad in ('basico', 'ampliado')
  ),
  mis_vinculos as (
    select v.animal_id
    from ladra.vinculos_animal_humano v
    join ladra.perfiles_publicos p on p.id = v.perfil_publico_id
    join base b on b.animal_id = v.animal_id
    where p.usuario_id = v_yo
      and v.estado = 'confirmado'
      and v.tipo in ('responsable', 'cuidador')
  ),
  calculo as (
    select
      b.animal_id,
      (b.estado = 'publicado' and b.mostrar_en_red) as visible_en_red,
      exists (select 1 from duenos d
              where d.animal_id = b.animal_id and d.usuario_id = v_yo and d.rol = 'dueno_principal') as es_propia,
      (exists (select 1 from duenos d
               where d.animal_id = b.animal_id and d.usuario_id = v_yo and d.rol = 'secundario')
       or exists (select 1 from mis_vinculos m where m.animal_id = b.animal_id)) as es_vinculada,
      exists (select 1 from duenos d
              where d.animal_id = b.animal_id and d.usuario_id <> v_yo
                and core.hay_bloqueo(v_yo, d.usuario_id)) as hay_bloqueo,
      exists (select 1 from duenos d
              where d.animal_id = b.animal_id and d.usuario_id <> v_yo
                and core.son_amigos(v_yo, d.usuario_id)) as es_amiga,
      exists (select 1 from duenos_publicos d
              join core.seguimientos s on s.seguido_id = d.usuario_id
              where d.animal_id = b.animal_id and d.usuario_id <> v_yo
                and s.seguidor_id = v_yo) as es_seguida
    from base b
  )
  select
    c.animal_id,
    case
      when c.es_propia then 'propia'
      when c.es_vinculada then 'vinculada'
      when c.hay_bloqueo then 'bloqueada'
      when c.es_amiga then 'amistad'
      else 'seguida'
    end
  from calculo c
  where c.es_propia
     or c.es_vinculada
     or (c.visible_en_red and (c.hay_bloqueo or c.es_amiga or c.es_seguida));
end;
$$;

comment on function ladra.mi_relacion_con_animales() is
  'Relación de quien consulta (por sesión) con cada mascota: propia, vinculada, bloqueada, amistad o seguida. Lee amistades, seguimientos y bloqueos de Convergencia Aura Core. Las mascotas sin relación no aparecen.';

revoke all on function ladra.mi_relacion_con_animales() from public, anon, authenticated;
grant execute on function ladra.mi_relacion_con_animales() to authenticated, service_role;

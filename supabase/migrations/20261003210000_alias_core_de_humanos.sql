-- Alias de Convergencia Aura Core de los humanos de una mascota, SOLO si la persona
-- eligió visibilidad «ampliado» en AuraLadra. Schema ladra.
--
-- Por qué existe: el alias de AuraLadra y el de Core son independientes (ej. «Cate» y «cata»).
-- Enlazar a Core revela que ambas cuentas son la misma persona, así que solo ocurre
-- con consentimiento: quien está en «básico» u «oculto» nunca aparece aquí.
--
-- Solo LEE de Core (core.perfiles). Core no se modifica. No toca el schema public.
-- No cambia tablas ni datos: agrega una función.

do $$
begin
  if to_regclass('core.perfiles') is null then
    raise exception using errcode = '55000',
      message = 'Falta Convergencia Aura Core (core.perfiles). Aplica sus migraciones antes de esta.';
  end if;
  if to_regprocedure('ladra.humanos_visibles_de_animal(uuid)') is null then
    raise exception using errcode = '55000',
      message = 'Falta ladra.humanos_visibles_de_animal. Aplica antes la migración 20260920200000.';
  end if;
end $$;

create or replace function ladra.alias_core_de_humanos_visibles(p_animal_id uuid)
returns table (
  perfil_publico_id uuid,
  alias_core text
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select h.perfil_publico_id, c.alias
  from ladra.humanos_visibles_de_animal(p_animal_id) h
  join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
  join core.perfiles c on c.id = p.usuario_id
  where h.visibilidad = 'ampliado'
    and c.estado = 'disponible';
$$;

comment on function ladra.alias_core_de_humanos_visibles(uuid) is
  'Alias de Core de los humanos visibles de una mascota que eligieron visibilidad ampliado. Los demás no aparecen.';

revoke all on function ladra.alias_core_de_humanos_visibles(uuid) from public, anon, authenticated;
grant execute on function ladra.alias_core_de_humanos_visibles(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

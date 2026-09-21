-- Cada persona elige cómo aparece junto a sus mascotas. Schema ladra.

grant update (alias, biografia, estado, visibilidad, actualizado_en)
  on ladra.perfiles_publicos to authenticated;

grant insert (usuario_id, alias, biografia, estado, visibilidad)
  on ladra.perfiles_publicos to authenticated;

drop function if exists ladra.mi_perfil_publico();
create function ladra.mi_perfil_publico()
returns table (id uuid, alias text, biografia text, estado text, visibilidad text)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select p.id, p.alias, p.biografia, p.estado, p.visibilidad
  from ladra.perfiles_publicos p
  where (select auth.uid()) is not null
    and p.usuario_id = (select auth.uid())
  limit 1;
$$;

revoke all on function ladra.mi_perfil_publico() from public, anon, authenticated;
grant execute on function ladra.mi_perfil_publico() to authenticated;

notify pgrst, 'reload schema';

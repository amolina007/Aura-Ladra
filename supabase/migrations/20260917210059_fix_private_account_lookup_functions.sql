-- Las consultas privadas de Mi cuenta deben poder filtrar por columnas que no
-- se exponen directamente en la Data API. Devuelven solo filas de auth.uid().

create or replace function ladra.mis_animales()
returns table (
  id uuid,
  nombre text,
  especie text,
  estado text,
  estado_seguridad text
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado, a.estado_seguridad
  from ladra.animales a
  where (select auth.uid()) is not null
    and a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

create or replace function ladra.mi_perfil_publico()
returns table (id uuid, alias text, estado text)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select p.id, p.alias, p.estado
  from ladra.perfiles_publicos p
  where (select auth.uid()) is not null
    and p.usuario_id = (select auth.uid())
  limit 1;
$$;

revoke all on function ladra.mi_perfil_publico() from public, anon, authenticated;
grant execute on function ladra.mi_perfil_publico() to authenticated;

notify pgrst, 'reload schema';

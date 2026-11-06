-- Contacto público y galería del aviso; se mantienen los permisos por autor.
create function ladra.aviso_fotos_validas(paths text[], autor uuid)
returns boolean language sql immutable set search_path = '' as $$
 select cardinality(paths) <= 6 and not exists (
   select 1 from unnest(paths) as p where p is null
   or p !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
   or split_part(p,'/',1) <> autor::text
 );
$$;
alter table ladra.avisos_externos
 add column celular text check(celular ~ '^\+?[0-9 ()-]{7,30}$' and length(regexp_replace(celular,'[^0-9]','','g')) between 7 and 15),
 add column domicilio text check(length(domicilio)<=300),
 add column fotos_paths text[] not null default '{}',
 add constraint avisos_externos_fotos_validas check(ladra.aviso_fotos_validas(fotos_paths,autor_id));
grant insert(celular,domicilio,fotos_paths), update(celular,domicilio,fotos_paths)
 on ladra.avisos_externos to authenticated;
notify pgrst,'reload schema';

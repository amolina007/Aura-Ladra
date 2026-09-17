-- Evita dos políticas permisivas de lectura para authenticated.
drop policy if exists lugares_publicados_lectura on ladra.lugares_publicos;

create policy lugares_publicados_lectura_anon
  on ladra.lugares_publicos
  for select
  to anon
  using (publicado is true);

notify pgrst, 'reload schema';

-- El rol anónimo lee los comentarios sin recibir el UUID interno del autor.
revoke select on ladra.comentarios_feed from anon, authenticated;
grant select (id, publicacion_id, medio_id, texto, creado_en)
  on ladra.comentarios_feed to anon;
grant select (id, publicacion_id, medio_id, autor_id, texto, creado_en)
  on ladra.comentarios_feed to authenticated;
notify pgrst, 'reload schema';

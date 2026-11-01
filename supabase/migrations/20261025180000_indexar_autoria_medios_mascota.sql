-- Optimiza la lectura y eliminación del contenido propio por autor.
create index if not exists medios_mascota_autor_idx
  on ladra.medios_mascota (autor_id);

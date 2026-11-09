-- Comentarios compartidos en publicaciones y medios de mascotas públicos.
-- El usuario solo puede escribir o borrar con su propia sesión.
create table ladra.comentarios_feed (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid references ladra.publicaciones_feed(id) on delete cascade,
  medio_id uuid references ladra.medios_mascota(id) on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  creado_en timestamptz not null default now(),
  constraint comentarios_feed_un_destino check ((publicacion_id is not null) <> (medio_id is not null))
);

create index comentarios_feed_publicacion_fecha_idx
  on ladra.comentarios_feed (publicacion_id, creado_en desc) where publicacion_id is not null;
create index comentarios_feed_medio_fecha_idx
  on ladra.comentarios_feed (medio_id, creado_en desc) where medio_id is not null;
create index comentarios_feed_autor_idx on ladra.comentarios_feed (autor_id);

alter table ladra.comentarios_feed enable row level security;
alter table ladra.comentarios_feed force row level security;

create policy comentarios_feed_leer_publicos
  on ladra.comentarios_feed for select to anon, authenticated
  using (
    (publicacion_id is not null and exists (
      select 1
      from ladra.publicaciones_feed f
      join ladra.animales a on a.id = f.animal_id
      where f.id = comentarios_feed.publicacion_id
        and f.tipo = 'post'
        and a.estado = 'publicado'
        and a.mostrar_en_red
    ))
    or (medio_id is not null and exists (
      select 1
      from ladra.medios_mascota m
      join ladra.animales a on a.id = m.animal_id
      where m.id = comentarios_feed.medio_id
        and a.estado = 'publicado'
        and a.mostrar_en_red
    ))
  );

create policy comentarios_feed_crear_con_sesion
  on ladra.comentarios_feed for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and char_length(btrim(texto)) between 1 and 500
    and (
      (publicacion_id is not null and medio_id is null and exists (
        select 1
        from ladra.publicaciones_feed f
        join ladra.animales a on a.id = f.animal_id
        where f.id = comentarios_feed.publicacion_id
          and f.tipo = 'post'
          and a.estado = 'publicado'
          and a.mostrar_en_red
      ))
      or (medio_id is not null and publicacion_id is null and exists (
        select 1
        from ladra.medios_mascota m
        join ladra.animales a on a.id = m.animal_id
        where m.id = comentarios_feed.medio_id
          and a.estado = 'publicado'
          and a.mostrar_en_red
      ))
    )
  );

create policy comentarios_feed_borrar_propios
  on ladra.comentarios_feed for delete to authenticated
  using (autor_id = (select auth.uid()));

revoke all on ladra.comentarios_feed from public, anon, authenticated;
grant select on ladra.comentarios_feed to anon, authenticated;
grant insert(publicacion_id, medio_id, autor_id, texto), delete on ladra.comentarios_feed to authenticated;

notify pgrst, 'reload schema';

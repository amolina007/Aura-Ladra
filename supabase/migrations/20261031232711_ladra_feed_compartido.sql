-- Publicaciones e historias compartidas; no modifica las tablas de otros sitios.
create table ladra.publicaciones_feed (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('post','historia')),
  texto text not null default '' check (char_length(texto) <= 300),
  ruta_archivo text unique,
  creado_en timestamptz not null default now(),
  revision integer not null default 1,
  edicion_clave uuid not null default gen_random_uuid(),
  check (char_length(btrim(texto)) > 0 or ruta_archivo is not null),
  check (ruta_archivo is null or (ruta_archivo like autor_id::text || '/' || animal_id::text || '/%' and ruta_archivo ~ '\.jpg$'))
);
create index publicaciones_feed_fecha_idx on ladra.publicaciones_feed(creado_en desc);
create index publicaciones_feed_animal_idx on ladra.publicaciones_feed(animal_id);
create index publicaciones_feed_autor_idx on ladra.publicaciones_feed(autor_id);
alter table ladra.publicaciones_feed enable row level security;
alter table ladra.publicaciones_feed force row level security;
create policy feed_leer on ladra.publicaciones_feed for select to anon, authenticated using (
  (tipo = 'post' or creado_en > now() - interval '24 hours') and exists (
    select 1 from ladra.animales a where a.id = animal_id and a.estado = 'publicado' and a.mostrar_en_red
  )
);
create policy feed_crear on ladra.publicaciones_feed for insert to authenticated with check (
  autor_id = (select auth.uid()) and exists (
    select 1 from ladra.animales a where a.id = animal_id and a.creado_por = (select auth.uid()) and a.estado = 'publicado' and a.mostrar_en_red
  )
);
create policy feed_editar on ladra.publicaciones_feed for update to authenticated
using (autor_id = (select auth.uid())) with check (
  autor_id = (select auth.uid()) and exists (
    select 1 from ladra.animales a where a.id = animal_id and a.creado_por = (select auth.uid()) and a.estado = 'publicado' and a.mostrar_en_red
  )
);
create policy feed_eliminar on ladra.publicaciones_feed for delete to authenticated using (autor_id = (select auth.uid()));
create function ladra.feed_incrementar_revision() returns trigger language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end;
$$;
revoke all on function ladra.feed_incrementar_revision() from public, anon, authenticated;
create trigger feed_revision before update on ladra.publicaciones_feed for each row execute function ladra.feed_incrementar_revision();
revoke all on ladra.publicaciones_feed from public, anon, authenticated;
grant select on ladra.publicaciones_feed to anon, authenticated;
grant insert(id, animal_id, tipo, texto, ruta_archivo, edicion_clave), update(texto, ruta_archivo, edicion_clave), delete on ladra.publicaciones_feed to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ladra-feed','ladra-feed',true,5242880,array['image/jpeg']);
create policy ladra_feed_subir on storage.objects for insert to authenticated with check (
  case when bucket_id = 'ladra-feed' then (
    (storage.foldername(name))[1] = (select auth.uid())::text and exists (
      select 1 from ladra.animales a where a.id::text = (storage.foldername(name))[2]
      and a.creado_por = (select auth.uid()) and a.estado = 'publicado' and a.mostrar_en_red
    )
  ) else false end
);
create policy ladra_feed_subir_guard on storage.objects as restrictive for insert to authenticated with check (
  case when bucket_id = 'ladra-feed' then (
    (storage.foldername(name))[1] = (select auth.uid())::text and exists (
      select 1 from ladra.animales a where a.id::text = (storage.foldername(name))[2]
      and a.creado_por = (select auth.uid()) and a.estado = 'publicado' and a.mostrar_en_red
    )
  ) else true end
);
create policy ladra_feed_leer_propio on storage.objects for select to authenticated using (
  case when bucket_id = 'ladra-feed' then (storage.foldername(name))[1] = (select auth.uid())::text else false end
);
create policy ladra_feed_borrar on storage.objects for delete to authenticated using (
  case when bucket_id = 'ladra-feed' then (storage.foldername(name))[1] = (select auth.uid())::text else false end
);
create policy ladra_feed_borrar_guard on storage.objects as restrictive for delete to authenticated using (
  case when bucket_id = 'ladra-feed' then (storage.foldername(name))[1] = (select auth.uid())::text else true end
);
create policy ladra_feed_no_sobrescribir on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'ladra-feed') with check (bucket_id <> 'ladra-feed');
notify pgrst, 'reload schema';

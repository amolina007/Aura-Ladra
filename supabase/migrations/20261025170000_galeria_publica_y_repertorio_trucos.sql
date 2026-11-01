-- Galería pública opcional y videos de trucos para perfiles de mascotas.
create table if not exists ladra.medios_mascota (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'video')),
  titulo text,
  estado text,
  descripcion text,
  ruta_archivo text not null unique,
  creado_en timestamptz not null default now(),
  constraint medios_mascota_datos_validos check (
    (tipo = 'foto' and titulo is null and estado is null and descripcion is null)
    or (tipo = 'video'
      and titulo is not null
      and char_length(btrim(titulo)) between 1 and 80
      and estado is not null
      and estado in ('practicando', 'aprendido')
      and (descripcion is null or char_length(btrim(descripcion)) <= 180))
  ),
  constraint medios_mascota_path_propietario check (
    ruta_archivo like autor_id::text || '/' || animal_id::text || '/%'
  )
);

create index if not exists medios_mascota_animal_tipo_fecha_idx
  on ladra.medios_mascota (animal_id, tipo, creado_en desc);

alter table ladra.medios_mascota enable row level security;
alter table ladra.medios_mascota force row level security;

drop policy if exists medios_mascota_lectura_publica_o_propia on ladra.medios_mascota;
create policy medios_mascota_lectura_publica_o_propia
  on ladra.medios_mascota for select to anon, authenticated
  using (
    autor_id = (select auth.uid())
    or exists (
      select 1 from ladra.animales a
      where a.id = medios_mascota.animal_id
        and a.estado = 'publicado'
        and a.mostrar_en_red
    )
  );

drop policy if exists medios_mascota_insertar_propios on ladra.medios_mascota;
create policy medios_mascota_insertar_propios
  on ladra.medios_mascota for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and exists (
      select 1 from ladra.animales a
      where a.id = medios_mascota.animal_id
        and a.creado_por = (select auth.uid())
        and a.estado = 'publicado'
        and a.mostrar_en_red
    )
  );

drop policy if exists medios_mascota_eliminar_propios on ladra.medios_mascota;
create policy medios_mascota_eliminar_propios
  on ladra.medios_mascota for delete to authenticated
  using (autor_id = (select auth.uid()));

revoke all on ladra.medios_mascota from public, anon, authenticated;
grant select on ladra.medios_mascota to anon, authenticated;
grant insert, delete on ladra.medios_mascota to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mascotas-medios', 'mascotas-medios', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mascotas_medios_insertar_propios on storage.objects;
create policy mascotas_medios_insertar_propios
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mascotas-medios'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from ladra.animales a
      where a.id::text = (storage.foldername(name))[2]
        and a.creado_por = (select auth.uid())
        and a.estado = 'publicado'
        and a.mostrar_en_red
    )
  );

drop policy if exists mascotas_medios_eliminar_propios on storage.objects;
create policy mascotas_medios_eliminar_propios
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'mascotas-medios'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

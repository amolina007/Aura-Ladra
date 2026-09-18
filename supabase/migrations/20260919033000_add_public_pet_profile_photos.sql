-- Public square profile thumbnails. Original pet galleries remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas-publicas', 'mascotas-publicas', true, 1048576, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mascotas_publicas_insert_propias on storage.objects;
create policy mascotas_publicas_insert_propias
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mascotas-publicas'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists mascotas_publicas_delete_propias on storage.objects;
create policy mascotas_publicas_delete_propias
on storage.objects for delete to authenticated
using (
  bucket_id = 'mascotas-publicas'
  and owner_id = (select auth.uid())::text
);

drop function if exists ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]);

create function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
  if p_foto_url is not null and p_foto_url not like 'https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/mascotas-publicas/%' then
    raise exception using errcode = '22023', message = 'La foto de perfil debe provenir del espacio público de mascotas.';
  end if;

  update ladra.animales set
    nombre = btrim(p_nombre), especie = p_especie, biografia = nullif(btrim(p_biografia), ''),
    raza = nullif(btrim(p_raza), ''), tamano = p_tamano, peso_kg = p_peso_kg,
    fecha_nacimiento = p_fecha_nacimiento, sexo = p_sexo,
    color_pelaje = nullif(btrim(p_color_pelaje), ''), estado_registro = p_estado_registro,
    numero_registro = nullif(btrim(p_numero_registro), ''),
    senas_particulares = nullif(btrim(p_senas_particulares), ''),
    foto_urls = coalesce(p_foto_urls, '{}'), foto_url = nullif(btrim(p_foto_url), ''),
    actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text) to authenticated;

notify pgrst, 'reload schema';

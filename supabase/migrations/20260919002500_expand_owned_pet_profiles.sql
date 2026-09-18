-- Ficha privada editable de mascotas y galería pública de fotografías.
alter table ladra.animales
  add column if not exists raza text check (raza is null or char_length(btrim(raza)) <= 80),
  add column if not exists tamano text check (tamano is null or tamano in ('pequeno', 'mediano', 'grande', 'gigante')),
  add column if not exists peso_kg numeric(5,1) check (peso_kg is null or peso_kg between 0.1 and 200),
  add column if not exists fecha_nacimiento date,
  add column if not exists sexo text check (sexo is null or sexo in ('hembra', 'macho', 'desconocido')),
  add column if not exists color_pelaje text check (color_pelaje is null or char_length(btrim(color_pelaje)) <= 100),
  add column if not exists estado_registro text not null default 'no_informado'
    check (estado_registro in ('registrada', 'en_tramite', 'no_registrada', 'no_informado')),
  add column if not exists numero_registro text check (numero_registro is null or char_length(btrim(numero_registro)) <= 80),
  add column if not exists senas_particulares text check (senas_particulares is null or char_length(btrim(senas_particulares)) <= 400),
  add column if not exists foto_urls text[] not null default '{}'
    check (cardinality(foto_urls) <= 6);

drop function if exists ladra.mis_animales();
create function ladra.mis_animales()
returns table (
  id uuid, nombre text, especie text, estado text, estado_seguridad text,
  biografia text, foto_url text, foto_urls text[], raza text, tamano text,
  peso_kg numeric, fecha_nacimiento date, sexo text, color_pelaje text,
  estado_registro text, numero_registro text, senas_particulares text
)
language sql
stable
security invoker
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado, a.estado_seguridad,
    a.biografia, a.foto_url, a.foto_urls, a.raza, a.tamano,
    a.peso_kg, a.fecha_nacimiento, a.sexo, a.color_pelaje,
    a.estado_registro, a.numero_registro, a.senas_particulares
  from ladra.animales a
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;
revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

drop policy if exists animales_edicion_por_creador on ladra.animales;
create policy animales_edicion_por_creador on ladra.animales for update to authenticated
using (creado_por = (select auth.uid()))
with check (creado_por = (select auth.uid()));

grant update (
  nombre, especie, biografia, raza, tamano, peso_kg, fecha_nacimiento, sexo,
  color_pelaje, estado_registro, numero_registro, senas_particulares, foto_urls,
  actualizado_en
) on ladra.animales to authenticated;

create or replace function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[]
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
  update ladra.animales set
    nombre = btrim(p_nombre), especie = p_especie, biografia = nullif(btrim(p_biografia), ''),
    raza = nullif(btrim(p_raza), ''), tamano = p_tamano, peso_kg = p_peso_kg,
    fecha_nacimiento = p_fecha_nacimiento, sexo = p_sexo,
    color_pelaje = nullif(btrim(p_color_pelaje), ''), estado_registro = p_estado_registro,
    numero_registro = nullif(btrim(p_numero_registro), ''),
    senas_particulares = nullif(btrim(p_senas_particulares), ''),
    foto_urls = coalesce(p_foto_urls, '{}'),
    actualizado_en = now()
  where id = p_animal_id and creado_por = auth.uid();
  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;
end;
$$;
revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas', 'mascotas', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mascotas_fotos_insert_propias on storage.objects;
create policy mascotas_fotos_insert_propias on storage.objects for insert to authenticated
with check (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists mascotas_fotos_select_propias on storage.objects;
create policy mascotas_fotos_select_propias on storage.objects for select to authenticated
using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists mascotas_fotos_update_propias on storage.objects;
create policy mascotas_fotos_update_propias on storage.objects for update to authenticated
using (bucket_id = 'mascotas' and owner_id = auth.uid()::text)
with check (bucket_id = 'mascotas' and owner_id = auth.uid()::text);

drop policy if exists mascotas_fotos_delete_propias on storage.objects;
create policy mascotas_fotos_delete_propias on storage.objects for delete to authenticated
using (bucket_id = 'mascotas' and owner_id = auth.uid()::text);

notify pgrst, 'reload schema';

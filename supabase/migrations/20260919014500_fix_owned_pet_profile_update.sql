-- La propiedad se aplica mediante RLS; la función no necesita leer creado_por.
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
    foto_urls = coalesce(p_foto_urls, '{}'), actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]) to authenticated;

notify pgrst, 'reload schema';

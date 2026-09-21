-- Cerrar alertas de pérdida al marcar una ficha conmemorativa
-- sin exigir permisos directos sobre ladra.alertas_mascotas.

create or replace function ladra.ocultar_alertas_activas_de_mi_animal(p_animal_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  if not exists (
    select 1 from ladra.animales a
    where a.id = p_animal_id and a.creado_por = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'No puedes administrar esta mascota.';
  end if;

  update ladra.alertas_mascotas
     set estado = 'oculta'
   where animal_id = p_animal_id
     and estado = 'activa';
end;
$$;

revoke all on function ladra.ocultar_alertas_activas_de_mi_animal(uuid)
  from public, anon, authenticated;
grant execute on function ladra.ocultar_alertas_activas_de_mi_animal(uuid)
  to authenticated;

create or replace function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text, p_mostrar_en_red boolean,
  p_diagnostico_nutricional text, p_bloques_resumen text[], p_salud jsonb,
  p_habilidades jsonb, p_caracter_respuestas jsonb, p_caracter_puntaje smallint,
  p_es_conmemorativa boolean default false, p_fecha_deceso date default null
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
declare
  v_skill text;
  v_key text;
  v_answer numeric;
  v_conmemorativa boolean := coalesce(p_es_conmemorativa, false);
  v_deceso date := p_fecha_deceso;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
  if v_conmemorativa then
    if v_deceso is null then raise exception using errcode = '22023', message = 'Indica la fecha aproximada del deceso.'; end if;
    if v_deceso > current_date then raise exception using errcode = '22023', message = 'La fecha de deceso no puede estar en el futuro.'; end if;
    if p_fecha_nacimiento is not null and v_deceso < p_fecha_nacimiento then
      raise exception using errcode = '22023', message = 'La fecha de deceso no puede ser anterior al nacimiento.';
    end if;
  else
    v_deceso := null;
  end if;
  if p_foto_url is not null and p_foto_url not like 'https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/mascotas-publicas/%' then
    raise exception using errcode = '22023', message = 'La foto de perfil debe provenir del espacio público de mascotas.';
  end if;
  if p_diagnostico_nutricional is not null and char_length(btrim(p_diagnostico_nutricional)) > 120 then
    raise exception using errcode = '22023', message = 'El diagnóstico nutricional es demasiado largo.';
  end if;
  if cardinality(p_bloques_resumen) <> 8
    or (select count(distinct item) from unnest(p_bloques_resumen) item) <> 8
    or not p_bloques_resumen <@ array['especie','raza','tamano','peso','sexo','nacimiento','color','registro','caracter','diagnostico_nutricional','habilidades','estado_seguridad']::text[] then
    raise exception using errcode = '22023', message = 'Selecciona ocho bloques diferentes y permitidos.';
  end if;
  if jsonb_typeof(coalesce(p_salud, '{}'::jsonb)) <> 'object' or pg_column_size(coalesce(p_salud, '{}'::jsonb)) > 12000 then
    raise exception using errcode = '22023', message = 'La ficha de salud no es válida.';
  end if;
  if jsonb_typeof(coalesce(p_habilidades, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_habilidades, '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'Las habilidades no son válidas.';
  end if;
  for v_skill in select jsonb_array_elements_text(coalesce(p_habilidades, '[]'::jsonb)) loop
    if v_skill not in ('reconoce_nombre','contacto_visual','sentarse','dar_patita','echarse','esperar','venir_llamado','soltar','paseo_correa','higiene','socializa') then
      raise exception using errcode = '22023', message = 'La habilidad no está permitida.';
    end if;
  end loop;
  if p_caracter_puntaje is null then
    if coalesce(p_caracter_respuestas, '{}'::jsonb) <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'El cuestionario de carácter está incompleto.';
    end if;
  else
    if p_caracter_puntaje not between 0 and 100 or jsonb_typeof(p_caracter_respuestas) <> 'object' then
      raise exception using errcode = '22023', message = 'El cuestionario de carácter no es válido.';
    end if;
    foreach v_key in array array['personas','animales','manipulacion','recursos','entorno'] loop
      v_answer := (p_caracter_respuestas ->> v_key)::numeric;
      if v_answer is null or v_answer not between 1 and 5 then
        raise exception using errcode = '22023', message = 'Completa las cinco respuestas de carácter.';
      end if;
    end loop;
  end if;

  update ladra.animales set
    nombre = btrim(p_nombre), especie = p_especie, biografia = nullif(btrim(p_biografia), ''),
    raza = nullif(btrim(p_raza), ''), tamano = p_tamano, peso_kg = p_peso_kg,
    fecha_nacimiento = p_fecha_nacimiento, sexo = p_sexo,
    color_pelaje = nullif(btrim(p_color_pelaje), ''), estado_registro = p_estado_registro,
    numero_registro = nullif(btrim(p_numero_registro), ''),
    senas_particulares = nullif(btrim(p_senas_particulares), ''),
    foto_urls = coalesce(p_foto_urls, '{}'), foto_url = nullif(btrim(p_foto_url), ''),
    mostrar_en_red = coalesce(p_mostrar_en_red, false),
    diagnostico_nutricional = nullif(btrim(p_diagnostico_nutricional), ''),
    bloques_resumen = p_bloques_resumen,
    habilidades = coalesce(p_habilidades, '[]'::jsonb),
    caracter_respuestas = coalesce(p_caracter_respuestas, '{}'::jsonb),
    caracter_puntaje = p_caracter_puntaje,
    es_conmemorativa = v_conmemorativa,
    fecha_deceso = v_deceso,
    estado_seguridad = case when v_conmemorativa then 'segura' else estado_seguridad end,
    actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;

  if v_conmemorativa then
    perform ladra.ocultar_alertas_activas_de_mi_animal(p_animal_id);
  end if;

  insert into ladra.fichas_salud_animal (animal_id, datos, actualizado_en)
  values (p_animal_id, coalesce(p_salud, '{}'::jsonb), now())
  on conflict (animal_id) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint,boolean,date) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint,boolean,date) to authenticated;

notify pgrst, 'reload schema';

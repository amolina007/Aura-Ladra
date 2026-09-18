-- Ocho bloques configurables y edición modular de la ficha de mascota.
alter table ladra.animales
  add column if not exists diagnostico_nutricional text
    check (diagnostico_nutricional is null or char_length(btrim(diagnostico_nutricional)) <= 120),
  add column if not exists bloques_resumen text[] not null default array['especie','raza','tamano','peso','sexo','nacimiento','color','registro']::text[];

alter table ladra.animales
  add constraint animales_bloques_resumen_ocho check (
    cardinality(bloques_resumen) = 8
    and bloques_resumen <@ array['especie','raza','tamano','peso','sexo','nacimiento','color','registro','caracter','diagnostico_nutricional','habilidades','estado_seguridad']::text[]
  );

grant update (diagnostico_nutricional, bloques_resumen) on ladra.animales to authenticated;

drop function if exists ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,jsonb,jsonb,jsonb,smallint);

create function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text, p_mostrar_en_red boolean,
  p_diagnostico_nutricional text, p_bloques_resumen text[], p_salud jsonb,
  p_habilidades jsonb, p_caracter_respuestas jsonb, p_caracter_puntaje smallint
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
declare
  v_skill text;
  v_key text;
  v_answer numeric;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
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
    caracter_puntaje = p_caracter_puntaje, actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;

  insert into ladra.fichas_salud_animal (animal_id, datos, actualizado_en)
  values (p_animal_id, coalesce(p_salud, '{}'::jsonb), now())
  on conflict (animal_id) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint) to authenticated;

drop function if exists ladra.mis_animales();
create function ladra.mis_animales()
returns table(
  id uuid, nombre text, especie text, estado text, estado_seguridad text,
  biografia text, foto_url text, foto_urls text[], raza text, tamano text,
  peso_kg numeric, fecha_nacimiento date, sexo text, color_pelaje text,
  estado_registro text, numero_registro text, senas_particulares text,
  mostrar_en_red boolean, salud jsonb, habilidades jsonb,
  caracter_respuestas jsonb, caracter_puntaje smallint,
  diagnostico_nutricional text, bloques_resumen text[]
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado, a.estado_seguridad,
    a.biografia, a.foto_url, a.foto_urls, a.raza, a.tamano,
    a.peso_kg, a.fecha_nacimiento, a.sexo, a.color_pelaje,
    a.estado_registro, a.numero_registro, a.senas_particulares,
    a.mostrar_en_red, coalesce(s.datos, '{}'::jsonb), a.habilidades,
    a.caracter_respuestas, a.caracter_puntaje,
    a.diagnostico_nutricional, a.bloques_resumen
  from ladra.animales a
  left join ladra.fichas_salud_animal s on s.animal_id = a.id
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

notify pgrst, 'reload schema';

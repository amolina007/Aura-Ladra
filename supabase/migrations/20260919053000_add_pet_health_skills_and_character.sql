-- Amplía la ficha animal con salud privada, habilidades públicas y carácter orientativo.
create table if not exists ladra.fichas_salud_animal (
  animal_id uuid primary key references ladra.animales(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  constraint ficha_salud_datos_objeto check (jsonb_typeof(datos) = 'object'),
  constraint ficha_salud_tamano check (pg_column_size(datos) <= 12000)
);

alter table ladra.fichas_salud_animal enable row level security;
grant select, insert, update on ladra.fichas_salud_animal to authenticated;

create policy ficha_salud_lectura_responsable
on ladra.fichas_salud_animal for select to authenticated
using (exists (
  select 1 from ladra.animales a
  where a.id = animal_id and a.creado_por = (select auth.uid())
));

create policy ficha_salud_creacion_responsable
on ladra.fichas_salud_animal for insert to authenticated
with check (exists (
  select 1 from ladra.animales a
  where a.id = animal_id and a.creado_por = (select auth.uid())
));

create policy ficha_salud_edicion_responsable
on ladra.fichas_salud_animal for update to authenticated
using (exists (
  select 1 from ladra.animales a
  where a.id = animal_id and a.creado_por = (select auth.uid())
))
with check (exists (
  select 1 from ladra.animales a
  where a.id = animal_id and a.creado_por = (select auth.uid())
));

alter table ladra.animales
  add column if not exists habilidades jsonb not null default '[]'::jsonb,
  add column if not exists caracter_respuestas jsonb not null default '{}'::jsonb,
  add column if not exists caracter_puntaje smallint,
  add constraint animales_habilidades_array check (jsonb_typeof(habilidades) = 'array' and jsonb_array_length(habilidades) <= 20),
  add constraint animales_caracter_objeto check (jsonb_typeof(caracter_respuestas) = 'object'),
  add constraint animales_caracter_rango check (caracter_puntaje is null or caracter_puntaje between 0 and 100);

grant update (habilidades, caracter_respuestas, caracter_puntaje) on ladra.animales to authenticated;

drop function if exists ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean);

create function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text, p_mostrar_en_red boolean, p_salud jsonb,
  p_habilidades jsonb, p_caracter_respuestas jsonb, p_caracter_puntaje smallint
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
declare
  v_skill text;
  v_answer numeric;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
  if p_foto_url is not null and p_foto_url not like 'https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/mascotas-publicas/%' then
    raise exception using errcode = '22023', message = 'La foto de perfil debe provenir del espacio público de mascotas.';
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
  if jsonb_typeof(coalesce(p_caracter_respuestas, '{}'::jsonb)) <> 'object' or p_caracter_puntaje not between 0 and 100 then
    raise exception using errcode = '22023', message = 'El cuestionario de carácter no es válido.';
  end if;
  foreach v_skill in array array['personas','animales','manipulacion','recursos','entorno'] loop
    v_answer := (p_caracter_respuestas ->> v_skill)::numeric;
    if v_answer is null or v_answer not between 1 and 5 then
      raise exception using errcode = '22023', message = 'Completa las cinco respuestas de carácter.';
    end if;
  end loop;

  update ladra.animales set
    nombre = btrim(p_nombre), especie = p_especie, biografia = nullif(btrim(p_biografia), ''),
    raza = nullif(btrim(p_raza), ''), tamano = p_tamano, peso_kg = p_peso_kg,
    fecha_nacimiento = p_fecha_nacimiento, sexo = p_sexo,
    color_pelaje = nullif(btrim(p_color_pelaje), ''), estado_registro = p_estado_registro,
    numero_registro = nullif(btrim(p_numero_registro), ''),
    senas_particulares = nullif(btrim(p_senas_particulares), ''),
    foto_urls = coalesce(p_foto_urls, '{}'), foto_url = nullif(btrim(p_foto_url), ''),
    mostrar_en_red = coalesce(p_mostrar_en_red, false),
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

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,jsonb,jsonb,jsonb,smallint) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,jsonb,jsonb,jsonb,smallint) to authenticated;

drop function if exists ladra.mis_animales();
create function ladra.mis_animales()
returns table(
  id uuid, nombre text, especie text, estado text, estado_seguridad text,
  biografia text, foto_url text, foto_urls text[], raza text, tamano text,
  peso_kg numeric, fecha_nacimiento date, sexo text, color_pelaje text,
  estado_registro text, numero_registro text, senas_particulares text,
  mostrar_en_red boolean, salud jsonb, habilidades jsonb,
  caracter_respuestas jsonb, caracter_puntaje smallint
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
    a.caracter_respuestas, a.caracter_puntaje
  from ladra.animales a
  left join ladra.fichas_salud_animal s on s.animal_id = a.id
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

notify pgrst, 'reload schema';

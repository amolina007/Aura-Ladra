alter table ladra.animales
  add column if not exists mostrar_en_red boolean not null default true;

grant select on ladra.animales to anon, authenticated;
grant insert, update on ladra.animales to authenticated;

drop policy if exists animales_publicados_lectura on ladra.animales;
create policy animales_publicados_lectura
on ladra.animales for select to anon
using (estado = 'publicado' and mostrar_en_red);

drop policy if exists animales_lectura_autenticada on ladra.animales;
create policy animales_lectura_autenticada
on ladra.animales for select to authenticated
using (
  (estado = 'publicado' and mostrar_en_red)
  or creado_por = (select auth.uid())
  or exists (
    select 1 from ladra.moderadores m
    where m.usuario_id = (select auth.uid())
  )
);

drop function if exists ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text);

create function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text, p_mostrar_en_red boolean
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
    mostrar_en_red = coalesce(p_mostrar_en_red, false), actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean) to authenticated;

drop function if exists ladra.mis_animales();
create function ladra.mis_animales()
returns table(
  id uuid, nombre text, especie text, estado text, estado_seguridad text,
  biografia text, foto_url text, foto_urls text[], raza text, tamano text,
  peso_kg numeric, fecha_nacimiento date, sexo text, color_pelaje text,
  estado_registro text, numero_registro text, senas_particulares text,
  mostrar_en_red boolean
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
    a.mostrar_en_red
  from ladra.animales a
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

create or replace function ladra.conteo_red_animal()
returns table(total_registradas bigint, perfiles_visibles bigint)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select count(*) filter (where estado = 'publicado'),
         count(*) filter (where estado = 'publicado' and mostrar_en_red)
  from ladra.animales;
$$;

revoke all on function ladra.conteo_red_animal() from public, anon, authenticated;
grant execute on function ladra.conteo_red_animal() to anon, authenticated;

notify pgrst, 'reload schema';

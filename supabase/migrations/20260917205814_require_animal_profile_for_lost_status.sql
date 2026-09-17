-- Una mascota solo puede marcarse como extraviada desde una ficha propia de Red animal.

alter table ladra.animales
  add column estado_seguridad text not null default 'segura'
  constraint animales_estado_seguridad_valido
  check (estado_seguridad in ('segura', 'extraviada'));

comment on column ladra.animales.estado_seguridad is
  'Estado operativo administrado por la persona que creó la ficha: segura o extraviada.';

grant select (estado_seguridad) on table ladra.animales to anon, authenticated;

alter table ladra.alertas_mascotas
  add column animal_id uuid references ladra.animales(id) on delete cascade;

-- Conserva registros creados por el flujo anterior, pero deja de mostrarlos
-- porque no pueden probar su vínculo con una ficha animal.
update ladra.alertas_mascotas
set estado = 'oculta', actualizado_en = now()
where animal_id is null and estado = 'activa';

alter table ladra.alertas_mascotas
  add constraint alertas_activas_requieren_ficha
  check (estado <> 'activa' or animal_id is not null);

create unique index alertas_mascotas_una_activa_por_animal_idx
  on ladra.alertas_mascotas (animal_id)
  where estado = 'activa';

grant select (animal_id) on table ladra.alertas_mascotas to anon, authenticated;

drop function if exists ladra.crear_alerta_mascota(
  text, text, text, text, double precision, double precision, timestamptz, text
);

drop function if exists ladra.mis_animales();

create function ladra.mis_animales()
returns table (
  id uuid,
  nombre text,
  especie text,
  estado text,
  estado_seguridad text
)
language sql
stable
security invoker
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado, a.estado_seguridad
  from ladra.animales a
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

create function ladra.cambiar_estado_seguridad_mascota(
  p_animal_id uuid,
  p_estado_seguridad text,
  p_descripcion text default null,
  p_direccion_publica text default null,
  p_latitud double precision default null,
  p_longitud double precision default null,
  p_perdida_en timestamptz default null,
  p_sitio_web text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_animal ladra.animales%rowtype;
  v_alerta_id uuid;
  v_descripcion text := btrim(coalesce(p_descripcion, ''));
  v_direccion text := btrim(coalesce(p_direccion_publica, ''));
begin
  if v_usuario_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión.';
  end if;

  if nullif(btrim(coalesce(p_sitio_web, '')), '') is not null then
    raise exception using errcode = '22023', message = 'Solicitud no válida.';
  end if;

  select a.*
    into v_animal
    from ladra.animales a
   where a.id = p_animal_id
     and a.creado_por = v_usuario_id
     and a.estado in ('pendiente', 'publicado')
   for update;

  if not found then
    raise exception using errcode = '42501', message = 'No puedes administrar esta mascota.';
  end if;

  if p_estado_seguridad = 'segura' then
    update ladra.alertas_mascotas
       set estado = 'reunificada', actualizado_en = now()
     where animal_id = v_animal.id
       and estado = 'activa'
    returning id into v_alerta_id;

    update ladra.animales
       set estado_seguridad = 'segura', actualizado_en = now()
     where id = v_animal.id;

    return v_alerta_id;
  end if;

  if p_estado_seguridad <> 'extraviada' then
    raise exception using errcode = '22023', message = 'Estado de seguridad no válido.';
  end if;

  if char_length(v_descripcion) not between 10 and 350 then
    raise exception using errcode = '22023', message = 'La descripción debe tener entre 10 y 350 caracteres.';
  end if;

  if char_length(v_direccion) not between 5 and 180 then
    raise exception using errcode = '22023', message = 'Selecciona una dirección reconocida por el mapa.';
  end if;

  if p_latitud is null or p_longitud is null
     or p_latitud not between -33.60 and -33.42
     or p_longitud not between -70.86 and -70.64 then
    raise exception using errcode = '22023', message = 'La ubicación debe estar dentro de Maipú.';
  end if;

  if p_perdida_en is null
     or p_perdida_en < now() - interval '30 days'
     or p_perdida_en > now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'La fecha indicada no es válida.';
  end if;

  update ladra.alertas_mascotas
     set estado = 'oculta', actualizado_en = now()
   where animal_id = v_animal.id
     and estado = 'activa';

  insert into ladra.alertas_mascotas (
    animal_id, nombre, especie, descripcion, direccion_publica,
    latitud, longitud, perdida_en, reportante_id
  ) values (
    v_animal.id, v_animal.nombre, v_animal.especie, v_descripcion, v_direccion,
    p_latitud, p_longitud, p_perdida_en, v_usuario_id
  )
  returning id into v_alerta_id;

  update ladra.animales
     set estado_seguridad = 'extraviada', actualizado_en = now()
   where id = v_animal.id;

  return v_alerta_id;
end;
$$;

revoke all on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text
) from public, anon, authenticated;
grant execute on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text
) to authenticated;

update ladra.estado_sistema
set version = '0.6.0', actualizado_en = now()
where id = 'auraladra';

notify pgrst, 'reload schema';

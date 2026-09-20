-- Unifica extravío con Most Wanted: un solo paso. Schema ladra.

create or replace function ladra.cambiar_estado_seguridad_mascota(
  p_animal_id uuid,
  p_estado_seguridad text,
  p_descripcion text default null,
  p_direccion_publica text default null,
  p_latitud double precision default null,
  p_longitud double precision default null,
  p_perdida_en timestamptz default null,
  p_sitio_web text default null,
  p_monto_recompensa numeric default null
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
  v_titulo text;
  v_relato text;
  v_zona text;
  v_monto numeric := nullif(p_monto_recompensa, 0);
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

    if to_regclass('ladra.avisos_most_wanted') is not null then
      update ladra.avisos_most_wanted
         set estado = 'cerrado', actualizado_en = now()
       where animal_id = v_animal.id
         and estado in ('publicado', 'reclamado', 'en_verificacion', 'resuelto');
    end if;

    update ladra.animales
       set estado_seguridad = 'segura', actualizado_en = now()
     where id = v_animal.id;

    return v_alerta_id;
  end if;

  if p_estado_seguridad <> 'extraviada' then
    raise exception using errcode = '22023', message = 'Estado de seguridad no válido.';
  end if;

  if to_regclass('ladra.cuentas_baneadas') is not null
     and exists (select 1 from ladra.cuentas_baneadas b where b.usuario_id = v_usuario_id) then
    raise exception using errcode = '42501', message = 'Esta cuenta no puede publicar avisos.';
  end if;

  if v_animal.es_conmemorativa then
    raise exception using errcode = '22023', message = 'Una ficha conmemorativa no puede marcarse como extraviada.';
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

  if v_monto is not null and v_monto < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
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

  v_titulo := left('Se busca a ' || btrim(v_animal.nombre), 80);
  v_relato := v_descripcion;
  if char_length(v_relato) < 20 then
    v_relato := left(v_descripcion || '. Visto en ' || v_direccion, 800);
  end if;
  v_zona := left(v_direccion, 80);

  if to_regclass('ladra.avisos_most_wanted') is not null
     and not exists (
    select 1 from ladra.avisos_most_wanted a
    where a.animal_id = v_animal.id
      and a.estado in ('publicado', 'reclamado', 'en_verificacion')
  ) then
    insert into ladra.avisos_most_wanted (
      animal_id, dueno_id, modalidad, monto_recompensa, titulo, relato, zona_publica, foto_path
    ) values (
      v_animal.id, v_usuario_id,
      case when v_monto is not null then 'recompensa' else 'buena_voluntad' end,
      v_monto,
      v_titulo,
      v_relato,
      v_zona,
      nullif(v_animal.foto_url, '')
    );
    insert into ladra.acciones_actividad (usuario_id, tipo) values (v_usuario_id, 'publicar_aviso');
  end if;

  return v_alerta_id;
end;
$$;

revoke all on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text
) from public, anon, authenticated;
revoke all on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text, numeric
) from public, anon, authenticated;
grant execute on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text, numeric
) to authenticated;

create or replace function ladra.migrar_aviso_a_recompensa(p_aviso_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_aviso ladra.avisos_most_wanted;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if coalesce(p_monto, 0) < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;

  select * into v_aviso
  from ladra.avisos_most_wanted
  where id = p_aviso_id
    and dueno_id = (select auth.uid());

  if v_aviso.id is null then
    raise exception using errcode = '42501', message = 'No puedes editar este aviso.';
  end if;
  if v_aviso.estado not in ('publicado', 'reclamado', 'en_verificacion') then
    raise exception using errcode = '22023', message = 'Este aviso ya no admite cambios de recompensa.';
  end if;
  if v_aviso.modalidad = 'recompensa' and p_monto <= coalesce(v_aviso.monto_recompensa, 0) then
    raise exception using errcode = '22023', message = 'Solo puedes aumentar el monto. Bajarlo o quitarlo no está disponible en este flujo.';
  end if;

  update ladra.avisos_most_wanted
    set modalidad = 'recompensa', monto_recompensa = p_monto, actualizado_en = now()
  where id = p_aviso_id;
end;
$$;

revoke all on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) to service_role;

notify pgrst, 'reload schema';

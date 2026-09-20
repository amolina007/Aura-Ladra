-- Baja el afiche cuando la mascota vuelve a casa. Schema ladra.

create or replace function ladra.retirar_avisos_most_wanted_de_mi_animal(p_animal_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_n integer := 0;
begin
  if v_me is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if not exists (
    select 1 from ladra.animales a
    where a.id = p_animal_id and a.creado_por = v_me
  ) then
    raise exception using errcode = '42501', message = 'No puedes retirar avisos de esta mascota.';
  end if;

  update ladra.reclamos_most_wanted r
     set estado = 'caducado'
   from ladra.avisos_most_wanted a
  where a.id = r.aviso_id
    and a.animal_id = p_animal_id
    and a.dueno_id = v_me
    and r.estado in ('en_cola', 'activo');

  update ladra.avisos_most_wanted
     set estado = 'cerrado', actualizado_en = now()
   where animal_id = p_animal_id
     and dueno_id = v_me
     and estado in ('publicado', 'reclamado', 'en_verificacion', 'resuelto');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function ladra.retirar_avisos_most_wanted_de_mi_animal(uuid) from public, anon, authenticated;
grant execute on function ladra.retirar_avisos_most_wanted_de_mi_animal(uuid) to authenticated;

create or replace function ladra.resolver_reclamo_most_wanted(p_reclamo_id uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_rec ladra.reclamos_most_wanted;
  v_aviso ladra.avisos_most_wanted;
  v_cfg ladra.configuracion_most_wanted;
  v_dueno_activo boolean;
  v_enc_activo boolean;
  v_reparto numeric;
  v_bono numeric := 0;
  v_bv bigint;
  v_ingreso numeric;
  v_fondo numeric;
  v_siguiente uuid;
begin
  if v_me is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  select * into v_rec from ladra.reclamos_most_wanted where id = p_reclamo_id;
  select * into v_aviso from ladra.avisos_most_wanted where id = v_rec.aviso_id;
  select * into v_cfg from ladra.configuracion_most_wanted where id = 'piloto';
  if v_aviso.dueno_id is distinct from v_me
     and not exists (select 1 from ladra.moderadores m where m.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Solo el responsable o un moderador puede resolver.';
  end if;
  if v_rec.estado is distinct from 'activo' then
    raise exception using errcode = '22023', message = 'Este reclamo ya no está activo.';
  end if;

  if not p_aceptar then
    update ladra.reclamos_most_wanted set estado = 'rechazado' where id = v_rec.id;
    select r.id into v_siguiente
    from ladra.reclamos_most_wanted r
    where r.aviso_id = v_aviso.id and r.estado = 'en_cola'
    order by r.creado_en
    limit 1;
    if v_siguiente is not null then
      update ladra.reclamos_most_wanted set estado = 'activo', activado_en = now() where id = v_siguiente;
      update ladra.avisos_most_wanted set estado = 'reclamado', actualizado_en = now() where id = v_aviso.id;
    else
      update ladra.avisos_most_wanted set estado = 'publicado', actualizado_en = now() where id = v_aviso.id;
    end if;
    return;
  end if;

  update ladra.reclamos_most_wanted set estado = 'verificado' where id = v_rec.id;

  if v_aviso.modalidad = 'buena_voluntad' then
    if v_rec.reclamante_id is not null then
      insert into ladra.reconocimientos_buena_voluntad (usuario_id, aviso_id)
      values (v_rec.reclamante_id, v_aviso.id)
      on conflict (aviso_id) do nothing;
    end if;
    update ladra.avisos_most_wanted
      set estado = 'cerrado', resultado = 'reconocido', actualizado_en = now()
      where id = v_aviso.id;
  else
    v_dueno_activo := ladra.usuario_esta_activo(v_aviso.dueno_id);
    if v_rec.sin_cuenta or v_rec.reclamante_id is null then
      v_reparto := v_cfg.reparto_encontrador_sin_cuenta;
    else
      v_enc_activo := ladra.usuario_esta_activo(v_rec.reclamante_id);
      v_reparto := case when v_enc_activo then v_cfg.reparto_encontrador_activo else v_cfg.reparto_encontrador_inactivo end;
      select count(*) into v_bv from ladra.reconocimientos_buena_voluntad where usuario_id = v_rec.reclamante_id;
      if v_bv >= v_cfg.umbral_bono_buena_voluntad then
        v_bono := least(v_cfg.tope_bono_reparto_pp / 100.0, 1 - v_reparto);
        v_reparto := v_reparto + v_bono;
      end if;
    end if;

    v_ingreso := round(v_aviso.monto_recompensa * (1 - v_reparto), 0);
    v_fondo := round(v_ingreso * v_cfg.fraccion_fondo_altruismo, 0);
    insert into ladra.fondo_altruismo_movimientos (aviso_id, monto, detalle)
    values (v_aviso.id, v_fondo, '10% del ingreso neto del aviso, reinvertido en el canil Parque 3 Poniente.');

    update ladra.avisos_most_wanted
      set estado = 'cerrado', resultado = 'pago_pendiente_liberar', actualizado_en = now()
      where id = v_aviso.id;
  end if;

  update ladra.alertas_mascotas
     set estado = 'reunificada', actualizado_en = now()
   where animal_id = v_aviso.animal_id
     and estado = 'activa';

  update ladra.animales
     set estado_seguridad = 'segura', actualizado_en = now()
   where id = v_aviso.animal_id;
end;
$$;

notify pgrst, 'reload schema';

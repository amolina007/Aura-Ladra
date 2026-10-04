-- Ayudar → Acciones por financiar (parte 2: funciones del servidor).
-- Los montos, estados y permisos se validan aquí. El navegador solo llama funciones.
-- Mientras modo_pago sea 'simulacion', un aporte NO mueve dinero y se marca como simulado.

-- Pasa a 'expirada' las acciones cuya fecha límite ya pasó sin completar la meta.
-- No se cambia el destino de los aportes: quedan con devolución pendiente.
create or replace function ladra.acciones_actualizar_vencimientos()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_n integer;
begin
  with vencidas as (
    update ladra.acciones_financiables a
       set estado = 'expirada',
           estado_devolucion = case when a.recaudado_clp > 0 then 'pendiente' else 'no_aplica' end
     where a.estado = 'recaudando' and a.fecha_limite <= now()
     returning 1
  )
  select count(*) into v_n from vencidas;
  return v_n;
end;
$$;

-- Crea un borrador. Las partidas llegan como json: [{"concepto","tipo","monto_clp"}].
-- La meta se calcula en el servidor sumando las partidas.
create or replace function ladra.crear_accion(
  p_titulo text,
  p_descripcion text,
  p_categoria text,
  p_comuna text,
  p_urgencia text,
  p_animal_id uuid,
  p_incluye text[],
  p_no_incluye text[],
  p_condiciones_cancelacion text,
  p_condiciones_devolucion text,
  p_fecha_limite timestamptz,
  p_plazo_ejecucion_dias integer,
  p_disponibilidad text,
  p_partidas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_total integer;
  v_item jsonb;
  v_orden smallint := 0;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if p_fecha_limite is null or p_fecha_limite <= now() + interval '1 day'
     or p_fecha_limite > now() + interval '120 days' then
    raise exception 'FECHA_LIMITE_INVALIDA: debe estar entre 1 y 120 días desde hoy.' using errcode = 'P0001';
  end if;
  if p_partidas is null or jsonb_typeof(p_partidas) <> 'array' or jsonb_array_length(p_partidas) not between 1 and 15 then
    raise exception 'PRESUPUESTO_INVALIDO: agrega entre 1 y 15 partidas.' using errcode = 'P0001';
  end if;
  if p_animal_id is not null and not exists (
       select 1 from ladra.animales an where an.id = p_animal_id and an.estado = 'publicado') then
    raise exception 'ANIMAL_INVALIDO: la ficha no existe o aún no es pública.' using errcode = 'P0001';
  end if;

  select coalesce(sum((e->>'monto_clp')::integer), 0) into v_total
  from jsonb_array_elements(p_partidas) e;
  if v_total < 1000 or v_total > 5000000 then
    raise exception 'META_INVALIDA: la meta debe estar entre $1.000 y $5.000.000.' using errcode = 'P0001';
  end if;

  insert into ladra.acciones_financiables (
    responsable_id, animal_id, titulo, descripcion, categoria, comuna, urgencia,
    incluye, no_incluye, condiciones_cancelacion, condiciones_devolucion,
    meta_clp, fecha_limite, plazo_ejecucion_dias, disponibilidad_prestador
  ) values (
    v_uid, p_animal_id, btrim(p_titulo), btrim(p_descripcion), p_categoria, btrim(p_comuna),
    coalesce(p_urgencia, 'normal'), coalesce(p_incluye, '{}'), coalesce(p_no_incluye, '{}'),
    btrim(p_condiciones_cancelacion), btrim(p_condiciones_devolucion),
    v_total, p_fecha_limite, coalesce(p_plazo_ejecucion_dias, 7), nullif(btrim(p_disponibilidad), '')
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_partidas) loop
    insert into ladra.acciones_partidas (accion_id, concepto, tipo, monto_clp, orden)
    values (v_id, v_item->>'concepto', coalesce(v_item->>'tipo', 'prestacion'),
            (v_item->>'monto_clp')::integer, v_orden);
    v_orden := v_orden + 1;
  end loop;

  insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
  values (v_id, v_uid, 'estado', null, 'borrador');
  return v_id;
end;
$$;

create or replace function ladra.enviar_accion_a_revision(p_accion_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update ladra.acciones_financiables
     set estado = 'en_revision'
   where id = p_accion_id and responsable_id = v_uid and estado = 'borrador';
  if not found then
    raise exception 'TRANSICION_INVALIDA: solo el responsable puede enviar un borrador a revisión.' using errcode = 'P0001';
  end if;
end;
$$;

-- Moderación: aprueba (pasa a 'recaudando') o devuelve a borrador con la fecha límite vigente.
create or replace function ladra.moderar_accion(p_accion_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid) then
    raise exception 'PERMISO_DENEGADO' using errcode = '42501';
  end if;
  if p_aprobar then
    update ladra.acciones_financiables
       set estado = 'recaudando'
     where id = p_accion_id and estado = 'en_revision' and fecha_limite > now() + interval '1 hour';
  else
    update ladra.acciones_financiables
       set estado = 'borrador'
     where id = p_accion_id and estado = 'en_revision';
  end if;
  if not found then
    raise exception 'TRANSICION_INVALIDA: la acción no está en revisión o su fecha límite ya no es válida.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function ladra.marcar_verificacion_responsable(p_accion_id uuid, p_verificacion text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid) then
    raise exception 'PERMISO_DENEGADO' using errcode = '42501';
  end if;
  if p_verificacion not in ('sin_verificar', 'en_revision', 'verificado') then
    raise exception 'VERIFICACION_INVALIDA' using errcode = 'P0001';
  end if;
  update ladra.acciones_financiables set verificacion = p_verificacion where id = p_accion_id;
  if not found then
    raise exception 'NO_ENCONTRADA' using errcode = 'P0002';
  end if;
end;
$$;

-- Aporte SIMULADO. Bloquea la fila para que dos aportes simultáneos no excedan la meta,
-- y usa una clave de idempotencia para que un doble toque no duplique el aporte.
create or replace function ladra.aportar_simulado(
  p_accion_id uuid,
  p_monto_clp integer,
  p_clave_idempotencia text
)
returns table (aporte_id uuid, repetido boolean, recaudado_clp integer, meta_clp integer, estado text)
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_accion ladra.acciones_financiables%rowtype;
  v_previo ladra.acciones_aportes%rowtype;
  v_nuevo uuid;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if p_clave_idempotencia is null or char_length(p_clave_idempotencia) < 8 then
    raise exception 'CLAVE_INVALIDA' using errcode = 'P0001';
  end if;

  perform ladra.acciones_actualizar_vencimientos();

  select * into v_accion from ladra.acciones_financiables where id = p_accion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  -- Un reintento con la misma clave devuelve el aporte original sin duplicarlo.
  select * into v_previo from ladra.acciones_aportes
   where aportante_id = v_uid and clave_idempotencia = p_clave_idempotencia;
  if found then
    return query select v_previo.id, true, v_accion.recaudado_clp, v_accion.meta_clp, v_accion.estado;
    return;
  end if;

  if v_accion.estado <> 'recaudando' then
    raise exception 'ACCION_NO_RECAUDANDO: esta acción ya no recibe aportes.' using errcode = 'P0001';
  end if;
  if v_accion.responsable_id = v_uid then
    raise exception 'APORTE_PROPIO: el responsable no puede aportar a su propia acción.' using errcode = 'P0001';
  end if;
  if p_monto_clp is null or p_monto_clp < 1000 then
    raise exception 'MONTO_INVALIDO: el aporte mínimo es $1.000.' using errcode = 'P0001';
  end if;
  if p_monto_clp > v_accion.meta_clp - v_accion.recaudado_clp then
    raise exception 'EXCEDE_META: faltan %.', (v_accion.meta_clp - v_accion.recaudado_clp) using errcode = 'P0001';
  end if;

  insert into ladra.acciones_aportes (accion_id, aportante_id, monto_clp, clave_idempotencia)
  values (p_accion_id, v_uid, p_monto_clp, p_clave_idempotencia)
  returning id into v_nuevo;

  update ladra.acciones_financiables a
     set recaudado_clp = a.recaudado_clp + p_monto_clp,
         estado = case when a.recaudado_clp + p_monto_clp = a.meta_clp then 'meta_alcanzada' else a.estado end
   where a.id = p_accion_id
   returning * into v_accion;

  return query select v_nuevo, false, v_accion.recaudado_clp, v_accion.meta_clp, v_accion.estado;
end;
$$;

-- Cancelación: solo antes de ejecutarse. Si hubo aportes, la devolución queda pendiente.
create or replace function ladra.cancelar_accion(p_accion_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_es_mod boolean := exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid);
begin
  update ladra.acciones_financiables a
     set estado = 'cancelada',
         estado_devolucion = case when a.recaudado_clp > 0 then 'pendiente' else 'no_aplica' end,
         motivo_cancelacion = left(nullif(btrim(p_motivo), ''), 400)
   where a.id = p_accion_id
     and (a.responsable_id = v_uid or v_es_mod)
     and a.estado in ('borrador', 'en_revision', 'recaudando', 'meta_alcanzada', 'programada');
  if not found then
    raise exception 'TRANSICION_INVALIDA: no tienes permiso o la acción ya no se puede cancelar. Si ya empezó, abre una disputa.' using errcode = 'P0001';
  end if;
end;
$$;

-- Ejecución: el responsable confirma fechas y registra avances; la meta sola no basta.
create or replace function ladra.programar_accion(p_accion_id uuid, p_fecha_ejecucion timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  update ladra.acciones_financiables
     set estado = 'programada', fecha_ejecucion = p_fecha_ejecucion
   where id = p_accion_id and responsable_id = (select auth.uid())
     and estado = 'meta_alcanzada' and p_fecha_ejecucion > now();
  if not found then
    raise exception 'TRANSICION_INVALIDA: la meta debe estar alcanzada y la fecha debe ser futura.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function ladra.iniciar_ejecucion_accion(p_accion_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  update ladra.acciones_financiables
     set estado = 'en_ejecucion'
   where id = p_accion_id and responsable_id = (select auth.uid()) and estado = 'programada';
  if not found then
    raise exception 'TRANSICION_INVALIDA: la acción debe estar programada.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function ladra.publicar_avance_accion(
  p_accion_id uuid, p_tipo text, p_texto text, p_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not exists (
    select 1 from ladra.acciones_financiables a
     where a.id = p_accion_id and a.responsable_id = v_uid
       and a.estado in ('programada', 'en_ejecucion', 'completada')) then
    raise exception 'TRANSICION_INVALIDA: solo el responsable puede publicar avances de una acción programada o en ejecución.' using errcode = 'P0001';
  end if;
  insert into ladra.acciones_actualizaciones (accion_id, autor_id, tipo, texto, url)
  values (p_accion_id, v_uid, p_tipo, btrim(p_texto), nullif(btrim(p_url), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Cierre: exige al menos una evidencia publicada. El desembolso sigue 'no_liberado'.
create or replace function ladra.solicitar_cierre_accion(p_accion_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if not exists (select 1 from ladra.acciones_actualizaciones u
                  where u.accion_id = p_accion_id and u.tipo = 'evidencia') then
    raise exception 'EVIDENCIA_REQUERIDA: publica al menos una evidencia antes de solicitar el cierre.' using errcode = 'P0001';
  end if;
  update ladra.acciones_financiables
     set estado = 'completada', cierre_solicitado_en = now()
   where id = p_accion_id and responsable_id = (select auth.uid()) and estado = 'en_ejecucion';
  if not found then
    raise exception 'TRANSICION_INVALIDA: la acción debe estar en ejecución.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas. Solo se publican datos autorizados: nunca contacto ni datos de pago.
-- ---------------------------------------------------------------------------
create or replace function ladra.acciones_publicas(
  p_categoria text default null,
  p_comuna text default null,
  p_urgencia text default null,
  p_estado text default null
)
returns table (
  id uuid, titulo text, descripcion text, categoria text, comuna text, urgencia text,
  estado text, meta_clp integer, recaudado_clp integer, fecha_limite timestamptz,
  verificacion text, modo_pago text, animal_id uuid, animal_nombre text,
  responsable_alias text, creado_en timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  perform ladra.acciones_actualizar_vencimientos();
  return query
  select a.id, a.titulo, a.descripcion, a.categoria, a.comuna, a.urgencia, a.estado,
         a.meta_clp, a.recaudado_clp, a.fecha_limite, a.verificacion, a.modo_pago,
         a.animal_id, an.nombre,
         coalesce(pp.alias, 'Responsable sin alias'), a.creado_en
    from ladra.acciones_financiables a
    left join ladra.animales an on an.id = a.animal_id and an.estado = 'publicado'
    left join ladra.perfiles_publicos pp on pp.usuario_id = a.responsable_id and pp.estado = 'publicado'
   where a.estado in ('recaudando', 'meta_alcanzada', 'programada', 'en_ejecucion', 'completada')
     and (p_categoria is null or a.categoria = p_categoria)
     and (p_comuna is null or a.comuna ilike p_comuna)
     and (p_urgencia is null or a.urgencia = p_urgencia)
     and (p_estado is null or a.estado = p_estado)
   order by case a.urgencia when 'critica' then 0 when 'alta' then 1 else 2 end,
            a.fecha_limite asc
   limit 100;
end;
$$;

-- Ficha completa. Las acciones no públicas solo las ve su responsable, un aportante o moderación.
create or replace function ladra.accion_detalle(p_accion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a ladra.acciones_financiables%rowtype;
  v_visible boolean;
begin
  perform ladra.acciones_actualizar_vencimientos();
  select * into v_a from ladra.acciones_financiables where id = p_accion_id;
  if not found then
    return null;
  end if;

  v_visible := v_a.estado in ('recaudando', 'meta_alcanzada', 'programada', 'en_ejecucion', 'completada')
    or (v_uid is not null and (
         v_a.responsable_id = v_uid
         or exists (select 1 from ladra.acciones_aportes p where p.accion_id = v_a.id and p.aportante_id = v_uid)
         or exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid)));
  if not v_visible then
    return null;
  end if;

  return jsonb_build_object(
    'accion', jsonb_build_object(
      'id', v_a.id, 'titulo', v_a.titulo, 'descripcion', v_a.descripcion, 'categoria', v_a.categoria,
      'comuna', v_a.comuna, 'urgencia', v_a.urgencia, 'estado', v_a.estado,
      'estado_devolucion', v_a.estado_devolucion, 'verificacion', v_a.verificacion,
      'incluye', v_a.incluye, 'no_incluye', v_a.no_incluye,
      'condiciones_cancelacion', v_a.condiciones_cancelacion,
      'condiciones_devolucion', v_a.condiciones_devolucion,
      'meta_clp', v_a.meta_clp, 'recaudado_clp', v_a.recaudado_clp,
      'faltante_clp', v_a.meta_clp - v_a.recaudado_clp,
      'fecha_limite', v_a.fecha_limite, 'plazo_ejecucion_dias', v_a.plazo_ejecucion_dias,
      'fecha_ejecucion', v_a.fecha_ejecucion, 'disponibilidad_prestador', v_a.disponibilidad_prestador,
      'desembolso', v_a.desembolso, 'modo_pago', v_a.modo_pago,
      'motivo_cancelacion', v_a.motivo_cancelacion,
      'responsable_alias', coalesce(
        (select pp.alias from ladra.perfiles_publicos pp
          where pp.usuario_id = v_a.responsable_id and pp.estado = 'publicado'), 'Responsable sin alias'),
      'animal', (select jsonb_build_object('id', an.id, 'nombre', an.nombre, 'slug', an.slug, 'foto_url', an.foto_url)
                   from ladra.animales an where an.id = v_a.animal_id and an.estado = 'publicado')
    ),
    'partidas', coalesce((select jsonb_agg(jsonb_build_object('concepto', p.concepto, 'tipo', p.tipo, 'monto_clp', p.monto_clp) order by p.orden)
                            from ladra.acciones_partidas p where p.accion_id = v_a.id), '[]'::jsonb),
    'actualizaciones', coalesce((select jsonb_agg(jsonb_build_object('tipo', u.tipo, 'texto', u.texto, 'url', u.url, 'creado_en', u.creado_en) order by u.creado_en desc)
                                   from ladra.acciones_actualizaciones u where u.accion_id = v_a.id), '[]'::jsonb),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('campo', h.campo, 'anterior', h.valor_anterior, 'nuevo', h.valor_nuevo, 'creado_en', h.creado_en) order by h.id desc)
                             from ladra.acciones_historial h where h.accion_id = v_a.id), '[]'::jsonb),
    'es_responsable', (v_uid is not null and v_a.responsable_id = v_uid)
  );
end;
$$;

create or replace function ladra.mis_aportes()
returns table (
  aporte_id uuid, accion_id uuid, accion_titulo text, accion_estado text,
  estado_devolucion text, monto_clp integer, estado text, simulado boolean, creado_en timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  perform ladra.acciones_actualizar_vencimientos();
  return query
  select p.id, a.id, a.titulo, a.estado, a.estado_devolucion, p.monto_clp, p.estado, p.simulado, p.creado_en
    from ladra.acciones_aportes p
    join ladra.acciones_financiables a on a.id = p.accion_id
   where p.aportante_id = (select auth.uid())
   order by p.creado_en desc
   limit 100;
end;
$$;

create or replace function ladra.mis_acciones()
returns table (
  id uuid, titulo text, categoria text, estado text, estado_devolucion text,
  meta_clp integer, recaudado_clp integer, fecha_limite timestamptz, verificacion text, creado_en timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  perform ladra.acciones_actualizar_vencimientos();
  return query
  select a.id, a.titulo, a.categoria, a.estado, a.estado_devolucion, a.meta_clp,
         a.recaudado_clp, a.fecha_limite, a.verificacion, a.creado_en
    from ladra.acciones_financiables a
   where a.responsable_id = (select auth.uid())
   order by a.creado_en desc
   limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución: nada para public; lectura pública, resto solo con sesión.
-- ---------------------------------------------------------------------------
revoke all on function ladra.acciones_actualizar_vencimientos() from public, anon, authenticated;
revoke all on function ladra.crear_accion(text, text, text, text, text, uuid, text[], text[], text, text, timestamptz, integer, text, jsonb) from public, anon, authenticated;
revoke all on function ladra.enviar_accion_a_revision(uuid) from public, anon, authenticated;
revoke all on function ladra.moderar_accion(uuid, boolean) from public, anon, authenticated;
revoke all on function ladra.marcar_verificacion_responsable(uuid, text) from public, anon, authenticated;
revoke all on function ladra.aportar_simulado(uuid, integer, text) from public, anon, authenticated;
revoke all on function ladra.cancelar_accion(uuid, text) from public, anon, authenticated;
revoke all on function ladra.programar_accion(uuid, timestamptz) from public, anon, authenticated;
revoke all on function ladra.iniciar_ejecucion_accion(uuid) from public, anon, authenticated;
revoke all on function ladra.publicar_avance_accion(uuid, text, text, text) from public, anon, authenticated;
revoke all on function ladra.solicitar_cierre_accion(uuid) from public, anon, authenticated;
revoke all on function ladra.acciones_publicas(text, text, text, text) from public, anon, authenticated;
revoke all on function ladra.accion_detalle(uuid) from public, anon, authenticated;
revoke all on function ladra.mis_aportes() from public, anon, authenticated;
revoke all on function ladra.mis_acciones() from public, anon, authenticated;

grant execute on function ladra.acciones_publicas(text, text, text, text) to anon, authenticated;
grant execute on function ladra.accion_detalle(uuid) to anon, authenticated;
grant execute on function ladra.crear_accion(text, text, text, text, text, uuid, text[], text[], text, text, timestamptz, integer, text, jsonb) to authenticated;
grant execute on function ladra.enviar_accion_a_revision(uuid) to authenticated;
grant execute on function ladra.moderar_accion(uuid, boolean) to authenticated;
grant execute on function ladra.marcar_verificacion_responsable(uuid, text) to authenticated;
grant execute on function ladra.aportar_simulado(uuid, integer, text) to authenticated;
grant execute on function ladra.cancelar_accion(uuid, text) to authenticated;
grant execute on function ladra.programar_accion(uuid, timestamptz) to authenticated;
grant execute on function ladra.iniciar_ejecucion_accion(uuid) to authenticated;
grant execute on function ladra.publicar_avance_accion(uuid, text, text, text) to authenticated;
grant execute on function ladra.solicitar_cierre_accion(uuid) to authenticated;
grant execute on function ladra.mis_aportes() to authenticated;
grant execute on function ladra.mis_acciones() to authenticated;

notify pgrst, 'reload schema';

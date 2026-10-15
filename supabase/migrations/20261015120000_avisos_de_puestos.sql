-- Comida y agua → Avisos de puestos (tablas, reglas de integridad, seguridad y funciones).
-- Solo schema ladra. Un aviso es la PROPUESTA de un puesto de agua y alimento hecha por una persona con
-- cuenta: qué se pide, para qué, cuánto tiempo toma habilitarlo y qué se compromete a documentar.
-- Un moderador lo revisa antes de que se vea en el sitio.
--
-- Este archivo NO mueve Auracoins ni dinero. Las reglas de Aura Coins (a dónde van, cómo se entregan por
-- hitos, cómo se devuelven) están sin definir y por eso solo se guardan como lo que la persona PIDE
-- (costo_mensual_ac, costo_habilitacion_ac) y como su propuesta de devolución. La columna
-- movimiento_ac vale siempre 'ninguno' y debe cambiarse a propósito cuando exista la definición vigente.
--
-- Pendiente (no incluido): editar un aviso, registrar avances (fabricación, instalación, recargas),
-- fotos de evidencia (falta almacenamiento privado) y cualquier movimiento real de Auracoins.

create table ladra.avisos_puestos (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references auth.users(id) on delete restrict,
  titulo text not null check (char_length(btrim(titulo)) between 8 and 90),
  descripcion text not null check (char_length(btrim(descripcion)) between 20 and 600),
  tipo text not null check (tipo in ('agua', 'comida', 'ambos')),
  comuna text not null check (char_length(btrim(comuna)) between 2 and 60),
  direccion_publica text not null check (char_length(btrim(direccion_publica)) between 5 and 140),
  latitud numeric(9, 6) check (latitud between -90 and 90),
  longitud numeric(9, 6) check (longitud between -180 and 180),
  precision_ubicacion text not null default 'aproximada' check (precision_ubicacion in ('aproximada', 'exacta')),
  -- Para qué se piden los fondos y qué cubren.
  para_que text not null check (char_length(btrim(para_que)) between 20 and 400),
  incluye text[] not null check (coalesce(array_length(incluye, 1), 0) between 1 and 8),
  -- Qué quedará documentado (fabricación, posicionamiento, recargas, mantención).
  documentacion text[] not null check (coalesce(array_length(documentacion, 1), 0) between 1 and 8),
  costo_mensual_ac integer not null check (costo_mensual_ac between 1 and 100000),
  costo_habilitacion_ac integer check (costo_habilitacion_ac is null or costo_habilitacion_ac between 0 and 1000000),
  plazo_habilitacion_dias integer not null check (plazo_habilitacion_dias between 1 and 180),
  permiso_estado text not null default 'sin_consultar'
    check (permiso_estado in ('sin_consultar', 'en_tramite', 'confirmado')),
  condiciones_devolucion text not null check (char_length(btrim(condiciones_devolucion)) between 10 and 600),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en_revision', 'publicado', 'rechazado', 'retirado')),
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 400),
  moderado_por uuid references auth.users(id) on delete set null,
  moderado_en timestamptz,
  -- Mientras no exista la definición de Aura Coins, ningún aviso mueve Auracoins.
  movimiento_ac text not null default 'ninguno' check (movimiento_ac = 'ninguno'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint avisos_puestos_ubicacion_completa check ((latitud is null) = (longitud is null))
);

comment on table ladra.avisos_puestos is
  'Propuestas de puestos de agua y alimento hechas por personas con cuenta, con moderación previa. No mueven Auracoins ni dinero.';
comment on column ladra.avisos_puestos.costo_mensual_ac is
  'Lo que la persona PIDE por mes (en Auracoins) para sostener el puesto. Es una solicitud: no se recauda ni se guarda nada.';
comment on column ladra.avisos_puestos.movimiento_ac is
  'Siempre ninguno hasta que exista la definición vigente de Aura Coins.';

create index avisos_puestos_estado_idx on ladra.avisos_puestos (estado, comuna);
create index avisos_puestos_autor_idx on ladra.avisos_puestos (autor_id, creado_en desc);

-- Mientras un aviso está en revisión o publicado, su contenido no se puede cambiar:
-- la persona que modera aprueba exactamente lo que vio. Solo cambian los campos de control.
create or replace function ladra.avisos_puestos_proteger()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
begin
  if old.estado in ('en_revision', 'publicado') and
     (to_jsonb(new) - 'estado' - 'motivo_rechazo' - 'moderado_por' - 'moderado_en' - 'actualizado_en')
       is distinct from
     (to_jsonb(old) - 'estado' - 'motivo_rechazo' - 'moderado_por' - 'moderado_en' - 'actualizado_en') then
    raise exception 'AVISO_BLOQUEADO: un aviso en revisión o publicado no se puede modificar.'
      using errcode = 'P0001';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger avisos_puestos_proteger
  before update on ladra.avisos_puestos
  for each row execute function ladra.avisos_puestos_proteger();

-- ---------------------------------------------------------------------------
-- Seguridad: nadie lee ni escribe la tabla directamente desde el navegador.
-- Todo pasa por las funciones de abajo, que validan sesión, rol, estado y datos.
-- ---------------------------------------------------------------------------
alter table ladra.avisos_puestos enable row level security;
alter table ladra.avisos_puestos force row level security;
revoke all on ladra.avisos_puestos from public, anon, authenticated;
grant all on ladra.avisos_puestos to service_role;

-- Crea un borrador. Máximo 3 avisos sin cerrar por persona (borrador o en revisión), para evitar spam.
create or replace function ladra.crear_aviso_puesto(
  p_titulo text,
  p_descripcion text,
  p_tipo text,
  p_comuna text,
  p_direccion_publica text,
  p_latitud numeric,
  p_longitud numeric,
  p_para_que text,
  p_incluye text[],
  p_documentacion text[],
  p_costo_mensual_ac integer,
  p_costo_habilitacion_ac integer,
  p_plazo_habilitacion_dias integer,
  p_permiso_estado text,
  p_condiciones_devolucion text
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
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if (select count(*) from ladra.avisos_puestos
       where autor_id = v_uid and estado in ('borrador', 'en_revision')) >= 3 then
    raise exception 'LIMITE_AVISOS: ya tienes 3 avisos sin cerrar. Envía, retira o espera la revisión de alguno.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_incluye, '{}')) x where char_length(btrim(x)) not between 3 and 90)
     or exists (select 1 from unnest(coalesce(p_documentacion, '{}')) x where char_length(btrim(x)) not between 3 and 90) then
    raise exception 'LISTA_INVALIDA: cada elemento de las listas debe tener entre 3 y 90 caracteres.'
      using errcode = 'P0001';
  end if;

  insert into ladra.avisos_puestos (
    autor_id, titulo, descripcion, tipo, comuna, direccion_publica, latitud, longitud, para_que,
    incluye, documentacion, costo_mensual_ac, costo_habilitacion_ac, plazo_habilitacion_dias,
    permiso_estado, condiciones_devolucion
  ) values (
    v_uid, btrim(p_titulo), btrim(p_descripcion), p_tipo, btrim(p_comuna), btrim(p_direccion_publica),
    p_latitud, p_longitud, btrim(p_para_que),
    (select array_agg(btrim(x)) from unnest(p_incluye) x),
    (select array_agg(btrim(x)) from unnest(p_documentacion) x),
    p_costo_mensual_ac, p_costo_habilitacion_ac, p_plazo_habilitacion_dias,
    coalesce(p_permiso_estado, 'sin_consultar'), btrim(p_condiciones_devolucion)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- La persona autora envía su borrador a revisión.
create or replace function ladra.enviar_aviso_puesto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  update ladra.avisos_puestos
     set estado = 'en_revision', motivo_rechazo = null
   where id = p_id and autor_id = v_uid and estado = 'borrador';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'TRANSICION_INVALIDA: solo la persona autora puede enviar un borrador a revisión.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- La persona autora retira su aviso (en cualquier estado salvo que ya esté retirado).
create or replace function ladra.retirar_aviso_puesto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  update ladra.avisos_puestos
     set estado = 'retirado'
   where id = p_id and autor_id = v_uid and estado <> 'retirado';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'TRANSICION_INVALIDA: el aviso no existe, no es tuyo o ya estaba retirado.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Solo quien está en ladra.moderadores aprueba o rechaza. Rechazar exige un motivo.
create or replace function ladra.moderar_aviso_puesto(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if not exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid) then
    raise exception 'PERMISO_DENEGADO' using errcode = '42501';
  end if;
  if p_aprobar is null then
    raise exception 'DECISION_INVALIDA' using errcode = 'P0001';
  end if;
  if not p_aprobar and char_length(btrim(coalesce(p_motivo, ''))) not between 10 and 400 then
    raise exception 'MOTIVO_REQUERIDO: explica el rechazo en 10 a 400 caracteres.' using errcode = 'P0001';
  end if;
  update ladra.avisos_puestos
     set estado = case when p_aprobar then 'publicado' else 'rechazado' end,
         motivo_rechazo = case when p_aprobar then null else btrim(p_motivo) end,
         moderado_por = v_uid,
         moderado_en = now()
   where id = p_id and estado = 'en_revision';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'TRANSICION_INVALIDA: el aviso no está en revisión.' using errcode = 'P0001';
  end if;
end;
$$;

-- Avisos publicados: los ve cualquiera, con o sin cuenta. No se muestra quién los creó.
create or replace function ladra.listar_avisos_puestos()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  latitud numeric, longitud numeric, precision_ubicacion text, para_que text,
  incluye text[], documentacion text[], costo_mensual_ac integer, costo_habilitacion_ac integer,
  plazo_habilitacion_dias integer, permiso_estado text, condiciones_devolucion text,
  creado_en timestamptz, es_mio boolean
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select a.id, a.titulo, a.descripcion, a.tipo, a.comuna, a.direccion_publica,
         a.latitud, a.longitud, a.precision_ubicacion, a.para_que,
         a.incluye, a.documentacion, a.costo_mensual_ac, a.costo_habilitacion_ac,
         a.plazo_habilitacion_dias, a.permiso_estado, a.condiciones_devolucion,
         a.creado_en, coalesce(a.autor_id = (select auth.uid()), false) as es_mio
    from ladra.avisos_puestos a
   where a.estado = 'publicado'
   order by a.creado_en desc;
$$;

-- Mis avisos, en todos sus estados (también el motivo si me lo rechazaron).
create or replace function ladra.mis_avisos_puestos()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  para_que text, costo_mensual_ac integer, costo_habilitacion_ac integer,
  plazo_habilitacion_dias integer, permiso_estado text, estado text, motivo_rechazo text,
  creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  return query
    select a.id, a.titulo, a.descripcion, a.tipo, a.comuna, a.direccion_publica,
           a.para_que, a.costo_mensual_ac, a.costo_habilitacion_ac,
           a.plazo_habilitacion_dias, a.permiso_estado, a.estado, a.motivo_rechazo,
           a.creado_en
      from ladra.avisos_puestos a
     where a.autor_id = v_uid
     order by a.creado_en desc;
end;
$$;

-- Bandeja de moderación: avisos en revisión, con el alias público de quien los envió.
create or replace function ladra.avisos_puestos_en_revision()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  latitud numeric, longitud numeric, para_que text, incluye text[], documentacion text[],
  costo_mensual_ac integer, costo_habilitacion_ac integer, plazo_habilitacion_dias integer,
  permiso_estado text, condiciones_devolucion text, autor_alias text, creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if not exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid) then
    raise exception 'PERMISO_DENEGADO' using errcode = '42501';
  end if;
  return query
    select a.id, a.titulo, a.descripcion, a.tipo, a.comuna, a.direccion_publica,
           a.latitud, a.longitud, a.para_que, a.incluye, a.documentacion,
           a.costo_mensual_ac, a.costo_habilitacion_ac, a.plazo_habilitacion_dias,
           a.permiso_estado, a.condiciones_devolucion, pp.alias, a.creado_en
      from ladra.avisos_puestos a
      left join ladra.perfiles_publicos pp on pp.usuario_id = a.autor_id and pp.estado = 'publicado'
     where a.estado = 'en_revision'
     order by a.creado_en;
end;
$$;

revoke all on function ladra.avisos_puestos_proteger() from public, anon, authenticated;
revoke all on function ladra.crear_aviso_puesto(text, text, text, text, text, numeric, numeric, text, text[], text[], integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function ladra.enviar_aviso_puesto(uuid) from public, anon, authenticated;
revoke all on function ladra.retirar_aviso_puesto(uuid) from public, anon, authenticated;
revoke all on function ladra.moderar_aviso_puesto(uuid, boolean, text) from public, anon, authenticated;
revoke all on function ladra.listar_avisos_puestos() from public, anon, authenticated;
revoke all on function ladra.mis_avisos_puestos() from public, anon, authenticated;
revoke all on function ladra.avisos_puestos_en_revision() from public, anon, authenticated;

grant execute on function ladra.crear_aviso_puesto(text, text, text, text, text, numeric, numeric, text, text[], text[], integer, integer, integer, text, text) to authenticated;
grant execute on function ladra.enviar_aviso_puesto(uuid) to authenticated;
grant execute on function ladra.retirar_aviso_puesto(uuid) to authenticated;
grant execute on function ladra.moderar_aviso_puesto(uuid, boolean, text) to authenticated;
grant execute on function ladra.listar_avisos_puestos() to anon, authenticated;
grant execute on function ladra.mis_avisos_puestos() to authenticated;
grant execute on function ladra.avisos_puestos_en_revision() to authenticated;

notify pgrst, 'reload schema';

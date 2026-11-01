-- Comida y agua → Campañas de financiamiento de puestos (etapa 1) y equipo visible.
-- Solo schema ladra. Agrega a ladra.avisos_puestos (migración 20261015120000) la modalidad «campaña»:
--   Etapa 1: se junta una meta en Aura Coins en un plazo máximo de 60 días (2 meses).
--   Etapa 2 (al alcanzar la meta): se define con la plata ya disponible el emplazamiento, la mantención,
--   la calidad de la comida, etc. Hasta entonces esos datos pueden quedar «por definir».
-- La campaña debe decir en cuántos días queda listo el puesto desde que se alcanza la meta (máximo 60).
-- Este archivo NO mueve Auracoins ni dinero: la meta es lo que se PIDE; no hay aportes todavía.
-- También deja visible quién es responsable del proyecto y quiénes más forman parte (por alias público).
--
-- Pendiente (no incluido): aportes en Auracoins (falta la definición vigente), que otras personas se sumen
-- al equipo con su consentimiento, y el paso de etapa al alcanzar la meta.

alter table ladra.avisos_puestos
  add column meta_ac integer check (meta_ac is null or meta_ac between 1 and 10000000),
  add column plazo_recaudacion_dias integer check (plazo_recaudacion_dias is null or plazo_recaudacion_dias between 1 and 60),
  add column recaudacion_hasta timestamptz;

comment on column ladra.avisos_puestos.meta_ac is
  'Meta de la campaña, en Auracoins. Es una solicitud: no se recauda ni se guarda nada todavía.';
comment on column ladra.avisos_puestos.recaudacion_hasta is
  'Fin del plazo de financiamiento. Se fija al publicar el aviso (publicación + plazo_recaudacion_dias).';

-- En una campaña, la mantención, la calidad de la comida, etc. se definen al alcanzar la meta.
alter table ladra.avisos_puestos alter column costo_mensual_ac drop not null;
alter table ladra.avisos_puestos drop constraint if exists avisos_puestos_incluye_check;
alter table ladra.avisos_puestos drop constraint if exists avisos_puestos_documentacion_check;

alter table ladra.avisos_puestos
  add constraint avisos_puestos_incluye_check
    check (cardinality(incluye) <= 8 and (meta_ac is not null or cardinality(incluye) >= 1)),
  add constraint avisos_puestos_documentacion_check
    check (cardinality(documentacion) <= 8 and (meta_ac is not null or cardinality(documentacion) >= 1)),
  add constraint avisos_puestos_costo_mensual_requerido
    check (meta_ac is not null or costo_mensual_ac is not null),
  add constraint avisos_puestos_campana_completa
    check ((meta_ac is null and plazo_recaudacion_dias is null)
        or (meta_ac is not null and plazo_recaudacion_dias is not null and plazo_habilitacion_dias <= 60));

-- El candado de «en revisión / publicado» debe dejar pasar la fecha límite, que se fija al aprobar.
create or replace function ladra.avisos_puestos_proteger()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
begin
  if old.estado in ('en_revision', 'publicado') and
     (to_jsonb(new) - 'estado' - 'motivo_rechazo' - 'moderado_por' - 'moderado_en' - 'actualizado_en' - 'recaudacion_hasta')
       is distinct from
     (to_jsonb(old) - 'estado' - 'motivo_rechazo' - 'moderado_por' - 'moderado_en' - 'actualizado_en' - 'recaudacion_hasta') then
    raise exception 'AVISO_BLOQUEADO: un aviso en revisión o publicado no se puede modificar.'
      using errcode = 'P0001';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

-- Personas que forman parte del proyecto además de quien lo publica (responsable).
create table ladra.aviso_integrantes (
  aviso_id uuid not null references ladra.avisos_puestos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (aviso_id, usuario_id)
);

alter table ladra.aviso_integrantes enable row level security;
alter table ladra.aviso_integrantes force row level security;
revoke all on ladra.aviso_integrantes from public, anon, authenticated;
grant all on ladra.aviso_integrantes to service_role;

-- Equipo visible: responsable primero y luego integrantes, solo con alias público ya publicado.
-- Función interna: la usan las funciones de abajo; el navegador no la llama.
create or replace function ladra.equipo_aviso_puesto(p_aviso uuid, p_autor uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select jsonb_build_array(jsonb_build_object(
           'alias', coalesce((select pp.alias from ladra.perfiles_publicos pp
                               where pp.usuario_id = p_autor and pp.estado = 'publicado'),
                             'Responsable (sin alias público)'),
           'rol', 'responsable'))
      || coalesce((select jsonb_agg(jsonb_build_object('alias', pp.alias, 'rol', 'integrante') order by i.creado_en)
                     from ladra.aviso_integrantes i
                     join ladra.perfiles_publicos pp on pp.usuario_id = i.usuario_id and pp.estado = 'publicado'
                    where i.aviso_id = p_aviso and i.usuario_id <> p_autor), '[]'::jsonb);
$$;

-- Crea el borrador de una campaña. Máximo 3 avisos sin cerrar por persona (igual que crear_aviso_puesto).
create or replace function ladra.crear_campana_puesto(
  p_titulo text,
  p_descripcion text,
  p_tipo text,
  p_comuna text,
  p_direccion_publica text,
  p_para_que text,
  p_meta_ac integer,
  p_plazo_recaudacion_dias integer,
  p_plazo_habilitacion_dias integer,
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
  if p_meta_ac is null or p_plazo_recaudacion_dias is null then
    raise exception 'CAMPANA_INCOMPLETA: indica la meta y el plazo de financiamiento.' using errcode = 'P0001';
  end if;
  if (select count(*) from ladra.avisos_puestos
       where autor_id = v_uid and estado in ('borrador', 'en_revision')) >= 3 then
    raise exception 'LIMITE_AVISOS: ya tienes 3 avisos sin cerrar. Envía, retira o espera la revisión de alguno.'
      using errcode = 'P0001';
  end if;
  insert into ladra.avisos_puestos (
    autor_id, titulo, descripcion, tipo, comuna, direccion_publica, para_que, incluye, documentacion,
    meta_ac, plazo_recaudacion_dias, plazo_habilitacion_dias, condiciones_devolucion
  ) values (
    v_uid, btrim(p_titulo), btrim(p_descripcion), p_tipo, btrim(p_comuna),
    coalesce(nullif(btrim(p_direccion_publica), ''), 'Por definir al alcanzar la meta'),
    btrim(p_para_que), '{}', '{}',
    p_meta_ac, p_plazo_recaudacion_dias, p_plazo_habilitacion_dias, btrim(p_condiciones_devolucion)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Moderar: igual que antes, y si es una campaña, al publicarla empieza a correr su plazo de financiamiento.
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
         recaudacion_hasta = case when p_aprobar and plazo_recaudacion_dias is not null
                                  then now() + make_interval(days => plazo_recaudacion_dias) end,
         moderado_por = v_uid,
         moderado_en = now()
   where id = p_id and estado = 'en_revision';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'TRANSICION_INVALIDA: el aviso no está en revisión.' using errcode = 'P0001';
  end if;
end;
$$;

-- Las listas cambian de columnas: se reemplazan (drop + create) y se vuelven a dar los permisos.
drop function ladra.listar_avisos_puestos();
drop function ladra.avisos_puestos_en_revision();

create function ladra.listar_avisos_puestos()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  latitud numeric, longitud numeric, precision_ubicacion text, para_que text,
  incluye text[], documentacion text[], costo_mensual_ac integer, costo_habilitacion_ac integer,
  plazo_habilitacion_dias integer, permiso_estado text, condiciones_devolucion text,
  creado_en timestamptz, es_mio boolean,
  meta_ac integer, plazo_recaudacion_dias integer, recaudacion_hasta timestamptz, equipo jsonb
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
         a.creado_en, coalesce(a.autor_id = (select auth.uid()), false) as es_mio,
         a.meta_ac, a.plazo_recaudacion_dias, a.recaudacion_hasta,
         ladra.equipo_aviso_puesto(a.id, a.autor_id) as equipo
    from ladra.avisos_puestos a
   where a.estado = 'publicado'
   order by a.creado_en desc;
$$;

create function ladra.avisos_puestos_en_revision()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  latitud numeric, longitud numeric, para_que text, incluye text[], documentacion text[],
  costo_mensual_ac integer, costo_habilitacion_ac integer, plazo_habilitacion_dias integer,
  permiso_estado text, condiciones_devolucion text, autor_alias text, creado_en timestamptz,
  meta_ac integer, plazo_recaudacion_dias integer
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
           a.permiso_estado, a.condiciones_devolucion, pp.alias, a.creado_en,
           a.meta_ac, a.plazo_recaudacion_dias
      from ladra.avisos_puestos a
      left join ladra.perfiles_publicos pp on pp.usuario_id = a.autor_id and pp.estado = 'publicado'
     where a.estado = 'en_revision'
     order by a.creado_en;
end;
$$;

revoke all on function ladra.equipo_aviso_puesto(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.crear_campana_puesto(text, text, text, text, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function ladra.moderar_aviso_puesto(uuid, boolean, text) from public, anon, authenticated;
revoke all on function ladra.listar_avisos_puestos() from public, anon, authenticated;
revoke all on function ladra.avisos_puestos_en_revision() from public, anon, authenticated;

grant execute on function ladra.crear_campana_puesto(text, text, text, text, text, text, integer, integer, integer, text) to authenticated;
grant execute on function ladra.moderar_aviso_puesto(uuid, boolean, text) to authenticated;
grant execute on function ladra.listar_avisos_puestos() to anon, authenticated;
grant execute on function ladra.avisos_puestos_en_revision() to authenticated;

notify pgrst, 'reload schema';

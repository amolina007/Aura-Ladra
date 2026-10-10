-- Encuentros (paseos, juntas de canil, jornadas de adopción, campañas, mantenimiento de estaciones).
-- Solo schema ladra. PREPARADA PARA REVISIÓN: no se ha ejecutado en producción ni en ninguna rama.
--
-- Mapa y Calendario leen el MISMO conjunto de encuentros. Visibilidad por ahora: 'publico' o 'privado'
-- (la visibilidad 'grupo' llega con la migración de grupos). Un encuentro privado solo lo ven quien lo organiza
-- y las personas invitadas. El lugar es un lugar público de la lista o un punto de encuentro en texto libre:
-- no se guardan domicilios ni ubicación en tiempo real. La invitación puede describir qué necesita el animal
-- para interactuar; eso NO promete compatibilidad ni seguridad.
-- El navegador no escribe estas tablas directamente: todo pasa por funciones que validan permisos.

do $$
begin
  if to_regprocedure('core.hay_bloqueo(uuid,uuid)') is null then
    raise exception using errcode = '55000',
      message = 'Faltan las migraciones de Convergencia Aura Core (bloqueos). Aplícalas antes de esta.';
  end if;
end $$;

create table if not exists ladra.encuentros (
  id uuid primary key default gen_random_uuid(),
  organizador_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('paseo', 'junta_canil', 'jornada_adopcion', 'campana', 'mantenimiento_estacion', 'otro')),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 80),
  descripcion text check (descripcion is null or char_length(btrim(descripcion)) <= 600),
  condiciones text check (condiciones is null or char_length(btrim(condiciones)) <= 400),
  necesidades_animal text check (necesidades_animal is null or char_length(btrim(necesidades_animal)) <= 300),
  lugar_id uuid references ladra.lugares_publicos(id) on delete set null,
  lugar_texto text check (lugar_texto is null or char_length(btrim(lugar_texto)) <= 120),
  inicia_en timestamptz not null,
  termina_en timestamptz,
  visibilidad text not null default 'privado' check (visibilidad in ('publico', 'privado')),
  estado text not null default 'programado' check (estado in ('programado', 'cancelado')),
  motivo_cancelacion text check (motivo_cancelacion is null or char_length(btrim(motivo_cancelacion)) <= 240),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (lugar_id is not null or lugar_texto is not null),
  check (termina_en is null or termina_en > inicia_en)
);
create index if not exists encuentros_inicia_idx on ladra.encuentros (inicia_en);
create index if not exists encuentros_organizador_idx on ladra.encuentros (organizador_id);

create table if not exists ladra.encuentros_participantes (
  encuentro_id uuid not null references ladra.encuentros(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'invitado' check (estado in ('invitado', 'confirmado', 'rechazado')),
  personas smallint not null default 1 check (personas between 1 and 10),
  animales uuid[] not null default '{}' check (cardinality(animales) <= 6),
  actualizado_en timestamptz not null default now(),
  primary key (encuentro_id, usuario_id)
);
create index if not exists encuentros_participantes_usuario_idx on ladra.encuentros_participantes (usuario_id);

alter table ladra.encuentros enable row level security;
alter table ladra.encuentros_participantes enable row level security;
revoke all on ladra.encuentros, ladra.encuentros_participantes from public, anon, authenticated;

-- ¿Puede la persona ver este encuentro? Organiza, está invitada, o es público; y no hay bloqueo con quien organiza.
create or replace function ladra.puede_ver_encuentro(p_id uuid, p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from ladra.encuentros e
     where e.id = p_id
       and (e.organizador_id = p_usuario
            or (p_usuario is not null
                and not core.hay_bloqueo(p_usuario, e.organizador_id)
                and (e.visibilidad = 'publico'
                     or exists (select 1 from ladra.encuentros_participantes p
                                 where p.encuentro_id = e.id and p.usuario_id = p_usuario)))
            or (p_usuario is null and e.visibilidad = 'publico'))
  );
$$;

create or replace function ladra.crear_encuentro(
  p_tipo text, p_titulo text, p_inicia_en timestamptz, p_termina_en timestamptz default null,
  p_lugar_id uuid default null, p_lugar_texto text default null, p_visibilidad text default 'privado',
  p_descripcion text default null, p_condiciones text default null, p_necesidades_animal text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_yo uuid := (select auth.uid());
  v_id uuid;
begin
  if v_yo is null then
    raise exception using errcode = '28000', message = 'Inicia sesión para proponer un encuentro.';
  end if;
  if p_inicia_en is null or p_inicia_en < now() - interval '1 hour' then
    raise exception using errcode = '22023', message = 'La fecha del encuentro debe ser futura.';
  end if;
  if p_lugar_id is not null and not exists (select 1 from ladra.lugares_publicos l where l.id = p_lugar_id and l.publicado) then
    raise exception using errcode = '22023', message = 'Ese lugar no está disponible.';
  end if;
  insert into ladra.encuentros (organizador_id, tipo, titulo, descripcion, condiciones, necesidades_animal,
                                lugar_id, lugar_texto, inicia_en, termina_en, visibilidad)
  values (v_yo, p_tipo, btrim(p_titulo), nullif(btrim(p_descripcion), ''), nullif(btrim(p_condiciones), ''),
          nullif(btrim(p_necesidades_animal), ''), p_lugar_id, nullif(btrim(p_lugar_texto), ''),
          p_inicia_en, p_termina_en, coalesce(p_visibilidad, 'privado'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function ladra.actualizar_encuentro(
  p_id uuid, p_titulo text default null, p_descripcion text default null, p_condiciones text default null,
  p_necesidades_animal text default null, p_inicia_en timestamptz default null, p_termina_en timestamptz default null,
  p_lugar_texto text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  update ladra.encuentros e set
    titulo = coalesce(btrim(p_titulo), e.titulo),
    descripcion = coalesce(nullif(btrim(p_descripcion), ''), e.descripcion),
    condiciones = coalesce(nullif(btrim(p_condiciones), ''), e.condiciones),
    necesidades_animal = coalesce(nullif(btrim(p_necesidades_animal), ''), e.necesidades_animal),
    inicia_en = coalesce(p_inicia_en, e.inicia_en),
    termina_en = coalesce(p_termina_en, e.termina_en),
    lugar_texto = coalesce(nullif(btrim(p_lugar_texto), ''), e.lugar_texto),
    actualizado_en = now()
   where e.id = p_id and e.organizador_id = v_yo and e.estado = 'programado';
  if not found then
    raise exception using errcode = '42501', message = 'Solo quien organiza puede actualizar un encuentro programado.';
  end if;
end $$;

create or replace function ladra.cancelar_encuentro(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  update ladra.encuentros e set estado = 'cancelado', motivo_cancelacion = nullif(btrim(p_motivo), ''), actualizado_en = now()
   where e.id = p_id and e.organizador_id = v_yo and e.estado = 'programado';
  if not found then
    raise exception using errcode = '42501', message = 'Solo quien organiza puede cancelar un encuentro programado.';
  end if;
end $$;

-- Quien organiza invita a otras personas (siempre se puede, también en encuentros públicos).
create or replace function ladra.invitar_a_encuentro(p_id uuid, p_usuarios uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_yo uuid := (select auth.uid());
  v_n integer;
begin
  if not exists (select 1 from ladra.encuentros where id = p_id and organizador_id = v_yo and estado = 'programado') then
    raise exception using errcode = '42501', message = 'Solo quien organiza puede invitar a un encuentro programado.';
  end if;
  if cardinality(p_usuarios) > 50 then
    raise exception using errcode = '22023', message = 'Invita hasta 50 personas por vez.';
  end if;
  insert into ladra.encuentros_participantes (encuentro_id, usuario_id)
    select p_id, u from unnest(p_usuarios) as u
     where u <> v_yo and exists (select 1 from auth.users x where x.id = u)
       and not core.hay_bloqueo(v_yo, u)
    on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Responder: confirmar (con personas y mascotas propias) o rechazar. En un encuentro público cualquiera puede confirmar.
create or replace function ladra.responder_encuentro(
  p_id uuid, p_estado text, p_personas smallint default 1, p_animales uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_yo uuid := (select auth.uid());
  v_org uuid;
  v_vis text;
  v_est text;
  v_inicio timestamptz;
begin
  if v_yo is null then
    raise exception using errcode = '28000', message = 'Inicia sesión para responder.';
  end if;
  if p_estado not in ('confirmado', 'rechazado') then
    raise exception using errcode = '22023', message = 'Respuesta no válida.';
  end if;
  select organizador_id, visibilidad, estado, inicia_en into v_org, v_vis, v_est, v_inicio from ladra.encuentros where id = p_id;
  if not found or not ladra.puede_ver_encuentro(p_id, v_yo) then
    raise exception using errcode = 'P0002', message = 'Ese encuentro no está disponible.';
  end if;
  if v_est <> 'programado' then
    raise exception using errcode = '22023', message = 'Este encuentro fue cancelado.';
  end if;
  if exists (select 1 from unnest(p_animales) a
              where not exists (select 1 from ladra.animales an where an.id = a and an.creado_por = v_yo)
                and not exists (select 1 from ladra.humanos_animal h
                                  join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
                                 where h.animal_id = a and p.usuario_id = v_yo)) then
    raise exception using errcode = '42501', message = 'Solo puedes llevar tus propias mascotas.';
  end if;
  insert into ladra.encuentros_participantes (encuentro_id, usuario_id, estado, personas, animales)
  values (p_id, v_yo, p_estado, case when p_estado = 'confirmado' then greatest(p_personas, 1) else 1 end,
          case when p_estado = 'confirmado' then p_animales else '{}' end)
  on conflict (encuentro_id, usuario_id) do update
     set estado = excluded.estado, personas = excluded.personas, animales = excluded.animales, actualizado_en = now();
end $$;

-- Encuentros visibles entre dos fechas (para Calendario y Mapa). No devuelve nombres de participantes:
-- solo totales. «mi_estado» es la respuesta de quien consulta. Sin sesión: solo públicos.
create or replace function ladra.encuentros_visibles(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid, tipo text, titulo text, descripcion text, condiciones text, necesidades_animal text,
  lugar_id uuid, lugar_texto text, inicia_en timestamptz, termina_en timestamptz,
  visibilidad text, estado text, soy_organizador boolean, mi_estado text,
  personas_confirmadas bigint, animales_confirmados bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_yo uuid := (select auth.uid());
begin
  if p_hasta - p_desde > interval '400 days' then
    raise exception using errcode = '22023', message = 'El rango de fechas es demasiado grande.';
  end if;
  return query
    select e.id, e.tipo, e.titulo, e.descripcion, e.condiciones, e.necesidades_animal, e.lugar_id, e.lugar_texto,
           e.inicia_en, e.termina_en, e.visibilidad, e.estado, (e.organizador_id = v_yo),
           (select p.estado from ladra.encuentros_participantes p where p.encuentro_id = e.id and p.usuario_id = v_yo),
           coalesce((select sum(p.personas) from ladra.encuentros_participantes p where p.encuentro_id = e.id and p.estado = 'confirmado'), 0)::bigint,
           coalesce((select sum(cardinality(p.animales)) from ladra.encuentros_participantes p where p.encuentro_id = e.id and p.estado = 'confirmado'), 0)::bigint
      from ladra.encuentros e
     where e.inicia_en >= p_desde and e.inicia_en < p_hasta
       and ladra.puede_ver_encuentro(e.id, v_yo)
     order by e.inicia_en;
end $$;

revoke all on function ladra.puede_ver_encuentro(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.crear_encuentro(text, text, timestamptz, timestamptz, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function ladra.actualizar_encuentro(uuid, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function ladra.cancelar_encuentro(uuid, text) from public, anon, authenticated;
revoke all on function ladra.invitar_a_encuentro(uuid, uuid[]) from public, anon, authenticated;
revoke all on function ladra.responder_encuentro(uuid, text, smallint, uuid[]) from public, anon, authenticated;
revoke all on function ladra.encuentros_visibles(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function ladra.crear_encuentro(text, text, timestamptz, timestamptz, uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function ladra.actualizar_encuentro(uuid, text, text, text, text, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function ladra.cancelar_encuentro(uuid, text) to authenticated, service_role;
grant execute on function ladra.invitar_a_encuentro(uuid, uuid[]) to authenticated, service_role;
grant execute on function ladra.responder_encuentro(uuid, text, smallint, uuid[]) to authenticated, service_role;
grant execute on function ladra.encuentros_visibles(timestamptz, timestamptz) to authenticated, anon, service_role;

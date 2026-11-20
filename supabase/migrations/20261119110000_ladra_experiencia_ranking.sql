-- Experiencia de Ladra: puntaje personal y clasificación global por alias.
-- Los puntos se insertan solo desde triggers; el navegador no puede inventarlos.

create table if not exists ladra.experiencia_eventos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  evento text not null check (evento in ('perfil_mascota', 'paseo_diario', 'recurso_validado')),
  referencia_id text not null,
  puntos smallint not null check (puntos > 0 and puntos <= 100),
  creado_en timestamptz not null default now(),
  unique (usuario_id, evento, referencia_id)
);

create index if not exists experiencia_eventos_usuario_idx
  on ladra.experiencia_eventos (usuario_id, creado_en desc);

alter table ladra.experiencia_eventos enable row level security;
alter table ladra.experiencia_eventos force row level security;
revoke all on ladra.experiencia_eventos from public, anon, authenticated;
grant select on ladra.experiencia_eventos to authenticated;

create policy experiencia_eventos_lectura_propia
  on ladra.experiencia_eventos for select to authenticated
  using (usuario_id = (select auth.uid()));

create or replace function ladra.registrar_experiencia_interna(
  p_usuario_id uuid, p_evento text, p_referencia_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_puntos smallint;
begin
  v_puntos := case p_evento
    when 'perfil_mascota' then 20
    when 'paseo_diario' then 5
    when 'recurso_validado' then 15
    else null
  end;
  if p_usuario_id is null or p_referencia_id is null or v_puntos is null then
    return;
  end if;
  insert into ladra.experiencia_eventos (usuario_id, evento, referencia_id, puntos)
  values (p_usuario_id, p_evento, p_referencia_id, v_puntos)
  on conflict (usuario_id, evento, referencia_id) do nothing;
end;
$$;
revoke all on function ladra.registrar_experiencia_interna(uuid, text, text) from public, anon, authenticated;

create or replace function ladra.experiencia_perfil_mascota()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if new.creado_por is not null
     and new.estado = 'publicado'
     and not new.es_comunitario
     and not new.es_conmemorativa
     and (nullif(btrim(new.foto_url), '') is not null or coalesce(cardinality(new.foto_urls), 0) > 0) then
    perform ladra.registrar_experiencia_interna(new.creado_por, 'perfil_mascota', new.id::text);
  end if;
  return new;
end;
$$;
revoke all on function ladra.experiencia_perfil_mascota() from public, anon, authenticated;

drop trigger if exists experiencia_perfil_mascota on ladra.animales;
drop trigger if exists experiencia_perfil_mascota_actualizado on ladra.animales;
create trigger experiencia_perfil_mascota
  after insert on ladra.animales
  for each row execute function ladra.experiencia_perfil_mascota();
create trigger experiencia_perfil_mascota_actualizado
  after update of estado, foto_url, foto_urls, es_comunitario, es_conmemorativa
  on ladra.animales
  for each row execute function ladra.experiencia_perfil_mascota();

create or replace function ladra.experiencia_paseo_diario()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  -- Un paseo registrado para hoy suma una vez al día; editarlo no duplica puntos.
  if new.tipo = 'paseo' and new.visibilidad = 'privado'
     and new.fecha = (now() at time zone 'America/Santiago')::date
     and new.autor_id is not null then
    perform ladra.registrar_experiencia_interna(
      new.autor_id, 'paseo_diario', to_char(new.fecha, 'YYYY-MM-DD')
    );
  end if;
  return new;
end;
$$;
revoke all on function ladra.experiencia_paseo_diario() from public, anon, authenticated;

drop trigger if exists experiencia_paseo_diario on ladra.momentos;
create trigger experiencia_paseo_diario
  after insert on ladra.momentos
  for each row execute function ladra.experiencia_paseo_diario();

create or replace function ladra.experiencia_recurso_validado()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if new.estado = 'aprobada' and old.estado is distinct from new.estado
     and new.creado_por is not null then
    perform ladra.registrar_experiencia_interna(new.creado_por, 'recurso_validado', new.id::text);
  end if;
  return new;
end;
$$;
revoke all on function ladra.experiencia_recurso_validado() from public, anon, authenticated;

drop trigger if exists experiencia_recurso_validado on ladra.propuestas_lugares;
create trigger experiencia_recurso_validado
  after update of estado on ladra.propuestas_lugares
  for each row execute function ladra.experiencia_recurso_validado();

create or replace function ladra.mi_experiencia()
returns table (puntos_exp bigint, posicion bigint, nivel text, aparece_en_clasificacion boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_puntos bigint;
  v_posicion bigint;
  v_visible boolean;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'SESION_REQUERIDA';
  end if;
  select coalesce(sum(e.puntos), 0)::bigint into v_puntos
  from ladra.experiencia_eventos e where e.usuario_id = v_uid;
  select exists (
    select 1 from ladra.perfiles_publicos p
    where p.usuario_id = v_uid and p.estado = 'publicado' and p.visibilidad <> 'oculto'
  ) into v_visible;
  if v_visible then
    with totales as (
      select p.usuario_id, coalesce(sum(e.puntos), 0)::bigint as total
      from ladra.perfiles_publicos p
      left join ladra.experiencia_eventos e on e.usuario_id = p.usuario_id
      where p.estado = 'publicado' and p.visibilidad <> 'oculto'
      group by p.usuario_id
    ), puestos as (
      select t.usuario_id, rank() over (order by t.total desc)::bigint as puesto
      from totales t join ladra.perfiles_publicos p on p.usuario_id = t.usuario_id
    )
    select puesto into v_posicion from puestos where usuario_id = v_uid;
  end if;
  return query select
    v_puntos,
    v_posicion,
    case when v_puntos >= 1200 then 'Referente animalista'
         when v_puntos >= 500 then 'Guardián del barrio'
         when v_puntos >= 100 then 'Buen compañero'
         else 'Huella nueva' end,
    v_visible;
end;
$$;
revoke all on function ladra.mi_experiencia() from public, anon;
grant execute on function ladra.mi_experiencia() to authenticated;

create or replace function ladra.clasificacion_experiencia(p_limite integer default 20)
returns table (posicion bigint, alias text, puntos_exp bigint, es_mi_posicion boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limite integer := greatest(1, least(coalesce(p_limite, 20), 50));
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'SESION_REQUERIDA';
  end if;
  return query
  with totales as (
    select p.usuario_id, p.alias, coalesce(sum(e.puntos), 0)::bigint as total
    from ladra.perfiles_publicos p
    left join ladra.experiencia_eventos e on e.usuario_id = p.usuario_id
    where p.estado = 'publicado' and p.visibilidad <> 'oculto'
    group by p.usuario_id, p.alias
  ), puestos as (
    select t.alias, t.usuario_id, t.total,
      rank() over (order by t.total desc)::bigint as puesto
    from totales t
  )
  select r.puesto, r.alias, r.total, r.usuario_id = v_uid
  from puestos r
  where r.puesto <= v_limite or r.usuario_id = v_uid
  order by r.puesto, r.alias;
end;
$$;
revoke all on function ladra.clasificacion_experiencia(integer) from public, anon;
grant execute on function ladra.clasificacion_experiencia(integer) to authenticated;

comment on table ladra.experiencia_eventos is
  'Libro de EXP de Ladra. Los triggers otorgan puntos; el usuario solo puede leer su propio detalle.';

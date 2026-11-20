-- En el ranking solo aparecen personas que ya sumaron EXP.
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
  if v_visible and v_puntos > 0 then
    with totales as (
      select p.usuario_id, coalesce(sum(e.puntos), 0)::bigint as total
      from ladra.perfiles_publicos p
      left join ladra.experiencia_eventos e on e.usuario_id = p.usuario_id
      where p.estado = 'publicado' and p.visibilidad <> 'oculto'
      group by p.usuario_id
      having coalesce(sum(e.puntos), 0) > 0
    ), puestos as (
      select t.usuario_id, rank() over (order by t.total desc)::bigint as puesto
      from totales t
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
    having coalesce(sum(e.puntos), 0) > 0
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

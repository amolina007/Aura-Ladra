-- Cierra el ciclo de reportes del canil: nota al cerrar, recurrencia y estadísticas públicas.

-- 1a) Nota de resolución obligatoria al cerrar ---------------------------------
alter table ladra.reportes_canil
  add column if not exists nota_resolucion text;

alter table ladra.reportes_canil
  drop constraint if exists reportes_canil_nota_resolucion_longitud;

alter table ladra.reportes_canil
  add constraint reportes_canil_nota_resolucion_longitud
  check (nota_resolucion is null or char_length(btrim(nota_resolucion)) between 10 and 500);

comment on column ladra.reportes_canil.nota_resolucion is
  'Explicación visible de qué se hizo al cerrar el reporte. Obligatoria solo en estado cerrado.';

grant select (nota_resolucion) on table ladra.reportes_canil to anon, authenticated;
grant update (estado, nota_resolucion) on table ladra.reportes_canil to authenticated;

create or replace function ladra.preparar_moderacion_reporte()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
begin
  if new.estado is distinct from old.estado then
    if not exists (
      select 1
      from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    ) then
      raise exception using errcode = '42501', message = 'No autorizado para moderar.';
    end if;

    if new.estado = 'cerrado'
       and char_length(btrim(coalesce(new.nota_resolucion, ''))) < 10 then
      raise exception using errcode = '22023',
        message = 'Para cerrar el reporte debes indicar qué se hizo (mínimo 10 caracteres).';
    end if;

    new.moderado_en := now();
    new.moderador_id := (select auth.uid());
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

-- 1b) Contador de recurrencia por categoría -----------------------------------
create or replace function ladra.recurrencia_categoria_reportes()
returns table (categoria text, total bigint, ultima_fecha timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select r.categoria, count(*)::bigint as total, max(r.observado_en) as ultima_fecha
  from ladra.reportes_canil r
  where r.estado in ('verificado', 'cerrado')
  group by r.categoria
  order by total desc;
$$;

revoke all on function ladra.recurrencia_categoria_reportes() from public, anon, authenticated;
grant execute on function ladra.recurrencia_categoria_reportes() to anon, authenticated;

-- 1c) Estadísticas públicas del piloto ----------------------------------------
create or replace function ladra.estadisticas_reportes()
returns table (
  total_reportados bigint,
  total_resueltos bigint,
  dias_promedio_resolucion numeric
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select
    count(*) filter (where estado in ('verificado', 'cerrado', 'rechazado'))::bigint,
    count(*) filter (where estado = 'cerrado')::bigint,
    round(
      coalesce(
        avg(extract(epoch from (moderado_en - creado_en)) / 86400)
          filter (where estado = 'cerrado' and moderado_en is not null),
        0
      )::numeric,
      1
    )
  from ladra.reportes_canil;
$$;

revoke all on function ladra.estadisticas_reportes() from public, anon, authenticated;
grant execute on function ladra.estadisticas_reportes() to anon, authenticated;

notify pgrst, 'reload schema';

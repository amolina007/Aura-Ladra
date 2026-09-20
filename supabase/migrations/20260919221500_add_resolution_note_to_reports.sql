-- Nota de resolución obligatoria al cerrar un reporte del canil.

alter table ladra.reportes_canil
  add column if not exists nota_resolucion text
  constraint reportes_canil_nota_resolucion_longitud
  check (nota_resolucion is null or char_length(btrim(nota_resolucion)) <= 500);

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

notify pgrst, 'reload schema';

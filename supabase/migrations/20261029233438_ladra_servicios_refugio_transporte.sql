-- Versión registrada por Supabase para la ampliación de servicios de Ladra.
begin;
alter table ladra.servicios drop constraint servicios_categoria_check;
alter table ladra.servicios add constraint servicios_categoria_check
  check(categoria in ('estetica','entrenamiento','paseos','cuidado','refugio','transporte','otros'));
alter table ladra.servicios drop constraint servicios_modalidad_check;
alter table ladra.servicios add constraint servicios_modalidad_check
  check(modalidad in ('local','domicilio','aire_libre','online','traslado'));
notify pgrst,'reload schema';
commit;

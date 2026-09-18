-- Las políticas de Storage comparten storage.objects entre todos los productos.
-- CASE evita evaluar tablas de AuraRitmos cuando la operación pertenece a otro bucket.

drop policy if exists fotos_sesiones_subir on storage.objects;
create policy fotos_sesiones_subir
on storage.objects for insert to public
with check (
  case when bucket_id = 'fotos-sesiones' then exists (
    select 1
    from public.sesiones_clase sc
    join public.docentes d on d.id = sc.docente_id
    where sc.id::text = split_part(name, '/', 1)
      and d.auth_user_id = auth.uid()
  ) else false end
);

drop policy if exists fotos_sesiones_leer on storage.objects;
create policy fotos_sesiones_leer
on storage.objects for select to public
using (
  case when bucket_id = 'fotos-sesiones' then (
    exists (
      select 1
      from public.asistencia_sesion a
      where a.sesion_id::text = split_part(name, '/', 1)
        and a.pasaporte_id in (
          select p.id from public.pasaportes p where p.auth_user_id = auth.uid()
        )
    )
    or exists (
      select 1
      from public.sesiones_clase sc
      join public.docentes d on d.id = sc.docente_id
      where sc.id::text = split_part(name, '/', 1)
        and d.auth_user_id = auth.uid()
    )
    or public.es_capitan()
  ) else false end
);

drop policy if exists fotos_sesiones_borrar on storage.objects;
create policy fotos_sesiones_borrar
on storage.objects for delete to public
using (
  case when bucket_id = 'fotos-sesiones' then exists (
    select 1
    from public.sesiones_clase sc
    join public.docentes d on d.id = sc.docente_id
    where sc.id::text = split_part(name, '/', 1)
      and d.auth_user_id = auth.uid()
  ) else false end
);

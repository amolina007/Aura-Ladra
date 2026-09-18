-- Keep AuraRitmos storage authorization isolated from other product buckets.
-- Direct references to docentes in storage.objects policies caused PostgreSQL
-- privilege checks during unrelated AuraLadra uploads.

create or replace function private.puede_gestionar_foto_sesion(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.sesiones_clase sc
      join public.docentes d on d.id = sc.docente_id
      where sc.id::text = split_part(object_name, '/', 1)
        and d.auth_user_id = (select auth.uid())
    );
$$;

create or replace function private.puede_leer_foto_sesion(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.asistencia_sesion a
        join public.pasaportes p on p.id = a.pasaporte_id
        where a.sesion_id::text = split_part(object_name, '/', 1)
          and p.auth_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.sesiones_clase sc
        join public.docentes d on d.id = sc.docente_id
        where sc.id::text = split_part(object_name, '/', 1)
          and d.auth_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.eslabones e
        where e.auth_user_id = (select auth.uid())
          and e.role = 'captain'
          and e.status = 'active'
      )
    );
$$;

revoke all on function private.puede_gestionar_foto_sesion(text) from public;
revoke all on function private.puede_leer_foto_sesion(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.puede_gestionar_foto_sesion(text) to authenticated;
grant execute on function private.puede_leer_foto_sesion(text) to authenticated;

drop policy if exists fotos_sesiones_subir on storage.objects;
create policy fotos_sesiones_subir
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fotos-sesiones'
  and private.puede_gestionar_foto_sesion(name)
);

drop policy if exists fotos_sesiones_leer on storage.objects;
create policy fotos_sesiones_leer
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fotos-sesiones'
  and private.puede_leer_foto_sesion(name)
);

drop policy if exists fotos_sesiones_borrar on storage.objects;
create policy fotos_sesiones_borrar
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fotos-sesiones'
  and private.puede_gestionar_foto_sesion(name)
);

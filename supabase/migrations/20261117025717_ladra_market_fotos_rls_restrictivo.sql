begin;

-- Aisla Market de politicas globales permisivas ya existentes en storage.objects.
create policy market_fotos_leer_guard on storage.objects as restrictive for select to anon,authenticated
using (bucket_id<>'market-ladra' or
  (auth.uid() is not null and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or exists(select 1 from ladra.market_productos p where p.foto_path=objects.name and p.estado='publicado')
  )));

create policy market_fotos_subir_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id<>'market-ladra' or
  ((storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'));

create policy market_fotos_actualizar_guard on storage.objects as restrictive for update to authenticated
using (bucket_id<>'market-ladra') with check (bucket_id<>'market-ladra');

create policy market_fotos_borrar_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'market-ladra' or
  ((storage.foldername(name))[1]=(select auth.uid())::text
   and not exists(select 1 from ladra.market_productos p where p.foto_path=objects.name)));

commit;

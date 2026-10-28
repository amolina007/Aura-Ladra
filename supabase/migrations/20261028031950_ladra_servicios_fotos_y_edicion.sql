-- Versión registrada por Supabase; solo ladra y el contenedor servicios-ladra.
begin;
alter table ladra.servicios
  add column foto_path text,
  add column revision integer not null default 1,
  add column actualizado_en timestamptz not null default now(),
  add column creacion_clave uuid not null default gen_random_uuid();
create unique index servicios_creacion_clave_idx on ladra.servicios(propietario_id,creacion_clave);
create index servicios_foto_path_idx on ladra.servicios(foto_path) where foto_path is not null;
grant insert(foto_path,creacion_clave) on ladra.servicios to authenticated;
grant update(titulo,prestador,categoria,zona,modalidad,precio_clp,precio_tipo,duracion_min,descripcion,foto_url,foto_path) on ladra.servicios to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('servicios-ladra','servicios-ladra',true,5242880,array['image/webp']);

-- Todas las reglas afectan solamente al contenedor nuevo. Los guardas restrictivos
-- evitan que una regla permisiva de otro sitio permita saltarse el aislamiento.
create policy servicios_fotos_leer_propias on storage.objects for select to authenticated
using(bucket_id='servicios-ladra' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy servicios_fotos_leer_guard on storage.objects as restrictive for select to anon,authenticated
using(bucket_id<>'servicios-ladra' or (storage.foldername(name))[1]=(select auth.uid())::text);
create policy servicios_fotos_subir on storage.objects for insert to authenticated
with check(bucket_id='servicios-ladra' and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy servicios_fotos_subir_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'servicios-ladra' or ((storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'));
create policy servicios_fotos_no_sobrescribir on storage.objects as restrictive for update to authenticated
using(bucket_id<>'servicios-ladra') with check(bucket_id<>'servicios-ladra');
create policy servicios_fotos_borrar on storage.objects for delete to authenticated
using(bucket_id='servicios-ladra' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from ladra.servicios s where s.foto_path=objects.name));
create policy servicios_fotos_borrar_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'servicios-ladra' or ((storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from ladra.servicios s where s.foto_path=objects.name)));

create function ladra.validar_foto_servicio() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if new.foto_path is not null then
    if split_part(new.foto_path,'/',1)<>new.propietario_id::text
       or new.foto_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       or not exists(select 1 from storage.objects where bucket_id='servicios-ladra' and name=new.foto_path) then
      raise exception 'Selecciona una foto subida por tu propia cuenta.';
    end if;
    new.foto_url:='https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/servicios-ladra/'||new.foto_path;
  end if;
  if TG_OP='UPDATE' then
    new.revision:=old.revision+1;
    new.actualizado_en:=now();
  end if;
  return new;
end $$;
revoke all on function ladra.validar_foto_servicio() from public,anon,authenticated;
create trigger validar_foto_servicio before insert or update on ladra.servicios
for each row execute function ladra.validar_foto_servicio();
notify pgrst,'reload schema';
commit;

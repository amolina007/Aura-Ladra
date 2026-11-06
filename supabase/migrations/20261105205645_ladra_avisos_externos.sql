-- Versión devuelta por Supabase después de aplicar la migración.
create table ladra.avisos_externos (
 id uuid primary key default gen_random_uuid(),
 autor_id uuid not null default auth.uid() references auth.users(id),
 nombre text not null check(length(trim(nombre)) between 1 and 120),
 especie text not null default 'No informada' check(length(especie)<=80),
 dueno text check(length(dueno)<=150),
 zona text not null check(length(trim(zona)) between 1 and 240),
 fecha_extravio date check(fecha_extravio<=current_date),
 tiempo_aproximado text check(length(tiempo_aproximado)<=120),
 descripcion text check(length(descripcion)<=4000),
 fuente text not null check(length(trim(fuente)) between 1 and 160),
 fuente_url text check(fuente_url ~ '^https?://[^[:space:]]+$' and length(fuente_url)<=2000),
 foto_path text check(foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' and split_part(foto_path,'/',1)=autor_id::text),
 estado text not null default 'extraviada' check(estado in ('extraviada','encontrada','retirado')),
 creado_en timestamptz not null default now()
);
create index avisos_externos_autor_idx on ladra.avisos_externos(autor_id);
alter table ladra.avisos_externos enable row level security;
revoke all on ladra.avisos_externos from anon,authenticated;
grant select on ladra.avisos_externos to anon,authenticated;
grant insert(nombre,especie,dueno,zona,fecha_extravio,tiempo_aproximado,descripcion,fuente,fuente_url,foto_path,estado),
 update(nombre,especie,dueno,zona,fecha_extravio,tiempo_aproximado,descripcion,fuente,fuente_url,foto_path,estado) on ladra.avisos_externos to authenticated;
create policy avisos_externos_leer on ladra.avisos_externos for select to anon,authenticated using(estado<>'retirado' or autor_id=(select auth.uid()));
create policy avisos_externos_crear on ladra.avisos_externos for insert to authenticated with check(autor_id=(select auth.uid()));
create policy avisos_externos_editar on ladra.avisos_externos for update to authenticated using(autor_id=(select auth.uid())) with check(autor_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ladra-avisos','ladra-avisos',true,5242880,array['image/webp']);
create policy ladra_avisos_subir on storage.objects for insert to authenticated with check(bucket_id='ladra-avisos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ladra_avisos_subir_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'ladra-avisos' or ((storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'));
create policy ladra_avisos_actualizar_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'ladra-avisos') with check(bucket_id<>'ladra-avisos');
create policy ladra_avisos_borrar_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'ladra-avisos' or (storage.foldername(name))[1]=(select auth.uid())::text);
notify pgrst,'reload schema';

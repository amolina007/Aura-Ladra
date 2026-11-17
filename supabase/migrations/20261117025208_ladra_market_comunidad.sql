begin;

create table ladra.market_productos (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vendedor_alias text not null default '',
  titulo text not null check (char_length(btrim(titulo)) between 3 and 100),
  descripcion text not null check (char_length(btrim(descripcion)) between 20 and 1200),
  categoria text not null check (categoria in ('alimento','accesorios','juguetes','higiene','descanso','transporte','ropa','otros')),
  condicion text not null check (condicion in ('nuevo','usado')),
  precio_clp integer not null check (precio_clp between 0 and 10000000),
  comuna text not null check (char_length(btrim(comuna)) between 2 and 100),
  entrega text not null check (char_length(btrim(entrega)) between 2 and 240),
  foto_path text not null,
  estado text not null default 'publicado' check (estado in ('publicado','vendido','retirado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index market_productos_feed_idx on ladra.market_productos (creado_en desc) where estado='publicado';
create index market_productos_propietario_idx on ladra.market_productos (propietario_id, creado_en desc);
create index market_productos_filtro_idx on ladra.market_productos (categoria, comuna, precio_clp) where estado='publicado';
alter table ladra.market_productos enable row level security;
alter table ladra.market_productos force row level security;
revoke all on ladra.market_productos from public, anon, authenticated;
grant select (id,vendedor_alias,titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega,foto_path,estado,creado_en,actualizado_en) on ladra.market_productos to authenticated;
grant insert (titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega,foto_path) on ladra.market_productos to authenticated;
grant update (estado) on ladra.market_productos to authenticated;
create policy market_productos_leer on ladra.market_productos for select to authenticated
  using (estado='publicado' or propietario_id=(select auth.uid()));
create policy market_productos_crear on ladra.market_productos for insert to authenticated
  with check (propietario_id=(select auth.uid()) and estado='publicado');
create policy market_productos_actualizar on ladra.market_productos for update to authenticated
  using (propietario_id=(select auth.uid())) with check (propietario_id=(select auth.uid()));
create policy market_productos_foto_existente on ladra.market_productos for insert to authenticated
  with check (exists (select 1 from storage.objects o where o.bucket_id='market-ladra' and o.name=foto_path));

create function ladra.market_validar_producto() returns trigger language plpgsql
security invoker set search_path='' as $$
declare v_alias text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Inicia sesión para publicar.'; end if;
  if tg_op='INSERT' then
    new.propietario_id:=auth.uid();
    select p.alias into v_alias from ladra.perfiles_publicos p
      where p.usuario_id=auth.uid() and p.estado='publicado' and p.visibilidad in ('basico','ampliado')
      order by p.creado_en limit 1;
    if v_alias is null then raise exception using errcode='42501',message='Publica tu perfil de Ladra antes de vender en Market.'; end if;
    new.vendedor_alias:=v_alias;
    if split_part(new.foto_path,'/',1)<>auth.uid()::text or new.foto_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       or not exists(select 1 from storage.objects o where o.bucket_id='market-ladra' and o.name=new.foto_path) then
      raise exception using errcode='42501',message='Selecciona una foto subida por tu cuenta.';
    end if;
  else
    if old.propietario_id<>auth.uid() then raise exception using errcode='42501',message='Solo quien publicó puede cambiar el aviso.'; end if;
    new.propietario_id:=old.propietario_id;
    new.vendedor_alias:=old.vendedor_alias;
    new.actualizado_en:=now();
  end if;
  return new;
end $$;
revoke all on function ladra.market_validar_producto() from public,anon,authenticated;
create trigger market_validar_producto before insert or update on ladra.market_productos
  for each row execute function ladra.market_validar_producto();

create function ladra.market_mis_publicaciones()
returns table (
  id uuid,titulo text,descripcion text,categoria text,condicion text,precio_clp integer,
  comuna text,entrega text,foto_path text,estado text,creado_en timestamptz,actualizado_en timestamptz
)
language sql stable security definer set search_path='' as $$
  select p.id,p.titulo,p.descripcion,p.categoria,p.condicion,p.precio_clp,p.comuna,p.entrega,p.foto_path,p.estado,p.creado_en,p.actualizado_en
  from ladra.market_productos p where p.propietario_id=(select auth.uid()) order by p.creado_en desc
$$;
revoke all on function ladra.market_mis_publicaciones() from public,anon,authenticated;
grant execute on function ladra.market_mis_publicaciones() to authenticated;

create table ladra.market_consultas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references ladra.market_productos(id) on delete cascade,
  comprador_id uuid not null references auth.users(id) on delete cascade,
  vendedor_id uuid not null references auth.users(id) on delete cascade,
  mensaje text not null check (char_length(btrim(mensaje)) between 10 and 800),
  respuesta text check (respuesta is null or char_length(btrim(respuesta)) between 2 and 800),
  estado text not null default 'pendiente' check (estado in ('pendiente','respondida')),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  unique(producto_id,comprador_id),
  check (comprador_id<>vendedor_id)
);
create index market_consultas_vendedor_idx on ladra.market_consultas(vendedor_id,creado_en desc);
create index market_consultas_comprador_idx on ladra.market_consultas(comprador_id,creado_en desc);
alter table ladra.market_consultas enable row level security;
alter table ladra.market_consultas force row level security;
revoke all on ladra.market_consultas from public,anon,authenticated;
grant select on ladra.market_consultas to authenticated;
create policy market_consultas_leer on ladra.market_consultas for select to authenticated
  using (comprador_id=(select auth.uid()) or vendedor_id=(select auth.uid()));

create function ladra.market_contactar_producto(p_producto_id uuid,p_mensaje text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_me uuid := (select auth.uid()); v_seller uuid; v_id uuid; v_text text:=btrim(coalesce(p_mensaje,''));
begin
  if v_me is null then raise exception using errcode='42501',message='Inicia sesión para contactar al vendedor.'; end if;
  if char_length(v_text) not between 10 and 800 then raise exception using errcode='22023',message='El mensaje debe tener entre 10 y 800 caracteres.'; end if;
  select propietario_id into v_seller from ladra.market_productos where id=p_producto_id and estado='publicado';
  if v_seller is null then raise exception using errcode='P0002',message='Esta publicación ya no está disponible.'; end if;
  if v_seller=v_me then raise exception using errcode='22023',message='No puedes consultar tu propia publicación.'; end if;
  insert into ladra.market_consultas(producto_id,comprador_id,vendedor_id,mensaje)
    values(p_producto_id,v_me,v_seller,v_text)
    on conflict(producto_id,comprador_id) do nothing
    returning id into v_id;
  if v_id is null then select id into v_id from ladra.market_consultas where producto_id=p_producto_id and comprador_id=v_me; end if;
  return v_id;
end $$;
revoke all on function ladra.market_contactar_producto(uuid,text) from public,anon,authenticated;
grant execute on function ladra.market_contactar_producto(uuid,text) to authenticated;

create function ladra.market_responder_consulta(p_consulta_id uuid,p_respuesta text)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid := (select auth.uid()); v_text text:=btrim(coalesce(p_respuesta,''));
begin
  if v_me is null then raise exception using errcode='42501',message='Inicia sesión para responder.'; end if;
  if char_length(v_text) not between 2 and 800 then raise exception using errcode='22023',message='La respuesta debe tener entre 2 y 800 caracteres.'; end if;
  update ladra.market_consultas set respuesta=v_text,estado='respondida',respondido_en=now()
    where id=p_consulta_id and vendedor_id=v_me;
  if not found then raise exception using errcode='42501',message='Solo quien vende puede responder esta consulta.'; end if;
end $$;
revoke all on function ladra.market_responder_consulta(uuid,text) from public,anon,authenticated;
grant execute on function ladra.market_responder_consulta(uuid,text) to authenticated;

create function ladra.market_mis_consultas()
returns table (
  id uuid,producto_id uuid,producto_titulo text,producto_foto_path text,contraparte text,
  mensaje text,respuesta text,estado text,soy_vendedor boolean,creado_en timestamptz
)
language sql stable security definer set search_path='' as $$
  select c.id,c.producto_id,p.titulo,p.foto_path,
    case when c.vendedor_id=(select auth.uid()) then 'Comprador' else p.vendedor_alias end,
    c.mensaje,c.respuesta,c.estado,c.vendedor_id=(select auth.uid()),c.creado_en
  from ladra.market_consultas c join ladra.market_productos p on p.id=c.producto_id
  where c.vendedor_id=(select auth.uid()) or c.comprador_id=(select auth.uid())
  order by c.creado_en desc
$$;
revoke all on function ladra.market_mis_consultas() from public,anon,authenticated;
grant execute on function ladra.market_mis_consultas() to authenticated;

create function ladra.market_cambiar_estado(p_producto_id uuid,p_estado text)
returns void language plpgsql security definer set search_path='' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception using errcode='42501',message='Inicia sesión.'; end if;
  if p_estado not in ('publicado','vendido','retirado') then raise exception using errcode='22023',message='Estado no válido.'; end if;
  update ladra.market_productos set estado=p_estado where id=p_producto_id and propietario_id=v_me;
  if not found then raise exception using errcode='42501',message='Solo quien publicó puede cambiar el aviso.'; end if;
end $$;
revoke all on function ladra.market_cambiar_estado(uuid,text) from public,anon,authenticated;
grant execute on function ladra.market_cambiar_estado(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('market-ladra','market-ladra',false,5242880,array['image/webp']);

create policy market_fotos_leer on storage.objects for select to authenticated
  using(bucket_id='market-ladra' and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or exists(select 1 from ladra.market_productos p where p.foto_path=objects.name and p.estado='publicado')
  ));
create policy market_fotos_subir on storage.objects for insert to authenticated
  with check(bucket_id='market-ladra' and (storage.foldername(name))[1]=(select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy market_fotos_no_sobrescribir on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'market-ladra') with check(bucket_id<>'market-ladra');
create policy market_fotos_borrar on storage.objects for delete to authenticated
  using(bucket_id='market-ladra' and (storage.foldername(name))[1]=(select auth.uid())::text
    and not exists(select 1 from ladra.market_productos p where p.foto_path=objects.name));

notify pgrst,'reload schema';
commit;

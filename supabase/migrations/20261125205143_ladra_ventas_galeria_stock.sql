begin;
alter table ladra.market_productos add column fotos text[] not null default '{}',add column stock integer not null default 1 check(stock between 0 and 100000),add column variantes text not null default '' check(length(variantes)<=120),add column revision integer not null default 1;
update ladra.market_productos set fotos=array[foto_path] where foto_path is not null;
alter table ladra.market_productos alter column foto_path drop not null;
alter table ladra.market_productos drop constraint market_productos_estado_check,drop constraint market_productos_titulo_check,drop constraint market_productos_descripcion_check,drop constraint market_productos_comuna_check,drop constraint market_productos_entrega_check;
alter table ladra.market_productos add check(estado in('publicado','borrador','agotado','vendido','retirado')),add check(length(titulo)<=100 and (estado='borrador' or length(btrim(titulo))>=3)),add check(length(descripcion)<=1200 and (estado='borrador' or length(btrim(descripcion))>=20)),add check(length(comuna)<=100 and (estado='borrador' or length(btrim(comuna))>=2)),add check(length(entrega)<=240 and (estado='borrador' or length(btrim(entrega))>=2)),add check(cardinality(fotos)<=6 and array_position(fotos,null) is null);
grant select on ladra.market_productos to authenticated;
grant select(fotos,stock,variantes,revision) on ladra.market_productos to anon;
grant insert(id,estado,fotos,stock,variantes),update(foto_path,fotos,stock,variantes) on ladra.market_productos to authenticated;
alter policy market_productos_crear on ladra.market_productos with check(propietario_id=(select auth.uid()) and estado in('publicado','borrador','agotado'));
drop policy market_productos_foto_existente on ladra.market_productos;
create or replace function ladra.market_validar_producto() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_alias text; path text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Inicia sesión.';end if;
 select nombre into v_alias from ladra.negocios where propietario_id=auth.uid();
 if v_alias is null then raise exception using errcode='42501',message='Activa tu perfil de trabajador en Mi negocio.';end if;
 if tg_op='INSERT' then new.propietario_id:=auth.uid();else
  if old.propietario_id<>auth.uid() then raise exception using errcode='42501',message='Solo puedes gestionar tu negocio.';end if;
  new.propietario_id:=old.propietario_id;new.revision:=old.revision+1;new.creado_en:=old.creado_en;
 end if;
 new.vendedor_alias:=v_alias;new.actualizado_en:=now();
 if cardinality(new.fotos)=0 and new.foto_path is not null then new.fotos:=array[new.foto_path];end if;
 if cardinality(new.fotos)>6 then raise exception 'Puedes incluir hasta seis fotos.';end if;
 foreach path in array new.fotos loop
  if split_part(path,'/',1)<>auth.uid()::text or path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' or not exists(select 1 from storage.objects o where o.bucket_id='market-ladra' and o.name=path) then raise exception using errcode='42501',message='Usa fotos subidas por tu cuenta.';end if;
 end loop;
 new.foto_path:=new.fotos[1];
 if new.estado<>'borrador' and new.foto_path is null then raise exception 'Agrega una foto antes de publicar.';end if;
 if new.estado='publicado' and new.stock=0 then new.estado:='agotado';end if;
 if new.estado='vendido' then new.stock:=0;end if;
 return new;
end $$;
create function ladra.ventas_mis_productos() returns setof ladra.market_productos language sql stable security invoker set search_path='' as $$select * from ladra.market_productos where propietario_id=(select auth.uid()) order by creado_en desc$$;
revoke all on function ladra.ventas_mis_productos() from public,anon;grant execute on function ladra.ventas_mis_productos() to authenticated;
-- Fotos privadas mientras son borrador; la galería publicada puede verse en la vitrina.
alter policy market_fotos_subir on storage.objects with check(bucket_id='market-ladra' and split_part(name,'/',1)=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
alter policy market_fotos_subir_guard on storage.objects with check(bucket_id<>'market-ladra' or (split_part(name,'/',1)=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'));
alter policy market_fotos_leer on storage.objects using(bucket_id='market-ladra' and (split_part(name,'/',1)=(select auth.uid())::text or exists(select 1 from ladra.market_productos p where objects.name=any(p.fotos) and p.estado='publicado')));
alter policy market_fotos_leer_guard on storage.objects using(bucket_id<>'market-ladra' or split_part(name,'/',1)=(select auth.uid())::text or exists(select 1 from ladra.market_productos p where objects.name=any(p.fotos) and p.estado='publicado'));
alter policy negocios_fotos_vitrina on storage.objects using(bucket_id='market-ladra' and exists(select 1 from ladra.market_productos p where objects.name=any(p.fotos) and p.estado='publicado'));
alter policy market_fotos_borrar on storage.objects using(bucket_id='market-ladra' and split_part(name,'/',1)=(select auth.uid())::text and not exists(select 1 from ladra.market_productos p where objects.name=any(p.fotos)));
alter policy market_fotos_borrar_guard on storage.objects using(bucket_id<>'market-ladra' or (split_part(name,'/',1)=(select auth.uid())::text and not exists(select 1 from ladra.market_productos p where objects.name=any(p.fotos))));
create or replace function ladra.market_cambiar_estado(p_producto_id uuid,p_estado text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_estado not in('publicado','borrador','agotado','vendido','retirado') then raise exception using errcode='42501',message='Estado o sesión no válidos.';end if;
 update ladra.market_productos set estado=p_estado where id=p_producto_id and propietario_id=auth.uid();
 if not found then raise exception using errcode='42501',message='Solo quien publicó puede gestionar el producto.';end if;
end $$;
create table ladra.ventas_mensajes(id uuid primary key default gen_random_uuid(),consulta_id uuid not null references ladra.market_consultas(id),autor_id uuid not null default auth.uid() references auth.users(id),texto text not null check(length(btrim(texto)) between 1 and 800),creado_en timestamptz not null default now());
create index ventas_mensajes_consulta_idx on ladra.ventas_mensajes(consulta_id,creado_en);
create index ventas_mensajes_autor_idx on ladra.ventas_mensajes(autor_id);
alter table ladra.ventas_mensajes enable row level security;
revoke all on ladra.ventas_mensajes from public,anon,authenticated;
grant select,insert(consulta_id,texto) on ladra.ventas_mensajes to authenticated;
create policy ventas_mensajes_lectura on ladra.ventas_mensajes for select to authenticated using(exists(select 1 from ladra.market_consultas c where c.id=consulta_id and (c.comprador_id=(select auth.uid()) or c.vendedor_id=(select auth.uid()))));
create policy ventas_mensajes_enviar on ladra.ventas_mensajes for insert to authenticated with check(autor_id=(select auth.uid()) and exists(select 1 from ladra.market_consultas c where c.id=consulta_id and (c.comprador_id=(select auth.uid()) or c.vendedor_id=(select auth.uid()))));
alter table ladra.negocio_pedidos add column cantidad integer not null default 1 check(cantidad between 1 and 100000),add column precio_unitario integer,add column stock_descontado boolean not null default false;
grant insert(cantidad) on ladra.negocio_pedidos to authenticated;
create function ladra.ventas_reservar_stock() returns trigger language plpgsql security invoker set search_path='' as $$
declare product uuid;remaining integer;
begin
 select producto_id into product from ladra.market_consultas where id=new.consulta_id and vendedor_id=auth.uid();
 if product is null then raise exception using errcode='42501',message='El pedido no pertenece a tu negocio.';end if;
 if tg_op='INSERT' then select precio_clp into new.precio_unitario from ladra.market_productos where id=product;new.stock_descontado:=false;return new;end if;
 if old.estado in('entregado','cancelado') and new.estado<>old.estado then raise exception 'El pedido ya está cerrado.';end if;
 new.precio_unitario:=old.precio_unitario;new.cantidad:=old.cantidad;new.consulta_id:=old.consulta_id;new.stock_descontado:=old.stock_descontado;
 if new.estado in('preparando','listo','entregado') and not old.stock_descontado then
  update ladra.market_productos set stock=stock-new.cantidad where id=product and stock>=new.cantidad returning stock into remaining;
  if not found then raise exception 'No hay stock suficiente. Actualiza el producto antes de confirmar.';end if;
  new.stock_descontado:=true;
 elsif new.estado='cancelado' and old.stock_descontado then
  update ladra.market_productos set stock=stock+new.cantidad where id=product;
  new.stock_descontado:=false;
 end if;
 return new;
end $$;
revoke all on function ladra.ventas_reservar_stock() from public,anon,authenticated;
create trigger ventas_reservar_stock before insert or update on ladra.negocio_pedidos for each row execute function ladra.ventas_reservar_stock();
create policy pedidos_cliente on ladra.negocio_pedidos for select to authenticated using(exists(select 1 from ladra.market_consultas c where c.id=consulta_id and c.comprador_id=(select auth.uid())));
notify pgrst,'reload schema';
commit;

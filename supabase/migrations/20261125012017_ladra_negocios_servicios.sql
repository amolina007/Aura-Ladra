begin;
create table ladra.negocios (
 propietario_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 nombre text not null check(char_length(btrim(nombre)) between 2 and 100),
 categoria text not null check(categoria in ('veterinaria','peluqueria','tienda','cuidados','otros')),
 descripcion text not null check(char_length(btrim(descripcion)) between 20 and 2000),
 comuna text not null check(char_length(btrim(comuna)) between 2 and 100),
 foto_path text check(foto_path is null or (split_part(foto_path,'/',1)=propietario_id::text and foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')),
 publicado boolean not null default true,
 creado_en timestamptz not null default now()
);
alter table ladra.negocios enable row level security;
revoke all on ladra.negocios from public,anon,authenticated;
grant select on ladra.negocios to anon,authenticated;
grant insert(nombre,categoria,descripcion,comuna,foto_path,publicado),update(nombre,categoria,descripcion,comuna,foto_path,publicado) on ladra.negocios to authenticated;
create policy negocios_ver on ladra.negocios for select to anon,authenticated using(publicado or propietario_id=(select auth.uid()));
create policy negocios_crear on ladra.negocios for insert to authenticated with check(propietario_id=(select auth.uid()));
create policy negocios_editar on ladra.negocios for update to authenticated using(propietario_id=(select auth.uid())) with check(propietario_id=(select auth.uid()));
-- Los prestadores que ya publicaban conservan acceso; no se publica un perfil empresarial sin su decisión.
insert into ladra.negocios(propietario_id,nombre,categoria,descripcion,comuna,publicado)
 select propietario_id,min(nombre),'otros','Completa la presentación de tu negocio para darlo a conocer.',min(zona),false from (
 select propietario_id,prestador nombre,zona from ladra.servicios
 union all select propietario_id,vendedor_alias,comuna from ladra.market_productos
 ) x group by propietario_id on conflict do nothing;

alter table ladra.servicios drop constraint servicios_categoria_check;
alter table ladra.servicios add constraint servicios_categoria_check check(categoria in ('veterinaria','estetica','entrenamiento','paseos','cuidado','refugio','transporte','otros'));
create function ladra.exigir_trabajador() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from ladra.negocios where propietario_id=auth.uid()) then
 raise exception using errcode='42501',message='Activa tu perfil de trabajador en Mi negocio.'; end if;
 if new.propietario_id<>auth.uid() then raise exception using errcode='42501',message='Solo puedes gestionar tu negocio.'; end if;
 return new;
end $$;
revoke all on function ladra.exigir_trabajador() from public,anon,authenticated;
create trigger negocios_servicios_trabajador before insert or update on ladra.servicios for each row execute function ladra.exigir_trabajador();
create trigger negocios_productos_trabajador before insert or update on ladra.market_productos for each row execute function ladra.exigir_trabajador();
-- Solo los productos publicados por negocios que decidieron abrir su vitrina son visibles sin sesión.
grant select(id,vendedor_alias,titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega,foto_path,estado,creado_en) on ladra.market_productos to anon;
create policy negocios_productos_publicos on ladra.market_productos for select to anon using(estado='publicado' and exists(select 1 from ladra.negocios n where n.propietario_id=market_productos.propietario_id and n.publicado));
create policy negocios_fotos_vitrina on storage.objects for select to anon using(bucket_id='market-ladra' and exists(select 1 from ladra.market_productos p where p.foto_path=objects.name and p.estado='publicado'));

create table ladra.negocio_pedidos (
 id uuid primary key default gen_random_uuid(),
 propietario_id uuid not null default auth.uid() references ladra.negocios(propietario_id),
 consulta_id uuid not null unique references ladra.market_consultas(id),
 estado text not null default 'por_confirmar' check(estado in ('por_confirmar','preparando','listo','entregado','cancelado')),
 creado_en timestamptz not null default now()
);
create table ladra.negocio_citas (
 id uuid primary key default gen_random_uuid(),
 propietario_id uuid not null default auth.uid() references ladra.negocios(propietario_id),
 consulta_id uuid not null unique references ladra.servicio_consultas(id),
 dia date not null,
 hora time not null,
 estado text not null default 'confirmada' check(estado in ('confirmada','completada','cancelada')),
 creado_en timestamptz not null default now()
);
create index negocio_pedidos_propietario_idx on ladra.negocio_pedidos(propietario_id,creado_en desc);
create index negocio_citas_propietario_idx on ladra.negocio_citas(propietario_id,dia,hora);
create unique index negocio_citas_horario_idx on ladra.negocio_citas(propietario_id,dia,hora) where estado='confirmada';
alter table ladra.negocio_pedidos enable row level security;
alter table ladra.negocio_citas enable row level security;
revoke all on ladra.negocio_pedidos,ladra.negocio_citas from public,anon,authenticated;
grant select on ladra.negocio_pedidos,ladra.negocio_citas to authenticated;
grant insert(consulta_id),update(estado) on ladra.negocio_pedidos to authenticated;
grant insert(consulta_id,dia,hora),update(estado,dia,hora) on ladra.negocio_citas to authenticated;
create policy pedidos_propios on ladra.negocio_pedidos for select to authenticated using(propietario_id=(select auth.uid()));
create policy pedidos_crear on ladra.negocio_pedidos for insert to authenticated with check(propietario_id=(select auth.uid()) and exists(select 1 from ladra.market_consultas c where c.id=consulta_id and c.vendedor_id=(select auth.uid())));
create policy pedidos_editar on ladra.negocio_pedidos for update to authenticated using(propietario_id=(select auth.uid())) with check(propietario_id=(select auth.uid()));
create policy citas_propias on ladra.negocio_citas for select to authenticated using(propietario_id=(select auth.uid()));
create policy citas_crear on ladra.negocio_citas for insert to authenticated with check(propietario_id=(select auth.uid()) and exists(select 1 from ladra.servicio_consultas c where c.id=consulta_id and c.prestador_id=(select auth.uid())));
create policy citas_editar on ladra.negocio_citas for update to authenticated using(propietario_id=(select auth.uid())) with check(propietario_id=(select auth.uid()));
create trigger pedidos_trabajador before insert or update on ladra.negocio_pedidos for each row execute function ladra.exigir_trabajador();
create trigger citas_trabajador before insert or update on ladra.negocio_citas for each row execute function ladra.exigir_trabajador();

grant update(titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega) on ladra.market_productos to authenticated;
create or replace function ladra.market_validar_producto() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_alias text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Inicia sesión.'; end if;
 select nombre into v_alias from ladra.negocios where propietario_id=auth.uid();
 if v_alias is null then raise exception using errcode='42501',message='Activa tu perfil de trabajador en Mi negocio.'; end if;
 if tg_op='INSERT' then
  new.propietario_id:=auth.uid();new.vendedor_alias:=v_alias;
  if split_part(new.foto_path,'/',1)<>auth.uid()::text or new.foto_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' or not exists(select 1 from storage.objects o where o.bucket_id='market-ladra' and o.name=new.foto_path) then
   raise exception using errcode='42501',message='Selecciona una foto subida por tu cuenta.';
  end if;
 else
  if old.propietario_id<>auth.uid() then raise exception using errcode='42501',message='Solo puedes gestionar tu negocio.';end if;
  new.propietario_id:=old.propietario_id;new.vendedor_alias:=v_alias;new.actualizado_en:=now();
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;

begin;

-- La proyeccion de perfiles publicos no concede lectura directa al rol de la app.
-- El trigger solo obtiene el alias del perfil visible de quien inicia sesion.
create or replace function ladra.market_validar_producto() returns trigger language plpgsql
security definer set search_path='' as $$
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
    if split_part(new.foto_path,'/',1)<>auth.uid()::text or new.foto_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'
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

commit;

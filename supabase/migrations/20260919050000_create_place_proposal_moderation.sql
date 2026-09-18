create table if not exists ladra.propuestas_lugares (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('nuevo','modificar','rectificar')),
  lugar_id uuid references ladra.lugares_publicos(id) on delete set null,
  datos_propuestos jsonb not null,
  motivo text not null check (char_length(btrim(motivo)) between 10 and 500),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  moderado_por uuid references auth.users(id) on delete set null,
  moderado_en timestamptz,
  check ((tipo = 'nuevo' and lugar_id is null) or (tipo in ('modificar','rectificar') and lugar_id is not null))
);

alter table ladra.propuestas_lugares enable row level security;
alter table ladra.propuestas_lugares force row level security;

create policy propuestas_lugares_insert_anon on ladra.propuestas_lugares
for insert to anon with check (creado_por is null and estado = 'pendiente');

create policy propuestas_lugares_insert_auth on ladra.propuestas_lugares
for insert to authenticated with check (creado_por = (select auth.uid()) and estado = 'pendiente');

create policy propuestas_lugares_lectura_propia_o_capitan on ladra.propuestas_lugares
for select to authenticated using (
  creado_por = (select auth.uid())
  or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
);

grant insert (tipo,lugar_id,datos_propuestos,motivo,estado,creado_por) on ladra.propuestas_lugares to anon, authenticated;
grant select on ladra.propuestas_lugares to authenticated;

create or replace function ladra.moderar_propuesta_lugar(p_propuesta_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = pg_catalog, ladra as $$
declare
  v_propuesta ladra.propuestas_lugares%rowtype;
  v_datos jsonb;
  v_slug text;
begin
  if auth.uid() is null or not exists (select 1 from ladra.moderadores m where m.usuario_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'Solo el capitán puede moderar propuestas.';
  end if;
  if p_decision not in ('aprobar','rechazar') then
    raise exception using errcode = '22023', message = 'Decisión inválida.';
  end if;
  select * into v_propuesta from ladra.propuestas_lugares where id = p_propuesta_id and estado = 'pendiente' for update;
  if not found then raise exception using errcode = 'P0002', message = 'La propuesta ya fue revisada o no existe.'; end if;
  if p_decision = 'rechazar' then
    update ladra.propuestas_lugares set estado='rechazada',moderado_por=auth.uid(),moderado_en=now() where id=p_propuesta_id;
    return;
  end if;
  v_datos := v_propuesta.datos_propuestos;
  if coalesce(v_datos->>'nombre','') = '' or coalesce(v_datos->>'descripcion','') = '' then
    raise exception using errcode = '22023', message = 'Faltan nombre o descripción.';
  end if;
  if coalesce((v_datos->>'servicio_urgencia')::boolean,false) and v_datos->>'categoria' <> 'veterinaria' then
    raise exception using errcode = '22023', message = 'Solo una veterinaria puede indicar urgencias.';
  end if;
  if coalesce((v_datos->>'urgencia_24h')::boolean,false) and not coalesce((v_datos->>'servicio_urgencia')::boolean,false) then
    raise exception using errcode = '22023', message = 'Urgencia 24 h requiere atención de urgencia.';
  end if;
  if v_propuesta.tipo = 'nuevo' then
    v_slug := coalesce(nullif(v_datos->>'slug',''),'lugar');
    if exists (select 1 from ladra.lugares_publicos where slug=v_slug) then v_slug := v_slug || '-' || left(v_propuesta.id::text,8); end if;
    insert into ladra.lugares_publicos(slug,nombre,descripcion,direccion_publica,comuna,categoria,estado_verificacion,latitud,longitud,publicado,servicio_urgencia,urgencia_24h,horario_publico,telefono_publico,sitio_web,precision_ubicacion,creado_por)
    values(v_slug,btrim(v_datos->>'nombre'),btrim(v_datos->>'descripcion'),nullif(btrim(v_datos->>'direccion_publica'),''),btrim(v_datos->>'comuna'),v_datos->>'categoria','verificado',nullif(v_datos->>'latitud','')::numeric,nullif(v_datos->>'longitud','')::numeric,true,coalesce((v_datos->>'servicio_urgencia')::boolean,false),coalesce((v_datos->>'urgencia_24h')::boolean,false),nullif(btrim(v_datos->>'horario_publico'),''),nullif(btrim(v_datos->>'telefono_publico'),''),nullif(btrim(v_datos->>'sitio_web'),''),coalesce(nullif(v_datos->>'precision_ubicacion',''),'exacta'),auth.uid());
  else
    update ladra.lugares_publicos set nombre=btrim(v_datos->>'nombre'),descripcion=btrim(v_datos->>'descripcion'),direccion_publica=nullif(btrim(v_datos->>'direccion_publica'),''),comuna=btrim(v_datos->>'comuna'),categoria=v_datos->>'categoria',latitud=nullif(v_datos->>'latitud','')::numeric,longitud=nullif(v_datos->>'longitud','')::numeric,servicio_urgencia=coalesce((v_datos->>'servicio_urgencia')::boolean,false),urgencia_24h=coalesce((v_datos->>'urgencia_24h')::boolean,false),horario_publico=nullif(btrim(v_datos->>'horario_publico'),''),telefono_publico=nullif(btrim(v_datos->>'telefono_publico'),''),sitio_web=nullif(btrim(v_datos->>'sitio_web'),''),precision_ubicacion=coalesce(nullif(v_datos->>'precision_ubicacion',''),'exacta'),estado_verificacion='verificado',actualizado_en=now() where id=v_propuesta.lugar_id;
    if not found then raise exception using errcode = 'P0002', message = 'El lugar original ya no existe.'; end if;
  end if;
  update ladra.propuestas_lugares set estado='aprobada',moderado_por=auth.uid(),moderado_en=now() where id=p_propuesta_id;
end; $$;

revoke all on function ladra.moderar_propuesta_lugar(uuid,text) from public, anon, authenticated;
grant execute on function ladra.moderar_propuesta_lugar(uuid,text) to authenticated;
notify pgrst, 'reload schema';

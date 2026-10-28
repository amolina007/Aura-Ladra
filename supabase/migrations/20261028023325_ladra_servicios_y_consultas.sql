-- Solo ladra. Aplicada en Supabase con versión 20261028023325; sin ofertas ficticias.
begin;

create table ladra.servicios (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id),
  titulo text not null check (length(btrim(titulo)) between 3 and 100),
  prestador text not null check (length(btrim(prestador)) between 2 and 100),
  categoria text not null check (categoria in ('estetica','entrenamiento','paseos','cuidado','otros')),
  zona text not null check (length(btrim(zona)) between 2 and 100),
  modalidad text not null check (modalidad in ('local','domicilio','aire_libre','online')),
  precio_clp integer check (precio_clp between 0 and 10000000),
  precio_tipo text not null default 'desde' check (precio_tipo in ('desde','fijo')),
  duracion_min integer check (duracion_min between 5 and 1440),
  descripcion text not null check (length(btrim(descripcion)) between 20 and 2000),
  foto_url text check (foto_url is null or (length(foto_url) <= 1500 and foto_url ~ '^https://')),
  publicado boolean not null default true,
  creado_en timestamptz not null default now()
);
create index servicios_propietario_idx on ladra.servicios(propietario_id);
create index servicios_catalogo_idx on ladra.servicios(creado_en desc) where publicado;
alter table ladra.servicios enable row level security;
create policy servicios_lectura on ladra.servicios for select to anon,authenticated
  using (publicado or propietario_id=(select auth.uid()));
create policy servicios_crear on ladra.servicios for insert to authenticated
  with check (propietario_id=(select auth.uid()));
create policy servicios_retirar on ladra.servicios for update to authenticated
  using (propietario_id=(select auth.uid())) with check (propietario_id=(select auth.uid()));
revoke all on ladra.servicios from public,anon,authenticated;
grant select on ladra.servicios to anon,authenticated;
grant insert(titulo,prestador,categoria,zona,modalidad,precio_clp,precio_tipo,duracion_min,descripcion,foto_url) on ladra.servicios to authenticated;
grant update(publicado) on ladra.servicios to authenticated;

create table ladra.servicio_consultas (
  id uuid primary key default gen_random_uuid(),
  solicitud_clave uuid not null,
  solicitante_id uuid not null default auth.uid() references auth.users(id),
  servicio_id uuid not null references ladra.servicios(id),
  animal_id uuid not null references ladra.animales(id),
  -- Copias mínimas para que el prestador no necesite leer una ficha privada.
  prestador_id uuid not null references auth.users(id),
  servicio_titulo text not null,
  mascota_nombre text not null,
  dia_preferido date not null,
  horario text not null check (horario in ('manana','tarde','a_convenir')),
  mensaje text not null check (length(btrim(mensaje)) between 10 and 800),
  estado text not null default 'pendiente' check (estado in ('pendiente','respondida','no_disponible')),
  respuesta text check (length(respuesta) between 10 and 800),
  creado_en timestamptz not null default now(),
  unique(solicitante_id,solicitud_clave)
);
create index servicio_consultas_solicitante_idx on ladra.servicio_consultas(solicitante_id,creado_en desc);
create index servicio_consultas_prestador_idx on ladra.servicio_consultas(prestador_id,creado_en desc);
create index servicio_consultas_servicio_idx on ladra.servicio_consultas(servicio_id);
create index servicio_consultas_animal_idx on ladra.servicio_consultas(animal_id);
alter table ladra.servicio_consultas enable row level security;

create function ladra.validar_servicio_consulta() returns trigger language plpgsql
security invoker set search_path='' as $$
declare v_servicio ladra.servicios; v_nombre text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar.'; end if;
  if TG_OP='INSERT' then
    select * into v_servicio from ladra.servicios where id=new.servicio_id and publicado;
    if not found then raise exception 'Este servicio ya no está disponible.'; end if;
    if v_servicio.propietario_id=auth.uid() then raise exception 'No puedes consultar tu propio servicio.'; end if;
    select nombre into v_nombre from ladra.animales
      where id=new.animal_id and creado_por=auth.uid() and not coalesce(es_conmemorativa,false);
    if not found then raise exception 'Selecciona una mascota propia y viva.'; end if;
    if new.dia_preferido < (now() at time zone 'America/Santiago')::date
       or new.dia_preferido > (now() at time zone 'America/Santiago')::date + 365 then
      raise exception 'Selecciona un día entre hoy y los próximos 365 días.';
    end if;
    new.solicitante_id:=auth.uid();
    new.prestador_id:=v_servicio.propietario_id;
    new.servicio_titulo:=v_servicio.titulo;
    new.mascota_nombre:=v_nombre;
    new.estado:='pendiente';
    new.respuesta:=null;
  else
    if old.prestador_id<>auth.uid() or old.estado<>'pendiente' then
      raise exception 'Solo el prestador puede responder una consulta pendiente.';
    end if;
    if new.estado not in ('respondida','no_disponible') or new.respuesta is null or length(btrim(new.respuesta))<10 then
      raise exception 'Escribe una respuesta de al menos 10 caracteres.';
    end if;
  end if;
  return new;
end $$;
revoke all on function ladra.validar_servicio_consulta() from public,anon,authenticated;
create trigger validar_servicio_consulta before insert or update on ladra.servicio_consultas
  for each row execute function ladra.validar_servicio_consulta();
create policy servicio_consultas_lectura on ladra.servicio_consultas for select to authenticated
  using (solicitante_id=(select auth.uid()) or prestador_id=(select auth.uid()));
create policy servicio_consultas_crear on ladra.servicio_consultas for insert to authenticated
  with check (solicitante_id=(select auth.uid()) and exists (
    select 1 from ladra.servicios s where s.id=servicio_id and s.publicado and s.propietario_id=prestador_id
  ));
create policy servicio_consultas_responder on ladra.servicio_consultas for update to authenticated
  using (prestador_id=(select auth.uid())) with check (prestador_id=(select auth.uid()));
revoke all on ladra.servicio_consultas from public,anon,authenticated;
grant select on ladra.servicio_consultas to authenticated;
grant insert(solicitud_clave,servicio_id,animal_id,dia_preferido,horario,mensaje) on ladra.servicio_consultas to authenticated;
grant update(estado,respuesta) on ladra.servicio_consultas to authenticated;
notify pgrst,'reload schema';
commit;

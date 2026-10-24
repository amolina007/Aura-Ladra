-- Patrocinio en AC para campañas publicadas de Ladra. No emite AC ni convierte CLP.
-- Requiere el libro central de Aura instalado. No modifica objetos de public ni core.
-- Única integración fuera de ladra: un trigger sobre aura_coin.bloqueo protege
-- reservas de campañas frente a cancelaciones/canjes ajenos a este flujo.
-- Probar en PostgreSQL desechable antes de aplicar al proyecto Aura compartido.

create table ladra.campanas_patrocinio_ac (
  aviso_id uuid primary key references ladra.avisos_puestos(id) on delete restrict,
  estado text not null default 'recaudando' check (estado in ('recaudando','meta_alcanzada','completada','expirada','cancelada')),
  meta_alcanzada_en timestamptz,
  entrega_hasta timestamptz,
  cerrada_en timestamptz,
  creado_en timestamptz not null default now()
);
create table ladra.patrocinios_ac (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references ladra.campanas_patrocinio_ac(aviso_id) on delete restrict,
  usuario_id uuid not null references auth.users(id) on delete restrict,
  clave uuid not null,
  monto_ac bigint not null check (monto_ac > 0 and monto_ac <= 10000000),
  reserva_op uuid not null unique references aura_coin.bloqueo(operacion_id) on delete restrict,
  liberado_ac bigint not null default 0 check (liberado_ac >= 0),
  devuelto_ac bigint not null default 0 check (devuelto_ac >= 0),
  creado_en timestamptz not null default now(),
  unique (usuario_id,clave),
  check (liberado_ac + devuelto_ac <= monto_ac)
);
create index patrocinios_ac_aviso_idx on ladra.patrocinios_ac(aviso_id);
create table ladra.hitos_patrocinio_ac (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references ladra.campanas_patrocinio_ac(aviso_id) on delete restrict,
  autor_id uuid not null references auth.users(id) on delete restrict,
  clave uuid not null,
  titulo text not null check (length(btrim(titulo)) between 8 and 120),
  evidencia_url text not null check (evidencia_url ~ '^https://[^[:space:]]+$' and length(evidencia_url) <= 1000),
  monto_ac bigint not null check (monto_ac > 0 and monto_ac <= 10000000),
  estado text not null default 'en_revision' check (estado in ('en_revision','aprobado','rechazado')),
  revisado_por uuid references auth.users(id) on delete restrict,
  resolucion text check (length(resolucion) <= 600),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  unique (autor_id,clave)
);
create index hitos_patrocinio_ac_aviso_idx on ladra.hitos_patrocinio_ac(aviso_id);
create index hitos_patrocinio_ac_revision_idx on ladra.hitos_patrocinio_ac(estado,creado_en);

alter table ladra.campanas_patrocinio_ac enable row level security;
alter table ladra.campanas_patrocinio_ac force row level security;
alter table ladra.patrocinios_ac enable row level security;
alter table ladra.patrocinios_ac force row level security;
alter table ladra.hitos_patrocinio_ac enable row level security;
alter table ladra.hitos_patrocinio_ac force row level security;
revoke all on ladra.campanas_patrocinio_ac, ladra.patrocinios_ac, ladra.hitos_patrocinio_ac from public,anon,authenticated;

-- Las funciones privilegiadas se revocan de PUBLIC al final de esta misma migración.
create function ladra._patrocinio_uid() returns uuid language plpgsql stable security definer
set search_path = pg_catalog, ladra as $$
declare u uuid := auth.uid();
begin
  if u is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then raise exception 'SESION_REQUERIDA' using errcode='28000'; end if;
  if exists(select 1 from ladra.cuentas_baneadas where usuario_id=u) then raise exception 'PERMISO_DENEGADO' using errcode='42501'; end if;
  return u;
end $$;

create function ladra.proteger_reserva_patrocinio_ac() returns trigger language plpgsql security definer
set search_path = pg_catalog, ladra as $$
begin
  if exists(select 1 from ladra.patrocinios_ac where reserva_op=old.operacion_id)
     and coalesce(current_setting('ladra.patrocinio_interno',true),'') <> '1' then
    raise exception 'Esta reserva respalda una campaña de Ladra; se libera por hitos o se devuelve al vencer/cancelarse la campaña.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger ladra_reserva_patrocinio before update or delete on aura_coin.bloqueo
for each row execute function ladra.proteger_reserva_patrocinio_ac();

-- Devuelve únicamente lo no liberado. Actor contable = patrocinador original;
-- la referencia deja claro que es una devolución automática, no una orden suya.
-- Es interna: solo vencimientos o el retiro de un aviso pueden invocarla.
create function ladra._devolver_patrocinio_ac(p_aviso uuid,p_estado text) returns void language plpgsql security definer
set search_path = pg_catalog, ladra as $$
declare r record; op uuid; cantidad bigint; cuentas uuid[];
  prev text := coalesce(current_setting('aura_coin.interno',true),'');
  prev_ladra text := coalesce(current_setting('ladra.patrocinio_interno',true),'');
begin
  if p_estado not in ('expirada','cancelada') then raise exception 'Estado inválido'; end if;
  perform 1 from ladra.campanas_patrocinio_ac where aviso_id=p_aviso for update;
  select array_agg(distinct b.cuenta_id) into cuentas from ladra.patrocinios_ac a join aura_coin.bloqueo b on b.operacion_id=a.reserva_op where a.aviso_id=p_aviso;
  perform aura_coin._bloquear(coalesce(cuentas,array[]::uuid[]));
  for r in select a.*, b.cuenta_id from ladra.patrocinios_ac a join aura_coin.bloqueo b on b.operacion_id=a.reserva_op where a.aviso_id=p_aviso order by a.id loop
    cantidad := r.monto_ac-r.liberado_ac-r.devuelto_ac;
    if cantidad=0 then continue; end if;
    if (select restante from aura_coin.bloqueo where operacion_id=r.reserva_op for update) <> cantidad then raise exception 'La reserva no coincide con el aporte; requiere revisión.'; end if;
    insert into aura_coin.operacion(tipo,actor,clave,huella,motivo,referencia,monedas,clp,cuenta_id,refiere,destino)
      values('cancelacion_reserva',r.usuario_id,'ladra-devolucion:'||r.id,md5('ladra-devolucion:'||r.id),
      'Devolución automática de patrocinio: '||p_estado,'ladra:campana:'||p_aviso,cantidad,0,r.cuenta_id,r.reserva_op,'auraladra') returning id into op;
    perform set_config('aura_coin.interno','1',true);
    perform set_config('ladra.patrocinio_interno','1',true);
    update aura_coin.bloqueo set restante=restante-cantidad where operacion_id=r.reserva_op;
    perform set_config('aura_coin.interno',prev,true);
    perform set_config('ladra.patrocinio_interno',prev_ladra,true);
    perform aura_coin._pata(op,r.cuenta_id,'bloqueado',-cantidad);
    perform aura_coin._pata(op,r.cuenta_id,'disponible',cantidad);
    update ladra.patrocinios_ac set devuelto_ac=devuelto_ac+cantidad where id=r.id;
  end loop;
  update ladra.campanas_patrocinio_ac set estado=p_estado,cerrada_en=clock_timestamp() where aviso_id=p_aviso and estado not in ('completada','expirada','cancelada');
  update ladra.hitos_patrocinio_ac set estado='rechazado',resolucion='La campaña cerró antes de aprobar este hito.',revisado_en=clock_timestamp() where aviso_id=p_aviso and estado='en_revision';
end $$;

create function ladra.sincronizar_campana_patrocinio_ac() returns trigger language plpgsql security definer
set search_path = pg_catalog, ladra as $$
begin
  if new.estado='publicado' and new.meta_ac is not null then
    insert into ladra.campanas_patrocinio_ac(aviso_id) values(new.id) on conflict do nothing;
  elsif new.estado='retirado' then
    perform ladra._devolver_patrocinio_ac(new.id,'cancelada');
  end if;
  return new;
end $$;
create trigger campana_patrocinio_estado after insert or update of estado on ladra.avisos_puestos
for each row execute function ladra.sincronizar_campana_patrocinio_ac();
insert into ladra.campanas_patrocinio_ac(aviso_id) select id from ladra.avisos_puestos where estado='publicado' and meta_ac is not null;

create function ladra.vencer_patrocinios_ac() returns integer language plpgsql security definer
set search_path = pg_catalog, ladra as $$
declare r record; n integer := 0;
begin
  for r in select c.aviso_id from ladra.campanas_patrocinio_ac c join ladra.avisos_puestos a on a.id=c.aviso_id
    where (c.estado='recaudando' and a.recaudacion_hasta<=clock_timestamp()) or (c.estado='meta_alcanzada' and c.entrega_hasta<=clock_timestamp())
    order by c.aviso_id for update of c skip locked loop
    perform ladra._devolver_patrocinio_ac(r.aviso_id,'expirada'); n:=n+1;
  end loop;
  return n;
end $$;

create function ladra.estado_patrocinio_ac(p_aviso uuid) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, ladra as $$
declare a ladra.avisos_puestos%rowtype; c ladra.campanas_patrocinio_ac%rowtype; u uuid:=auth.uid(); total bigint;lib bigint;dev bigint; propio bigint; estado text;
begin
  select * into a from ladra.avisos_puestos where id=p_aviso;
  if not found or (a.estado<>'publicado' and a.autor_id is distinct from u and not exists(select 1 from ladra.moderadores where usuario_id=u)) then raise exception 'Campaña no disponible' using errcode='42501'; end if;
  select * into c from ladra.campanas_patrocinio_ac where aviso_id=p_aviso;
  if not found then return jsonb_build_object('habilitado',false); end if;
  select coalesce(sum(monto_ac),0),coalesce(sum(liberado_ac),0),coalesce(sum(devuelto_ac),0),coalesce(sum(monto_ac-devuelto_ac) filter(where usuario_id=u),0)
    into total,lib,dev,propio from ladra.patrocinios_ac where aviso_id=p_aviso;
  estado:=c.estado;
  if (estado='recaudando' and a.recaudacion_hasta<=clock_timestamp()) or (estado='meta_alcanzada' and c.entrega_hasta<=clock_timestamp()) then estado:='expirada'; end if;
  return jsonb_build_object('habilitado',true,'estado',estado,'meta_ac',a.meta_ac,'recaudado_ac',total-dev,'reservado_ac',total-lib-dev,'liberado_ac',lib,'devuelto_ac',dev,
    'mi_aporte_ac',propio,'soy_responsable',a.autor_id=u,'puedo_moderar',exists(select 1 from ladra.moderadores where usuario_id=u) and a.autor_id<>u,
    'entrega_hasta',c.entrega_hasta,'devolucion_pendiente',estado='expirada' and c.estado<>estado,
    'hitos',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'titulo',h.titulo,'evidencia_url',h.evidencia_url,'monto_ac',h.monto_ac,'estado',h.estado,'resolucion',h.resolucion) order by h.creado_en) from ladra.hitos_patrocinio_ac h where h.aviso_id=p_aviso),'[]'::jsonb));
end $$;

create function ladra.saldo_patrocinio_ac() returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, ladra as $$
begin
  perform ladra._patrocinio_uid();
  return public.fn_ac_mi_saldo() || jsonb_build_object('terminos',public.fn_ac_mi_aceptacion());
end $$;

create function ladra.patrocinar_campana_ac(p_aviso uuid,p_monto bigint,p_clave uuid) returns jsonb language plpgsql security definer
set search_path = pg_catalog, ladra as $$
declare u uuid:=ladra._patrocinio_uid();a ladra.avisos_puestos%rowtype;c ladra.campanas_patrocinio_ac%rowtype; previo ladra.patrocinios_ac%rowtype; total bigint;res jsonb;
begin
  if p_clave is null or p_monto is null or p_monto<1 or p_monto>10000000 then raise exception 'Elige una cantidad entera de AC entre 1 y 10.000.000.'; end if;
  select * into a from ladra.avisos_puestos where id=p_aviso;
  select * into c from ladra.campanas_patrocinio_ac where aviso_id=p_aviso for update;
  if not found then raise exception 'Esta campaña no recibe patrocinios.'; end if;
  select * into previo from ladra.patrocinios_ac where usuario_id=u and clave=p_clave;
  if found then
    if previo.aviso_id<>p_aviso or previo.monto_ac<>p_monto then raise exception 'La confirmación ya corresponde a otro aporte.'; end if;
    return ladra.estado_patrocinio_ac(p_aviso)||jsonb_build_object('repetida',true);
  end if;
  if a.estado<>'publicado' or c.estado<>'recaudando' or a.recaudacion_hasta is null or a.recaudacion_hasta<=clock_timestamp() then raise exception 'La campaña ya no recibe aportes.'; end if;
  if a.autor_id=u then raise exception 'El responsable no puede patrocinar su propia campaña.'; end if;
  if core.hay_bloqueo(u,a.autor_id) then raise exception 'No es posible patrocinar esta campaña.' using errcode='42501'; end if;
  if not coalesce((public.fn_ac_mi_aceptacion()->>'aceptada')::boolean,false) then raise exception 'Revisa y acepta los términos de AC en tu billetera antes de patrocinar.'; end if;
  select coalesce(sum(monto_ac-devuelto_ac),0) into total from ladra.patrocinios_ac where aviso_id=p_aviso;
  if total+p_monto>a.meta_ac then raise exception 'El aporte supera lo que falta para completar la meta (% AC).',a.meta_ac-total; end if;
  res:=public.fn_ac_reservar_producto(p_monto,'auraladra','Patrocinio de campaña de Ladra','ladra-patrocinio:'||p_clave,'ladra:campana:'||p_aviso);
  insert into ladra.patrocinios_ac(aviso_id,usuario_id,clave,monto_ac,reserva_op) values(p_aviso,u,p_clave,p_monto,(res->>'operacion_id')::uuid);
  if total+p_monto=a.meta_ac then update ladra.campanas_patrocinio_ac set estado='meta_alcanzada',meta_alcanzada_en=clock_timestamp(),entrega_hasta=clock_timestamp()+make_interval(days=>a.plazo_habilitacion_dias) where aviso_id=p_aviso; end if;
  return ladra.estado_patrocinio_ac(p_aviso)||jsonb_build_object('repetida',false);
end $$;

create function ladra.proponer_hito_patrocinio_ac(p_aviso uuid,p_titulo text,p_evidencia text,p_monto bigint,p_clave uuid) returns uuid language plpgsql security definer
set search_path = pg_catalog, ladra as $$
declare u uuid:=ladra._patrocinio_uid(); c ladra.campanas_patrocinio_ac%rowtype; prev ladra.hitos_patrocinio_ac%rowtype; id_h uuid; restante bigint; pendiente bigint;
begin
  select * into c from ladra.campanas_patrocinio_ac where aviso_id=p_aviso for update;
  if not found or not exists(select 1 from ladra.avisos_puestos where id=p_aviso and autor_id=u and estado='publicado') then raise exception 'PERMISO_DENEGADO' using errcode='42501'; end if;
  select * into prev from ladra.hitos_patrocinio_ac where autor_id=u and clave=p_clave;
  if found then
    if prev.aviso_id<>p_aviso or prev.titulo is distinct from btrim(p_titulo) or prev.evidencia_url is distinct from btrim(p_evidencia) or prev.monto_ac is distinct from p_monto then raise exception 'La confirmación ya corresponde a otro hito.'; end if;
    return prev.id;
  end if;
  if c.estado<>'meta_alcanzada' or c.entrega_hasta<=clock_timestamp() then raise exception 'La campaña no admite hitos en este momento.'; end if;
  select coalesce(sum(monto_ac-liberado_ac-devuelto_ac),0) into restante from ladra.patrocinios_ac where aviso_id=p_aviso;
  select coalesce(sum(monto_ac),0) into pendiente from ladra.hitos_patrocinio_ac where aviso_id=p_aviso and estado='en_revision';
  if p_monto is null or p_monto<=0 or p_monto+pendiente>restante then raise exception 'El monto excede las AC reservadas sin hitos pendientes.'; end if;
  insert into ladra.hitos_patrocinio_ac(aviso_id,autor_id,clave,titulo,evidencia_url,monto_ac) values(p_aviso,u,p_clave,btrim(p_titulo),btrim(p_evidencia),p_monto) returning id into id_h;
  return id_h;
end $$;

create function ladra.revisar_hito_patrocinio_ac(p_hito uuid,p_aprobar boolean,p_resolucion text) returns jsonb language plpgsql security definer
set search_path = pg_catalog, ladra as $$
declare u uuid:=ladra._patrocinio_uid(); h ladra.hitos_patrocinio_ac%rowtype; c ladra.campanas_patrocinio_ac%rowtype; autor uuid; dest uuid; cuentas uuid[]; r record; resta bigint; cantidad bigint; op uuid; rep boolean;
  prev text:=coalesce(current_setting('aura_coin.interno',true),''); prev_ladra text:=coalesce(current_setting('ladra.patrocinio_interno',true),'');
begin
  if not exists(select 1 from ladra.moderadores where usuario_id=u) then raise exception 'PERMISO_DENEGADO' using errcode='42501'; end if;
  select * into h from ladra.hitos_patrocinio_ac where id=p_hito;
  if not found then raise exception 'Hito no disponible'; end if;
  select * into c from ladra.campanas_patrocinio_ac where aviso_id=h.aviso_id for update;
  -- Otra revisión puede haber esperado el mismo bloqueo: releer su resolución.
  select * into h from ladra.hitos_patrocinio_ac where id=p_hito;
  select autor_id into autor from ladra.avisos_puestos where id=h.aviso_id;
  if u=autor then raise exception 'Otro moderador debe revisar los hitos de tu campaña.' using errcode='42501'; end if;
  if p_aprobar is null or p_resolucion is null or length(btrim(p_resolucion)) not between 10 and 600 then raise exception 'Escribe una resolución entre 10 y 600 caracteres.'; end if;
  if h.estado<>'en_revision' then
    if (h.estado='aprobado') is distinct from p_aprobar then raise exception 'El hito ya tiene otra resolución.'; end if;
    return ladra.estado_patrocinio_ac(h.aviso_id)||jsonb_build_object('repetida',true);
  end if;
  if c.estado<>'meta_alcanzada' or c.entrega_hasta<=clock_timestamp() then raise exception 'La campaña no admite liberaciones.'; end if;
  if p_aprobar then
    perform aura_coin.exigir_operaciones();
    if core.hay_bloqueo(u,autor) then raise exception 'No es posible revisar este hito.' using errcode='42501'; end if;
    dest:=aura_coin._wallet(autor,true);
    select array_agg(distinct cuenta_id) into cuentas from (select b.cuenta_id from ladra.patrocinios_ac a join aura_coin.bloqueo b on b.operacion_id=a.reserva_op where a.aviso_id=h.aviso_id union select dest) q;
    perform aura_coin._bloquear(cuentas);
    resta:=h.monto_ac;
    for r in select a.*, b.cuenta_id from ladra.patrocinios_ac a join aura_coin.bloqueo b on b.operacion_id=a.reserva_op where a.aviso_id=h.aviso_id order by a.creado_en,a.id loop
      cantidad:=least(resta,r.monto_ac-r.liberado_ac-r.devuelto_ac);
      if cantidad<=0 then continue; end if;
      if (select restante from aura_coin.bloqueo where operacion_id=r.reserva_op for update) <> r.monto_ac-r.liberado_ac-r.devuelto_ac then raise exception 'La reserva no coincide con el aporte; requiere revisión.'; end if;
      select op_id,repetida into op,rep from aura_coin._abrir('transferencia','ladra-hito:'||p_hito||':'||r.id,'Hito aprobado de Ladra','ladra:campana:'||h.aviso_id,cantidad,0,p_hito::text,r.cuenta_id,dest,r.reserva_op);
      if rep then raise exception 'La operación del hito ya existe sin su registro; requiere revisión.'; end if;
      perform set_config('aura_coin.interno','1',true); perform set_config('ladra.patrocinio_interno','1',true);
      update aura_coin.bloqueo set restante=restante-cantidad where operacion_id=r.reserva_op;
      perform set_config('aura_coin.interno',prev,true); perform set_config('ladra.patrocinio_interno',prev_ladra,true);
      perform aura_coin._pata(op,r.cuenta_id,'bloqueado',-cantidad); perform aura_coin._pata(op,dest,'disponible',cantidad);
      update ladra.patrocinios_ac set liberado_ac=liberado_ac+cantidad where id=r.id;
      resta:=resta-cantidad; exit when resta=0;
    end loop;
    if resta<>0 then raise exception 'Las reservas no cubren el monto solicitado.'; end if;
    if not exists(select 1 from ladra.patrocinios_ac where aviso_id=h.aviso_id and monto_ac>liberado_ac+devuelto_ac) then update ladra.campanas_patrocinio_ac set estado='completada',cerrada_en=clock_timestamp() where aviso_id=h.aviso_id; end if;
  end if;
  update ladra.hitos_patrocinio_ac set estado=case when p_aprobar then 'aprobado' else 'rechazado' end,revisado_por=u,resolucion=btrim(p_resolucion),revisado_en=clock_timestamp() where id=p_hito;
  return ladra.estado_patrocinio_ac(h.aviso_id)||jsonb_build_object('repetida',false);
end $$;

-- Autorizar solo las entradas públicas. Ningún navegador accede a las tablas ni a los helpers.
revoke all on function ladra._patrocinio_uid(),ladra.proteger_reserva_patrocinio_ac(),ladra._devolver_patrocinio_ac(uuid,text),ladra.sincronizar_campana_patrocinio_ac(),ladra.vencer_patrocinios_ac(),ladra.estado_patrocinio_ac(uuid),ladra.saldo_patrocinio_ac(),ladra.patrocinar_campana_ac(uuid,bigint,uuid),ladra.proponer_hito_patrocinio_ac(uuid,text,text,bigint,uuid),ladra.revisar_hito_patrocinio_ac(uuid,boolean,text) from public,anon,authenticated;
grant execute on function ladra.estado_patrocinio_ac(uuid) to anon,authenticated;
grant execute on function ladra.saldo_patrocinio_ac(),ladra.patrocinar_campana_ac(uuid,bigint,uuid),ladra.proponer_hito_patrocinio_ac(uuid,text,text,bigint,uuid),ladra.revisar_hito_patrocinio_ac(uuid,boolean,text) to authenticated;
grant execute on function ladra.vencer_patrocinios_ac() to service_role;
comment on column ladra.avisos_puestos.movimiento_ac is 'Campo heredado del aviso. Las reservas reales se registran exclusivamente en ladra.patrocinios_ac y en el libro central aura_coin.';
comment on table ladra.patrocinios_ac is 'Reservas reales de AC: no se emiten monedas ni se mueven CLP. Sin acceso directo desde el navegador.';
comment on function ladra._devolver_patrocinio_ac(uuid,text) is 'Devolución automática del saldo no liberado. No depende de la sesión ni de que operaciones nuevas estén habilitadas.';
-- El libro sigue exigiendo reservas = saldo bloqueado; los asientos se registran por partida doble.
-- pg_cron corre como propietario y usa claves fijas por aporte: no duplica devoluciones.
select cron.schedule('ladra-vencer-patrocinios-ac','* * * * *','select ladra.vencer_patrocinios_ac();');
notify pgrst,'reload schema';

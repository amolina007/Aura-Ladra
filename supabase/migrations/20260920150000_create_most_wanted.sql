-- Most Wanted: avisos de búsqueda con o sin recompensa. Solo schema ladra.

create table if not exists ladra.configuracion_most_wanted (
  id text primary key default 'piloto',
  horas_minimas_antes_reclamo numeric not null default 2,
  horas_ventana_verificacion integer not null default 60,
  dias_expiracion integer not null default 60,
  umbral_bono_buena_voluntad integer not null default 3,
  tope_bono_reparto_pp numeric not null default 5,
  comision_dueno_activo numeric not null default 0.15,
  comision_dueno_inactivo numeric not null default 0.20,
  reparto_encontrador_activo numeric not null default 0.85,
  reparto_encontrador_inactivo numeric not null default 0.75,
  reparto_encontrador_sin_cuenta numeric not null default 0.70,
  fraccion_fondo_altruismo numeric not null default 0.10
);

insert into ladra.configuracion_most_wanted (id) values ('piloto')
on conflict (id) do nothing;

comment on table ladra.configuracion_most_wanted is
  'Constantes editables del piloto Most Wanted. Umbral y tope de bono aún no son definitivos.';

alter table ladra.configuracion_most_wanted enable row level security;
alter table ladra.configuracion_most_wanted force row level security;

drop policy if exists config_most_wanted_lectura on ladra.configuracion_most_wanted;
create policy config_most_wanted_lectura
  on ladra.configuracion_most_wanted for select to anon, authenticated
  using (true);

revoke all on table ladra.configuracion_most_wanted from public, anon, authenticated;
grant select on table ladra.configuracion_most_wanted to anon, authenticated;
grant all on table ladra.configuracion_most_wanted to service_role;

create table if not exists ladra.avisos_most_wanted (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales (id) on delete restrict,
  dueno_id uuid not null references auth.users (id) on delete restrict,
  modalidad text not null check (modalidad in ('recompensa', 'buena_voluntad')),
  monto_recompensa numeric check (monto_recompensa is null or monto_recompensa >= 1000),
  estado text not null default 'publicado'
    check (estado in ('publicado', 'reclamado', 'en_verificacion', 'resuelto', 'cerrado', 'expirado')),
  resultado text check (resultado in ('pagado', 'reconocido', 'rechazado', 'pago_pendiente_liberar', 'expirado')),
  titulo text not null,
  relato text not null,
  zona_publica text not null,
  foto_path text,
  publicado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint avisos_mw_titulo check (char_length(btrim(titulo)) between 3 and 80),
  constraint avisos_mw_relato check (char_length(btrim(relato)) between 20 and 800),
  constraint avisos_mw_zona check (char_length(btrim(zona_publica)) between 3 and 80),
  constraint avisos_mw_recompensa_coherente check (
    (modalidad = 'buena_voluntad' and monto_recompensa is null)
    or (modalidad = 'recompensa' and monto_recompensa is not null)
  )
);

create unique index if not exists avisos_mw_un_abierto_por_animal
  on ladra.avisos_most_wanted (animal_id)
  where estado in ('publicado', 'reclamado', 'en_verificacion');

create index if not exists avisos_mw_publicados_idx
  on ladra.avisos_most_wanted (publicado_en desc)
  where estado in ('publicado', 'reclamado', 'en_verificacion');

comment on table ladra.avisos_most_wanted is
  'Afiches de búsqueda. Publicar es siempre gratis. El pago, si existe, queda pendiente de un procesador externo.';

create table if not exists ladra.reclamos_most_wanted (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references ladra.avisos_most_wanted (id) on delete cascade,
  reclamante_id uuid references auth.users (id) on delete set null,
  nombre_publico text not null,
  evidencia_path text not null,
  nota text not null,
  estado text not null default 'en_cola'
    check (estado in ('en_cola', 'activo', 'verificado', 'rechazado', 'caducado')),
  sin_cuenta boolean not null default false,
  requiere_revision_manual boolean not null default false,
  motivo_bandera text,
  creado_en timestamptz not null default now(),
  activado_en timestamptz,
  constraint reclamos_mw_nombre check (char_length(btrim(nombre_publico)) between 2 and 60),
  constraint reclamos_mw_nota check (char_length(btrim(nota)) between 20 and 600)
);

create unique index if not exists reclamos_mw_un_activo_por_aviso
  on ladra.reclamos_most_wanted (aviso_id)
  where estado = 'activo';

create table if not exists ladra.acciones_actividad (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  tipo text not null,
  creado_en timestamptz not null default now()
);

create index if not exists acciones_actividad_usuario_idx
  on ladra.acciones_actividad (usuario_id, creado_en desc);

create table if not exists ladra.reconocimientos_buena_voluntad (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  aviso_id uuid not null references ladra.avisos_most_wanted (id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (aviso_id)
);

create table if not exists ladra.fondo_altruismo_movimientos (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid references ladra.avisos_most_wanted (id) on delete set null,
  monto numeric not null check (monto >= 0),
  detalle text not null,
  creado_en timestamptz not null default now()
);

comment on table ladra.fondo_altruismo_movimientos is
  '10% del ingreso neto del track con recompensa, reinvertido en el canil Parque 3 Poniente. No es donación a una fundación.';

alter table ladra.avisos_most_wanted enable row level security;
alter table ladra.avisos_most_wanted force row level security;
alter table ladra.reclamos_most_wanted enable row level security;
alter table ladra.reclamos_most_wanted force row level security;
alter table ladra.acciones_actividad enable row level security;
alter table ladra.acciones_actividad force row level security;
alter table ladra.reconocimientos_buena_voluntad enable row level security;
alter table ladra.reconocimientos_buena_voluntad force row level security;
alter table ladra.fondo_altruismo_movimientos enable row level security;
alter table ladra.fondo_altruismo_movimientos force row level security;

drop policy if exists avisos_mw_lectura_publica on ladra.avisos_most_wanted;
create policy avisos_mw_lectura_publica
  on ladra.avisos_most_wanted for select to anon, authenticated
  using (true);

drop policy if exists reclamos_mw_lectura_involucrados on ladra.reclamos_most_wanted;
create policy reclamos_mw_lectura_involucrados
  on ladra.reclamos_most_wanted for select to authenticated
  using (
    reclamante_id = (select auth.uid())
    or exists (
      select 1 from ladra.avisos_most_wanted a
      where a.id = aviso_id and a.dueno_id = (select auth.uid())
    )
    or exists (
      select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())
    )
  );

drop policy if exists reconocimientos_lectura on ladra.reconocimientos_buena_voluntad;
create policy reconocimientos_lectura
  on ladra.reconocimientos_buena_voluntad for select to anon, authenticated
  using (true);

drop policy if exists fondo_altruismo_lectura on ladra.fondo_altruismo_movimientos;
create policy fondo_altruismo_lectura
  on ladra.fondo_altruismo_movimientos for select to anon, authenticated
  using (true);

revoke all on table ladra.avisos_most_wanted from public, anon, authenticated;
grant select on table ladra.avisos_most_wanted to anon, authenticated;
grant all on table ladra.avisos_most_wanted to service_role;

revoke all on table ladra.reclamos_most_wanted from public, anon, authenticated;
grant select (id, aviso_id, reclamante_id, nombre_publico, evidencia_path, nota, estado, sin_cuenta, requiere_revision_manual, motivo_bandera, creado_en, activado_en)
  on table ladra.reclamos_most_wanted to authenticated;
grant all on table ladra.reclamos_most_wanted to service_role;

revoke all on table ladra.acciones_actividad from public, anon, authenticated;
grant all on table ladra.acciones_actividad to service_role;

revoke all on table ladra.reconocimientos_buena_voluntad from public, anon, authenticated;
grant select (id, usuario_id, aviso_id, creado_en) on table ladra.reconocimientos_buena_voluntad to anon, authenticated;
grant all on table ladra.reconocimientos_buena_voluntad to service_role;

revoke all on table ladra.fondo_altruismo_movimientos from public, anon, authenticated;
grant select (id, aviso_id, monto, detalle, creado_en) on table ladra.fondo_altruismo_movimientos to anon, authenticated;
grant all on table ladra.fondo_altruismo_movimientos to service_role;

create or replace function ladra.usuario_esta_activo(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select coalesce(p_usuario is not null and (
    exists (
      select 1 from ladra.animales a
      where a.creado_por = p_usuario and a.actualizado_en >= now() - interval '30 days'
    )
    or exists (
      select 1 from ladra.acciones_actividad x
      where x.usuario_id = p_usuario and x.creado_en >= now() - interval '30 days'
    )
    or exists (
      select 1 from ladra.reportes_canil r
      where r.reportante_id = p_usuario and r.creado_en >= now() - interval '30 days'
    )
    or exists (
      select 1 from ladra.reconocimientos_buena_voluntad g
      where g.usuario_id = p_usuario and g.creado_en >= now() - interval '30 days'
    )
  ), false);
$$;

revoke all on function ladra.usuario_esta_activo(uuid) from public, anon, authenticated;
grant execute on function ladra.usuario_esta_activo(uuid) to authenticated, service_role;

create or replace function ladra.registrar_accion_actividad(p_tipo text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then return; end if;
  insert into ladra.acciones_actividad (usuario_id, tipo) values ((select auth.uid()), p_tipo);
end;
$$;

revoke all on function ladra.registrar_accion_actividad(text) from public, anon, authenticated;
grant execute on function ladra.registrar_accion_actividad(text) to authenticated;

create or replace function ladra.publicar_aviso_most_wanted(
  p_animal_id uuid,
  p_modalidad text,
  p_monto numeric,
  p_titulo text,
  p_relato text,
  p_zona text,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if exists (select 1 from ladra.cuentas_baneadas b where b.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Esta cuenta no puede publicar avisos.';
  end if;
  if not exists (select 1 from ladra.animales a where a.id = p_animal_id and a.creado_por = v_me) then
    raise exception using errcode = '42501', message = 'Solo el responsable de la ficha puede publicar este afiche.';
  end if;
  if p_modalidad = 'recompensa' and coalesce(p_monto, 0) < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;

  insert into ladra.avisos_most_wanted (
    animal_id, dueno_id, modalidad, monto_recompensa, titulo, relato, zona_publica, foto_path
  ) values (
    p_animal_id, v_me, p_modalidad,
    case when p_modalidad = 'recompensa' then p_monto else null end,
    btrim(p_titulo), btrim(p_relato), btrim(p_zona), nullif(p_foto_path, '')
  ) returning id into v_id;

  insert into ladra.acciones_actividad (usuario_id, tipo) values (v_me, 'publicar_aviso');
  return v_id;
end;
$$;

create or replace function ladra.migrar_aviso_a_recompensa(p_aviso_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if coalesce(p_monto, 0) < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;
  update ladra.avisos_most_wanted
    set modalidad = 'recompensa', monto_recompensa = p_monto, actualizado_en = now()
  where id = p_aviso_id
    and dueno_id = (select auth.uid())
    and modalidad = 'buena_voluntad'
    and estado in ('publicado', 'reclamado', 'en_verificacion');
  if not found then
    raise exception using errcode = '22023', message = 'No se puede pasar a recompensa (solo desde buena voluntad y si el aviso sigue abierto).';
  end if;
end;
$$;

create or replace function ladra.crear_reclamo_most_wanted(
  p_aviso_id uuid,
  p_nombre text,
  p_evidencia_path text,
  p_nota text,
  p_sin_cuenta boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_aviso ladra.avisos_most_wanted;
  v_cfg ladra.configuracion_most_wanted;
  v_id uuid;
  v_activo uuid;
  v_me uuid := (select auth.uid());
  v_bandera boolean := false;
  v_motivo text;
begin
  select * into v_aviso from ladra.avisos_most_wanted where id = p_aviso_id;
  select * into v_cfg from ladra.configuracion_most_wanted where id = 'piloto';
  if v_aviso.id is null then raise exception using errcode = '22023', message = 'No encontramos ese afiche.'; end if;
  if v_me is not null and exists (select 1 from ladra.cuentas_baneadas b where b.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Esta cuenta no puede enviar reclamos.';
  end if;
  if v_aviso.estado not in ('publicado', 'reclamado', 'en_verificacion') then
    raise exception using errcode = '22023', message = 'Este afiche ya no recibe reclamos.';
  end if;
  if now() < v_aviso.publicado_en + make_interval(hours => v_cfg.horas_minimas_antes_reclamo::int) then
    raise exception using errcode = '22023', message = 'Todavía es muy pronto para el primer reclamo. Espera un poco: así cuidamos que el aviso circule.';
  end if;
  if char_length(coalesce(p_evidencia_path, '')) < 8 then
    raise exception using errcode = '22023', message = 'El reclamo necesita una foto del momento o del lugar del hallazgo.';
  end if;
  if v_me is not null and v_me = v_aviso.dueno_id then
    raise exception using errcode = '22023', message = 'No puedes reclamar tu propio aviso.';
  end if;
  if v_me is not null and exists (
    select 1 from ladra.reclamos_most_wanted r
    where r.aviso_id = p_aviso_id and r.reclamante_id = v_me and r.estado in ('en_cola', 'activo')
  ) then
    raise exception using errcode = '22023', message = 'Ya tienes un reclamo en curso para este aviso.';
  end if;

  if v_me is not null then
    v_bandera := exists (
      select 1 from ladra.reclamos_most_wanted r
      join ladra.avisos_most_wanted a on a.id = r.aviso_id
      where a.dueno_id = v_aviso.dueno_id and r.reclamante_id = v_me
    );
    if v_bandera then v_motivo := 'Interacción previa frecuente entre dueño y reclamante.'; end if;
  end if;

  insert into ladra.reclamos_most_wanted (
    aviso_id, reclamante_id, nombre_publico, evidencia_path, nota, sin_cuenta, requiere_revision_manual, motivo_bandera, estado
  ) values (
    p_aviso_id, v_me, btrim(p_nombre), p_evidencia_path, btrim(p_nota), coalesce(p_sin_cuenta, v_me is null),
    v_bandera, v_motivo, 'en_cola'
  ) returning id into v_id;

  select r.id into v_activo from ladra.reclamos_most_wanted r
  where r.aviso_id = p_aviso_id and r.estado = 'activo';

  if v_activo is null then
    update ladra.reclamos_most_wanted
      set estado = 'activo', activado_en = now()
      where id = v_id;
    update ladra.avisos_most_wanted
      set estado = case when v_bandera then 'en_verificacion' else 'reclamado' end,
          actualizado_en = now()
      where id = p_aviso_id;
  end if;

  if v_me is not null then
    insert into ladra.acciones_actividad (usuario_id, tipo) values (v_me, 'reportar_hallazgo');
  end if;
  return v_id;
end;
$$;

create or replace function ladra.resolver_reclamo_most_wanted(p_reclamo_id uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_rec ladra.reclamos_most_wanted;
  v_aviso ladra.avisos_most_wanted;
  v_cfg ladra.configuracion_most_wanted;
  v_dueno_activo boolean;
  v_enc_activo boolean;
  v_comision numeric;
  v_reparto numeric;
  v_bono numeric := 0;
  v_bv bigint;
  v_ingreso numeric;
  v_fondo numeric;
  v_siguiente uuid;
begin
  if v_me is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  select * into v_rec from ladra.reclamos_most_wanted where id = p_reclamo_id;
  select * into v_aviso from ladra.avisos_most_wanted where id = v_rec.aviso_id;
  select * into v_cfg from ladra.configuracion_most_wanted where id = 'piloto';
  if v_aviso.dueno_id is distinct from v_me
     and not exists (select 1 from ladra.moderadores m where m.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Solo el responsable o un moderador puede resolver.';
  end if;
  if v_rec.estado is distinct from 'activo' then
    raise exception using errcode = '22023', message = 'Este reclamo ya no está activo.';
  end if;

  if not p_aceptar then
    update ladra.reclamos_most_wanted set estado = 'rechazado' where id = v_rec.id;
    select r.id into v_siguiente
    from ladra.reclamos_most_wanted r
    where r.aviso_id = v_aviso.id and r.estado = 'en_cola'
    order by r.creado_en
    limit 1;
    if v_siguiente is not null then
      update ladra.reclamos_most_wanted set estado = 'activo', activado_en = now() where id = v_siguiente;
      update ladra.avisos_most_wanted set estado = 'reclamado', actualizado_en = now() where id = v_aviso.id;
    else
      update ladra.avisos_most_wanted set estado = 'publicado', actualizado_en = now() where id = v_aviso.id;
    end if;
    return;
  end if;

  update ladra.reclamos_most_wanted set estado = 'verificado' where id = v_rec.id;

  if v_aviso.modalidad = 'buena_voluntad' then
    if v_rec.reclamante_id is not null then
      insert into ladra.reconocimientos_buena_voluntad (usuario_id, aviso_id)
      values (v_rec.reclamante_id, v_aviso.id)
      on conflict (aviso_id) do nothing;
    end if;
    update ladra.avisos_most_wanted
      set estado = 'resuelto', resultado = 'reconocido', actualizado_en = now()
      where id = v_aviso.id;
    return;
  end if;

  v_dueno_activo := ladra.usuario_esta_activo(v_aviso.dueno_id);
  v_comision := case when v_dueno_activo then v_cfg.comision_dueno_activo else v_cfg.comision_dueno_inactivo end;
  if v_rec.sin_cuenta or v_rec.reclamante_id is null then
    v_reparto := v_cfg.reparto_encontrador_sin_cuenta;
  else
    v_enc_activo := ladra.usuario_esta_activo(v_rec.reclamante_id);
    v_reparto := case when v_enc_activo then v_cfg.reparto_encontrador_activo else v_cfg.reparto_encontrador_inactivo end;
    select count(*) into v_bv from ladra.reconocimientos_buena_voluntad where usuario_id = v_rec.reclamante_id;
    if v_bv >= v_cfg.umbral_bono_buena_voluntad then
      v_bono := least(v_cfg.tope_bono_reparto_pp / 100.0, 1 - v_reparto);
      v_reparto := v_reparto + v_bono;
    end if;
  end if;

  v_ingreso := round(v_aviso.monto_recompensa * (1 - v_reparto), 0);
  v_fondo := round(v_ingreso * v_cfg.fraccion_fondo_altruismo, 0);
  insert into ladra.fondo_altruismo_movimientos (aviso_id, monto, detalle)
  values (v_aviso.id, v_fondo, '10% del ingreso neto del aviso, reinvertido en el canil Parque 3 Poniente.');

  update ladra.avisos_most_wanted
    set estado = 'resuelto', resultado = 'pago_pendiente_liberar', actualizado_en = now()
    where id = v_aviso.id;
end;
$$;

create or replace function ladra.cerrar_aviso_most_wanted(p_aviso_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  update ladra.avisos_most_wanted
    set estado = 'cerrado', actualizado_en = now()
  where id = p_aviso_id
    and estado = 'resuelto'
    and (
      dueno_id = (select auth.uid())
      or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
    );
  if not found then
    raise exception using errcode = '22023', message = 'Solo se cierra un aviso ya resuelto.';
  end if;
end;
$$;

create or replace function ladra.expirar_avisos_most_wanted()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_n integer;
  v_dias integer;
  v_horas integer;
begin
  select dias_expiracion, horas_ventana_verificacion
    into v_dias, v_horas
  from ladra.configuracion_most_wanted where id = 'piloto';

  update ladra.reclamos_most_wanted r
    set estado = 'caducado'
  from ladra.avisos_most_wanted a
  where a.id = r.aviso_id
    and r.estado = 'activo'
    and r.activado_en is not null
    and r.activado_en < now() - make_interval(hours => v_horas);

  update ladra.reclamos_most_wanted r
    set estado = 'activo', activado_en = now()
  where r.id in (
    select x.id from (
      select distinct on (c.aviso_id) c.id
      from ladra.reclamos_most_wanted c
      join ladra.avisos_most_wanted a on a.id = c.aviso_id
      where c.estado = 'en_cola'
        and a.estado in ('publicado', 'reclamado', 'en_verificacion')
        and not exists (
          select 1 from ladra.reclamos_most_wanted z
          where z.aviso_id = c.aviso_id and z.estado = 'activo'
        )
      order by c.aviso_id, c.creado_en
    ) x
  );

  update ladra.avisos_most_wanted a
    set estado = case
      when exists (
        select 1 from ladra.reclamos_most_wanted r
        where r.aviso_id = a.id and r.estado = 'activo' and r.requiere_revision_manual
      ) then 'en_verificacion'
      when exists (
        select 1 from ladra.reclamos_most_wanted r
        where r.aviso_id = a.id and r.estado = 'activo'
      ) then 'reclamado'
      else 'publicado'
    end,
        actualizado_en = now()
  where a.estado in ('publicado', 'reclamado', 'en_verificacion');

  update ladra.avisos_most_wanted
    set estado = 'expirado', resultado = 'expirado', actualizado_en = now()
  where estado in ('publicado', 'reclamado', 'en_verificacion')
    and publicado_en < now() - make_interval(days => v_dias);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function ladra.heroes_comunidad()
returns table (usuario_id uuid, alias_publico text, recuperaciones bigint)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select g.usuario_id,
         coalesce((select p.alias from ladra.perfiles_publicos p where p.usuario_id = g.usuario_id and p.estado = 'publicado' limit 1), 'héroe local'),
         count(*)::bigint
  from ladra.reconocimientos_buena_voluntad g
  group by g.usuario_id
  order by count(*) desc
  limit 12;
$$;

create or replace function ladra.total_fondo_altruismo()
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select coalesce(sum(monto), 0) from ladra.fondo_altruismo_movimientos;
$$;

revoke all on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) from public, anon, authenticated;
revoke all on function ladra.migrar_aviso_a_recompensa(uuid, numeric) from public, anon, authenticated;
revoke all on function ladra.crear_reclamo_most_wanted(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function ladra.resolver_reclamo_most_wanted(uuid, boolean) from public, anon, authenticated;
revoke all on function ladra.cerrar_aviso_most_wanted(uuid) from public, anon, authenticated;
revoke all on function ladra.expirar_avisos_most_wanted() from public, anon, authenticated;
revoke all on function ladra.heroes_comunidad() from public, anon, authenticated;
revoke all on function ladra.total_fondo_altruismo() from public, anon, authenticated;

grant execute on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) to authenticated;
grant execute on function ladra.migrar_aviso_a_recompensa(uuid, numeric) to authenticated;
grant execute on function ladra.crear_reclamo_most_wanted(uuid, text, text, text, boolean) to anon, authenticated;
grant execute on function ladra.resolver_reclamo_most_wanted(uuid, boolean) to authenticated;
grant execute on function ladra.cerrar_aviso_most_wanted(uuid) to authenticated;
grant execute on function ladra.expirar_avisos_most_wanted() to anon, authenticated;
grant execute on function ladra.heroes_comunidad() to anon, authenticated;
grant execute on function ladra.total_fondo_altruismo() to anon, authenticated;

create table if not exists ladra.cuentas_baneadas (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  motivo text not null,
  creado_en timestamptz not null default now(),
  creado_por uuid
);

alter table ladra.cuentas_baneadas enable row level security;
alter table ladra.cuentas_baneadas force row level security;

drop policy if exists cuentas_baneadas_moderadores on ladra.cuentas_baneadas;
create policy cuentas_baneadas_moderadores
  on ladra.cuentas_baneadas for select to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

revoke all on table ladra.cuentas_baneadas from public, anon, authenticated;
grant select on table ladra.cuentas_baneadas to authenticated;
grant all on table ladra.cuentas_baneadas to service_role;

create or replace function ladra.banear_cuenta_most_wanted(p_usuario uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if not exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())) then
    raise exception using errcode = '42501', message = 'Solo un moderador puede banear.';
  end if;
  if p_usuario is null then
    raise exception using errcode = '22023', message = 'No hay cuenta que banear (el reclamo fue sin cuenta).';
  end if;
  insert into ladra.cuentas_baneadas (usuario_id, motivo, creado_por)
  values (p_usuario, btrim(coalesce(p_motivo, 'Reclamo falso comprobado.')), (select auth.uid()))
  on conflict (usuario_id) do nothing;
end;
$$;

revoke all on function ladra.banear_cuenta_most_wanted(uuid, text) from public, anon, authenticated;
grant execute on function ladra.banear_cuenta_most_wanted(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('most-wanted', 'most-wanted', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists most_wanted_lectura on storage.objects;
create policy most_wanted_lectura
  on storage.objects for select to public
  using (bucket_id = 'most-wanted');

drop policy if exists most_wanted_subir on storage.objects;
create policy most_wanted_subir
  on storage.objects for insert to authenticated, anon
  with check (
    bucket_id = 'most-wanted'
    and (storage.foldername(name))[1] in ('avisos', 'reclamos')
  );

notify pgrst, 'reload schema';

-- Ayudar → Acciones por financiar (parte 1: tablas, reglas de integridad y seguridad).
-- Solo schema ladra. Los aportes financian una acción concreta: no ofrecen
-- intereses ni retornos. Mientras no exista pasarela ni reglas de desembolso,
-- TODO aporte es una simulación (modo_pago = 'simulacion') y así se registra.
--
-- Decisiones de pago que deben cerrarse ANTES de permitir modo_pago = 'real':
--   1) cuándo se cobra el aporte, 2) quién recibe o custodia el dinero,
--   3) cuándo se desembolsa al responsable, 4) cómo y cuándo se devuelve.

create table ladra.acciones_financiables (
  id uuid primary key default gen_random_uuid(),
  responsable_id uuid not null references auth.users(id) on delete restrict,
  animal_id uuid references ladra.animales(id) on delete set null,
  titulo text not null check (char_length(btrim(titulo)) between 8 and 90),
  descripcion text not null check (char_length(btrim(descripcion)) between 20 and 600),
  categoria text not null
    check (categoria in ('alojamiento', 'cuidado', 'salud', 'alimentacion', 'traslado', 'educacion', 'otro')),
  comuna text not null check (char_length(btrim(comuna)) between 2 and 60),
  urgencia text not null default 'normal' check (urgencia in ('normal', 'alta', 'critica')),
  incluye text[] not null default '{}',
  no_incluye text[] not null default '{}',
  condiciones_cancelacion text not null
    check (char_length(btrim(condiciones_cancelacion)) between 10 and 600),
  condiciones_devolucion text not null
    check (char_length(btrim(condiciones_devolucion)) between 10 and 600),
  meta_clp integer not null check (meta_clp between 1000 and 5000000),
  recaudado_clp integer not null default 0,
  fecha_limite timestamptz not null,
  disponibilidad_prestador text check (disponibilidad_prestador is null or char_length(disponibilidad_prestador) <= 200),
  plazo_ejecucion_dias integer not null default 7 check (plazo_ejecucion_dias between 1 and 90),
  fecha_ejecucion timestamptz,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en_revision', 'recaudando', 'meta_alcanzada', 'programada',
                      'en_ejecucion', 'completada', 'expirada', 'cancelada', 'en_disputa')),
  -- La devolución se registra aparte: un estado final no dice qué pasó con el dinero.
  estado_devolucion text not null default 'no_aplica'
    check (estado_devolucion in ('no_aplica', 'pendiente', 'en_proceso', 'completada')),
  verificacion text not null default 'sin_verificar'
    check (verificacion in ('sin_verificar', 'en_revision', 'verificado')),
  -- Alcanzar la meta NO libera fondos. Sigue 'no_liberado' hasta que existan reglas reales.
  desembolso text not null default 'no_liberado' check (desembolso in ('no_liberado')),
  modo_pago text not null default 'simulacion' check (modo_pago in ('simulacion')),
  motivo_cancelacion text check (motivo_cancelacion is null or char_length(motivo_cancelacion) <= 400),
  cierre_solicitado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint acciones_recaudado_valido check (recaudado_clp >= 0 and recaudado_clp <= meta_clp)
);

comment on table ladra.acciones_financiables is
  'Prestaciones concretas para beneficiar a un animal, financiadas por aportes. Sin retornos financieros.';
comment on column ladra.acciones_financiables.recaudado_clp is
  'Solo lo modifican las funciones del servidor al registrar aportes; nunca el navegador.';

create index acciones_estado_idx on ladra.acciones_financiables (estado, categoria, comuna);
create index acciones_responsable_idx on ladra.acciones_financiables (responsable_id, creado_en desc);

create table ladra.acciones_partidas (
  id uuid primary key default gen_random_uuid(),
  accion_id uuid not null references ladra.acciones_financiables(id) on delete cascade,
  concepto text not null check (char_length(btrim(concepto)) between 3 and 90),
  tipo text not null default 'prestacion'
    check (tipo in ('prestacion', 'comision_plataforma', 'costo_pago')),
  monto_clp integer not null check (monto_clp > 0),
  orden smallint not null default 0
);

create index acciones_partidas_accion_idx on ladra.acciones_partidas (accion_id, orden);

create table ladra.acciones_aportes (
  id uuid primary key default gen_random_uuid(),
  accion_id uuid not null references ladra.acciones_financiables(id) on delete restrict,
  aportante_id uuid not null references auth.users(id) on delete restrict,
  monto_clp integer not null check (monto_clp >= 1000),
  estado text not null default 'confirmado' check (estado in ('confirmado', 'devuelto')),
  simulado boolean not null default true check (simulado),
  -- Evita duplicar un aporte si el botón se toca dos veces o se reintenta la red.
  clave_idempotencia text not null check (char_length(clave_idempotencia) between 8 and 80),
  creado_en timestamptz not null default now(),
  unique (aportante_id, clave_idempotencia)
);

comment on column ladra.acciones_aportes.simulado is
  'Verdadero mientras no exista pasarela de pago real. Un aporte simulado no mueve dinero.';

create index acciones_aportes_accion_idx on ladra.acciones_aportes (accion_id, creado_en desc);
create index acciones_aportes_aportante_idx on ladra.acciones_aportes (aportante_id, creado_en desc);

create table ladra.acciones_actualizaciones (
  id uuid primary key default gen_random_uuid(),
  accion_id uuid not null references ladra.acciones_financiables(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete restrict,
  tipo text not null check (tipo in ('avance', 'documento', 'evidencia')),
  texto text not null check (char_length(btrim(texto)) between 3 and 600),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  creado_en timestamptz not null default now()
);

create index acciones_actualizaciones_idx on ladra.acciones_actualizaciones (accion_id, creado_en desc);

create table ladra.acciones_historial (
  id bigint generated always as identity primary key,
  accion_id uuid not null references ladra.acciones_financiables(id) on delete cascade,
  actor_id uuid,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  creado_en timestamptz not null default now()
);

create index acciones_historial_idx on ladra.acciones_historial (accion_id, creado_en desc);

-- ---------------------------------------------------------------------------
-- Después de recibir aportes no se pueden cambiar precio, alcance,
-- beneficiario ni condiciones. Además se registra un historial de cambios.
-- ---------------------------------------------------------------------------
create or replace function ladra.acciones_proteger_y_registrar()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if old.recaudado_clp > 0 and (
       new.meta_clp is distinct from old.meta_clp
    or new.titulo is distinct from old.titulo
    or new.descripcion is distinct from old.descripcion
    or new.animal_id is distinct from old.animal_id
    or new.incluye is distinct from old.incluye
    or new.no_incluye is distinct from old.no_incluye
    or new.condiciones_cancelacion is distinct from old.condiciones_cancelacion
    or new.condiciones_devolucion is distinct from old.condiciones_devolucion
    or new.categoria is distinct from old.categoria
    or new.responsable_id is distinct from old.responsable_id
    or new.fecha_limite is distinct from old.fecha_limite
  ) then
    raise exception 'ACCION_BLOQUEADA: ya recibió aportes; no se pueden cambiar precio, alcance, beneficiario ni condiciones.'
      using errcode = 'P0001';
  end if;

  if new.estado is distinct from old.estado then
    insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
    values (old.id, v_actor, 'estado', old.estado, new.estado);
  end if;
  if new.estado_devolucion is distinct from old.estado_devolucion then
    insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
    values (old.id, v_actor, 'estado_devolucion', old.estado_devolucion, new.estado_devolucion);
  end if;
  if new.meta_clp is distinct from old.meta_clp then
    insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
    values (old.id, v_actor, 'meta_clp', old.meta_clp::text, new.meta_clp::text);
  end if;
  if new.fecha_limite is distinct from old.fecha_limite then
    insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
    values (old.id, v_actor, 'fecha_limite', old.fecha_limite::text, new.fecha_limite::text);
  end if;
  if new.condiciones_cancelacion is distinct from old.condiciones_cancelacion
     or new.condiciones_devolucion is distinct from old.condiciones_devolucion then
    insert into ladra.acciones_historial (accion_id, actor_id, campo, valor_anterior, valor_nuevo)
    values (old.id, v_actor, 'condiciones', null, 'modificadas');
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

create trigger acciones_proteger_y_registrar
  before update on ladra.acciones_financiables
  for each row execute function ladra.acciones_proteger_y_registrar();

-- El presupuesto solo se edita mientras la acción es un borrador sin aportes.
create or replace function ladra.partidas_solo_en_borrador()
returns trigger
language plpgsql
set search_path = pg_catalog, ladra
as $$
declare
  v_accion uuid := coalesce(new.accion_id, old.accion_id);
  v_estado text;
  v_recaudado integer;
begin
  select estado, recaudado_clp into v_estado, v_recaudado
  from ladra.acciones_financiables where id = v_accion;
  if v_estado is distinct from 'borrador' or coalesce(v_recaudado, 0) > 0 then
    raise exception 'PRESUPUESTO_BLOQUEADO: el presupuesto solo se edita en borrador y sin aportes.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger partidas_solo_en_borrador
  before insert or update or delete on ladra.acciones_partidas
  for each row execute function ladra.partidas_solo_en_borrador();

-- ---------------------------------------------------------------------------
-- Seguridad: nadie lee ni escribe estas tablas directamente desde el navegador.
-- Todo pasa por funciones de la parte 2, que validan rol, estado y montos.
-- ---------------------------------------------------------------------------
alter table ladra.acciones_financiables enable row level security;
alter table ladra.acciones_partidas enable row level security;
alter table ladra.acciones_aportes enable row level security;
alter table ladra.acciones_actualizaciones enable row level security;
alter table ladra.acciones_historial enable row level security;

revoke all on ladra.acciones_financiables from public, anon, authenticated;
revoke all on ladra.acciones_partidas from public, anon, authenticated;
revoke all on ladra.acciones_aportes from public, anon, authenticated;
revoke all on ladra.acciones_actualizaciones from public, anon, authenticated;
revoke all on ladra.acciones_historial from public, anon, authenticated;

grant all on ladra.acciones_financiables to service_role;
grant all on ladra.acciones_partidas to service_role;
grant all on ladra.acciones_aportes to service_role;
grant all on ladra.acciones_actualizaciones to service_role;
grant all on ladra.acciones_historial to service_role;

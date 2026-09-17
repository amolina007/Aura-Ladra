-- AuraLadra: mapa comunitario y red de perfiles animales.
-- Todo queda aislado en el schema ladra; no modifica objetos de AuraRitmos/public.

-- El fundador confirmado es, por ahora, el único moderador del piloto.
insert into ladra.moderadores (usuario_id, nombre_publico)
values ('49d8edf7-10b5-4063-8659-ab390d4cee81', 'Alejandro · Moderación AuraLadra')
on conflict (usuario_id) do update
set nombre_publico = excluded.nombre_publico;

-- Amplía el directorio existente para representar el mapa solicitado.
alter table ladra.lugares_publicos
  drop constraint if exists lugares_publicos_categoria_check;

alter table ladra.lugares_publicos
  add constraint lugares_publicos_categoria_check
  check (categoria in (
    'canil', 'parque', 'veterinaria', 'tienda_mascotas', 'alimento',
    'juguetes_accesorios', 'animal_comunitario', 'servicio', 'comercio', 'otro'
  ));

alter table ladra.lugares_publicos
  add column if not exists servicio_urgencia boolean not null default false,
  add column if not exists urgencia_24h boolean not null default false,
  add column if not exists horario_publico text,
  add column if not exists telefono_publico text,
  add column if not exists sitio_web text,
  add column if not exists precision_ubicacion text not null default 'exacta'
    check (precision_ubicacion in ('exacta', 'aproximada')),
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

alter table ladra.lugares_publicos
  add constraint lugares_urgencia_solo_veterinaria
  check (not servicio_urgencia or categoria = 'veterinaria'),
  add constraint lugares_24h_requiere_urgencia
  check (not urgencia_24h or servicio_urgencia),
  add constraint lugares_coordenadas_pareadas
  check ((latitud is null and longitud is null) or (latitud is not null and longitud is not null)),
  add constraint lugares_latitud_valida
  check (latitud is null or latitud between -90 and 90),
  add constraint lugares_longitud_valida
  check (longitud is null or longitud between -180 and 180);

create index if not exists lugares_publicos_mapa_idx
  on ladra.lugares_publicos (categoria, publicado)
  where publicado is true;

create policy lugares_moderador_lectura
  on ladra.lugares_publicos
  for select
  to authenticated
  using (
    publicado is true
    or exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

create policy lugares_moderador_inserta
  on ladra.lugares_publicos
  for insert
  to authenticated
  with check (
    creado_por = (select auth.uid())
    and exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

create policy lugares_moderador_actualiza
  on ladra.lugares_publicos
  for update
  to authenticated
  using (
    exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from ladra.moderadores m
      where m.usuario_id = (select auth.uid())
    )
  );

grant insert (
  slug, nombre, descripcion, direccion_publica, comuna, categoria,
  estado_verificacion, latitud, longitud, publicado, servicio_urgencia,
  urgencia_24h, horario_publico, telefono_publico, sitio_web,
  precision_ubicacion, creado_por
) on ladra.lugares_publicos to authenticated;

grant update (
  nombre, descripcion, direccion_publica, comuna, categoria,
  estado_verificacion, latitud, longitud, publicado, servicio_urgencia,
  urgencia_24h, horario_publico, telefono_publico, sitio_web,
  precision_ubicacion, actualizado_en
) on ladra.lugares_publicos to authenticated;

comment on column ladra.lugares_publicos.precision_ubicacion is
  'Usar aproximada cuando publicar el punto exacto pueda poner en riesgo a un animal comunitario.';

-- Sustituye el SELECT amplio previo por una lista explícita que excluye creado_por.
revoke select on ladra.lugares_publicos from anon, authenticated;
grant select (
  id, slug, nombre, descripcion, direccion_publica, comuna, categoria,
  estado_verificacion, latitud, longitud, publicado, actualizado_en,
  servicio_urgencia, urgencia_24h, horario_publico, telefono_publico,
  sitio_web, precision_ubicacion
) on ladra.lugares_publicos to anon, authenticated;

create table ladra.perfiles_publicos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  alias text not null check (char_length(btrim(alias)) between 2 and 50),
  biografia text check (biografia is null or char_length(btrim(biografia)) <= 300),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'publicado', 'rechazado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table ladra.perfiles_publicos is
  'Alias público opcional de una persona. El correo y otros datos privados permanecen exclusivamente en Auth.';

alter table ladra.perfiles_publicos enable row level security;
alter table ladra.perfiles_publicos force row level security;

create policy perfiles_publicados_lectura
  on ladra.perfiles_publicos for select to anon
  using (estado = 'publicado');

create policy perfiles_lectura_autenticada
  on ladra.perfiles_publicos for select to authenticated
  using (
    estado = 'publicado'
    or usuario_id = (select auth.uid())
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

create policy perfiles_creacion_propia
  on ladra.perfiles_publicos for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'pendiente');

create policy perfiles_moderacion
  on ladra.perfiles_publicos for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

revoke all on ladra.perfiles_publicos from public, anon, authenticated;
grant select (id, alias, biografia, estado, creado_en, actualizado_en)
  on ladra.perfiles_publicos to anon, authenticated;
grant insert (usuario_id, alias, biografia, estado)
  on ladra.perfiles_publicos to authenticated;
grant update (estado, actualizado_en)
  on ladra.perfiles_publicos to authenticated;
grant all on ladra.perfiles_publicos to service_role;

create table ladra.animales (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  especie text not null check (especie in ('perro', 'gato', 'ave', 'otro')),
  biografia text check (biografia is null or char_length(btrim(biografia)) <= 600),
  foto_url text,
  zona_publica text,
  es_comunitario boolean not null default false,
  creado_por uuid references auth.users(id) on delete set null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'publicado', 'rechazado', 'archivado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table ladra.animales is
  'Identidades públicas de animales. Pueden existir sin vínculo con una persona.';
comment on column ladra.animales.creado_por is
  'Dato privado de trazabilidad; no se concede lectura pública de esta columna.';

create index animales_publicos_idx on ladra.animales (estado, especie, nombre)
  where estado = 'publicado';
create index animales_creador_idx on ladra.animales (creado_por, creado_en desc);

alter table ladra.animales enable row level security;
alter table ladra.animales force row level security;

create policy animales_publicados_lectura
  on ladra.animales for select to anon
  using (estado = 'publicado');

create policy animales_lectura_autenticada
  on ladra.animales for select to authenticated
  using (
    estado = 'publicado'
    or creado_por = (select auth.uid())
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

create policy animales_creacion_autenticada
  on ladra.animales for insert to authenticated
  with check (creado_por = (select auth.uid()) and estado = 'pendiente');

create policy animales_moderacion
  on ladra.animales for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

revoke all on ladra.animales from public, anon, authenticated;
grant select (
  id, slug, nombre, especie, biografia, foto_url, zona_publica,
  es_comunitario, estado, creado_en, actualizado_en
) on ladra.animales to anon, authenticated;
grant insert (
  slug, nombre, especie, biografia, foto_url, zona_publica,
  es_comunitario, creado_por, estado
) on ladra.animales to authenticated;
grant update (estado, actualizado_en) on ladra.animales to authenticated;
grant all on ladra.animales to service_role;

create or replace function ladra.mis_animales()
returns table (id uuid, nombre text, especie text, estado text)
language sql
stable
security invoker
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado
  from ladra.animales a
  where a.creado_por = (select auth.uid())
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

create or replace function ladra.mi_perfil_publico()
returns table (id uuid, alias text, estado text)
language sql
stable
security invoker
set search_path = pg_catalog, ladra
as $$
  select p.id, p.alias, p.estado
  from ladra.perfiles_publicos p
  where p.usuario_id = (select auth.uid())
  limit 1;
$$;

revoke all on function ladra.mi_perfil_publico() from public, anon, authenticated;
grant execute on function ladra.mi_perfil_publico() to authenticated;

create table ladra.vinculos_animal_humano (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references ladra.animales(id) on delete cascade,
  perfil_publico_id uuid not null references ladra.perfiles_publicos(id) on delete cascade,
  tipo text not null check (tipo in ('responsable', 'cuidador', 'rescatista', 'colaborador')),
  visible_publicamente boolean not null default true,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'rechazado', 'revocado')),
  creado_por uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (animal_id, perfil_publico_id, tipo)
);

alter table ladra.vinculos_animal_humano enable row level security;
alter table ladra.vinculos_animal_humano force row level security;

create policy vinculos_humanos_publicos
  on ladra.vinculos_animal_humano for select to anon
  using (
    estado = 'confirmado' and visible_publicamente is true
    and exists (select 1 from ladra.animales a where a.id = animal_id and a.estado = 'publicado')
    and exists (select 1 from ladra.perfiles_publicos p where p.id = perfil_publico_id and p.estado = 'publicado')
  );

create policy vinculos_humanos_lectura_autenticada
  on ladra.vinculos_animal_humano for select to authenticated
  using (
    (estado = 'confirmado' and visible_publicamente is true)
    or creado_por = (select auth.uid())
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

create policy vinculos_humanos_creacion
  on ladra.vinculos_animal_humano for insert to authenticated
  with check (
    creado_por = (select auth.uid()) and estado = 'pendiente'
    and exists (
      select 1 from ladra.perfiles_publicos p
      where p.id = perfil_publico_id and p.usuario_id = (select auth.uid())
    )
  );

create policy vinculos_humanos_moderacion
  on ladra.vinculos_animal_humano for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

create index vinculos_humanos_animal_idx on ladra.vinculos_animal_humano (animal_id, estado);

revoke all on ladra.vinculos_animal_humano from public, anon, authenticated;
grant select (id, animal_id, perfil_publico_id, tipo, visible_publicamente, estado, creado_en, actualizado_en)
  on ladra.vinculos_animal_humano to anon, authenticated;
grant insert (animal_id, perfil_publico_id, tipo, visible_publicamente, estado, creado_por)
  on ladra.vinculos_animal_humano to authenticated;
grant update (estado, actualizado_en) on ladra.vinculos_animal_humano to authenticated;
grant all on ladra.vinculos_animal_humano to service_role;

create table ladra.vinculos_animales (
  id uuid primary key default gen_random_uuid(),
  animal_a_id uuid not null references ladra.animales(id) on delete cascade,
  animal_b_id uuid not null references ladra.animales(id) on delete cascade,
  tipo text not null check (tipo in ('familia', 'convivencia', 'amistad', 'colonia', 'manada', 'otro')),
  descripcion text check (descripcion is null or char_length(btrim(descripcion)) <= 240),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'rechazado', 'revocado')),
  creado_por uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (animal_a_id <> animal_b_id),
  unique (animal_a_id, animal_b_id, tipo)
);

alter table ladra.vinculos_animales enable row level security;
alter table ladra.vinculos_animales force row level security;

create policy vinculos_animales_publicos
  on ladra.vinculos_animales for select to anon
  using (
    estado = 'confirmado'
    and exists (select 1 from ladra.animales a where a.id = animal_a_id and a.estado = 'publicado')
    and exists (select 1 from ladra.animales b where b.id = animal_b_id and b.estado = 'publicado')
  );

create policy vinculos_animales_lectura_autenticada
  on ladra.vinculos_animales for select to authenticated
  using (
    estado = 'confirmado'
    or creado_por = (select auth.uid())
    or exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid()))
  );

create policy vinculos_animales_creacion
  on ladra.vinculos_animales for insert to authenticated
  with check (
    creado_por = (select auth.uid()) and estado = 'pendiente'
    and exists (
      select 1 from ladra.animales a
      where a.id = animal_a_id and a.creado_por = (select auth.uid())
    )
  );

create policy vinculos_animales_moderacion
  on ladra.vinculos_animales for update to authenticated
  using (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from ladra.moderadores m where m.usuario_id = (select auth.uid())));

create index vinculos_animales_a_idx on ladra.vinculos_animales (animal_a_id, estado);
create index vinculos_animales_b_idx on ladra.vinculos_animales (animal_b_id, estado);

revoke all on ladra.vinculos_animales from public, anon, authenticated;
grant select (id, animal_a_id, animal_b_id, tipo, descripcion, estado, creado_en, actualizado_en)
  on ladra.vinculos_animales to anon, authenticated;
grant insert (animal_a_id, animal_b_id, tipo, descripcion, estado, creado_por)
  on ladra.vinculos_animales to authenticated;
grant update (estado, actualizado_en) on ladra.vinculos_animales to authenticated;
grant all on ladra.vinculos_animales to service_role;

-- Leia inaugura la red animal sin publicar un vínculo humano.
insert into ladra.animales (
  slug, nombre, especie, biografia, zona_publica, es_comunitario, estado
) values (
  'leia-embajadora',
  'Leia',
  'perro',
  'Embajadora de AuraLadra y primera huella de la red comunitaria de Maipú.',
  'Maipú',
  false,
  'publicado'
) on conflict (slug) do update set
  nombre = excluded.nombre,
  especie = excluded.especie,
  biografia = excluded.biografia,
  zona_publica = excluded.zona_publica,
  es_comunitario = excluded.es_comunitario,
  estado = excluded.estado,
  actualizado_en = now();

update ladra.estado_sistema
set version = '0.3.0', actualizado_en = now()
where id = 'auraladra';

notify pgrst, 'reload schema';

-- Comida y agua → Interacciones con una publicación: me gusta y comentarios (compartir no necesita base de datos).
-- Solo schema ladra. Cualquier persona con cuenta puede dar me gusta y comentar una campaña PUBLICADA.
-- Cualquiera, con o sin cuenta, puede ver los contadores y leer los comentarios visibles.
-- Los comentarios no admiten enlaces (evita spam), se limitan a 5 cada 10 minutos por persona y se pueden
-- ocultar por quien los escribió, por quien publicó la campaña y por moderación. Ocultar no borra (queda el registro).
-- No mueve Auracoins ni dinero.

create table ladra.avisos_me_gusta (
  aviso_id uuid not null references ladra.avisos_puestos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (aviso_id, usuario_id)
);

create table ladra.avisos_comentarios (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references ladra.avisos_puestos(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 2 and 500),
  estado text not null default 'visible' check (estado in ('visible', 'oculto')),
  ocultado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index avisos_comentarios_aviso_idx on ladra.avisos_comentarios (aviso_id, creado_en desc);
create index avisos_comentarios_autor_idx on ladra.avisos_comentarios (autor_id, creado_en desc);

alter table ladra.avisos_me_gusta enable row level security;
alter table ladra.avisos_me_gusta force row level security;
alter table ladra.avisos_comentarios enable row level security;
alter table ladra.avisos_comentarios force row level security;
revoke all on ladra.avisos_me_gusta from public, anon, authenticated;
revoke all on ladra.avisos_comentarios from public, anon, authenticated;
grant all on ladra.avisos_me_gusta to service_role;
grant all on ladra.avisos_comentarios to service_role;

-- Pone o quita mi me gusta. Devuelve true si quedó puesto.
create or replace function ladra.alternar_me_gusta_aviso(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if not exists (select 1 from ladra.avisos_puestos where id = p_id and estado = 'publicado') then
    raise exception 'AVISO_NO_DISPONIBLE: esta publicación no está disponible.' using errcode = 'P0001';
  end if;
  delete from ladra.avisos_me_gusta where aviso_id = p_id and usuario_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    return false;
  end if;
  insert into ladra.avisos_me_gusta (aviso_id, usuario_id) values (p_id, v_uid) on conflict do nothing;
  return true;
end;
$$;

create or replace function ladra.comentar_aviso(p_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  if not exists (select 1 from ladra.avisos_puestos where id = p_id and estado = 'publicado') then
    raise exception 'AVISO_NO_DISPONIBLE: esta publicación no está disponible.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_texto, ''))) not between 2 and 500 then
    raise exception 'TEXTO_INVALIDO: el comentario debe tener entre 2 y 500 caracteres.' using errcode = 'P0001';
  end if;
  if p_texto ~* '(https?://|www\.)' then
    raise exception 'ENLACES_NO_PERMITIDOS: por ahora los comentarios no pueden incluir enlaces.' using errcode = 'P0001';
  end if;
  if (select count(*) from ladra.avisos_comentarios
       where autor_id = v_uid and creado_en > now() - interval '10 minutes') >= 5 then
    raise exception 'DEMASIADOS_COMENTARIOS: espera unos minutos antes de comentar de nuevo.' using errcode = 'P0001';
  end if;
  insert into ladra.avisos_comentarios (aviso_id, autor_id, texto)
  values (p_id, v_uid, btrim(p_texto))
  returning id into v_id;
  return v_id;
end;
$$;

-- Comentarios visibles de una campaña publicada (los 40 más recientes). Muestra el alias público, nunca el correo.
create or replace function ladra.listar_comentarios_aviso(p_id uuid)
returns table (id uuid, texto text, autor_alias text, creado_en timestamptz, es_mio boolean, puede_ocultar boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_autor_aviso uuid;
  v_mod boolean;
begin
  select a.autor_id into v_autor_aviso from ladra.avisos_puestos a where a.id = p_id and a.estado = 'publicado';
  if not found then
    return;
  end if;
  v_mod := v_uid is not null and exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid);
  return query
    select c.id, c.texto,
           coalesce(pp.alias, 'Persona de la comunidad'),
           c.creado_en,
           (v_uid is not null and c.autor_id = v_uid),
           (v_uid is not null and (c.autor_id = v_uid or v_autor_aviso = v_uid or v_mod))
      from ladra.avisos_comentarios c
      left join ladra.perfiles_publicos pp on pp.usuario_id = c.autor_id and pp.estado = 'publicado'
     where c.aviso_id = p_id and c.estado = 'visible'
     order by c.creado_en desc
     limit 40;
end;
$$;

-- Oculta un comentario: quien lo escribió, quien publicó la campaña o moderación.
create or replace function ladra.ocultar_comentario_aviso(p_comentario uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '28000';
  end if;
  update ladra.avisos_comentarios c
     set estado = 'oculto', ocultado_por = v_uid
   where c.id = p_comentario and c.estado = 'visible'
     and (c.autor_id = v_uid
          or exists (select 1 from ladra.avisos_puestos a where a.id = c.aviso_id and a.autor_id = v_uid)
          or exists (select 1 from ladra.moderadores m where m.usuario_id = v_uid));
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'PERMISO_DENEGADO' using errcode = '42501';
  end if;
end;
$$;

-- La lista pública suma contadores y si yo di me gusta (cambian las columnas: se reemplaza la función).
drop function ladra.listar_avisos_puestos();

create function ladra.listar_avisos_puestos()
returns table (
  id uuid, titulo text, descripcion text, tipo text, comuna text, direccion_publica text,
  latitud numeric, longitud numeric, precision_ubicacion text, para_que text,
  incluye text[], documentacion text[], costo_mensual_ac integer, costo_habilitacion_ac integer,
  plazo_habilitacion_dias integer, permiso_estado text, condiciones_devolucion text,
  creado_en timestamptz, es_mio boolean,
  meta_ac integer, plazo_recaudacion_dias integer, recaudacion_hasta timestamptz, equipo jsonb,
  me_gusta_total integer, comentarios_total integer, yo_di_me_gusta boolean
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select a.id, a.titulo, a.descripcion, a.tipo, a.comuna, a.direccion_publica,
         a.latitud, a.longitud, a.precision_ubicacion, a.para_que,
         a.incluye, a.documentacion, a.costo_mensual_ac, a.costo_habilitacion_ac,
         a.plazo_habilitacion_dias, a.permiso_estado, a.condiciones_devolucion,
         a.creado_en, coalesce(a.autor_id = (select auth.uid()), false) as es_mio,
         a.meta_ac, a.plazo_recaudacion_dias, a.recaudacion_hasta,
         ladra.equipo_aviso_puesto(a.id, a.autor_id) as equipo,
         (select count(*) from ladra.avisos_me_gusta g where g.aviso_id = a.id)::integer as me_gusta_total,
         (select count(*) from ladra.avisos_comentarios c where c.aviso_id = a.id and c.estado = 'visible')::integer as comentarios_total,
         exists (select 1 from ladra.avisos_me_gusta g where g.aviso_id = a.id and g.usuario_id = (select auth.uid())) as yo_di_me_gusta
    from ladra.avisos_puestos a
   where a.estado = 'publicado'
   order by a.creado_en desc;
$$;

revoke all on function ladra.alternar_me_gusta_aviso(uuid) from public, anon, authenticated;
revoke all on function ladra.comentar_aviso(uuid, text) from public, anon, authenticated;
revoke all on function ladra.listar_comentarios_aviso(uuid) from public, anon, authenticated;
revoke all on function ladra.ocultar_comentario_aviso(uuid) from public, anon, authenticated;
revoke all on function ladra.listar_avisos_puestos() from public, anon, authenticated;

grant execute on function ladra.alternar_me_gusta_aviso(uuid) to authenticated;
grant execute on function ladra.comentar_aviso(uuid, text) to authenticated;
grant execute on function ladra.listar_comentarios_aviso(uuid) to anon, authenticated;
grant execute on function ladra.ocultar_comentario_aviso(uuid) to authenticated;
grant execute on function ladra.listar_avisos_puestos() to anon, authenticated;

notify pgrst, 'reload schema';

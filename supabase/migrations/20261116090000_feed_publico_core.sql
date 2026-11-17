-- API de lectura para que Core consuma el feed público de Ladra sin consultar sus tablas.
-- Solo expone publicaciones y medios de animales publicados y visibles en la red.
create or replace function ladra.feed_publico_core(p_limite integer default 100)
returns table (
  id uuid,
  source_kind text,
  animal_id uuid,
  animal_nombre text,
  tipo text,
  titulo text,
  texto text,
  estado text,
  ruta_archivo text,
  bucket_id text,
  media_kind text,
  creado_en timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.id, x.source_kind, x.animal_id, x.animal_nombre, x.tipo, x.titulo,
         x.texto, x.estado, x.ruta_archivo, x.bucket_id, x.media_kind, x.creado_en
  from (
    select
      f.id,
      'publicacion'::text as source_kind,
      a.id as animal_id,
      a.nombre::text as animal_nombre,
      f.tipo::text as tipo,
      null::text as titulo,
      nullif(btrim(f.texto),'') as texto,
      null::text as estado,
      f.ruta_archivo::text as ruta_archivo,
      case when f.ruta_archivo is not null then 'ladra-feed'::text else null::text end as bucket_id,
      case when f.ruta_archivo is not null then 'image'::text else null::text end as media_kind,
      f.creado_en
    from ladra.publicaciones_feed f
    join ladra.animales a on a.id = f.animal_id
    where a.estado = 'publicado'
      and a.mostrar_en_red is true
      and (f.tipo = 'post' or (f.tipo = 'historia' and f.creado_en > now() - interval '24 hours'))
    union all
    select
      m.id,
      'medio'::text,
      a.id,
      a.nombre::text,
      m.tipo::text,
      nullif(btrim(m.titulo),''),
      nullif(btrim(m.descripcion),''),
      m.estado::text,
      m.ruta_archivo::text,
      'mascotas-medios'::text,
      case when m.tipo = 'video' then 'video'::text else 'image'::text end,
      m.creado_en
    from ladra.medios_mascota m
    join ladra.animales a on a.id = m.animal_id
    where a.estado = 'publicado'
      and a.mostrar_en_red is true
  ) x
  order by x.creado_en desc, x.id desc
  limit least(greatest(coalesce(p_limite,100),1),100);
$$;

comment on function ladra.feed_publico_core(integer) is
  'Lectura pública del feed social de Ladra: solo publicaciones y medios de animales publicados y visibles en la red; las historias vencen a las 24 horas. No devuelve datos de sus responsables.';

revoke all on function ladra.feed_publico_core(integer) from public, anon, authenticated;
grant execute on function ladra.feed_publico_core(integer) to anon, authenticated;
notify pgrst, 'reload schema';
-- Directorio público del ecosistema animal de Maipú.
-- Mantiene los datos aislados en ladra y registra procedencia para no confundir
-- datos abiertos con una verificación presencial de AuraLadra.

alter table ladra.lugares_publicos
  add column if not exists fuente_nombre text,
  add column if not exists fuente_url text,
  add column if not exists fuente_consultada_en date;

comment on column ladra.lugares_publicos.fuente_nombre is
  'Procedencia pública del registro. No implica verificación presencial.';
comment on column ladra.lugares_publicos.fuente_url is
  'Enlace público usado para documentar el lugar.';

revoke select on ladra.lugares_publicos from anon, authenticated;
grant select (
  id, slug, nombre, descripcion, direccion_publica, comuna, categoria,
  estado_verificacion, latitud, longitud, publicado, actualizado_en,
  servicio_urgencia, urgencia_24h, horario_publico, telefono_publico,
  sitio_web, precision_ubicacion, fuente_nombre, fuente_url,
  fuente_consultada_en
) on ladra.lugares_publicos to anon, authenticated;

grant update (
  fuente_nombre, fuente_url, fuente_consultada_en
) on ladra.lugares_publicos to authenticated;

insert into ladra.lugares_publicos (
  slug, nombre, descripcion, direccion_publica, comuna, categoria,
  estado_verificacion, latitud, longitud, publicado, servicio_urgencia,
  urgencia_24h, horario_publico, telefono_publico, sitio_web,
  precision_ubicacion, fuente_nombre, fuente_url, fuente_consultada_en
)
values
  (
    'canil-parque-3-poniente', 'Canil Parque 3 Poniente',
    'Canil y punto de encuentro del piloto comunitario de AuraLadra.',
    'Av. 3 Poniente 108', 'Maipú', 'canil', 'comunitario',
    -33.5271012, -70.7781215, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/way/108499393', '2026-09-17'
  ),
  (
    'veterinaria-3-poniente', 'Veterinaria 3 Poniente',
    'Directorio público informa atención veterinaria y urgencias 24 horas. Confirma disponibilidad antes de trasladarte.',
    'Av. 3 Poniente 0676', 'Maipú', 'veterinaria', 'comunitario',
    -33.5220641, -70.7794138, true, true, true, null, null, null,
    'exacta', 'AgendaPro y OpenStreetMap',
    'https://agendapro.com/es', '2026-09-17'
  ),
  (
    'clinica-veterinaria-jessica-osm', 'Clínica Veterinaria Jessica',
    'Registro georreferenciado en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Av. Los Pajaritos', 'Maipú', 'veterinaria', 'comunitario',
    -33.4993101, -70.7571789, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4457015728', '2026-09-17'
  ),
  (
    'pet-help-osm', 'Pet Help',
    'Registro veterinario georreferenciado en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.5144851, -70.7757063, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4462403031', '2026-09-17'
  ),
  (
    'hospital-clinico-veterinario-osm', 'Hospital Clínico Veterinario',
    'Registro veterinario georreferenciado en datos abiertos. No se presume atención de urgencia; confirma antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.5246652, -70.7756774, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4465200065', '2026-09-17'
  ),
  (
    'hevm-osm', 'HEVM',
    'Registro veterinario georreferenciado en datos abiertos. Confirma nombre, vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.5165850, -70.7632879, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4466702595', '2026-09-17'
  ),
  (
    'veterinaria-safari-osm', 'Veterinaria Safari',
    'Registro veterinario georreferenciado en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Av. Longitudinal', 'Maipú', 'veterinaria', 'comunitario',
    -33.4726298, -70.7482939, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/12882533372', '2026-09-17'
  ),
  (
    'one-health-osm', 'One Health',
    'Registro veterinario georreferenciado en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.4729753, -70.7387896, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/13987466843', '2026-09-17'
  ),
  (
    'veterinaria-zoovet-osm', 'Veterinaria Zoovet',
    'Registro veterinario georreferenciado en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.4968536, -70.7448610, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/way/449949339', '2026-09-17'
  ),
  (
    'hospital-veterinario-santiago-norte-osm', 'Hospital Veterinario Santiago Norte',
    'Registro veterinario georreferenciado en datos abiertos dentro de Maipú. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'veterinaria', 'comunitario',
    -33.4703064, -70.7464689, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/way/450007204', '2026-09-17'
  ),
  (
    'vichi-pets-osm', 'Vichi & Pets',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5010643, -70.7451366, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4435252198', '2026-09-17'
  ),
  (
    'top-pet-osm', 'Top Pet',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5559597, -70.7923403, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4455412294', '2026-09-17'
  ),
  (
    'pet-happy-osm', 'Pet Happy',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Av. Los Pajaritos', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5029141, -70.7569834, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4457003449', '2026-09-17'
  ),
  (
    'pronto-can-osm', 'Pronto Can',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Ramón Freire', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5101899, -70.7733059, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4458124778', '2026-09-17'
  ),
  (
    'muta-mascoteria-osm', 'Muta Mascotería',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5164900, -70.7633181, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/4466702593', '2026-09-17'
  ),
  (
    'befoods-osm', 'Befoods',
    'Tienda de alimento para mascotas registrada públicamente.',
    'Av. 5 de Abril 92', 'Maipú', 'alimento', 'comunitario',
    -33.5108550, -70.7585272, true, false, false,
    'Lunes a viernes 09:00–19:30; sábado 09:00–18:30', '+56 9 4770 8963',
    'https://befoods.cl/', 'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/11959587237', '2026-09-17'
  ),
  (
    'mondo-cane-osm', 'Mondo Cane',
    'Tienda de mascotas registrada en datos abiertos. Confirma vigencia y horario antes de ir.',
    'Maipú', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.4833640, -70.7467000, true, false, false, null, null, null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/node/14066195357', '2026-09-17'
  ),
  (
    'superzoo-pajaritos-osm', 'SuperZoo Pajaritos',
    'Tienda de mascotas registrada públicamente en Maipú.',
    'Av. Los Pajaritos 2310', 'Maipú', 'tienda_mascotas', 'comunitario',
    -33.5062213, -70.7577239, true, false, false,
    '08:00–21:00', '(2) 2760 7777', null,
    'exacta', 'OpenStreetMap',
    'https://www.openstreetmap.org/way/448733449', '2026-09-17'
  ),
  (
    'tus-mascotas-pajaritos', 'TusMascotas.cl Maipú',
    'Tienda con alimentos, accesorios, veterinaria y peluquería para distintas especies.',
    'Av. Los Pajaritos 2356, local 101', 'Maipú', 'tienda_mascotas', 'verificado',
    -33.5058455, -70.7577867, true, false, false,
    'Lunes a viernes 10:00–20:00; sábado, domingo y festivos 11:00–19:00',
    '+56 9 7564 4676', 'https://www.tusmascotas.cl/',
    'exacta', 'Sitio oficial TusMascotas.cl',
    'https://www.tusmascotas.cl/', '2026-09-17'
  )
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  direccion_publica = excluded.direccion_publica,
  comuna = excluded.comuna,
  categoria = excluded.categoria,
  estado_verificacion = excluded.estado_verificacion,
  latitud = excluded.latitud,
  longitud = excluded.longitud,
  publicado = excluded.publicado,
  servicio_urgencia = excluded.servicio_urgencia,
  urgencia_24h = excluded.urgencia_24h,
  horario_publico = excluded.horario_publico,
  telefono_publico = excluded.telefono_publico,
  sitio_web = excluded.sitio_web,
  precision_ubicacion = excluded.precision_ubicacion,
  fuente_nombre = excluded.fuente_nombre,
  fuente_url = excluded.fuente_url,
  fuente_consultada_en = excluded.fuente_consultada_en,
  actualizado_en = now();

update ladra.estado_sistema
set version = '0.3.1', actualizado_en = now()
where id = 'auraladra';

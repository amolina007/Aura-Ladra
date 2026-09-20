# AuraLadra (antes AuraPets) — Convergencia Aura · Mascotas

Sitio del piloto: canil del Parque 3 Poniente, Av. 3 Pte. 108, Maipú, Santiago.
Narrado en primera persona por Leia.

## Stack
- HTML/CSS/JS plano (sin build step), igual patrón que AuraRitmos
- Supabase (Postgres + Auth + Storage) como backend
- Netlify para hosting (proyecto: `auraladra-convergencia-aura`, separado del
  proyecto `auraritmos-convergencia-aura`)

## Aislamiento de datos
Este sitio consume **solo** el schema `ladra` dentro del proyecto Supabase
compartido con AuraRitmos. AuraRitmos vive en el schema `public` con su
propio set de tablas (`comunidades`, `locaciones`, `docentes`, etc.) — las
tablas de cada schema no se tocan, no se referencian ni se alteran desde el
repo del otro producto.

**Excepción real: `storage.objects`.** A diferencia de las tablas normales,
Supabase Storage guarda los metadatos de *todos* los buckets de *todos* los
productos en una única tabla física, `storage.objects`, sin importar el
schema de cada app. Postgres evalúa **todas** las políticas RLS de esa tabla
en cada operación, aunque pertenezcan a un bucket de otro producto. El
17-19/09/2026 esto causó un incidente real: una subida de foto de mascota en
AuraLadra disparaba también las políticas de `fotos-sesiones` de AuraRitmos
(JOIN contra `docentes`, `sesiones_clase`), generando errores de permisos
en operaciones que no tenían nada que ver con AuraRitmos. Se corrigió en
`isolate_storage_policies_by_bucket` y `isolate_auraritmos_storage_authorization`.

**Regla obligatoria para cualquier política nueva sobre `storage.objects`,
la escriba quien la escriba:** la primera condición de la política, sin
excepción, debe filtrar por `bucket_id`. En SQL plano:

using (
  case when bucket_id = 'nombre-del-bucket' then (
    -- lógica específica de este bucket
  ) else false end
)

o, mejor aún, encapsular la lógica en una función `security definer` por
bucket (como `private.puede_leer_foto_sesion`) en vez de escribir JOINs
inline en la política. Nunca asumas que una política de storage solo se
evalúa para tu propio bucket.

## Estructura
```
index.html          Landing (voz de Leia)
css/styles.css       Estilos (motivos de huellas/bigotes)
js/supabase-client.js  Cliente Supabase (URL + anon key)
js/main.js            Lógica del sitio
assets/                Imágenes, íconos
```

## Conexión de datos
El cliente usa la URL pública y la publishable key de Supabase. Estas
credenciales identifican el proyecto, pero no conceden privilegios por sí
solas: el acceso efectivo se limita mediante grants y RLS.

Las migraciones en `supabase/migrations/` crean superficies aisladas dentro de
`ladra`: `estado_sistema` verifica la conexión, `lugares_publicos` entrega el
mapa comunitario, `reportes_canil` sostiene el piloto y las tablas de animales,
perfiles públicos y vínculos forman la primera versión de la red animal. El
schema `ladra` se agrega a Data API sin reemplazar los schemas ya expuestos.

## Mapa comunitario

- La primera cobertura pública se limita a la comuna de Maipú.
- Una alerta de pérdida solo puede crearse desde una ficha propia de Red animal.
  “Mi cuenta” permite cambiar su estado entre `segura` y `extraviada`; al marcarla
  como extraviada se busca la última ubicación con OpenStreetMap y se publica un
  marcador sin datos de contacto ni identidad del responsable.
- Indexa caniles, veterinarias, urgencias veterinarias, tiendas de mascotas,
  alimento, juguetes y accesorios, además de puntos de animales comunitarios.
- Cada ficha importada registra su fuente y fecha de consulta; los datos abiertos
  no se presentan como si hubieran sido verificados presencialmente.
- Los lugares propuestos quedan pendientes hasta que una persona moderadora los
  apruebe.
- La ubicación de animales vulnerables puede publicarse de forma aproximada.
- Las urgencias veterinarias se distinguen explícitamente de una veterinaria
  general.

## Red animal

- Cada animal tiene un perfil independiente y puede estar asociado a cero, una
  o varias personas.
- Los animales también pueden relacionarse entre sí (familia, convivencia,
  amistad, colonia o manada).
- Los perfiles, alias y vínculos propuestos requieren moderación antes de ser
  públicos.
- El MVP no incluye publicaciones, comentarios, seguidores ni mensajería.

## Piloto de reportes

- Cualquier persona puede reportar agua, limpieza, seguridad o infraestructura
  sin iniciar sesión.
- Todos los reportes nacen como `pendiente`; pendientes y rechazados son
  privados.
- Solo reportes `verificado` o `cerrado` aparecen en el listado comunitario y
  nunca exponen la identidad del reportante.
- Magic Link es opcional y permite seguir los reportes enviados durante una
  sesión autenticada.
- La moderación se habilita por UUID de Auth en `ladra.moderadores`. No se
  codifican correos ni identidades administrativas en el repositorio.
- El frontend no recibe privilegio de inserción directa: usa la función validada
  `ladra.crear_reporte_canil`, con límites de longitud, fecha y campo honeypot.

## Fuera del MVP (decisión ya tomada)

Publicaciones sociales, comentarios, seguidores, chat, marketplace, Aura Coin,
reputación, gamificación, GPS en tiempo real público e integración oficial
obligatoria con terceros.

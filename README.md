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
propio set de tablas (`comunidades`, `locaciones`, `docentes`, etc.) — no se
toca, no se referencia, no se altera desde este repo.

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

Las migraciones en `supabase/migrations/` crean dos superficies públicas de
solo lectura: `ladra.estado_sistema` verifica la conexión del frontend y
`ladra.lugares_publicos` entrega ubicaciones comunitarias publicadas. El schema
`ladra` debe estar incluido en Data API > Exposed schemas.

## Fuera del MVP (decisión ya tomada)
Red social, chat, marketplace, Aura Coin, reputación, gamificación, GPS en
tiempo real público, integración oficial obligatoria con terceros.

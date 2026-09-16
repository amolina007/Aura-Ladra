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

## Configuración pendiente
`js/supabase-client.js` tiene placeholders para la URL del proyecto y la
anon key. Se completan una vez que el schema `ladra` y sus tablas estén
creadas.

## Fuera del MVP (decisión ya tomada)
Red social, chat, marketplace, Aura Coin, reputación, gamificación, GPS en
tiempo real público, integración oficial obligatoria con terceros.

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

## Ayudar → Acciones por financiar (simulación)

Una persona u organización propone una prestación concreta para un animal; varias
personas aportan hasta completar el presupuesto; después se ejecuta y se documenta.
Son aportes solidarios para financiar una acción: **no ofrecen intereses ni retornos**.

- **Estado actual: todo aporte es una simulación.** No hay pasarela de pago ni reglas
  de desembolso. Las tablas lo fuerzan (`modo_pago = 'simulacion'`, `simulado = true`,
  `desembolso = 'no_liberado'`). Antes de habilitar pagos reales hay que definir:
  cuándo se cobra, quién recibe o custodia el dinero, cuándo se desembolsa y cómo se devuelve.
- Flujo de estados: Borrador → En revisión → Recaudando → Meta alcanzada → Programada →
  En ejecución → Completada. También Expirada, Cancelada y En disputa; el estado de
  devolución se guarda aparte (`estado_devolucion`).
- Alcanzar la meta no libera fondos ni prueba que el trabajo esté hecho: el responsable
  debe programar, ejecutar, publicar evidencia y solicitar el cierre.
- Montos y estados los calcula el servidor (funciones `ladra.*` con `security definer`).
  El navegador no tiene permiso para leer ni escribir las tablas directamente. Los aportes
  usan clave de idempotencia (un doble toque no duplica) y la fila se bloquea para que
  aportes simultáneos no excedan la meta.
- Con aportes recibidos no se pueden cambiar precio, alcance, beneficiario ni condiciones;
  hay historial de cambios.
- Migraciones: `20261003180000_acciones_financiables_tablas.sql` y
  `20261003181000_acciones_financiables_funciones.sql`. **No aplicadas todavía** al proyecto
  Supabase; mientras tanto `js/acciones.js` usa un modo demo con datos de ejemplo guardados
  solo en el navegador y avisa de ello en pantalla.
- Pruebas: `supabase/tests/acciones_financiables_prueba.sql` (se ejecuta en una base
  Postgres desechable, nunca en Supabase real).
- Pendiente: pantalla de moderación (hoy se usa `ladra.moderar_accion` por SQL),
  subida de fotos y documentos propios, mensajería para "Consultar", disputas.

## Comida y agua (puestos en espacios públicos)

Sección propia en el menú hamburguesa (`#comida-agua`), con un bloque resumen en **Ayudar** y los puestos
como pines 💧 en el **Mapa** (filtro «Comida y agua»).

- **Cómo se ayuda:** *patrocinar* un puesto (aporte a la meta del mes) y *cuidarlo en persona* (anotarse como
  cuidador, registrar una reposición de agua o comida, o avisar que falta algo).
- **Modo demo (estado actual):** `js/puestos.js` usa 3 puestos de ejemplo guardados solo en el navegador
  (`localStorage`) y avisa de ello en pantalla. Los aportes son una **simulación**: no se cobra dinero. No se usa
  Supabase todavía.
- **Quién agrega puestos:** decisión tomada: solo moderación. **Aún no existe** ese panel ni la base de datos;
  por ahora los puestos de ejemplo vienen precargados.
- **Pendiente:** tablas y funciones `ladra.*` (puestos, aportes, cuidadores, reposiciones) con RLS, panel de
  moderación para agregar puestos, ubicaciones reales verificadas, fotos del puesto y pagos reales (que requieren
  definir pasarela y reglas, igual que Acciones por financiar).

## Personal → Mi árbol de vínculos

Pestaña **Mi árbol** dentro de Mi perfil. Abre una vista a pantalla completa con las pestañas **Árbol** e **Historia**, una **lista alternativa** y un panel con el detalle del integrante seleccionado.

- **Cómo crece:** una *hoja* aparece en la rama de quien participó al registrar un paseo, juego o cuidado; una *flor*, al registrar un encuentro, adopción o recuerdo. Una línea punteada une ramas con un vínculo o un momento compartido. No hay puntajes y la inactividad no marchita el árbol. Los animales fallecidos conservan una rama de memoria que se puede ocultar.
- **Misma fuente que la ficha:** el árbol usa `humanos_animal`, `vinculos_animal_humano` y `vinculos_animales` (los mismos ids de animales, sin segunda ficha). El apartado «Vínculos» de la ficha también lista los vínculos persona↔animal confirmados y visibles. «Ver ficha» / «Editar ficha» abren la ficha existente (puente `window.auraLadraFicha` en `main.js`); «Editar vínculo» solo cambia la relación.
- **Privacidad:** todo pasa por funciones `ladra.*` con RLS forzada. Privado por defecto; los vínculos con usuarios registrados requieren aceptación; los integrantes privados son solo del propietario; los datos de salud nunca se incluyen.
- **Migración:** `supabase/migrations/20261003190000_mi_arbol_de_vinculos.sql` (**preparada, no ejecutada** en ningún entorno real). Pruebas: `supabase/tests/mi_arbol_prueba.sql` con `supabase/tests/laboratorio_piezas_falsas.sql` en una base PostgreSQL desechable.
- **Sin la migración** la pestaña funciona en modo **Demostración** (datos ficticios rotulados «(ejemplo)», guardados solo en el navegador).

## Mi perfil

Pantalla única con tarjetas (árbol ilustrado, Mis mascotas, Aportes a la comunidad) y sub-pantallas con flecha de
volver (Mis animales, Actividad, Mis aportes, Mis acciones). El árbol dibujado muestra hasta 3 integrantes reales de
Mi árbol. «Aportes a la comunidad» cuenta Cuidados (paseos, juegos y cuidados) y Encuentros desde el árbol, y Ayuda
desde los aportes a acciones (simulados). Comunicación entre módulos por eventos `arbol:cambio` y `ayuda:cambio`.
Misiones y recompensas **no** existen: la gamificación está fuera del MVP.

## Fuera del MVP (decisión ya tomada)

Publicaciones sociales, comentarios, seguidores, chat, marketplace, pagos reales (los aportes
de Acciones por financiar son solo simulación), Aura Coin,
reputación, gamificación, GPS en tiempo real público e integración oficial
obligatoria con terceros.

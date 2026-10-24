# Patrocinio de campañas con AC

## Alcance

Campañas publicadas de Comida y agua con `meta_ac`. Las propuestas sin meta y las acciones con presupuesto en CLP conservan su funcionamiento previo. No se emiten monedas, no se convierten pesos y no se integra una pasarela de pago.

La implementación está en dev. La migración `20261024194611_patrocinio_ac_campanas.sql` está preparada; no se ha aplicado a la base compartida de Aura. El navegador muestra que falta la activación si las funciones todavía no existen.

## Reglas implementadas

- El patrocinador inicia sesión, tiene saldo disponible y ya aceptó los términos vigentes en la billetera central. Ladra no acepta términos por la persona.
- Revisa el monto y confirma expresamente la reserva. El monto es entero y no supera saldo ni meta restante. No se permite autopatrocinio.
- Las monedas pasan de disponible a bloqueado en la misma billetera. Quedan vinculadas al aporte por su operación contable. No se entregan al responsable al alcanzar la meta.
- Las reservas de campaña no se pueden canjear/cancelar por otros flujos. Las reservas ajenas a Ladra conservan su comportamiento.
- Al alcanzar exactamente la meta comienza el plazo de entrega del aviso. El responsable presenta hitos con monto y evidencia HTTPS pública. El total de solicitudes pendientes no puede superar lo reservado.
- Otro moderador revisa evidencia y permisos, escribe una resolución y confirma la liberación. Un moderador que es responsable de la campaña no puede aprobarse a sí mismo.
- Cada hito aprobado transfiere solo el monto aprobado de las reservas al saldo disponible del responsable, mediante asientos que suman cero.
- Si vence la recaudación sin completar la meta, se devuelve todo. Si vence la entrega, se devuelve lo que no se haya liberado. Retirar el aviso también devuelve lo restante. No se recuperan entregas ya aprobadas.
- La devolución automática corre cada minuto con `pg_cron`, incluso si se pausan operaciones nuevas. En la interfaz se distingue si la devolución aún está pendiente de procesamiento.

Las reglas de devolución anteriores prevalecen sobre el texto libre de propuesta del aviso, y se muestran antes de confirmar un aporte.

## Integración y seguridad

Las tablas `ladra.campanas_patrocinio_ac`, `ladra.patrocinios_ac` y `ladra.hitos_patrocinio_ac` tienen RLS forzada y ningún permiso directo para `anon`/`authenticated`. Solo se exponen funciones con identidad y permisos validados dentro de Postgres.

La integración usa las funciones de reserva/consulta existentes de Aura. No modifica objetos de `public` ni `core`, ni parámetros globales de AC. Añade un trigger específico a `aura_coin.bloqueo` cuya función vive en `ladra`, para proteger únicamente las reservas vinculadas a los patrocinios.

El libro central requiere actor no nulo. Las devoluciones automáticas se contabilizan a nombre del patrocinador original y se identifican expresamente con motivo «Devolución automática de patrocinio» y referencia a la campaña; no representan una nueva orden manual de esa persona.

La campaña se bloquea antes de comprobar su meta y mover valor. Las cuentas se bloquean en orden estable. Reserva, actualización de meta y registro de aporte son una transacción. Reintentos usan la misma clave; una respuesta perdida conserva la clave en `sessionStorage`. Una revisión de hito no puede pagarse dos veces. Las devoluciones cambian su saldo restante en la misma transacción que los asientos.

Los enlaces a evidencia son públicos: no deben contener datos privados. La evidencia la revisa una persona; no se afirma haber verificado automáticamente el trabajo físico.

## Pruebas reproducibles

Requiere Node 24+, `npm ci` y las tres migraciones del libro central del repositorio privado Convergencia-Aura. No se copian esos archivos privados al repositorio público de Ladra.

En una carpeta temporal guarda:

- `supabase/migrations/20261008180000_aura_coin_00_base.sql` como `00_base.sql`.
- `supabase/migrations/20261008180100_aura_coin_01_libro.sql` como `01_libro.sql`.
- `supabase/migrations/20261008180200_aura_coin_02_operaciones.sql` como `02_operaciones.sql`.

Ejecuta `AURA_COIN_FIXTURES=/ruta/a/esa/carpeta npm run test:patrocinio`.

Las pruebas crean una base PostgreSQL WASM desechable con PGlite. El esquema Auth, los términos y la consulta de saldo son piezas de laboratorio. Reservas, cancelaciones, asientos y sus restricciones usan las migraciones centrales indicadas. El adaptador de cron solo comprueba la instalación del comando: los vencimientos se prueban llamando a la función en esa base desechable. Las pruebas de interfaz con jsdom no acceden a cuentas reales.

Cobertura: permisos, baneo, términos, saldo insuficiente, autopatrocinio, meta máxima, claves repetidas, confirmación explícita, respuesta perdida, protección ante canje/cancelación externa, evidencia HTTPS, rechazo y aprobación de hitos, prohibición de autoaprobación, entrega parcial/completa, vencimiento/retiro, devoluciones durante una pausa y conciliación de asientos/saldos. No se ha hecho una prueba de concurrencia con varias conexiones Postgres ni de una devolución de pg_cron en la base real.

## Activación pendiente

Solo se encontró una base compartida de Aura; la rama Git dev no es una base de datos separada. La regla 1 de `Convergencia-Aura/AGENTS.md` exige autorización explícita para aplicar migraciones a la base real. El paso final es aplicar esta migración al proyecto Aura y comprobar metadatos, permisos, tarea programada y lecturas públicas, sin aportar ni transferir AC de usuarios durante la verificación.

Debe existir un moderador distinto del responsable para aprobar sus hitos. Esta implementación no agrega moderadores ni otorga permisos a personas nuevas.

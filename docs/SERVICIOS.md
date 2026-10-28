# Servicios para mascotas

Implementación en la rama `dev`. Acceso `#servicios`, menú «Servicios y más», tarjeta de Inicio,
repertorio de trucos y ficha de una mascota propia viva. Mantiene la navegación inferior y la estética vigente.

## Recorrido

- Catálogo de prestaciones reales: búsqueda sin distinguir tildes, categoría, zona, modalidad y precio máximo.
  El precio máximo compara el precio base y excluye precios a convenir. No garantiza un presupuesto final.
- Ficha con prestador, zona, modalidad, precio CLP, duración, descripción y condiciones.
- Consulta con una mascota propia viva, día, franja horaria y mensaje. Es una solicitud, no una reserva ni un cobro.
- Bandeja de solicitudes enviadas y recibidas. El prestador responde una vez, indicando disponibilidad y valor,
  o que no tiene disponibilidad. El tutor lee la respuesta en esa misma bandeja. No hay avisos por correo ni WhatsApp.
- Publicación por una cuenta autenticada; retiro y republicación propios. No elimina el historial de consultas.
  El prestador declara su nombre comercial: no se muestran insignias de identidad o experiencia verificadas.
- Fotos opcionales mediante un enlace HTTPS ya alojado en Ladra o en el Supabase existente, respetando la política
  de imágenes actual. Este flujo no incluye subida de archivos. Sin foto, o si falla, se muestra el símbolo de la categoría.

El botón «Ver ejemplos del diseño» permite explorar tres ejemplos rotulados. No se mezclan con el catálogo real,
no se guardan, no se cuentan como actividad y no admiten consultas. El formulario ilustrativo tiene el envío desactivado.

## Base de datos y límites

Migración: `supabase/migrations/20261028023325_ladra_servicios_y_consultas.sql`, generada inicialmente con el CLI
y renombrada para coincidir con la versión registrada por Supabase.
**Aplicada al proyecto compartido el 27 de octubre de 2026 (Chile), con autorización del propietario.**
No modifica `public`, Core, Auth ni Storage.
Una instalación sin estas tablas muestra «Servicios está en preparación» y no simula un envío exitoso.

Tablas `ladra.servicios` y `ladra.servicio_consultas`, ambas con RLS y permisos por columna:

- Cualquiera lee las ofertas publicadas. Solo su propietario lee las retiradas y cambia `publicado`.
- La identidad del propietario procede de `auth.uid()`; el cliente no puede elegir otro propietario.
- El trigger de consulta usa `SECURITY INVOKER`: exige mascota propia viva, oferta publicada, fecha entre hoy
  y 365 días (zona America/Santiago) y consulta ajena. Copia solo el nombre de la mascota y el título del servicio.
- Solo solicitante y prestador leen la consulta. El prestador puede responder una pendiente y no puede
  cambiar su tutor, servicio o mascota. No necesita permiso para leer la ficha privada del animal.
- Una clave única por usuario y solicitud evita duplicados al reintentar un envío cuya respuesta de red se perdió.
  La clave se conserva en memoria mientras el formulario permanece abierto en esta página; no persiste al recargar.
- El cierre/cambio de sesión limpia la bandeja y los formularios. Las respuestas de lecturas anteriores se descartan.
- El catálogo carga las 200 ofertas más recientes que permite RLS y la bandeja hasta 100 ofertas propias y 100 consultas.
  Son límites explícitos del piloto; no hay paginación ni ordenamiento por cercanía geográfica.

Las dos tablas tienen RLS y tres políticas cada una. La revisión de seguridad no reportó avisos para los objetos
nuevos; existen avisos previos de otros objetos del proyecto compartido que esta migración no modifica.
La prueba `supabase/tests/servicios_prueba.sql` comprobó en el servidor la publicación, lectura pública, consulta
por mascota propia, reintento sin duplicar, privacidad frente a terceros, respuesta del prestador y retiro.
Todas sus escrituras se revirtieron: el catálogo y la bandeja quedaron sin datos de prueba.

El destino web es la rama `dev`, en `https://dev--auraladra-convergencia-aura.netlify.app/#servicios`.
La primera publicación real debe crearla un prestador desde su cuenta; no se cargan ofertas ficticias.
La prueba completa en navegador con dos cuentas queda disponible para el usuario una vez publicado el despliegue.

## Verificación

`npm run test:servicios` ejecuta pruebas de interfaz con JSDOM y PostgreSQL desechable con PGlite.
Cubren filtros, navegación, ausencia del backend, ejemplos, publicación/retiro, consulta, reintento,
respuesta, cierre de sesión, HTML ajeno y permisos efectivos entre tutor, prestador, tercero y anónimo.
No usan personas ni mascotas reales ni escriben en Supabase.

Capturas de componentes reales en navegador: `output/servicios/`. La revisión bloquea conexiones externas,
simula únicamente la ausencia del backend y abre los ejemplos rotulados del propio código.

Referencias consultadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[cliente JavaScript](https://supabase.com/docs/reference/javascript/rpc).

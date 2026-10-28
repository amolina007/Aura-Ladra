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
- Publicación por una cuenta autenticada; edición, retiro y republicación propios. No elimina el historial de consultas.
  El prestador declara su nombre comercial: no se muestran insignias de identidad o experiencia verificadas.
- Foto opcional desde el celular o computador, con vista previa y opción de quitarla. Admite JPG, PNG y WebP
  hasta 20 MB y vuelve a codificar en WebP, sin EXIF, con lado máximo de 1600 px y archivo final de hasta 5 MB.
  Si el navegador no puede leer el formato, pide otra imagen. HEIC requiere exportación a JPG.
  Las fotos publicadas son públicas, también cuando el servicio se retira. Sin foto se muestra el símbolo de la categoría.
- «Editar servicio» precarga título, prestador, categoría, zona, modalidad, precio, duración, descripción y foto.
  Mantiene el mismo identificador y el estado publicado/retirado. Las consultas conservan el título registrado al enviarlas.
  Una revisión de servidor evita sobrescribir una edición hecha desde otra pestaña.

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

## Fotos y edición, 28 de octubre de 2026

Migración aplicada: `20261028031950_ladra_servicios_fotos_y_edicion.sql`.
Agrega `foto_path`, `revision`, `actualizado_en` y una clave única de creación a `ladra.servicios`;
permite actualizar únicamente las columnas editables y mantiene los permisos de propietario.
La clave de creación evita duplicar una publicación al reintentar tras perderse la respuesta de red.

El contenedor público `servicios-ladra` admite solo WebP y hasta 5 MB. Cada objeto se guarda como
`<usuario>/<uuid>.webp`, sin el nombre original del archivo. Solo el propietario puede subir y listar su carpeta.
La foto vinculada debe existir y pertenecer al propietario del servicio. Las reglas restrictivas aíslan este
contenedor aunque haya reglas permisivas de otros sitios. No se permite sobrescribir objetos ni borrar uno
que siga vinculado a un servicio. El reemplazo guarda primero la nueva referencia y después retira la imagen anterior.
Cancelar antes de guardar no sube nada; si se subió pero no se confirmó el guardado, al cerrar se intenta borrar
solo el archivo sin uso. La regla del servidor protege las imágenes cuyo guardado sí se confirmó en la base.
Una interrupción de red o un cambio de cuenta durante esa limpieza puede dejar un archivo sin uso para revisión posterior.

No se cambian `public`, Auth, Core ni contenedores de fotos existentes.

## Verificación

`npm run test:servicios` ejecuta pruebas de interfaz con JSDOM y PostgreSQL desechable con PGlite.
Cubren filtros, navegación, ausencia del backend, ejemplos, publicación/retiro, consulta, reintento,
respuesta, cierre de sesión, HTML ajeno y permisos efectivos entre tutor, prestador, tercero y anónimo.
No usan personas ni mascotas reales ni escriben en Supabase.

Capturas de componentes reales en navegador: `output/servicios/`. La revisión bloquea conexiones externas,
simula únicamente la ausencia del backend y abre los ejemplos rotulados del propio código.

Referencias consultadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[cliente JavaScript](https://supabase.com/docs/reference/javascript/rpc).

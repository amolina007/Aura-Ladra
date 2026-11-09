# Importación diaria de SOSAFE para Ladra dev

Ejecutar desde la raíz del repositorio:

```sh
sh scripts/preparar-sosafe-imagenes.sh
python3 scripts/sosafe-diario.py
```

El archivo diario público aporta identificadores y coordenadas aproximadas. El widget oficial confirma comuna, fecha, descripción, autor y foto. Se conservan hasta 30 días y se revisan de nuevo los avisos previos. Un 404/410 se excluye; otros errores de detalle conservan el lote anterior. No se usan sesiones ni claves de SOSAFE.

El lector usa Tesseract local en español y un detector local de perros y gatos. Lee el afiche antes de recortarlo. Los teléfonos OCR y nombres quedan separados de los contactos publicados en texto: no se corrigen dígitos ni se atribuye al autor la propiedad de la mascota. Las inferencias de OCR se muestran con revisión pendiente y enlace al original.

Los originales, modelos y cachés quedan en `output/sosafe/` y no se deben publicar ni incluir en Git. Los recortes destinados a la web se guardan en `data/sosafe-fotos/`. Si falla la detección, el logo cruza el encuadre o el control final detecta restos de la marca rosada, se deja una revisión pendiente. Una revisión visual liga también el hash del recorte para no validar por accidente una imagen modificada después. Las correcciones visuales puntuales de `data/sosafe-revisiones.json` solo se aplican cuando coincide el hash del original. `--enrich-only` permite reprocesar el archivo local sin volver a consultar todos los detalles.

La automatización de Codex “Mascotas SOSAFE Maipú” ejecuta este flujo a las 09:00 de Chile y publica solo en dev. Necesita este Mac y las herramientas locales disponibles. Después de modificar datos debe verificar pruebas, despliegue, Most Wanted y mapa. Si una imagen está bloqueada, no debe intentar sortear la restricción; avisar y conservar el enlace original.

No presentar el mapa como ubicación exacta de extravío: es el punto público del reporte. No afirmar que el historial anterior al inicio de la recopilación esté completo.

Se aplica `sosafe-sin-fondo.py` al final del enriquecimiento: segmentación local YOLO11s, transparencia PNG sin generar píxeles ni reconstruir partes del animal. OCR siempre se realiza sobre el afiche original. Si el sello cruza la silueta o no hay detección fiable, se conserva el acceso al original. Revisar visualmente las siluetas antes de publicar. Los PNG referenciados también se incluyen en el commit diario.

Las marcas detectadas por color o texto producen candidatos para revisión, no una eliminación de píxeles. Una revisión visual puede marcar `segmentacion.estado` como `aprobada` o `rechazada`, siempre con `original_sha256` e `imagen_sha256`. Sin silueta fiable se utiliza un recorte rectangular real sin el sello, revisado en `afiche_recortado` y ligado al `original_sha256`. Nunca se muestra el original completo dentro de tarjetas o mapa; se conserva su enlace. `sosafe_afiches.py` reutiliza el encuadre únicamente para el mismo original. No pintar ni reconstruir partes del animal. En el mapa todos los avisos externos se agrupan en Mascotas perdidas, conservando origen SOSAFE en la ficha.

La consolidación `sosafe_duplicados.py` se ejecuta después del enriquecimiento, antes de publicar. Agrupa imágenes originales idénticas, relaciones revisadas en `data/sosafe-duplicados.json` y contactos explícitos coincidentes acompañados por nombre o descripción casi idéntica. Nunca fusionar solo por nombre, teléfono, cercanía o parecido visual. Cada ficha guarda `publicaciones`: se expanden y revalidan individualmente en la siguiente ejecución; los 404/410 y caducados se excluyen antes de volver a consolidar. El aviso más completo es la ficha principal y los antecedentes adicionales conservan sus fuentes. No borrar `publicaciones` ni publicar sus miembros como tarjetas separadas. Incluir en el commit diario cambios justificados de `data/sosafe-duplicados.json`.

`sosafe_fechas.py` asigna fecha de extravío durante cada consolidación. Prioriza fecha explícita del texto o una fecha del afiche revisada visualmente y ligada a su hash; calcula referencias relativas claras como estimaciones. Sin fecha fiable usa la primera publicación disponible del grupo, siempre etiquetada como estimada. Fechas contradictorias quedan señaladas para revisión. No convertir calles (5 de Abril), fechas de otros sucesos ni intervalos ambiguos en fechas exactas. Los afiches no se interpretan por OCR como evidencia confirmada sin revisión.

Antes de publicar, `sosafe_publicables.py` excluye fichas sin imagen local existente. Los pendientes se guardan fuera de Git en `output/sosafe/pendientes-imagen.json` y se revalidan diariamente antes de reintentar su imagen. Revisar los nuevos encuadres pendientes y aprobar solo recortes sin sello. No publicar originales, cachés ni modelos.

Las siluetas mejoradas y revisadas se guardan en `presentacion_revisada`, con `original_sha256`, `imagen_sha256` y `foto` local. `sosafe_afiches.py` solo las reutiliza si coinciden ambos hashes. Si una máscara corta rasgos, usar un encuadre rectangular cercano sin sello. La interfaz no muestra el enlace al afiche original completo; la evidencia original se conserva en datos y caché.

`sosafe_tipos.py` distingue perdida, encontrada (incluye avistamiento), por_confirmar, reencuentro y fallecida. Las revisiones `tipo_aviso` se vinculan a `descripcion_sha256`; una descripción modificada invalida la revisión. No atribuir al autor propiedad ni retención. Hallazgos y avisos ambiguos muestran fecha de publicación, no fecha estimada de extravío. No mostrar enlaces a SOSAFE en fichas, antecedentes, avisos manuales ni mapa; conservar las fuentes solo como evidencia interna.

Los reencuentros se excluyen de publicación con `sosafe_publicables.py` y del frontend; no deben reaparecer en Most Wanted ni mapa. Las mascotas fallecidas se agrupan bajo `tipo_aviso: encontrada`, conservando `estado_mascota: fallecida` y etiqueta explícita. No mostrarlas como búsquedas activas ni ocultar el fallecimiento.

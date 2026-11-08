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

Las marcas detectadas por color o texto producen candidatos para revisión, no una eliminación de píxeles. Una revisión visual puede marcar `segmentacion.estado` como `aprobada` o `rechazada`, siempre con `original_sha256` e `imagen_sha256`. Sin silueta fiable se muestra el afiche original público; si la fuente lo bloquea se informa que no está disponible. En el mapa todos los avisos externos se agrupan en Mascotas perdidas, conservando origen SOSAFE en la ficha.

# Importación diaria de SOSAFE para Ladra dev

Ejecutar desde la raíz del repositorio:

```sh
sh scripts/preparar-sosafe-imagenes.sh
python3 scripts/sosafe-diario.py
```

El archivo diario público aporta identificadores y coordenadas aproximadas. El widget oficial confirma comuna, fecha, descripción, autor y foto. Se conservan hasta 30 días y se revisan de nuevo los avisos previos. Un 404/410 se excluye; otros errores de detalle conservan el lote anterior. No se usan sesiones ni claves de SOSAFE.

El lector usa Tesseract local en español y un detector local de perros y gatos. Lee el afiche antes de recortarlo. Los teléfonos OCR y nombres quedan separados de los contactos publicados en texto: no se corrigen dígitos ni se atribuye al autor la propiedad de la mascota. Las inferencias de OCR se muestran con revisión pendiente y enlace al original.

Los originales, modelos y cachés quedan en `output/sosafe/` y no se deben publicar ni incluir en Git. Los recortes destinados a la web se guardan en `data/sosafe-fotos/`. Si falla la detección o el logo cruza el encuadre, se deja una revisión pendiente. Las correcciones visuales puntuales de `data/sosafe-revisiones.json` solo se aplican cuando coincide el hash del original. `--enrich-only` permite reprocesar el archivo local sin volver a consultar todos los detalles.

La automatización de Codex “Mascotas SOSAFE Maipú” ejecuta este flujo a las 09:00 de Chile y publica solo en dev. Necesita este Mac y las herramientas locales disponibles. Después de modificar datos debe verificar pruebas, despliegue, Most Wanted y mapa. Si una imagen está bloqueada, no debe intentar sortear la restricción; avisar y conservar el enlace original.

No presentar el mapa como ubicación exacta de extravío: es el punto público del reporte. No afirmar que el historial anterior al inicio de la recopilación esté completo.

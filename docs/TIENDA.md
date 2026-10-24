# Causas comunitarias y Tienda

La sección 4 se presenta como **Usar AC** y muestra dos secciones: Causas comunitarias y Tienda. Conserva `#ayudar` y añade enlaces directos `#causas` y `#tienda`; ambos mantienen activa la cuarta opción de la barra inferior.

Las causas siguen usando sus funciones y el patrocinio AC existentes. Las acciones adicionales se conservan en un desplegable. La tienda es un catálogo inicial mantenido en `data/tienda.json`: muestra el AirTag + porta AirTag para collar publicado por Alejandro, a **30.000 AC**, relacionado con Ladra. El alias central `amolina007` se verificó contra el perfil del responsable de la campaña pública existente.

La ficha indica qué incluye y enlaza al perfil central del vendedor para consultar disponibilidad y entrega. Esta fase no crea órdenes, no cobra AC por productos ni implementa la edición del marketplace personal en Convergencia. No se añadieron tablas ni se cambiaron reglas de las campañas.

La imagen del producto es ilustrativa y se rotula de esa forma; el collar de contexto no está incluido en la publicación. No se supone stock, estado nuevo/usado, garantía ni lugar de entrega.

## Verificación

`node --test tests/tienda.test.mjs tests/patrocinio-ac-ui.test.mjs` comprueba navegación a las dos secciones, precio y vendedor, apertura/cierre de la ficha, enlace al perfil, búsqueda, reintento de carga y confirmación del patrocinio preexistente. También se revisa visualmente el sitio en navegador y en marcos de 390 px.

## Imagen

Archivo: `assets/airtag-portacollar.png`. Generada con la herramienta integrada ImageGen, sin fotografías del artículo físico. Prompt utilizado:

> Use case: product-mockup. Asset type: website marketplace product photo, no UI, no text. Create a clean high-end photorealistic product catalog photo for an AirTag plus silicone holder for a dog collar. One white circular Apple AirTag style tracker seated in a simple matte black silicone dog-collar holder, threaded on a neatly curved olive-green nylon dog collar. White disk with polished metal edge, no invented text or marks. The collar contextualizes holder fit, but is not included in the product bundle. Warm off-white cream background, natural soft studio light, subtle shadows, centered composition with plenty of margin, landscape 4:3 framing suitable to crop square, true-to-life object sizes, crisp textile and silicone detail. Do not include a dog, hands, smartphones, packaging, multiple trackers, extra accessories, text, watermark, price or interface. This is an illustrative promotional product photo, not a photograph of the seller's specific item.

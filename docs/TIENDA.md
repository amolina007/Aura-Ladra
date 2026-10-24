# Causas comunitarias y Tienda

La sección 4 se presenta como **Usar AC** y permite alternar entre Causas y Tienda mediante un interruptor compacto; muestra una sección a la vez. Conserva `#ayudar` y añade enlaces directos `#causas` y `#tienda`; ambos mantienen activa la cuarta opción de la barra inferior.

Las causas siguen usando sus funciones y el patrocinio AC existentes. Las acciones adicionales se conservan en un desplegable. La tienda es un catálogo inicial mantenido en `data/tienda.json`: muestra el AirTag + porta AirTag para collar publicado por Alejandro, a **30.000 AC**, relacionado con Ladra. El alias central `amolina007` se verificó contra el perfil del responsable de la campaña pública existente.

La ficha permite transferir AC al vendedor con la función existente de la billetera central. Exige sesión, términos aceptados, saldo suficiente, elegir «Entrega acordada con el comprador» y confirmar monto y destinatario. La transferencia es inmediata; los detalles de entrega se coordinan entre las partes. No crea órdenes ni certifica la entrega. Conserva la clave de la operación en sessionStorage para que los reintentos no dupliquen el movimiento y muestra el comprobante al terminar.

No se añadieron tablas ni migraciones. La tienda de Alejandro en Ladra se abre con `?vendedor=amolina007#tienda` y enlaza a su perfil central. La edición del marketplace personal dentro de Convergencia queda pendiente.

La imagen del producto es ilustrativa y se rotula de esa forma; el collar de contexto no está incluido en la publicación. Para el AirTag no se supone stock, estado nuevo/usado ni garantía.

## Snacks de Alejandro

Por indicación de Alejandro se publican **5 paquetes de Dentastix razas grandes de 7 unidades (270 g), a 3.150 AC cada uno**, y **5 paquetes de Rodeo pollo de 4 unidades (70 g), a 1.290 AC cada uno**. La referencia comercial acordada para estas publicaciones es temporal: **1 AC = $1 CLP**; no cambia la configuración de la billetera central.

Entregas a domicilio en Maipú, con despacho gratis en compras **sobre 20.000 AC ($20.000 CLP)**. Bajo ese monto, el costo se coordina con el vendedor. Las fichas permiten elegir entrega acordada o domicilio en Maipú; guardan la elección en la referencia de la transferencia. No hay carrito ni cálculo automático de despacho combinado.

El stock es declarado y se actualiza manualmente en `data/tienda.json`; no representa un sistema de reservas ni se descuenta automáticamente con las transferencias. Un producto con stock cero muestra «Agotado» y no habilita la transferencia. Las imágenes de los snacks son de catálogo, no fotografías del stock de Alejandro. Procedencia: [Dentastix en Jumbo](https://www.jumbo.cl/snack-perro-adulto-pedigree-dentastix-razas-grandes-7-un-1581826/p), [Rodeo pollo en Jumbo](https://www.jumbo.cl/snack-perro-adulto-pedigree-rodeo-pollo-4-un-1886112/p). Archivos de catálogo VTEX `349489` y `374350`, consultados el 24-10-2026.

## Verificación

`node --test tests/tienda*.test.mjs tests/patrocinio-ac-ui.test.mjs` comprueba navegación a las dos secciones, precio y vendedor, apertura/cierre de la ficha, enlace al perfil, búsqueda, reintento de carga y confirmación del patrocinio preexistente. Las pruebas de compra usan cuentas simuladas y comprueban entrega, confirmación explícita, doble clic, respuesta perdida, saldo, términos y cambio de cuenta, sin mover saldos reales. También se revisa visualmente el sitio en navegador y en marcos de 390 px.

Para probar el libro central en PostgreSQL WASM desechable, define `AURA_COIN_FIXTURES` con los archivos privados `00_base.sql`, `01_libro.sql` y `02_operaciones.sql` y ejecuta la misma orden. La prueba de transferencia comprueba el débito y crédito de 30.000 AC, reintento idempotente, saldo insuficiente y contabilidad equilibrada. Sin esa variable, se omite esa prueba de base de datos.

## Imagen

Archivo: `assets/airtag-portacollar.png`. Generada con la herramienta integrada ImageGen, sin fotografías del artículo físico. Prompt utilizado:

> Use case: product-mockup. Asset type: website marketplace product photo, no UI, no text. Create a clean high-end photorealistic product catalog photo for an AirTag plus silicone holder for a dog collar. One white circular Apple AirTag style tracker seated in a simple matte black silicone dog-collar holder, threaded on a neatly curved olive-green nylon dog collar. White disk with polished metal edge, no invented text or marks. The collar contextualizes holder fit, but is not included in the product bundle. Warm off-white cream background, natural soft studio light, subtle shadows, centered composition with plenty of margin, landscape 4:3 framing suitable to crop square, true-to-life object sizes, crisp textile and silicone detail. Do not include a dog, hands, smartphones, packaging, multiple trackers, extra accessories, text, watermark, price or interface. This is an illustrative promotional product photo, not a photograph of the seller's specific item.

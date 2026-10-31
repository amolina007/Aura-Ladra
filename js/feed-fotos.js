// Encuadre compartido por la vista previa y el archivo final.
(() => {
  'use strict';
  const validar = archivo => {
    const tipo = archivo?.type?.toLowerCase() || '';
    if (!archivo || !(/^image\/(jpeg|png|webp)$/.test(tipo) || (!tipo && /\.(jpe?g|png|webp)$/i.test(archivo.name)))) throw Error('Usa JPG, PNG o WebP. Si está en HEIC, expórtala como JPG desde tu galería.');
    if (!archivo.size || archivo.size > 20 * 1024 * 1024) throw Error('Elige una foto de hasta 20 MB.');
  };
  const abrir = async archivo => {
    validar(archivo);
    const url = URL.createObjectURL(archivo);
    let imagen = new Image(), bitmap;
    try {
      try {
        await new Promise((resolve, reject) => { imagen.onload = resolve; imagen.onerror = reject; imagen.src = url; });
      } catch (error) {
        if (!window.createImageBitmap) throw error;
        bitmap = await window.createImageBitmap(archivo);
        imagen = bitmap;
      }
      const ancho = imagen.naturalWidth || imagen.width, alto = imagen.naturalHeight || imagen.height;
      if (!ancho || !alto) throw Error('dimensiones');
      return { imagen, ancho, alto, cerrar() { bitmap?.close(); URL.revokeObjectURL(url); } };
    } catch {
      bitmap?.close(); URL.revokeObjectURL(url);
      throw Error('No pudimos abrir esa foto. Descárgala primero al celular si está en Google Fotos. También puedes guardar una copia como JPG o subir una captura de pantalla.');
    }
  };
  const rectangulo = (ancho, alto, proporcion, zoom = 1, x = 0, y = 0) => {
    const ratio = Number(proporcion) || ancho / alto;
    const w = Math.min(ancho, alto * ratio) / Math.max(1, Number(zoom));
    const h = w / ratio;
    const limitar = n => Math.max(-100, Math.min(100, Number(n) || 0));
    return { x: (ancho - w) * (limitar(x) + 100) / 200, y: (alto - h) * (limitar(y) + 100) / 200, w, h };
  };
  const dibujar = (foto, canvas, ajustes, max = 960) => {
    const r = rectangulo(foto.ancho, foto.alto, ajustes.proporcion, ajustes.zoom, ajustes.x, ajustes.y);
    const escala = Math.min(1, max / Math.max(r.w, r.h));
    canvas.width = Math.max(1, Math.round(r.w * escala)); canvas.height = Math.max(1, Math.round(r.h * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Tu navegador no pudo preparar la foto. Prueba con otra imagen o navegador.');
    ctx.drawImage(foto.imagen, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    return r;
  };
  const preparar = async (foto, ajustes) => {
    const canvas = document.createElement('canvas'); dibujar(foto, canvas, ajustes);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob || blob.type !== 'image/jpeg' || blob.size > 5 * 1024 * 1024) throw Error('No pudimos preparar la foto. Prueba con una imagen más pequeña.');
    return blob;
  };
  window.auraLadraFeedFotos = { validar, abrir, rectangulo, dibujar, preparar };
})();

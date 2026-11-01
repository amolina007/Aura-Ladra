// Imágenes de servicios: valida, reduce y vuelve a codificar para no subir metadatos EXIF.
(() => {
  'use strict';
  const maxInput = 20 * 1024 * 1024;
  const validate = file => {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Elige una foto JPG, PNG o WebP. Si está en HEIC, expórtala como JPG.');
    if (!file.size || file.size > maxInput) throw Error('La foto debe pesar como máximo 20 MB.');
  };
  async function prepare(file) {
    validate(file);
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=()=>reject(Error('No pudimos abrir esta foto. Elige otra imagen.')); image.src=url; });
      const width=image.naturalWidth, height=image.naturalHeight;
      if (!width || !height || width*height>80000000) throw Error('La imagen es demasiado grande. Elige una versión de menor tamaño.');
      const scale=Math.min(1,1600/Math.max(width,height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const context=canvas.getContext('2d');
      if (!context) throw Error('Tu navegador no pudo preparar la foto. Prueba con otra imagen o navegador.');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
      if (!blob || blob.type!=='image/webp' || blob.size>5*1024*1024) throw Error('No pudimos reducir la foto. Elige un JPG o PNG más pequeño.');
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  window.auraLadraServiciosFotos={validate,prepare};
})();

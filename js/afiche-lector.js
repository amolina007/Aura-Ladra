/* OCR local: la imagen no se envía a un servicio de reconocimiento. */
(() => {
  'use strict';
  const base = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/';
  let library;
  function load() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 30000);
      function fail() { clearTimeout(timer); script.remove(); library = null; reject(Error('No se pudo descargar el lector. Revisa tu conexión y vuelve a intentar.')); }
      script.src = base + 'tesseract.min.js';
      script.onload = () => { clearTimeout(timer); resolve(window.Tesseract); };
      script.onerror = fail;
      document.head.append(script);
    });
    return library;
  }
  async function prepareImage(file, inverted = false) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(2, 2600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
      for (let i=0;i<pixels.data.length;i+=4) {
        const gray = Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);
        const value = inverted ? 255-gray : gray;
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
      }
      ctx.putImageData(pixels,0,0);
      return canvas;
    } finally { bitmap.close(); }
  }
  function parse(text) {
    text = String(text).replace(/\r/g, '').trim();
    const result = {descripcion: text.slice(0, 4000)};
    const labeled = labels => text.match(new RegExp('(?:^|\\n)\\s*(?:' + labels + ')\\s*[:：]\\s*([^\\n]+)', 'iu'))?.[1]?.trim();
    for (const [key, labels] of Object.entries({nombre:'nombre(?: de la mascota)?',dueno:'dueñ[oa]|responsable|contacto',domicilio:'domicilio|dirección',zona:'zona|sector|comuna|lugar (?:de|del) extravío',tiempo_aproximado:'tiempo(?: aproximado)?'})) {
      const value = labeled(labels); if (value) result[key] = value;
    }
    result.nombre ||= text.match(/\b(?:se llama|responde al nombre de)\s+[“"']?([\p{L}][\p{L} -]{0,50})/iu)?.[1]?.trim();
    const narrative = text.split('\n').filter(line => /[\p{L}]{4}/u.test(line)).join(' ').replace(/\s+/g,' ');
    result.nombre ||= narrative.match(/\b([\p{L}]{2,40})\s+se\s+(?:perdi[oó]|extravi[oó])(?=\s|$)/iu)?.[1];
    if (!result.zona) {
      const location = narrative.match(/\b(?:en\s+la\s+calle|perdid[oa]\s+en)\s+(.{5,240}?)(?:\)\s*\.|[.!]|\s+(?:si lo ves|favor avisar|macho castrado|hembra))/iu)?.[1];
      if (location) result.zona = location.trim() + (location.includes('(') && !location.includes(')') ? ')' : '');
    }
    const partialDate = narrative.match(/\b(?:noche del|desde el|perdid[oa] el)\s+(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))(?!\s+de\s+\d{4})/iu)?.[1];
    if (partialDate && !result.tiempo_aproximado) result.tiempo_aproximado = partialDate + ' (revisar año en la fuente)';
    const phone = text.match(/(?<!\d)(?:\+?56[ \t.\u00a0-]*)?9(?:[ \t.\u00a0-]*\d){8}(?!\d)/u)?.[0];
    if (phone) result.celular = '+56' + phone.replace(/\D/g, '').slice(-9);
    if (/\b(?:gato|gata|gatito|gatita)\b/iu.test(text)) result.especie = 'Gato';
    else if (/\b(?:perro|perra|perrito|perrita)\b/iu.test(text)) result.especie = 'Perro';
    if (/\bsosafe\b/i.test(text)) result.fuente = 'SOSAFE';
    const date = labeled('fecha(?: de(?:l)? (?:extravío|pérdida))?|perdid[oa] desde');
    const parts = date?.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (parts) {
      const [,d,m,y] = parts, iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      const value = new Date(iso + 'T12:00:00Z');
      if (!Number.isNaN(value.getTime()) && value.toISOString().slice(0,10) === iso) result.fecha_extravio = iso;
    }
    return result;
  }
  function attach(form, dialog) {
    const panel = document.createElement('fieldset');
    panel.innerHTML = `<legend>Importar afiche externo</legend>
      <p>Sube una foto del afiche o una captura de SOSAFE. La lectura se hace en este dispositivo y puede equivocarse. La primera vez necesita internet para descargar el lector.</p>
      <label class="field">Afiche para leer<input type="file" data-ocr-file accept="image/jpeg,image/png,image/webp"></label>
      <p>Esta imagen se usa para leer el texto. Si también quieres mostrarla en el aviso, añádela en Fotos.</p>
      <button class="button button-ghost" type="button" data-ocr-read>Leer afiche</button>
      <button class="button button-ghost" type="button" data-ocr-cancel hidden>Cancelar lectura</button>
      <label class="field">Texto leído o copiado del aviso<textarea data-ocr-text rows="5" maxlength="12000" placeholder="También puedes pegar aquí el texto de SOSAFE o de otro aviso."></textarea></label>
      <button class="button button-ghost" type="button" data-ocr-apply>Completar campos vacíos</button>
      <p data-ocr-status role="status" aria-live="polite"></p>`;
    form.prepend(panel);
    const get = name => panel.querySelector(`[data-ocr-${name}]`);
    let worker, token = 0, reading = false, timer;
    const setBusy = value => {
      reading = value; form.dataset.ocrReading = String(value);
      get('read').disabled = value; get('apply').disabled = value; get('file').disabled = value;
      get('cancel').hidden = !value;
      form.querySelector('[type=submit]').disabled = value;
    };
    async function stop() {
      token++; clearTimeout(timer);
      const old = worker; worker = null; setBusy(false);
      if (old) await old.terminate().catch(() => {});
    }
    get('cancel').onclick = () => { stop(); get('status').textContent = 'Lectura cancelada. Puedes completar el formulario manualmente.'; };
    dialog.addEventListener('close', () => { stop(); });
    form.addEventListener('reset', () => { stop(); get('status').textContent = ''; });
    get('apply').onclick = () => {
      const text = get('text').value.trim();
      if (!text) { get('status').textContent = 'Primero lee una imagen o pega el texto del aviso.'; return; }
      let count = 0;
      for (const [key, value] of Object.entries(parse(text))) {
        const field = form.elements[key];
        if (!value || !field || field.value.trim()) continue;
        if (key === 'fecha_extravio' && field.max && value > field.max) continue;
        field.value = value.slice(0, field.maxLength > 0 ? field.maxLength : value.length); count++;
      }
      get('status').textContent = `Se completaron ${count} campos vacíos. Revisa nombre, teléfono, domicilio y zona; completa lo que falte. No se ha publicado nada.`;
    };
    get('read').onclick = async () => {
      if (reading) return;
      const file = get('file').files[0];
      if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 20*1024*1024) {
        get('status').textContent = 'Elige una imagen JPG, PNG o WebP de hasta 20 MB.'; return;
      }
      const turn = ++token; setBusy(true); get('status').textContent = 'Preparando lector…';
      timer = setTimeout(() => { if (turn === token) { stop(); get('status').textContent = 'La lectura tardó demasiado. Intenta con una imagen más pequeña o pega el texto.'; } }, 120000);
      try {
        const api = await load(); if (turn !== token) return;
        const created = await api.createWorker('spa', 1, {
          workerPath: base + 'worker.min.js',
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
          langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
          logger: info => { if (turn === token) get('status').textContent = info.status === 'recognizing text' ? `Leyendo afiche… ${Math.round(info.progress*100)} %` : 'Descargando y preparando el lector…'; }
        });
        if (turn !== token) { await created.terminate(); return; }
        worker = created;
        await worker.setParameters({tessedit_pageseg_mode: '11', tessedit_do_invert: '1'});
        const prepared = await prepareImage(file);
        if (turn !== token) return;
        const {data} = await worker.recognize(prepared);
        if (turn !== token) return;
        if (!parse(data.text).celular) {
          const inverted = await prepareImage(file, true);
          if (turn !== token) return;
          const second = await worker.recognize(inverted);
          data.text = [...new Set((data.text + '\n' + second.data.text).split('\n').map(line => line.trim()).filter(Boolean))].join('\n');
        }
        if (turn !== token) return;
        get('text').value = data.text.slice(0,12000);
        get('status').textContent = data.text.trim() ? 'Texto listo. Revísalo y pulsa «Completar campos vacíos».' : 'No se encontró texto. Prueba una imagen más nítida o pega el texto.';
      } catch (_error) { if (turn === token) get('status').textContent = 'No se pudo leer la imagen. Revisa tu conexión, prueba otra foto o pega el texto manualmente.'; }
      finally { if (turn === token) await stop(); }
    };
  }
  window.auraLadraAfiche = {parse, attach};
})();

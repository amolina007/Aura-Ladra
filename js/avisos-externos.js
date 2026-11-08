/* Avisos externos: quien comparte administra el aviso, no adquiere la mascota. */
(() => {
  'use strict';
  const db = window.auraLadraDb;
  if (!db) return;
  const bucket = 'ladra-avisos';
  const fields = ['nombre','especie','dueno','celular','domicilio','zona','fecha_extravio','tiempo_aproximado','descripcion','fuente','fuente_url','estado'];
  let retainedPhotos = [];
  const photoPaths = row => row?.fotos_paths?.length ? row.fotos_paths : row?.foto_path ? [row.foto_path] : [];
  let user = null, rows = [], editing = null, busy = false, generation = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const safeUrl = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const message = text => { document.querySelector('[data-externos-mensaje]').textContent = text; };
  const dialog = document.createElement('dialog');
  dialog.className = 'service-dialog';
  dialog.setAttribute('aria-labelledby', 'externo-form-title');
  dialog.innerHTML = `<div class="service-dialog-content"><h2 id="externo-form-title">Aviso externo</h2>
    <p>Se publicará en Ladra con tu cuenta como administradora. El dueño indicado no queda vinculado a una cuenta.</p>
    <form class="service-form">
    <label class="field">Nombre de la mascota<input name="nombre" required maxlength="120" placeholder="Si no se conoce, escribe Sin nombre"></label>
    <label class="field">Especie<input name="especie" maxlength="80" placeholder="Perro, gato…"></label>
    <label class="field">Fotos<input name="foto" type="file" multiple accept="image/jpeg,image/png,image/webp"><small>Hasta 6 fotos JPG, PNG o WebP, de máximo 20 MB cada una. Las nuevas se añaden a las conservadas.</small></label>
    <div data-fotos-actuales></div>
    <label class="field">Dueño o responsable, según el aviso<input name="dueno" maxlength="150" placeholder="Opcional; solo nombre público"></label>
    <label class="field">Celular de contacto (público)<input name="celular" type="tel" maxlength="30" placeholder="Ej. +56 9 1234 5678"></label>
    <label class="field">Domicilio (público)<input name="domicilio" maxlength="300" placeholder="Dirección indicada en el anuncio, si se conoce"></label>
    <label class="field">Comuna y sector del extravío<input name="zona" required maxlength="240" placeholder="Ej. Maipú, sector Plaza de Maipú"></label>
    <label class="field">Fecha del extravío, si se conoce<input name="fecha_extravio" type="date"></label>
    <label class="field">Tiempo aproximado, si no sabes la fecha<input name="tiempo_aproximado" maxlength="120" placeholder="Ej. unas dos semanas según el aviso"></label>
    <label class="field">Descripción y otros antecedentes<textarea name="descripcion" maxlength="4000" rows="4"></textarea></label>
    <label class="field">Plataforma o medio de origen<input name="fuente" required maxlength="160" placeholder="Red social, sitio web, afiche en la calle…"></label>
    <label class="field">Enlace del aviso original (opcional)<input name="fuente_url" type="url" maxlength="2000" placeholder="https://…"></label>
    <label class="field">Estado según la fuente<select name="estado"><option value="extraviada">Extraviada</option><option value="encontrada">Encontrada</option><option value="retirado">Retirar de la lista pública</option></select></label>
    <p>El celular, el domicilio, la zona y las fotos serán públicos. Completa los datos disponibles en el anuncio original.</p>
    <p data-form-status role="status"></p>
    <button class="button button-primary" type="submit">Publicar aviso</button>
    <button class="button button-ghost" type="button" data-cancelar>Cancelar</button>
    </form></div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[data-form-status]');
  const submit = form.querySelector('[type=submit]');
  window.auraLadraAfiche?.attach(form, dialog);
  dialog.querySelector('[data-cancelar]').onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function elapsed(row) {
    if (row.estado !== 'extraviada') return row.estado === 'encontrada' ? 'Encontrada según la fuente' : 'Retirado';
    if (!row.fecha_extravio) return row.tiempo_aproximado ? `Tiempo declarado: ${row.tiempo_aproximado}` : 'Fecha de extravío no informada';
    const days = Math.max(0, Math.round((Date.parse(today()+'T12:00:00Z') - Date.parse(row.fecha_extravio+'T12:00:00Z')) / 86400000));
    return `${days} ${days === 1 ? 'día' : 'días'} desde el extravío · ${row.fecha_extravio}`;
  }
  function card(row) {
    const url = safeUrl(row.fuente_url);
    const photos = photoPaths(row).map(path => db.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    const phone = String(row.celular || '').replace(/[^+0-9]/g, '');
    return `<article class="card"><small>Aviso externo · sin confirmar con el responsable</small>
      ${photos.length ? photos.map((photo, i) => `<img src="${esc(photo)}" alt="${esc(row.nombre)} · foto ${i + 1}" loading="lazy" style="width:100%;max-height:320px;object-fit:contain">`).join('') : '<p>Sin foto disponible</p>'}
      <h4>${esc(row.nombre)}</h4><p>${esc(row.especie)} · ${esc(row.zona)}</p>
      ${phone ? `<p>Celular: <a href="tel:${esc(phone)}">${esc(row.celular)}</a></p>` : ''}
      ${row.domicilio ? `<p style="overflow-wrap:anywhere">Domicilio: ${esc(row.domicilio)}</p>` : ''}
      <p>${esc(elapsed(row))}</p>${row.dueno ? `<p>Dueño según el aviso: ${esc(row.dueno)}</p>` : ''}
      <p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(String(row.descripcion || '').replace(/\bsosafe\b/gi, 'la fuente original'))}</p>
      <p>Fuente: ${esc(String(row.fuente || '').replace(/\bsosafe\b/gi, 'Aviso externo'))}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver original</a>` : ''}</p>
      ${row.autor_id === user ? `<button type="button" class="button button-ghost" data-externo-editar="${esc(row.id)}">Editar / retirar aviso</button>` : ''}</article>`;
  }
  function renderPhotos() {
    dialog.querySelector('[data-fotos-actuales]').innerHTML = retainedPhotos.map((path, i) => `<div>
      <img src="${esc(db.storage.from(bucket).getPublicUrl(path).data.publicUrl)}" alt="Foto conservada ${i+1}" style="width:90px;height:90px;object-fit:contain">
      <button type="button" class="button button-ghost" data-quitar-foto="${i}">Quitar foto ${i+1}</button></div>`).join('');
  }
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-quitar-foto]');
    if (button && !busy) { retainedPhotos.splice(Number(button.dataset.quitarFoto), 1); renderPhotos(); }
  });
  function render() {
    document.querySelector('[data-externos-lista]').innerHTML = rows.filter(r => r.estado !== 'retirado').map(card).join('') || '<p>No hay avisos manuales publicados. Los avisos externos aparecen a continuación.</p>';
    document.querySelector('[data-externos-propios]').innerHTML = rows.filter(r => r.autor_id === user).map(card).join('') || '<p>Aquí aparecerán los avisos que compartas.</p>';
  }
  async function refresh() {
    const turn = ++generation;
    const {data,error} = await db.from('avisos_externos').select('*').order('creado_en',{ascending:false});
    if (turn !== generation) return;
    if (error) { message('No pudimos cargar los avisos externos. Recarga la página para reintentar.'); return; }
    rows = data || []; render(); message('');
  }
  function open(row = null) {
    if (busy) return;
    if (!user) { message('Inicia sesión para agregar un aviso externo.'); window.location.hash = 'cuenta'; return; }
    editing = row; form.reset(); status.textContent = '';
    retainedPhotos = [...photoPaths(row)]; renderPhotos();
    fields.forEach(key => { if (row) form.elements[key].value = row[key] || ''; });
    form.elements.fecha_extravio.max = today();
    submit.textContent = row ? 'Guardar cambios' : 'Publicar aviso';
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-externo-nuevo]')) open();
    const edit = event.target.closest('[data-externo-editar]');
    if (edit) { const row = rows.find(r => r.id === edit.dataset.externoEditar && r.autor_id === user); if (row) open(row); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !user || form.dataset.ocrReading === 'true') return;
    busy = true; submit.disabled = true; status.textContent = 'Guardando…';
    const importPanel = form.querySelector('fieldset');
    if (importPanel) importPanel.disabled = true;
    const account = user;
    try {
      const payload = Object.fromEntries(fields.map(key => [key, form.elements[key].value.trim() || null]));
      if (!payload.nombre || !payload.zona || !payload.fuente) throw Error('Completa nombre, sector y fuente.');
      payload.especie ||= 'No informada';
      if (payload.fuente_url && !safeUrl(payload.fuente_url)) throw Error('El enlace debe comenzar con https:// o http://.');
      if (payload.fecha_extravio && payload.fecha_extravio > today()) throw Error('La fecha no puede estar en el futuro.');
      if (payload.celular && (!/^\+?[0-9 ()-]{7,30}$/.test(payload.celular) || !/^[0-9]{7,15}$/.test(payload.celular.replace(/\D/g,'')))) throw Error('Escribe un celular válido, con 7 a 15 dígitos y código de país si corresponde.');
      const files = Array.from(form.elements.foto.files);
      if (retainedPhotos.length + files.length > 6) throw Error('Puedes publicar hasta 6 fotos. Quita alguna antes de añadir más.');
      files.forEach(file => window.auraLadraServiciosFotos.validate(file));
      payload.fotos_paths = [...retainedPhotos];
      for (const file of files) {
        const blob = await window.auraLadraServiciosFotos.prepare(file);
        if (account !== user) throw Error('Tu sesión cambió. Vuelve a abrir el formulario.');
        const path = `${account}/${crypto.randomUUID()}.webp`;
        const {error} = await db.storage.from(bucket).upload(path, blob, {contentType:'image/webp',upsert:false});
        if (error) throw error;
        payload.fotos_paths.push(path);
      }
      payload.foto_path = payload.fotos_paths[0] || null;
      if (account !== user) throw Error('Tu sesión cambió. Vuelve a abrir el formulario.');
      const query = editing ? db.from('avisos_externos').update(payload).eq('id',editing.id).eq('autor_id',account) : db.from('avisos_externos').insert(payload);
      const {data,error} = await query.select('id').single();
      if (error || !data) throw error || Error('No se pudo guardar el aviso.');
      dialog.close(); await refresh();
    } catch (error) { status.textContent = error.message || 'No se pudo guardar. Intenta nuevamente.'; }
    finally { busy = false; submit.disabled = false; if (importPanel) importPanel.disabled = false; }
  });
  let authEvents = 0;
  function sessionChanged(session) {
    const next = session?.user?.id || null;
    if (user !== next) { user = next; rows = []; render(); dialog.close(); }
    refresh();
  }
  db.auth.onAuthStateChange((_event,session) => { authEvents++; queueMicrotask(() => sessionChanged(session)); });
  const initial = authEvents;
  db.auth.getSession().then(({data}) => { if (authEvents === initial) sessionChanged(data.session); });
})();

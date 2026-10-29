// Catálogo y consultas reales; los ejemplos son voluntarios y nunca escriben en la base.
(() => {
  'use strict';
  const root = document.querySelector('#servicios');
  if (!root) return;
  const db = window.auraLadraDb;
  const $ = (selector) => document.querySelector(selector);
  const list = $('[data-services-list]');
  const status = $('[data-services-status]');
  const filters = $('[data-services-filters]');
  const dialog = $('[data-service-dialog]');
  const detail = $('[data-service-detail]');
  const publishDialog = $('[data-service-publish-dialog]');
  const publishForm = $('[data-service-publish-form]');
  const categories = { refugio: ['Refugio temporal', '⌂'], transporte: ['Transporte', '↗'], estetica: ['Estética', '✂'], entrenamiento: ['Entrenamiento', '◇'], paseos: ['Paseos', '🐾'], cuidado: ['Cuidado', '♡'], otros: ['Otras prestaciones', '＋'] };
  const modalities = { local: 'En local', domicilio: 'A domicilio', aire_libre: 'Al aire libre', online: 'En línea', traslado: 'Traslado acordado' };
  const states = { pendiente: 'Pendiente de respuesta', respondida: 'Respondida', no_disponible: 'Sin disponibilidad' };
  const times = { manana: 'Mañana', tarde: 'Tarde', a_convenir: 'A convenir' };
  const examples = [
    { id: 'ejemplo-estetica', titulo: 'Baño y cepillado', prestador: 'Estética canina · Ejemplo', categoria: 'estetica', zona: 'Maipú', modalidad: 'local', precio_clp: 25000, precio_tipo: 'desde', duracion_min: 60, descripcion: 'Baño, secado y cepillado. El valor depende del tamaño y el pelaje. Condiciones ilustrativas: el profesional debe detallar su propia prestación.', publicado: true },
    { id: 'ejemplo-entrenamiento', titulo: 'Sesión de entrenamiento', prestador: 'Educación canina · Ejemplo', categoria: 'entrenamiento', zona: 'Maipú', modalidad: 'domicilio', precio_clp: 30000, precio_tipo: 'desde', duracion_min: 60, descripcion: 'Acompañamiento con refuerzo positivo para practicar paseos con correa. Objetivos acordados en una evaluación inicial. Servicio ilustrativo.', publicado: true },
    { id: 'ejemplo-paseos', titulo: 'Paseos acompañados', prestador: 'Paseos de barrio · Ejemplo', categoria: 'paseos', zona: 'Maipú', modalidad: 'aire_libre', precio_clp: null, precio_tipo: 'desde', duracion_min: 45, descripcion: 'Paseo individual, ritmo y recorrido acordados con el tutor. Precio a convenir. Servicio ilustrativo.', publicado: true },
  ];
  let services = [], category = '', demo = false, ready = false, epoch = 0;
  let selected = null, opener = null, panel = 'catalogo', submitting = false;
  let retryRequest = null, preferredPet = null, authEvents = 0, authUser = window.auraLadraRed?.sesion?.()?.user?.id || null;
  let petsReady = Boolean(authUser);
  let ownedServices = [], editingService = null, creationKey = null, photoFile = null, stagedPhoto = null;
  let removePhoto = false, previewUrl = null, editorGeneration = 0;
  const photoBucket = 'servicios-ladra';
  const userId = () => authUser;
  const pets = () => petsReady && window.auraLadraRed?.sesion?.()?.user?.id === authUser
    ? (window.auraLadraRed?.propias?.() || []).filter(a => !a.es_conmemorativa) : [];
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const price = (service) => service.precio_clp == null ? 'A convenir' : Number(service.precio_clp) === 0 ? 'Gratis' : `${service.precio_tipo === 'desde' ? 'Desde ' : ''}$${Number(service.precio_clp).toLocaleString('es-CL')}`;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dateLabel = (value) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  // Mismos orígenes que permite la política de imágenes existente de Ladra.
  const safePhoto = (value) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (url.origin === window.location.origin || url.origin === 'https://utilbunuziotzumuiayu.supabase.co') ? url.href : ''; } catch { return ''; } };
  const isExample = (service) => service.id.startsWith('ejemplo-');
  const unavailable = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code);
  const errorText = (error, fallback) => unavailable(error)
    ? 'Servicios está en preparación. Aún no se ha habilitado su guardado en el servidor.'
    : error?.code === '42501' ? 'Tu cuenta no tiene permiso para esta acción. Vuelve a iniciar sesión e inténtalo de nuevo.' : fallback;
  const cover = (service) => {
    const photo = safePhoto(service.foto_url);
    return `<div class="service-cover" data-category="${escape(service.categoria)}"><span aria-hidden="true">${categories[service.categoria]?.[1] || '🐾'}</span>${photo ? `<img src="${escape(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
  };
  const wireImages = (container) => container.querySelectorAll('.service-cover img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  const show = (dlg, from) => { opener = from || document.activeElement; if (!dlg.open) dlg.showModal(); };
  const close = (dlg) => { if (dlg.open) dlg.close(); };
  const photoUrl = path => db.storage.from(photoBucket).getPublicUrl(path).data.publicUrl;
  const ownPhoto = path => path && path.split('/')[0] === userId();
  async function removeUnusedPhoto(path) {
    if (!ownPhoto(path)) return;
    try {
      // El servidor impide borrar una foto que siga referenciada por un servicio.
      const result = await db.storage.from(photoBucket).remove([path]);
      if (result.error) console.warn('Ladra: foto sin uso pendiente de retirar.');
    } catch { console.warn('Ladra: foto sin uso pendiente de retirar.'); }
  }
  function renderPhotoPreview() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    const current = photoFile ? (previewUrl = URL.createObjectURL(photoFile)) : !removePhoto ? safePhoto(editingService?.foto_url) : '';
    $('[data-service-photo-preview]').hidden = !current;
    $('[data-service-photo-remove]').hidden = !current;
    const image = $('[data-service-photo-image]');
    if (current) image.src = current; else image.removeAttribute('src');
  }
  function resetEditor() {
    const unused = stagedPhoto?.path;
    stagedPhoto = null; photoFile = null; removePhoto = false; creationKey = null; editingService = null; editorGeneration++;
    publishForm.reset(); renderPhotoPreview();
    if (unused) removeUnusedPhoto(unused);
  }
  function openEditor(service, from) {
    if (submitting || (service && service.propietario_id !== userId())) return;
    resetEditor(); editingService = service ? { ...service } : null;
    $('#service-publish-title').textContent = service ? 'Editar servicio' : 'Ofrecer un servicio';
    publishForm.querySelector('[type=submit]').textContent = service ? 'Guardar cambios' : 'Publicar servicio';
    if (service) for (const key of ['titulo','prestador','categoria','zona','modalidad','precio_clp','precio_tipo','duracion_min','descripcion']) publishForm.elements[key].value = service[key] ?? '';
    if (service) publishForm.elements.precio_tipo.value = service.precio_clp == null ? 'acordar' : Number(service.precio_clp) === 0 ? 'gratis' : service.precio_tipo;
    syncPriceFields(); syncCategoryHelp();
    $('[data-service-publish-message]').textContent = ready ? '' : 'El guardado aún no está disponible. Actualiza el catálogo e inténtalo de nuevo.';
    renderPhotoPreview(); show(publishDialog, from);
  }
  function syncPriceFields() {
    const mode = publishForm.elements.precio_tipo.value;
    const paid = ['fijo','desde'].includes(mode);
    $('[data-service-amount]').hidden = !paid;
    publishForm.elements.precio_clp.disabled = !paid;
    publishForm.elements.precio_clp.required = paid;
    if (!paid) publishForm.elements.precio_clp.value = '';
  }
  function syncCategoryHelp() {
    const category = publishForm.elements.categoria.value;
    const hints = {
      refugio: 'Indica qué mascotas puedes recibir, cupos, por cuánto tiempo y en qué condiciones. Comparte la dirección exacta solo por mensaje.',
      transporte: 'Indica zonas, trayectos, horarios y qué mascotas puedes trasladar. Acuerda recogida y entrega por mensaje.',
    };
    const hint = $('[data-service-category-help]');
    hint.hidden = !hints[category]; hint.textContent = hints[category] || '';
    publishForm.elements.duracion_min.closest('label').hidden = category === 'refugio';
    if (category === 'refugio') publishForm.elements.duracion_min.value = '';
  }
  async function uploadPhoto(actor, generation, message) {
    if (!photoFile) return removePhoto ? { foto_path: null, foto_url: null } : { foto_path: editingService?.foto_path || null, foto_url: editingService?.foto_url || null };
    if (!stagedPhoto) {
      message.textContent = 'Preparando foto…';
      const file = photoFile, blob = await window.auraLadraServiciosFotos.prepare(file);
      if (actor !== userId() || generation !== editorGeneration) throw Error('La sesión cambió. Vuelve a abrir el formulario.');
      stagedPhoto = { path: `${actor}/${window.crypto.randomUUID()}.webp`, blob, confirmed: false };
    }
    const stage = stagedPhoto;
    if (!stage.confirmed) {
      message.textContent = 'Subiendo foto…';
      const result = await db.storage.from(photoBucket).upload(stage.path, stage.blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (result.error) {
        // Puede haberse subido y haberse perdido la respuesta: nunca sobrescribimos.
        const existing = await db.storage.from(photoBucket).download(stage.path);
        if (existing.error || !existing.data || existing.data.size !== stage.blob.size) throw Error('No pudimos confirmar la subida de la foto. Puedes reintentar.');
        const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
        if (await digest(existing.data) !== await digest(stage.blob)) throw Error('No pudimos verificar la foto. Elige la imagen otra vez.');
      }
      stage.confirmed = true;
    }
    return { foto_path: stage.path, foto_url: photoUrl(stage.path) };
  }
  const empty = (title, copy) => `<div class="service-empty"><h3>${escape(title)}</h3><p>${escape(copy)}</p></div>`;

  function renderCatalog() {
    $('[data-services-demo]').textContent = demo ? 'Volver a servicios reales' : 'Ver ejemplos del diseño';
    if (demo) status.textContent = 'Vista de ejemplo: nombres, condiciones y precios ilustrativos. No se envían consultas.';
    const data = new FormData(filters);
    const rows = (demo ? examples : services.filter(s => s.publicado)).filter(s =>
      (!category || s.categoria === category) &&
      norm(`${s.titulo} ${s.prestador} ${s.descripcion}`).includes(norm(data.get('busqueda'))) &&
      norm(s.zona).includes(norm(data.get('zona'))) &&
      (!data.get('modalidad') || s.modalidad === data.get('modalidad')) &&
      (!data.get('costo') || (data.get('costo') === 'gratis' && s.precio_clp != null && Number(s.precio_clp) === 0) || (data.get('costo') === 'pagado' && Number(s.precio_clp) > 0) || (data.get('costo') === 'acordar' && s.precio_clp == null)) &&
      (data.get('precio') === '' || (s.precio_clp != null && Number(s.precio_clp) <= Number(data.get('precio'))))
    );
    list.innerHTML = rows.length ? rows.map(s => `<article class="service-card">${cover(s)}<div class="service-card-body"><span class="service-label">${escape(categories[s.categoria]?.[0] || 'Servicio')}${demo ? ' · Ejemplo' : ''}</span><h3>${escape(s.titulo)}</h3><p class="service-muted">${escape(s.prestador)}</p><p class="service-muted">⌖ ${escape(s.zona)} · ${escape(modalities[s.modalidad])}</p><div class="service-card-footer"><span class="service-price">${escape(price(s))}</span><button type="button" class="button button-dark" data-service-open="${escape(s.id)}">Ver servicio</button></div></div></article>`).join('')
      : empty((demo || services.some(s => s.publicado)) ? 'No encontramos coincidencias' : 'Aquí comienzan los cuidados del barrio', (demo || services.some(s => s.publicado)) ? 'Prueba con otra categoría, zona o precio. Los servicios a convenir no aparecen al fijar un precio máximo.' : 'Cuando se publique la primera prestación aparecerá aquí. También puedes explorar los ejemplos del diseño.');
    wireImages(list);
  }

  async function load() {
    const version = ++epoch;
    ready = false;
    if (!demo) status.textContent = 'Cargando servicios…';
    try {
      if (!db) throw new Error('Sin conexión');
      const result = await db.from('servicios').select('*').order('creado_en', { ascending: false }).limit(200);
      if (version !== epoch) return;
      if (result.error) throw result.error;
      services = result.data || []; ready = true;
      if (!demo) status.textContent = `${services.filter(s => s.publicado).length} servicios publicados${services.length === 200 ? ' · Se muestran las 200 publicaciones más recientes.' : ''}`;
    } catch (error) {
      if (version !== epoch) return;
      services = [];
      if (!demo) status.textContent = errorText(error, 'No pudimos cargar los servicios. Revisa tu conexión y pulsa “Actualizar servicios”.');
    }
    renderCatalog();
    if (panel === 'consultas') await loadAccount();
  }

  function openService(id, from) {
    selected = (demo ? examples : services).find(s => s.id === id);
    if (!selected) return;
    renderDetail(); show(dialog, from);
  }

  function renderDetail() {
    const s = selected;
    detail.innerHTML = `${cover(s)}<div class="service-dialog-content"><p class="kicker">${escape(categories[s.categoria]?.[0])}</p><h2 id="service-dialog-title">${escape(s.titulo)}</h2><p>${escape(s.prestador)}</p><p class="service-muted">⌖ ${escape(s.zona)} · ${escape(modalities[s.modalidad])}</p><div class="service-detail-price"><span class="service-muted">Costo</span><strong class="service-price">${escape(price(s))}</strong>${s.duracion_min ? `<span class="service-muted">Duración estimada: ${Number(s.duracion_min)} min</span>` : ''}</div><h3>Qué incluye y condiciones</h3><p class="service-description">${escape(s.descripcion)}</p>${isExample(s) ? '<p class="service-demo-note">Ejemplo del diseño. Este servicio no está publicado y no acepta consultas.</p>' : '<p class="service-muted">Información publicada por el prestador. La disponibilidad y el valor se acuerdan antes de reservar.</p>'}${s.propietario_id === userId() ? '<p class="service-demo-note">Esta es tu prestación. Puedes administrarla en “Mis consultas y servicios”.</p>' : '<button type="button" class="button button-dark" data-service-inquire>Consultar disponibilidad</button>'}</div>`;
    wireImages(detail);
    focusDetail();
  }

  function focusDetail() {
    const title = $('#service-dialog-title');
    title?.setAttribute('tabindex', '-1');
    if (dialog.open) title?.focus();
  }

  function renderInquiry() {
    const s = selected;
    if (!s) return;
    const example = isExample(s);
    const own = pets();
    detail.innerHTML = `<div class="service-dialog-content"><button class="service-text-button" type="button" data-service-back>← Volver al servicio</button><p class="kicker">${example ? 'Ejemplo del diseño' : 'Una consulta, sin compromiso'}</p><h2 id="service-dialog-title">Consultar sesión</h2><div class="service-account-card"><h3>${escape(s.titulo)}</h3><p>${escape(s.prestador)}</p><strong class="service-price">${escape(price(s))}</strong></div>${example ? '<p class="service-demo-note">Simulación visual. No se enviará ninguna consulta.</p>' : !userId() ? '<p>Inicia sesión para consultar por una de tus mascotas.</p><a class="button button-dark" href="#cuenta" data-service-login>Ir a Mi cuenta</a>' : !own.length ? '<p>Primero registra una mascota en tu cuenta para vincularla a la consulta.</p><a class="button button-dark" href="#cuenta" data-service-login>Registrar mi mascota</a>' : ''}${example || (userId() && own.length) ? `<form class="service-form" data-service-inquiry-form><label class="field"><span>Mascota</span><select name="animal_id" required>${example ? '<option value="ejemplo">Luna · Ejemplo</option>' : own.map(a => `<option value="${escape(a.id)}">${escape(a.nombre)}</option>`).join('')}</select></label><label class="field"><span>Día preferido</span><input type="date" name="dia_preferido" min="${today()}" required></label><label class="field"><span>Horario preferido</span><select name="horario" required><option value="a_convenir">A convenir</option><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></label><label class="field"><span>¿Qué necesita tu mascota?</span><textarea name="mensaje" rows="4" required minlength="10" maxlength="800" placeholder="Cuéntale al profesional qué te gustaría consultar."></textarea></label><p class="service-muted">La consulta llegará a la bandeja del prestador en Ladra. Podrás revisar su respuesta en “Mis consultas y servicios”. No confirma una reserva ni realiza un cobro.</p><button type="submit" class="button button-dark" ${example ? 'disabled' : ''}>${example ? 'Ejemplo · No se envía' : 'Enviar consulta'}</button><p class="form-message" role="status" data-service-inquiry-message></p></form>` : ''}</div>`;
  }

  async function sendInquiry(form) {
    if (submitting || !selected || isExample(selected) || !form.reportValidity()) return;
    const actor = userId(), s = selected, version = epoch;
    const message = $('[data-service-inquiry-message]');
    if (!actor || !ready) { message.textContent = 'Inicia sesión y actualiza los servicios antes de consultar.'; return; }
    const values = Object.fromEntries(new FormData(form));
    if (!pets().some(a => a.id === values.animal_id)) { message.textContent = 'Selecciona una mascota propia y viva.'; return; }
    if (values.dia_preferido < today()) { message.textContent = 'Selecciona un día a partir de hoy.'; return; }
    if (values.mensaje.trim().length < 10) { message.textContent = 'Escribe al menos 10 caracteres.'; return; }
    const payload = { servicio_id: s.id, animal_id: values.animal_id, dia_preferido: values.dia_preferido, horario: values.horario, mensaje: values.mensaje.trim() };
    const signature = JSON.stringify([actor, payload]);
    if (retryRequest?.signature !== signature) retryRequest = { signature, key: window.crypto.randomUUID() };
    const button = form.querySelector('[type=submit]');
    submitting = true; button.disabled = true; message.textContent = 'Enviando consulta…';
    try {
      let result = await db.from('servicio_consultas').insert({ ...payload, solicitud_clave: retryRequest.key }).select('id').single();
      if (result.error?.code === '23505') result = await db.from('servicio_consultas').select('id').eq('solicitante_id', actor).eq('solicitud_clave', retryRequest.key).single();
      if (result.error || !result.data?.id) throw result.error || new Error('Sin comprobante');
      if (actor !== userId() || version !== epoch) return;
      retryRequest = null;
      form.innerHTML = `<div class="service-demo-note"><strong>Consulta enviada</strong><p>El prestador podrá responder desde su bandeja en Ladra. Revisa el estado en “Mis consultas y servicios”.</p></div><button type="button" class="button button-dark" data-service-my-inquiries>Ver mis consultas</button>`;
    } catch (error) {
      if (actor === userId() && version === epoch) message.textContent = errorText(error, 'No pudimos confirmar el envío. Puedes reintentar; la misma consulta no se duplica. Si el servicio fue retirado, actualiza el catálogo.');
    } finally { submitting = false; button.disabled = false; }
  }

  async function loadAccount() {
    const box = $('[data-services-account-list]');
    const actor = userId(), version = epoch;
    if (!actor) { box.innerHTML = '<p>Inicia sesión para revisar tus consultas y ofrecer servicios.</p><a class="button button-dark" href="#cuenta">Ir a Mi cuenta</a>'; return; }
    box.textContent = 'Cargando tu bandeja…';
    try {
      const [offers, inquiries] = await Promise.all([
        db.from('servicios').select('*').eq('propietario_id', actor).order('creado_en', { ascending: false }).limit(100),
        db.from('servicio_consultas').select('*').order('creado_en', { ascending: false }).limit(100),
      ]);
      if (actor !== userId() || version !== epoch) return;
      if (offers.error || inquiries.error) throw offers.error || inquiries.error;
      ownedServices = offers.data || [];
      box.innerHTML = '<h3>Mis servicios</h3>' + ((offers.data || []).map(s => `<article class="service-account-card"><h4>${escape(s.titulo)}</h4><p class="service-muted">${escape(price(s))} · ${escape(s.zona)}</p><span class="service-state">${s.publicado ? 'Publicado' : 'Retirado'}</span> <div class="service-own-actions"><button class="service-text-button" type="button" data-service-edit="${escape(s.id)}">Editar servicio</button><button class="service-text-button" type="button" data-service-toggle="${escape(s.id)}" data-next-published="${!s.publicado}">${s.publicado ? 'Retirar del catálogo' : 'Volver a publicar'}</button></div></article>`).join('') || '<p class="service-muted">Todavía no ofreces servicios.</p>') + '<h3>Consultas enviadas y recibidas</h3>' + ((inquiries.data || []).map(q => {
        const received = q.prestador_id === actor;
        return `<article class="service-account-card"><span class="service-label">${received ? 'Recibida' : 'Enviada'}</span><h4>${escape(q.servicio_titulo)}</h4><span class="service-state">${escape(states[q.estado] || q.estado)}</span><p>${escape(q.mascota_nombre)} · ${escape(dateLabel(q.dia_preferido))} · ${escape(times[q.horario])}</p><p class="service-description">${escape(q.mensaje)}</p>${q.respuesta ? `<p class="service-description"><strong>Respuesta del prestador:</strong><br>${escape(q.respuesta)}</p>` : ''}${received && q.estado === 'pendiente' ? `<form class="service-response" data-service-response="${escape(q.id)}"><label><span>Tu respuesta: disponibilidad y valor</span><textarea name="respuesta" rows="3" required minlength="10" maxlength="800"></textarea></label><div><button class="button button-dark" type="submit" name="estado" value="respondida">Responder</button><button class="button button-outline" type="submit" name="estado" value="no_disponible">Sin disponibilidad</button></div><p role="status"></p></form>` : ''}</article>`;
      }).join('') || '<p class="service-muted">Aún no tienes consultas. Las respuestas aparecerán aquí.</p>') + '<p class="service-muted">Se muestran hasta 100 servicios propios y las 100 consultas más recientes. Una respuesta no equivale a una reserva confirmada.</p><p role="status" data-services-account-message></p>';
    } catch (error) {
      if (actor === userId() && version === epoch) box.textContent = errorText(error, 'No pudimos cargar tu bandeja. Pulsa de nuevo “Mis consultas y servicios” para reintentar.');
    }
  }

  function setPanel(value) {
    panel = value;
    $('[data-services-catalog]').hidden = value !== 'catalogo';
    $('[data-services-account]').hidden = value !== 'consultas';
    root.querySelectorAll('[data-services-panel]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.servicesPanel === value)));
    if (value === 'consultas') loadAccount();
  }

  async function publish(event) {
    event.preventDefault();
    if (submitting || !publishForm.reportValidity()) return;
    const message = $('[data-service-publish-message]'), button = publishForm.querySelector('[type=submit]');
    const actor = userId(), generation = editorGeneration, editing = editingService;
    if (!actor || !ready) { message.textContent = 'Inicia sesión y espera a que el catálogo esté disponible para publicar.'; return; }
    const payload = Object.fromEntries(new FormData(publishForm));
    delete payload.consentimiento;
    delete payload.foto_file;
    for (const name of ['titulo','prestador','zona','descripcion']) payload[name] = payload[name].trim();
    const priceMode = payload.precio_tipo;
    payload.precio_clp = priceMode === 'gratis' ? 0 : priceMode === 'acordar' ? null : Number(payload.precio_clp);
    payload.precio_tipo = ['gratis','acordar'].includes(priceMode) ? 'fijo' : priceMode;
    payload.duracion_min = payload.duracion_min === '' ? null : Number(payload.duracion_min);
    const controls = [...publishForm.querySelectorAll('input,select,textarea,button'), $('[data-service-publish-close]')];
    submitting = true; controls.forEach(c => c.disabled = true);
    try {
      Object.assign(payload, await uploadPhoto(actor, generation, message));
      if (actor !== userId() || generation !== editorGeneration) return;
      message.textContent = editing ? 'Guardando cambios…' : 'Publicando…';
      let result;
      if (editing) {
        result = await db.from('servicios').update(payload).eq('id', editing.id).eq('propietario_id', actor).eq('revision', editing.revision || 1).select('*').maybeSingle();
        if (result.error || !result.data) {
          const current = await db.from('servicios').select('*').eq('id', editing.id).eq('propietario_id', actor).maybeSingle();
          if (!current.error && current.data && Object.entries(payload).every(([key,value]) => (current.data[key] ?? null) === value)) result = current;
          else if (!current.error && current.data && current.data.revision !== editing.revision) throw Error('Este servicio cambió en otra pestaña. Cierra el formulario y vuelve a editar para cargar la versión actual.');
        }
      } else {
        creationKey ||= window.crypto.randomUUID();
        result = await db.from('servicios').insert({ ...payload, creacion_clave: creationKey }).select('*').single();
        if (result.error) {
          const previous = await db.from('servicios').select('*').eq('propietario_id', actor).eq('creacion_clave', creationKey).maybeSingle();
          if (!previous.error && previous.data && Object.entries(payload).every(([key,value]) => (previous.data[key] ?? null) === value)) result = previous;
        }
      }
      if (result.error || !result.data?.id) throw result.error || Error('No pudimos confirmar el guardado. Revisa tu bandeja antes de volver a intentarlo.');
      if (actor !== userId() || generation !== editorGeneration) return;
      const oldPath = editing?.foto_path;
      stagedPhoto = null; close(publishDialog); resetEditor(); demo = false;
      if (oldPath && oldPath !== payload.foto_path) await removeUnusedPhoto(oldPath);
      await load(); setPanel('consultas');
    } catch (error) {
      if (actor === userId() && generation === editorGeneration) message.textContent = errorText(error, error instanceof Error ? error.message : 'No pudimos confirmar el guardado. Puedes reintentar; revisa también tu bandeja.');
    } finally { submitting = false; controls.forEach(c => c.disabled = false); }
  }

  async function toggleOffer(button) {
    if (submitting) return;
    const actor = userId(), version = epoch;
    if (!actor) return;
    submitting = true; button.disabled = true;
    try {
      const { data, error } = await db.from('servicios').update({ publicado: button.dataset.nextPublished === 'true' }).eq('id', button.dataset.serviceToggle).eq('propietario_id', actor).select('id').single();
      if (error || !data?.id) throw error || new Error('Sin comprobante');
      if (actor === userId() && version === epoch) await load();
    } catch { if (actor === userId() && version === epoch) $('[data-services-account-message]').textContent = 'No pudimos actualizar tu servicio. Vuelve a intentar.'; }
    finally { submitting = false; button.disabled = false; }
  }

  async function respond(event) {
    const form = event.target.closest('[data-service-response]');
    if (!form) return;
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const actor = userId(), version = epoch, message = form.querySelector('[role=status]');
    const response = form.elements.respuesta.value.trim();
    if (response.length < 10) { message.textContent = 'Escribe una respuesta de al menos 10 caracteres.'; return; }
    submitting = true;
    form.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const { data, error } = await db.from('servicio_consultas').update({ respuesta: response, estado: event.submitter?.value || 'respondida' }).eq('id', form.dataset.serviceResponse).eq('prestador_id', actor).eq('estado', 'pendiente').select('id').single();
      if (error || !data?.id) throw error || new Error('Sin comprobante');
      if (actor === userId() && version === epoch) await loadAccount();
    } catch { if (actor === userId() && version === epoch) message.textContent = 'No pudimos confirmar la respuesta. Actualiza la bandeja para revisar su estado.'; }
    finally { submitting = false; form.querySelectorAll('button').forEach(b => b.disabled = false); }
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-service-category')) {
      category = target.dataset.serviceCategory;
      root.querySelectorAll('[data-service-category]').forEach(b => b.setAttribute('aria-pressed', String(b === target)));
      renderCatalog();
    }
    if (target.dataset.serviceOpen) openService(target.dataset.serviceOpen, target);
    if (target.dataset.servicesPanel) setPanel(target.dataset.servicesPanel);
    if (target.hasAttribute('data-services-retry')) load();
    if (target.hasAttribute('data-services-demo')) { demo = !demo; if (!demo) load(); else renderCatalog(); }
    if (target.dataset.serviceToggle) toggleOffer(target);
    if (target.dataset.serviceEdit) {
      const service = ownedServices.find(s => s.id === target.dataset.serviceEdit);
      if (service) openEditor(service, target);
    }
    if (target.dataset.serviceOffer) {
      if (!userId()) { window.auraLadraVistas?.ir('cuenta'); return; }
      openEditor(null, target);
      publishForm.elements.categoria.value = target.dataset.serviceOffer;
      publishForm.elements.titulo.value = target.dataset.serviceOffer === 'refugio' ? 'Refugio temporal' : 'Transporte de mascotas';
      publishForm.elements.modalidad.value = target.dataset.serviceOffer === 'transporte' ? 'traslado' : 'local';
      syncCategoryHelp();
    }
    if (target.hasAttribute('data-service-publish')) {
      if (!userId()) { window.auraLadraVistas?.ir('cuenta'); return; }
      openEditor(null, target);
    }
  });
  filters.addEventListener('submit', e => e.preventDefault());
  filters.addEventListener('input', renderCatalog);
  filters.addEventListener('change', renderCatalog);
  $('[data-service-close]').addEventListener('click', () => close(dialog));
  $('[data-service-publish-close]').addEventListener('click', () => close(publishDialog));
  publishDialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
  publishDialog.addEventListener('close', resetEditor);
  $('[data-service-photo-input]').addEventListener('change', event => {
    if (submitting) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      window.auraLadraServiciosFotos.validate(file);
      const unused = stagedPhoto?.path;
      stagedPhoto = null; photoFile = file; removePhoto = false;
      $('[data-service-publish-message]').textContent = ''; renderPhotoPreview();
      if (unused) removeUnusedPhoto(unused);
    } catch (error) { event.target.value = ''; $('[data-service-publish-message]').textContent = error.message; }
  });
  $('[data-service-photo-remove]').addEventListener('click', () => {
    if (submitting) return;
    const unused = stagedPhoto?.path;
    stagedPhoto = null; photoFile = null; removePhoto = true;
    $('[data-service-photo-input]').value = ''; renderPhotoPreview();
    if (unused) removeUnusedPhoto(unused);
  });
  [dialog, publishDialog].forEach(dlg => dlg.addEventListener('close', () => { if (!dialog.open && !publishDialog.open && opener?.isConnected) opener.focus(); }));
  detail.addEventListener('click', e => {
    if (e.target.closest('[data-service-inquire]')) {
      renderInquiry(); focusDetail();
      const form = $('[data-service-inquiry-form]');
      if (form && preferredPet && pets().some(a => a.id === preferredPet)) form.elements.animal_id.value = preferredPet;
      const note = form?.querySelector('.service-muted');
      if (note && !isExample(selected)) note.textContent += ' Se comparten el nombre de la mascota, tu mensaje y el día y horario preferidos.';
    }
    if (e.target.closest('[data-service-back]')) renderDetail();
    if (e.target.closest('[data-service-login]')) close(dialog);
    if (e.target.closest('[data-service-my-inquiries]')) { close(dialog); setPanel('consultas'); }
  });
  detail.addEventListener('submit', e => { const form = e.target.closest('[data-service-inquiry-form]'); if (form) { e.preventDefault(); sendInquiry(form); } });
  publishForm.addEventListener('submit', publish);
  publishForm.elements.precio_tipo.addEventListener('change', syncPriceFields);
  publishForm.elements.categoria.addEventListener('change', syncCategoryHelp);
  root.addEventListener('submit', respond);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-services-training]')) {
      category = 'entrenamiento'; setPanel('catalogo');
      root.querySelectorAll('[data-service-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.serviceCategory === category)));
      renderCatalog();
    }
  });
  document.addEventListener('vista:cambio', e => { if (e.detail?.vista === 'servicios') load(); });
  document.addEventListener('mascotas:cambio', () => {
    petsReady = Boolean(authUser && window.auraLadraRed?.sesion?.()?.user?.id === authUser);
    const form = $('[data-service-inquiry-form]');
    if (form && selected && !isExample(selected)) {
      const select = form.elements.animal_id, previous = select.value;
      select.innerHTML = pets().map(a => `<option value="${escape(a.id)}">${escape(a.nombre)}</option>`).join('');
      if (pets().some(a => a.id === previous)) select.value = previous;
    }
  });
  document.addEventListener('mascota:perfil', event => {
    if (!event.detail?.puedeEditar || event.detail.animal?.es_conmemorativa) return;
    const view = $('[data-pet-profile-view]');
    if (!view || view.querySelector('[data-pet-services]')) return;
    const link = document.createElement('a');
    link.href = '#servicios'; link.className = 'services-training-link'; link.dataset.petServices = '';
    link.textContent = 'Buscar cuidados y servicios →';
    link.addEventListener('click', () => { preferredPet = event.detail.animal?.id || null; view.closest('dialog')?.close(); setPanel('catalogo'); });
    view.append(link);
  });
  async function refreshAuth(nextUser) {
    if (nextUser === authUser) return;
    authUser = nextUser; epoch++; services = []; ready = false; petsReady = false; retryRequest = null; preferredPet = null;
    close(dialog); close(publishDialog); resetEditor(); ownedServices = [];
    $('[data-services-account-list]').replaceChildren();
    renderCatalog(); await load();
  }
  db?.auth?.onAuthStateChange((_event, session) => { authEvents++; queueMicrotask(() => refreshAuth(session?.user?.id || null)); });
  const initialAuthEvents = authEvents;
  if (db?.auth?.getSession) db.auth.getSession().then(({ data }) => { if (authEvents === initialAuthEvents) return refreshAuth(data?.session?.user?.id || null); }).catch(() => {});
  load();
})();

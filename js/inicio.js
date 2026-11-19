(() => {
  'use strict';

  const root = document.querySelector('#inicio[data-home-dashboard]');
  if (!root) return;

  const db = window.auraLadraDb;
  const $ = (selector, scope = root) => scope.querySelector(selector);
  const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const dateIso = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const formatDate = (value) => {
    const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    if (date.toISOString().slice(0, 10) === dateIso()) return 'Hoy';
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(date);
  };
  const momentLabels = { paseo: 'Paseo', juego: 'Juego', cuidado: 'Cuidado', encuentro: 'Encuentro', adopcion: 'Adopción', recuerdo: 'Otro momento' };
  const momentIcons = { paseo: '↗', juego: '⌁', cuidado: '♡', encuentro: '✿', adopcion: '♡', recuerdo: '◷' };
  const petRows = () => (state?.integrantes || []).filter((item) => {
    if (item.clase !== 'animal' || item.oculta) return false;
    return item.propio || (item.relaciones || []).some((r) => r.estado === 'confirmado' && ['familia', 'tutor', 'cuidador'].includes(r.tipo));
  });
  let state = null;
  let session = null;
  let requestNo = 0;

  const loadMessage = (text, action = '') => {
    const list = $('[data-home-pets]');
    list.innerHTML = `<p class="home-muted">${esc(text)}</p>${action === 'Volver a intentarlo' ? '<button type="button" class="home-empty-action home-retry" data-home-retry>Volver a intentarlo</button>' : (action ? `<a class="home-empty-action" href="#mi-espacio">${esc(action)}</a>` : '')}`;
    $('[data-home-pet-count]').textContent = '';
  };

  const renderPets = () => {
    const list = $('[data-home-pets]');
    const pets = petRows();
    $('[data-home-pet-count]').textContent = pets.length ? `${pets.length} ${pets.length === 1 ? 'mascota' : 'mascotas'}` : '';
    if (!pets.length) {
      list.innerHTML = `<p class="home-muted">Aún no tienes mascotas asociadas.</p><a class="home-empty-action" href="#mi-espacio">Asocia tu primera mascota</a>`;
      return;
    }
    list.innerHTML = pets.slice(0, 8).map((pet) => {
      const photo = /^https:\/\//i.test(pet.foto_url || '') ? `<img class="home-pet-photo" src="${esc(pet.foto_url)}" alt="Foto de ${esc(pet.nombre || 'mascota')}" loading="lazy">` : `<div class="home-pet-fallback" aria-hidden="true">${esc((pet.nombre || 'M').trim().charAt(0).toLocaleUpperCase('es'))}</div>`;
      return `<article class="home-pet-card" role="listitem">${photo}<span class="home-pet-name">${esc(pet.nombre || 'Sin nombre')}</span></article>`;
    }).join('');
  };

  const ownMoments = () => (state?.momentos || []).filter((item) => item.es_mio).sort((a, b) => `${b.fecha || ''}${b.creado_en || ''}`.localeCompare(`${a.fecha || ''}${a.creado_en || ''}`));
  const textValue = (text, label) => {
    const line = String(text || '').split('\n').find((item) => item.startsWith(`${label}:`));
    return line ? line.slice(label.length + 1).trim() : '';
  };

  const renderToday = () => {
    const today = ownMoments().filter((item) => String(item.fecha || '').slice(0, 10) === dateIso());
    const walks = today.filter((item) => item.tipo === 'paseo');
    if (!today.length) {
      $('[data-home-day-summary]').textContent = 'Aún no registras actividades hoy. Puedes empezar con un paseo, juego o cuidado.';
      return;
    }
    const minutes = walks.reduce((sum, item) => sum + (Number.parseInt(textValue(item.texto, 'Duración'), 10) || 0), 0);
    const parts = [];
    if (walks.length) parts.push(`${walks.length} ${walks.length === 1 ? 'paseo' : 'paseos'}${minutes ? ` · ${minutes} min` : ''}`);
    const others = today.length - walks.length;
    if (others) parts.push(`${others} ${others === 1 ? 'otra actividad' : 'otras actividades'}`);
    const social = walks.filter((item) => textValue(item.texto, 'Socializó con otros perros') === 'Sí').length;
    if (social) parts.push(`${social} ${social === 1 ? 'encuentro' : 'encuentros'} con otros perros`);
    $('[data-home-day-summary]').textContent = parts.join(' · ') || 'Actividad registrada para hoy.';
  };

  const renderMoments = () => {
    const list = $('[data-home-activity-list]');
    const moments = ownMoments().slice(0, 5);
    if (!moments.length) {
      list.innerHTML = '<p class="home-muted">Aún no hay actividades registradas. Aquí verás tus paseos, juegos y cuidados.</p>';
      return;
    }
    list.innerHTML = moments.map((item) => {
      const names = (item.participantes || []).filter((person) => person.clave?.startsWith('animal:')).map((person) => person.nombre).filter(Boolean);
      const title = `${momentLabels[item.tipo] || 'Actividad'}${names.length ? ` · ${names.join(', ')}` : ''}`;
      const detail = [];
      const duration = textValue(item.texto, 'Duración');
      const social = textValue(item.texto, 'Socializó con otros perros');
      const place = textValue(item.texto, 'Lugar');
      const note = textValue(item.texto, 'Nota');
      if (duration) detail.push(`${duration}`);
      if (social) detail.push(social === 'Sí' ? 'Socializó con otros perros' : 'Sin interacción con otros perros');
      if (place) detail.push(place);
      if (note) detail.push(note);
      return `<article class="home-activity-item"><span class="home-activity-symbol" aria-hidden="true">${momentIcons[item.tipo] || '◷'}</span><div><strong class="home-activity-title">${esc(title)}</strong><span class="home-activity-meta">${esc(formatDate(item.fecha))}</span>${detail.length ? `<span class="home-activity-details">${esc(detail.join(' · '))}</span>` : ''}</div></article>`;
    }).join('');
  };

  const render = () => {
    if (!state) return;
    renderPets(); renderToday(); renderMoments();
  };

  const load = async () => {
    if (!db) return;
    const thisRequest = ++requestNo;
    try {
      const { data: authData, error: authError } = await db.auth.getSession();
      if (authError) throw authError;
      if (thisRequest !== requestNo) return;
      session = authData?.session || null;
      if (!session) {
        state = null;
        loadMessage('Inicia sesión para ver tus mascotas y actividades.');
        $('[data-home-activity-list]').innerHTML = '<p class="home-muted">Tus actividades se guardan en tu cuenta y solo tú puedes verlas.</p>';
        $('[data-home-day-summary]').textContent = 'Inicia sesión para ver tu resumen del día.';
        return;
      }
      const { data, error } = await db.rpc('mi_arbol');
      if (error) throw error;
      if (thisRequest !== requestNo) return;
      state = data || { integrantes: [], momentos: [] };
      render();
    } catch (error) {
      console.warn('No se pudo cargar el inicio privado:', error);
      if (thisRequest !== requestNo) return;
      loadMessage('No pudimos cargar tus mascotas ahora.', 'Volver a intentarlo');
      $('[data-home-day-summary]').textContent = 'Cuando se restablezca la conexión, podrás ver tu actividad.';
      $('[data-home-activity-list]').innerHTML = '<p class="home-muted">No pudimos cargar tu actividad.</p>';
    }
  };

  const dialog = document.querySelector('[data-home-activity-dialog]');
  const form = $('[data-home-activity-form]', dialog);
  const walkFields = $('[data-home-walk-fields]', dialog);
  const typeInput = $('[data-home-activity-type]', dialog);
  const petInput = $('[data-home-activity-pets]', dialog);
  const message = $('[data-home-activity-message]', dialog);
  const updateTypeFields = () => {
    const isWalk = typeInput.value === 'paseo';
    walkFields.hidden = !isWalk;
    walkFields.querySelectorAll('[required]').forEach((input) => { input.required = isWalk; });
  };

  const openDialog = () => {
    if (!session) {
      $('[data-home-day-summary]').textContent = 'Inicia sesión para guardar actividades privadas.';
      document.querySelector('[data-session-chip]')?.click();
      return;
    }
    const pets = petRows();
    if (!pets.length) {
      $('[data-home-day-summary]').textContent = 'Asocia una mascota en Mi espacio para registrar su actividad.';
      return;
    }
    form.reset(); message.textContent = ''; message.classList.remove('is-error', 'is-success');
    $('[data-home-activity-date]', dialog).value = dateIso();
    petInput.innerHTML = pets.map((pet) => `<option value="${esc(pet.ref_id)}">${esc(pet.nombre || 'Sin nombre')}</option>`).join('');
    updateTypeFields();
    dialog.showModal();
  };

  $('[data-home-open-activity]').addEventListener('click', openDialog);
  root.addEventListener('click', (event) => { if (event.target.closest('[data-home-retry]')) load(); });
  $('[data-home-activity-close]', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  typeInput.addEventListener('change', updateTypeFields);
  document.addEventListener('vista:cambio', (event) => { if (event.detail?.vista === 'inicio') load(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#inicio') load(); });
  db?.auth?.onAuthStateChange(() => window.setTimeout(load, 0));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = ''; message.classList.remove('is-error', 'is-success');
    const values = new FormData(form);
    const type = String(values.get('tipo') || 'paseo');
    const date = String(values.get('fecha') || '');
    if (!date || date > dateIso()) {
      message.textContent = 'Elige una fecha válida, hasta hoy.'; message.classList.add('is-error'); return;
    }
    const notes = [];
    if (type === 'paseo') {
      const duration = Number(values.get('duracion'));
      const place = String(values.get('lugar') || '').trim();
      if (!Number.isInteger(duration) || duration < 1 || duration > 600 || place.length < 2) {
        message.textContent = 'Completa la duración y el parque o sector del paseo.'; message.classList.add('is-error'); return;
      }
      notes.push(`Duración: ${duration} min`, `Socializó con otros perros: ${values.get('socializo') === 'si' ? 'Sí' : 'No'}`, `Lugar: ${place}`);
    }
    const note = String(values.get('nota') || '').trim();
    if (note) notes.push(`Nota: ${note}`);
    const text = notes.join('\n');
    if (text.length > 600) {
      message.textContent = 'La nota es demasiado larga para guardar todos los detalles.'; message.classList.add('is-error'); return;
    }
    const button = $('[type="submit"]', form);
    button.disabled = true; button.textContent = 'Guardando…';
    try {
      const { error } = await db.rpc('arbol_registrar_momento', {
        p_tipo: type,
        p_fecha: date,
        p_texto: text || null,
        p_visibilidad: 'privado',
        p_participantes: [{ t: 'animal', id: String(values.get('animal_id')) }],
      });
      if (error) throw error;
      dialog.close();
      await load();
    } catch (error) {
      console.warn('No se pudo guardar la actividad privada:', error);
      message.textContent = 'No pudimos guardar la actividad. Revisa tu conexión y vuelve a intentar.';
      message.classList.add('is-error');
    } finally {
      button.disabled = false; button.textContent = 'Guardar actividad';
    }
  });

  void load();
})();

(() => {
  'use strict';

  const db = window.auraLadraDb;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const statusLabels = { pendiente: 'Pendiente', verificado: 'Verificado', cerrado: 'Cerrado', rechazado: 'Rechazado' };
  const categoryLabels = { agua: 'Agua', limpieza: 'Limpieza', seguridad: 'Seguridad', infraestructura: 'Infraestructura' };
  const placeCategoryLabels = {
    canil: 'Canil', parque: 'Parque', veterinaria: 'Veterinaria', tienda_mascotas: 'Tienda de mascotas',
    alimento: 'Comida', juguetes_accesorios: 'Juguetes y accesorios', animal_comunitario: 'Animal comunitario',
    mascota_perdida: 'Mascota perdida', servicio: 'Servicio', comercio: 'Comercio', otro: 'Otro',
  };
  const placeIcons = { canil: '🐾', parque: '🌳', veterinaria: '✚', tienda_mascotas: '◆', alimento: '●', juguetes_accesorios: '◈', animal_comunitario: '♥', mascota_perdida: '!', servicio: '＋', comercio: '◇', otro: '⌖' };
  let currentSession = null;
  let currentUserIsModerator = false;
  let communityMap = null;
  let markerLayer = null;
  let publicPlaces = [];
  let activePlaceFilter = 'todos';
  let publicAnimals = [];
  let ownAnimals = [];
  let ownPublicProfile = null;
  let activePetProfile = null;
  let locationPickerMap = null;

  const actionContent = {
    perdida: {
      number: '01', kicker: 'Actúa con calma', title: 'Tu red cercana es el primer círculo de búsqueda.',
      steps: ['Selecciona la ficha de tu mascota en Red animal.', 'Marca el último lugar y hora en que fue vista.', 'Publica la alerta y compártela con redes locales verificables.'],
      note: 'No publiques tu domicilio, teléfono ni documentos. Si existe riesgo inmediato, utiliza los servicios municipales o de emergencia correspondientes.',
      actions: [
        { id: 'preparar-perdida', label: 'Reportar pérdida en el mapa', style: 'primary' },
        { id: 'mapa-perdidas', label: 'Ver mascotas perdidas', style: 'secondary' },
      ],
    },
    encontrada: {
      number: '02', kicker: 'Prioriza la seguridad', title: 'Ayudar no siempre significa acercarse de inmediato.',
      steps: ['Observa desde una distancia segura y evita perseguirla.', 'Registra ubicación, hora, dirección de desplazamiento y una foto si es posible.', 'Busca una identificación visible o pide apoyo local para contenerla con seguridad.'],
      note: 'No arriesgues una mordedura ni lleves la mascota a un lugar inseguro. Una emergencia veterinaria requiere atención profesional.',
      actions: [
        { id: 'preparar-encontrada', label: 'Preparar aviso de hallazgo', style: 'primary' },
        { id: 'mapa-urgencia', label: 'Buscar urgencias veterinarias', style: 'secondary' },
      ],
    },
    qr: {
      number: '03', kicker: 'Contacto protegido', title: 'El código conecta; no publica a la persona responsable.',
      steps: ['Escanea el código y confirma que corresponde a AuraLadra.', 'Envía el aviso sin necesidad de revelar tu identidad.', 'El responsable recibe el mensaje y decide cómo continuar el contacto.'],
      note: 'Nunca compartas públicamente domicilios, teléfonos o documentos encontrados. Verifica el dominio antes de continuar.',
      actions: [
        { id: 'ingresar-qr', label: 'Abrir enlace del QR', style: 'primary' },
        { id: 'mapa-veterinarias', label: 'Ver veterinarias cercanas', style: 'secondary' },
      ],
    },
  };

  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');
  const reportForm = document.querySelector('[data-report-form]');
  const reportMessage = document.querySelector('[data-report-message]');
  const reportSubmit = document.querySelector('[data-report-submit]');
  const observedInput = reportForm?.elements.observado_en;
  const descriptionInput = reportForm?.elements.descripcion;

  const setMessage = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-success', type === 'success');
    element.classList.toggle('is-error', type === 'error');
  };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const completeMagicLinkReturn = (session) => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') !== 'magic' || !session?.user) return;
    setMessage(document.querySelector('[data-auth-message]'), 'Sesión iniciada correctamente.', 'success');
    window.history.replaceState(null, '', `${window.location.pathname}#cuenta`);
  };

  const toLocalDateTimeValue = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const setDefaultObservedDate = () => {
    if (!observedInput) return;
    const now = new Date();
    observedInput.value = toLocalDateTimeValue(now);
    observedInput.max = toLocalDateTimeValue(new Date(now.getTime() + 15 * 60 * 1000));
    observedInput.min = toLocalDateTimeValue(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  };

  const setHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 20);
  setHeader();
  window.addEventListener('scroll', setHeader, { passive: true });

  menuButton?.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    nav?.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  }));

  const renderAction = (key) => {
    const content = actionContent[key];
    if (!content) return;
    document.querySelector('[data-panel-number]').textContent = content.number;
    document.querySelector('[data-panel-kicker]').textContent = content.kicker;
    document.querySelector('[data-panel-title]').textContent = content.title;
    document.querySelector('[data-panel-note]').textContent = content.note;
    const list = document.querySelector('[data-panel-steps]');
    list.replaceChildren(...content.steps.map((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));
    const actions = document.querySelector('[data-panel-actions]');
    actions.replaceChildren(...content.actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `panel-action ${action.style === 'primary' ? 'is-primary' : ''}`;
      button.dataset.quickAction = action.id;
      button.textContent = action.label;
      return button;
    }));
    const workspace = document.querySelector('[data-action-workspace]');
    locationPickerMap?.remove();
    locationPickerMap = null;
    workspace.hidden = true;
    workspace.replaceChildren();
    setMessage(document.querySelector('[data-action-feedback]'));
  };

  document.querySelectorAll('[data-action]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-action]').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    renderAction(tab.dataset.action);
  }));

  const scrollToMapWithFilter = (filter) => {
    const filterButton = document.querySelector(`[data-place-filter="${filter}"]`);
    filterButton?.click();
    document.querySelector('#mapa')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const buildNotice = (kind, formData) => {
    const isLost = kind === 'perdida';
    const heading = isLost ? 'BUSCAMOS A UNA MASCOTA' : 'MASCOTA ENCONTRADA';
    const name = String(formData.get('nombre') || '').trim();
    const place = String(formData.get('lugar') || '').trim();
    const when = String(formData.get('momento') || '').trim();
    const details = String(formData.get('detalles') || '').trim();
    const lines = [heading];
    if (name) lines.push(`${isLost ? 'Nombre' : 'Identificación'}: ${name}`);
    lines.push(`${isLost ? 'Último lugar visto' : 'Lugar del hallazgo'}: ${place}`);
    if (when) lines.push(`Fecha y hora aproximadas: ${when.replace('T', ' ')}`);
    lines.push(`Descripción: ${details}`);
    lines.push('Comparte solo por canales confiables. No publiques datos personales.');
    return lines.join('\n');
  };

  const copyOrShareNotice = async (notice, feedback) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Aviso AuraLadra', text: notice });
        setMessage(feedback, 'Aviso compartido.', 'success');
        return;
      }
      await navigator.clipboard.writeText(notice);
      setMessage(feedback, 'Aviso copiado. Ya puedes pegarlo en el canal que elijas.', 'success');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setMessage(feedback, 'No pudimos copiar automáticamente. Selecciona el texto y cópialo manualmente.', 'error');
    }
  };

  const isInsideMaipu = (lat, lon) => lat >= -33.60 && lat <= -33.42 && lon >= -70.86 && lon <= -70.64;

  const initializeLocationSearch = (form, feedback) => {
    const input = form.elements.lugar;
    const results = form.querySelector('[data-location-results]');
    const selection = form.querySelector('[data-location-selection]');
    const mapElement = form.querySelector('[data-location-map]');
    let searchTimer = null;
    let searchController = null;
    let selectedMarker = null;

    locationPickerMap?.remove();
    locationPickerMap = window.L.map(mapElement, { scrollWheelZoom: false, zoomControl: true }).setView([-33.51, -70.76], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(locationPickerMap);
    setTimeout(() => locationPickerMap?.invalidateSize(), 0);

    const clearSelection = () => {
      form.elements.latitud.value = '';
      form.elements.longitud.value = '';
      selection.textContent = 'Escribe una dirección y elige una coincidencia del buscador.';
      selection.classList.remove('is-selected');
      if (selectedMarker) locationPickerMap.removeLayer(selectedMarker);
      selectedMarker = null;
    };

    const chooseLocation = (place) => {
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      if (!isInsideMaipu(lat, lon)) {
        setMessage(feedback, 'La ubicación seleccionada queda fuera del área admitida de Maipú.', 'error');
        return;
      }
      input.value = place.display_name;
      form.elements.latitud.value = String(lat);
      form.elements.longitud.value = String(lon);
      selection.textContent = `Punto reconocido: ${place.display_name}`;
      selection.classList.add('is-selected');
      results.replaceChildren();
      selectedMarker = window.L.marker([lat, lon]).addTo(locationPickerMap);
      locationPickerMap.setView([lat, lon], 17);
      setMessage(feedback);
    };

    const renderResults = (places) => {
      if (!places.length) {
        const empty = document.createElement('p');
        empty.className = 'location-empty';
        empty.textContent = 'No encontramos esa dirección en Maipú. Prueba con calle y número o una intersección.';
        results.replaceChildren(empty);
        return;
      }
      results.replaceChildren(...places.map((place) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'location-result';
        button.textContent = place.display_name;
        button.addEventListener('click', () => chooseLocation(place));
        return button;
      }));
    };

    input.addEventListener('input', () => {
      clearSelection();
      clearTimeout(searchTimer);
      searchController?.abort();
      const query = input.value.trim();
      if (query.length < 4) {
        results.replaceChildren();
        return;
      }
      searchTimer = setTimeout(async () => {
        searchController = new AbortController();
        const params = new URLSearchParams({
          q: `${query}, Maipú, Región Metropolitana, Chile`,
          format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'cl',
          viewbox: '-70.86,-33.42,-70.64,-33.60', bounded: '1',
        });
        results.innerHTML = '<p class="location-empty">Buscando dirección…</p>';
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: { 'Accept-Language': 'es-CL,es;q=0.9' },
            signal: searchController.signal,
          });
          if (!response.ok) throw new Error('Geocodificador no disponible');
          const places = (await response.json()).filter((place) => isInsideMaipu(Number(place.lat), Number(place.lon)));
          renderResults(places);
        } catch (error) {
          if (error.name === 'AbortError') return;
          const empty = document.createElement('p');
          empty.className = 'location-empty';
          empty.textContent = 'El buscador no respondió. Espera un momento e inténtalo nuevamente.';
          results.replaceChildren(empty);
        }
      }, 1000);
    });
  };

  const showNoticeBuilder = async (kind, preferredAnimalId = '') => {
    const workspace = document.querySelector('[data-action-workspace]');
    const feedback = document.querySelector('[data-action-feedback]');
    workspace.hidden = false;
    const isLost = kind === 'perdida';
    if (isLost && !currentSession?.user) {
      workspace.innerHTML = '<div class="quick-gate"><strong>Inicia sesión para administrar el estado de tu mascota.</strong><p>La alerta debe quedar vinculada a una ficha de Red animal.</p><a class="panel-action is-primary" href="#cuenta">Ir a Mi cuenta</a></div>';
      setMessage(feedback);
      return;
    }
    if (isLost && !ownAnimals.length) await loadCreatorWorkspace();
    const eligibleAnimals = ownAnimals.filter((animal) => ['pendiente', 'publicado'].includes(animal.estado) && animal.estado_seguridad === 'segura');
    if (isLost && !eligibleAnimals.length) {
      const hasAnimals = ownAnimals.some((animal) => ['pendiente', 'publicado'].includes(animal.estado));
      workspace.innerHTML = hasAnimals
        ? '<div class="quick-gate"><strong>No tienes mascotas seguras disponibles.</strong><p>Si una ya figura como extraviada, puedes devolverla a “Segura” desde Mi cuenta.</p><a class="panel-action is-primary" href="#cuenta">Revisar mis mascotas</a></div>'
        : '<div class="quick-gate"><strong>Primero crea la ficha del animal.</strong><p>Solo una mascota registrada en Red animal puede marcarse como extraviada.</p><a class="panel-action is-primary" href="#red">Crear ficha en Red animal</a></div>';
      setMessage(feedback);
      return;
    }
    workspace.innerHTML = `
      <form class="quick-form" data-quick-notice-form>
        <div class="quick-form-grid">
          ${isLost ? '<label class="is-wide"><span>Mascota registrada</span><select name="animal_id" required data-lost-animal-select></select></label>' : '<label><span>Identificación visible (opcional)</span><input name="nombre" maxlength="60"></label>'}
          <label class="is-wide location-search"><span>${isLost ? 'Último lugar visto' : 'Lugar del hallazgo'}</span><input name="lugar" type="search" required maxlength="180" autocomplete="off" placeholder="Escribe calle y número o una intersección en Maipú"></label>
          ${isLost ? '<div class="location-results is-wide" data-location-results aria-live="polite"></div><p class="location-selection is-wide" data-location-selection>Escribe una dirección y elige una coincidencia del buscador.</p><div class="location-picker-map is-wide" data-location-map aria-label="Mapa del último lugar donde fue vista la mascota"></div><p class="location-credit is-wide">Búsqueda de direcciones por <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>.</p><input name="latitud" type="hidden"><input name="longitud" type="hidden">' : ''}
          <label><span>Fecha y hora aproximadas</span><input name="momento" type="datetime-local" required></label>
          <label class="is-wide"><span>Descripción útil</span><textarea name="detalles" required minlength="10" maxlength="350" rows="3" placeholder="Especie, color, tamaño, señas y dirección de desplazamiento"></textarea></label>
          <label class="trap-field" aria-hidden="true"><span>Sitio web</span><input name="sitio_web" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="quick-form-actions">
          <button class="panel-action is-primary" type="submit" data-lost-submit>${isLost ? 'Publicar en el mapa' : 'Generar aviso'}</button>
          <button class="panel-action" type="button" data-close-workspace>Cancelar</button>
        </div>
        <div class="notice-result" data-notice-result hidden>
          <label><span>Aviso listo para compartir</span><textarea readonly rows="8" data-notice-text></textarea></label>
          <div class="quick-form-actions"><button class="panel-action is-primary" type="button" data-share-notice>Copiar o compartir</button>${isLost ? '<button class="panel-action" type="button" data-view-lost-marker>Ver marcador en el mapa</button>' : ''}</div>
        </div>
      </form>`;
    setMessage(feedback);
    const form = workspace.querySelector('[data-quick-notice-form]');
    if (isLost) {
      const animalSelect = form.querySelector('[data-lost-animal-select]');
      fillSelect(animalSelect, eligibleAnimals, 'Selecciona una de tus mascotas');
      if (preferredAnimalId && eligibleAnimals.some((animal) => animal.id === preferredAnimalId)) animalSelect.value = preferredAnimalId;
    }
    form.elements.momento.value = toLocalDateTimeValue();
    form.elements.momento.max = toLocalDateTimeValue(new Date(Date.now() + 15 * 60 * 1000));
    form.elements.momento.min = toLocalDateTimeValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    if (isLost) initializeLocationSearch(form, feedback);
    workspace.querySelector('input')?.focus();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const formData = new FormData(form);
      if (isLost && (!formData.get('latitud') || !formData.get('longitud'))) {
        setMessage(feedback, 'Selecciona una coincidencia del buscador para ubicar el marcador.', 'error');
        form.elements.lugar.focus();
        return;
      }
      const submit = form.querySelector('[data-lost-submit]');
      submit.disabled = true;
      if (isLost) {
        const selectedAnimal = eligibleAnimals.find((animal) => animal.id === formData.get('animal_id'));
        if (!selectedAnimal) {
          submit.disabled = false;
          setMessage(feedback, 'Selecciona una mascota registrada.', 'error');
          return;
        }
        formData.set('nombre', selectedAnimal.nombre);
        submit.textContent = 'Publicando…';
        const { error } = await db.rpc('cambiar_estado_seguridad_mascota', {
          p_animal_id: selectedAnimal.id,
          p_estado_seguridad: 'extraviada',
          p_descripcion: String(formData.get('detalles')).trim(),
          p_direccion_publica: String(formData.get('lugar')).trim(),
          p_latitud: Number(formData.get('latitud')),
          p_longitud: Number(formData.get('longitud')),
          p_perdida_en: new Date(String(formData.get('momento'))).toISOString(),
          p_sitio_web: String(formData.get('sitio_web') || ''),
        });
        if (error) {
          submit.disabled = false;
          submit.textContent = 'Publicar en el mapa';
          setMessage(feedback, 'No pudimos publicar el marcador. Revisa la información e inténtalo nuevamente.', 'error');
          return;
        }
        await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork()]);
        setMessage(feedback, `${selectedAnimal.nombre} ahora figura como extraviada y aparece en el mapa.`, 'success');
      }
      const notice = buildNotice(kind, formData);
      const result = form.querySelector('[data-notice-result]');
      result.hidden = false;
      result.querySelector('[data-notice-text]').value = notice;
      result.querySelector('[data-share-notice]').onclick = () => copyOrShareNotice(notice, feedback);
      result.querySelector('[data-view-lost-marker]')?.addEventListener('click', () => scrollToMapWithFilter('mascota_perdida'));
      submit.disabled = isLost;
      if (!isLost) submit.textContent = 'Generar aviso';
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    workspace.querySelector('[data-close-workspace]').addEventListener('click', () => {
      locationPickerMap?.remove();
      locationPickerMap = null;
      workspace.hidden = true;
      workspace.replaceChildren();
      setMessage(feedback);
    });
  };

  const showQrEntry = () => {
    const workspace = document.querySelector('[data-action-workspace]');
    const feedback = document.querySelector('[data-action-feedback]');
    workspace.hidden = false;
    workspace.innerHTML = `
      <form class="quick-form" data-qr-entry-form>
        <label><span>Enlace que abrió el QR</span><input name="qr" required maxlength="500" inputmode="url" autocomplete="off" placeholder="Pega aquí el enlace completo"></label>
        <p class="quick-help">Solo abriremos enlaces HTTPS de AuraLadra. Si el QR muestra otro dominio, no ingreses información personal.</p>
        <div class="quick-form-actions">
          <button class="panel-action is-primary" type="submit">Verificar y continuar</button>
          <button class="panel-action" type="button" data-close-workspace>Cancelar</button>
        </div>
      </form>`;
    setMessage(feedback);
    workspace.querySelector('input')?.focus();
    const form = workspace.querySelector('[data-qr-entry-form]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = String(new FormData(form).get('qr') || '').trim();
      let target = null;
      try {
        const candidate = new URL(value);
        const trustedHosts = new Set([window.location.hostname, 'auraladra-convergencia-aura.netlify.app']);
        if (candidate.protocol === 'https:' && trustedHosts.has(candidate.hostname)) target = candidate.href;
      } catch (_) {}
      if (!target) {
        setMessage(feedback, 'Ese código o enlace no parece pertenecer a AuraLadra. No ingreses datos personales.', 'error');
        return;
      }
      setMessage(feedback, 'Enlace seguro confirmado. Abriendo AuraLadra…', 'success');
      window.location.assign(target);
    });
    workspace.querySelector('[data-close-workspace]').addEventListener('click', () => {
      workspace.hidden = true;
      workspace.replaceChildren();
      setMessage(feedback);
    });
  };

  document.querySelector('[data-panel-actions]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-action]');
    if (!button) return;
    const action = button.dataset.quickAction;
    if (action === 'preparar-perdida') showNoticeBuilder('perdida');
    if (action === 'preparar-encontrada') showNoticeBuilder('encontrada');
    if (action === 'ingresar-qr') showQrEntry();
    if (action === 'mapa-todos') scrollToMapWithFilter('todos');
    if (action === 'mapa-perdidas') scrollToMapWithFilter('mascota_perdida');
    if (action === 'mapa-urgencia') scrollToMapWithFilter('urgencia');
    if (action === 'mapa-veterinarias') scrollToMapWithFilter('veterinaria');
  });

  renderAction('perdida');

  const slugify = (value) => {
    const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'registro';
    const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Date.now().toString(36);
    return `${base}-${suffix}`;
  };

  const cleanUrl = (value) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  };

  const placeMatchesFilter = (place) => {
    if (activePlaceFilter === 'todos') return true;
    if (activePlaceFilter === 'urgencia') return place.categoria === 'veterinaria' && place.servicio_urgencia;
    if (activePlaceFilter === 'tienda') return ['tienda_mascotas', 'alimento', 'juguetes_accesorios', 'comercio'].includes(place.categoria);
    return place.categoria === activePlaceFilter;
  };

  const createPlaceCard = (place, marker) => {
    const article = document.createElement('article');
    article.className = 'place-card';
    article.tabIndex = 0;
    const top = document.createElement('div');
    top.className = 'place-card-top';
    const title = document.createElement('h3');
    title.textContent = place.nombre;
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = placeIcons[place.categoria] || '⌖';
    top.append(title, icon);
    const description = document.createElement('p');
    description.textContent = place.descripcion;
    const address = document.createElement('p');
    address.textContent = place.direccion_publica || `${place.comuna} · ubicación aún sin coordenadas`;
    const tags = document.createElement('div');
    tags.className = 'place-tags';
    const category = document.createElement('span');
    category.className = 'place-tag';
    category.textContent = placeCategoryLabels[place.categoria] || place.categoria;
    tags.append(category);
    if (place.servicio_urgencia) {
      const emergency = document.createElement('span');
      emergency.className = 'place-tag is-emergency';
      emergency.textContent = place.urgencia_24h ? 'Urgencia 24 h' : 'Atiende urgencias';
      tags.append(emergency);
    }
    if (place.estado_verificacion === 'verificado') {
      const verified = document.createElement('span');
      verified.className = 'place-tag is-verified';
      verified.textContent = 'Verificado';
      tags.append(verified);
    }
    if (place.precision_ubicacion === 'aproximada') {
      const approximate = document.createElement('span');
      approximate.className = 'place-tag';
      approximate.textContent = 'Ubicación aproximada';
      tags.append(approximate);
    }
    const details = document.createElement('div');
    details.className = 'place-details';
    if (place.horario_publico) {
      const hours = document.createElement('p');
      hours.textContent = place.categoria === 'mascota_perdida'
        ? place.horario_publico
        : `Horario publicado: ${place.horario_publico}`;
      details.append(hours);
    }
    if (place.telefono_publico) {
      const phone = document.createElement('a');
      phone.className = 'place-link';
      phone.href = `tel:${place.telefono_publico.replace(/[^+\d]/g, '')}`;
      phone.textContent = `Llamar: ${place.telefono_publico}`;
      details.append(phone);
    }
    const publicWebsite = cleanUrl(place.sitio_web);
    if (publicWebsite) {
      const website = document.createElement('a');
      website.className = 'place-link';
      website.href = publicWebsite;
      website.target = '_blank';
      website.rel = 'noopener noreferrer';
      website.textContent = 'Sitio oficial';
      details.append(website);
    }
    const sourceUrl = cleanUrl(place.fuente_url);
    if (sourceUrl && place.fuente_nombre) {
      const source = document.createElement('a');
      source.className = 'place-source';
      source.href = sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      const consulted = place.fuente_consultada_en
        ? ` · consultado ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(`${place.fuente_consultada_en}T12:00:00`))}`
        : '';
      source.textContent = `Fuente pública: ${place.fuente_nombre}${consulted}`;
      details.append(source);
    }
    article.append(top, description, address, tags, details);
    if (marker) {
      const focusMarker = () => {
        communityMap.setView(marker.getLatLng(), Math.max(communityMap.getZoom(), 16));
        marker.openPopup();
      };
      article.addEventListener('click', focusMarker);
      article.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') focusMarker(); });
    }
    return article;
  };

  const renderPlaces = () => {
    const container = document.querySelector('[data-place-list]');
    const summary = document.querySelector('[data-map-summary]');
    if (!container || !communityMap || !markerLayer) return;
    markerLayer.clearLayers();
    const filtered = publicPlaces.filter(placeMatchesFilter);
    const visibleCoordinates = [];
    const cards = filtered.map((place) => {
      let marker = null;
      if (place.latitud !== null && place.longitud !== null) {
        const pin = window.L.divIcon({
          className: '', html: `<div class="map-pin ${place.categoria === 'mascota_perdida' ? 'is-lost' : ''}"><span>${placeIcons[place.categoria] || '⌖'}</span></div>`,
          iconSize: [36, 36], iconAnchor: [18, 34], popupAnchor: [0, -32],
        });
        const popup = document.createElement('div');
        const popupTitle = document.createElement('strong');
        popupTitle.textContent = place.nombre;
        const popupMeta = document.createElement('small');
        popupMeta.textContent = `${placeCategoryLabels[place.categoria] || place.categoria}${place.servicio_urgencia ? ' · Urgencias' : ''}`;
        popup.append(popupTitle, popupMeta);
        marker = window.L.marker([Number(place.latitud), Number(place.longitud)], { icon: pin })
          .bindPopup(popup)
          .addTo(markerLayer);
        visibleCoordinates.push([Number(place.latitud), Number(place.longitud)]);
      }
      return createPlaceCard(place, marker);
    });
    if (!cards.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = activePlaceFilter === 'mascota_perdida'
        ? 'No hay alertas activas de mascotas perdidas en el mapa.'
        : 'Todavía no hay lugares publicados en esta categoría.';
      container.replaceChildren(empty);
    } else {
      container.replaceChildren(...cards);
    }
    if (summary) {
      summary.textContent = `${filtered.length} ${filtered.length === 1 ? 'punto visible' : 'puntos visibles'} · solo comuna de Maipú`;
    }
    communityMap.invalidateSize();
    if (visibleCoordinates.length) {
      communityMap.fitBounds(visibleCoordinates, { padding: [32, 32], maxZoom: 14 });
    }
  };

  const initializeMap = () => {
    if (!window.L || communityMap || !document.querySelector('#community-map')) return;
    communityMap = window.L.map('community-map', { scrollWheelZoom: false }).setView([-33.51, -70.76], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(communityMap);
    markerLayer = window.L.layerGroup().addTo(communityMap);
    communityMap.on('click', (event) => {
      const form = document.querySelector('[data-place-form]');
      if (!currentUserIsModerator || !form) return;
      form.elements.latitud.value = event.latlng.lat.toFixed(6);
      form.elements.longitud.value = event.latlng.lng.toFixed(6);
    });
  };

  async function loadPlaces() {
    const [placesResult, alertsResult] = await Promise.all([
      db.from('lugares_publicos')
        .select('id,slug,nombre,descripcion,direccion_publica,comuna,categoria,estado_verificacion,latitud,longitud,publicado,servicio_urgencia,urgencia_24h,horario_publico,telefono_publico,sitio_web,precision_ubicacion,fuente_nombre,fuente_url,fuente_consultada_en')
        .eq('publicado', true).eq('comuna', 'Maipú').order('nombre'),
      db.from('alertas_mascotas')
        .select('id,animal_id,nombre,especie,descripcion,direccion_publica,latitud,longitud,perdida_en,estado,creado_en')
        .eq('estado', 'activa').order('perdida_en', { ascending: false }),
    ]);
    const places = placesResult.error ? [] : (placesResult.data || []);
    const alerts = alertsResult.error ? [] : (alertsResult.data || []).map((alert) => ({
      id: alert.id,
      animal_id: alert.animal_id,
      slug: `mascota-perdida-${alert.id}`,
      nombre: `Se busca: ${alert.nombre}`,
      descripcion: alert.descripcion,
      direccion_publica: alert.direccion_publica,
      comuna: 'Maipú',
      categoria: 'mascota_perdida',
      estado_verificacion: 'comunitario',
      latitud: alert.latitud,
      longitud: alert.longitud,
      publicado: true,
      servicio_urgencia: false,
      urgencia_24h: false,
      horario_publico: `Vista por última vez: ${dateFormatter.format(new Date(alert.perdida_en))}`,
      precision_ubicacion: 'exacta',
    }));
    publicPlaces = [...alerts, ...places];
    renderPlaces();
  }

  document.querySelectorAll('[data-place-filter]').forEach((button) => button.addEventListener('click', () => {
    activePlaceFilter = button.dataset.placeFilter;
    document.querySelectorAll('[data-place-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    renderPlaces();
  }));

  const fillSelect = (select, rows, placeholder) => {
    if (!select) return;
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    const options = rows.map((row) => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = `${row.nombre}${row.estado && row.estado !== 'publicado' ? ` · ${row.estado}` : ''}`;
      return option;
    });
    select.replaceChildren(first, ...options);
  };

  const createAnimalCard = (animal, animalLinks, humanLinks, profilesById, animalsById) => {
    const article = document.createElement('article');
    article.className = 'animal-card';
    const avatar = document.createElement('div');
    avatar.className = 'animal-avatar';
    avatar.textContent = animal.nombre.slice(0, 1).toUpperCase();
    const title = document.createElement('h3');
    title.textContent = animal.nombre;
    const bio = document.createElement('p');
    bio.textContent = animal.biografia || 'Perfil comunitario en construcción.';
    const meta = document.createElement('div');
    meta.className = 'animal-meta';
    [animal.especie, animal.zona_publica, animal.es_comunitario ? 'comunitario' : null].filter(Boolean).forEach((value) => {
      const tag = document.createElement('span');
      tag.textContent = value;
      meta.append(tag);
    });
    if (animal.estado_seguridad === 'extraviada') {
      const lostTag = document.createElement('span');
      lostTag.className = 'is-lost';
      lostTag.textContent = 'Extraviada';
      meta.append(lostTag);
    }
    const connections = [];
    humanLinks.filter((link) => link.animal_id === animal.id).forEach((link) => {
      const profile = profilesById.get(link.perfil_publico_id);
      if (profile) connections.push(`${profile.alias} · ${link.tipo}`);
    });
    animalLinks.filter((link) => link.animal_a_id === animal.id || link.animal_b_id === animal.id).forEach((link) => {
      const otherId = link.animal_a_id === animal.id ? link.animal_b_id : link.animal_a_id;
      const other = animalsById.get(otherId);
      if (other) connections.push(`${other.nombre} · ${link.tipo}`);
    });
    article.append(avatar, title, bio, meta);
    if (connections.length) {
      const links = document.createElement('div');
      links.className = 'animal-links';
      links.textContent = `Red: ${connections.join(' · ')}`;
      article.append(links);
    }
    return article;
  };

  async function loadAnimalNetwork() {
    const container = document.querySelector('[data-animal-grid]');
    const [animalsResult, profilesResult, humanResult, animalLinksResult] = await Promise.all([
      db.from('animales').select('id,slug,nombre,especie,biografia,foto_url,zona_publica,es_comunitario,estado,estado_seguridad').eq('estado', 'publicado').order('nombre'),
      db.from('perfiles_publicos').select('id,alias,biografia,estado').eq('estado', 'publicado'),
      db.from('vinculos_animal_humano').select('id,animal_id,perfil_publico_id,tipo,visible_publicamente,estado').eq('estado', 'confirmado').eq('visible_publicamente', true),
      db.from('vinculos_animales').select('id,animal_a_id,animal_b_id,tipo,descripcion,estado').eq('estado', 'confirmado'),
    ]);
    publicAnimals = animalsResult.error ? [] : (animalsResult.data || []);
    const profiles = profilesResult.error ? [] : (profilesResult.data || []);
    const humanLinks = humanResult.error ? [] : (humanResult.data || []);
    const animalLinks = animalLinksResult.error ? [] : (animalLinksResult.data || []);
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const animalsById = new Map(publicAnimals.map((animal) => [animal.id, animal]));
    if (!container) return;
    if (!publicAnimals.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'La primera red de animales está en preparación.';
      container.replaceChildren(empty);
    } else {
      container.replaceChildren(...publicAnimals.map((animal) => createAnimalCard(animal, animalLinks, humanLinks, profilesById, animalsById)));
    }
    document.querySelectorAll('[data-public-animal-options]').forEach((select) => fillSelect(select, publicAnimals, 'Selecciona un animal'));
    document.querySelectorAll('[data-connect-animal-options]').forEach((select) => {
      const candidates = publicAnimals.filter((animal) => !ownAnimals.some((own) => own.id === animal.id));
      fillSelect(select, candidates, candidates.length ? 'Selecciona una mascota' : 'No hay otras fichas disponibles');
      select.disabled = !candidates.length;
    });
  }

  const renderAccountAnimals = () => {
    const section = document.querySelector('[data-account-animals]');
    const container = document.querySelector('[data-account-animal-list]');
    if (!section || !container) return;
    const hasUser = Boolean(currentSession?.user);
    section.hidden = !hasUser;
    if (!hasUser) {
      container.replaceChildren();
      return;
    }
    if (!ownAnimals.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Aún no tienes fichas propias. Créala primero en Red animal.';
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...ownAnimals.map((animal) => {
      const article = document.createElement('article');
      article.className = 'account-animal';
      article.tabIndex = 0;
      article.setAttribute('role', 'button');
      article.setAttribute('aria-label', `Abrir ficha de ${animal.nombre}`);
      article.dataset.openPetProfile = animal.id;
      const identity = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = animal.nombre;
      const meta = document.createElement('small');
      meta.textContent = `${animal.especie} · ficha ${animal.estado}`;
      identity.append(name, meta);
      const state = document.createElement('span');
      state.className = `pet-state is-${animal.estado_seguridad}`;
      state.textContent = animal.estado_seguridad === 'extraviada' ? 'Extraviada' : 'Segura';
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'pet-state-action';
      if (!['pendiente', 'publicado'].includes(animal.estado)) {
        action.disabled = true;
        action.textContent = 'Ficha no disponible';
      } else if (animal.estado_seguridad === 'extraviada') {
        action.dataset.markPetSafe = animal.id;
        action.textContent = 'Marcar como segura';
      } else {
        action.dataset.markPetLost = animal.id;
        action.textContent = 'Marcar como extraviada';
      }
      const hint = document.createElement('small');
      hint.className = 'account-animal-hint';
      hint.textContent = 'Ver ficha y editar perfil';
      article.append(identity, state, hint, action);
      return article;
    }));
  };

  const petValue = (value, fallback = 'Sin informar') => value === null || value === undefined || value === '' ? fallback : value;
  const petSizeLabels = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande', gigante: 'Gigante' };
  const petRegistryLabels = { registrada: 'Registrada', en_tramite: 'En trámite', no_registrada: 'No registrada', no_informado: 'Sin informar' };

  const renderPetPhotos = (container, animal, editable = false) => {
    if (!container) return;
    const photos = Array.isArray(animal._photo_view_urls) ? animal._photo_view_urls.filter(Boolean) : [];
    if (animal.foto_url && !photos.includes(animal.foto_url)) photos.unshift(animal.foto_url);
    if (!photos.length) {
      container.innerHTML = `<div class="pet-photo-placeholder" aria-hidden="true">🐾</div>${editable ? '<p>Aún no hay fotos. Puedes agregar hasta seis.</p>' : ''}`;
      return;
    }
    container.replaceChildren(...photos.slice(0, 6).map((url, index) => {
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${animal.nombre}, foto ${index + 1}`;
      image.loading = 'lazy';
      return image;
    }));
  };

  const prepareOwnAnimalPhotos = async (animals) => Promise.all(animals.map(async (animal) => {
    const paths = Array.isArray(animal.foto_urls) ? animal.foto_urls.filter(Boolean) : [];
    const urls = await Promise.all(paths.map(async (path) => {
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error } = await db.storage.from('mascotas').createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    }));
    return { ...animal, _photo_view_urls: urls.filter(Boolean) };
  }));

  const showPetProfile = (animal) => {
    const dialog = document.querySelector('[data-pet-profile-dialog]');
    const view = document.querySelector('[data-pet-profile-view]');
    const form = document.querySelector('[data-pet-profile-form]');
    if (!dialog || !view || !form) return;
    activePetProfile = animal;
    form.hidden = true;
    view.hidden = false;
    const age = animal.fecha_nacimiento ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(`${animal.fecha_nacimiento}T12:00:00`)) : 'Sin informar';
    view.innerHTML = `
      <div class="pet-profile-hero">
        <div class="pet-profile-gallery" data-pet-profile-gallery></div>
        <div><p class="kicker">Ficha de mascota</p><h3 id="pet-profile-title">${escapeHtml(animal.nombre)}</h3><p>${escapeHtml(animal.biografia || 'Aún no tiene una descripción.')}</p></div>
      </div>
      <dl class="pet-profile-facts">
        <div><dt>Especie</dt><dd>${escapeHtml(petValue(animal.especie))}</dd></div>
        <div><dt>Raza</dt><dd>${escapeHtml(petValue(animal.raza))}</dd></div>
        <div><dt>Tamaño</dt><dd>${escapeHtml(petSizeLabels[animal.tamano] || 'Sin informar')}</dd></div>
        <div><dt>Peso</dt><dd>${animal.peso_kg ? `${Number(animal.peso_kg).toLocaleString('es-CL')} kg` : 'Sin informar'}</dd></div>
        <div><dt>Sexo</dt><dd>${escapeHtml(petValue(animal.sexo))}</dd></div>
        <div><dt>Nacimiento</dt><dd>${escapeHtml(age)}</dd></div>
        <div><dt>Color o pelaje</dt><dd>${escapeHtml(petValue(animal.color_pelaje))}</dd></div>
        <div><dt>Registro</dt><dd>${escapeHtml(petRegistryLabels[animal.estado_registro] || 'Sin informar')}</dd></div>
      </dl>
      ${animal.numero_registro ? `<p class="pet-private-detail"><strong>N.º de registro:</strong> ${escapeHtml(animal.numero_registro)}</p>` : ''}
      ${animal.senas_particulares ? `<div class="pet-profile-notes"><strong>Señas particulares</strong><p>${escapeHtml(animal.senas_particulares)}</p></div>` : ''}
      <button class="button button-primary" type="button" data-edit-pet-profile>Editar perfil</button>`;
    renderPetPhotos(view.querySelector('[data-pet-profile-gallery]'), animal);
    if (!dialog.open) dialog.showModal();
  };

  const startPetProfileEdit = () => {
    const animal = activePetProfile;
    const view = document.querySelector('[data-pet-profile-view]');
    const form = document.querySelector('[data-pet-profile-form]');
    if (!animal || !form) return;
    view.hidden = true;
    form.hidden = false;
    ['nombre', 'especie', 'raza', 'tamano', 'fecha_nacimiento', 'sexo', 'color_pelaje', 'estado_registro', 'numero_registro', 'biografia', 'senas_particulares'].forEach((field) => {
      if (form.elements[field]) form.elements[field].value = animal[field] || (field === 'estado_registro' ? 'no_informado' : '');
    });
    form.elements.peso_kg.value = animal.peso_kg || '';
    form.elements.fotos.value = '';
    renderPetPhotos(document.querySelector('[data-pet-photo-preview]'), animal, true);
    setMessage(document.querySelector('[data-pet-profile-message]'));
  };

  async function loadCreatorWorkspace() {
    const signedIn = document.querySelector('[data-network-signed-in]');
    const signedOut = document.querySelector('[data-network-signed-out]');
    const hasUser = Boolean(currentSession?.user);
    if (signedIn) signedIn.hidden = !hasUser;
    if (signedOut) signedOut.hidden = hasUser;
    if (!hasUser) {
      ownAnimals = [];
      ownPublicProfile = null;
      renderAccountAnimals();
      return;
    }
    const [animalsResult, profileResult] = await Promise.all([db.rpc('mis_animales'), db.rpc('mi_perfil_publico')]);
    ownAnimals = animalsResult.error ? [] : await prepareOwnAnimalPhotos(animalsResult.data || []);
    ownPublicProfile = profileResult.error ? null : (profileResult.data?.[0] || null);
    renderAccountAnimals();
    document.querySelectorAll('[data-own-animal-options]').forEach((select) => fillSelect(select, ownAnimals, ownAnimals.length ? 'Selecciona uno de tus animales' : 'Primero agrega un animal'));
    document.querySelectorAll('[data-connect-animal-options]').forEach((select) => {
      const candidates = publicAnimals.filter((animal) => !ownAnimals.some((own) => own.id === animal.id));
      fillSelect(select, candidates, candidates.length ? 'Selecciona una mascota' : 'No hay otras fichas disponibles');
      select.disabled = !candidates.length;
    });
    const profileForm = document.querySelector('[data-profile-form]');
    if (profileForm && ownPublicProfile) {
      profileForm.elements.alias.value = ownPublicProfile.alias;
      profileForm.querySelector('button[type="submit"]').disabled = true;
      setMessage(document.querySelector('[data-profile-message]'), `Alias enviado · estado: ${ownPublicProfile.estado}.`, ownPublicProfile.estado === 'publicado' ? 'success' : '');
    }
  }

  const moderationItem = (kind, row, description) => {
    const article = document.createElement('article');
    article.className = 'moderation-item';
    const title = document.createElement('strong');
    title.textContent = row.alias || row.nombre || `${kind} pendiente`;
    const detail = document.createElement('p');
    detail.textContent = description;
    const actions = document.createElement('div');
    actions.className = 'moderation-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Aprobar';
    approve.dataset.networkTable = kind;
    approve.dataset.networkId = row.id;
    approve.dataset.networkStatus = ['perfiles_publicos', 'animales'].includes(kind) ? 'publicado' : 'confirmado';
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Rechazar';
    reject.dataset.networkTable = kind;
    reject.dataset.networkId = row.id;
    reject.dataset.networkStatus = 'rechazado';
    actions.append(approve, reject);
    article.append(title, detail, actions);
    return article;
  };

  async function loadNetworkModeration() {
    const panel = document.querySelector('[data-moderator-network]');
    if (!panel) return;
    panel.hidden = !currentUserIsModerator;
    if (!currentUserIsModerator) return;
    const [profilesResult, animalsResult, humanResult, animalResult] = await Promise.all([
      db.from('perfiles_publicos').select('id,alias,biografia,estado').eq('estado', 'pendiente').order('creado_en'),
      db.from('animales').select('id,nombre,especie,zona_publica,estado').eq('estado', 'pendiente').order('creado_en'),
      db.from('vinculos_animal_humano').select('id,animal_id,perfil_publico_id,tipo,estado').eq('estado', 'pendiente').order('creado_en'),
      db.from('vinculos_animales').select('id,animal_a_id,animal_b_id,tipo,descripcion,estado').eq('estado', 'pendiente').order('creado_en'),
    ]);
    const rows = [
      ...(profilesResult.data || []).map((row) => moderationItem('perfiles_publicos', row, 'Alias público de una persona')),
      ...(animalsResult.data || []).map((row) => moderationItem('animales', row, `${row.especie}${row.zona_publica ? ` · ${row.zona_publica}` : ''}`)),
      ...(humanResult.data || []).map((row) => moderationItem('vinculos_animal_humano', row, `Vínculo humano · ${row.tipo}`)),
      ...(animalResult.data || []).map((row) => moderationItem('vinculos_animales', row, `Vínculo entre animales · ${row.tipo}`)),
    ];
    document.querySelector('[data-network-moderator-count]').textContent = String(rows.length);
    const container = document.querySelector('[data-network-moderation]');
    if (rows.length) container.replaceChildren(...rows);
    else {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No hay solicitudes pendientes.';
      container.replaceChildren(empty);
    }
  }

  const createReportCard = (report, moderation = false) => {
    const article = document.createElement('article');
    article.className = 'report-item';
    const top = document.createElement('div');
    top.className = 'report-item-top';
    const category = document.createElement('strong');
    category.className = 'report-category';
    category.textContent = categoryLabels[report.categoria] || report.categoria;
    const status = document.createElement('span');
    status.className = 'status-badge';
    status.dataset.status = report.estado;
    status.textContent = statusLabels[report.estado] || report.estado;
    top.append(category, status);
    const description = document.createElement('p');
    description.className = 'report-description';
    description.textContent = report.descripcion;
    const meta = document.createElement('p');
    meta.className = 'report-meta';
    meta.textContent = `Observado: ${dateFormatter.format(new Date(report.observado_en))}`;
    article.append(top, description, meta);

    if (moderation) {
      const actions = document.createElement('div');
      actions.className = 'moderation-actions';
      ['pendiente', 'verificado', 'cerrado', 'rechazado'].forEach((nextStatus) => {
        if (nextStatus === report.estado) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.reportId = report.id;
        button.dataset.nextStatus = nextStatus;
        button.textContent = `Marcar ${statusLabels[nextStatus].toLowerCase()}`;
        actions.append(button);
      });
      article.append(actions);
    }
    return article;
  };

  const renderReportList = (container, reports, emptyText, moderation = false) => {
    if (!container) return;
    if (!reports.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = emptyText;
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...reports.map((report) => createReportCard(report, moderation)));
  };

  async function loadPublicReports() {
    const container = document.querySelector('[data-public-reports]');
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .in('estado', ['verificado', 'cerrado']).order('observado_en', { ascending: false }).limit(12);
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar los reportes en este momento.' : 'Aún no hay reportes verificados.');
  }

  async function loadMyReports() {
    const section = document.querySelector('[data-my-reports-section]');
    const container = document.querySelector('[data-my-reports]');
    if (!currentSession?.user) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .order('creado_en', { ascending: false }).limit(30);
    document.querySelector('[data-my-count]').textContent = String(error ? 0 : (data?.length || 0));
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar tu historial.' : 'Todavía no tienes reportes asociados a esta sesión.');
  }

  async function loadModeratorReports() {
    const panel = document.querySelector('[data-moderator-panel]');
    if (!currentUserIsModerator) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const container = document.querySelector('[data-moderator-reports]');
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .order('creado_en', { ascending: false }).limit(50);
    document.querySelector('[data-moderator-count]').textContent = String(error ? 0 : (data?.length || 0));
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar la bandeja de moderación.' : 'No hay reportes por revisar.', true);
  }

  async function syncSession(session) {
    currentSession = session;
    currentUserIsModerator = false;
    const signedOut = document.querySelector('[data-signed-out]');
    const signedIn = document.querySelector('[data-signed-in]');
    if (!session?.user) {
      signedOut.hidden = false;
      signedIn.hidden = true;
      const placePanel = document.querySelector('[data-moderator-place]');
      if (placePanel) placePanel.hidden = true;
      await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports(), loadCreatorWorkspace(), loadNetworkModeration()]);
      return;
    }
    signedOut.hidden = true;
    signedIn.hidden = false;
    document.querySelector('[data-session-email]').textContent = session.user.email || 'cuenta activa';
    const { data, error } = await db.from('moderadores').select('usuario_id').eq('usuario_id', session.user.id).maybeSingle();
    currentUserIsModerator = !error && Boolean(data);
    const placePanel = document.querySelector('[data-moderator-place]');
    if (placePanel) placePanel.hidden = !currentUserIsModerator;
    await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports(), loadCreatorWorkspace(), loadNetworkModeration()]);
  }

  reportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(reportMessage);
    if (!reportForm.reportValidity()) return;
    reportSubmit.disabled = true;
    reportSubmit.firstChild.textContent = 'Enviando… ';
    try {
      const observedDate = new Date(reportForm.elements.observado_en.value);
      if (Number.isNaN(observedDate.getTime())) throw new Error('Fecha inválida.');
      const { error } = await db.rpc('crear_reporte_canil', {
        p_categoria: reportForm.elements.categoria.value,
        p_descripcion: reportForm.elements.descripcion.value,
        p_observado_en: observedDate.toISOString(),
        p_sitio_web: reportForm.elements.sitio_web.value,
      });
      if (error) throw error;
      reportForm.reset();
      setDefaultObservedDate();
      document.querySelector('[data-description-count]').textContent = '0';
      setMessage(reportMessage, currentSession?.user ? 'Reporte recibido. Ya puedes seguirlo en “Mis reportes”.' : 'Reporte recibido de forma anónima. Quedará privado hasta su revisión.', 'success');
      await Promise.all([loadMyReports(), loadModeratorReports()]);
    } catch (error) {
      setMessage(reportMessage, /20 y 600/.test(error?.message || '') ? 'La descripción debe tener entre 20 y 600 caracteres.' : 'No pudimos enviar el reporte. Revisa los datos e inténtalo nuevamente.', 'error');
      console.warn('AuraLadra: no fue posible crear el reporte.', { code: error?.code });
    } finally {
      reportSubmit.disabled = false;
      reportSubmit.firstChild.textContent = 'Enviar reporte ';
    }
  });

  descriptionInput?.addEventListener('input', () => {
    document.querySelector('[data-description-count]').textContent = String(descriptionInput.value.length);
  });

  document.querySelector('[data-place-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-place-message]');
    setMessage(message);
    if (!form.reportValidity() || !currentSession?.user || !currentUserIsModerator) return;
    const latitude = form.elements.latitud.value;
    const longitude = form.elements.longitud.value;
    if ((latitude && !longitude) || (!latitude && longitude)) {
      setMessage(message, 'Completa ambas coordenadas o deja ambas vacías.', 'error');
      return;
    }
    if (form.elements.servicio_urgencia.checked && form.elements.categoria.value !== 'veterinaria') {
      setMessage(message, 'Solo una veterinaria puede marcarse como servicio de urgencia.', 'error');
      return;
    }
    if (form.elements.urgencia_24h.checked && !form.elements.servicio_urgencia.checked) {
      setMessage(message, 'Para indicar 24 horas, primero marca que atiende urgencias.', 'error');
      return;
    }
    const payload = {
      slug: slugify(form.elements.nombre.value),
      nombre: form.elements.nombre.value.trim(),
      descripcion: form.elements.descripcion.value.trim(),
      direccion_publica: form.elements.direccion_publica.value.trim() || null,
      comuna: form.elements.comuna.value.trim(),
      categoria: form.elements.categoria.value,
      estado_verificacion: 'verificado',
      latitud: latitude ? Number(latitude) : null,
      longitud: longitude ? Number(longitude) : null,
      precision_ubicacion: form.elements.precision_ubicacion.value,
      horario_publico: form.elements.horario_publico.value.trim() || null,
      telefono_publico: form.elements.telefono_publico.value.trim() || null,
      sitio_web: cleanUrl(form.elements.sitio_web.value),
      servicio_urgencia: form.elements.servicio_urgencia.checked,
      urgencia_24h: form.elements.urgencia_24h.checked,
      publicado: true,
      creado_por: currentSession.user.id,
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const { error } = await db.from('lugares_publicos').insert(payload);
    button.disabled = false;
    if (error) {
      setMessage(message, 'No pudimos publicar el lugar. Revisa los datos.', 'error');
      console.warn('AuraLadra: error al crear lugar.', { code: error.code });
      return;
    }
    form.reset();
    form.elements.comuna.value = 'Maipú';
    setMessage(message, 'Lugar publicado en el mapa.', 'success');
    await loadPlaces();
  });

  document.querySelector('[data-profile-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-profile-message]');
    if (!form.reportValidity() || !currentSession?.user) return;
    const { error } = await db.from('perfiles_publicos').insert({
      usuario_id: currentSession.user.id,
      alias: form.elements.alias.value.trim(),
      biografia: form.elements.biografia.value.trim() || null,
      estado: 'pendiente',
    });
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ya tienes un alias enviado.' : 'No pudimos guardar el alias.', 'error');
      return;
    }
    setMessage(message, 'Alias enviado a moderación.', 'success');
    await Promise.all([loadCreatorWorkspace(), loadNetworkModeration()]);
  });

  document.querySelector('[data-animal-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-animal-message]');
    if (!form.reportValidity() || !currentSession?.user) return;
    const { error } = await db.from('animales').insert({
      slug: slugify(form.elements.nombre.value),
      nombre: form.elements.nombre.value.trim(),
      especie: form.elements.especie.value,
      biografia: form.elements.biografia.value.trim() || null,
      zona_publica: form.elements.zona_publica.value.trim() || null,
      es_comunitario: form.elements.es_comunitario.checked,
      creado_por: currentSession.user.id,
      estado: 'pendiente',
    });
    if (error) {
      setMessage(message, 'No pudimos guardar el perfil animal.', 'error');
      console.warn('AuraLadra: error al crear animal.', { code: error.code });
      return;
    }
    form.reset();
    setMessage(message, 'Perfil animal enviado a moderación.', 'success');
    await Promise.all([loadCreatorWorkspace(), loadNetworkModeration()]);
  });

  document.querySelector('[data-human-link-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-human-link-message]');
    if (!currentSession?.user || !form.reportValidity()) return;
    if (!ownPublicProfile) {
      setMessage(message, 'Primero crea tu alias público.', 'error');
      return;
    }
    const { error } = await db.from('vinculos_animal_humano').insert({
      animal_id: form.elements.animal_id.value,
      perfil_publico_id: ownPublicProfile.id,
      tipo: form.elements.tipo.value,
      visible_publicamente: form.elements.visible_publicamente.checked,
      estado: 'pendiente',
      creado_por: currentSession.user.id,
    });
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ese vínculo ya fue solicitado.' : 'No pudimos solicitar el vínculo.', 'error');
      return;
    }
    setMessage(message, 'Vínculo enviado a moderación.', 'success');
    await loadNetworkModeration();
  });

  document.querySelector('[data-animal-link-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-animal-link-message]');
    if (!currentSession?.user || !form.reportValidity()) return;
    if (form.elements.animal_a_id.value === form.elements.animal_b_id.value) {
      setMessage(message, 'Selecciona dos animales diferentes.', 'error');
      return;
    }
    const { error } = await db.from('vinculos_animales').insert({
      animal_a_id: form.elements.animal_a_id.value,
      animal_b_id: form.elements.animal_b_id.value,
      tipo: form.elements.tipo.value,
      descripcion: form.elements.descripcion.value.trim() || null,
      estado: 'pendiente',
      creado_por: currentSession.user.id,
    });
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ese vínculo ya fue solicitado.' : 'No pudimos solicitar el vínculo.', 'error');
      return;
    }
    form.reset();
    setMessage(message, 'Vínculo animal enviado a moderación.', 'success');
    await loadNetworkModeration();
  });

  document.querySelector('[data-network-moderation]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-network-table][data-network-id][data-network-status]');
    if (!button || !currentUserIsModerator) return;
    const message = document.querySelector('[data-network-moderator-message]');
    button.disabled = true;
    const { error } = await db.from(button.dataset.networkTable)
      .update({ estado: button.dataset.networkStatus })
      .eq('id', button.dataset.networkId);
    if (error) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar esta solicitud.', 'error');
      return;
    }
    setMessage(message, 'Solicitud actualizada.', 'success');
    await Promise.all([loadNetworkModeration(), loadAnimalNetwork(), loadCreatorWorkspace()]);
  });

  document.querySelector('[data-account-animal-list]')?.addEventListener('click', async (event) => {
    const lostButton = event.target.closest('[data-mark-pet-lost]');
    const safeButton = event.target.closest('[data-mark-pet-safe]');
    const profileCard = event.target.closest('[data-open-pet-profile]');
    if (!currentSession?.user) return;
    if (!lostButton && !safeButton) {
      const animal = ownAnimals.find((item) => item.id === profileCard?.dataset.openPetProfile);
      if (animal) showPetProfile(animal);
      return;
    }
    const animalId = (lostButton || safeButton).dataset.markPetLost || (lostButton || safeButton).dataset.markPetSafe;
    const animal = ownAnimals.find((item) => item.id === animalId);
    if (!animal) return;

    if (lostButton) {
      document.querySelector('[data-action="perdida"]')?.click();
      await showNoticeBuilder('perdida', animal.id);
      document.querySelector('#acciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (!window.confirm(`¿Confirmas que ${animal.nombre} está segura? Se retirará su alerta activa del mapa.`)) return;
    const message = document.querySelector('[data-account-animal-message]');
    safeButton.disabled = true;
    setMessage(message, `Actualizando el estado de ${animal.nombre}…`);
    const { error } = await db.rpc('cambiar_estado_seguridad_mascota', {
      p_animal_id: animal.id,
      p_estado_seguridad: 'segura',
    });
    if (error) {
      safeButton.disabled = false;
      setMessage(message, 'No pudimos actualizar el estado de la mascota.', 'error');
      return;
    }
    await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork()]);
    setMessage(message, `${animal.nombre} ahora figura como segura y su alerta fue cerrada.`, 'success');
  });

  document.querySelector('[data-account-animal-list]')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('[data-open-pet-profile]');
    const animal = ownAnimals.find((item) => item.id === card?.dataset.openPetProfile);
    if (!animal) return;
    event.preventDefault();
    showPetProfile(animal);
  });

  document.querySelector('[data-pet-profile-dialog]')?.addEventListener('click', (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog || event.target.closest('[data-pet-profile-close]')) dialog.close();
    if (event.target.closest('[data-edit-pet-profile]')) startPetProfileEdit();
    if (event.target.closest('[data-pet-profile-cancel]') && activePetProfile) showPetProfile(activePetProfile);
  });

  document.querySelector('[data-open-pet-connect]')?.addEventListener('click', () => {
    const dialog = document.querySelector('[data-pet-connect-dialog]');
    setMessage(document.querySelector('[data-connect-pet-message]'));
    if (dialog && !dialog.open) dialog.showModal();
  });

  document.querySelector('[data-pet-connect-dialog]')?.addEventListener('click', (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog || event.target.closest('[data-pet-connect-close]')) dialog.close();
    if (event.target.closest('[data-create-new-pet]')) {
      dialog.close();
      document.querySelector('[data-animal-form]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('[data-animal-form] input[name="nombre"]')?.focus({ preventScroll: true });
    }
  });

  document.querySelector('[data-connect-existing-pet]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-connect-pet-message]');
    const button = form.querySelector('button[type="submit"]');
    if (!currentSession?.user || !form.reportValidity()) return;
    button.disabled = true;
    setMessage(message, 'Conectando la ficha…');
    const { error } = await db.rpc('conectar_mascota_sin_responsable', { p_animal_id: form.elements.animal_id.value });
    button.disabled = false;
    if (error) {
      setMessage(message, error.message?.includes('responsable') ? 'Esta ficha ya tiene responsable. La conexión deberá solicitarse a esa persona.' : 'No pudimos conectar esta ficha.', 'error');
      return;
    }
    await Promise.all([loadCreatorWorkspace(), loadAnimalNetwork()]);
    document.querySelector('[data-pet-connect-dialog]')?.close();
    setMessage(document.querySelector('[data-account-animal-message]'), 'Mascota conectada a tu cuenta.', 'success');
  });

  document.querySelector('[data-pet-profile-form]')?.elements.fotos.addEventListener('change', (event) => {
    const preview = document.querySelector('[data-pet-photo-preview]');
    const files = [...event.target.files].slice(0, 6);
    if (!files.length) {
      if (activePetProfile) renderPetPhotos(preview, activePetProfile, true);
      return;
    }
    preview.replaceChildren(...files.map((file, index) => {
      const image = document.createElement('img');
      image.src = URL.createObjectURL(file);
      image.alt = `Nueva foto ${index + 1}`;
      image.onload = () => URL.revokeObjectURL(image.src);
      return image;
    }));
  });

  document.querySelector('[data-pet-profile-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-pet-profile-message]');
    const saveButton = document.querySelector('[data-pet-profile-save]');
    if (!activePetProfile || !currentSession?.user || !form.reportValidity()) return;
    const files = [...form.elements.fotos.files];
    if (files.length > 6 || files.some((file) => file.size > 5 * 1024 * 1024)) {
      setMessage(message, 'Puedes subir hasta 6 fotos de máximo 5 MB cada una.', 'error');
      return;
    }
    saveButton.disabled = true;
    setMessage(message, 'Guardando la ficha…');
    try {
      const existingPhotos = Array.isArray(activePetProfile.foto_urls) ? activePetProfile.foto_urls.filter(Boolean) : [];
      const uploadedPhotos = [];
      for (const [index, file] of files.entries()) {
        const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${currentSession.user.id}/${activePetProfile.id}/${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await db.storage.from('mascotas').upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPhotos.push(path);
      }
      const photoUrls = [...existingPhotos, ...uploadedPhotos].slice(0, 6);
      const { error } = await db.rpc('actualizar_mi_animal', {
        p_animal_id: activePetProfile.id,
        p_nombre: form.elements.nombre.value.trim(),
        p_especie: form.elements.especie.value,
        p_biografia: form.elements.biografia.value.trim() || null,
        p_raza: form.elements.raza.value.trim() || null,
        p_tamano: form.elements.tamano.value || null,
        p_peso_kg: form.elements.peso_kg.value ? Number(form.elements.peso_kg.value) : null,
        p_fecha_nacimiento: form.elements.fecha_nacimiento.value || null,
        p_sexo: form.elements.sexo.value || null,
        p_color_pelaje: form.elements.color_pelaje.value.trim() || null,
        p_estado_registro: form.elements.estado_registro.value,
        p_numero_registro: form.elements.numero_registro.value.trim() || null,
        p_senas_particulares: form.elements.senas_particulares.value.trim() || null,
        p_foto_urls: photoUrls,
      });
      if (error) throw error;
      await Promise.all([loadCreatorWorkspace(), loadAnimalNetwork()]);
      const updated = ownAnimals.find((item) => item.id === activePetProfile.id);
      if (updated) showPetProfile(updated);
      setMessage(document.querySelector('[data-account-animal-message]'), `Ficha de ${form.elements.nombre.value.trim()} actualizada.`, 'success');
    } catch (error) {
      setMessage(message, 'No pudimos guardar los cambios. Revisa las fotos y vuelve a intentarlo.', 'error');
      console.warn('AuraLadra: error al actualizar la ficha animal.', { code: error?.code });
    } finally {
      saveButton.disabled = false;
    }
  });

  document.querySelector('[data-magic-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector('[data-magic-submit]');
    const message = document.querySelector('[data-auth-message]');
    setMessage(message);
    if (!form.reportValidity()) return;
    button.disabled = true;
    try {
      const redirectUrl = new URL(window.location.pathname, window.location.origin);
      redirectUrl.searchParams.set('auth', 'magic');
      const { error } = await db.auth.signInWithOtp({
        email: form.elements.email.value.trim(),
        options: { emailRedirectTo: redirectUrl.href, shouldCreateUser: true },
      });
      if (error) throw error;
      form.reset();
      setMessage(message, 'Revisa tu correo: te enviamos un enlace de acceso.', 'success');
    } catch (error) {
      const code = error?.code || '';
      const status = Number(error?.status || 0);
      const detail = String(error?.message || '').toLowerCase();
      let userMessage = 'No pudimos enviar el enlace. Verifica el correo e inténtalo nuevamente.';

      if (code === 'over_email_send_rate_limit' || detail.includes('email rate limit')) {
        userMessage = 'El servicio de correo alcanzó su límite horario. Inténtalo nuevamente más tarde.';
      } else if (code === 'over_request_rate_limit' || status === 429) {
        userMessage = 'Hay demasiados intentos recientes. Espera unos minutos antes de solicitar otro enlace.';
      } else if (code === 'email_address_invalid' || detail.includes('invalid email')) {
        userMessage = 'El correo no parece válido. Revisa la dirección e inténtalo nuevamente.';
      } else if (code) {
        userMessage = `No pudimos enviar el enlace. Código: ${code}.`;
      }

      setMessage(message, userMessage, 'error');
      console.warn('AuraLadra: error al solicitar Magic Link.', { code, status });
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('[data-sign-out]')?.addEventListener('click', async () => {
    const { error } = await db.auth.signOut();
    if (error) setMessage(document.querySelector('[data-auth-message]'), 'No pudimos cerrar la sesión.', 'error');
  });

  document.querySelector('[data-moderator-reports]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-report-id][data-next-status]');
    if (!button) return;
    const message = document.querySelector('[data-moderator-message]');
    button.disabled = true;
    setMessage(message);
    const { data, error } = await db.from('reportes_canil').update({ estado: button.dataset.nextStatus })
      .eq('id', button.dataset.reportId).select('id,estado').single();
    if (error || !data) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar el reporte.', 'error');
      return;
    }
    setMessage(message, 'Estado actualizado.', 'success');
    await Promise.all([loadModeratorReports(), loadMyReports(), loadPublicReports()]);
  });

  async function verifyBackend() {
    const status = document.querySelector('[data-system-status]');
    try {
      if (!db) throw new Error('Cliente Supabase no inicializado.');
      const { data, error } = await db.from('estado_sistema').select('estado, version').eq('id', 'auraladra').single();
      if (error) throw error;
      document.documentElement.dataset.backend = data.estado;
      if (status) {
        status.classList.add('is-online');
        status.lastChild.textContent = ` Sistema conectado · v${data.version}`;
      }
    } catch (error) {
      document.documentElement.dataset.backend = 'pendiente';
      if (status) status.lastChild.textContent = ' Piloto en preparación';
      console.warn('AuraLadra: backend no disponible.', { code: error?.code });
    }
  }

  async function initialize() {
    document.querySelector('[data-year]').textContent = new Date().getFullYear();
    setDefaultObservedDate();
    initializeMap();
    if (!db) {
      setMessage(reportMessage, 'El sistema de reportes no está disponible temporalmente.', 'error');
      return;
    }
    const [{ data }] = await Promise.all([db.auth.getSession(), verifyBackend(), loadPlaces(), loadAnimalNetwork()]);
    await syncSession(data.session);
    completeMagicLinkReturn(data.session);
    db.auth.onAuthStateChange((_event, session) => window.setTimeout(async () => {
      await syncSession(session);
      completeMagicLinkReturn(session);
    }, 0));
  }

  initialize();
})();

(() => {
  'use strict';

  const db = window.auraLadraDb;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const statusLabels = {
    pendiente: 'Pendiente',
    verificado: 'Verificado',
    cerrado: 'Cerrado',
    rechazado: 'Rechazado',
    revisado: 'Revisado',
    accion_tomada: 'Acción tomada',
    descartado: 'Descartado',
  };
  const categoryLabels = { agua: 'Agua', limpieza: 'Limpieza', seguridad: 'Seguridad', infraestructura: 'Infraestructura' };
  const placeCategoryLabels = {
    canil: 'Canil', parque: 'Parque', veterinaria: 'Veterinaria', refugio: 'Refugio', casa_acogida: 'Casa de acogida', tienda_mascotas: 'Tienda de mascotas',
    alimento: 'Comida', juguetes_accesorios: 'Juguetes y accesorios', animal_comunitario: 'Animal comunitario',
    mascota_perdida: 'Mascota perdida', servicio: 'Servicio', comercio: 'Comercio', otro: 'Otro',
  };
  const placeIcons = { canil: '🐾', parque: '🌳', veterinaria: '✚', refugio: '⌂', casa_acogida: '♡', tienda_mascotas: '◆', alimento: '●', juguetes_accesorios: '◈', animal_comunitario: '♥', mascota_perdida: '!', servicio: '＋', comercio: '◇', otro: '⌖' };
  const petSkillLabels = {
    reconoce_nombre: 'Reconoce su nombre', contacto_visual: 'Hace contacto visual', sentarse: 'Se sienta', dar_patita: 'Da la patita', echarse: 'Se echa',
    esperar: 'Espera', venir_llamado: 'Acude al llamado', soltar: 'Suelta objetos', paseo_correa: 'Pasea con correa', higiene: 'Hace sus necesidades en lugar indicado', socializa: 'Socializa con otros animales',
  };
  const characterKeys = ['personas', 'animales', 'manipulacion', 'recursos', 'entorno'];
  const defaultPetSummaryBlocks = ['especie', 'raza', 'tamano', 'peso', 'sexo', 'nacimiento', 'color', 'registro'];
  const petSummaryLabels = {
    especie: 'Especie', raza: 'Raza', tamano: 'Tamaño', peso: 'Peso', sexo: 'Sexo', nacimiento: 'Nacimiento', color: 'Color o pelaje', registro: 'Registro',
    caracter: 'Carácter', diagnostico_nutricional: 'Diagnóstico nutricional', habilidades: 'Habilidades', estado_seguridad: 'Estado de seguridad',
  };
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
  let activePetEditSection = 'perfil';
  let avatarCropSource = '';
  let avatarObjectUrls = [];
  let locationPickerMap = null;

  const actionContent = {
    perdida: {
      number: '01', kicker: 'Actúa con calma', title: 'Tu red cercana es el primer círculo de búsqueda.',
      steps: ['Selecciona la ficha de tu mascota en Red animal.', 'Marca el último lugar y hora en que fue vista.', 'Publica: el aviso sale en el mapa y en Most Wanted. La recompensa es opcional.'],
      note: 'No publiques tu domicilio, teléfono ni documentos. Si existe riesgo inmediato, utiliza los servicios municipales o de emergencia correspondientes.',
      actions: [
        { id: 'preparar-perdida', label: 'Marcar como extraviada', style: 'primary' },
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
    lugar: {
      number: '03', kicker: 'Mapa colaborativo', title: 'Ayúdanos a mantener actualizado el ecosistema animal.',
      steps: ['Agrega un lugar nuevo o selecciona uno existente.', 'Propón una modificación o rectificación con información verificable.', 'El capitán #00 revisará la propuesta antes de cambiar el mapa.'],
      note: 'Ningún cambio se publica automáticamente. Evita domicilios particulares salvo que sean datos públicos de una organización.',
      actions: [{ id: 'proponer-lugar', label: 'Crear propuesta', style: 'primary' }],
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
  const pawLayers = [...document.querySelectorAll('[data-paw-layer]')];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updatePawParallax = () => {
    if (!pawLayers.length || prefersReducedMotion.matches) return;
    const y = window.scrollY;
    pawLayers.forEach((layer) => {
      const drift = layer.dataset.pawLayer === 'far' ? y * 0.08 : y * 0.18;
      layer.style.transform = `translate3d(0, ${drift}px, 0)`;
    });
  };
  setHeader();
  updatePawParallax();
  window.addEventListener('scroll', () => {
    setHeader();
    updatePawParallax();
  }, { passive: true });

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
    const eligibleAnimals = ownAnimals.filter((animal) => ['pendiente', 'publicado'].includes(animal.estado) && animal.estado_seguridad === 'segura' && !animal.es_conmemorativa);
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
          <label class="is-wide"><span>Descripción útil</span><textarea name="detalles" required minlength="20" maxlength="350" rows="3" placeholder="Especie, color, tamaño, señas y dirección de desplazamiento"></textarea></label>
          ${isLost ? `<label class="is-wide reward-option"><input type="checkbox" name="ofrecer_recompensa"><span>Ofrecer recompensa (opcional)</span></label>
          <label class="is-wide" data-lost-reward-wrap hidden><span>Monto de la recompensa (CLP)</span><input name="monto_recompensa" type="number" min="1000" step="1000" placeholder="Ej.: 50000"></label>` : ''}
          <label class="trap-field" aria-hidden="true"><span>Sitio web</span><input name="sitio_web" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="quick-form-actions">
          <button class="panel-action is-primary" type="submit" data-lost-submit>${isLost ? 'Publicar extravío' : 'Generar aviso'}</button>
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
    form.elements.ofrecer_recompensa?.addEventListener('change', () => {
      const wrap = form.querySelector('[data-lost-reward-wrap]');
      if (!wrap) return;
      wrap.hidden = !form.elements.ofrecer_recompensa.checked;
      form.elements.monto_recompensa.required = form.elements.ofrecer_recompensa.checked;
    });
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
        const ofrecer = form.elements.ofrecer_recompensa?.checked;
        const monto = Number(form.elements.monto_recompensa?.value);
        if (ofrecer && (!monto || monto < 1000)) {
          submit.disabled = false;
          submit.textContent = 'Publicar extravío';
          setMessage(feedback, 'La recompensa debe ser de al menos $1.000, o desmarca la casilla.', 'error');
          return;
        }
        const payload = {
          p_animal_id: selectedAnimal.id,
          p_estado_seguridad: 'extraviada',
          p_descripcion: String(formData.get('detalles')).trim(),
          p_direccion_publica: String(formData.get('lugar')).trim(),
          p_latitud: Number(formData.get('latitud')),
          p_longitud: Number(formData.get('longitud')),
          p_perdida_en: new Date(String(formData.get('momento'))).toISOString(),
          p_sitio_web: String(formData.get('sitio_web') || ''),
        };
        if (ofrecer) payload.p_monto_recompensa = monto;
        const { error } = await db.rpc('cambiar_estado_seguridad_mascota', payload);
        if (error) {
          submit.disabled = false;
          submit.textContent = 'Publicar extravío';
          setMessage(feedback, error.message || 'No pudimos publicar el aviso. Revisa la información e inténtalo nuevamente.', 'error');
          return;
        }
        await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork(), refreshWanted()]);
        setMessage(feedback, `${selectedAnimal.nombre} ahora figura como extraviada: está en el mapa y en Most Wanted.`, 'success');
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

  const showPlaceProposal = () => {
    const workspace = document.querySelector('[data-action-workspace]');
    const feedback = document.querySelector('[data-action-feedback]');
    const places = publicPlaces.filter((place) => place.categoria !== 'mascota_perdida');
    workspace.hidden = false;
    workspace.innerHTML = `
      <form class="quick-form" data-place-proposal-form>
        <div class="quick-form-grid">
          <label><span>Qué quieres hacer</span><select name="tipo" required><option value="nuevo">Agregar un lugar nuevo</option><option value="modificar">Modificar un lugar existente</option><option value="rectificar">Rectificar información incorrecta</option></select></label>
          <label data-proposal-target hidden><span>Lugar existente</span><select name="lugar_id"><option value="">Selecciona un lugar</option>${places.map((place) => `<option value="${escapeHtml(place.id)}">${escapeHtml(place.nombre)}</option>`).join('')}</select></label>
          <label><span>Nombre</span><input name="nombre" required maxlength="100"></label>
          <label><span>Categoría</span><select name="categoria" required><option value="canil">Canil</option><option value="parque">Parque</option><option value="veterinaria">Veterinaria</option><option value="refugio">Refugio</option><option value="casa_acogida">Casa de acogida</option><option value="tienda_mascotas">Tienda de mascotas</option><option value="alimento">Comida para mascotas</option><option value="juguetes_accesorios">Juguetes y accesorios</option><option value="animal_comunitario">Animal comunitario</option><option value="servicio">Servicio</option><option value="comercio">Comercio</option><option value="otro">Otro</option></select></label>
          <label class="is-wide"><span>Descripción</span><textarea name="descripcion" required maxlength="500" rows="3"></textarea></label>
          <label><span>Dirección pública</span><input name="direccion_publica" maxlength="180"></label>
          <label><span>Comuna</span><input name="comuna" value="Maipú" required maxlength="80"></label>
          <label><span>Latitud</span><input name="latitud" type="number" step="0.000001" min="-90" max="90"></label>
          <label><span>Longitud</span><input name="longitud" type="number" step="0.000001" min="-180" max="180"></label>
          <label><span>Horario</span><input name="horario_publico" maxlength="180"></label>
          <label><span>Teléfono público</span><input name="telefono_publico" maxlength="40"></label>
          <label class="is-wide"><span>Sitio web</span><input name="sitio_web" type="url" maxlength="300"></label>
          <label class="is-wide"><span>Motivo o fuente de la propuesta</span><textarea name="motivo" required minlength="10" maxlength="500" rows="3" placeholder="Explica qué conoces, qué debe corregirse o dónde puede verificarse."></textarea></label>
          <label class="check-field"><input name="servicio_urgencia" type="checkbox"><span>Atiende urgencias veterinarias</span></label>
          <label class="check-field"><input name="urgencia_24h" type="checkbox"><span>Urgencia 24 horas</span></label>
        </div>
        <div class="quick-form-actions"><button class="panel-action is-primary" type="submit">Enviar a moderación</button><button class="panel-action" type="button" data-close-workspace>Cancelar</button></div>
      </form>`;
    setMessage(feedback);
    const form = workspace.querySelector('[data-place-proposal-form]');
    const targetWrap = form.querySelector('[data-proposal-target]');
    const syncType = () => {
      const needsTarget = form.elements.tipo.value !== 'nuevo';
      targetWrap.hidden = !needsTarget;
      form.elements.lugar_id.required = needsTarget;
    };
    form.elements.tipo.addEventListener('change', syncType);
    form.elements.lugar_id.addEventListener('change', () => {
      const place = places.find((item) => item.id === form.elements.lugar_id.value);
      if (!place) return;
      ['nombre','categoria','descripcion','direccion_publica','comuna','latitud','longitud','horario_publico','telefono_publico','sitio_web'].forEach((field) => { if (form.elements[field]) form.elements[field].value = place[field] ?? ''; });
      form.elements.servicio_urgencia.checked = Boolean(place.servicio_urgencia);
      form.elements.urgencia_24h.checked = Boolean(place.urgencia_24h);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const latitude = form.elements.latitud.value;
      const longitude = form.elements.longitud.value;
      if ((latitude && !longitude) || (!latitude && longitude)) return setMessage(feedback, 'Completa ambas coordenadas o deja ambas vacías.', 'error');
      const data = {
        slug: slugify(form.elements.nombre.value), nombre: form.elements.nombre.value.trim(), categoria: form.elements.categoria.value,
        descripcion: form.elements.descripcion.value.trim(), direccion_publica: form.elements.direccion_publica.value.trim() || null,
        comuna: form.elements.comuna.value.trim(), latitud: latitude ? Number(latitude) : null, longitud: longitude ? Number(longitude) : null,
        precision_ubicacion: 'exacta', horario_publico: form.elements.horario_publico.value.trim() || null,
        telefono_publico: form.elements.telefono_publico.value.trim() || null, sitio_web: cleanUrl(form.elements.sitio_web.value),
        servicio_urgencia: form.elements.servicio_urgencia.checked, urgencia_24h: form.elements.urgencia_24h.checked,
      };
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const { error } = await db.from('propuestas_lugares').insert({ tipo: form.elements.tipo.value, lugar_id: form.elements.lugar_id.value || null, datos_propuestos: data, motivo: form.elements.motivo.value.trim(), creado_por: currentSession?.user?.id || null });
      button.disabled = false;
      if (error) return setMessage(feedback, `No pudimos enviar la propuesta${error.message ? `: ${error.message}` : '.'}`, 'error');
      form.reset(); syncType(); setMessage(feedback, 'Propuesta enviada. El capitán #00 debe aprobarla antes de que cambie el mapa.', 'success');
      if (currentUserIsModerator) await loadPlaceProposals();
    });
    workspace.querySelector('[data-close-workspace]').addEventListener('click', () => { workspace.hidden = true; workspace.replaceChildren(); setMessage(feedback); });
    syncType();
  };

  document.querySelector('[data-panel-actions]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-action]');
    if (!button) return;
    const action = button.dataset.quickAction;
    if (action === 'preparar-perdida') showNoticeBuilder('perdida');
    if (action === 'preparar-encontrada') showNoticeBuilder('encontrada');
    if (action === 'proponer-lugar') showPlaceProposal();
    if (action === 'mapa-todos') scrollToMapWithFilter('todos');
    if (action === 'mapa-perdidas') scrollToMapWithFilter('mascota_perdida');
    if (action === 'mapa-urgencia') scrollToMapWithFilter('urgencia');
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

  const placeCategoryOrder = Object.keys(placeCategoryLabels);

  const createPlaceCategoryGroup = (categoria, cards) => {
    const group = document.createElement('div');
    group.className = 'place-category';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'place-category-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    const icon = document.createElement('span');
    icon.className = 'place-category-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = placeIcons[categoria] || '⌖';
    const label = document.createElement('span');
    label.className = 'place-category-label';
    label.textContent = placeCategoryLabels[categoria] || categoria;
    const count = document.createElement('span');
    count.className = 'place-category-count';
    count.textContent = cards.length === 1 ? '1 sitio' : `${cards.length} sitios`;
    const chevron = document.createElement('span');
    chevron.className = 'place-category-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(icon, label, count, chevron);
    const panel = document.createElement('div');
    panel.className = 'place-category-panel';
    panel.hidden = true;
    panel.append(...cards);
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      group.classList.toggle('is-open', !isOpen);
      panel.hidden = isOpen;
    });
    group.append(toggle, panel);
    return group;
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
    const cardsByCategory = new Map();
    filtered.forEach((place) => {
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
      const categoria = place.categoria || 'otro';
      if (!cardsByCategory.has(categoria)) cardsByCategory.set(categoria, []);
      cardsByCategory.get(categoria).push(createPlaceCard(place, marker));
    });
    if (!cardsByCategory.size) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = activePlaceFilter === 'mascota_perdida'
        ? 'No hay alertas activas de mascotas perdidas en el mapa.'
        : 'Todavía no hay lugares publicados en esta categoría.';
      container.replaceChildren(empty);
    } else {
      const orderedCategories = [...cardsByCategory.keys()].sort((a, b) => {
        const indexA = placeCategoryOrder.indexOf(a);
        const indexB = placeCategoryOrder.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
      container.replaceChildren(...orderedCategories.map((categoria) => (
        createPlaceCategoryGroup(categoria, cardsByCategory.get(categoria))
      )));
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
    if (animal.foto_url) {
      const image = document.createElement('img');
      image.src = animal.foto_url;
      image.alt = `Foto de perfil de ${animal.nombre}`;
      image.loading = 'lazy';
      avatar.append(image);
    } else {
      avatar.textContent = animal.nombre.slice(0, 1).toUpperCase();
    }
    const title = document.createElement('h3');
    title.textContent = animal.nombre;
    const bio = document.createElement('p');
    bio.textContent = animal.biografia || 'Perfil comunitario en construcción.';
    const meta = document.createElement('div');
    meta.className = 'animal-meta';
    [animal.especie, animal.zona_publica, animal.es_comunitario ? 'comunitario' : null, animal.es_conmemorativa ? 'conmemorativa' : null].filter(Boolean).forEach((value) => {
      const tag = document.createElement('span');
      if (value === 'conmemorativa') tag.className = 'is-memorial';
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
    const profileButton = document.createElement('button');
    profileButton.type = 'button';
    profileButton.className = 'animal-profile-link';
    profileButton.dataset.openPublicPetProfile = animal.id;
    profileButton.textContent = `Conocer a ${animal.nombre} →`;
    article.append(profileButton);
    return article;
  };

  async function loadAnimalNetwork() {
    const container = document.querySelector('[data-animal-grid]');
    const [animalsResult, profilesResult, humanResult, animalLinksResult, countResult] = await Promise.all([
      db.from('animales').select('id,slug,nombre,especie,biografia,foto_url,zona_publica,es_comunitario,estado,estado_seguridad,raza,tamano,peso_kg,fecha_nacimiento,sexo,color_pelaje,estado_registro,habilidades,caracter_puntaje,diagnostico_nutricional,bloques_resumen,es_conmemorativa,fecha_deceso').eq('estado', 'publicado').eq('mostrar_en_red', true).order('nombre'),
      db.from('perfiles_publicos').select('id,alias,biografia,estado').eq('estado', 'publicado'),
      db.from('vinculos_animal_humano').select('id,animal_id,perfil_publico_id,tipo,visible_publicamente,estado').eq('estado', 'confirmado').eq('visible_publicamente', true),
      db.from('vinculos_animales').select('id,animal_a_id,animal_b_id,tipo,descripcion,estado').eq('estado', 'confirmado'),
      db.rpc('conteo_red_animal'),
    ]);
    publicAnimals = animalsResult.error ? [] : (animalsResult.data || []);
    const profiles = profilesResult.error ? [] : (profilesResult.data || []);
    const humanLinks = humanResult.error ? [] : (humanResult.data || []);
    const animalLinks = animalLinksResult.error ? [] : (animalLinksResult.data || []);
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const animalsById = new Map(publicAnimals.map((animal) => [animal.id, animal]));
    const networkSummary = document.querySelector('[data-animal-network-summary]');
    const counts = countResult.error ? null : countResult.data?.[0];
    if (networkSummary) networkSummary.textContent = counts
      ? `${Number(counts.total_registradas).toLocaleString('es-CL')} ${Number(counts.total_registradas) === 1 ? 'mascota registrada' : 'mascotas registradas'} · ${Number(counts.perfiles_visibles).toLocaleString('es-CL')} ${Number(counts.perfiles_visibles) === 1 ? 'perfil visible' : 'perfiles visibles'}`
      : `${publicAnimals.length.toLocaleString('es-CL')} ${publicAnimals.length === 1 ? 'perfil visible' : 'perfiles visibles'}`;
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
      if (animal.es_conmemorativa) {
        state.className = 'pet-state is-conmemorativa';
        state.textContent = 'Conmemorativa';
      } else {
        state.className = `pet-state is-${animal.estado_seguridad}`;
        state.textContent = animal.estado_seguridad === 'extraviada' ? 'Extraviada' : 'Segura';
      }
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'pet-state-action';
      if (animal.es_conmemorativa) {
        action.disabled = true;
        action.textContent = 'Ficha conmemorativa';
      } else if (!['pendiente', 'publicado'].includes(animal.estado)) {
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
  const uploadMimeByExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  const getUploadImageType = (file) => {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type === 'image/jpg') return 'image/jpeg';
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file.type;
    return uploadMimeByExtension[extension] || '';
  };

  const initializeBirthSelectors = () => {
    const form = document.querySelector('[data-pet-profile-form]');
    if (!form) return;
    const day = form.elements.nacimiento_dia;
    const year = form.elements.nacimiento_ano;
    if (day.options.length === 1) {
      for (let value = 1; value <= 31; value += 1) day.add(new Option(String(value), String(value).padStart(2, '0')));
    }
    if (year.options.length === 1) {
      const currentYear = new Date().getFullYear();
      for (let value = currentYear; value >= currentYear - 40; value -= 1) year.add(new Option(String(value), String(value)));
    }
  };
  initializeBirthSelectors();

  const syncCommemorativeFields = (form) => {
    if (!form) return;
    const enabled = Boolean(form.elements.es_conmemorativa?.checked);
    const dateField = form.querySelector('[data-deceso-field]');
    const dateInput = form.elements.fecha_deceso;
    if (dateField) dateField.hidden = !enabled;
    if (dateInput) {
      dateInput.required = enabled;
      dateInput.max = new Date().toISOString().slice(0, 10);
      if (!enabled) dateInput.value = '';
    }
  };

  document.querySelectorAll('[data-conmemorativa-toggle]').forEach((input) => {
    input.addEventListener('change', () => syncCommemorativeFields(input.form));
    syncCommemorativeFields(input.form);
  });

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

  const clearAvatarObjectUrls = () => {
    avatarObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    avatarObjectUrls = [];
  };

  const updateAvatarCropPreview = () => {
    const form = document.querySelector('[data-pet-profile-form]');
    const frame = document.querySelector('[data-pet-avatar-crop]');
    const image = document.querySelector('[data-pet-avatar-image]');
    if (!form || !frame || !image?.naturalWidth) return;
    const size = frame.clientWidth;
    const zoom = Number(form.elements.avatar_zoom.value || 1);
    const x = Number(form.elements.avatar_x.value || 0) / 100;
    const y = Number(form.elements.avatar_y.value || 0) / 100;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    image.style.left = `${(size - width) / 2 - x * Math.max(0, width - size) / 2}px`;
    image.style.top = `${(size - height) / 2 - y * Math.max(0, height - size) / 2}px`;
  };

  const selectAvatarSource = (source, button = null) => {
    const workspace = document.querySelector('[data-pet-avatar-workspace]');
    const image = document.querySelector('[data-pet-avatar-image]');
    if (!workspace || !image || !source) return;
    avatarCropSource = source;
    workspace.hidden = false;
    document.querySelectorAll('[data-avatar-source]').forEach((item) => item.classList.toggle('is-selected', item === button));
    image.crossOrigin = source.startsWith('blob:') ? '' : 'anonymous';
    image.onload = updateAvatarCropPreview;
    image.src = source;
  };

  const renderAvatarChoices = (animal, addedFiles = []) => {
    const choices = document.querySelector('[data-pet-avatar-choices]');
    if (!choices) return;
    clearAvatarObjectUrls();
    const existing = Array.isArray(animal._photo_view_urls) ? animal._photo_view_urls.filter(Boolean) : [];
    if (animal.foto_url && !existing.includes(animal.foto_url)) existing.unshift(animal.foto_url);
    const added = addedFiles.map((file) => {
      const url = URL.createObjectURL(file);
      avatarObjectUrls.push(url);
      return url;
    });
    const sources = [...existing, ...added];
    if (!sources.length) {
      choices.innerHTML = '<p class="empty-state">Agrega una foto para crear la imagen de perfil.</p>';
      document.querySelector('[data-pet-avatar-workspace]').hidden = true;
      avatarCropSource = '';
      return;
    }
    choices.replaceChildren(...sources.map((source, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pet-avatar-choice';
      button.dataset.avatarSource = source;
      button.setAttribute('aria-label', `Usar foto ${index + 1} como perfil`);
      const image = document.createElement('img');
      image.src = source;
      image.alt = '';
      button.append(image);
      button.addEventListener('click', () => selectAvatarSource(source, button));
      return button;
    }));
    const preferredIndex = animal.foto_url && existing.length ? 0 : 0;
    const preferred = choices.children[preferredIndex];
    selectAvatarSource(sources[preferredIndex], preferred);
  };

  const createCroppedAvatarBlob = () => new Promise((resolve, reject) => {
    const form = document.querySelector('[data-pet-profile-form]');
    const image = document.querySelector('[data-pet-avatar-image]');
    if (!avatarCropSource || !image?.naturalWidth) return resolve(null);
    const size = 512;
    const zoom = Number(form.elements.avatar_zoom.value || 1);
    const x = Number(form.elements.avatar_x.value || 0) / 100;
    const y = Number(form.elements.avatar_y.value || 0) / 100;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const left = (size - width) / 2 - x * Math.max(0, width - size) / 2;
    const top = (size - height) / 2 - y * Math.max(0, height - size) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.drawImage(image, left, top, width, height);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo generar el recorte.')), 'image/webp', 0.88);
  });

  const prepareOwnAnimalPhotos = async (animals) => Promise.all(animals.map(async (animal) => {
    const paths = Array.isArray(animal.foto_urls) ? animal.foto_urls.filter(Boolean) : [];
    const urls = await Promise.all(paths.map(async (path) => {
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error } = await db.storage.from('mascotas').createSignedUrl(path, 3600);
      return error ? null : data.signedUrl;
    }));
    return { ...animal, _photo_view_urls: urls.filter(Boolean) };
  }));

  const characterSummary = (score) => {
    if (score === null || score === undefined || score === '' || !Number.isFinite(Number(score))) return 'Sin evaluar';
    const value = Number(score);
    return value < 25 ? 'Bravo / muy reactivo' : value < 50 ? 'Cauteloso' : value < 75 ? 'Equilibrado' : 'Manso / confiado';
  };

  const petSummaryValue = (animal, key) => ({
    especie: petValue(animal.especie), raza: petValue(animal.raza), tamano: petSizeLabels[animal.tamano] || 'Sin informar',
    peso: animal.peso_kg ? `${Number(animal.peso_kg).toLocaleString('es-CL')} kg` : 'Sin informar', sexo: petValue(animal.sexo),
    nacimiento: animal.fecha_nacimiento ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(`${animal.fecha_nacimiento}T12:00:00`)) : 'Sin informar',
    color: petValue(animal.color_pelaje), registro: petRegistryLabels[animal.estado_registro] || 'Sin informar',
    caracter: characterSummary(animal.caracter_puntaje), diagnostico_nutricional: animal.diagnostico_nutricional || 'Sin informar',
    habilidades: `${Array.isArray(animal.habilidades) ? animal.habilidades.length : 0} registradas`,
    estado_seguridad: animal.es_conmemorativa ? 'Conmemorativa' : (animal.estado_seguridad === 'extraviada' ? 'Extraviada' : 'Segura'),
  }[key] || 'Sin informar');

  const renderPetSummarySlots = (form, selected = defaultPetSummaryBlocks) => {
    const container = form.querySelector('[data-pet-summary-slots]');
    if (!container) return;
    const values = [...new Set(Array.isArray(selected) ? selected.filter((key) => petSummaryLabels[key]) : [])].slice(0, 8);
    while (values.length < 8) values.push(defaultPetSummaryBlocks.find((key) => !values.includes(key)) || '');
    container.innerHTML = values.map((value, index) => `<label><span>Bloque ${index + 1}</span><select name="bloque_resumen_${index + 1}">${Object.entries(petSummaryLabels).map(([key, label]) => `<option value="${key}"${key === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`).join('');
  };

  const showPetProfile = (animal) => {
    const dialog = document.querySelector('[data-pet-profile-dialog]');
    const view = document.querySelector('[data-pet-profile-view]');
    const form = document.querySelector('[data-pet-profile-form]');
    if (!dialog || !view || !form) return;
    activePetProfile = animal;
    form.hidden = true;
    view.hidden = false;
    const isOwned = ownAnimals.some((item) => item.id === animal.id);
    const health = animal.salud && typeof animal.salud === 'object' ? animal.salud : {};
    const skills = Array.isArray(animal.habilidades) ? animal.habilidades.filter((skill) => petSkillLabels[skill]) : [];
    const characterScore = animal.caracter_puntaje === null || animal.caracter_puntaje === undefined || animal.caracter_puntaje === '' ? null : Number(animal.caracter_puntaje);
    const characterLabel = characterSummary(characterScore);
    const summaryBlocks = [...new Set(Array.isArray(animal.bloques_resumen) ? animal.bloques_resumen.filter((key) => petSummaryLabels[key]) : defaultPetSummaryBlocks)].slice(0, 8);
    const deathLabel = animal.fecha_deceso
      ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(`${animal.fecha_deceso}T12:00:00`))
      : '';
    view.innerHTML = `
      <div class="pet-profile-hero">
        <div class="pet-profile-gallery" data-pet-profile-gallery></div>
        <div><p class="kicker">${animal.es_conmemorativa ? 'Ficha conmemorativa' : 'Ficha de mascota'}</p><h3 id="pet-profile-title">${escapeHtml(animal.nombre)}</h3><p>${escapeHtml(animal.biografia || 'Aún no tiene una descripción.')}</p>${animal.es_conmemorativa && deathLabel ? `<p class="pet-memorial-note">In memoriam · deceso aproximado: ${escapeHtml(deathLabel)}</p>` : ''}</div>
      </div>
      <div class="pet-section-heading pet-summary-heading"><h4>Resumen</h4>${isOwned ? '<button class="section-edit-button" type="button" data-edit-pet-section="perfil">Editar</button>' : ''}</div>
      <dl class="pet-profile-facts">${summaryBlocks.map((key) => `<div><dt>${escapeHtml(petSummaryLabels[key])}</dt><dd>${escapeHtml(petSummaryValue(animal, key))}</dd></div>`).join('')}</dl>
      ${isOwned && animal.numero_registro ? `<p class="pet-private-detail"><strong>N.º de registro:</strong> ${escapeHtml(animal.numero_registro)}</p>` : ''}
      ${animal.senas_particulares ? `<div class="pet-profile-notes"><strong>Señas particulares</strong><p>${escapeHtml(animal.senas_particulares)}</p></div>` : ''}
      <div class="pet-profile-sections">
        ${isOwned ? `<section class="pet-profile-section is-private"><div class="pet-section-heading"><div><h4>Ficha de salud</h4><span class="privacy-badge">Privada</span></div><button class="section-edit-button" type="button" data-edit-pet-section="salud">Editar</button></div><dl class="pet-health-summary">
          <div><dt>Antropometría</dt><dd>${animal.peso_kg ? `${Number(animal.peso_kg).toLocaleString('es-CL')} kg` : 'Peso sin registrar'}${health.altura_cm ? ` · ${escapeHtml(health.altura_cm)} cm` : ''}${health.condicion_corporal ? ` · condición corporal ${escapeHtml(health.condicion_corporal)}/9` : ''}</dd></div>
          <div><dt>Diagnóstico nutricional</dt><dd>${escapeHtml(animal.diagnostico_nutricional || 'Sin diagnóstico registrado')}</dd></div>
          <div><dt>Vacunación</dt><dd>${escapeHtml(health.vacunacion || 'Sin antecedentes registrados')}</dd></div>
          <div><dt>Antecedentes mórbidos</dt><dd>${escapeHtml(health.antecedentes_morbidos || 'Sin antecedentes registrados')}</dd></div>
          <div><dt>Antecedentes familiares</dt><dd>${escapeHtml(health.antecedentes_familiares || 'Sin antecedentes registrados')}</dd></div>
          <div><dt>Antecedentes quirúrgicos</dt><dd>${escapeHtml(health.antecedentes_quirurgicos || 'Sin antecedentes registrados')}</dd></div>
          <div><dt>Alergias</dt><dd>${escapeHtml(health.alergias || 'Sin alergias registradas')}</dd></div>
        </dl><p class="pet-health-note">Información orientativa; no reemplaza la ficha veterinaria.</p></section>` : ''}
        <section class="pet-profile-section"><div class="pet-section-heading"><h4>Vínculos</h4>${isOwned ? '<button class="section-edit-button" type="button" data-edit-pet-section="vinculos">Editar</button>' : ''}</div><div class="pet-connections" data-pet-connections><p class="empty-state">Consultando vínculos confirmados…</p></div></section>
        <section class="pet-profile-section"><div class="pet-section-heading"><div><h4>Árbol de habilidades</h4><span>${skills.length} logradas</span></div>${isOwned ? '<button class="section-edit-button" type="button" data-edit-pet-section="habilidades">Editar</button>' : ''}</div>${skills.length ? `<div class="pet-skill-display">${skills.map((skill) => `<span>${escapeHtml(petSkillLabels[skill])}</span>`).join('')}</div>` : '<p class="empty-state">Todavía no tiene habilidades registradas.</p>'}</section>
        <section class="pet-profile-section"><div class="pet-section-heading"><div><h4>Carácter</h4><strong>${escapeHtml(characterLabel)}</strong></div>${isOwned ? '<button class="section-edit-button" type="button" data-edit-pet-section="caracter">Editar</button>' : ''}</div><div class="pet-character-meter" style="--character-score:${characterScore ?? 50}%"><span></span></div><div class="pet-character-scale"><small>Bravo / reactivo</small><b>${characterScore === null ? 'Sin cuestionario' : `${characterScore}%`}</b><small>Manso / confiado</small></div><p class="pet-health-note">Indicador orientativo basado en conducta habitual; no garantiza cómo reaccionará en una situación nueva.</p></section>
      </div>
      ${createProfileReportMarkup('animal', animal.id)}
      `;
    renderPetPhotos(view.querySelector('[data-pet-profile-gallery]'), animal);
    loadPetConnections(animal.id, view.querySelector('[data-pet-connections]'));
    bindProfileReportForm(view);
    if (!dialog.open) dialog.showModal();
  };

  const createProfileReportMarkup = (tipo, id) => `
    <section class="profile-report" data-profile-report>
      <button class="text-button profile-report-toggle" type="button" data-open-profile-report>Reportar este perfil</button>
      <form class="profile-report-form" data-profile-report-form hidden>
        <input type="hidden" name="objetivo_tipo" value="${escapeHtml(tipo)}">
        <input type="hidden" name="objetivo_id" value="${escapeHtml(id)}">
        <label class="field"><span>¿Por qué reportas este perfil?</span><textarea name="motivo" required minlength="10" maxlength="400" rows="3" placeholder="Describe el problema en pocas líneas."></textarea></label>
        <div class="profile-report-actions">
          <button class="button button-dark" type="submit">Enviar reporte</button>
          <button class="text-button" type="button" data-cancel-profile-report>Cancelar</button>
        </div>
        <p class="form-message" data-profile-report-message aria-live="polite"></p>
        <p class="pet-health-note">${currentSession?.user ? 'Podrás seguir el estado de este reporte en “Mis reportes”.' : 'Puedes reportar sin cuenta. Si inicias sesión antes de enviar, recibirás seguimiento del caso.'}</p>
      </form>
    </section>
  `;

  const bindProfileReportForm = (root) => {
    const section = root.querySelector('[data-profile-report]');
    if (!section) return;
    const form = section.querySelector('[data-profile-report-form]');
    const message = section.querySelector('[data-profile-report-message]');
    section.querySelector('[data-open-profile-report]')?.addEventListener('click', () => {
      form.hidden = false;
      form.elements.motivo.focus();
    });
    section.querySelector('[data-cancel-profile-report]')?.addEventListener('click', () => {
      form.hidden = true;
      form.reset();
      setMessage(message);
    });
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      const { error } = await db.rpc('crear_reporte_red', {
        p_objetivo_tipo: form.elements.objetivo_tipo.value,
        p_objetivo_id: form.elements.objetivo_id.value,
        p_motivo: form.elements.motivo.value.trim(),
      });
      submit.disabled = false;
      if (error) {
        setMessage(message, /10 y 400/.test(error.message || '') ? 'El motivo debe tener entre 10 y 400 caracteres.' : 'No pudimos enviar el reporte.', 'error');
        return;
      }
      form.reset();
      form.hidden = true;
      setMessage(message, currentSession?.user
        ? 'Reporte enviado. Ya puedes seguirlo en “Mis reportes”.'
        : 'Reporte enviado. Quedará privado hasta su revisión.', 'success');
      if (currentSession?.user) await loadMyReports();
      if (currentUserIsModerator) await loadNetworkModeration();
    });
  };

  const showHumanProfile = (profile) => {
    const dialog = document.querySelector('[data-human-profile-dialog]');
    const view = document.querySelector('[data-human-profile-view]');
    if (!dialog || !view || !profile) return;
    view.innerHTML = `
      <p class="kicker">Perfil público</p>
      <h3 id="human-profile-title">${escapeHtml(profile.alias)}</h3>
      <p>${escapeHtml(profile.biografia || 'Esta persona todavía no escribió una presentación.')}</p>
      ${createProfileReportMarkup('perfil_publico', profile.id)}
    `;
    bindProfileReportForm(view);
    if (!dialog.open) dialog.showModal();
  };

  const loadPetConnections = async (animalId, container) => {
    if (!container) return;
    const [animalLinksResult, humanLinksResult, animalsResult, profilesResult] = await Promise.all([
      db.from('vinculos_animales').select('animal_a_id,animal_b_id,tipo,descripcion').eq('estado', 'confirmado').or(`animal_a_id.eq.${animalId},animal_b_id.eq.${animalId}`),
      db.from('vinculos_animal_humano').select('perfil_publico_id,tipo').eq('animal_id', animalId).eq('estado', 'confirmado').eq('visible_publicamente', true),
      db.from('animales').select('id,nombre,es_comunitario').eq('estado', 'publicado'),
      db.from('perfiles_publicos').select('id,alias,biografia').eq('estado', 'publicado'),
    ]);
    const animals = new Map((animalsResult.data || []).map((item) => [item.id, item]));
    const profiles = new Map((profilesResult.data || []).map((item) => [item.id, item]));
    const links = [];
    (animalLinksResult.data || []).forEach((link) => {
      const other = animals.get(link.animal_a_id === animalId ? link.animal_b_id : link.animal_a_id);
      if (other) links.push(`<article class="pet-connection-card"><span>${other.es_comunitario ? 'Animal comunitario' : 'Mascota'}</span><strong>${escapeHtml(other.nombre)}</strong><small>${escapeHtml(link.tipo)}${link.descripcion ? ` · ${escapeHtml(link.descripcion)}` : ''}</small></article>`);
    });
    (humanLinksResult.data || []).forEach((link) => {
      const profile = profiles.get(link.perfil_publico_id);
      if (profile) {
        links.push(`<article class="pet-connection-card"><span>Persona</span><button class="text-button" type="button" data-open-human-profile="${escapeHtml(profile.id)}"><strong>${escapeHtml(profile.alias)}</strong></button><small>${escapeHtml(link.tipo)}</small></article>`);
      }
    });
    container.innerHTML = links.length ? links.join('') : '<p class="empty-state">Todavía no tiene vínculos públicos confirmados.</p>';
    container.querySelectorAll('[data-open-human-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        const profile = profiles.get(button.dataset.openHumanProfile);
        if (profile) showHumanProfile(profile);
      });
    });
  };

  const startPetProfileEdit = (section = 'perfil') => {
    const animal = activePetProfile;
    const view = document.querySelector('[data-pet-profile-view]');
    const form = document.querySelector('[data-pet-profile-form]');
    if (!animal || !form) return;
    activePetEditSection = section;
    view.hidden = true;
    form.hidden = false;
    form.querySelector('[data-pet-edit-title]').textContent = ({ perfil: 'Datos y resumen', salud: 'Ficha de salud', habilidades: 'Árbol de habilidades', caracter: 'Indicador de carácter' })[section] || 'Datos de la mascota';
    form.querySelectorAll('[data-pet-edit-group]').forEach((group) => { group.hidden = group.dataset.petEditGroup !== section; });
    const saveButton = form.querySelector('[data-pet-profile-save]');
    if (saveButton) saveButton.textContent = `Guardar ${section === 'perfil' ? 'datos y bloques' : section}`;
    ['nombre', 'especie', 'raza', 'tamano', 'sexo', 'color_pelaje', 'estado_registro', 'numero_registro', 'biografia', 'senas_particulares'].forEach((field) => {
      if (form.elements[field]) form.elements[field].value = animal[field] || (field === 'estado_registro' ? 'no_informado' : '');
    });
    const birthParts = animal.fecha_nacimiento?.split('-') || [];
    form.elements.nacimiento_ano.value = birthParts[0] || '';
    form.elements.nacimiento_mes.value = birthParts[1] || '';
    form.elements.nacimiento_dia.value = birthParts[2] || '';
    form.elements.peso_kg.value = animal.peso_kg || '';
    form.elements.mostrar_en_red.checked = animal.mostrar_en_red !== false;
    if (form.elements.es_conmemorativa) form.elements.es_conmemorativa.checked = Boolean(animal.es_conmemorativa);
    if (form.elements.fecha_deceso) form.elements.fecha_deceso.value = animal.fecha_deceso || '';
    syncCommemorativeFields(form);
    const health = animal.salud && typeof animal.salud === 'object' ? animal.salud : {};
    ['altura_cm', 'condicion_corporal', 'vacunacion', 'antecedentes_morbidos', 'antecedentes_familiares', 'antecedentes_quirurgicos', 'alergias'].forEach((field) => { form.elements[field].value = health[field] || ''; });
    form.elements.diagnostico_nutricional.value = animal.diagnostico_nutricional || '';
    renderPetSummarySlots(form, animal.bloques_resumen);
    const skills = new Set(Array.isArray(animal.habilidades) ? animal.habilidades : []);
    form.querySelectorAll('input[name="habilidades"]').forEach((input) => { input.checked = skills.has(input.value); });
    const answers = animal.caracter_respuestas && typeof animal.caracter_respuestas === 'object' ? animal.caracter_respuestas : {};
    characterKeys.forEach((key) => { form.elements[`caracter_${key}`].value = answers[key] || ''; });
    updateCharacterPreview();
    form.elements.fotos.value = '';
    renderPetPhotos(document.querySelector('[data-pet-photo-preview]'), animal, true);
    form.elements.avatar_zoom.value = '1';
    form.elements.avatar_x.value = '0';
    form.elements.avatar_y.value = '0';
    renderAvatarChoices(animal);
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
      const linkSection = document.querySelector('[data-link-requests-section]');
      if (linkSection) linkSection.hidden = true;
      return;
    }
    const [animalsResult, profileResult] = await Promise.all([db.rpc('mis_animales'), db.rpc('mi_perfil_publico')]);
    ownAnimals = animalsResult.error ? [] : await prepareOwnAnimalPhotos(animalsResult.data || []);
    ownPublicProfile = profileResult.error ? null : (profileResult.data?.[0] || null);
    renderAccountAnimals();
    document.querySelectorAll('[data-own-animal-options]').forEach((select) => fillSelect(select, ownAnimals, ownAnimals.length ? 'Selecciona uno de tus animales' : 'Primero agrega un animal'));
    document.querySelectorAll('[data-link-animal-options]').forEach((select) => {
      fillSelect(select, publicAnimals, publicAnimals.length ? 'Selecciona un animal de la red' : 'Aún no hay animales publicados');
      select.disabled = !publicAnimals.length;
    });
    document.querySelectorAll('[data-connect-animal-options]').forEach((select) => {
      const candidates = publicAnimals.filter((animal) => !ownAnimals.some((own) => own.id === animal.id));
      fillSelect(select, candidates, candidates.length ? 'Selecciona una mascota' : 'No hay otras fichas disponibles');
      select.disabled = !candidates.length;
    });
    const profileForm = document.querySelector('[data-profile-form]');
    if (profileForm && ownPublicProfile) {
      profileForm.elements.alias.value = ownPublicProfile.alias;
      if (profileForm.elements.biografia) profileForm.elements.biografia.value = ownPublicProfile.biografia || '';
      profileForm.querySelector('button[type="submit"]').disabled = false;
      profileForm.querySelector('button[type="submit"]').textContent = 'Actualizar alias';
      setMessage(document.querySelector('[data-profile-message]'), 'Tu alias ya está publicado en la red.', 'success');
    } else if (profileForm) {
      profileForm.querySelector('button[type="submit"]').disabled = false;
      profileForm.querySelector('button[type="submit"]').textContent = 'Publicar alias';
    }
    await loadLinkRequests();
  };

  const createLinkRequestItem = (kind, row, description) => {
    const article = document.createElement('article');
    article.className = 'moderation-item';
    const title = document.createElement('strong');
    title.textContent = row.alias || row.nombre || 'Solicitud de vínculo';
    const detail = document.createElement('p');
    detail.textContent = description;
    const actions = document.createElement('div');
    actions.className = 'moderation-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Autorizar';
    approve.dataset.linkTable = kind;
    approve.dataset.linkId = row.id;
    approve.dataset.linkDecision = 'confirmado';
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Rechazar';
    reject.dataset.linkTable = kind;
    reject.dataset.linkId = row.id;
    reject.dataset.linkDecision = 'rechazado';
    actions.append(approve, reject);
    article.append(title, detail, actions);
    return article;
  };

  async function loadLinkRequests() {
    const section = document.querySelector('[data-link-requests-section]');
    const container = document.querySelector('[data-link-requests-list]');
    if (!section || !container) return;
    if (!currentSession?.user || !ownAnimals.length) {
      section.hidden = true;
      return;
    }
    const ownIds = ownAnimals.map((animal) => animal.id);
    const [humanResult, animalResult, profilesResult, animalsResult] = await Promise.all([
      db.from('vinculos_animal_humano').select('id,animal_id,perfil_publico_id,tipo,estado').eq('estado', 'pendiente').in('animal_id', ownIds),
      db.from('vinculos_animales').select('id,animal_a_id,animal_b_id,tipo,descripcion,estado').eq('estado', 'pendiente').in('animal_b_id', ownIds),
      db.from('perfiles_publicos').select('id,alias').eq('estado', 'publicado'),
      db.from('animales').select('id,nombre').eq('estado', 'publicado'),
    ]);
    const profilesById = new Map((profilesResult.data || []).map((row) => [row.id, row]));
    const animalsById = new Map((animalsResult.data || []).map((row) => [row.id, row]));
    const items = [
      ...(humanResult.data || []).map((row) => {
        const profile = profilesById.get(row.perfil_publico_id);
        const animal = animalsById.get(row.animal_id);
        return createLinkRequestItem(
          'vinculos_animal_humano',
          { ...row, alias: profile?.alias || 'Persona' },
          `Quiere vincularse como ${row.tipo} con ${animal?.nombre || 'tu mascota'}.`,
        );
      }),
      ...(animalResult.data || []).map((row) => {
        const fromAnimal = animalsById.get(row.animal_a_id);
        const toAnimal = animalsById.get(row.animal_b_id);
        return createLinkRequestItem(
          'vinculos_animales',
          { ...row, nombre: fromAnimal?.nombre || 'Mascota' },
          `Solicita vínculo “${row.tipo}” con ${toAnimal?.nombre || 'tu mascota'}${row.descripcion ? ` · ${row.descripcion}` : ''}.`,
        );
      }),
    ];
    section.hidden = !items.length;
    document.querySelector('[data-link-requests-count]').textContent = String(items.length);
    if (!items.length) {
      container.replaceChildren();
      return;
    }
    container.replaceChildren(...items);
  }

  async function loadNetworkModeration() {
    const panel = document.querySelector('[data-moderator-network]');
    if (!panel) return;
    panel.hidden = !currentUserIsModerator;
    if (!currentUserIsModerator) return;
    const { data, error } = await db.from('reportes_red')
      .select('id,objetivo_tipo,animal_id,perfil_publico_id,motivo,estado,nota_moderacion,creado_en')
      .order('creado_en', { ascending: false })
      .limit(50);
    const reports = error ? [] : (data || []);
    const animalIds = [...new Set(reports.map((row) => row.animal_id).filter(Boolean))];
    const profileIds = [...new Set(reports.map((row) => row.perfil_publico_id).filter(Boolean))];
    const [animalsResult, profilesResult] = await Promise.all([
      animalIds.length ? db.from('animales').select('id,nombre').in('id', animalIds) : Promise.resolve({ data: [] }),
      profileIds.length ? db.from('perfiles_publicos').select('id,alias').in('id', profileIds) : Promise.resolve({ data: [] }),
    ]);
    const animalsById = new Map((animalsResult.data || []).map((row) => [row.id, row]));
    const profilesById = new Map((profilesResult.data || []).map((row) => [row.id, row]));
    document.querySelector('[data-network-moderator-count]').textContent = String(reports.filter((row) => row.estado === 'pendiente').length);
    const container = document.querySelector('[data-network-moderation]');
    if (!reports.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = error ? 'No pudimos cargar los reportes de perfiles.' : 'No hay reportes de perfiles por revisar.';
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...reports.map((report) => {
      const article = document.createElement('article');
      article.className = 'moderation-item';
      const target = report.objetivo_tipo === 'animal'
        ? `Mascota · ${animalsById.get(report.animal_id)?.nombre || 'ficha'}`
        : `Persona · ${profilesById.get(report.perfil_publico_id)?.alias || 'alias'}`;
      const title = document.createElement('strong');
      title.textContent = target;
      const status = document.createElement('span');
      status.className = 'status-badge';
      status.dataset.status = report.estado;
      status.textContent = statusLabels[report.estado] || report.estado;
      const detail = document.createElement('p');
      detail.textContent = report.motivo;
      const meta = document.createElement('p');
      meta.textContent = `Enviado: ${dateFormatter.format(new Date(report.creado_en))}${report.nota_moderacion ? ` · Nota: ${report.nota_moderacion}` : ''}`;
      article.append(title, status, detail, meta);
      const actions = document.createElement('div');
      actions.className = 'moderation-actions';
      ['revisado', 'accion_tomada', 'descartado'].forEach((nextStatus) => {
        if (nextStatus === report.estado) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.profileReportId = report.id;
        button.dataset.profileReportStatus = nextStatus;
        button.textContent = `Marcar ${statusLabels[nextStatus].toLowerCase()}`;
        actions.append(button);
      });
      const note = document.createElement('label');
      note.className = 'field';
      const noteLabel = document.createElement('span');
      noteLabel.textContent = 'Nota de seguimiento (opcional)';
      const noteInput = document.createElement('input');
      noteInput.name = 'nota_moderacion';
      noteInput.maxLength = 400;
      noteInput.placeholder = 'Se mostrará a quien reportó con cuenta';
      noteInput.value = report.nota_moderacion || '';
      noteInput.dataset.profileReportNoteFor = report.id;
      note.append(noteLabel, noteInput);
      article.append(actions, note);
      return article;
    }));
  }

  async function loadPlaceProposals() {
    const panel = document.querySelector('[data-moderator-place]');
    const container = document.querySelector('[data-place-proposal-list]');
    if (!panel || !container) return;
    panel.hidden = !currentUserIsModerator;
    if (!currentUserIsModerator) return;
    const { data, error } = await db.from('propuestas_lugares').select('id,tipo,lugar_id,datos_propuestos,motivo,creado_en').eq('estado', 'pendiente').order('creado_en');
    const rows = error ? [] : (data || []);
    document.querySelector('[data-place-proposal-count]').textContent = String(rows.length);
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = error ? 'No pudimos cargar las propuestas.' : 'No hay propuestas pendientes.'; container.replaceChildren(empty); return;
    }
    container.replaceChildren(...rows.map((row) => {
      const article = document.createElement('article'); article.className = 'moderation-item';
      const title = document.createElement('strong'); title.textContent = row.datos_propuestos?.nombre || 'Lugar sin nombre';
      const detail = document.createElement('p'); detail.textContent = `${row.tipo} · ${placeCategoryLabels[row.datos_propuestos?.categoria] || row.datos_propuestos?.categoria || 'sin categoría'} · ${row.motivo}`;
      const actions = document.createElement('div'); actions.className = 'moderation-actions';
      ['aprobar','rechazar'].forEach((decision) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = decision === 'aprobar' ? 'Aprobar y publicar' : 'Rechazar'; button.dataset.placeProposalId = row.id; button.dataset.placeProposalDecision = decision; actions.append(button); });
      article.append(title, detail, actions); return article;
    }));
  }

  const createReportCard = (report, moderation = false) => {
    const article = document.createElement('article');
    article.className = 'report-item';
    const top = document.createElement('div');
    top.className = 'report-item-top';
    const category = document.createElement('strong');
    category.className = 'report-category';
    const sourceLabel = report._source === 'red'
      ? (report.objetivo_tipo === 'animal' ? 'Perfil de mascota' : 'Perfil de persona')
      : (categoryLabels[report.categoria] || report.categoria);
    category.textContent = sourceLabel;
    const status = document.createElement('span');
    status.className = 'status-badge';
    status.dataset.status = report.estado;
    status.textContent = statusLabels[report.estado] || report.estado;
    top.append(category, status);
    const description = document.createElement('p');
    description.className = 'report-description';
    description.textContent = report.descripcion || report.motivo || '';
    const meta = document.createElement('p');
    meta.className = 'report-meta';
    if (report._source === 'red') {
      meta.textContent = `Enviado: ${dateFormatter.format(new Date(report.creado_en))}${report.nota_moderacion ? ` · Respuesta: ${report.nota_moderacion}` : ''}`;
    } else {
      meta.textContent = `Observado: ${dateFormatter.format(new Date(report.observado_en))}`;
    }
    article.append(top, description, meta);
    if (report.nota_resolucion) {
      const resolution = document.createElement('p');
      resolution.className = 'report-resolution';
      const label = document.createElement('strong');
      label.textContent = 'Qué se hizo: ';
      resolution.append(label, document.createTextNode(report.nota_resolucion));
      article.append(resolution);
    }

    if (moderation && report._source !== 'red') {
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
      .select('id,categoria,descripcion,observado_en,estado,creado_en,nota_resolucion')
      .in('estado', ['verificado', 'cerrado']).order('observado_en', { ascending: false }).limit(12);
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar los reportes en este momento.' : 'Aún no hay reportes verificados.');
  }

  async function loadReportStats() {
    const reported = document.querySelector('[data-stat-reportados]');
    const resolved = document.querySelector('[data-stat-resueltos]');
    const days = document.querySelector('[data-stat-dias]');
    const recurrence = document.querySelector('[data-report-recurrence]');
    const formatNumber = (value) => Number(value || 0).toLocaleString('es-CL');
    const [statsResult, recurrenceResult] = await Promise.all([
      db.rpc('estadisticas_reportes'),
      db.rpc('recurrencia_categoria_reportes'),
    ]);
    const stats = statsResult.error ? null : (statsResult.data?.[0] || null);
    if (reported) reported.textContent = stats ? formatNumber(stats.total_reportados) : '—';
    if (resolved) resolved.textContent = stats ? formatNumber(stats.total_resueltos) : '—';
    if (days) days.textContent = stats ? String(stats.dias_promedio_resolucion ?? 0) : '—';
    if (!recurrence) return;
    const rows = recurrenceResult.error ? [] : (recurrenceResult.data || []).slice(0, 4);
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = recurrenceResult.error ? 'No pudimos cargar lo más reportado.' : 'Aún no hay categorías con reportes publicados.';
      recurrence.replaceChildren(empty);
      return;
    }
    recurrence.replaceChildren(...rows.map((row) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = categoryLabels[row.categoria] || row.categoria;
      const total = document.createElement('strong');
      total.textContent = `${formatNumber(row.total)} ${Number(row.total) === 1 ? 'caso' : 'casos'}`;
      item.append(name, total);
      return item;
    }));
  }

  async function loadMyReports() {
    const section = document.querySelector('[data-my-reports-section]');
    const container = document.querySelector('[data-my-reports]');
    if (!currentSession?.user) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const [canilResult, redResult] = await Promise.all([
      db.from('reportes_canil').select('id,categoria,descripcion,observado_en,estado,creado_en,nota_resolucion').order('creado_en', { ascending: false }).limit(30),
      db.from('reportes_red').select('id,objetivo_tipo,motivo,estado,nota_moderacion,creado_en').order('creado_en', { ascending: false }).limit(30),
    ]);
    const canilReports = (canilResult.error ? [] : (canilResult.data || [])).map((row) => ({ ...row, _source: 'canil' }));
    const redReports = (redResult.error ? [] : (redResult.data || [])).map((row) => ({ ...row, _source: 'red' }));
    const reports = [...canilReports, ...redReports].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    document.querySelector('[data-my-count]').textContent = String(reports.length);
    renderReportList(container, reports, (canilResult.error && redResult.error) ? 'No pudimos cargar tu historial.' : 'Todavía no tienes reportes asociados a esta sesión.');
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
      .select('id,categoria,descripcion,observado_en,estado,creado_en,nota_resolucion')
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
      await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports(), loadReportStats(), loadCreatorWorkspace(), loadNetworkModeration(), loadPlaceProposals(), refreshWanted()]);
      return;
    }
    signedOut.hidden = true;
    signedIn.hidden = false;
    document.querySelector('[data-session-email]').textContent = session.user.email || 'cuenta activa';
    const { data, error } = await db.from('moderadores').select('usuario_id').eq('usuario_id', session.user.id).maybeSingle();
    currentUserIsModerator = !error && Boolean(data);
    const placePanel = document.querySelector('[data-moderator-place]');
    if (placePanel) placePanel.hidden = !currentUserIsModerator;
    await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports(), loadReportStats(), loadCreatorWorkspace(), loadNetworkModeration(), loadPlaceProposals(), refreshWanted()]);
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

  document.querySelector('[data-profile-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-profile-message]');
    if (!form.reportValidity() || !currentSession?.user) return;
    const payload = {
      alias: form.elements.alias.value.trim(),
      biografia: form.elements.biografia.value.trim() || null,
    };
    let error = null;
    if (ownPublicProfile?.id) {
      ({ error } = await db.from('perfiles_publicos').update(payload).eq('id', ownPublicProfile.id));
    } else {
      ({ error } = await db.from('perfiles_publicos').insert({
        usuario_id: currentSession.user.id,
        ...payload,
        estado: 'publicado',
      }));
    }
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ya tienes un alias publicado.' : 'No pudimos guardar el alias.', 'error');
      return;
    }
    setMessage(message, 'Alias publicado en la red.', 'success');
    await Promise.all([loadCreatorWorkspace(), loadAnimalNetwork()]);
  });

  document.querySelector('[data-animal-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-animal-message]');
    if (!form.reportValidity() || !currentSession?.user) return;
    const isMemorial = form.elements.es_conmemorativa.checked;
    const deathDate = form.elements.fecha_deceso.value || null;
    if (isMemorial && !deathDate) {
      setMessage(message, 'Indica la fecha aproximada del deceso.', 'error');
      return;
    }
    const { error } = await db.from('animales').insert({
      slug: slugify(form.elements.nombre.value),
      nombre: form.elements.nombre.value.trim(),
      especie: form.elements.especie.value,
      biografia: form.elements.biografia.value.trim() || null,
      zona_publica: form.elements.zona_publica.value.trim() || null,
      es_comunitario: form.elements.es_comunitario.checked,
      es_conmemorativa: isMemorial,
      fecha_deceso: isMemorial ? deathDate : null,
      creado_por: currentSession.user.id,
      estado: 'publicado',
    });
    if (error) {
      setMessage(message, 'No pudimos guardar el perfil animal.', 'error');
      console.warn('AuraLadra: error al crear animal.', { code: error.code });
      return;
    }
    form.reset();
    syncCommemorativeFields(form);
    setMessage(message, isMemorial ? 'Ficha conmemorativa publicada.' : 'Perfil animal publicado.', 'success');
    await Promise.all([loadCreatorWorkspace(), loadAnimalNetwork()]);
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
    const { data, error } = await db.rpc('solicitar_vinculo_animal_humano', {
      p_animal_id: form.elements.animal_id.value,
      p_tipo: form.elements.tipo.value,
      p_visible_publicamente: form.elements.visible_publicamente.checked,
    });
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ese vínculo ya fue solicitado.' : (error.message || 'No pudimos solicitar el vínculo.'), 'error');
      return;
    }
    setMessage(message, data === 'confirmado'
      ? 'Vínculo creado y visible en la red.'
      : 'Solicitud enviada. El responsable de esa mascota debe autorizarla.', 'success');
    form.reset();
    form.elements.visible_publicamente.checked = true;
    await Promise.all([loadAnimalNetwork(), loadLinkRequests(), loadCreatorWorkspace()]);
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
    const { data, error } = await db.rpc('solicitar_vinculo_animales', {
      p_animal_a_id: form.elements.animal_a_id.value,
      p_animal_b_id: form.elements.animal_b_id.value,
      p_tipo: form.elements.tipo.value,
      p_descripcion: form.elements.descripcion.value.trim() || null,
    });
    if (error) {
      setMessage(message, error.code === '23505' ? 'Ese vínculo ya fue solicitado.' : (error.message || 'No pudimos solicitar el vínculo.'), 'error');
      return;
    }
    form.reset();
    setMessage(message, data === 'confirmado'
      ? 'Vínculo animal creado.'
      : 'Solicitud enviada. El responsable de la otra mascota debe autorizarla.', 'success');
    await Promise.all([loadAnimalNetwork(), loadLinkRequests(), loadCreatorWorkspace()]);
  });

  document.querySelector('[data-link-requests-list]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-link-table][data-link-id][data-link-decision]');
    if (!button || !currentSession?.user) return;
    const message = document.querySelector('[data-link-requests-message]');
    button.disabled = true;
    const { error } = await db.rpc('responder_solicitud_vinculo', {
      p_tabla: button.dataset.linkTable,
      p_id: button.dataset.linkId,
      p_decision: button.dataset.linkDecision,
    });
    if (error) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar esta solicitud.', 'error');
      return;
    }
    setMessage(message, button.dataset.linkDecision === 'confirmado' ? 'Vínculo autorizado.' : 'Solicitud rechazada.', 'success');
    await Promise.all([loadLinkRequests(), loadAnimalNetwork(), loadCreatorWorkspace()]);
  });

  document.querySelector('[data-network-moderation]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-profile-report-id][data-profile-report-status]');
    if (!button || !currentUserIsModerator) return;
    const message = document.querySelector('[data-network-moderator-message]');
    const noteInput = document.querySelector(`[data-profile-report-note-for="${button.dataset.profileReportId}"]`);
    button.disabled = true;
    const { error } = await db.from('reportes_red').update({
      estado: button.dataset.profileReportStatus,
      nota_moderacion: noteInput?.value.trim() || null,
    }).eq('id', button.dataset.profileReportId);
    if (error) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar este reporte.', 'error');
      return;
    }
    setMessage(message, 'Reporte de perfil actualizado.', 'success');
    await Promise.all([loadNetworkModeration(), loadMyReports()]);
  });

  document.querySelector('[data-place-proposal-list]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-place-proposal-id][data-place-proposal-decision]');
    if (!button || !currentUserIsModerator) return;
    const message = document.querySelector('[data-place-proposal-message]');
    button.disabled = true;
    const { error } = await db.rpc('moderar_propuesta_lugar', { p_propuesta_id: button.dataset.placeProposalId, p_decision: button.dataset.placeProposalDecision });
    if (error) {
      button.disabled = false;
      setMessage(message, `No pudimos moderar la propuesta${error.message ? `: ${error.message}` : '.'}`, 'error');
      return;
    }
    setMessage(message, button.dataset.placeProposalDecision === 'aprobar' ? 'Propuesta aprobada y mapa actualizado.' : 'Propuesta rechazada.', 'success');
    await Promise.all([loadPlaceProposals(), loadPlaces()]);
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

    if (!window.confirm(`¿Confirmas que ${animal.nombre} está segura? Se retirará su alerta del mapa y se cerrará el afiche abierto en Most Wanted.`)) return;
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
    await db.rpc('retirar_avisos_most_wanted_de_mi_animal', { p_animal_id: animal.id });
    if (error) {
      safeButton.disabled = false;
      setMessage(message, 'No pudimos actualizar el estado de la mascota.', 'error');
      return;
    }
    await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork(), refreshWanted()]);
    setMessage(message, `${animal.nombre} ahora figura como segura. Su alerta y el afiche abierto se cerraron.`, 'success');
  });

  document.querySelector('[data-account-animal-list]')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('[data-open-pet-profile]');
    const animal = ownAnimals.find((item) => item.id === card?.dataset.openPetProfile);
    if (!animal) return;
    event.preventDefault();
    showPetProfile(animal);
  });

  document.querySelector('[data-animal-grid]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-public-pet-profile]');
    const animal = publicAnimals.find((item) => item.id === button?.dataset.openPublicPetProfile);
    if (animal) showPetProfile(animal);
  });

  document.querySelector('[data-pet-profile-dialog]')?.addEventListener('click', (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog || event.target.closest('[data-pet-profile-close]')) dialog.close();
    const editButton = event.target.closest('[data-edit-pet-section]');
    if (editButton?.dataset.editPetSection === 'vinculos') {
      dialog.close();
      document.querySelector('[data-animal-link-form]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setMessage(document.querySelector('[data-account-animal-message]'), 'Puedes proponer vínculos aquí. Si la otra mascota tiene responsable, esa persona deberá autorizarlo.');
    } else if (editButton) startPetProfileEdit(editButton.dataset.editPetSection);
    if (event.target.closest('[data-pet-profile-cancel]') && activePetProfile) showPetProfile(activePetProfile);
  });

  document.querySelector('[data-human-profile-dialog]')?.addEventListener('click', (event) => {
    const dialog = event.currentTarget;
    if (event.target === dialog || event.target.closest('[data-human-profile-close]')) dialog.close();
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
      if (activePetProfile) {
        renderPetPhotos(preview, activePetProfile, true);
        renderAvatarChoices(activePetProfile);
      }
      return;
    }
    preview.replaceChildren(...files.map((file, index) => {
      const image = document.createElement('img');
      image.src = URL.createObjectURL(file);
      image.alt = `Nueva foto ${index + 1}`;
      image.onload = () => URL.revokeObjectURL(image.src);
      return image;
    }));
    if (activePetProfile) renderAvatarChoices(activePetProfile, files);
  });

  ['avatar_zoom', 'avatar_x', 'avatar_y'].forEach((name) => {
    document.querySelector('[data-pet-profile-form]')?.elements[name]?.addEventListener('input', updateAvatarCropPreview);
  });

  document.querySelector('[data-reset-avatar-crop]')?.addEventListener('click', () => {
    const form = document.querySelector('[data-pet-profile-form]');
    if (!form) return;
    form.elements.avatar_zoom.value = '1';
    form.elements.avatar_x.value = '0';
    form.elements.avatar_y.value = '0';
    updateAvatarCropPreview();
  });

  const getCharacterData = (form) => {
    const answers = Object.fromEntries(characterKeys.map((key) => [key, Number(form.elements[`caracter_${key}`].value)]));
    const values = Object.values(answers).filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    return { answers, score: values.length === characterKeys.length ? Math.round(((values.reduce((sum, value) => sum + value, 0) / values.length) - 1) * 25) : null };
  };

  const updateCharacterPreview = () => {
    const form = document.querySelector('[data-pet-profile-form]');
    const output = form?.querySelector('[data-character-preview]');
    if (!form || !output) return;
    const { score } = getCharacterData(form);
    output.textContent = score === null ? 'Completa las 5 respuestas' : `${score}% · ${score < 25 ? 'Bravo / muy reactivo' : score < 50 ? 'Cauteloso' : score < 75 ? 'Equilibrado' : 'Manso / confiado'}`;
  };

  characterKeys.forEach((key) => document.querySelector('[data-pet-profile-form]')?.elements[`caracter_${key}`]?.addEventListener('change', updateCharacterPreview));

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
    if (files.some((file) => !getUploadImageType(file))) {
      setMessage(message, 'Una foto no tiene formato compatible. Usa archivos JPG, PNG o WebP.', 'error');
      return;
    }
    const birthYear = form.elements.nacimiento_ano.value;
    const birthMonth = form.elements.nacimiento_mes.value;
    const birthDay = form.elements.nacimiento_dia.value;
    const hasSomeBirthPart = birthYear || birthMonth || birthDay;
    if (hasSomeBirthPart && !(birthYear && birthMonth && birthDay)) {
      setMessage(message, 'Completa día, mes y año, o deja la fecha completa sin indicar.', 'error');
      return;
    }
    const birthDate = hasSomeBirthPart ? `${birthYear}-${birthMonth}-${birthDay}` : null;
    if (birthDate && Number.isNaN(new Date(`${birthDate}T12:00:00`).getTime())) {
      setMessage(message, 'La fecha de nacimiento no es válida.', 'error');
      return;
    }
    const character = getCharacterData(form);
    const characterHasSomeAnswer = characterKeys.some((key) => form.elements[`caracter_${key}`].value);
    if (activePetEditSection === 'caracter' && character.score === null) {
      setMessage(message, 'Completa las cinco preguntas de carácter.', 'error');
      return;
    }
    if (characterHasSomeAnswer && character.score === null) {
      setMessage(message, 'El cuestionario de carácter está incompleto.', 'error');
      return;
    }
    const summaryBlocks = Array.from({ length: 8 }, (_, index) => form.elements[`bloque_resumen_${index + 1}`].value);
    if (new Set(summaryBlocks).size !== summaryBlocks.length) {
      setMessage(message, 'Los ocho bloques del resumen deben ser diferentes.', 'error');
      return;
    }
    saveButton.disabled = true;
    setMessage(message, 'Guardando la ficha…');
    let savePhase = 'upload';
    try {
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || authData.user?.id !== currentSession.user.id) throw new Error('La sesión venció. Cierra sesión y vuelve a ingresar.');
      const existingPhotos = Array.isArray(activePetProfile.foto_urls) ? activePetProfile.foto_urls.filter(Boolean) : [];
      const uploadedPhotos = [];
      for (const [index, file] of files.entries()) {
        const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${currentSession.user.id}/${activePetProfile.id}/${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await db.storage.from('mascotas').upload(path, file, { contentType: getUploadImageType(file), cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        uploadedPhotos.push(path);
      }
      const photoUrls = [...existingPhotos, ...uploadedPhotos].slice(0, 6);
      let profilePhotoUrl = activePetProfile.foto_url || null;
      const avatarBlob = await createCroppedAvatarBlob();
      if (avatarBlob) {
        const avatarPath = `${currentSession.user.id}/${activePetProfile.id}/perfil-${Date.now()}.webp`;
        const { error: avatarUploadError } = await db.storage.from('mascotas-publicas').upload(avatarPath, avatarBlob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
        if (avatarUploadError) throw avatarUploadError;
        const { data: publicAvatar } = db.storage.from('mascotas-publicas').getPublicUrl(avatarPath);
        profilePhotoUrl = publicAvatar.publicUrl;
      }
      savePhase = 'profile';
      const { error } = await db.rpc('actualizar_mi_animal', {
        p_animal_id: activePetProfile.id,
        p_nombre: form.elements.nombre.value.trim(),
        p_especie: form.elements.especie.value,
        p_biografia: form.elements.biografia.value.trim() || null,
        p_raza: form.elements.raza.value.trim() || null,
        p_tamano: form.elements.tamano.value || null,
        p_peso_kg: form.elements.peso_kg.value ? Number(form.elements.peso_kg.value) : null,
        p_fecha_nacimiento: birthDate,
        p_sexo: form.elements.sexo.value || null,
        p_color_pelaje: form.elements.color_pelaje.value.trim() || null,
        p_estado_registro: form.elements.estado_registro.value,
        p_numero_registro: form.elements.numero_registro.value.trim() || null,
        p_senas_particulares: form.elements.senas_particulares.value.trim() || null,
        p_foto_urls: photoUrls,
        p_foto_url: profilePhotoUrl,
        p_mostrar_en_red: form.elements.mostrar_en_red.checked,
        p_diagnostico_nutricional: form.elements.diagnostico_nutricional.value.trim() || null,
        p_bloques_resumen: summaryBlocks,
        p_salud: {
          altura_cm: form.elements.altura_cm.value ? Number(form.elements.altura_cm.value) : null,
          condicion_corporal: form.elements.condicion_corporal.value ? Number(form.elements.condicion_corporal.value) : null,
          vacunacion: form.elements.vacunacion.value.trim() || null,
          antecedentes_morbidos: form.elements.antecedentes_morbidos.value.trim() || null,
          antecedentes_familiares: form.elements.antecedentes_familiares.value.trim() || null,
          antecedentes_quirurgicos: form.elements.antecedentes_quirurgicos.value.trim() || null,
          alergias: form.elements.alergias.value.trim() || null,
        },
        p_habilidades: [...form.querySelectorAll('input[name="habilidades"]:checked')].map((input) => input.value),
        p_caracter_respuestas: character.score === null ? {} : character.answers,
        p_caracter_puntaje: character.score,
        p_es_conmemorativa: form.elements.es_conmemorativa.checked,
        p_fecha_deceso: form.elements.es_conmemorativa.checked ? (form.elements.fecha_deceso.value || null) : null,
      });
      if (error) throw error;
      await Promise.all([loadCreatorWorkspace(), loadAnimalNetwork()]);
      const updated = ownAnimals.find((item) => item.id === activePetProfile.id);
      if (updated) showPetProfile(updated);
      setMessage(document.querySelector('[data-account-animal-message]'), `Ficha de ${form.elements.nombre.value.trim()} actualizada.`, 'success');
    } catch (error) {
      const detail = String(error?.message || error?.error || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      setMessage(message, savePhase === 'upload' ? `No pudimos subir una foto${detail ? `: ${detail}` : '.'}` : `Las fotos se subieron, pero no pudimos guardar el perfil${detail ? `: ${detail}` : '.'}`, 'error');
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
    const article = button.closest('.report-item');
    if (button.dataset.nextStatus === 'cerrado' && button.dataset.confirmClose !== 'true') {
      let noteBox = article?.querySelector('[data-resolution-note]');
      if (!noteBox && article) {
        const wrap = document.createElement('div');
        wrap.className = 'report-close-note';
        noteBox = document.createElement('textarea');
        noteBox.dataset.resolutionNote = '';
        noteBox.maxLength = 500;
        noteBox.rows = 3;
        noteBox.placeholder = '¿Qué se hizo? Mínimo 10 caracteres.';
        noteBox.setAttribute('aria-label', 'Nota de resolución');
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.dataset.reportId = button.dataset.reportId;
        confirm.dataset.nextStatus = 'cerrado';
        confirm.dataset.confirmClose = 'true';
        confirm.textContent = 'Confirmar cierre';
        wrap.append(noteBox, confirm);
        article.append(wrap);
      }
      noteBox?.focus();
      return;
    }
    let payload = { estado: button.dataset.nextStatus };
    if (button.dataset.nextStatus === 'cerrado') {
      const note = article?.querySelector('[data-resolution-note]')?.value.trim() || '';
      if (!note) {
        setMessage(message, 'Escribe qué se hizo antes de cerrar el reporte.', 'error');
        article?.querySelector('[data-resolution-note]')?.focus();
        return;
      }
      payload = { estado: 'cerrado', nota_resolucion: note };
    }
    button.disabled = true;
    setMessage(message);
    const { data, error } = await db.from('reportes_canil').update(payload)
      .eq('id', button.dataset.reportId).select('id,estado').single();
    if (error || !data) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar el reporte.', 'error');
      return;
    }
    setMessage(message, 'Estado actualizado.', 'success');
    await Promise.all([loadModeratorReports(), loadMyReports(), loadPublicReports(), loadReportStats()]);
  });

  let wantedFilter = 'abiertos';
  let wantedConfig = null;
  const wantedStatusLabels = {
    publicado: 'En la plaza',
    reclamado: 'Hay un reclamo',
    en_verificacion: 'En verificación',
    resuelto: 'Resuelto',
    cerrado: 'Cerrado',
    expirado: 'Expirado',
  };
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

  const wantedPhotoUrl = (path) => {
    if (!path || !db) return '';
    if (/^https?:/i.test(path)) return path;
    return db.storage.from('most-wanted').getPublicUrl(path).data.publicUrl;
  };

  async function uploadWantedFile(folder, ownerKey, file) {
    const type = getUploadImageType(file);
    if (!type) throw new Error('Usa una foto JPG, PNG o WebP.');
    if (file.size > 2 * 1024 * 1024) throw new Error('La foto no puede pesar más de 2 MB.');
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${folder}/${ownerKey}/${Date.now()}.${extension}`;
    const { error } = await db.storage.from('most-wanted').upload(path, file, { contentType: type, cacheControl: '3600', upsert: false });
    if (error) throw error;
    return path;
  }

  async function loadWantedConfig() {
    const { data } = await db.from('configuracion_most_wanted').select('*').eq('id', 'piloto').maybeSingle();
    wantedConfig = data || null;
  }

  async function loadWantedFund() {
    const el = document.querySelector('[data-wanted-fund-amount]');
    if (!el) return;
    const { data, error } = await db.rpc('total_fondo_altruismo');
    el.textContent = error ? 'Aún no hay cifra' : clp.format(Number(data || 0));
  }

  function renderWantedPosters(rows) {
    const board = document.querySelector('[data-wanted-board]');
    if (!board) return;
    if (!rows.length) {
      board.innerHTML = '<p class="empty-state">Todavía no hay afiches en esta cinta. Si alguien se pierde, lo pegamos aquí.</p>';
      return;
    }
    board.replaceChildren(...rows.map((aviso) => {
      const article = document.createElement('article');
      article.className = 'wanted-poster';
      const reward = aviso.modalidad === 'recompensa';
      const photo = wantedPhotoUrl(aviso.foto_path);
      article.innerHTML = `
        <span class="wanted-badge ${reward ? '' : 'is-goodwill'}">${reward ? `Recompensa ${clp.format(aviso.monto_recompensa || 0)}` : 'Sin recompensa'}</span>
        ${photo ? `<img src="${escapeHtml(photo)}" alt="">` : '<div class="pet-photo-placeholder" aria-hidden="true">🐾</div>'}
        <h3>${escapeHtml(aviso.titulo)}</h3>
        <p>${escapeHtml(aviso.relato)}</p>
        <p><strong>${escapeHtml(aviso.zona_publica)}</strong> · ${escapeHtml(wantedStatusLabels[aviso.estado] || aviso.estado)}</p>
        <div class="wanted-poster-actions">
          ${['publicado', 'reclamado', 'en_verificacion'].includes(aviso.estado) ? `<button class="button button-primary" type="button" data-wanted-claim="${escapeHtml(aviso.id)}">Vi a esta mascota</button>` : ''}
          <button class="button button-ghost" type="button" data-wanted-share="${escapeHtml(aviso.id)}">Compartir aviso</button>
        </div>`;
      return article;
    }));
  }

  function renderWantedHeroes(rows) {
    const board = document.querySelector('[data-wanted-board]');
    if (!board) return;
    if (!rows.length) {
      board.innerHTML = '<p class="empty-state">Aún no hay recuperaciones de buena voluntad confirmadas. El ranking nace cuando alguien vuelve a casa sin intercambio de dinero.</p>';
      return;
    }
    board.replaceChildren(...rows.map((hero, index) => {
      const article = document.createElement('article');
      article.className = 'wanted-hero';
      article.innerHTML = `<p class="kicker">#${index + 1}</p><strong>${escapeHtml(hero.alias_publico)}</strong><p>${hero.recuperaciones} recuperación${Number(hero.recuperaciones) === 1 ? '' : 'es'} confirmada${Number(hero.recuperaciones) === 1 ? '' : 's'}</p>`;
      return article;
    }));
  }

  async function loadWantedBoard() {
    const board = document.querySelector('[data-wanted-board]');
    if (!board || !db) return;
    if (wantedFilter === 'heroes') {
      const { data, error } = await db.rpc('heroes_comunidad');
      renderWantedHeroes(error ? [] : (data || []));
      return;
    }
    let query = db.from('avisos_most_wanted')
      .select('id,animal_id,dueno_id,modalidad,monto_recompensa,estado,resultado,titulo,relato,zona_publica,foto_path,publicado_en')
      .order('publicado_en', { ascending: false })
      .limit(30);
    if (wantedFilter === 'abiertos') query = query.in('estado', ['publicado', 'reclamado', 'en_verificacion']);
    if (wantedFilter === 'recompensa') query = query.eq('modalidad', 'recompensa').in('estado', ['publicado', 'reclamado', 'en_verificacion']);
    if (wantedFilter === 'buena_voluntad') query = query.eq('modalidad', 'buena_voluntad').in('estado', ['publicado', 'reclamado', 'en_verificacion']);
    const { data, error } = await query;
    if (error) {
      board.innerHTML = '<p class="empty-state">No pudimos cargar los afiches. Si aún no corres el SQL de Most Wanted, este tablero permanece vacío.</p>';
      return;
    }
    renderWantedPosters(data || []);
  }

  async function loadWantedOwner() {
    const panel = document.querySelector('[data-wanted-owner-panel]');
    const list = document.querySelector('[data-wanted-owner-list]');
    if (!panel || !list) return;
    if (!currentSession?.user) {
      panel.hidden = true;
      return;
    }
    const { data: avisos, error } = await db.from('avisos_most_wanted')
      .select('id,animal_id,titulo,modalidad,monto_recompensa,estado,resultado')
      .eq('dueno_id', currentSession.user.id)
      .order('publicado_en', { ascending: false });
    if (error || !avisos?.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const ids = avisos.map((item) => item.id);
    const { data: claims } = await db.from('reclamos_most_wanted')
      .select('id,aviso_id,nombre_publico,evidencia_path,nota,estado,sin_cuenta,requiere_revision_manual,motivo_bandera,creado_en')
      .in('aviso_id', ids)
      .order('creado_en', { ascending: true });
    list.replaceChildren(...avisos.map((aviso) => {
      const wrap = document.createElement('div');
      wrap.className = 'wanted-owner-item';
      const related = (claims || []).filter((item) => item.aviso_id === aviso.id);
      const active = related.find((item) => item.estado === 'activo');
      const queued = related.filter((item) => item.estado === 'en_cola').length;
      wrap.innerHTML = `
        <strong>${escapeHtml(aviso.titulo)}</strong>
        <small>${escapeHtml(aviso.modalidad === 'recompensa' ? `Recompensa ${clp.format(aviso.monto_recompensa || 0)}` : 'Sin recompensa')} · ${escapeHtml(wantedStatusLabels[aviso.estado] || aviso.estado)}${aviso.resultado === 'pago_pendiente_liberar' ? ' · pago pendiente de liberar (aún no hay procesador)' : ''}</small>
        ${active ? `<p>Reclamo activo de ${escapeHtml(active.nombre_publico)}${active.sin_cuenta ? ' (sin cuenta)' : ''}: ${escapeHtml(active.nota)}</p>
          ${active.evidencia_path ? `<p><a href="${escapeHtml(wantedPhotoUrl(active.evidencia_path))}" target="_blank" rel="noopener noreferrer">Ver foto del hallazgo</a></p>` : ''}
          ${active.requiere_revision_manual ? `<p>Bandera: ${escapeHtml(active.motivo_bandera || 'revisión manual')}</p>` : ''}
          <div class="wanted-poster-actions">
            <button class="button button-primary" type="button" data-wanted-resolve="${escapeHtml(active.id)}" data-accept="true">Confirmar recuperación</button>
            <button class="button button-ghost" type="button" data-wanted-resolve="${escapeHtml(active.id)}" data-accept="false">No es</button>
          </div>` : `<p>${queued ? `${queued} reclamo(s) en cola. Uno a la vez.` : 'Sin reclamo activo.'}</p>`}
        ${['publicado', 'reclamado', 'en_verificacion'].includes(aviso.estado) ? `
          <label class="field"><span>${aviso.modalidad === 'recompensa' ? 'Aumentar recompensa (CLP)' : 'Agregar recompensa (CLP)'}</span>
            <input type="number" min="${aviso.modalidad === 'recompensa' ? Math.floor(Number(aviso.monto_recompensa || 0) + 1000) : 1000}" step="1000" data-wanted-migrate-amount="${escapeHtml(aviso.id)}" placeholder="${aviso.modalidad === 'recompensa' ? 'Nuevo monto, mayor al actual' : 'Monto'}">
          </label>
          <button class="button button-ghost" type="button" data-wanted-migrate="${escapeHtml(aviso.id)}">${aviso.modalidad === 'recompensa' ? 'Aumentar monto' : 'Ofrecer recompensa'}</button>
          <p>En esta fase no se puede bajar ni quitar una recompensa ya publicada.</p>` : ''}
        ${['publicado', 'reclamado', 'en_verificacion', 'resuelto'].includes(aviso.estado) ? `
          <button class="button button-ghost" type="button" data-wanted-take-down="${escapeHtml(aviso.animal_id)}">Ya está en casa: bajar afiche</button>` : ''}`;
      return wrap;
    }));
  }

  async function loadWantedReview() {
    const queue = document.querySelector('[data-wanted-review-queue]');
    if (!queue) return;
    if (!currentUserIsModerator) {
      queue.replaceChildren();
      return;
    }
    const { data, error } = await db.from('reclamos_most_wanted')
      .select('id,aviso_id,reclamante_id,nombre_publico,evidencia_path,nota,estado,sin_cuenta,requiere_revision_manual,motivo_bandera,creado_en')
      .eq('requiere_revision_manual', true)
      .in('estado', ['activo', 'en_cola'])
      .order('creado_en', { ascending: true });
    if (error || !data?.length) {
      queue.innerHTML = '<p class="empty-state">No hay reclamos con bandera.</p>';
      return;
    }
    queue.replaceChildren(...data.map((claim) => {
      const article = document.createElement('article');
      article.className = 'wanted-owner-item';
      article.innerHTML = `
        <strong>${escapeHtml(claim.nombre_publico)}</strong>
        <p>${escapeHtml(claim.nota)}</p>
        <p>${escapeHtml(claim.motivo_bandera || 'Revisión manual')}</p>
        ${claim.evidencia_path ? `<p><a href="${escapeHtml(wantedPhotoUrl(claim.evidencia_path))}" target="_blank" rel="noopener noreferrer">Ver evidencia</a></p>` : ''}
        <div class="wanted-poster-actions">
          ${claim.estado === 'activo' ? `
            <button class="button button-primary" type="button" data-wanted-resolve="${escapeHtml(claim.id)}" data-accept="true">Aprobar (pago queda pendiente)</button>
            <button class="button button-ghost" type="button" data-wanted-resolve="${escapeHtml(claim.id)}" data-accept="false">Rechazar</button>` : '<p>En cola, aún no activo.</p>'}
          ${claim.reclamante_id ? `<button class="button button-ghost" type="button" data-wanted-ban="${escapeHtml(claim.reclamante_id)}">Banear por reclamo falso</button>` : ''}
        </div>`;
      return article;
    }));
  }

  async function refreshWanted() {
    if (!db) return;
    try { await db.rpc('expirar_avisos_most_wanted'); } catch (_error) { /* el SQL puede no estar aplicado aún */ }
    await Promise.all([loadWantedConfig(), loadWantedFund(), loadWantedBoard(), loadWantedOwner(), loadWantedReview()]);
  }

  document.querySelector('[data-wanted-tape]')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-wanted-filter]');
    if (!chip) return;
    wantedFilter = chip.dataset.wantedFilter;
    document.querySelectorAll('[data-wanted-filter]').forEach((item) => item.classList.toggle('is-active', item === chip));
    loadWantedBoard();
  });

  document.querySelector('[data-wanted-board]')?.addEventListener('click', async (event) => {
    const claimButton = event.target.closest('[data-wanted-claim]');
    if (claimButton) {
      const dialog = document.querySelector('[data-wanted-claim-dialog]');
      const form = document.querySelector('[data-wanted-claim-form]');
      form.elements.aviso_id.value = claimButton.dataset.wantedClaim;
      setMessage(document.querySelector('[data-wanted-claim-message]'));
      dialog?.showModal();
      return;
    }
    const shareButton = event.target.closest('[data-wanted-share]');
    if (!shareButton) return;
    const url = `${window.location.origin}${window.location.pathname}#most-wanted`;
    try {
      await navigator.clipboard.writeText(url);
      if (currentSession?.user) await db.rpc('registrar_accion_actividad', { p_tipo: 'compartir_aviso' });
    } catch (_error) { /* el portapapeles puede estar bloqueado */ }
  });

  document.querySelector('[data-wanted-claim-close]')?.addEventListener('click', () => {
    document.querySelector('[data-wanted-claim-dialog]')?.close();
  });

  document.querySelector('[data-wanted-claim-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector('[data-wanted-claim-message]');
    setMessage(message);
    const file = form.elements.evidencia.files[0];
    if (!file) return setMessage(message, 'Necesito la foto del momento o del lugar.', 'error');
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const evidenciaPath = await uploadWantedFile('reclamos', form.elements.aviso_id.value, file);
      const { error } = await db.rpc('crear_reclamo_most_wanted', {
        p_aviso_id: form.elements.aviso_id.value,
        p_nombre: form.elements.nombre.value.trim(),
        p_evidencia_path: evidenciaPath,
        p_nota: form.elements.nota.value.trim(),
        p_sin_cuenta: !currentSession?.user,
      });
      if (error) throw error;
      form.reset();
      setMessage(message, 'Reclamo enviado. Si ya hay uno activo, el tuyo espera en cola.', 'success');
      await refreshWanted();
    } catch (error) {
      setMessage(message, error.message || 'No pudimos enviar el reclamo.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('[data-wanted-owner-list]')?.addEventListener('click', async (event) => {
    const message = document.querySelector('[data-wanted-owner-message]');
    const resolveButton = event.target.closest('[data-wanted-resolve]');
    const migrateButton = event.target.closest('[data-wanted-migrate]');
    const closeButton = event.target.closest('[data-wanted-close]');
    const takeDownButton = event.target.closest('[data-wanted-take-down]');
    try {
      if (resolveButton) {
        const aceptar = resolveButton.dataset.accept === 'true';
        const { error } = await db.rpc('resolver_reclamo_most_wanted', { p_reclamo_id: resolveButton.dataset.wantedResolve, p_aceptar: aceptar });
        if (error) throw error;
        setMessage(message, aceptar ? 'Listo: el afiche sale de la plaza. Si había recompensa, el pago queda pendiente de liberar.' : 'Reclamo rechazado. Si había cola, pasa el siguiente.', 'success');
        if (aceptar) await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork()]);
      }
      if (migrateButton) {
        const amountInput = document.querySelector(`[data-wanted-migrate-amount="${migrateButton.dataset.wantedMigrate}"]`);
        const { error } = await db.rpc('migrar_aviso_a_recompensa', { p_aviso_id: migrateButton.dataset.wantedMigrate, p_monto: Number(amountInput?.value) });
        if (error) throw error;
        setMessage(message, 'Recompensa actualizada. El monto no se puede bajar ni quitar desde aquí.', 'success');
      }
      if (closeButton) {
        const { error } = await db.rpc('cerrar_aviso_most_wanted', { p_aviso_id: closeButton.dataset.wantedClose });
        if (error) throw error;
        setMessage(message, 'Afiche cerrado.', 'success');
      }
      if (takeDownButton) {
        const { error } = await db.rpc('retirar_avisos_most_wanted_de_mi_animal', { p_animal_id: takeDownButton.dataset.wantedTakeDown });
        if (error) throw error;
        await db.rpc('cambiar_estado_seguridad_mascota', {
          p_animal_id: takeDownButton.dataset.wantedTakeDown,
          p_estado_seguridad: 'segura',
        });
        setMessage(message, 'Afiche bajado. La mascota vuelve a figurar como segura.', 'success');
        await Promise.all([loadPlaces(), loadCreatorWorkspace(), loadAnimalNetwork()]);
      }
      if (resolveButton || migrateButton || closeButton || takeDownButton) await refreshWanted();
    } catch (error) {
      setMessage(message, error.message || 'No pudimos actualizar el aviso.', 'error');
    }
  });

  document.querySelector('[data-wanted-review-queue]')?.addEventListener('click', async (event) => {
    const message = document.querySelector('[data-moderator-message]');
    const resolveButton = event.target.closest('[data-wanted-resolve]');
    const banButton = event.target.closest('[data-wanted-ban]');
    try {
      if (resolveButton) {
        const { error } = await db.rpc('resolver_reclamo_most_wanted', {
          p_reclamo_id: resolveButton.dataset.wantedResolve,
          p_aceptar: resolveButton.dataset.accept === 'true',
        });
        if (error) throw error;
        setMessage(message, 'Reclamo resuelto. El dinero no se transfiere solo: queda en pago pendiente de liberar.', 'success');
      }
      if (banButton) {
        const { error } = await db.rpc('banear_cuenta_most_wanted', {
          p_usuario: banButton.dataset.wantedBan,
          p_motivo: 'Reclamo falso comprobado.',
        });
        if (error) throw error;
        setMessage(message, 'Cuenta marcada como baneada de forma permanente en AuraLadra.', 'success');
      }
      if (resolveButton || banButton) await refreshWanted();
    } catch (error) {
      setMessage(message, error.message || 'No pudimos completar la revisión.', 'error');
    }
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
    try { await refreshWanted(); } catch (error) { console.warn('AuraLadra: Most Wanted no cargó.', error); }
    db.auth.onAuthStateChange((_event, session) => window.setTimeout(async () => {
      await syncSession(session);
      completeMagicLinkReturn(session);
    }, 0));
  }

  initialize();
})();

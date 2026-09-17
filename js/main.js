(() => {
  'use strict';

  const db = window.auraLadraDb;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const statusLabels = { pendiente: 'Pendiente', verificado: 'Verificado', cerrado: 'Cerrado', rechazado: 'Rechazado' };
  const categoryLabels = { agua: 'Agua', limpieza: 'Limpieza', seguridad: 'Seguridad', infraestructura: 'Infraestructura' };
  const placeCategoryLabels = {
    canil: 'Canil', parque: 'Parque', veterinaria: 'Veterinaria', tienda_mascotas: 'Tienda de mascotas',
    alimento: 'Comida', juguetes_accesorios: 'Juguetes y accesorios', animal_comunitario: 'Animal comunitario',
    servicio: 'Servicio', comercio: 'Comercio', otro: 'Otro',
  };
  const placeIcons = { canil: '🐾', parque: '🌳', veterinaria: '✚', tienda_mascotas: '◆', alimento: '●', juguetes_accesorios: '◈', animal_comunitario: '♥', servicio: '＋', comercio: '◇', otro: '⌖' };
  let currentSession = null;
  let currentUserIsModerator = false;
  let communityMap = null;
  let markerLayer = null;
  let publicPlaces = [];
  let activePlaceFilter = 'todos';
  let publicAnimals = [];
  let ownAnimals = [];
  let ownPublicProfile = null;

  const actionContent = {
    perdida: {
      number: '01', kicker: 'Actúa con calma', title: 'Tu red cercana es el primer círculo de búsqueda.',
      steps: ['Confirma el último lugar y hora en que fue vista.', 'Prepara una foto reciente y una descripción breve.', 'Avisa primero a vecinos y redes locales verificables.'],
      note: 'No publiques tu domicilio, teléfono ni documentos. Si existe riesgo inmediato, utiliza los servicios municipales o de emergencia correspondientes.',
      actions: [
        { id: 'preparar-perdida', label: 'Preparar aviso de búsqueda', style: 'primary' },
        { id: 'mapa-todos', label: 'Ver mapa del barrio', style: 'secondary' },
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

  const showNoticeBuilder = (kind) => {
    const workspace = document.querySelector('[data-action-workspace]');
    const feedback = document.querySelector('[data-action-feedback]');
    workspace.hidden = false;
    workspace.innerHTML = `
      <form class="quick-form" data-quick-notice-form>
        <div class="quick-form-grid">
          <label><span>${kind === 'perdida' ? 'Nombre de la mascota' : 'Identificación visible (opcional)'}</span><input name="nombre" maxlength="60"></label>
          <label><span>${kind === 'perdida' ? 'Último lugar visto' : 'Lugar del hallazgo'}</span><input name="lugar" required maxlength="120" placeholder="Sector o intersección, sin domicilio particular"></label>
          <label><span>Fecha y hora aproximadas</span><input name="momento" type="datetime-local"></label>
          <label class="is-wide"><span>Descripción útil</span><textarea name="detalles" required minlength="10" maxlength="350" rows="3" placeholder="Especie, color, tamaño, señas y dirección de desplazamiento"></textarea></label>
        </div>
        <div class="quick-form-actions">
          <button class="panel-action is-primary" type="submit">Generar aviso</button>
          <button class="panel-action" type="button" data-close-workspace>Cancelar</button>
        </div>
        <div class="notice-result" data-notice-result hidden>
          <label><span>Aviso listo para compartir</span><textarea readonly rows="8" data-notice-text></textarea></label>
          <button class="panel-action is-primary" type="button" data-share-notice>Copiar o compartir</button>
        </div>
      </form>`;
    setMessage(feedback);
    workspace.querySelector('input')?.focus();

    const form = workspace.querySelector('[data-quick-notice-form]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const notice = buildNotice(kind, new FormData(form));
      const result = form.querySelector('[data-notice-result]');
      result.hidden = false;
      result.querySelector('[data-notice-text]').value = notice;
      result.querySelector('[data-share-notice]').onclick = () => copyOrShareNotice(notice, feedback);
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    workspace.querySelector('[data-close-workspace]').addEventListener('click', () => {
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
      hours.textContent = `Horario publicado: ${place.horario_publico}`;
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
          className: '', html: `<div class="map-pin"><span>${placeIcons[place.categoria] || '⌖'}</span></div>`,
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
      empty.textContent = 'Todavía no hay lugares publicados en esta categoría.';
      container.replaceChildren(empty);
    } else {
      container.replaceChildren(...cards);
    }
    if (summary) {
      summary.textContent = `${filtered.length} ${filtered.length === 1 ? 'lugar público visible' : 'lugares públicos visibles'} · solo comuna de Maipú`;
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
    const { data, error } = await db.from('lugares_publicos')
      .select('id,slug,nombre,descripcion,direccion_publica,comuna,categoria,estado_verificacion,latitud,longitud,publicado,servicio_urgencia,urgencia_24h,horario_publico,telefono_publico,sitio_web,precision_ubicacion,fuente_nombre,fuente_url,fuente_consultada_en')
      .eq('publicado', true).eq('comuna', 'Maipú').order('nombre');
    publicPlaces = error ? [] : (data || []);
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
      db.from('animales').select('id,slug,nombre,especie,biografia,foto_url,zona_publica,es_comunitario,estado').eq('estado', 'publicado').order('nombre'),
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
  }

  async function loadCreatorWorkspace() {
    const signedIn = document.querySelector('[data-network-signed-in]');
    const signedOut = document.querySelector('[data-network-signed-out]');
    const hasUser = Boolean(currentSession?.user);
    if (signedIn) signedIn.hidden = !hasUser;
    if (signedOut) signedOut.hidden = hasUser;
    if (!hasUser) {
      ownAnimals = [];
      ownPublicProfile = null;
      return;
    }
    const [animalsResult, profileResult] = await Promise.all([db.rpc('mis_animales'), db.rpc('mi_perfil_publico')]);
    ownAnimals = animalsResult.error ? [] : (animalsResult.data || []);
    ownPublicProfile = profileResult.error ? null : (profileResult.data?.[0] || null);
    document.querySelectorAll('[data-own-animal-options]').forEach((select) => fillSelect(select, ownAnimals, ownAnimals.length ? 'Selecciona uno de tus animales' : 'Primero agrega un animal'));
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

  document.querySelector('[data-magic-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector('[data-magic-submit]');
    const message = document.querySelector('[data-auth-message]');
    setMessage(message);
    if (!form.reportValidity()) return;
    button.disabled = true;
    try {
      const { error } = await db.auth.signInWithOtp({
        email: form.elements.email.value.trim(),
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#cuenta`, shouldCreateUser: true },
      });
      if (error) throw error;
      form.reset();
      setMessage(message, 'Revisa tu correo: te enviamos un enlace de acceso.', 'success');
    } catch (error) {
      setMessage(message, 'No pudimos enviar el enlace. Verifica el correo e inténtalo nuevamente.', 'error');
      console.warn('AuraLadra: error al solicitar Magic Link.', { code: error?.code });
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
    db.auth.onAuthStateChange((_event, session) => window.setTimeout(() => syncSession(session), 0));
  }

  initialize();
})();

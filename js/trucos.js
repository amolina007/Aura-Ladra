// Galerías públicas y videos de trucos asociados a la ficha de cada mascota.
(() => {
  'use strict';

  const db = window.auraLadraDb;
  const bucket = 'mascotas-medios';
  const maxPhotoBytes = 5 * 1024 * 1024;
  const maxVideoBytes = 50 * 1024 * 1024;
  const maxVideoSeconds = 90;
  let currentProfileAnimal = null;
  const catalog = [
    ['Básicos', 'Sentarse', 'Una señal sencilla para pedir una pausa.'],
    ['Básicos', 'Echarse', 'Practica con calma hasta que apoye el cuerpo.'],
    ['Comunicación', 'Dar la pata', 'Invítala a ofrecer una pata y reconoce el intento.'],
    ['Comunicación', 'Mirarme', 'Premia los momentos en que busca tu mirada.'],
    ['Autocontrol', 'Esperar', 'Empieza con pausas muy breves y aumenta de a poco.'],
    ['Autocontrol', 'Venir al llamado', 'Practica primero en un lugar tranquilo y seguro.'],
    ['Convivencia', 'Caminar junto', 'Refuerza los tramos cortos con la correa relajada.'],
    ['Juegos', 'Girar', 'Guía el movimiento con una señal y celebra al terminar.'],
    ['Juegos', 'Chocar los cinco', 'Una variante divertida de ofrecer la pata.'],
    ['Juegos', 'Buscar un objeto', 'Comienza con un juguete visible y fácil de encontrar.'],
  ];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const setMessage = (node, text, kind = '') => {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('is-error', kind === 'error');
    node.classList.toggle('is-success', kind === 'success');
  };

  const objectUrl = (path) => db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  const loadAnimalMedia = async (animal, profileView) => {
    const photos = profileView.querySelector('[data-pet-public-gallery]');
    const videos = profileView.querySelector('[data-pet-trick-videos]');
    if (!photos || !videos) return;
    const { data, error } = await db.from('medios_mascota')
      .select('id,animal_id,autor_id,tipo,titulo,estado,descripcion,ruta_archivo,creado_en')
      .eq('animal_id', animal.id).order('creado_en', { ascending: false });
    if (error) {
      photos.replaceChildren(el('p', 'empty-state', 'No pudimos cargar la galería. Inténtalo otra vez más tarde.'));
      videos.replaceChildren(el('p', 'empty-state', 'No pudimos cargar los videos. Inténtalo otra vez más tarde.'));
      return;
    }
    const items = data || [];
    const photoItems = items.filter((item) => item.tipo === 'foto');
    const trickItems = items.filter((item) => item.tipo === 'video');
    if (!photoItems.length) photos.replaceChildren(el('p', 'empty-state', 'Aún no hay fotos compartidas en esta galería.'));
    else photos.replaceChildren(...photoItems.map((item, index) => {
      const figure = el('figure', 'pet-public-photo');
      const image = document.createElement('img');
      image.src = objectUrl(item.ruta_archivo);
      image.alt = `${animal.nombre}, momento ${index + 1}`;
      image.loading = 'lazy';
      figure.append(image);
      return figure;
    }));
    if (!trickItems.length) videos.replaceChildren(el('p', 'empty-state', 'Todavía no hay trucos en video.'));
    else videos.replaceChildren(...trickItems.map((item) => createVideoCard(item, animal)));
    photos.dataset.count = String(photoItems.length);
    videos.dataset.count = String(trickItems.length);
  };

  const createVideoCard = (item, animal) => {
    const article = el('article', 'trick-video-card');
    const video = document.createElement('video');
    video.src = objectUrl(item.ruta_archivo);
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('aria-label', `Video de ${item.titulo}, mascota ${animal.nombre}`);
    const body = el('div', 'trick-video-copy');
    const heading = el('h5', '', item.titulo);
    const state = el('span', `trick-state ${item.estado === 'aprendido' ? 'is-learned' : ''}`, item.estado === 'aprendido' ? 'Aprendido' : 'En práctica');
    const petName = el('p', 'trick-video-pet', animal.nombre);
    body.append(heading, state, petName);
    if (item.descripcion) body.append(el('p', 'trick-video-description', item.descripcion));
    article.append(video, body);
    return article;
  };

  const mediaErrorText = (error) => {
    const code = String(error?.code || '');
    if (code === '42501') return 'No tienes permiso para compartir contenido en esta ficha.';
    return 'No pudimos guardar el archivo. Comprueba tu conexión e inténtalo otra vez.';
  };

  const uploadPhoto = async (input, animal, message) => {
    const files = [...input.files];
    if (!files.length) return;
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxPhotoBytes)) {
      setMessage(message, 'Usa JPG, PNG o WebP de máximo 5 MB cada una.', 'error');
      input.value = '';
      return;
    }
    input.disabled = true;
    setMessage(message, 'Subiendo fotos…');
    try {
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) throw new Error('Sesión requerida');
      for (const file of files) {
        const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
        const path = `${auth.user.id}/${animal.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { error: rowError } = await db.from('medios_mascota').insert({ animal_id: animal.id, tipo: 'foto', titulo: null, estado: null, descripcion: null, ruta_archivo: path });
        if (rowError) {
          await db.storage.from(bucket).remove([path]);
          throw rowError;
        }
      }
      setMessage(message, `${files.length === 1 ? 'Foto agregada' : `${files.length} fotos agregadas`} a la galería.`, 'success');
      await loadAnimalMedia(animal, document.querySelector('[data-pet-profile-view]'));
      document.dispatchEvent(new CustomEvent('trucos:actualizados'));
    } catch (error) {
      setMessage(message, mediaErrorText(error), 'error');
    } finally {
      input.disabled = false;
      input.value = '';
    }
  };

  const videoDuration = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer el video.')); };
    video.src = url;
  });

  const publishTrick = async (form, animal) => {
    const message = form.querySelector('[data-trick-upload-message]');
    const submit = form.querySelector('[data-trick-submit]');
    if (!form.reportValidity()) return;
    const file = form.elements.video.files[0];
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!file || !allowedTypes.includes(file.type) || file.size > maxVideoBytes) {
      setMessage(message, 'Elige un MP4, WebM o MOV de máximo 50 MB.', 'error');
      return;
    }
    submit.disabled = true;
    setMessage(message, 'Revisando y subiendo el video…');
    let path = '';
    try {
      const duration = await videoDuration(file);
      if (!Number.isFinite(duration) || duration <= 0 || duration > maxVideoSeconds) throw new Error('DURATION');
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) throw new Error('AUTH');
      const extByType = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
      path = `${auth.user.id}/${animal.id}/${crypto.randomUUID()}.${extByType[file.type]}`;
      const { error: uploadError } = await db.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await db.from('medios_mascota').insert({
        animal_id: animal.id, tipo: 'video', titulo: form.elements.titulo.value.trim(), estado: form.elements.estado.value,
        descripcion: form.elements.descripcion.value.trim() || null, ruta_archivo: path,
      });
      if (rowError) {
        await db.storage.from(bucket).remove([path]);
        path = '';
        throw rowError;
      }
      form.reset();
      form.hidden = true;
      setMessage(message, 'Video publicado en el perfil y el repertorio.', 'success');
      await loadAnimalMedia(animal, document.querySelector('[data-pet-profile-view]'));
      document.dispatchEvent(new CustomEvent('trucos:actualizados'));
    } catch (error) {
      setMessage(message, error.message === 'DURATION' ? 'El video debe durar 90 segundos o menos.' : error.message === 'AUTH' ? 'Tu sesión venció. Inicia sesión de nuevo.' : mediaErrorText(error), 'error');
    } finally {
      submit.disabled = false;
    }
  };

  document.addEventListener('mascota:perfil', (event) => {
    const { animal } = event.detail || {};
    currentProfileAnimal = animal || null;
    const root = document.querySelector('[data-pet-profile-view]');
    if (animal && root) loadAnimalMedia(animal, root);
  });

  document.querySelector('[data-pet-profile-view]')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-trick-upload]')) {
      const form = document.querySelector('[data-trick-upload-form]');
      form.hidden = false;
      form.querySelector('[name="video"]')?.focus();
    }
    if (event.target.closest('[data-cancel-trick-upload]')) {
      const form = document.querySelector('[data-trick-upload-form]');
      form.reset();
      form.hidden = true;
      setMessage(form.querySelector('[data-trick-upload-message]'), '');
    }
  });

  document.querySelector('[data-pet-profile-view]')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-pet-photo-upload]');
    if (!input) return;
    if (currentProfileAnimal) uploadPhoto(input, currentProfileAnimal, document.querySelector('[data-pet-photo-message]'));
  });

  document.querySelector('[data-pet-profile-view]')?.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-trick-upload-form]');
    if (!form) return;
    event.preventDefault();
    if (currentProfileAnimal) publishTrick(form, currentProfileAnimal);
  });

  const catalogRoot = document.querySelector('[data-trick-catalog]');
  const searchInput = document.querySelector('[data-trick-search]');
  const renderCatalog = () => {
    if (!catalogRoot) return;
    const query = (searchInput?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const rows = catalog.filter(([, name, description]) => `${name} ${description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query));
    if (!rows.length) {
      catalogRoot.replaceChildren(el('p', 'empty-state', 'No encontramos ese truco. Prueba con otra palabra.'));
      return;
    }
    catalogRoot.replaceChildren(...rows.map(([category, name, description]) => {
      const card = el('article', 'trick-guide-card');
      card.append(el('span', 'trick-category', category), el('h3', '', name), el('p', '', description));
      return card;
    }));
  };
  searchInput?.addEventListener('input', renderCatalog);
  renderCatalog();

  const loadCommunity = async () => {
    const root = document.querySelector('[data-trick-community]');
    if (!root || !db) return;
    const { data, error } = await db.from('medios_mascota')
      .select('id,animal_id,titulo,estado,descripcion,ruta_archivo,creado_en,animales!inner(id,nombre,especie,foto_url,estado,mostrar_en_red)')
      .eq('tipo', 'video').order('creado_en', { ascending: false }).limit(36);
    const counter = document.querySelector('[data-trick-video-count]');
    if (error) {
      root.replaceChildren(el('p', 'empty-state', 'No pudimos cargar los videos compartidos. Inténtalo más tarde.'));
      if (counter) counter.textContent = '— videos';
      return;
    }
    const items = data || [];
    if (counter) counter.textContent = `${items.length} ${items.length === 1 ? 'video' : 'videos'}`;
    if (!items.length) {
      root.replaceChildren(el('p', 'empty-state', 'Aún no hay videos compartidos. Sube el primer truco desde el perfil de tu mascota.'));
      return;
    }
    root.replaceChildren(...items.map((item) => createVideoCard(item, item.animales)));
  };

  document.addEventListener('vista:cambio', (event) => {
    if (event.detail?.vista === 'trucos') loadCommunity();
  });
  document.addEventListener('trucos:actualizados', loadCommunity);
  loadCommunity();
})();

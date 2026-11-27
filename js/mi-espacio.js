(() => {
  'use strict';
  const root = document.querySelector('[data-my-profile]');
  if (!root) return;
  const $ = s => document.querySelector(s);
  const usuario = () => window.auraLadraRed?.sesion?.()?.user?.id || null;
  let usuarioAnterior = usuario(), carga = 0, publicaciones = [], focoPublicacion = null;
  const dialog = $('[data-profile-post-dialog]');
  const cerrarPublicacion = () => { if (dialog?.open) dialog.close(); $('[data-profile-post-content]')?.replaceChildren(); };
  dialog?.addEventListener('close', () => { $('[data-profile-post-content]').replaceChildren(); focoPublicacion?.focus(); });
  $('[data-profile-post-close]')?.addEventListener('click', cerrarPublicacion);
  const mover = (selector, destino) => { const pieza = $(selector), contenedor = $(destino); if (pieza && contenedor) contenedor.append(pieza); };
  mover('[data-link-requests-section]', '[data-space-vinculos]');
  mover('[data-my-reports-section]', '[data-my-profile-panel="actividad"]');
  const moderacion = $('[data-moderator-panel]');
  if (moderacion) {
    moderacion.removeAttribute('data-vista-de');
    mover('[data-moderator-panel]', '[data-profile-moderation]');
    const enlace = $('[data-profile-moderation-link]');
    const actualizar = () => { enlace.hidden = moderacion.hidden; };
    new MutationObserver(actualizar).observe(moderacion, { attributes: true, attributeFilter: ['hidden'] }); actualizar();
  }
  const sesion = () => {
    $('[data-space-signed-out]').hidden = Boolean(usuario());
    root.hidden = !usuario();
    if (!usuario() || usuarioAnterior !== usuario()) {
      carga++; publicaciones = []; cerrarPublicacion();
      root.querySelectorAll('[data-space-contenido], [data-space-miniaturas], [data-profile-gallery]').forEach(n => n.replaceChildren());
      root.querySelector('[data-my-profile-initials]')?.replaceChildren();
      root.querySelector('[data-my-profile-alias]').textContent = 'Mi perfil';
      root.querySelector('[data-my-profile-bio]').textContent = '';
      root.querySelector('[data-my-profile-pets]')?.replaceChildren();
    }
    usuarioAnterior = usuario();
  };
  const seleccionar = tipo => {
    root.querySelectorAll('[data-profile-content-tab]').forEach(n => { const activo = n.dataset.profileContentTab === tipo; n.setAttribute('aria-selected', String(activo)); n.tabIndex = activo ? 0 : -1; });
    root.querySelectorAll('[data-profile-content-panel]').forEach(n => { n.hidden = n.dataset.profileContentPanel !== tipo; });
    const crear = root.querySelector('.profile-content-heading [data-space-crear]');
    crear.dataset.spaceCrear = tipo === 'historia' ? 'historia' : 'post'; crear.setAttribute('aria-label', tipo === 'historia' ? 'Crear historia' : 'Crear publicación'); crear.hidden = tipo === 'aportes';
  };
  const galeria = (contenedor, items, tipo) => {
    contenedor.replaceChildren(...items.map(p => {
      const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'profile-gallery-item'; boton.dataset.spaceOpen = p.id;
      boton.setAttribute('aria-label', `Abrir ${tipo === 'historia' ? 'historia' : 'publicación'} de ${p.mascota?.nombre || 'tu mascota'}${p.texto ? ': ' + p.texto.slice(0, 80) : ''}`);
      if (/^https:\/\//.test(p.imagen || '')) { const img = document.createElement('img'); img.src = p.imagen; img.alt = p.titulo || `Foto de ${p.mascota?.nombre || 'tu mascota'}`; img.loading = 'lazy'; boton.append(img); }
      else if (/^https:\/\//.test(p.video || '')) { const video = document.createElement('video'); video.src = p.video; video.preload = 'metadata'; video.muted = true; video.playsInline = true; boton.append(video); const icon = document.createElement('span'); icon.textContent = '▷ Video'; icon.className = 'profile-gallery-video'; boton.append(icon); }
      else { const texto = document.createElement('span'); texto.textContent = p.texto || 'Ver publicación'; boton.append(texto); }
      return boton;
    }));
    if (!items.length) { const vacio = document.createElement('p'); vacio.className = 'empty-state'; vacio.textContent = tipo === 'post' ? 'Aquí aparecerán los momentos que compartas con tus mascotas.' : 'No tienes historias activas. Duran 24 horas.'; contenedor.append(vacio); }
  };
  const contenido = async () => {
    const id = usuario(), turno = ++carga;
    if (!id || !window.auraLadraFeed?.propias || (window.auraLadraVistas && window.auraLadraVistas.actual() !== 'cuenta')) return;
    try {
      const propias = await window.auraLadraFeed.propias();
      if (turno !== carga || usuario() !== id) return;
      const mascotas = new Set((window.auraLadraRed.propias?.() || []).map(a => a.id));
      // Fotos ya publicadas en las fichas de sus mascotas; conservan sus controles originales.
      const compartidas = (window.auraLadraFeed.posts?.() || []).filter(p => p.compartido && mascotas.has(p.mascota?.id));
      publicaciones = [...new Map([...propias, ...compartidas].map(p => [p.id, p])).values()].sort((a,b) => new Date(b.creado) - new Date(a.creado));
      for (const tipo of ['post', 'historia']) {
        const items = publicaciones.filter(p => p.tipo === tipo);
        galeria(root.querySelector(`[data-profile-gallery="${tipo}"]`), items, tipo);
        const lista = root.querySelector(`[data-space-contenido="${tipo}"]`);
        lista.replaceChildren(...items.map(p => window.auraLadraFeed.tarjetaPropia(p)));
        if (!items.length) { const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = tipo === 'post' ? 'Todavía no has publicado. Comparte un momento con tu mascota.' : 'No tienes historias activas. Las historias aparecen durante 24 horas.'; lista.append(p); }
      }
    } catch {
      if (turno !== carga || usuario() !== id) return;
      root.querySelectorAll('[data-space-contenido], [data-profile-gallery]').forEach(n => { n.textContent = 'No pudimos cargar tu contenido. Vuelve a Mi perfil para reintentar.'; });
    }
  };
  root.addEventListener('click', event => {
    const pestaña = event.target.closest('[data-profile-content-tab]');
    if (pestaña) { seleccionar(pestaña.dataset.profileContentTab); return; }
    const abrir = event.target.closest('[data-space-open]');
    if (abrir && usuario()) { const p = publicaciones.find(p => p.id === abrir.dataset.spaceOpen); if (p) { focoPublicacion = abrir; $('[data-profile-post-content]').replaceChildren(window.auraLadraFeed.tarjetaPropia(p)); dialog.showModal(); } return; }
    const crear = event.target.closest('[data-space-crear]');
    if (crear) {
      if (!window.auraLadraRed?.propias?.().some(a => !a.es_conmemorativa)) { root.querySelector('[data-my-profile-tab="animales"]').click(); return; }
      window.auraLadraFeed?.publicar(crear.dataset.spaceCrear);
    }
    if (event.target.closest('[data-space-consultas]')) { window.auraLadraVistas?.ir('servicios'); $('[data-services-panel="consultas"]')?.click(); }
    if (event.target.closest('[data-space-guardados]')) {
      window.auraLadraVistas?.ir('red'); $('[data-red-tab="descubrir"]')?.click();
      const filtro = $('[data-desc-filtros] [name="guardados"]');
      if (filtro) { filtro.form.reset(); filtro.checked = true; filtro.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });
  root.querySelector('.profile-tabs')?.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...root.querySelectorAll('[data-profile-content-tab]')], actual = tabs.indexOf(event.target); if (actual < 0) return;
    event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (actual + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    seleccionar(tabs[index].dataset.profileContentTab); tabs[index].focus();
  });
  $('[data-space-acceso]')?.addEventListener('click', () => $('[data-session-chip]')?.click());
  document.addEventListener('sesion:cambio', () => { sesion(); contenido(); });
  document.addEventListener('feed:cambio', () => { cerrarPublicacion(); contenido(); });
  document.addEventListener('mascotas:cambio', contenido);
  document.addEventListener('espacio:panel', event => { if (['perfil','publicaciones','historias'].includes(event.detail?.panel)) contenido(); });
  document.addEventListener('vista:cambio', event => { if (event.detail?.vista === 'cuenta') { sesion(); contenido(); } else cerrarPublicacion(); });
  sesion(); contenido();
})();

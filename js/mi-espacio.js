(() => {
  'use strict';
  const root = document.querySelector('[data-my-profile]');
  if (!root) return;
  const $ = s => document.querySelector(s);
  const usuario = () => window.auraLadraRed?.sesion?.()?.user?.id || null;
  let usuarioAnterior = usuario();
  let carga = 0;
  const mover = (selector, destino) => {
    const pieza = $(selector), contenedor = $(destino);
    if (pieza && contenedor) contenedor.append(pieza);
  };
  mover('[data-link-requests-section]', '[data-space-vinculos]');
  mover('[data-my-reports-section]', '[data-my-profile-panel="actividad"]');

  const sesion = () => {
    $('[data-space-signed-out]').hidden = Boolean(usuario());
    if (!usuario() || usuarioAnterior !== usuario()) {
      root.hidden = true;
      carga++;
      root.querySelectorAll('[data-space-contenido], [data-space-miniaturas]').forEach(n => n.replaceChildren());
    }
    usuarioAnterior = usuario();
  };
  const contenido = async () => {
    const id = usuario(), turno = ++carga;
    if (!id || !window.auraLadraFeed?.propias || (window.auraLadraVistas && window.auraLadraVistas.actual() !== 'cuenta')) return;
    try {
      const posts = await window.auraLadraFeed.propias();
      if (turno !== carga || usuario() !== id) return;
      for (const tipo of ['post', 'historia']) {
        const lista = root.querySelector(`[data-space-contenido="${tipo}"]`);
        const items = posts.filter(p => p.tipo === tipo);
        lista.replaceChildren(...items.map(p => window.auraLadraFeed.tarjetaPropia(p)));
        if (!items.length) {
          const p = document.createElement('p'); p.className = 'empty-state';
          p.textContent = tipo === 'post' ? 'Todavía no has publicado. Comparte un momento con tu mascota.' : 'No tienes historias activas. Las historias aparecen durante 24 horas.';
          lista.append(p);
        }
        const miniaturas = root.querySelector(`[data-space-miniaturas="${tipo}"]`);
        miniaturas.replaceChildren(...items.filter(p => p.imagen).slice(0, 3).map(p => {
          const img = document.createElement('img'); img.src = p.imagen; img.alt = ''; img.loading = 'lazy'; return img;
        }));
        if (!miniaturas.children.length) miniaturas.textContent = tipo === 'post' ? 'Tus momentos, juntos' : 'Un día con ellos';
      }
    } catch {
      if (turno !== carga || usuario() !== id) return;
      root.querySelectorAll('[data-space-contenido]').forEach(n => { n.textContent = 'No pudimos cargar tu contenido. Vuelve a Mi espacio para reintentar.'; });
    }
  };
  root.addEventListener('click', event => {
    const crear = event.target.closest('[data-space-crear]');
    if (crear) {
      if (!window.auraLadraRed?.propias?.().some(a => !a.es_conmemorativa)) {
        root.querySelector('[data-my-profile-tab="animales"]').click();
        return;
      }
      window.auraLadraFeed?.publicar(crear.dataset.spaceCrear);
    }
    if (event.target.closest('[data-space-consultas]')) {
      window.auraLadraVistas?.ir('servicios'); $('[data-services-panel="consultas"]')?.click();
    }
    if (event.target.closest('[data-space-guardados]')) {
      window.auraLadraVistas?.ir('red'); $('[data-red-tab="descubrir"]')?.click();
      const filtro = $('[data-desc-filtros] [name="guardados"]');
      if (filtro) { filtro.form.reset(); filtro.checked = true; filtro.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });
  $('[data-space-acceso]')?.addEventListener('click', () => $('[data-session-chip]')?.click());
  document.addEventListener('sesion:cambio', sesion);
  document.addEventListener('feed:cambio', contenido);
  document.addEventListener('espacio:panel', event => { if (['publicaciones', 'historias'].includes(event.detail?.panel)) contenido(); });
  document.addEventListener('vista:cambio', event => { if (event.detail?.vista === 'cuenta') { sesion(); contenido(); } });
  sesion(); contenido();
})();

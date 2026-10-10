// Una sección a la vez: cada botón del menú muestra solo su sección, sin recorrer toda la página.
// Cada pieza de la página declara a qué vista pertenece con data-vista-de="mapa" (o varias: "reportar cuenta").
(() => {
  'use strict';

  const VISTA_INICIAL = 'inicio';
  const VISTAS = ['inicio', 'acciones', 'most-wanted', 'mapa', 'red', 'ayudar', 'comida-agua', 'reportar', 'cuenta'];
  // A qué vista lleva cada ancla (#id) de la página.
  const VISTA_DE_ID = {
    inicio: 'inicio',
    'como-funciona': 'inicio',
    recursos: 'inicio',
    principios: 'inicio',
    acciones: 'acciones',
    'most-wanted': 'most-wanted',
    mapa: 'mapa',
    red: 'red',
    ayudar: 'ayudar',
    reportes: 'reportar',
    reportar: 'reportar',
    cuenta: 'cuenta',
    'mi-perfil': 'cuenta',
  };
  // Botón de la barra de abajo → vista
  const VISTA_DE_TABBAR = { inicio: 'inicio', mapa: 'mapa', red: 'red', ayudar: 'ayudar', perfil: 'cuenta' };

  let actual = null;

  const prefiereMenosMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const idDeHash = (hash) => decodeURIComponent(String(hash || '').replace(/^#/, ''));
  const vistaDeId = (id) => VISTA_DE_ID[id] || (VISTAS.includes(id) ? id : null);

  const marcarActivos = (vista) => {
    document.querySelectorAll('[data-nav] a[href^="#"]').forEach((link) => {
      const id = idDeHash(link.getAttribute('href'));
      if (vistaDeId(id) === vista) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-tabbar-link]').forEach((link) => {
      link.setAttribute('aria-current', String(VISTA_DE_TABBAR[link.dataset.tabbarLink] === vista));
    });
  };

  // Muestra una vista. «destino» puede ser el nombre de la vista o el id de un ancla (ej. "mi-perfil").
  const mostrar = (destino, { desplazar = true } = {}) => {
    let id = String(destino || '');
    // «Mi perfil» solo existe con sesión iniciada; sin ella, el destino es «Mi cuenta».
    if (id === 'mi-perfil' && document.getElementById('mi-perfil')?.hidden) id = 'cuenta';
    const vista = vistaDeId(id) || VISTA_INICIAL;
    const cambio = vista !== actual;

    document.body.dataset.vista = vista;
    document.querySelectorAll('[data-vista-de]').forEach((pieza) => {
      const suyas = pieza.dataset.vistaDe.split(/\s+/);
      pieza.classList.toggle('vista-oculta', !suyas.includes(vista));
    });
    marcarActivos(vista);
    actual = vista;
    if (cambio) document.dispatchEvent(new CustomEvent('vista:cambio', { detail: { vista } }));

    if (desplazar) {
      const ancla = document.getElementById(id);
      const visible = ancla && !ancla.hidden && !ancla.closest('.vista-oculta') && id !== vista && !['inicio', 'reportes'].includes(id);
      if (visible) ancla.scrollIntoView({ behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    }
    return vista;
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || link.target === '_blank') return;
    const id = idDeHash(link.getAttribute('href'));
    if (!vistaDeId(id)) return; // enlaces como #contenido siguen su camino normal
    event.preventDefault();
    if (idDeHash(window.location.hash) !== id) window.history.pushState({ vista: vistaDeId(id) }, '', `#${id}`);
    mostrar(id);
  });

  const alCambiarHistorial = () => mostrar(idDeHash(window.location.hash));
  window.addEventListener('popstate', alCambiarHistorial);
  window.addEventListener('hashchange', alCambiarHistorial);

  // Cambia de sección desde el código (botones internos) sin desplazar; deja la dirección y el «atrás» al día.
  const ir = (id) => {
    const vista = vistaDeId(id);
    if (!vista) return null;
    if (idDeHash(window.location.hash) !== id) window.history.pushState({ vista }, '', `#${id}`);
    return mostrar(id, { desplazar: false });
  };

  window.auraLadraVistas = { mostrar, ir, actual: () => actual, vistas: VISTAS };

  // Vista inicial según la dirección (#red, #cuenta…); sin ancla, la portada.
  // El script va al final de la página, así que las secciones ya existen: se aplica de inmediato (sin parpadeo)
  // y se repite al terminar de cargar por si el script se mueve más arriba.
  mostrar(idDeHash(window.location.hash), { desplazar: Boolean(window.location.hash) });
  if (document.readyState === 'loading') {
    // En el celular el menú de servicios va desplegado dentro de la hamburguesa.
    document.addEventListener('DOMContentLoaded', () => { if (window.matchMedia?.('(max-width: 900px)').matches) document.querySelector('.nav-mas')?.setAttribute('open', ''); });
    document.addEventListener('DOMContentLoaded', () => mostrar(idDeHash(window.location.hash), { desplazar: false }));
  }
})();

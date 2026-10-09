/*
 * aura-nav.js — Datos de cuenta para el menú del botón-logo de cada sitio Aura.
 *
 * Cada sitio ya tiene su botón de sesión arriba a la izquierda. Este archivo NO crea otro
 * botón: rellena el menú que ese botón ya abre con tres cosas, iguales en todos los sitios:
 *
 *   - Rango (liga y división, estilo videojuego: ORO I) con tu ELO y posición
 *   - Tus Auracoins
 *   - Lista de sitios Aura (con emoji) para cambiar de uno a otro
 *
 * Uso automático: cargar este archivo y marcar el menú con data-aura-menu (ver abajo).
 * Uso manual (alternativo), justo después de crear el menú y de agregarlo a la página:
 *
 *   window.AuraNav?.pintar(menu, client, { antesDe: botonCerrarSesion });
 *
 * Reglas (las mismas de globo.js):
 *   - Reutiliza la conexión del sitio (la que se le pasa como "client"): no abre otra sesión.
 *   - Habla solo con el esquema "core": funciones del servidor, sin tocar tablas.
 *       core.fn_mi_resumen_cuenta()  -> ELO, liga, posición y Auracoins de quien tiene sesión
 *       core.fn_sitios_menu()        -> sitios con emoji (tabla core.modules)
 *   - Todo texto se inserta con textContent y los estilos se asignan por código (nada de
 *     HTML ni style="..."), para respetar las reglas de seguridad (CSP) más estrictas.
 *   - El cliente solo muestra: ningún número se calcula aquí.
 */
(() => {
  'use strict';

  if (window.AuraNav) return;

  const fmt = new Intl.NumberFormat('es-CL');

  // Respaldo por si la base no responde. La lista oficial está en core.modules.
  const SITIOS_RESPALDO = [
    { slug: 'auraritmos', name: 'AuraRitmos', emoji: '💃', url: 'https://ritmos.convergenciaaura.cl' },
    { slug: 'auraladra', name: 'AuraLadra', emoji: '🐾', url: 'https://ladra.convergenciaaura.cl' },
    { slug: 'plaza', name: 'Plaza', emoji: '⛲', url: 'https://plaza.convergenciaaura.cl' },
    { slug: 'valora_aps', name: 'Valora APS', emoji: '🩺', url: 'https://valora.convergenciaaura.cl' },
    { slug: 'osint_humankind', name: 'OSINT Humankind', emoji: '🌍', url: 'https://atlas.convergenciaaura.cl' },
  ];

  // Color de cada liga (solo presentación).
  const COLOR_LIGA = {
    hierro: '#7c828c',
    bronce: '#b8691f',
    plata: '#8d96a3',
    oro: '#c99700',
    platino: '#1fa5b8',
    esmeralda: '#1a9e5a',
    diamante: '#2f8fe8',
    maestro: '#8a4fe0',
  };

  async function cargarResumen(client) {
    try {
      const { data, error } = await client.schema('core').rpc('fn_mi_resumen_cuenta');
      return error ? null : data;
    } catch (_e) {
      return null;
    }
  }

  async function cargarSitios(client) {
    try {
      const { data, error } = await client.schema('core').rpc('fn_sitios_menu');
      if (!error && Array.isArray(data) && data.length) return data;
    } catch (_e) { /* se usa el respaldo */ }
    return SITIOS_RESPALDO;
  }

  function urlSegura(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' ? x.href : null;
    } catch (_e) {
      return null;
    }
  }

  function el(tag, estilo, texto) {
    const e = document.createElement(tag);
    if (estilo) Object.assign(e.style, estilo);
    if (texto != null) e.textContent = texto;
    return e;
  }

  const LINEA = '1px solid rgba(127,127,127,.28)';
  const TENUE = { opacity: '.65', fontSize: '12px' };

  function pintarResumen(zona, r) {
    zona.textContent = '';

    const tarjeta = el('div', {
      background: 'rgba(127,127,127,.10)', borderRadius: '10px', padding: '10px 12px',
    });

    if (!r) {
      tarjeta.appendChild(el('div', TENUE, 'No se pudo cargar tu progreso.'));
      zona.appendChild(tarjeta);
      return;
    }

    // Rango: ORO I
    if (r.elo != null && r.liga) {
      const color = COLOR_LIGA[String(r.liga).toLowerCase()] || 'inherit';
      const rango = [r.liga, r.division].filter(Boolean).join(' ').toUpperCase();
      tarjeta.appendChild(el('div', {
        color, fontSize: '26px', fontWeight: '800', letterSpacing: '.06em', lineHeight: '1.1',
      }, rango));

      const pos = r.posicion != null && r.total_clasificados
        ? ` · #${fmt.format(r.posicion)} de ${fmt.format(r.total_clasificados)}`
        : '';
      tarjeta.appendChild(el('div', { ...TENUE, margin: '2px 0 0' }, `ELO ${fmt.format(r.elo)}${pos}`));
    } else {
      tarjeta.appendChild(el('div', { fontSize: '22px', fontWeight: '800', letterSpacing: '.06em', opacity: '.5' }, 'SIN RANGO'));
      tarjeta.appendChild(el('div', { ...TENUE, margin: '2px 0 0' }, 'Aún no tienes pasaporte'));
    }

    // Auracoins: 🪙 0 Auracoins
    const c = r.coin;
    const total = c && c.total != null ? fmt.format(c.total) : '—';
    const linea = el('div', { margin: '10px 0 0', display: 'flex', alignItems: 'baseline', gap: '6px' });
    linea.appendChild(el('span', { fontSize: '16px' }, '🪙'));
    linea.appendChild(el('b', { fontSize: '18px' }, total));
    linea.appendChild(el('span', { fontSize: '14px', opacity: '.8' }, 'Auracoins'));
    tarjeta.appendChild(linea);
    if (c && c.bloqueado) {
      tarjeta.appendChild(el('div', { ...TENUE, margin: '2px 0 0 28px' }, `${fmt.format(c.bloqueado)} bloqueadas`));
    }

    zona.appendChild(tarjeta);
  }

  function pintarSitios(zona, sitios) {
    zona.textContent = '';
    zona.appendChild(el('div', {
      fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', opacity: '.55', fontWeight: '600', margin: '0 0 4px',
    }, 'Sitios'));

    const quitarDev = (h) => h.replace(/^dev\./, '');
    sitios.forEach((s) => {
      const href = urlSegura(s.url);
      if (!href) return;
      const aqui = quitarDev(new URL(href).hostname) === quitarDev(location.hostname);
      const a = el('a', {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', margin: '0 -10px', borderRadius: '8px',
        color: 'inherit', textDecoration: 'none', fontSize: '15px', cursor: 'pointer',
        fontWeight: aqui ? '700' : '400',
      });
      a.href = href;
      a.setAttribute('role', 'menuitem');
      a.appendChild(el('span', { fontSize: '18px', width: '24px', textAlign: 'center' }, s.emoji || '🔗'));
      a.appendChild(el('span', { flex: '1' }, s.name));
      if (aqui) a.appendChild(el('span', TENUE, 'aquí'));
      a.addEventListener('mouseenter', () => { a.style.background = 'rgba(127,127,127,.16)'; });
      a.addEventListener('mouseleave', () => { a.style.background = 'none'; });
      zona.appendChild(a);
    });
  }

  /**
   * Agrega al menú el bloque de rango + Auracoins + sitios Aura.
   * @param {HTMLElement} menu   El menú ya creado y puesto en la página.
   * @param {object} client      La conexión del sitio (window.auraClient o window.coreDb).
   * @param {{antesDe?: HTMLElement}} [opciones]  Si se indica, el bloque queda antes de ese elemento.
   */
  async function pintar(menu, client, opciones = {}) {
    if (!menu || !client) return null;

    const bloque = el('div', { borderTop: LINEA, margin: '6px 0 0', padding: '10px 6px 4px' });
    bloque.setAttribute('data-aura-nav', '');
    const zonaResumen = el('div', { paddingBottom: '10px' });
    zonaResumen.appendChild(el('div', TENUE, 'Cargando…'));
    const zonaSitios = el('div', { paddingTop: '2px' });
    bloque.appendChild(zonaResumen);
    bloque.appendChild(zonaSitios);

    const ref = opciones.antesDe && opciones.antesDe.parentNode === menu ? opciones.antesDe : null;
    menu.insertBefore(bloque, ref);

    // Los sitios no dependen de la sesión: se pintan en cuanto llegan.
    cargarSitios(client).then((sitios) => { if (bloque.isConnected) pintarSitios(zonaSitios, sitios); });
    const resumen = await cargarResumen(client);
    if (bloque.isConnected) pintarResumen(zonaResumen, resumen);
    return bloque;
  }

  window.AuraNav = Object.freeze({ pintar, cargarResumen, cargarSitios });

  /*
   * Modo automático (como globo.js): el sitio solo carga este archivo y marca su menú:
   *
   *   <div data-aura-menu> ... <button data-aura-antes>Cerrar sesión</button> </div>
   *
   * Apenas aparece un elemento con data-aura-menu, el bloque se pinta solo. El elemento
   * data-aura-antes (opcional) indica antes de cuál botón va el bloque.
   * La conexión se toma de la que ya tenga el sitio (auraClient, auraLadraDb o coreDb).
   */
  function conexion() {
    return window.auraClient || window.auraLadraDb || window.coreDb || null;
  }

  function revisar(raiz) {
    const menus = raiz.matches && raiz.matches('[data-aura-menu]') ? [raiz] : [];
    if (raiz.querySelectorAll) menus.push(...raiz.querySelectorAll('[data-aura-menu]'));
    menus.forEach((m) => {
      if (m.querySelector('[data-aura-nav]')) return;
      const client = conexion();
      if (!client) return;
      pintar(m, client, { antesDe: m.querySelector('[data-aura-antes]') });
    });
  }

  function vigilar() {
    revisar(document);
    new MutationObserver((cambios) => {
      cambios.forEach((c) => c.addedNodes.forEach((n) => { if (n.nodeType === 1) revisar(n); }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigilar);
  else vigilar();
})();

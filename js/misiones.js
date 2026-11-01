// Misiones de LadraAura: el botón «i» del encabezado abre 3 misiones sencillas.
// Es la versión de Ladra del menú común de Convergencia; más adelante puede moverse a aura-hub.js.
// No hay recompensas ni Auracoins: solo una guía de primeros pasos con avance visible.
(() => {
  'use strict';
  const raiz = document.querySelector('[data-misiones]');
  const boton = raiz?.querySelector('[data-misiones-boton]');
  const panel = raiz?.querySelector('[data-misiones-panel]');
  if (!raiz || !boton || !panel) return;

  // Sitio común de misiones de Convergencia: mismo origen desde el que se cargó aura-hub.js (como la wallet),
  // así en la rama dev abre el /misiones de dev y en producción el de convergenciaaura.cl.
  const ORIGEN = (() => {
    try { return new URL(document.querySelector('script[src*="aura-hub.js"]').src).origin; } catch { return 'https://convergenciaaura.cl'; }
  })();
  const URL_MISIONES = `${ORIGEN}/misiones`;
  // Pago en AC de crear una mascota (aura_coin.parametro «aporte_base_mascota» × nivel «registrado» = 350, vigente al 16-oct-2026;
  // lo paga el trigger trg_aporte_creacion de ladra.animales). Con más verificación el multiplicador sube.
  // Invitar y apoyar la campaña no tienen pago definido en AC.
  const PAGO_MASCOTA_AC = 350;
  const nf = new Intl.NumberFormat('es-CL');
  let tasa = null;      // CLP por AC (fn_ac_resumen_publico); null = no disponible
  let abiertas = null;  // misiones abiertas de Convergencia (fn_ac_misiones_comunidad)
  const clienteAC = () => window.auraClient || window.auraLadraDb?.schema?.('public') || null;
  const clp = (ac) => (tasa ? ` (≈ $${nf.format(Math.round(ac * tasa))})` : '');
  async function leerAC() {
    const c = clienteAC();
    if (!c) return;
    try {
      const { data } = await c.rpc('fn_ac_resumen_publico');
      const t = Number(data?.equivalencia?.clp_por_moneda);
      tasa = Number.isFinite(t) && t > 0 ? t : null;
    } catch { tasa = null; }
    try {
      const { data } = await c.rpc('fn_ac_misiones_comunidad');
      abiertas = (data?.misiones || []).filter((m) => m.estado === 'abierta' && Number(m.cupos_libres) > 0);
    } catch { abiertas = null; }
    if (!panel.hidden) dibujar();
  }

  const sesion = () => window.auraLadraRed?.sesion?.() || null;
  const clave = () => `auraladra.misiones.v1.${sesion()?.user?.id || 'anon'}`;
  const leer = () => { try { return JSON.parse(window.localStorage.getItem(clave()) || '{}') || {}; } catch { return {}; } };
  const guardar = (marca) => { try { window.localStorage.setItem(clave(), JSON.stringify({ ...leer(), [marca]: true })); } catch { /* sin almacenamiento: la misión queda sin recordar */ } };

  let mascotas = 0;
  document.addEventListener('mascotas:cambio', (e) => { mascotas = (e.detail?.animales || []).length; dibujar(); });

  const urlInvitacion = () => `${window.location.origin}${window.location.pathname}`;
  const invitar = async () => {
    const url = urlInvitacion();
    const texto = 'Te invito a LadraAura: mascotas, ayuda y comunidad en tu barrio.';
    try {
      if (navigator.share) { await navigator.share({ title: 'LadraAura', text: texto, url }); guardar('invitar'); dibujar(); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); aviso('Enlace copiado. Pégalo en un mensaje a tu amistad.'); guardar('invitar'); dibujar(); }
    catch { window.prompt('Copia este enlace y envíaselo a tu amistad:', url); guardar('invitar'); dibujar(); }
  };
  let msg = '';
  const aviso = (t) => { msg = t; };

  const estado = () => {
    const logueado = Boolean(sesion()?.user);
    const marcas = leer();
    const propias = window.auraLadraRed?.propias?.() || [];
    const conMascota = logueado && (mascotas > 0 || propias.some((a) => !a.es_conmemorativa));
    const conAporte = logueado && (marcas.aportar || (window.auraLadraPuestos?.lista?.() || []).some((p) => p.social?.yo));
    return { logueado, misiones: [
      { id: 'mascota', titulo: 'Agrega tu mascota', ayuda: 'Crea su ficha en Mi cuenta.', hecha: conMascota, pago: `Paga desde ${nf.format(PAGO_MASCOTA_AC)} AC${clp(PAGO_MASCOTA_AC)}`, accion: { href: '#cuenta', texto: 'Ir a Mi cuenta' } },
      { id: 'invitar', titulo: 'Invita a un amigo', ayuda: 'Comparte el enlace de LadraAura. Se marca al compartirlo.', hecha: Boolean(marcas.invitar), pago: 'Sin pago en AC por ahora', accion: { boton: 'invitar', texto: 'Compartir invitación' } },
      { id: 'aportar', titulo: 'Apoya Comida y agua', ayuda: 'Da me gusta o comenta la campaña del puesto.', hecha: Boolean(conAporte), pago: 'Sin pago en AC por ahora', accion: { href: '#comida-agua', texto: 'Ver la campaña' } },
    ] };
  };

  function dibujar() {
    const { logueado, misiones } = estado();
    const hechas = misiones.filter((m) => m.hecha).length;
    boton.dataset.completas = String(hechas === misiones.length);
    boton.setAttribute('aria-label', `Misiones de LadraAura: ${hechas} de ${misiones.length} cumplidas`);
    const frag = document.createDocumentFragment();
    const cab = document.createElement('header');
    const h = document.createElement('h2'); h.textContent = 'Misiones de LadraAura';
    const prog = document.createElement('p'); prog.className = 'mis-prog'; prog.textContent = `${hechas} de ${misiones.length} cumplidas`;
    cab.append(h, prog); frag.append(cab);
    const todas = document.createElement('a'); todas.className = 'mis-enlace'; todas.href = URL_MISIONES; todas.rel = 'noopener'; todas.textContent = 'Ver todas las misiones de Convergencia Aura →'; frag.append(todas);
    if (!logueado) {
      const n = document.createElement('p'); n.className = 'mis-nota'; n.textContent = 'Inicia sesión (toca el logo) para que tus avances se guarden.'; frag.append(n);
    }
    const ol = document.createElement('ol'); ol.className = 'mis-lista';
    misiones.forEach((m) => {
      const li = document.createElement('li'); li.className = 'mis-item'; li.dataset.hecha = String(m.hecha);
      const marca = document.createElement('span'); marca.className = 'mis-marca'; marca.setAttribute('aria-hidden', 'true'); marca.textContent = m.hecha ? '✓' : '';
      const cuerpo = document.createElement('div');
      const t = document.createElement('strong'); t.textContent = m.titulo;
      const a = document.createElement('small'); a.textContent = m.hecha ? 'Cumplida' : m.ayuda;
      const pg = document.createElement('span'); pg.className = 'mis-pago'; pg.dataset.sin = String(!/^Paga/.test(m.pago)); pg.textContent = m.pago;
      cuerpo.append(t, a, pg);
      if (!m.hecha) {
        const el = m.accion.href ? document.createElement('a') : document.createElement('button');
        el.className = 'mis-accion'; el.textContent = m.accion.texto;
        if (m.accion.href) el.href = m.accion.href; else { el.type = 'button'; el.dataset.misionAccion = m.accion.boton; }
        cuerpo.append(el);
      }
      li.append(marca, cuerpo); ol.append(li);
    });
    frag.append(ol);
    const h3 = document.createElement('h3'); h3.className = 'mis-sub'; h3.textContent = 'Misiones abiertas en Convergencia Aura';
    frag.append(h3);
    if (abiertas === null) {
      const n = document.createElement('p'); n.className = 'mis-nota'; n.textContent = 'No pudimos cargarlas ahora. Míralas todas en el sitio de misiones.'; frag.append(n);
    } else if (!abiertas.length) {
      const n = document.createElement('p'); n.className = 'mis-nota'; n.textContent = 'Por ahora no hay misiones abiertas.'; frag.append(n);
    } else {
      const ul = document.createElement('ul'); ul.className = 'mis-ext';
      abiertas.slice(0, 3).forEach((m) => {
        const li = document.createElement('li');
        const t = document.createElement('strong'); t.textContent = String(m.titulo || '').slice(0, 90);
        const r = document.createElement('span'); r.className = 'mis-pago';
        const cupos = Number(m.cupos_libres) || 0;
        r.textContent = `Paga ${nf.format(Number(m.recompensa) || 0)} AC${clp(Number(m.recompensa) || 0)} · ${cupos} ${cupos === 1 ? 'cupo' : 'cupos'}`;
        li.append(t, r); ul.append(li);
      });
      frag.append(ul);
      if (abiertas.length > 3) { const n = document.createElement('p'); n.className = 'mis-nota'; n.textContent = `y ${abiertas.length - 3} más`; frag.append(n); }
    }
    {
      if (tasa) { const n = document.createElement('p'); n.className = 'mis-nota'; n.textContent = `Referencia: 1 AC ≈ $${nf.format(tasa)}. No garantizada ni retirable en pesos.`; frag.append(n); }
    }
    if (msg) { const p = document.createElement('p'); p.className = 'mis-nota'; p.setAttribute('role', 'status'); p.textContent = msg; frag.append(p); }
    panel.replaceChildren(frag);
  }

  const abrir = (si) => {
    panel.hidden = !si;
    boton.setAttribute('aria-expanded', String(si));
    if (si) { msg = ''; dibujar(); leerAC(); }
  };
  boton.addEventListener('click', () => abrir(panel.hidden));
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-mision-accion="invitar"]')) { invitar(); return; }
    if (e.target.closest('a.mis-accion')) abrir(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !raiz.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { abrir(false); boton.focus(); } });
  document.addEventListener('puestos:interaccion', () => { guardar('aportar'); dibujar(); });
  ['perfil:cambio', 'puestos:cambio', 'red:cambio'].forEach((n) => document.addEventListener(n, dibujar));
  dibujar();
})();

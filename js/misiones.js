// Misiones de LadraAura: el botón «i» del encabezado abre 3 misiones sencillas.
// Es la versión de Ladra del menú común de Convergencia; más adelante puede moverse a aura-hub.js.
// No hay recompensas ni Auracoins: solo una guía de primeros pasos con avance visible.
(() => {
  'use strict';
  const raiz = document.querySelector('[data-misiones]');
  const boton = raiz?.querySelector('[data-misiones-boton]');
  const panel = raiz?.querySelector('[data-misiones-panel]');
  if (!raiz || !boton || !panel) return;

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
      { id: 'mascota', titulo: 'Agrega tu mascota', ayuda: 'Crea su ficha en Mi cuenta.', hecha: conMascota, accion: { href: '#cuenta', texto: 'Ir a Mi cuenta' } },
      { id: 'invitar', titulo: 'Invita a un amigo', ayuda: 'Comparte el enlace de LadraAura. Se marca al compartirlo.', hecha: Boolean(marcas.invitar), accion: { boton: 'invitar', texto: 'Compartir invitación' } },
      { id: 'aportar', titulo: 'Apoya Comida y agua', ayuda: 'Da me gusta o comenta la campaña del puesto.', hecha: Boolean(conAporte), accion: { href: '#comida-agua', texto: 'Ver la campaña' } },
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
      cuerpo.append(t, a);
      if (!m.hecha) {
        const el = m.accion.href ? document.createElement('a') : document.createElement('button');
        el.className = 'mis-accion'; el.textContent = m.accion.texto;
        if (m.accion.href) el.href = m.accion.href; else { el.type = 'button'; el.dataset.misionAccion = m.accion.boton; }
        cuerpo.append(el);
      }
      li.append(marca, cuerpo); ol.append(li);
    });
    frag.append(ol);
    if (msg) { const p = document.createElement('p'); p.className = 'mis-nota'; p.setAttribute('role', 'status'); p.textContent = msg; frag.append(p); }
    panel.replaceChildren(frag);
  }

  const abrir = (si) => {
    panel.hidden = !si;
    boton.setAttribute('aria-expanded', String(si));
    if (si) { msg = ''; dibujar(); }
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

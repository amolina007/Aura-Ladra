// Calendario del Mapa. Junta en un solo lugar fechas que ya existen en el sitio:
//  · Ayudar: cierre de recaudación de cada acción (window.auraLadraAcciones)
//  · Most Wanted / Mascotas perdidas: fecha de pérdida (window.auraLadraAlertas)
//  · Comida y agua: última reposición de cada puesto (window.auraLadraPuestos)
//  · Eventos propios: se guardan solo en este navegador (modo demo; aún no hay servidor).
(() => {
  'use strict';
  const root = document.querySelector('[data-cal]');
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const KEY = 'auraladra.demo.eventos.v1';
  const TIPOS = {
    ayudar: 'Ayudar', perdida: 'Mascota perdida', puesto: 'Comida y agua', propio: 'Mi evento',
  };
  const MESES = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const DIA_LARGO = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const HORA = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' });
  const SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

  const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const valida = (d) => d instanceof Date && !Number.isNaN(d.getTime());
  const aFecha = (v) => { const d = new Date(v); return valida(d) ? d : null; };
  const el = (tag, cls, texto) => { const n = document.createElement(tag); if (cls) n.className = cls; if (texto != null) n.textContent = texto; return n; };

  let filtro = 'todos';
  let mes = new Date(); mes.setDate(1);
  let elegido = clave(new Date());
  let ubicacion = null;
  let externos = { ayudar: [], perdida: [], puesto: [] };

  // ---------- Eventos propios (demo) ----------
  const leer = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const escribir = (lista) => { try { localStorage.setItem(KEY, JSON.stringify(lista)); return true; } catch { return false; } };

  // ---------- Fuentes ----------
  const juntar = async () => {
    const ayudar = [];
    try {
      const acciones = await window.auraLadraAcciones?.calendario?.();
      (acciones || []).forEach((a) => {
        const d = aFecha(a.fecha_limite); if (!d) return;
        ayudar.push({ id: `ay-${a.id}`, tipo: 'ayudar', titulo: `Cierra la recaudación: ${a.titulo}`, fecha: d, conHora: true, lugar: a.comuna || '', detalle: '', ir: 'ayudar' });
      });
    } catch { /* sin acciones todavía */ }
    const perdida = (window.auraLadraAlertas || []).map((a) => {
      const d = aFecha(a.perdida_en); if (!d) return null;
      return { id: `pe-${a.id}`, tipo: 'perdida', titulo: `Se perdió ${a.nombre}`, fecha: d, conHora: true, lugar: a.direccion_publica || '', detalle: a.descripcion || '', ir: 'mapa', filtroMapa: 'mascota_perdida' };
    }).filter(Boolean);
    const puesto = (window.auraLadraPuestos?.lista?.() || []).map((p) => {
      const d = aFecha(p.ultima_reposicion); if (!d) return null;
      return { id: `pu-${p.id}`, tipo: 'puesto', titulo: `Reposición en ${p.nombre}`, fecha: d, conHora: false, lugar: p.direccion_publica || '', detalle: p.necesidad || '', ir: 'mapa', filtroMapa: 'puesto' };
    }).filter(Boolean);
    externos = { ayudar, perdida, puesto };
  };

  const todos = () => {
    const propios = leer().map((e) => {
      const d = aFecha(e.fecha); if (!d) return null;
      return { id: e.id, tipo: 'propio', titulo: e.titulo, fecha: d, conHora: !!e.hora, lugar: e.lugar || '', detalle: e.detalle || '', lat: e.lat, lng: e.lng, ir: 'mapa' };
    }).filter(Boolean);
    return [...externos.ayudar, ...externos.perdida, ...externos.puesto, ...propios]
      .filter((e) => filtro === 'todos' || e.tipo === filtro)
      .sort((a, b) => a.fecha - b.fecha);
  };
  const porDia = () => {
    const m = new Map();
    todos().forEach((e) => { const k = clave(e.fecha); if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
    return m;
  };

  // ---------- Dibujo ----------
  const dibujarCuadricula = (mapaDias) => {
    const grid = $('[data-cal-grid]');
    grid.replaceChildren();
    SEMANA.forEach((s) => grid.append(el('div', 'cal-sem', s)));
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const desfase = (primero.getDay() + 6) % 7;
    const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    for (let i = 0; i < desfase; i += 1) grid.append(el('div', 'cal-vacio'));
    const hoy = clave(new Date());
    for (let n = 1; n <= dias; n += 1) {
      const f = new Date(mes.getFullYear(), mes.getMonth(), n);
      const k = clave(f);
      const evs = mapaDias.get(k) || [];
      const b = el('button', 'cal-dia-btn');
      b.type = 'button';
      b.dataset.calDia = k;
      if (k === hoy) b.classList.add('es-hoy');
      if (k === elegido) { b.classList.add('es-elegido'); b.setAttribute('aria-pressed', 'true'); } else b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `${DIA_LARGO.format(f)}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'evento' : 'eventos'}` : ''}`);
      b.append(el('span', 'cal-n', String(n)));
      const puntos = el('span', 'cal-puntos');
      [...new Set(evs.map((e) => e.tipo))].slice(0, 4).forEach((t) => puntos.append(el('span', `cal-punto t-${t}`)));
      b.append(puntos);
      grid.append(b);
    }
  };

  const accion = (txt, fn, cls = 'cal-link') => { const b = el('button', cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; };

  const irA = (e) => {
    if (e.filtroMapa) document.querySelector(`[data-place-filter="${e.filtroMapa}"]`)?.click();
    if (e.ir === 'mapa') { mostrarPanel('mapa'); window.auraLadraVistas?.ir('mapa'); } else window.auraLadraVistas?.ir(e.ir);
    window.scrollTo?.({ top: 0 });
  };

  const dibujarDia = (mapaDias) => {
    const [y, m, d] = elegido.split('-').map(Number);
    const f = new Date(y, m - 1, d);
    const t = DIA_LARGO.format(f);
    $('[data-cal-dia-titulo]').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    const ul = $('[data-cal-dia-lista]');
    ul.replaceChildren();
    const evs = mapaDias.get(elegido) || [];
    if (!evs.length) { ul.append(el('li', 'cal-sin', 'Sin eventos este día.')); return; }
    evs.forEach((e) => {
      const li = el('li', `cal-ev t-${e.tipo}`);
      const cab = el('div', 'cal-ev-cab');
      cab.append(el('span', `cal-punto t-${e.tipo}`), el('span', 'cal-ev-tipo', TIPOS[e.tipo]));
      if (e.conHora) cab.append(el('span', 'cal-ev-hora', HORA.format(e.fecha)));
      li.append(cab, el('strong', 'cal-ev-titulo', e.titulo));
      if (e.lugar) li.append(el('span', 'cal-ev-lugar', e.lugar));
      if (e.detalle) li.append(el('span', 'cal-ev-detalle', e.detalle));
      const fila = el('div', 'cal-ev-acc');
      if (e.tipo === 'ayudar') fila.append(accion('Ir a Ayudar', () => irA(e)));
      else if (e.tipo === 'propio') {
        if (typeof e.lat === 'number') fila.append(accion('Ver en el mapa', () => irA(e)));
        fila.append(accion('Eliminar', () => { escribir(leer().filter((x) => x.id !== e.id)); dibujar(); }, 'cal-link cal-eliminar'));
      } else fila.append(accion('Ver en el mapa', () => irA(e)));
      li.append(fila);
      ul.append(li);
    });
  };

  const dibujar = () => {
    const t = MESES.format(mes);
    $('[data-cal-mes]').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    const mapaDias = porDia();
    dibujarCuadricula(mapaDias);
    dibujarDia(mapaDias);
  };

  // ---------- Pestañas Mapa | Calendario ----------
  function mostrarPanel(nombre) {
    document.querySelectorAll('[data-mapa-tab]').forEach((b) => {
      const on = b.dataset.mapaTab === nombre;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('[data-mapa-panel]').forEach((p) => { p.hidden = p.dataset.mapaPanel !== nombre; });
    if (nombre === 'calendario') refrescar();
    else document.dispatchEvent(new CustomEvent('vista:cambio', { detail: { vista: 'mapa' } }));
  }
  const refrescar = async () => { await juntar(); dibujar(); };

  document.querySelectorAll('[data-mapa-tab]').forEach((b) => {
    b.addEventListener('click', () => mostrarPanel(b.dataset.mapaTab));
    b.addEventListener('keydown', (ev) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
      const otro = document.querySelector(`[data-mapa-tab]:not([data-mapa-tab="${b.dataset.mapaTab}"])`);
      otro?.focus(); otro?.click();
    });
  });

  // ---------- Controles ----------
  $('[data-cal-prev]').addEventListener('click', () => { mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); dibujar(); });
  $('[data-cal-sig]').addEventListener('click', () => { mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); dibujar(); });
  $('[data-cal-hoy]').addEventListener('click', () => { const h = new Date(); mes = new Date(h.getFullYear(), h.getMonth(), 1); elegido = clave(h); dibujar(); });
  $('[data-cal-grid]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cal-dia]'); if (!b) return;
    elegido = b.dataset.calDia; dibujar();
    $(`[data-cal-dia="${elegido}"]`)?.focus();
  });
  root.querySelectorAll('[data-cal-filtro]').forEach((c) => c.addEventListener('click', () => {
    filtro = c.dataset.calFiltro;
    root.querySelectorAll('[data-cal-filtro]').forEach((x) => { const on = x === c; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
    dibujar();
  }));

  // ---------- Evento propio ----------
  const dialogo = document.querySelector('[data-cal-dialog]');
  const form = document.querySelector('[data-cal-form]');
  const msg = document.querySelector('[data-cal-message]');
  const aviso = (t, tipo) => { msg.textContent = t; msg.className = `action-feedback${tipo ? ` is-${tipo}` : ''}`; };
  $('[data-cal-nuevo]').addEventListener('click', () => {
    form.reset(); ubicacion = null; aviso('');
    form.elements.fecha.value = elegido;
    dialogo.showModal?.() ?? dialogo.setAttribute('open', '');
  });
  document.querySelector('[data-cal-close]')?.addEventListener('click', () => dialogo.close());
  document.querySelector('[data-cal-ubicar]')?.addEventListener('click', () => {
    if (!navigator.geolocation) { aviso('Tu navegador no permite obtener la ubicación.', 'error'); return; }
    aviso('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => { ubicacion = { lat: p.coords.latitude, lng: p.coords.longitude }; aviso('Ubicación agregada al evento.', 'success'); },
      () => aviso('No pudimos obtener tu ubicación. Revisa el permiso del navegador o escribe el lugar.', 'error'),
      { timeout: 10000 },
    );
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = form.elements;
    const titulo = f.titulo.value.trim();
    if (!titulo) { aviso('Escribe un título.', 'error'); return; }
    if (!f.fecha.value) { aviso('Elige una fecha.', 'error'); return; }
    const fecha = f.hora.value ? `${f.fecha.value}T${f.hora.value}` : `${f.fecha.value}T00:00`;
    const nuevo = { id: `ev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, titulo, fecha, hora: !!f.hora.value, lugar: f.lugar.value.trim(), detalle: f.detalle.value.trim() };
    if (ubicacion) { nuevo.lat = ubicacion.lat; nuevo.lng = ubicacion.lng; }
    if (!escribir([...leer(), nuevo])) { aviso('No se pudo guardar en este navegador.', 'error'); return; }
    const d = aFecha(fecha);
    elegido = clave(d); mes = new Date(d.getFullYear(), d.getMonth(), 1);
    dialogo.close(); dibujar();
  });

  ['alertas:cambio', 'acciones:listas', 'puestos:cambio', 'ayuda:cambio'].forEach((n) => document.addEventListener(n, () => { if (!root.hidden) refrescar(); }));
  window.auraLadraEventos = { todos, abrir: () => { mostrarPanel('calendario'); window.auraLadraVistas?.ir('mapa'); } };
})();

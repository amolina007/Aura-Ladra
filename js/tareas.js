// Ayudar → «Acciones concretas»: tareas pequeñas (difundir, limpiar, reparar, reponer, acompañar).
// Cada ayuda entrega Aura Coins; la persona decide quedárselas o abonarlas al proyecto de la tarea.
// MODO DEMO: tareas y monedas viven solo en este navegador. En la versión real la ayuda debe validarla
// alguien del proyecto antes de entregar las monedas, y el abono lo registra el servidor.
(() => {
  'use strict';
  const root = document.querySelector('[data-tareas]');
  if (!root) return;
  const KEY = 'auraladra.demo.tareas.v1';
  const TASA_CLP = 100; // demo: 1 Aura Coin abonada = $100 al avance del proyecto
  const TIPOS = { difundir: 'Difundir', limpiar: 'Limpiar', reparar: 'Reparar', reponer: 'Reponer', acompanar: 'Acompañar' };
  const GLIFO = { difundir: '📣', limpiar: '🧹', reparar: '🛠️', reponer: '💧', acompanar: '🐕' };

  const TAREAS = [
    { id: 't-difundir-accion', tipo: 'difundir', titulo: 'Difunde en redes la búsqueda de un hogar', desc: 'Comparte en tus redes la publicación de un gato en adopción con su foto y el enlace de AuraLadra.', lugar: 'Redes sociales', coins: 5, proyecto: { tipo: 'accion', id: 'demo-8', nombre: 'Traslado de un gato a su adopción' } },
    { id: 't-afiche', tipo: 'difundir', titulo: 'Pega un afiche de mascota perdida', desc: 'Imprime el afiche y pégalo en comercios y paraderos del sector donde se perdió.', lugar: 'Maipú centro', coins: 6, proyecto: null },
    { id: 't-limpiar-canil', tipo: 'limpiar', titulo: 'Limpia el espacio del bebedero del Parque 3 Poniente', desc: 'Retira basura, barre y enjuaga el bebedero y su alrededor.', lugar: 'Parque 3 Poniente', coins: 10, proyecto: { tipo: 'puesto', id: 'parque-3-poniente', nombre: 'Parque 3 Poniente · bebedero' } },
    { id: 't-reparar-bebedero', tipo: 'reparar', titulo: 'Repara el bebedero del Parque 3 Poniente', desc: 'Sella la fuga y cambia la tapa del bebedero. Los materiales básicos los pones tú o los coordina el cuidador.', lugar: 'Parque 3 Poniente', coins: 20, proyecto: { tipo: 'puesto', id: 'parque-3-poniente', nombre: 'Parque 3 Poniente · bebedero' } },
    { id: 't-reponer-plaza', tipo: 'reponer', titulo: 'Repón agua y alimento en la Plaza de Maipú', desc: 'Cambia el agua, rellena el comedero y envía una foto de cómo quedó.', lugar: 'Plaza de Maipú', coins: 8, proyecto: { tipo: 'puesto', id: 'plaza-maipu', nombre: 'Plaza de Maipú · puesto de agua y comida' } },
    { id: 't-pasear', tipo: 'acompanar', titulo: 'Saca a pasear a un perro del canil', desc: 'Una hora de paseo con uno de los perros del canil, con correa y bolsas incluidas.', lugar: 'Canil Parque 3 Poniente', coins: 12, proyecto: { tipo: 'accion', id: 'demo-7', nombre: 'Vacunas para 12 perros del canil' } },
  ];

  const leer = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && Array.isArray(v.hechas)) return v; } catch { /* sin almacenamiento */ } return { hechas: [] }; };
  let estado = leer();
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch { /* sin almacenamiento */ } };
  const hecha = (id) => estado.hechas.find((h) => h.id === id);
  const total = () => estado.hechas.reduce((s, h) => s + (h.destino === 'mias' ? h.coins : 0), 0);
  const abonadas = () => estado.hechas.reduce((s, h) => s + (h.destino === 'abonar' ? h.coins : 0), 0);
  const clp = new Intl.NumberFormat('es-CL');
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const chip = (txt, cls = '') => el('span', `chip ${cls}`.trim(), txt);

  let filtro = 'todas';
  const $ = (s) => root.querySelector(s);

  const dibujarMonedero = () => {
    const m = $('[data-tareas-monedero]');
    m.replaceChildren();
    const a = el('span', 'tareas-coins'); a.append(el('strong', null, String(total())), document.createTextNode(' Aura Coins tuyas'));
    m.append(a);
    if (abonadas()) m.append(el('span', 'tareas-abonadas', `${abonadas()} abonadas a proyectos`));
  };

  const dibujarFiltros = () => {
    const box = $('[data-tareas-filtros]');
    box.replaceChildren();
    [['todas', 'Todas'], ...Object.entries(TIPOS)].forEach(([k, t]) => {
      const b = el('button', `cal-chip${k === filtro ? ' is-active' : ''}`, t);
      b.type = 'button'; b.setAttribute('aria-pressed', String(k === filtro));
      b.addEventListener('click', () => { filtro = k; dibujarFiltros(); dibujarLista(); });
      box.append(b);
    });
  };

  const dibujarLista = () => {
    const box = $('[data-tareas-lista]');
    box.replaceChildren();
    TAREAS.filter((t) => filtro === 'todas' || t.tipo === filtro).forEach((t) => {
      const h = hecha(t.id);
      const c = el('article', `tarea${h ? ' es-hecha' : ''}`);
      const cab = el('div', 'tarea-cab');
      cab.append(el('span', 'tarea-glifo', GLIFO[t.tipo]), chip('Demo', 'is-gris'), chip(TIPOS[t.tipo]), chip(`+${t.coins} Aura Coins`, 'is-ambar'));
      c.append(cab, el('h4', null, t.titulo), el('p', null, t.desc), el('p', 'tarea-lugar', `📍 ${t.lugar}`));
      if (t.proyecto) c.append(el('p', 'tarea-proyecto', `Puedes abonarlas a: ${t.proyecto.nombre}`));
      if (h) {
        c.append(el('p', 'tarea-ok', h.destino === 'abonar' ? `Hecha. Abonaste ${h.coins} Aura Coins a «${t.proyecto?.nombre}».` : `Hecha. Ganaste ${h.coins} Aura Coins.`));
      } else {
        const b = el('button', 'button-verde', 'Hice esta ayuda'); b.type = 'button';
        b.addEventListener('click', () => abrir(t));
        c.append(b);
      }
      box.append(c);
    });
  };

  // ---------- Diálogo ----------
  const dlg = document.querySelector('[data-tarea-dialog]');
  const form = document.querySelector('[data-tarea-form]');
  const msg = document.querySelector('[data-tarea-message]');
  let actual = null;
  const abrir = (t) => {
    actual = t; form.reset(); msg.textContent = '';
    document.querySelector('[data-tarea-resumen]').textContent = `${t.titulo} · +${t.coins} Aura Coins`;
    const op = form.elements.destino[1].closest('label');
    op.hidden = !t.proyecto;
    document.querySelector('[data-tarea-abono-txt]').textContent = t.proyecto ? `Abonarlas a «${t.proyecto.nombre}» (≈ $${clp.format(t.coins * TASA_CLP)} para el proyecto)` : '';
    dlg.showModal?.() ?? dlg.setAttribute('open', '');
  };
  document.querySelector('[data-tarea-close]')?.addEventListener('click', () => dlg.close());
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!actual || hecha(actual.id)) { dlg.close(); return; }
    const destino = actual.proyecto && form.elements.destino.value === 'abonar' ? 'abonar' : 'mias';
    estado.hechas.push({ id: actual.id, coins: actual.coins, destino, nota: form.elements.nota.value.trim(), fecha: new Date().toISOString() });
    guardar();
    if (destino === 'abonar') document.dispatchEvent(new CustomEvent('tareas:abono', { detail: { tipo: actual.proyecto.tipo, id: actual.proyecto.id, clp: actual.coins * TASA_CLP } }));
    document.dispatchEvent(new CustomEvent('tareas:cambio'));
    dlg.close(); dibujarMonedero(); dibujarLista();
  });

  dibujarMonedero(); dibujarFiltros(); dibujarLista();
  window.auraLadraTareas = { monedas: total, abonadas, hechas: () => estado.hechas.slice() };
})();

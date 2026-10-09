// Comida y agua: puestos de agua y alimento en espacios públicos.
// Primera versión: MODO DEMO. Los puestos de esta lista son ejemplos guardados solo en este navegador
// (localStorage); todavía no se usa Supabase. Los aportes son una SIMULACIÓN: no se cobra ni se mueve dinero.
// Los puestos nuevos los agregará moderación (aún no existe ese panel).
(() => {
  'use strict';

  const root = document.querySelector('[data-puestos]');
  if (!root) return;

  // ---------- Utilidades ----------
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(iso)) : 'sin registro');
  // La política de seguridad del sitio (CSP) no permite style="..." dentro del HTML: el ancho de las barras se fija desde JS.
  const aplicarAnchos = (contenedor) => contenedor?.querySelectorAll('[data-ancho]').forEach((barra) => { barra.style.width = `${barra.dataset.ancho}%`; });
  const chip = (texto, clase = '') => `<span class="chip ${clase}">${esc(texto)}</span>`;

  const TIPOS = { agua: 'Agua', comida: 'Comida', ambos: 'Agua y comida' };
  const ICONOS = { agua: '💧', comida: '🍖', ambos: '💧🍖' };
  const ESTADOS = { activo: 'Funcionando', necesita_ayuda: 'Necesita ayuda' };
  const MONTOS = [2000, 5000, 10000, 20000];
  const YO = 'Tú (demo)';
  // Montos de ejemplo para el aporte en Auracoins (provisorios: aún no hay montos ni límites definidos).
  const MONTOS_AC = [1, 5, 10, 20];
  const nAC = new Intl.NumberFormat('es-CL');

  // ---------- Datos de ejemplo (solo navegador) ----------
  const KEY = 'auraladra.demo.puestos.v1';
  const DIA = 86400000;
  let mem = null;

  const semilla = () => {
    const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString();
    return {
      puestos: [
        { id: 'plaza-maipu', ejemplo: true, nombre: 'Plaza de Maipú · puesto de agua y comida (ejemplo)', tipo: 'ambos', estado: 'activo', descripcion: 'Bebedero y comedero junto a las bancas de la plaza, pensados para perros y gatos comunitarios.', necesidad: 'Alimento seco para 30 días y cambio semanal del agua.', direccion_publica: 'Plaza de Maipú, Maipú', comuna: 'Maipú', latitud: -33.5107, longitud: -70.7578, meta_clp: 30000, recaudado_clp: 12000, ultima_reposicion: hace(2), cuidadores: [{ alias: 'Vecina de ejemplo' }] },
        { id: 'parque-3-poniente', ejemplo: true, nombre: 'Parque 3 Poniente · bebedero (ejemplo)', tipo: 'agua', estado: 'necesita_ayuda', descripcion: 'Bebedero a la entrada del canil. El agua se acaba rápido en verano.', necesidad: 'Reponer agua a diario y limpiar el bebedero cada semana.', direccion_publica: 'Cerca del canil, Av. 3 Poniente, Maipú', comuna: 'Maipú', latitud: -33.5143, longitud: -70.7612, meta_clp: 15000, recaudado_clp: 3000, ultima_reposicion: hace(6), cuidadores: [] },
        { id: 'pajaritos-comedero', ejemplo: true, nombre: 'Av. Pajaritos · comedero comunitario (ejemplo)', tipo: 'comida', estado: 'activo', descripcion: 'Comedero techado para gatos de la colonia del barrio.', necesidad: 'Alimento húmedo y seco para gatos, y limpieza semanal.', direccion_publica: 'Vereda de Av. Pajaritos, Maipú', comuna: 'Maipú', latitud: -33.5072, longitud: -70.7555, meta_clp: 25000, recaudado_clp: 25000, ultima_reposicion: hace(1), cuidadores: [{ alias: 'Cuidador de ejemplo' }, { alias: 'Vecino de ejemplo' }] },
      ],
      aportes: [],
    };
  };

  const cargar = () => {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY));
      if (v?.puestos) return v;
    } catch { /* sin almacenamiento o datos dañados */ }
    return semilla();
  };
  const datos = () => { if (!mem) mem = cargar(); return mem; };
  const guardar = () => { try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* sin almacenamiento */ } };
  const avisarCambio = () => document.dispatchEvent(new CustomEvent('puestos:cambio'));

  const buscar = (id) => datos().puestos.find((p) => p.id === id) || null;
  const porcentaje = (p) => Math.min(100, Math.round((p.recaudado_clp / p.meta_clp) * 100));
  const cuido = (p) => p.cuidadores.some((c) => c.alias === YO);

  // ---------- Puente con el mapa (js/main.js) ----------
  const comoLugar = (p) => ({
    id: `puesto-${p.id}`,
    puesto_id: p.id,
    slug: `puesto-${p.id}`,
    nombre: p.nombre,
    descripcion: `${TIPOS[p.tipo]} · ${ESTADOS[p.estado]}. ${p.descripcion}`,
    direccion_publica: p.direccion_publica,
    comuna: p.comuna,
    categoria: 'puesto',
    estado_verificacion: 'comunitario',
    latitud: p.latitud,
    longitud: p.longitud,
    publicado: true,
    servicio_urgencia: false,
    urgencia_24h: false,
    precision_ubicacion: 'aproximada',
  });

  // ---------- Elementos ----------
  const el = {
    lista: root.querySelector('[data-puestos-lista]'),
    detalle: root.querySelector('[data-puestos-detalle]'),
    vistaLista: root.querySelector('[data-puestos-vista-lista]'),
    filtros: root.querySelector('[data-puestos-filtros]'),
    modo: root.querySelector('[data-puestos-modo]'),
  };
  const resumen = document.querySelector('[data-puestos-resumen]');

  // ---------- Tarjeta ----------
  const tarjeta = (p) => {
    const pct = porcentaje(p);
    return `<article class="accion-card">
      <div class="accion-meta">${chip(`${ICONOS[p.tipo]} ${TIPOS[p.tipo]}`)}${chip(ESTADOS[p.estado], p.estado === 'necesita_ayuda' ? 'is-ambar' : '')}${p.ejemplo ? chip('Ejemplo', 'is-sim') : ''}</div>
      <h3>${esc(p.nombre)}</h3>
      <p>${esc(p.direccion_publica)}</p>
      <div>
        <div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Patrocinio del mes"><span data-ancho="${pct}"></span></div>
        <p class="progreso-texto"><span><strong>${clp.format(p.recaudado_clp)}</strong> de ${clp.format(p.meta_clp)} este mes</span><span>${pct}%</span></p>
      </div>
      <p>${p.cuidadores.length ? `${p.cuidadores.length} ${p.cuidadores.length === 1 ? 'persona lo cuida' : 'personas lo cuidan'}` : 'Aún nadie lo cuida en persona'} · Última reposición: ${esc(fecha(p.ultima_reposicion))}</p>
      <div class="mini-acciones">
        <button class="button-verde" type="button" data-puesto-abrir="${esc(p.id)}">Ayudar</button>
        <button class="button-borde" type="button" data-puesto-mapa="${esc(p.id)}">Ver en el mapa</button>
      </div>
    </article>`;
  };

  // ---------- Lista ----------
  const filtrados = () => {
    const f = el.filtros ? new FormData(el.filtros) : new FormData();
    const tipo = f.get('tipo') || '';
    const estado = f.get('estado') || '';
    return datos().puestos.filter((p) => (!tipo || p.tipo === tipo || (tipo !== 'ambos' && p.tipo === 'ambos')) && (!estado || p.estado === estado));
  };

  const renderLista = () => {
    if (!el.lista) return;
    const rows = filtrados();
    el.lista.innerHTML = rows.length
      ? rows.map(tarjeta).join('')
      : '<p class="ayudar-vacio">No hay puestos con estos filtros. Prueba con otros.</p>';
    aplicarAnchos(el.lista);
  };

  // ---------- Resumen dentro de Ayudar ----------
  const renderResumen = () => {
    if (!resumen) return;
    const necesitan = datos().puestos.filter((p) => p.estado === 'necesita_ayuda');
    const otros = datos().puestos.filter((p) => p.estado !== 'necesita_ayuda');
    const mostrar = [...necesitan, ...otros].slice(0, 3);
    resumen.hidden = !mostrar.length;
    if (!mostrar.length) return;
    resumen.innerHTML = `
      <div class="section-heading">
        <p class="kicker">Comida y agua</p>
        <h3 id="puestos-resumen-title">Puestos de agua y alimento</h3>
        <p>${necesitan.length ? `${necesitan.length} ${necesitan.length === 1 ? 'puesto necesita' : 'puestos necesitan'} ayuda ahora. ` : ''}Puedes patrocinarlos o ayudar a mantenerlos en persona.</p>
      </div>
      <div class="ayudar-lista">${mostrar.map(tarjeta).join('')}</div>
      <p><a class="button-borde" href="#comida-agua">Ver todos los puestos →</a></p>`;
    aplicarAnchos(resumen);
  };

  // ---------- Detalle ----------
  let montoElegido = 0;
  let acElegido = 0;
  let abierto = null;
  const mensaje = (texto, tipo = '') => {
    const m = el.detalle?.querySelector('[data-puesto-msg]');
    if (!m) return;
    m.textContent = texto;
    m.className = `ayudar-msg${tipo ? ` is-${tipo}` : ''}`;
  };

  const renderDetalle = (aviso) => {
    const p = buscar(abierto);
    if (!p || !el.detalle) return;
    const pct = porcentaje(p);
    const lleno = p.recaudado_clp >= p.meta_clp;
    const yoCuido = cuido(p);
    el.detalle.innerHTML = `
      <button class="button-borde detalle-volver" type="button" data-puesto-volver>← Volver a los puestos</button>
      <div class="accion-meta">${chip(`${ICONOS[p.tipo]} ${TIPOS[p.tipo]}`)}${chip(ESTADOS[p.estado], p.estado === 'necesita_ayuda' ? 'is-ambar' : '')}${p.ejemplo ? chip('Ejemplo', 'is-sim') : ''}</div>
      <h3>${esc(p.nombre)}</h3>
      <p>${esc(p.descripcion)}</p>
      <p><strong>Dónde:</strong> ${esc(p.direccion_publica)} · <button class="button-borde" type="button" data-puesto-mapa="${esc(p.id)}">Ver en el mapa</button></p>

      <div class="detalle-bloque">
        <h4>Qué necesita</h4>
        <p>${esc(p.necesidad)}</p>
        <div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Patrocinio del mes"><span data-ancho="${pct}"></span></div>
        <p class="progreso-texto"><span><strong>${clp.format(p.recaudado_clp)}</strong> de ${clp.format(p.meta_clp)} este mes</span><span>${pct}%</span></p>
        ${lleno ? '<p class="ayudar-msg is-success">La meta del mes ya está cubierta. Igual puedes seguir aportando o ayudar en persona.</p>' : ''}
      </div>

      <div class="detalle-bloque">
        <h4>Patrocinar este puesto</h4>
        <div class="aportar-panel">
          <p>Elige un monto para el alimento, el agua y la mantención del mes.</p>
          <div class="montos" role="group" aria-label="Monto del aporte">
            ${MONTOS.map((m) => `<button class="monto-btn" type="button" data-puesto-monto="${m}" aria-pressed="${montoElegido === m}">${clp.format(m)}</button>`).join('')}
          </div>
          <p><small>Es una <strong>simulación</strong>: no se cobra dinero. Es un aporte solidario para sostener este puesto; no ofrece intereses ni retornos.</small></p>
          <button class="button-verde" type="button" data-puesto-aportar ${montoElegido ? '' : 'disabled'}>Confirmar aporte (simulación)</button>
        </div>
      </div>

      <div class="detalle-bloque">
        <h4>Aportar Auracoins al Fondo de AuraLadra</h4>
        <div class="aportar-panel">
          <p>Tus Auracoins van al <strong>Fondo de AuraLadra</strong>, que se usa para sostener los puestos; no se asignan a este puesto en particular.</p>
          <p>Fondo en la demostración: <strong>🪙 ${nAC.format(datos().fondo_ac || 0)} AC</strong></p>
          <div class="montos" role="group" aria-label="Monto en Auracoins">
            ${MONTOS_AC.map((m) => `<button class="monto-btn" type="button" data-puesto-ac="${m}" aria-pressed="${acElegido === m}">🪙 ${m} AC</button>`).join('')}
          </div>
          <p><small>Es una <strong>simulación</strong>: no se mueven Auracoins reales. Es un aporte solidario; no ofrece intereses ni retornos.</small></p>
          <button class="button-verde" type="button" data-puesto-aportar-ac ${acElegido ? '' : 'disabled'}>Confirmar aporte en AC (simulación)</button>
        </div>
      </div>

      <div class="detalle-bloque">
        <h4>Cuidarlo en persona</h4>
        <p>${p.cuidadores.length ? `Lo cuidan: ${p.cuidadores.map((c) => esc(c.alias)).join(', ')}.` : 'Todavía nadie lo cuida en persona.'}</p>
        <p>Última reposición: <strong>${esc(fecha(p.ultima_reposicion))}</strong></p>
        <div class="mini-acciones">
          <button class="button-verde" type="button" data-puesto-cuidar>${yoCuido ? 'Dejar de cuidarlo' : 'Quiero cuidarlo'}</button>
          <button class="button-borde" type="button" data-puesto-reponer ${yoCuido ? '' : 'disabled'}>Registrar reposición</button>
          ${p.estado === 'activo' ? '<button class="button-borde" type="button" data-puesto-falta>Avisar que falta</button>' : ''}
        </div>
        ${yoCuido ? '' : '<p><small>Para registrar una reposición primero anótate como cuidador.</small></p>'}
      </div>

      <p class="ayudar-msg" data-puesto-msg role="status"></p>`;
    aplicarAnchos(el.detalle);
    if (aviso) mensaje(aviso.texto, aviso.tipo);
  };

  const abrir = (id, { desdeFuera = false } = {}) => {
    if (!buscar(id)) return;
    abierto = id;
    montoElegido = 0;
    acElegido = 0;
    if (desdeFuera) window.auraLadraVistas?.ir('comida-agua');
    if (el.vistaLista) el.vistaLista.hidden = true;
    if (el.detalle) el.detalle.hidden = false;
    renderDetalle();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const cerrar = () => {
    abierto = null;
    if (el.detalle) { el.detalle.hidden = true; el.detalle.replaceChildren(); }
    if (el.vistaLista) el.vistaLista.hidden = false;
    renderLista();
  };

  const cambiado = (aviso) => {
    guardar();
    renderLista();
    renderResumen();
    renderDetalle(aviso);
    avisarCambio();
  };

  // ---------- Acciones ----------
  const aportar = () => {
    const p = buscar(abierto);
    if (!p || !MONTOS.includes(montoElegido)) return;
    p.recaudado_clp += montoElegido;
    datos().aportes.push({ puesto_id: p.id, monto_clp: montoElegido, simulado: true, creado_en: new Date().toISOString() });
    const monto = montoElegido;
    montoElegido = 0;
    cambiado({ texto: `Gracias: registramos tu aporte simulado de ${clp.format(monto)}. No se cobró dinero.`, tipo: 'success' });
  };

  const aportarAC = () => {
    if (!MONTOS_AC.includes(acElegido)) return;
    const d = datos();
    d.fondo_ac = (d.fondo_ac || 0) + acElegido;
    d.aportes.push({ fondo: 'auraladra', monto_ac: acElegido, simulado: true, creado_en: new Date().toISOString() });
    const monto = acElegido;
    acElegido = 0;
    cambiado({ texto: `Gracias: registramos tu aporte simulado de ${nAC.format(monto)} AC al Fondo de AuraLadra. No se movieron Auracoins reales.`, tipo: 'success' });
  };

  const alternarCuidado = () => {
    const p = buscar(abierto);
    if (!p) return;
    if (cuido(p)) p.cuidadores = p.cuidadores.filter((c) => c.alias !== YO);
    else p.cuidadores.push({ alias: YO });
    cambiado({ texto: cuido(p) ? 'Listo: te anotaste como cuidador de este puesto.' : 'Dejaste de cuidar este puesto.', tipo: 'success' });
  };

  const reponer = () => {
    const p = buscar(abierto);
    if (!p || !cuido(p)) return;
    p.ultima_reposicion = new Date().toISOString();
    p.estado = 'activo';
    cambiado({ texto: 'Gracias por reponer. Registramos la fecha y el puesto quedó como funcionando.', tipo: 'success' });
  };

  const avisarFalta = () => {
    const p = buscar(abierto);
    if (!p) return;
    p.estado = 'necesita_ayuda';
    cambiado({ texto: 'Avisamos que este puesto necesita ayuda. Ahora aparece primero en Ayudar.', tipo: 'success' });
  };

  const verEnMapa = () => {
    document.querySelector('[data-place-filter="puesto"]')?.click();
    window.auraLadraVistas?.ir('mapa');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // ---------- Eventos ----------
  document.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const abrirBtn = t.closest('[data-puesto-abrir]');
    if (abrirBtn) { abrir(abrirBtn.dataset.puestoAbrir, { desdeFuera: true }); return; }
    // Enlace «Ayudar con este puesto» que aparece en las tarjetas del mapa.
    const desdeMapa = t.closest('[data-abrir-puesto]');
    if (desdeMapa) { abrir(desdeMapa.dataset.abrirPuesto, { desdeFuera: true }); return; }
    if (t.closest('[data-puesto-mapa]')) { verEnMapa(); return; }
    if (!root.contains(t)) return;
    if (t.closest('[data-puesto-volver]')) { cerrar(); return; }
    const montoBtn = t.closest('[data-puesto-monto]');
    if (montoBtn) { montoElegido = Number(montoBtn.dataset.puestoMonto); renderDetalle(); return; }
    const acBtn = t.closest('[data-puesto-ac]');
    if (acBtn) { acElegido = Number(acBtn.dataset.puestoAc); renderDetalle(); return; }
    if (t.closest('[data-puesto-aportar-ac]')) { aportarAC(); return; }
    if (t.closest('[data-puesto-aportar]')) { aportar(); return; }
    if (t.closest('[data-puesto-cuidar]')) { alternarCuidado(); return; }
    if (t.closest('[data-puesto-reponer]')) { reponer(); return; }
    if (t.closest('[data-puesto-falta]')) avisarFalta();
  });

  el.filtros?.addEventListener('change', renderLista);

  // Al volver a la sección desde otra vista, se muestra la lista (no un detalle viejo).
  document.addEventListener('vista:cambio', (event) => {
    if (event.detail?.vista === 'comida-agua' && abierto === null) renderLista();
  });

  // ---------- Inicio ----------
  if (el.modo) {
    el.modo.textContent = 'Los puestos de esta lista son ejemplos guardados solo en tu navegador, y los aportes son una simulación: no se cobra dinero. Más adelante los puestos reales los agregará moderación.';
  }
  renderLista();
  renderResumen();
  window.auraLadraPuestos = { lista: () => datos().puestos.slice(), lugares: () => datos().puestos.map(comoLugar), abrir };
  avisarCambio();
})();

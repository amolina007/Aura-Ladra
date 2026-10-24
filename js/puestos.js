// Comida y agua: puestos de agua y alimento en espacios públicos.
// - Con la migración de avisos aplicada (supabase/migrations/20261015120000_avisos_de_puestos.sql), la lista son los
//   avisos que la comunidad propone y que un moderador publica; el navegador solo llama funciones del servidor (ladra.*).
// - Sin la migración, cae a un modo DEMO: un puesto de ejemplo guardado solo en este navegador (localStorage).
// Las campañas publicadas se conectan a las reservas reales mediante js/patrocinio-ac.js.
// La demo y los presupuestos en CLP siguen siendo simulaciones.
(() => {
  'use strict';

  const root = document.querySelector('[data-puestos]');
  if (!root) return;
  const db = window.auraLadraDb;

  // ---------- Utilidades ----------
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(iso)) : 'sin registro');
  // La política de seguridad del sitio (CSP) no permite style="..." dentro del HTML: el ancho de las barras se fija desde JS.
  const aplicarAnchos = (contenedor) => contenedor?.querySelectorAll('[data-ancho]').forEach((barra) => { barra.style.width = `${barra.dataset.ancho}%`; });
  const chip = (texto, clase = '') => `<span class="chip ${clase}">${esc(texto)}</span>`;

  const TIPOS = { agua: 'Agua', comida: 'Comida', ambos: 'Agua y comida' };
  const ICONOS = { agua: '💧', comida: '🍖', ambos: '💧🍖' };
  const ESTADOS = { activo: 'Funcionando', necesita_ayuda: 'Necesita ayuda', propuesta: 'Propuesta aprobada', campana: 'Financiamiento abierto', meta_alcanzada: 'Meta alcanzada', completada: 'Completada', expirada: 'Plazo terminado', cancelada: 'Cancelada' };
  const ESTADOS_AVISO = { borrador: 'Borrador', en_revision: 'En revisión', publicado: 'Publicado', rechazado: 'Rechazado', retirado: 'Retirado' };
  const MONTOS = [2000, 5000, 10000, 20000];
  const YO = 'Tú (demo)';
  const nAC = new Intl.NumberFormat('es-CL');

  // ---------- Modo servidor (funciones ladra.*) o DEMO ----------
  let modo = 'demo';
  let listo = false; // hasta saber el modo no se muestra nada, para no mostrar la demo por un instante.
  let session = null;
  const rpc = async (nombre, args) => {
    if (!db) throw new Error('Sin conexión al servidor.');
    const { data, error } = await db.rpc(nombre, args);
    if (error) throw error;
    return data;
  };
  const mensajeError = (e) => {
    const m = String(e?.message || e || 'No pudimos completar la acción.');
    if (/check constraint/i.test(m)) return 'Revisa los datos: alguno no cumple los límites (largo de los textos, montos o plazo).';
    if (/PERMISO_DENEGADO/.test(m)) return 'No tienes permiso para hacer esto.';
    if (/SESION_REQUERIDA/.test(m)) return 'Inicia sesión en Mi cuenta para continuar.';
    return m.replace(/^[A-Z_]{4,}:\s*/, '');
  };

  const PERMISOS = {
    sin_consultar: 'Aún no se ha consultado a quien administra el espacio. Tenlo en cuenta antes de apoyar.',
    en_tramite: 'En trámite con quien administra el espacio.',
    confirmado: 'Confirmado por quien lo propone (lo revisa moderación).',
  };
  // Un aviso publicado por el servidor, con la misma forma que usa el resto de la pantalla.
  const diasHasta = (iso) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : null);
  // Campaña: etapa 1 es juntar la meta (máximo 2 meses); lo demás se define al alcanzarla.
  const fichaCampana = (a) => ({
    campana: true,
    para_que: a.para_que,
    meta_ac: a.meta_ac,
    plazo_recaudacion_dias: a.plazo_recaudacion_dias,
    hasta: a.recaudacion_hasta,
    abre: a.recaudacion_hasta ? new Date(new Date(a.recaudacion_hasta).getTime() - a.plazo_recaudacion_dias * 86400000).toISOString() : null,
    dias_restantes: diasHasta(a.recaudacion_hasta),
    plazo_entrega: a.plazo_habilitacion_dias,
    permiso: a.permiso_estado === 'sin_consultar' ? 'Por consultar: se pide a quien administra el espacio cuando esté definido el emplazamiento.' : (PERMISOS[a.permiso_estado] || PERMISOS.sin_consultar),
    permiso_corto: a.permiso_estado === 'sin_consultar' ? 'por consultar al definir el lugar' : a.permiso_estado === 'en_tramite' ? 'en trámite' : 'confirmado',
    equipo: Array.isArray(a.equipo) ? a.equipo : [],
    si_no_se_cumple: `Propuesta de quien lo publica si no se alcanza la meta: ${a.condiciones_devolucion}`,
  });
  const delAviso = (a) => ({
    id: a.id, aviso: true, creado_en: a.creado_en, social: a.me_gusta_total === undefined ? null : { likes: Number(a.me_gusta_total) || 0, comentarios: Number(a.comentarios_total) || 0, yo: !!a.yo_di_me_gusta }, es_mio: !!a.es_mio, nombre: a.titulo, tipo: a.tipo, estado: a.meta_ac ? 'campana' : 'propuesta',
    descripcion: a.descripcion, necesidad: a.para_que, direccion_publica: a.direccion_publica, comuna: a.comuna,
    latitud: a.latitud == null ? null : Number(a.latitud), longitud: a.longitud == null ? null : Number(a.longitud),
    meta_clp: 0, recaudado_clp: 0, ultima_reposicion: null, cuidadores: [],
    ficha: a.meta_ac ? fichaCampana(a) : {
      para_que: a.para_que,
      costo_mensual_ac: a.costo_mensual_ac,
      cubre_mensual: a.incluye || [],
      costo_habilitacion: a.costo_habilitacion_ac == null ? 'Por definir.' : `${nAC.format(a.costo_habilitacion_ac)} AC pedidas para habilitarlo (es una solicitud: todavía no se recauda nada).`,
      plazo_habilitacion: `Se propone dejarlo habilitado en ${a.plazo_habilitacion_dias} días.`,
      permiso: PERMISOS[a.permiso_estado] || PERMISOS.sin_consultar,
      documentacion: a.documentacion || [],
      si_no_se_cumple: `Propuesta de quien lo publica si no se habilita en el plazo: ${a.condiciones_devolucion}`,
    },
  });

  // ---------- Datos de ejemplo (solo navegador) ----------
  const KEY = 'auraladra.demo.puestos.v5';
  const DIA = 86400000;
  let mem = null;

  const semilla = () => {
    const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString();
    return {
      puestos: [
        // Ubicación APROXIMADA (centro de Maipú): pendiente de ajustar a la plaza real de Av. Sur con Padre Hurtado.
        { id: 'av-sur-padre-hurtado', ejemplo: true, nombre: 'Plaza Av. Sur con Padre Hurtado · bebedero y comedero para perros (demo)', tipo: 'ambos', estado: 'necesita_ayuda', descripcion: 'Bebedero y comedero para perros que instalará AuraLadra en la plaza de la intersección de Av. Sur con Padre Hurtado. Es un puesto demo.', necesidad: 'Instalar el bebedero y el comedero, reponer agua y alimento seco, y limpiarlos cada semana.', direccion_publica: 'Plaza de Av. Sur con Padre Hurtado, Maipú', comuna: 'Maipú', latitud: -33.5107, longitud: -70.7578, meta_clp: 30000, recaudado_clp: 0, ultima_reposicion: null, cuidadores: [],
          // Ficha de financiamiento (textos de ejemplo): dice para qué se piden fondos y qué se entrega a cambio.
          ficha: {
            para_que: 'Habilitar un bebedero y un comedero para perros en la plaza y sostenerlos mes a mes, con cada paso documentado.',
            costo_mensual_ac: 100,
            cubre_mensual: ['Alimento seco para perros', 'Agua y limpieza del bebedero y del comedero', 'Mantención mínima: revisar y reparar lo básico'],
            costo_habilitacion: 'Por definir: materiales y fabricación del bebedero y del comedero.',
            plazo_habilitacion: 'Habilitado dentro de 30 días desde que se junte la meta (plazo de ejemplo).',
            permiso: 'Estado del permiso de la plaza: por confirmar con la Municipalidad de Maipú. Aún no está confirmado: tenlo en cuenta antes de aportar.',
            hitos: ['Fabricación probada con fotos: se entregaría una parte de la habilitación (monto por definir).', 'Instalación probada con foto y ubicación exacta: se entregaría el resto de la habilitación (monto por definir).'],
            documentacion: ['Fabricación: fotos del proceso y de los materiales', 'Posicionamiento: foto y ubicación exacta de la instalación', 'Recargas: fecha y foto de cada recarga de comida y agua', 'Mantención: registro de cada revisión o reparación'],
            si_no_se_cumple: 'Si el puesto no queda habilitado dentro del plazo, las Auracoins que aún no se hayan entregado se devolverían a quienes aportaron (propuesta).',
          } },
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
  const datos = () => { if (!listo) return { puestos: [], aportes: [] }; if (!mem) mem = cargar(); return mem; };
  const guardar = () => { if (modo !== 'demo') return; try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* sin almacenamiento */ } };
  const avisarCambio = () => document.dispatchEvent(new CustomEvent('puestos:cambio'));

  const buscar = (id) => datos().puestos.find((p) => p.id === id) || null;
  const porcentaje = (p) => p.ficha?.campana ? (p.ac?.habilitado ? Math.min(100, Math.round(p.ac.recaudado_ac / p.ficha.meta_ac * 100)) : null) : p.aviso ? null : Math.min(100, Math.round((p.recaudado_clp / p.meta_clp) * 100));
  const actualizarAC = (p, estado) => { p.ac = estado; if (estado?.habilitado) p.estado = estado.estado === 'recaudando' ? 'campana' : estado.estado; };
  const cargarFinanciacion = async () => { await Promise.all(datos().puestos.filter(p => p.ficha?.campana).map(async p => { try { actualizarAC(p, await rpc('estado_patrocinio_ac', {p_aviso:p.id})); } catch { p.ac = null; } })); };
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
  const tieneUbicacion = (p) => p.latitud != null && p.longitud != null;
  // Fila compacta de «Me gusta · Comentar · Compartir» en las tarjetas (vista Aportar). Sin la migración solo sale «Compartir».
  const filaSocialTarjeta = (p) => {
    const so = p.social;
    return `<div class="pz-social pz-social-card" data-pzc-fila="${esc(p.id)}">
      ${so ? `<button class="pz-soc-btn${so.yo ? ' is-activa' : ''}" type="button" data-pzc-like="${esc(p.id)}" aria-pressed="${so.yo}" aria-label="Me gusta"><span aria-hidden="true">${so.yo ? '♥' : '♡'}</span> <b>${so.likes}</b></button>
      <button class="pz-soc-btn" type="button" data-pzc-comentar="${esc(p.id)}" aria-label="Comentar"><span aria-hidden="true">💬</span> <b>${so.comentarios}</b></button>` : ''}
      <button class="pz-soc-btn" type="button" data-pzc-compartir="${esc(p.id)}" aria-label="Compartir"><span aria-hidden="true">↗</span> Compartir</button>
      ${p.msgSocial ? `<small class="pz-soc-msg" role="status">${esc(p.msgSocial)}</small>` : ''}
    </div>`;
  };
  const tarjeta = (p) => {
    const pct = porcentaje(p);
    const campana = p.ficha?.campana;
    const dias = p.ficha?.dias_restantes;
    const progreso = campana ? (p.ac?.habilitado ? `
      <div class="cause-funding"><p><strong>${nAC.format(p.ac.recaudado_ac)} <small>AC</small></strong><span>de ${nAC.format(p.ficha.meta_ac)} AC</span></p>
      <div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Avance de ${esc(p.nombre)}"><span data-ancho="${pct}"></span></div>
      <div class="cause-progress-caption"><span>${pct}% de la meta</span><span>${p.estado === 'campana' && dias != null ? (dias === 0 ? 'Último día' : `${dias} días restantes`) : esc(ESTADOS[p.estado] || p.estado)}</span></div></div>` : `<p class="cause-pending">Meta: <strong>${nAC.format(p.ficha.meta_ac)} AC</strong> · Avance por consultar</p>`) : (!p.aviso ? `
      <div class="cause-funding"><p><strong>${clp.format(p.recaudado_clp)}</strong><span>de ${clp.format(p.meta_clp)} este mes</span></p><div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Patrocinio del mes"><span data-ancho="${pct}"></span></div></div>` : `<p class="cause-pending">${nAC.format(p.ficha?.costo_mensual_ac || 0)} AC al mes solicitadas</p>`);
    return `<article class="cause-card">
      <div class="cause-card-top"><span class="cause-icon" aria-hidden="true">${ICONOS[p.tipo]}</span><span class="cause-status">${esc(ESTADOS[p.estado] || p.estado)}</span>${p.ejemplo ? chip('Demo', 'is-sim') : ''}</div>
      <h4>${esc(p.nombre)}</h4><p class="cause-location">${esc(p.comuna || p.direccion_publica)}</p>
      ${progreso}
      <button class="button-verde cause-open" type="button" data-puesto-abrir="${esc(p.id)}">${campana && p.estado === 'campana' ? 'Ver campaña y patrocinar' : p.aviso ? 'Ver causa' : 'Ver cómo ayudar'} <span aria-hidden="true">→</span></button>
    </article>`;
  };

  // Tarjeta compacta de la lista lateral (diseño de la sección).
  const tarjetaLateral = (p) => {
    const pct = porcentaje(p);
    return `<button class="pz-item${p.id === abierto ? ' is-activa' : ''}" type="button" data-puesto-abrir="${esc(p.id)}" aria-pressed="${p.id === abierto}">
      <span class="pz-mini" aria-hidden="true">${ICONOS[p.tipo]}</span>
      <span class="pz-item-texto">
        <strong>${esc(p.nombre)}</strong>
        <small>📍 ${esc(p.comuna)}</small>
        ${pct == null ? '<small>Consulta el patrocinio de esta campaña</small>' : `<span class="pz-barra"><span class="progreso" aria-hidden="true"><span data-ancho="${pct}"></span></span><em>${pct}%</em></span>`}
      </span>
    </button>`;
  };

  // ---------- Lista ----------
  const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtrados = () => {
    const f = el.filtros ? new FormData(el.filtros) : new FormData();
    const vista = f.get('vista') || 'todas';
    const q = sinTildes(f.get('q')).trim();
    return datos().puestos.filter((p) => {
      if (vista === 'agua' && !(p.tipo === 'agua' || p.tipo === 'ambos')) return false;
      if (vista === 'comida' && !(p.tipo === 'comida' || p.tipo === 'ambos')) return false;
      if (vista === 'completar' && !(p.estado === 'campana' || p.estado === 'necesita_ayuda')) return false;
      if (vista === 'mias' && !p.es_mio) return false;
      return !q || sinTildes(`${p.nombre} ${p.comuna} ${p.descripcion} ${p.necesidad}`).includes(q);
    });
  };

  const renderLista = () => {
    if (!el.lista) return;
    const rows = filtrados();
    el.lista.innerHTML = rows.length
      ? rows.map(tarjetaLateral).join('')
      : '<p class="ayudar-vacio">No hay puestos con estos filtros. Prueba con otros.</p>';
    aplicarAnchos(el.lista);
  };

  // ---------- Resumen dentro de Ayudar ----------
  const renderResumen = () => {
    if (!resumen) return;
    const puestos = datos().puestos;
    const abiertas = puestos.filter(p => p.estado === 'campana' || p.estado === 'necesita_ayuda');
    const mostrar = [...abiertas, ...puestos.filter(p => !abiertas.includes(p))].slice(0, 3);
    resumen.hidden = !mostrar.length;
    if (!mostrar.length) return;
    const campanas = puestos.filter(p => p.ficha?.campana);
    const saldoConocido = campanas.length && campanas.every(p => p.ac?.habilitado);
    const total = campanas.reduce((sum,p) => sum + Number(p.ac?.recaudado_ac || 0), 0);
    resumen.innerHTML = `
      <div class="cause-overview" aria-label="Resumen de causas">
        <div><strong>${abiertas.length}</strong><span>${abiertas.length === 1 ? 'Causa abierta' : 'Causas abiertas'}</span></div>
        <div><strong>${saldoConocido ? nAC.format(total) + ' <small>AC</small>' : '—'}</strong><span>${saldoConocido ? 'Patrocinadas' : 'Avance en AC por consultar'}</span></div>
      </div>
      <div class="cause-list-heading"><h3 id="puestos-resumen-title">${abiertas.length ? 'Para apoyar hoy' : 'Explora las causas'}</h3><a href="#comida-agua">Ver todas <span aria-hidden="true">↗</span></a></div>
      <div class="cause-grid">${mostrar.map(tarjeta).join('')}</div>`;
    aplicarAnchos(resumen);
  };

  // ---------- Detalle ----------
  let montoElegido = 0;
  let abierto = null;
  const mensaje = (texto, tipo = '') => {
    const m = el.detalle?.querySelector('[data-puesto-msg]');
    if (!m) return;
    m.textContent = texto;
    m.className = `ayudar-msg${tipo ? ` is-${tipo}` : ''}`;
  };

  // ---------- Interacciones: me gusta, comentarios y compartir ----------
  const com = { id: null, filas: [], cargando: false, msg: '', tipo: '' };
  const tiempo = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    return fecha(iso);
  };
  const barraSocial = (p) => {
    const so = p.social;
    return `<div class="pz-social" data-pz-social>
      ${so ? `<button class="pz-soc-btn${so.yo ? ' is-activa' : ''}" type="button" data-pz-like aria-pressed="${so.yo}" aria-label="Me gusta"><span aria-hidden="true">${so.yo ? '♥' : '♡'}</span> Me gusta <b>${so.likes}</b></button>
      <button class="pz-soc-btn" type="button" data-pz-ir-comentar aria-label="Comentar"><span aria-hidden="true">💬</span> Comentar <b>${so.comentarios}</b></button>` : ''}
      <button class="pz-soc-btn" type="button" data-pz-compartir aria-label="Compartir"><span aria-hidden="true">↗</span> Compartir</button>
    </div>`;
  };
  const seccionComentarios = (p) => {
    if (!p.social) return '';
    const filas = com.id === p.id ? com.filas : [];
    const lista = filas.length
      ? filas.map((c) => `<li><span class="pz-avatar pz-avatar-s" aria-hidden="true">${esc(String(c.autor_alias || '?').trim().charAt(0).toUpperCase())}</span>
          <div><p><strong>${esc(c.autor_alias)}</strong> <small>${esc(tiempo(c.creado_en))}</small></p><p>${esc(c.texto)}</p>
          ${c.puede_ocultar ? `<button class="pz-link" type="button" data-pz-ocultar="${esc(c.id)}">${c.es_mio ? 'Borrar' : 'Ocultar'}</button>` : ''}</div></li>`).join('')
      : `<li class="pz-vacio-c">${com.cargando ? 'Cargando comentarios…' : 'Todavía no hay comentarios. Sé la primera persona en comentar.'}</li>`;
    return `<section class="pz-comentarios" id="pz-comentarios" aria-labelledby="pz-com-titulo">
      <h4 id="pz-com-titulo">Comentarios</h4>
      ${session?.user
        ? `<form class="pz-form-com" data-pz-comentar><label class="visually-hidden" for="pz-com-texto">Escribe un comentario</label>
            <textarea id="pz-com-texto" name="texto" rows="2" minlength="2" maxlength="500" placeholder="Escribe un comentario (sin enlaces)" required></textarea>
            <button class="button-verde" type="submit">Comentar</button></form>`
        : '<p class="pz-aviso-sesion"><a href="#cuenta">Inicia sesión en Mi cuenta</a> para dar me gusta y comentar.</p>'}
      <p class="ayudar-msg${com.tipo ? ` is-${com.tipo}` : ''}" data-pz-com-msg role="status">${esc(com.msg)}</p>
      <ul class="pz-lista-com" data-pz-com-lista>${lista}</ul>
    </section>`;
  };
  const pintarSocial = (p) => {
    const cont = el.detalle?.querySelector('[data-pz-social]');
    if (cont) cont.outerHTML = barraSocial(p);
  };
  const pintarComentarios = (p) => {
    const cont = el.detalle?.querySelector('#pz-comentarios');
    if (!cont) return;
    const lista = cont.querySelector('[data-pz-com-lista]');
    const msg = cont.querySelector('[data-pz-com-msg]');
    const nuevo = document.createElement('div');
    nuevo.innerHTML = seccionComentarios(p);
    if (lista) lista.innerHTML = nuevo.querySelector('[data-pz-com-lista]').innerHTML;
    if (msg) { msg.textContent = com.msg; msg.className = `ayudar-msg${com.tipo ? ` is-${com.tipo}` : ''}`; }
  };
  const cargarComentarios = async (p) => {
    if (!p?.social || modo !== 'servidor') return;
    com.id = p.id; com.filas = []; com.cargando = true; com.msg = ''; com.tipo = '';
    pintarComentarios(p);
    try { com.filas = (await rpc('listar_comentarios_aviso', { p_id: p.id })) || []; } catch (e) { com.msg = mensajeError(e); com.tipo = 'error'; }
    com.cargando = false;
    if (abierto === p.id) pintarComentarios(p);
  };
  const urlPublica = (p) => `${window.location.origin}${window.location.pathname}?puesto=${encodeURIComponent(p.id)}#comida-agua`;
  const compartir = async (p) => {
    const url = urlPublica(p);
    try {
      if (navigator.share) { await navigator.share({ title: p.nombre, text: `${p.nombre} · AuraLadra`, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); decirSocial(p, 'Enlace copiado. Pégalo donde quieras compartirlo.', 'success'); }
    catch { window.prompt('Copia este enlace para compartir:', url); }
  };
  // Resultado de una acción social: se muestra en la ficha (si está abierta) y en la tarjeta de Aportar.
  const decirSocial = (p, texto, tipo = '') => {
    p.msgSocial = texto;
    mensaje(texto, tipo);
    renderResumen();
    renderLista();
  };
  const refrescarSocial = (p) => {
    p.msgSocial = '';
    if (abierto === p.id) pintarSocial(p);
    renderResumen();
    renderLista();
  };
  const darMeGusta = async (p) => {
    if (!session?.user) { decirSocial(p, 'Inicia sesión en Mi cuenta para dar me gusta.', 'error'); return; }
    try {
      const puesto = await rpc('alternar_me_gusta_aviso', { p_id: p.id });
      p.social.yo = !!puesto;
      if (puesto) document.dispatchEvent(new CustomEvent('puestos:interaccion', { detail: { tipo: 'me_gusta' } }));
      p.social.likes = Math.max(0, p.social.likes + (puesto ? 1 : -1));
      refrescarSocial(p);
    } catch (e) { decirSocial(p, mensajeError(e), 'error'); }
  };
  const comentar = async (p, form) => {
    const texto = String(new FormData(form).get('texto') || '').trim();
    com.msg = ''; com.tipo = '';
    try {
      await rpc('comentar_aviso', { p_id: p.id, p_texto: texto });
      form.reset();
      document.dispatchEvent(new CustomEvent('puestos:interaccion', { detail: { tipo: 'comentario' } }));
      p.social.comentarios += 1;
      refrescarSocial(p);
      await cargarComentarios(p);
      com.msg = 'Listo: tu comentario ya se ve.'; com.tipo = 'success'; pintarComentarios(p);
    } catch (e) { com.msg = mensajeError(e); com.tipo = 'error'; pintarComentarios(p); }
  };
  const ocultarComentario = async (p, id) => {
    if (!window.confirm('¿Quitar este comentario?')) return;
    try {
      await rpc('ocultar_comentario_aviso', { p_comentario: id });
      p.social.comentarios = Math.max(0, p.social.comentarios - 1);
      refrescarSocial(p);
      await cargarComentarios(p);
    } catch (e) { com.msg = mensajeError(e); com.tipo = 'error'; pintarComentarios(p); }
  };

  // ---------- Ficha de una campaña (compacta: lo importante arriba, el detalle plegado) ----------
  const equipoCampana = (f) => `<ul class="pz-equipo">${f.equipo.map((m) => `<li><span class="pz-avatar" aria-hidden="true">${esc(String(m.alias || '?').trim().charAt(0).toUpperCase())}</span><span><strong>${esc(m.alias)}</strong><small>${m.rol === 'responsable' ? 'Responsable' : 'Integrante'}</small></span></li>`).join('')}</ul>`;
  const panelCampana = (f) => `
    <div class="pz-card pz-progreso" data-patrocinio-ac><p role="status">Consultando patrocinio en AC…</p></div>
    <div class="pz-card"><h4>Equipo</h4>${equipoCampana(f)}</div>
    <p class="pz-permiso-chip"><strong>Permiso:</strong> ${esc(f.permiso_corto)}</p>`;
  const renderDetalleCampana = (p, aviso) => {
    const f = p.ficha;
    el.detalle.innerHTML = `<div class="pz-grid">
      <div class="pz-main">
        <div class="pz-foto" role="img" aria-label="Foto del puesto pendiente"><span aria-hidden="true">${ICONOS[p.tipo]}</span><small>Foto pendiente</small>
          <div class="pz-foto-chips">${chip(`${ICONOS[p.tipo]} ${TIPOS[p.tipo]}`)}${chip(ESTADOS[p.estado])}</div></div>
        <div class="pz-cabecera"><h3>${esc(p.nombre)}</h3><p class="pz-donde">📍 ${esc(p.comuna)} · ${esc(p.direccion_publica)}</p></div>
        ${barraSocial(p)}
        <p class="pz-resumen">${esc(p.descripcion)}</p>
        <div class="pz-pliegues">
          <details><summary>Qué se hará con la meta</summary><p>${esc(f.para_que)}</p><p>Al alcanzarla se define, con todo documentado, el emplazamiento, la mantención y la comida. Quedaría listo dentro de <strong>${f.plazo_entrega} días</strong> (máximo 60).</p></details>
          <details><summary>Condiciones</summary><p>${esc(f.si_no_se_cumple)}</p><p><small>Las AC se reservan al patrocinar y se entregan por hitos aprobados. Si vence la campaña, se devuelve automáticamente lo que no se haya entregado. Esta regla prevalece sobre la propuesta de devolución del aviso.</small></p></details>
        </div>
        ${seccionComentarios(p)}
        <p class="ayudar-msg" data-puesto-msg role="status"></p>
      </div>
      <aside class="pz-side" aria-label="Meta y equipo">${panelCampana(f)}</aside>
    </div>`;
    aplicarAnchos(el.detalle);
    if (aviso) mensaje(aviso.texto, aviso.tipo);
    cargarComentarios(p);
    document.dispatchEvent(new CustomEvent('puestos:campana', {detail:{id:p.id}}));
  };

  const renderDetalle = (aviso) => {
    const p = buscar(abierto);
    if (!el.detalle) return;
    if (!p) {
      el.detalle.innerHTML = `<div class="pz-vacio"><h3>Todavía no hay iniciativas publicadas</h3><p>Cuando moderación publique una campaña, la verás aquí con su meta, su plazo, su equipo y sus condiciones.</p></div>`;
      return;
    }
    if (p.ficha?.campana) { renderDetalleCampana(p, aviso); return; }
    const pct = porcentaje(p);
    const lleno = !p.aviso && p.recaudado_clp >= p.meta_clp;
    const yoCuido = cuido(p);
    el.detalle.innerHTML = `
      <div class="pz-grid">
      <div class="pz-main">
      <div class="pz-foto" role="img" aria-label="Foto del puesto pendiente"><span aria-hidden="true">${ICONOS[p.tipo]}</span><small>Foto pendiente: aquí irá la foto real del puesto</small></div>
      <div class="accion-meta">${chip(`${ICONOS[p.tipo]} ${TIPOS[p.tipo]}`)}${chip(ESTADOS[p.estado], p.estado === 'necesita_ayuda' ? 'is-ambar' : '')}${p.ejemplo ? chip('Ejemplo', 'is-sim') : ''}</div>
      <h3>${esc(p.nombre)}</h3>
      <p>${esc(p.descripcion)}</p>
      <p><strong>Dónde:</strong> ${esc(p.direccion_publica)}${tieneUbicacion(p) ? ` · <button class="button-borde" type="button" data-puesto-mapa="${esc(p.id)}">Ver en el mapa</button>` : ''}</p>

      <div class="detalle-bloque">
        <h4>Qué necesita</h4>
        <p>${esc(p.necesidad)}</p>
        ${p.aviso ? '' : `<div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Patrocinio del mes"><span data-ancho="${pct}"></span></div>
        <p class="progreso-texto"><span><strong>${clp.format(p.recaudado_clp)}</strong> de ${clp.format(p.meta_clp)} este mes</span><span>${pct}%</span></p>`}
        ${lleno ? '<p class="ayudar-msg is-success">La meta del mes ya está cubierta. Igual puedes seguir aportando o ayudar en persona.</p>' : ''}
      </div>

      ${p.ficha ? `<div class="detalle-bloque">
        <h4>Para qué se piden los fondos</h4>
        <p>${esc(p.ficha.para_que)}</p>
        <p><strong>🪙 ${nAC.format(p.ficha.costo_mensual_ac)} AC al mes</strong> para sostener el puesto. Esto cubre:</p>
        <ul>${p.ficha.cubre_mensual.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        <p><strong>Habilitación:</strong> ${esc(p.ficha.costo_habilitacion)}</p>
        <p><strong>Plazo:</strong> ${esc(p.ficha.plazo_habilitacion)}</p>
        <p><strong>Permiso:</strong> ${esc(p.ficha.permiso)}</p>
        <h4>Qué quedará documentado</h4>
        <ul>${p.ficha.documentacion.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
        ${p.ficha.hitos ? `<h4>Cómo se entregarían las Auracoins (propuesta por aprobar)</h4>
        <p>Esta es la propuesta, aún no es una regla vigente: las Auracoins se entregarían por etapas, solo cuando hay prueba.</p>
        <ul>${p.ficha.hitos.map((h) => `<li>${esc(h)}</li>`).join('')}<li>Cada mes con recarga y mantención documentadas: se entregarían ${nAC.format(p.ficha.costo_mensual_ac)} AC.</li></ul>` : ''}
        <p><small>${esc(p.ficha.si_no_se_cumple)}</small></p>
      </div>` : ''}

      ${p.aviso ? '' : `<div class="detalle-bloque">
        <h4>Patrocinar este puesto</h4>
        <div class="aportar-panel">
          <p>Elige un monto para el alimento, el agua y la mantención del mes.</p>
          <div class="montos" role="group" aria-label="Monto del aporte">
            ${MONTOS.map((m) => `<button class="monto-btn" type="button" data-puesto-monto="${m}" aria-pressed="${montoElegido === m}">${clp.format(m)}</button>`).join('')}
          </div>
          <p><small>Es una <strong>simulación</strong>: no se cobra dinero. Es un aporte solidario para sostener este puesto; no ofrece intereses ni retornos.</small></p>
          <button class="button-verde" type="button" data-puesto-aportar ${montoElegido ? '' : 'disabled'}>Confirmar aporte (simulación)</button>
        </div>
      </div>`}

      <div class="detalle-bloque">
        <h4>Auracoins</h4>
        <p>Por ahora este puesto no recibe aportes en Auracoins: el sistema de Auracoins todavía no está definido. Lo de arriba es la propuesta de cómo se usarían, para revisarla antes de activarla.</p>
      </div>

      ${p.aviso ? `<div class="detalle-bloque">
        <h4>Cuidado y aportes</h4>
        <p>Por ahora esta propuesta se puede revisar. Anotarse como cuidador y patrocinarla llegará en una próxima etapa.</p>
        ${p.es_mio ? `<div class="mini-acciones"><button class="button-borde" type="button" data-aviso-retirar="${esc(p.id)}">Retirar mi propuesta</button></div>` : ''}
      </div>` : `<div class="detalle-bloque">
        <h4>Cuidarlo en persona</h4>
        <p>${p.cuidadores.length ? `Lo cuidan: ${p.cuidadores.map((c) => esc(c.alias)).join(', ')}.` : 'Todavía nadie lo cuida en persona.'}</p>
        <p>Última reposición: <strong>${esc(fecha(p.ultima_reposicion))}</strong></p>
        <div class="mini-acciones">
          <button class="button-verde" type="button" data-puesto-cuidar>${yoCuido ? 'Dejar de cuidarlo' : 'Quiero cuidarlo'}</button>
          <button class="button-borde" type="button" data-puesto-reponer ${yoCuido ? '' : 'disabled'}>Registrar reposición</button>
          ${p.estado === 'activo' ? '<button class="button-borde" type="button" data-puesto-falta>Avisar que falta</button>' : ''}
        </div>
        ${yoCuido ? '' : '<p><small>Para registrar una reposición primero anótate como cuidador.</small></p>'}
      </div>`}

      <p class="ayudar-msg" data-puesto-msg role="status"></p>
      </div>
      </div>`;
    aplicarAnchos(el.detalle);
    if (aviso) mensaje(aviso.texto, aviso.tipo);
  };

  const abrir = (id, { desdeFuera = false } = {}) => {
    if (!buscar(id)) return;
    abierto = id;
    montoElegido = 0;
    if (desdeFuera) window.auraLadraVistas?.ir('comida-agua');
    renderLista();
    renderDetalle();
    if (desdeFuera) window.scrollTo({ top: 0, behavior: 'instant' });
    else if (window.matchMedia?.('(max-width: 900px)').matches) el.detalle?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // La ficha siempre muestra algo: si no hay una abierta (o desapareció), se abre la primera de la lista.
  const abrirPrimera = () => {
    const primera = filtrados()[0] || datos().puestos[0];
    abierto = primera ? primera.id : null;
    montoElegido = 0;
    renderLista();
    renderDetalle();
  };

  const cerrar = () => {
    abrirPrimera();
  };

  // Actividad reciente: solo hechos reales de las campañas publicadas (fechas guardadas en el servidor).
  const cajaActividad = document.querySelector('[data-puestos-actividad]');
  const renderActividad = () => {
    if (!cajaActividad) return;
    const hitos = [];
    datos().puestos.filter((p) => p.aviso).forEach((p) => {
      if (p.ficha?.campana) {
        if (p.ficha.abre) hitos.push({ cuando: p.ficha.abre, icono: '🚀', titulo: 'Financiamiento abierto', detalle: p.nombre });
        if (p.ficha.hasta) hitos.push({ cuando: p.ficha.hasta, icono: '⏳', titulo: 'Cierra el financiamiento', detalle: `${p.nombre} · meta de ${nAC.format(p.ficha.meta_ac)} AC` });
      } else if (p.creado_en) {
        hitos.push({ cuando: p.creado_en, icono: '📌', titulo: 'Propuesta publicada', detalle: p.nombre });
      }
    });
    hitos.sort((x, y) => new Date(x.cuando) - new Date(y.cuando));
    cajaActividad.hidden = !hitos.length;
    if (!hitos.length) { cajaActividad.replaceChildren(); return; }
    cajaActividad.innerHTML = `<h3 id="pz-act-titulo">Actividad reciente</h3>
      <ol class="pz-linea">${hitos.slice(0, 6).map((h) => `<li><span class="pz-hito" aria-hidden="true">${h.icono}</span><span class="pz-hito-texto"><small>${esc(fecha(h.cuando))}</small><strong>${esc(h.titulo)}</strong><em>${esc(h.detalle)}</em></span></li>`).join('')}</ol>`;
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

  // ---------- Proponer un puesto y mis propuestas (solo con servidor) ----------
  const ui = { formAviso: false, mis: [], msg: '', msgTipo: '' };
  const cajaProponer = document.createElement('div');
  cajaProponer.setAttribute('data-puestos-proponer', '');
  el.vistaLista?.insertBefore(cajaProponer, el.lista);
  const decir = (texto, tipo = '') => { ui.msg = texto; ui.msgTipo = tipo; };

  const lineasDe = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const numero = (v) => {
    const t = String(v ?? '').trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const formAviso = () => `<form class="ayudar-form" data-form-aviso>
      <p><small>Es una propuesta: un moderador la revisa antes de publicarla. No se cobra dinero ni se mueven Auracoins, y no se muestra quién la creó.</small></p>
      <label>Título<input name="titulo" minlength="8" maxlength="90" required></label>
      <label>Descripción<textarea name="descripcion" minlength="20" maxlength="600" required></textarea></label>
      <label>Qué ofrece<select name="tipo"><option value="ambos">Agua y comida</option><option value="agua">Agua</option><option value="comida">Comida</option></select></label>
      <label>Comuna<input name="comuna" value="Maipú" minlength="2" maxlength="60" required></label>
      <label>Dirección o referencia pública<input name="direccion_publica" minlength="5" maxlength="140" required></label>
      <label>Latitud (opcional)<input name="latitud" inputmode="decimal"></label>
      <label>Longitud (opcional)<input name="longitud" inputmode="decimal"></label>
      <label>Para qué se piden los fondos<textarea name="para_que" minlength="20" maxlength="400" required></textarea></label>
      <label>Qué cubre cada mes (una línea por ítem)<textarea name="incluye" required></textarea></label>
      <label>Qué se documentará: fabricación, instalación, recargas, mantención (una línea por ítem)<textarea name="documentacion" required></textarea></label>
      <label>Auracoins por mes para sostenerlo<input type="number" name="costo_mensual_ac" min="1" max="100000" required></label>
      <label>Auracoins para habilitarlo (opcional)<input type="number" name="costo_habilitacion_ac" min="0" max="1000000"></label>
      <label>Plazo para dejarlo habilitado (días)<input type="number" name="plazo_habilitacion_dias" min="1" max="180" required></label>
      <label>Permiso del lugar<select name="permiso_estado"><option value="sin_consultar">Aún no consultado</option><option value="en_tramite">En trámite</option><option value="confirmado">Confirmado</option></select></label>
      <label>Si no se habilita en el plazo (tu propuesta de devolución)<textarea name="condiciones_devolucion" minlength="10" maxlength="600" required></textarea></label>
      <div class="mini-acciones"><button class="button-verde" type="submit">Enviar a revisión</button><button class="button-borde" type="button" data-aviso-cancelar>Cancelar</button></div>
    </form>`;

  const renderProponer = (forzar = false) => {
    if (!cajaProponer.isConnected && !el.vistaLista) return;
    if (!forzar && ui.formAviso && cajaProponer.querySelector('[data-form-aviso]')) return; // no se borra lo que se está escribiendo
    if (modo !== 'servidor') {
      cajaProponer.innerHTML = '<p class="ayudar-sim" role="note">Proponer un puesto necesita la conexión al servidor, que todavía no está activa en esta versión.</p>';
      return;
    }
    if (!session?.user) {
      cajaProponer.innerHTML = '<p class="ayudar-sim" role="note">Para proponer un puesto, <a href="#cuenta">inicia sesión en Mi cuenta</a>.</p>';
      return;
    }
    const filas = ui.mis.filter((a) => a.estado !== 'retirado').map((a) => `<article class="accion-card">
        <div class="accion-meta">${chip(ESTADOS_AVISO[a.estado] || a.estado, a.estado === 'rechazado' ? 'is-rojo' : a.estado === 'publicado' ? '' : 'is-gris')}</div>
        <h3>${esc(a.titulo)}</h3>
        ${a.motivo_rechazo ? `<p><strong>Motivo del rechazo:</strong> ${esc(a.motivo_rechazo)}</p>` : ''}
        <div class="mini-acciones">
          ${a.estado === 'borrador' ? `<button class="button-verde" type="button" data-aviso-enviar="${esc(a.id)}">Enviar a revisión</button>` : ''}
          <button class="button-borde" type="button" data-aviso-retirar="${esc(a.id)}">Retirar</button>
        </div>
      </article>`).join('');
    cajaProponer.innerHTML = `
      <div class="mini-acciones"><button class="button-verde" type="button" data-aviso-nuevo>${ui.formAviso ? 'Cerrar el formulario' : 'Proponer un puesto'}</button></div>
      ${ui.formAviso ? formAviso() : ''}
      ${ui.msg ? `<p class="ayudar-msg${ui.msgTipo ? ` is-${ui.msgTipo}` : ''}" role="status">${esc(ui.msg)}</p>` : ''}
      ${filas ? `<h3>Mis propuestas</h3><div class="ayudar-lista">${filas}</div>` : ''}`;
  };

  // Resumen de mis propuestas (solo con sesión): cuenta real de lo que ya envié.
  const cajaMio = document.createElement('div');
  cajaMio.setAttribute('data-puestos-mio', '');
  el.vistaLista?.appendChild(cajaMio);
  const renderMio = () => {
    const mias = ui.mis.filter((a) => a.estado !== 'retirado');
    if (modo !== 'servidor' || !session?.user || !mias.length) { cajaMio.replaceChildren(); return; }
    const n = (e) => mias.filter((a) => a.estado === e).length;
    cajaMio.innerHTML = `<div class="pz-card"><h4>Tus propuestas</h4>
      <div class="pz-tiles"><div><span>En revisión</span><strong>${n('en_revision')}</strong></div><div><span>Publicadas</span><strong>${n('publicado')}</strong></div></div>
      ${n('rechazado') ? `<p><small>${n('rechazado')} para ajustar: mira el motivo arriba, en «Mis propuestas».</small></p>` : ''}</div>`;
  };

  // Panel de moderación: solo lo ven quienes están en ladra.moderadores (el servidor decide; si no lo eres, no aparece).
  const mod = { esModerador: false, filas: [], msg: '', msgTipo: '' };
  const cajaMod = document.createElement('div');
  cajaMod.setAttribute('data-puestos-moderacion', '');
  el.vistaLista?.insertBefore(cajaMod, el.lista);

  const renderModeracion = () => {
    if (!mod.esModerador) { cajaMod.replaceChildren(); return; }
    const filas = mod.filas.map((a) => `<article class="accion-card" data-revisar="${esc(a.id)}">
        <div class="accion-meta">${chip('En revisión', 'is-gris')}${chip(`${ICONOS[a.tipo]} ${TIPOS[a.tipo]}`)}</div>
        <h3>${esc(a.titulo)}</h3>
        <p>${esc(a.descripcion)}</p>
        <p><strong>Propone:</strong> ${esc(a.autor_alias || 'Persona sin alias público')} · <strong>Dónde:</strong> ${esc(a.direccion_publica)}, ${esc(a.comuna)}${a.latitud == null ? ' (sin coordenadas)' : ` (${a.latitud}, ${a.longitud})`}</p>
        <p><strong>Para qué:</strong> ${esc(a.para_que)}</p>
        ${a.meta_ac ? `<p><strong>Campaña:</strong> 🪙 meta de ${nAC.format(a.meta_ac)} AC en ${a.plazo_recaudacion_dias} días como máximo · <strong>Entrega:</strong> ${a.plazo_habilitacion_dias} días desde alcanzar la meta</p>` : `<p><strong>Pide:</strong> 🪙 ${nAC.format(a.costo_mensual_ac)} AC al mes${a.costo_habilitacion_ac == null ? '' : ` y ${nAC.format(a.costo_habilitacion_ac)} AC para habilitarlo`} · <strong>Plazo:</strong> ${a.plazo_habilitacion_dias} días · <strong>Permiso:</strong> ${esc(PERMISOS[a.permiso_estado] || a.permiso_estado)}</p>
        <p><strong>Cubre:</strong> ${(a.incluye || []).map(esc).join('; ')}</p>
        <p><strong>Documentará:</strong> ${(a.documentacion || []).map(esc).join('; ')}</p>`}
        <p><strong>Si no se cumple (propuesta de la persona):</strong> ${esc(a.condiciones_devolucion)}</p>
        <label>Motivo (obligatorio solo para rechazar)<textarea name="motivo" maxlength="400"></textarea></label>
        <div class="mini-acciones">
          <button class="button-verde" type="button" data-moderar="aprobar" data-id="${esc(a.id)}">Aprobar y publicar</button>
          <button class="button-borde" type="button" data-moderar="rechazar" data-id="${esc(a.id)}">Rechazar</button>
        </div>
      </article>`).join('');
    cajaMod.innerHTML = `<h3>Propuestas por revisar</h3>
      ${mod.msg ? `<p class="ayudar-msg${mod.msgTipo ? ` is-${mod.msgTipo}` : ''}" role="status">${esc(mod.msg)}</p>` : ''}
      ${filas ? `<div class="ayudar-lista">${filas}</div>` : '<p class="ayudar-vacio">No hay propuestas esperando revisión.</p>'}`;
  };

  const cargarModeracion = async () => {
    if (modo !== 'servidor' || !session?.user) { mod.esModerador = false; mod.filas = []; return; }
    try { mod.filas = (await rpc('avisos_puestos_en_revision')) || []; mod.esModerador = true; } catch { mod.esModerador = false; mod.filas = []; }
  };

  const moderar = async (id, aprobar, motivo) => {
    if (!aprobar && String(motivo || '').trim().length < 10) {
      mod.msg = 'Para rechazar escribe un motivo de al menos 10 caracteres.'; mod.msgTipo = 'error'; renderModeracion(); return;
    }
    try {
      await rpc('moderar_aviso_puesto', { p_id: id, p_aprobar: aprobar, p_motivo: aprobar ? null : String(motivo).trim() });
      mod.msg = aprobar ? 'Aprobaste la propuesta: ya está publicada.' : 'Rechazaste la propuesta con su motivo.'; mod.msgTipo = 'success';
    } catch (e) { mod.msg = mensajeError(e); mod.msgTipo = 'error'; }
    await recargar();
  };

  const cargarMis = async () => {
    if (modo !== 'servidor' || !session?.user) { ui.mis = []; return; }
    try { ui.mis = (await rpc('mis_avisos_puestos')) || []; } catch { ui.mis = []; }
  };

  const recargar = async () => {
    if (modo !== 'servidor') return;
    try { mem = { puestos: ((await rpc('listar_avisos_puestos')) || []).map(delAviso), aportes: [] }; } catch { /* se mantiene lo último cargado */ }
    await cargarFinanciacion();
    await cargarMis();
    await cargarModeracion();
    renderModeracion();
    renderProponer(true);
    renderMio();
    renderResumen();
    renderActividad();
    if (abierto && buscar(abierto)) { renderLista(); renderDetalle(); }
    else abrirPrimera();
    avisarCambio();
  };

  const crearYEnviar = async (form) => {
    const f = new FormData(form);
    const g = (k) => String(f.get(k) ?? '').trim();
    const args = {
      p_titulo: g('titulo'), p_descripcion: g('descripcion'), p_tipo: g('tipo'), p_comuna: g('comuna'),
      p_direccion_publica: g('direccion_publica'), p_latitud: numero(f.get('latitud')), p_longitud: numero(f.get('longitud')),
      p_para_que: g('para_que'), p_incluye: lineasDe(f.get('incluye')), p_documentacion: lineasDe(f.get('documentacion')),
      p_costo_mensual_ac: numero(f.get('costo_mensual_ac')), p_costo_habilitacion_ac: numero(f.get('costo_habilitacion_ac')),
      p_plazo_habilitacion_dias: numero(f.get('plazo_habilitacion_dias')), p_permiso_estado: g('permiso_estado'),
      p_condiciones_devolucion: g('condiciones_devolucion'),
    };
    let id;
    try { id = await rpc('crear_aviso_puesto', args); } catch (e) { decir(mensajeError(e), 'error'); renderProponer(true); return; }
    try {
      await rpc('enviar_aviso_puesto', { p_id: id });
      decir('Listo: tu propuesta quedó en revisión. Te mostramos aquí si se publica o si hay algo que ajustar.', 'success');
    } catch (e) {
      decir(`Tu propuesta se guardó como borrador, pero no pudimos enviarla: ${mensajeError(e)}`, 'error');
    }
    ui.formAviso = false;
    await recargar();
  };

  const enviarAviso = async (id) => {
    try { await rpc('enviar_aviso_puesto', { p_id: id }); decir('Enviamos tu propuesta a revisión.', 'success'); } catch (e) { decir(mensajeError(e), 'error'); }
    await recargar();
  };

  const retirarAviso = async (id) => {
    if (!window.confirm('¿Retirar esta propuesta? No se puede deshacer.')) return;
    try { await rpc('retirar_aviso_puesto', { p_id: id }); decir('Retiraste tu propuesta.', 'success'); } catch (e) { decir(mensajeError(e), 'error'); }
    if (abierto === id) cerrar();
    await recargar();
  };

  // ---------- Eventos ----------
  document.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const abrirBtn = t.closest('[data-puesto-abrir]');
    if (abrirBtn) { abrir(abrirBtn.dataset.puestoAbrir, { desdeFuera: !root.contains(t) }); return; }
    // Enlace «Ayudar con este puesto» que aparece en las tarjetas del mapa.
    const desdeMapa = t.closest('[data-abrir-puesto]');
    if (desdeMapa) { abrir(desdeMapa.dataset.abrirPuesto, { desdeFuera: true }); return; }
    if (t.closest('[data-puesto-mapa]')) { verEnMapa(); return; }
    const cLike = t.closest('[data-pzc-like]');
    if (cLike) { const q = buscar(cLike.dataset.pzcLike); if (q?.aviso) darMeGusta(q); return; }
    const cShare = t.closest('[data-pzc-compartir]');
    if (cShare) { const q = buscar(cShare.dataset.pzcCompartir); if (q?.aviso) compartir(q); return; }
    const cCom = t.closest('[data-pzc-comentar]');
    if (cCom) {
      const q = buscar(cCom.dataset.pzcComentar);
      if (q?.aviso) { abrir(q.id, { desdeFuera: true }); window.setTimeout(() => { const c = el.detalle?.querySelector('#pz-com-texto'); (c || el.detalle?.querySelector('#pz-comentarios'))?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); c?.focus(); }, 80); }
      return;
    }
    const pub = buscar(abierto);
    if (root.contains(t) && pub?.aviso) {
      if (t.closest('[data-pz-like]')) { darMeGusta(pub); return; }
      if (t.closest('[data-pz-compartir]')) { compartir(pub); return; }
      if (t.closest('[data-pz-ir-comentar]')) { const c = el.detalle?.querySelector('#pz-com-texto'); (c || el.detalle?.querySelector('#pz-comentarios'))?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); c?.focus(); return; }
      const ocu = t.closest('[data-pz-ocultar]');
      if (ocu) { ocultarComentario(pub, ocu.dataset.pzOcultar); return; }
    }
    if (!root.contains(t)) return;
    if (t.closest('[data-puesto-volver]')) { cerrar(); return; }
    if (t.closest('[data-aviso-nuevo]')) { ui.formAviso = !ui.formAviso; renderProponer(true); return; }
    if (t.closest('[data-aviso-cancelar]')) { ui.formAviso = false; renderProponer(true); return; }
    const envBtn = t.closest('[data-aviso-enviar]');
    if (envBtn) { enviarAviso(envBtn.dataset.avisoEnviar); return; }
    const retBtn = t.closest('[data-aviso-retirar]');
    if (retBtn) { retirarAviso(retBtn.dataset.avisoRetirar); return; }
    const modBtn = t.closest('[data-moderar]');
    if (modBtn) {
      const tarjetaRev = modBtn.closest('[data-revisar]');
      moderar(modBtn.dataset.id, modBtn.dataset.moderar === 'aprobar', tarjetaRev?.querySelector('[name="motivo"]')?.value);
      return;
    }
    const montoBtn = t.closest('[data-puesto-monto]');
    if (montoBtn) { montoElegido = Number(montoBtn.dataset.puestoMonto); renderDetalle(); return; }
    if (t.closest('[data-puesto-aportar]')) { aportar(); return; }
    if (t.closest('[data-puesto-cuidar]')) { alternarCuidado(); return; }
    if (t.closest('[data-puesto-reponer]')) { reponer(); return; }
    if (t.closest('[data-puesto-falta]')) avisarFalta();
  });

  el.filtros?.addEventListener('change', renderLista);
  el.filtros?.addEventListener('input', renderLista);
  el.filtros?.addEventListener('submit', (e) => e.preventDefault());
  root.addEventListener('submit', (event) => {
    const formCom = event.target instanceof Element ? event.target.closest('[data-pz-comentar]') : null;
    if (formCom) { event.preventDefault(); const pub = buscar(abierto); if (pub?.aviso) comentar(pub, formCom); return; }
    const form = event.target instanceof Element ? event.target.closest('[data-form-aviso]') : null;
    if (!form) return;
    event.preventDefault();
    crearYEnviar(form);
  });

  // Al volver a la sección desde otra vista, se muestra la lista (no un detalle viejo).
  document.addEventListener('vista:cambio', (event) => {
    if (event.detail?.vista === 'comida-agua' && abierto === null) abrirPrimera();
  });

  document.addEventListener('puestos:patrocinio', (event) => {
    const p = buscar(event.detail?.id);
    if (!p?.ficha?.campana) return;
    actualizarAC(p, event.detail.estado);
    renderLista(); renderResumen();
  });

  // ---------- Inicio ----------
  const textoModo = () => {
    const fuerte = root.querySelector('.ayudar-sim strong');
    if (modo === 'servidor') {
      if (fuerte) fuerte.textContent = 'Propuestas de la comunidad.';
      if (el.modo) el.modo.textContent = 'Las revisa moderación antes de publicarlas. Las campañas con patrocinio habilitado reservan AC; no cobran pesos.';
    } else if (el.modo) {
      el.modo.textContent = 'Ejemplos guardados solo en tu navegador: los aportes son una simulación y no se cobra dinero.';
    }
  };

  const iniciar = async () => {
    if (db) {
      try { session = (await db.auth.getSession()).data.session; } catch { session = null; }
      try {
        mem = { puestos: ((await rpc('listar_avisos_puestos')) || []).map(delAviso), aportes: [] };
        modo = 'servidor';
      } catch {
        mem = null;
        modo = 'demo'; // sin la migración (o sin conexión) se muestra la demostración local
      }
    }
    listo = true;
    if (modo === 'servidor') await cargarFinanciacion();
    textoModo();
    if (modo === 'servidor') {
      await cargarMis();
      await cargarModeracion();
    }
    renderModeracion();
    renderProponer(true);
    renderMio();
    abrirPrimera();
    renderResumen();
    renderActividad();
    avisarCambio();
    const directo = new URLSearchParams(window.location.search).get('puesto');
    if (directo && buscar(directo)) abrir(directo, { desdeFuera: true });
    if (modo === 'servidor') db.auth.onAuthStateChange((_ev, s) => { session = s; window.setTimeout(recargar, 0); });
  };
  // Una ayuda concreta (js/tareas.js) abonó sus Aura Coins a este puesto (demo).
  document.addEventListener('tareas:abono', (ev) => {
    const d = ev.detail || {};
    if (d.tipo !== 'puesto') return;
    const p = buscar(d.id);
    if (!p) return;
    p.recaudado_clp = Math.min(p.meta_clp, p.recaudado_clp + (Number(d.clp) || 0));
    guardar(); avisarCambio();
  });

  window.auraLadraPuestos = { lista: () => datos().puestos.slice(), lugares: () => datos().puestos.filter(tieneUbicacion).map(comoLugar), abrir };
  iniciar();
})();

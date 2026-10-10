// Ayudar → Acciones por financiar.
// - Con la migración aplicada, todo pasa por funciones del servidor (ladra.*): el navegador
//   no calcula montos ni marca pagos.
// - Sin la migración, cae a un modo DEMO con datos de ejemplo guardados solo en este navegador.
// En ambos casos los aportes son una SIMULACIÓN: no se cobra ni se mueve dinero.
(() => {
  'use strict';

  const root = document.querySelector('[data-ayudar]');
  if (!root) return;
  const db = window.auraLadraDb;

  // ---------- Utilidades ----------
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(iso)) : '—');
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  const lineas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const mensajeError = (e) => {
    const m = String(e?.message || e || 'No pudimos completar la acción.');
    return m.replace(/^[A-Z_]{4,}:\s*/, '');
  };

  const ESTADOS = { borrador: 'Borrador', en_revision: 'En revisión', recaudando: 'Recaudando', meta_alcanzada: 'Meta alcanzada', programada: 'Programada', en_ejecucion: 'En ejecución', completada: 'Completada', expirada: 'Expirada', cancelada: 'Cancelada', en_disputa: 'En disputa' };
  const CICLO = ['borrador', 'en_revision', 'recaudando', 'meta_alcanzada', 'programada', 'en_ejecucion', 'completada'];
  const DEVOLUCION = { no_aplica: '', pendiente: 'Devolución pendiente', en_proceso: 'Devolución en proceso', completada: 'Devolución completada' };
  const VERIFICACION = { sin_verificar: 'Identidad por verificar', en_revision: 'Verificación en revisión', verificado: 'Identidad verificada' };
  const CATEGORIAS = { alojamiento: 'Alojamiento', cuidado: 'Cuidado', salud: 'Salud', alimentacion: 'Alimentación', traslado: 'Traslado', educacion: 'Educación', otro: 'Otro' };
  const URGENCIAS = { normal: 'Normal', alta: 'Urgencia alta', critica: 'Urgencia crítica' };

  const claseEstado = (e) => (['expirada', 'cancelada', 'en_disputa'].includes(e) ? 'is-rojo' : ['borrador', 'en_revision'].includes(e) ? 'is-gris' : '');
  const chip = (texto, clase = '') => `<span class="chip ${clase}">${esc(texto)}</span>`;

  // ---------- Modo DEMO (solo navegador) ----------
  const demo = (() => {
    const KEY = 'auraladra.demo.acciones.v1';
    let mem = null;
    const DIA = 86400000;
    const ahora = () => Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const semilla = () => ({
      uid: `demo-${uuid().slice(0, 8)}`,
      acciones: [
        { id: 'demo-1', responsable_id: 'demo-otro-1', responsable_alias: 'Cuidadora de ejemplo', ejemplo: true, titulo: '3 días de alojamiento temporal (ejemplo)', descripcion: 'Alojamiento y alimento para que un perro esté seguro y bien cuidado mientras se define su adopción.', categoria: 'alojamiento', comuna: 'Maipú', urgencia: 'alta', estado: 'recaudando', estado_devolucion: 'no_aplica', verificacion: 'sin_verificar', incluye: ['Alojamiento y alimento', 'Baño y registro de cuidados'], no_incluye: ['Atención veterinaria', 'Traslados'], condiciones_cancelacion: 'Se puede cancelar hasta 48 horas antes de la fecha programada.', condiciones_devolucion: 'Si no se completa la meta, los aportes se devuelven completos.', meta_clp: 100000, recaudado_clp: 65000, fecha_limite: iso(ahora() + 12 * DIA), plazo_ejecucion_dias: 7, disponibilidad_prestador: 'Lunes a viernes', fecha_ejecucion: null, desembolso: 'no_liberado', modo_pago: 'simulacion', motivo_cancelacion: null, animal: null, partidas: [{ concepto: 'Alojamiento y alimento (3 días)', tipo: 'prestacion', monto_clp: 90000 }, { concepto: 'Baño y registro de cuidados', tipo: 'prestacion', monto_clp: 5000 }, { concepto: 'Comisión de plataforma', tipo: 'comision_plataforma', monto_clp: 3000 }, { concepto: 'Costos de pago', tipo: 'costo_pago', monto_clp: 2000 }], actualizaciones: [], historial: [] },
        { id: 'demo-2', responsable_id: 'demo-otro-2', responsable_alias: 'Veterinaria de ejemplo', ejemplo: true, titulo: 'Control veterinario de un gato comunitario (ejemplo)', descripcion: 'Consulta, desparasitación y vacuna para un gato que vive en la plaza del barrio.', categoria: 'salud', comuna: 'Maipú', urgencia: 'normal', estado: 'recaudando', estado_devolucion: 'no_aplica', verificacion: 'en_revision', incluye: ['Consulta', 'Vacuna', 'Desparasitación'], no_incluye: ['Cirugías'], condiciones_cancelacion: 'Cancelación posible hasta antes de la consulta.', condiciones_devolucion: 'Devolución completa si no se alcanza la meta.', meta_clp: 45000, recaudado_clp: 12000, fecha_limite: iso(ahora() + 20 * DIA), plazo_ejecucion_dias: 10, disponibilidad_prestador: 'Sábados', fecha_ejecucion: null, desembolso: 'no_liberado', modo_pago: 'simulacion', motivo_cancelacion: null, animal: null, partidas: [{ concepto: 'Consulta y vacuna', tipo: 'prestacion', monto_clp: 45000 }], actualizaciones: [], historial: [] },
        { id: 'demo-3', responsable_id: 'demo-otro-3', responsable_alias: 'Vecinos del canil (ejemplo)', ejemplo: true, titulo: 'Alimento del canil por un mes (ejemplo)', descripcion: 'Alimento seco para los perros del canil durante un mes.', categoria: 'alimentacion', comuna: 'Maipú', urgencia: 'normal', estado: 'en_ejecucion', estado_devolucion: 'no_aplica', verificacion: 'verificado', incluye: ['Alimento seco'], no_incluye: ['Medicamentos'], condiciones_cancelacion: 'No se cancela una vez iniciada la ejecución; se abre una disputa.', condiciones_devolucion: 'Aplica solo antes de ejecutarse.', meta_clp: 80000, recaudado_clp: 80000, fecha_limite: iso(ahora() - 3 * DIA), plazo_ejecucion_dias: 14, disponibilidad_prestador: 'Entrega semanal', fecha_ejecucion: iso(ahora() + 2 * DIA), desembolso: 'no_liberado', modo_pago: 'simulacion', motivo_cancelacion: null, animal: null, partidas: [{ concepto: 'Alimento seco 40 kg', tipo: 'prestacion', monto_clp: 80000 }], actualizaciones: [{ tipo: 'avance', texto: 'Se compró la primera tanda de alimento.', url: null, creado_en: iso(ahora() - DIA) }], historial: [] },
      ],
      aportes: [],
    });
    const cargar = () => {
      try { const v = JSON.parse(window.localStorage.getItem(KEY)); if (v?.acciones) return v; } catch { /* sin almacenamiento */ }
      return semilla();
    };
    const d = () => { if (!mem) mem = cargar(); return mem; };
    const guardar = () => { try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* sin almacenamiento */ } };
    const falla = (codigo, texto) => { throw new Error(`${codigo}: ${texto}`); };
    const hist = (a, campo, antes, despues) => a.historial.unshift({ campo, anterior: antes, nuevo: despues, creado_en: iso(ahora()) });
    const vencer = () => {
      d().acciones.forEach((a) => {
        if (a.estado === 'recaudando' && new Date(a.fecha_limite).getTime() <= ahora()) {
          hist(a, 'estado', a.estado, 'expirada');
          a.estado = 'expirada';
          a.estado_devolucion = a.recaudado_clp > 0 ? 'pendiente' : 'no_aplica';
        }
      });
    };
    const buscar = (id) => { const a = d().acciones.find((x) => x.id === id); if (!a) falla('NO_ENCONTRADA', 'La acción no existe.'); return a; };
    const dueño = (a) => { if (a.responsable_id !== d().uid) falla('TRANSICION_INVALIDA', 'Solo el responsable puede hacer esto.'); };
    const publica = (a) => ['recaudando', 'meta_alcanzada', 'programada', 'en_ejecucion', 'completada'].includes(a.estado);
    const resumen = (a) => ({ id: a.id, titulo: a.titulo, descripcion: a.descripcion, categoria: a.categoria, comuna: a.comuna, urgencia: a.urgencia, estado: a.estado, meta_clp: a.meta_clp, recaudado_clp: a.recaudado_clp, fecha_limite: a.fecha_limite, verificacion: a.verificacion, modo_pago: a.modo_pago, animal_id: null, animal_nombre: null, responsable_alias: a.responsable_alias || 'Tú (demo)', creado_en: a.fecha_limite, ejemplo: !!a.ejemplo });
    return {
      uid: () => d().uid,
      async listar(f) {
        vencer(); guardar();
        const orden = { critica: 0, alta: 1, normal: 2 };
        return d().acciones.filter((a) => publica(a)
          && (!f.categoria || a.categoria === f.categoria)
          && (!f.comuna || a.comuna.toLowerCase() === f.comuna.trim().toLowerCase())
          && (!f.urgencia || a.urgencia === f.urgencia)
          && (!f.estado || a.estado === f.estado))
          .sort((x, y) => orden[x.urgencia] - orden[y.urgencia] || new Date(x.fecha_limite) - new Date(y.fecha_limite)).map(resumen);
      },
      async detalle(id) {
        vencer(); guardar();
        const a = d().acciones.find((x) => x.id === id);
        if (!a) return null;
        const aporto = d().aportes.some((p) => p.accion_id === id);
        if (!publica(a) && a.responsable_id !== d().uid && !aporto) return null;
        const { partidas, actualizaciones, historial, ...resto } = a;
        return { accion: { ...resto, faltante_clp: a.meta_clp - a.recaudado_clp, responsable_alias: a.responsable_alias || 'Tú (demo)' }, partidas, actualizaciones, historial, es_responsable: a.responsable_id === d().uid };
      },
      async aportar(id, monto, clave) {
        vencer();
        const a = buscar(id);
        const previo = d().aportes.find((p) => p.clave === clave);
        if (previo) return { aporte_id: previo.id, repetido: true, recaudado_clp: a.recaudado_clp, meta_clp: a.meta_clp, estado: a.estado };
        if (a.estado !== 'recaudando') falla('ACCION_NO_RECAUDANDO', 'Esta acción ya no recibe aportes.');
        if (a.responsable_id === d().uid) falla('APORTE_PROPIO', 'El responsable no puede aportar a su propia acción.');
        if (!Number.isInteger(monto) || monto < 1000) falla('MONTO_INVALIDO', 'El aporte mínimo es $1.000.');
        if (monto > a.meta_clp - a.recaudado_clp) falla('EXCEDE_META', `Faltan ${clp.format(a.meta_clp - a.recaudado_clp)}.`);
        const nuevo = { id: `ap-${uuid().slice(0, 8)}`, accion_id: id, monto_clp: monto, clave, estado: 'confirmado', creado_en: iso(ahora()) };
        d().aportes.unshift(nuevo);
        a.recaudado_clp += monto;
        if (a.recaudado_clp === a.meta_clp) { hist(a, 'estado', a.estado, 'meta_alcanzada'); a.estado = 'meta_alcanzada'; }
        guardar();
        return { aporte_id: nuevo.id, repetido: false, recaudado_clp: a.recaudado_clp, meta_clp: a.meta_clp, estado: a.estado };
      },
      async misAportes() {
        vencer();
        return d().aportes.map((p) => { const a = buscar(p.accion_id); return { aporte_id: p.id, accion_id: a.id, accion_titulo: a.titulo, accion_estado: a.estado, estado_devolucion: a.estado_devolucion, monto_clp: p.monto_clp, estado: p.estado, simulado: true, creado_en: p.creado_en }; });
      },
      async misAcciones() {
        vencer();
        return d().acciones.filter((a) => a.responsable_id === d().uid).map((a) => ({ id: a.id, titulo: a.titulo, categoria: a.categoria, estado: a.estado, estado_devolucion: a.estado_devolucion, meta_clp: a.meta_clp, recaudado_clp: a.recaudado_clp, fecha_limite: a.fecha_limite, verificacion: a.verificacion, creado_en: a.fecha_limite }));
      },
      async crear(p) {
        const limite = p.fecha_limite ? new Date(p.fecha_limite).getTime() : 0;
        if (!(limite > ahora() + DIA && limite <= ahora() + 120 * DIA)) falla('FECHA_LIMITE_INVALIDA', 'Debe estar entre 1 y 120 días desde hoy.');
        const total = p.partidas.reduce((s, x) => s + x.monto_clp, 0);
        if (!p.partidas.length || total < 1000 || total > 5000000) falla('META_INVALIDA', 'La meta debe estar entre $1.000 y $5.000.000.');
        if (p.titulo.trim().length < 8 || p.descripcion.trim().length < 20) falla('DATOS_INVALIDOS', 'El título necesita 8 letras y la descripción 20.');
        const a = { id: `demo-${uuid().slice(0, 8)}`, responsable_id: d().uid, responsable_alias: null, ejemplo: false, titulo: p.titulo.trim(), descripcion: p.descripcion.trim(), categoria: p.categoria, comuna: p.comuna.trim(), urgencia: p.urgencia, estado: 'borrador', estado_devolucion: 'no_aplica', verificacion: 'sin_verificar', incluye: p.incluye, no_incluye: p.no_incluye, condiciones_cancelacion: p.condiciones_cancelacion, condiciones_devolucion: p.condiciones_devolucion, meta_clp: total, recaudado_clp: 0, fecha_limite: new Date(limite).toISOString(), plazo_ejecucion_dias: p.plazo_ejecucion_dias, disponibilidad_prestador: p.disponibilidad || null, fecha_ejecucion: null, desembolso: 'no_liberado', modo_pago: 'simulacion', motivo_cancelacion: null, animal: null, partidas: p.partidas, actualizaciones: [], historial: [] };
        hist(a, 'estado', null, 'borrador');
        d().acciones.unshift(a); guardar();
        return a.id;
      },
      async enviar(id) { const a = buscar(id); dueño(a); if (a.estado !== 'borrador') falla('TRANSICION_INVALIDA', 'Solo un borrador se envía a revisión.'); hist(a, 'estado', a.estado, 'en_revision'); a.estado = 'en_revision'; guardar(); },
      async aprobarDemo(id) { const a = buscar(id); if (a.estado !== 'en_revision') falla('TRANSICION_INVALIDA', 'La acción no está en revisión.'); hist(a, 'estado', a.estado, 'recaudando'); a.estado = 'recaudando'; guardar(); },
      async cancelar(id, motivo) {
        const a = buscar(id); dueño(a);
        if (!['borrador', 'en_revision', 'recaudando', 'meta_alcanzada', 'programada'].includes(a.estado)) falla('TRANSICION_INVALIDA', 'La acción ya no se puede cancelar. Si ya empezó, abre una disputa.');
        hist(a, 'estado', a.estado, 'cancelada');
        a.estado = 'cancelada'; a.motivo_cancelacion = motivo || null;
        a.estado_devolucion = a.recaudado_clp > 0 ? 'pendiente' : 'no_aplica';
        guardar();
      },
      async programar(id, fechaEj) {
        const a = buscar(id); dueño(a);
        if (a.estado !== 'meta_alcanzada' || !(new Date(fechaEj).getTime() > ahora())) falla('TRANSICION_INVALIDA', 'La meta debe estar alcanzada y la fecha debe ser futura.');
        hist(a, 'estado', a.estado, 'programada'); a.estado = 'programada'; a.fecha_ejecucion = new Date(fechaEj).toISOString(); guardar();
      },
      async iniciar(id) { const a = buscar(id); dueño(a); if (a.estado !== 'programada') falla('TRANSICION_INVALIDA', 'La acción debe estar programada.'); hist(a, 'estado', a.estado, 'en_ejecucion'); a.estado = 'en_ejecucion'; guardar(); },
      async avance(id, tipo, texto, url) {
        const a = buscar(id); dueño(a);
        if (!['programada', 'en_ejecucion', 'completada'].includes(a.estado)) falla('TRANSICION_INVALIDA', 'Solo se publican avances de una acción programada o en ejecución.');
        if (url && !httpsUrl(url)) falla('URL_INVALIDA', 'El enlace debe empezar con https://');
        a.actualizaciones.unshift({ tipo, texto, url: url || null, creado_en: iso(ahora()) }); guardar();
      },
      async cierre(id) {
        const a = buscar(id); dueño(a);
        if (!a.actualizaciones.some((u) => u.tipo === 'evidencia')) falla('EVIDENCIA_REQUERIDA', 'Publica al menos una evidencia antes de solicitar el cierre.');
        if (a.estado !== 'en_ejecucion') falla('TRANSICION_INVALIDA', 'La acción debe estar en ejecución.');
        hist(a, 'estado', a.estado, 'completada'); a.estado = 'completada'; guardar();
      },
      async animales() { return []; },
    };
  })();

  // ---------- Modo SERVIDOR (funciones ladra.*) ----------
  const rpc = async (nombre, args) => {
    const { data, error } = await db.rpc(nombre, args);
    if (error) throw error;
    return data;
  };
  const servidor = {
    uid: () => session?.user?.id || null,
    listar: (f) => rpc('acciones_publicas', { p_categoria: f.categoria || null, p_comuna: f.comuna || null, p_urgencia: f.urgencia || null, p_estado: f.estado || null }),
    detalle: (id) => rpc('accion_detalle', { p_accion_id: id }),
    aportar: async (id, monto, clave) => (await rpc('aportar_simulado', { p_accion_id: id, p_monto_clp: monto, p_clave_idempotencia: clave }))[0],
    misAportes: () => rpc('mis_aportes'),
    misAcciones: () => rpc('mis_acciones'),
    crear: (p) => rpc('crear_accion', { p_titulo: p.titulo, p_descripcion: p.descripcion, p_categoria: p.categoria, p_comuna: p.comuna, p_urgencia: p.urgencia, p_animal_id: p.animal_id || null, p_incluye: p.incluye, p_no_incluye: p.no_incluye, p_condiciones_cancelacion: p.condiciones_cancelacion, p_condiciones_devolucion: p.condiciones_devolucion, p_fecha_limite: p.fecha_limite, p_plazo_ejecucion_dias: p.plazo_ejecucion_dias, p_disponibilidad: p.disponibilidad || null, p_partidas: p.partidas }),
    enviar: (id) => rpc('enviar_accion_a_revision', { p_accion_id: id }),
    cancelar: (id, motivo) => rpc('cancelar_accion', { p_accion_id: id, p_motivo: motivo || null }),
    programar: (id, f) => rpc('programar_accion', { p_accion_id: id, p_fecha_ejecucion: f }),
    iniciar: (id) => rpc('iniciar_ejecucion_accion', { p_accion_id: id }),
    avance: (id, tipo, texto, url) => rpc('publicar_avance_accion', { p_accion_id: id, p_tipo: tipo, p_texto: texto, p_url: url || null }),
    cierre: (id) => rpc('solicitar_cierre_accion', { p_accion_id: id }),
    animales: async () => { try { return (await rpc('mis_animales')) || []; } catch { return []; } },
  };

  // ---------- Estado ----------
  let session = null;
  let modo = 'servidor';
  let api = servidor;
  let detalleActual = null;
  let aporteEstado = null; // { monto, clave, paso: 'monto' | 'revisar' }
  const ui = { formNueva: false, avanceId: null, fechaId: null, personal: 'aportes' };
  const el = {
    modo: root.querySelector('[data-ayudar-modo]'),
    vistaLista: root.querySelector('[data-ayudar-vista-lista]'),
    lista: root.querySelector('[data-ayudar-lista]'),
    filtros: root.querySelector('[data-ayudar-filtros]'),
    detalle: root.querySelector('[data-ayudar-detalle]'),
  };
  const filtros = () => Object.fromEntries(new FormData(el.filtros).entries());
  const esDemo = () => modo === 'demo';
  const hayCuenta = () => esDemo() || !!session?.user;
  const faltaBackend = (e) => {
    const t = `${e?.code || ''} ${e?.message || ''} ${e?.status || ''}`;
    return /PGRST20[25]|PGRST106|schema cache|Could not find|does not exist|404|Invalid schema/i.test(t);
  };

  const textoModo = () => {
    el.modo.textContent = esDemo()
      ? 'Esta versión de desarrollo usa datos de ejemplo guardados solo en tu navegador. No se cobra dinero y nada de esto es un aporte real.'
      : 'Los aportes de esta versión son simulaciones: no se cobra dinero. El cobro real se activará cuando estén definidos la pasarela y las reglas de desembolso.';
  };

  // ---------- Lista ----------
  const progresoHtml = (rec, meta) => {
    const pct = meta > 0 ? Math.min(100, Math.round((rec / meta) * 100)) : 0;
    return `<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Recaudación ${pct}%"><span style="width:${pct}%"></span></div>
      <div class="progreso-texto"><span><strong>${clp.format(rec)}</strong> de ${clp.format(meta)}</span><span>Faltan ${clp.format(Math.max(0, meta - rec))} · ${pct}%</span></div>`;
  };

  const tarjeta = (a) => `<article class="accion-card">
    <div class="accion-meta">${chip(CATEGORIAS[a.categoria] || a.categoria)}${a.urgencia !== 'normal' ? chip(URGENCIAS[a.urgencia], 'is-ambar') : ''}${chip(ESTADOS[a.estado] || a.estado, claseEstado(a.estado))}${a.ejemplo ? chip('Datos de ejemplo', 'is-sim') : ''}</div>
    <h3>${esc(a.titulo)}</h3>
    <p>${esc(a.descripcion.length > 120 ? `${a.descripcion.slice(0, 117)}…` : a.descripcion)}</p>
    ${progresoHtml(a.recaudado_clp, a.meta_clp)}
    <p>${esc(a.comuna)} · Límite ${esc(fecha(a.fecha_limite))} · ${esc(a.responsable_alias)}</p>
    <div class="accion-meta">${chip(VERIFICACION[a.verificacion] || a.verificacion, a.verificacion === 'verificado' ? '' : 'is-ambar')}</div>
    <button class="button-verde" type="button" data-abrir="${esc(a.id)}">Ver acción</button>
  </article>`;

  // ---------- Panel de resumen: cuántas acciones se han financiado y completado ----------
  const ESTADOS_DASH = [
    ['recaudando', 'Recaudando', 'e-rec'], ['meta_alcanzada', 'Meta alcanzada', 'e-meta'],
    ['programada', 'Programadas', 'e-prog'], ['en_ejecucion', 'En ejecución', 'e-ejec'], ['completada', 'Completadas', 'e-comp'],
  ];
  const dibujarDash = async () => {
    const box = root.querySelector('[data-ayudar-dash]');
    if (!box) return;
    let todas = [];
    try { todas = await api.listar({}); } catch { box.hidden = true; return; }
    box.hidden = false;
    const n = (e) => todas.filter((a) => a.estado === e).length;
    const financiadas = todas.filter((a) => ['meta_alcanzada', 'programada', 'en_ejecucion', 'completada'].includes(a.estado)).length;
    const total = todas.reduce((s, a) => s + (Number(a.recaudado_clp) || 0), 0);
    const tiles = [[String(todas.length), 'Acciones publicadas'], [String(financiadas), 'Ya financiadas'], [String(n('completada')), 'Completadas'], [`$${new Intl.NumberFormat('es-CL').format(total)}`, 'Aportado (simulado)']];
    const cont = box.querySelector('[data-ayd-tiles]');
    cont.replaceChildren(...tiles.map(([v, t]) => {
      const d = document.createElement('div'); d.className = 'ayd-tile';
      const b = document.createElement('strong'); b.textContent = v;
      const s = document.createElement('span'); s.textContent = t;
      d.append(b, s); return d;
    }));
    const barra = box.querySelector('[data-ayd-barra]');
    const ley = box.querySelector('[data-ayd-leyenda]');
    barra.replaceChildren(); ley.replaceChildren();
    ESTADOS_DASH.forEach(([e, txt, cls]) => {
      const c = n(e);
      if (c && todas.length) {
        const seg = document.createElement('span'); seg.className = `ayd-seg ${cls}`;
        seg.style.width = `${(c / todas.length) * 100}%`; barra.append(seg);
      }
      const li = document.createElement('li');
      const pt = document.createElement('span'); pt.className = `ayd-pt ${cls}`; pt.setAttribute('aria-hidden', 'true');
      li.append(pt, document.createTextNode(`${txt}: ${c}`)); ley.append(li);
    });
    barra.setAttribute('aria-label', `De ${todas.length} acciones: ${ESTADOS_DASH.map(([e, t]) => `${t.toLowerCase()} ${n(e)}`).join(', ')}`);
  };

  const cargarLista = async () => {
    el.lista.innerHTML = '<p class="ayudar-vacio">Cargando acciones…</p>';
    dibujarDash();
    try {
      const items = await api.listar(filtros());
      el.lista.innerHTML = items.length
        ? items.map(tarjeta).join('')
        : '<p class="ayudar-vacio">Todavía no hay acciones con estos filtros. Prueba otros filtros o propón una desde Mi perfil → Mis acciones.</p>';
    } catch (e) {
      el.lista.innerHTML = `<p class="ayudar-vacio">No pudimos cargar las acciones. ${esc(mensajeError(e))}</p>`;
    }
  };

  // ---------- Ficha ----------
  const cicloHtml = (estado) => {
    const idx = CICLO.indexOf(estado);
    const items = CICLO.map((k, i) => `<li class="${i === idx ? 'is-actual' : idx > -1 && i < idx ? 'is-hecho' : ''}"${i === idx ? ' aria-current="step"' : ''}>${esc(ESTADOS[k])}</li>`).join('');
    return `<ol class="ciclo" aria-label="Estado de la acción">${items}</ol>`;
  };

  const presupuestoHtml = (partidas, meta) => {
    const prest = partidas.filter((p) => p.tipo === 'prestacion');
    const otros = partidas.filter((p) => p.tipo !== 'prestacion');
    const fila = (p, extra = '') => `<tr class="${extra}"><td>${esc(p.concepto)}${p.tipo === 'comision_plataforma' ? ' (comisión de plataforma)' : p.tipo === 'costo_pago' ? ' (costo de pago)' : ''}</td><td>${clp.format(p.monto_clp)}</td></tr>`;
    return `<table class="partidas"><tbody>${prest.map((p) => fila(p)).join('')}${otros.map((p) => fila(p, 'es-comision')).join('')}<tr class="es-total"><td>Meta total</td><td>${clp.format(meta)}</td></tr></tbody></table>
      ${otros.length ? '' : '<p><small>Sin comisión de plataforma ni costos de pago.</small></p>'}`;
  };

  const lista = (items) => (items?.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p><small>No se indicó.</small></p>');

  const detalleHtml = (det) => {
    const a = det.accion;
    const foto = a.animal?.foto_url && httpsUrl(a.animal.foto_url)
      ? `<img class="detalle-foto" src="${esc(a.animal.foto_url)}" alt="Foto de ${esc(a.animal.nombre)}">`
      : '<div class="detalle-sin-foto">Sin fotografías todavía</div>';
    const terminal = ['expirada', 'cancelada', 'en_disputa'].includes(a.estado);
    const ups = det.actualizaciones || [];
    const puedeAportar = a.estado === 'recaudando' && !det.es_responsable;
    return `<button class="button-borde detalle-volver" type="button" data-volver>← Volver a las acciones</button>
      <div class="accion-meta">${chip(CATEGORIAS[a.categoria] || a.categoria)}${a.urgencia !== 'normal' ? chip(URGENCIAS[a.urgencia], 'is-ambar') : ''}${chip(ESTADOS[a.estado] || a.estado, claseEstado(a.estado))}${DEVOLUCION[a.estado_devolucion] ? chip(DEVOLUCION[a.estado_devolucion], 'is-ambar') : ''}${a.ejemplo ? chip('Datos de ejemplo', 'is-sim') : ''}${chip('Simulación', 'is-sim')}</div>
      <h3 tabindex="-1" data-detalle-titulo>${esc(a.titulo)}</h3>
      ${foto}
      <p>${esc(a.descripcion)}</p>
      ${terminal ? `<p class="ayudar-msg is-error">Esta acción está ${esc((ESTADOS[a.estado] || '').toLowerCase())}.${a.motivo_cancelacion ? ` Motivo: ${esc(a.motivo_cancelacion)}.` : ''} ${DEVOLUCION[a.estado_devolucion] ? `${esc(DEVOLUCION[a.estado_devolucion])}; el dinero no cambia de destino sin tu consentimiento.` : ''}</p>` : ''}
      ${cicloHtml(a.estado)}
      <div class="detalle-bloque"><h4>Recaudación</h4>${progresoHtml(a.recaudado_clp, a.meta_clp)}
        <p>Fecha límite para recaudar: <strong>${esc(fecha(a.fecha_limite))}</strong></p>
        <p>Plazo de ejecución: <strong>${esc(a.plazo_ejecucion_dias)} días</strong> tras alcanzar la meta${a.fecha_ejecucion ? ` · Programada para <strong>${esc(fecha(a.fecha_ejecucion))}</strong>` : ''}</p>
        <p>Disponibilidad del prestador: ${esc(a.disponibilidad_prestador || 'No indicada')}</p></div>
      <div class="detalle-bloque"><h4>Animal beneficiario</h4>${a.animal ? `<p><strong>${esc(a.animal.nombre)}</strong> · <a href="#red">Ver en Red animal</a></p>` : '<p>Sin ficha vinculada.</p>'}</div>
      <div class="detalle-bloque"><h4>Responsable</h4><p>${esc(a.responsable_alias)} ${chip(VERIFICACION[a.verificacion] || a.verificacion, a.verificacion === 'verificado' ? '' : 'is-ambar')}</p>
        <p><small>Mostramos el estado real: la verificación solo cambia cuando la moderación la confirma.</small></p></div>
      <div class="detalle-bloque"><h4>Qué incluye</h4>${lista(a.incluye)}<h4 style="margin-top:12px">Qué queda fuera</h4>${lista(a.no_incluye)}</div>
      <div class="detalle-bloque"><h4>Presupuesto</h4>${presupuestoHtml(det.partidas || [], a.meta_clp)}</div>
      <div class="detalle-bloque"><h4>Condiciones</h4><p><strong>Cancelación:</strong> ${esc(a.condiciones_cancelacion)}</p><p><strong>Devolución:</strong> ${esc(a.condiciones_devolucion)}</p>
        <p><small>Alcanzar la meta no significa que el trabajo esté hecho: los fondos no se liberan hasta que el responsable confirme la ejecución y documente el resultado. Desembolso: ${a.desembolso === 'no_liberado' ? 'no liberado' : esc(a.desembolso)}.</small></p></div>
      <div class="detalle-bloque" data-seguimiento><h4>Avances, documentos y evidencia</h4>${ups.length ? `<ul>${ups.map((u) => `<li><strong>${esc(u.tipo)}</strong> · ${esc(fecha(u.creado_en))}: ${esc(u.texto)}${httpsUrl(u.url) ? ` · <a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">Ver respaldo</a>` : ''}</li>`).join('')}</ul>` : '<p>Aún no hay avances publicados.</p>'}</div>
      <details class="detalle-bloque"><summary><strong>Historial de cambios</strong></summary>${(det.historial || []).length ? `<ul>${det.historial.map((h) => `<li>${esc(fecha(h.creado_en))} · ${esc(h.campo)}: ${esc(h.anterior ?? '—')} → ${esc(h.nuevo ?? '—')}</li>`).join('')}</ul>` : '<p>Sin cambios registrados.</p>'}</details>
      <div class="acciones-detalle">
        ${puedeAportar ? '<button class="button-verde" type="button" data-aportar>Aportar</button>' : ''}
        <div data-aportar-panel hidden></div>
        <button class="button-borde" type="button" data-seguir>Seguir avances</button>
        <button class="button-borde" type="button" data-consultar>Consultar</button>
        <p class="ayudar-msg" data-consultar-nota hidden>Las consultas al responsable llegarán con la mensajería de Convergencia Aura. Por ahora no se publican datos de contacto.</p>
        ${!puedeAportar && a.estado === 'recaudando' && det.es_responsable ? '<p class="ayudar-msg">Eres la persona responsable: no puedes aportar a tu propia acción.</p>' : ''}
        <p class="ayudar-msg" data-detalle-msg role="status"></p>
      </div>`;
  };

  const abrirDetalle = async (id) => {
    el.detalle.hidden = false;
    el.vistaLista.hidden = true;
    el.detalle.innerHTML = '<p class="ayudar-vacio">Cargando…</p>';
    try {
      const det = await api.detalle(id);
      if (!det) throw new Error('Esta acción no existe o no está disponible.');
      detalleActual = det;
      aporteEstado = null;
      el.detalle.innerHTML = detalleHtml(det);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.detalle.querySelector('[data-detalle-titulo]')?.focus({ preventScroll: true });
    } catch (e) {
      el.detalle.innerHTML = `<button class="button-borde detalle-volver" type="button" data-volver>← Volver</button><p class="ayudar-vacio">${esc(mensajeError(e))}</p>`;
    }
  };

  const cerrarDetalle = () => {
    el.detalle.hidden = true;
    el.vistaLista.hidden = false;
    detalleActual = null;
    cargarLista();
  };

  // ---------- Aportar (simulación) ----------
  const panelAporte = () => el.detalle.querySelector('[data-aportar-panel]');
  const mensajeDetalle = (texto, tipo = '') => {
    const m = el.detalle.querySelector('[data-detalle-msg]');
    if (!m) return;
    m.textContent = texto;
    m.className = `ayudar-msg ${tipo ? `is-${tipo}` : ''}`;
  };

  const pintarAporte = () => {
    const panel = panelAporte();
    if (!panel || !detalleActual) return;
    const a = detalleActual.accion;
    const faltan = a.meta_clp - a.recaudado_clp;
    if (!hayCuenta()) {
      panel.hidden = false;
      panel.innerHTML = '<div class="aportar-panel"><p>Inicia sesión para aportar. <a href="#cuenta">Ir a Mi cuenta</a></p></div>';
      return;
    }
    const { monto, paso } = aporteEstado;
    const valido = Number.isInteger(monto) && monto >= 1000 && monto <= faltan;
    const preset = [5000, 10000, 20000].map((m) => `<button type="button" class="monto-btn" data-monto="${m}" aria-pressed="${monto === m}">${clp.format(m)}</button>`).join('');
    panel.hidden = false;
    panel.innerHTML = paso === 'monto'
      ? `<div class="aportar-panel"><h4>Elige tu aporte</h4>
          <div class="montos">${preset}<button type="button" class="monto-btn" data-monto="otro" aria-pressed="${![5000, 10000, 20000].includes(monto) && monto !== null}">Otro</button></div>
          <label class="field"><span>Monto en CLP (mínimo $1.000, máximo lo que falta: ${clp.format(faltan)})</span><input type="number" inputmode="numeric" min="1000" max="${faltan}" step="1000" data-monto-input value="${Number.isInteger(monto) ? monto : ''}"></label>
          <button class="button-verde" type="button" data-revisar ${valido ? '' : 'disabled'}>Revisar aporte</button></div>`
      : `<div class="aportar-panel"><h4>Revisa antes de aportar</h4>
          <div class="resumen-aporte"><p><span>Acción</span><span>${esc(a.titulo)}</span></p><p><span>Tu aporte</span><span>${clp.format(monto)}</span></p><p><span>Faltará después</span><span>${clp.format(faltan - monto)}</span></p><p><span>Total a aportar</span><span>${clp.format(monto)}</span></p></div>
          <p><small>Es una <strong>simulación</strong>: no se cobra dinero. Es un aporte solidario para financiar esta acción; no ofrece intereses ni retornos.</small></p>
          <div class="mini-acciones"><button class="button-verde" type="button" data-confirmar>Confirmar aporte (simulación)</button><button class="button-borde" type="button" data-editar-aporte>Cambiar monto</button></div></div>`;
  };

  const iniciarAporte = () => {
    aporteEstado = { monto: null, clave: null, paso: 'monto' };
    pintarAporte();
    panelAporte()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  let aporteEnCurso = false;
  const confirmarAporte = async (boton) => {
    if (!aporteEstado || aporteEnCurso) return;
    aporteEnCurso = true;
    if (!aporteEstado.clave) aporteEstado.clave = uuid();
    boton.disabled = true;
    mensajeDetalle('Registrando aporte simulado…');
    try {
      const r = await api.aportar(detalleActual.accion.id, aporteEstado.monto, aporteEstado.clave);
      aporteEstado = null;
      await abrirDetalle(detalleActual.accion.id);
      refrescarPersonal();
      mensajeDetalle(r.repetido ? 'Ese aporte ya estaba registrado; no se duplicó.' : `Aporte simulado registrado. No se cobró dinero.${r.estado === 'meta_alcanzada' ? ' ¡Se alcanzó la meta!' : ''}`, 'success');
    } catch (e) {
      boton.disabled = false;
      mensajeDetalle(mensajeError(e), 'error');
      if (/EXCEDE|ya no recibe|NO_RECAUDANDO/i.test(String(e?.message))) await abrirDetalle(detalleActual.accion.id);
    } finally {
      aporteEnCurso = false;
    }
  };

  // ---------- Personal: Mis aportes / Mis acciones ----------
  const sinCuenta = '<p class="ayudar-vacio">Inicia sesión para ver esta sección. <a href="#cuenta">Ir a Mi cuenta</a></p>';

  // Mi perfil muestra cuántos aportes hizo la persona en «Aportes a la comunidad».
  const avisarAportes = (aportes) => document.dispatchEvent(new CustomEvent('ayuda:cambio', { detail: { aportes } }));

  const renderAportes = async (cont) => {
    if (!cont) return;
    if (!hayCuenta()) { cont.innerHTML = sinCuenta; avisarAportes(0); return; }
    cont.innerHTML = '<p class="ayudar-vacio">Cargando…</p>';
    try {
      const items = await api.misAportes();
      avisarAportes(items.length);
      cont.innerHTML = items.length ? `<div class="mini-lista">${items.map((p) => `<div class="mini-item">
        <h4>${esc(p.accion_titulo)}</h4>
        <div class="accion-meta">${chip(clp.format(p.monto_clp))}${chip(ESTADOS[p.accion_estado] || p.accion_estado, claseEstado(p.accion_estado))}${DEVOLUCION[p.estado_devolucion] ? chip(DEVOLUCION[p.estado_devolucion], 'is-ambar') : ''}${p.simulado ? chip('Simulación', 'is-sim') : ''}</div>
        <small>${esc(fecha(p.creado_en))}</small>
        <div class="mini-acciones"><button class="button-borde" type="button" data-abrir="${esc(p.accion_id)}">Ver acción</button></div></div>`).join('')}</div>`
        : '<p class="ayudar-vacio">Todavía no has aportado a ninguna acción.</p>';
    } catch (e) { cont.innerHTML = `<p class="ayudar-vacio">${esc(mensajeError(e))}</p>`; }
  };

  const botonesEstado = (a) => {
    const b = (act, txt, clase = 'button-borde') => `<button class="${clase}" type="button" data-act="${act}" data-id="${esc(a.id)}">${txt}</button>`;
    const out = [];
    if (a.estado === 'borrador') out.push(b('enviar', 'Enviar a revisión', 'button-verde'));
    if (a.estado === 'en_revision' && esDemo()) out.push(b('aprobar', 'Aprobar (demo)', 'button-verde'));
    if (a.estado === 'meta_alcanzada') out.push(b('abrir-fecha', 'Confirmar fecha de realización', 'button-verde'));
    if (a.estado === 'programada') out.push(b('iniciar', 'Iniciar ejecución', 'button-verde'));
    if (['programada', 'en_ejecucion'].includes(a.estado)) out.push(b('abrir-avance', 'Publicar avance'));
    if (a.estado === 'en_ejecucion') out.push(b('cierre', 'Solicitar cierre', 'button-verde'));
    if (['borrador', 'en_revision', 'recaudando', 'meta_alcanzada', 'programada'].includes(a.estado)) out.push(b('cancelar', 'Cancelar'));
    out.push(`<button class="button-borde" type="button" data-abrir="${esc(a.id)}">Ver ficha</button>`);
    return out.join('');
  };

  const formAvance = (id) => `<form class="ayudar-form" data-form-avance data-id="${esc(id)}">
    <label>Tipo<select name="tipo"><option value="avance">Avance</option><option value="documento">Documento</option><option value="evidencia">Evidencia de cumplimiento</option></select></label>
    <label>Descripción<textarea name="texto" minlength="3" maxlength="600" required></textarea></label>
    <label>Enlace de respaldo (opcional, https)<input name="url" type="url" placeholder="https://"></label>
    <button class="button-verde" type="submit">Publicar</button></form>`;
  const formFecha = (id) => `<form class="ayudar-form" data-form-fecha data-id="${esc(id)}">
    <label>Fecha de realización<input name="fecha" type="date" required></label>
    <button class="button-verde" type="submit">Programar</button></form>`;

  const filaPartida = () => `<div class="partida-fila"><label>Prestación<input name="p_concepto" type="text" maxlength="90" placeholder="Ej.: Alojamiento y alimento"></label><label>Monto<input name="p_monto" type="number" inputmode="numeric" min="0" step="500"></label><button class="quitar" type="button" data-quitar aria-label="Quitar partida">×</button></div>`;

  const formNueva = (animales) => `<form class="ayudar-form" data-form-nueva>
    <h4>Nueva acción por financiar</h4>
    <label>Título<input name="titulo" type="text" minlength="8" maxlength="90" required placeholder="Ej.: Alojamiento temporal de un perro por tres días"></label>
    <label>Descripción<textarea name="descripcion" minlength="20" maxlength="600" required></textarea></label>
    <div class="fila">
      <label>Categoría<select name="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Urgencia<select name="urgencia">${Object.entries(URGENCIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Comuna<input name="comuna" type="text" maxlength="60" value="Maipú" required></label>
      <label>Animal beneficiario<select name="animal_id"><option value="">Sin ficha vinculada</option>${animales.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select></label>
    </div>
    <fieldset class="ayudar-form" style="border:0;padding:0"><legend>Presupuesto en CLP (la meta es la suma)</legend>
      <div data-partidas>${filaPartida()}</div>
      <button class="button-borde" type="button" data-agregar-partida>＋ Agregar partida</button>
      <div class="fila"><label>Comisión de plataforma (si existe)<input name="comision" type="number" inputmode="numeric" min="0" step="500" value="0"></label>
      <label>Costos de pago (si existen)<input name="costo_pago" type="number" inputmode="numeric" min="0" step="500" value="0"></label></div>
      <p><strong data-meta-total>Meta: ${clp.format(0)}</strong></p></fieldset>
    <div class="fila">
      <label>Fecha límite para recaudar<input name="fecha_limite" type="date" required></label>
      <label>Plazo de ejecución (días)<input name="plazo" type="number" min="1" max="90" value="7" required></label>
    </div>
    <label>Disponibilidad del prestador<input name="disponibilidad" type="text" maxlength="200" placeholder="Ej.: lunes a viernes"></label>
    <label>Qué incluye (una línea por ítem)<textarea name="incluye"></textarea></label>
    <label>Qué queda fuera (una línea por ítem)<textarea name="no_incluye"></textarea></label>
    <label>Condiciones de cancelación<textarea name="cancelacion" minlength="10" maxlength="600" required></textarea></label>
    <label>Condiciones de devolución<textarea name="devolucion" minlength="10" maxlength="600" required></textarea></label>
    <p><small>Después de recibir aportes no podrás cambiar precio, alcance, beneficiario ni condiciones.</small></p>
    <div class="mini-acciones"><button class="button-verde" type="submit">Guardar borrador</button><button class="button-borde" type="button" data-cancelar-form>Cerrar</button></div>
    <p class="ayudar-msg" data-form-msg role="status"></p></form>`;

  const renderAcciones = async (cont) => {
    if (!cont) return;
    if (!hayCuenta()) { cont.innerHTML = sinCuenta; return; }
    cont.innerHTML = '<p class="ayudar-vacio">Cargando…</p>';
    try {
      const items = await api.misAcciones();
      const animales = ui.formNueva ? await api.animales() : [];
      cont.innerHTML = `<div class="mini-acciones" style="margin-bottom:12px"><button class="button-verde" type="button" data-nueva ${ui.formNueva ? 'hidden' : ''}>＋ Nueva acción</button></div>
        ${ui.formNueva ? formNueva(animales) : ''}
        ${items.length ? `<div class="mini-lista">${items.map((a) => `<div class="mini-item">
          <h4>${esc(a.titulo)}</h4>
          <div class="accion-meta">${chip(ESTADOS[a.estado] || a.estado, claseEstado(a.estado))}${DEVOLUCION[a.estado_devolucion] ? chip(DEVOLUCION[a.estado_devolucion], 'is-ambar') : ''}${chip(VERIFICACION[a.verificacion] || a.verificacion, a.verificacion === 'verificado' ? '' : 'is-ambar')}${chip('Simulación', 'is-sim')}</div>
          ${progresoHtml(a.recaudado_clp, a.meta_clp)}
          <small>Recaudación y pagos: ${clp.format(a.recaudado_clp)} simulados · Desembolso no liberado · Límite ${esc(fecha(a.fecha_limite))}</small>
          <div class="mini-acciones">${botonesEstado(a)}</div>
          ${ui.avanceId === a.id ? formAvance(a.id) : ''}${ui.fechaId === a.id ? formFecha(a.id) : ''}</div>`).join('')}</div>`
          : '<p class="ayudar-vacio">Aún no has creado acciones.</p>'}`;
    } catch (e) { cont.innerHTML = `<p class="ayudar-vacio">${esc(mensajeError(e))}</p>`; }
  };

  const contenedoresPersonal = () => ({
    aportes: [...document.querySelectorAll('[data-mis-aportes], [data-pers-aportes]')],
    acciones: [...document.querySelectorAll('[data-mis-acciones], [data-pers-acciones]')],
  });
  const refrescarPersonal = async (cual) => {
    const c = contenedoresPersonal();
    if (!cual || cual === 'aportes') await Promise.all(c.aportes.map(renderAportes));
    if (!cual || cual === 'acciones') await Promise.all(c.acciones.map(renderAcciones));
  };

  const leerFormNueva = (form) => {
    const f = form.elements;
    const partidas = [...form.querySelectorAll('.partida-fila')].map((fila) => ({
      concepto: fila.querySelector('[name="p_concepto"]').value.trim(),
      tipo: 'prestacion',
      monto_clp: parseInt(fila.querySelector('[name="p_monto"]').value, 10) || 0,
    })).filter((p) => p.concepto && p.monto_clp > 0);
    const com = parseInt(f.comision.value, 10) || 0;
    const cp = parseInt(f.costo_pago.value, 10) || 0;
    if (com > 0) partidas.push({ concepto: 'Comisión de plataforma', tipo: 'comision_plataforma', monto_clp: com });
    if (cp > 0) partidas.push({ concepto: 'Costos de pago', tipo: 'costo_pago', monto_clp: cp });
    return {
      titulo: f.titulo.value, descripcion: f.descripcion.value, categoria: f.categoria.value, comuna: f.comuna.value,
      urgencia: f.urgencia.value, animal_id: f.animal_id.value || null, incluye: lineas(f.incluye.value), no_incluye: lineas(f.no_incluye.value),
      condiciones_cancelacion: f.cancelacion.value, condiciones_devolucion: f.devolucion.value,
      fecha_limite: f.fecha_limite.value ? new Date(`${f.fecha_limite.value}T23:59:00`).toISOString() : null, plazo_ejecucion_dias: parseInt(f.plazo.value, 10) || 7,
      disponibilidad: f.disponibilidad.value, partidas,
    };
  };

  const actualizarMetaForm = (form) => {
    const total = leerFormNueva(form).partidas.reduce((s, p) => s + p.monto_clp, 0);
    const out = form.querySelector('[data-meta-total]');
    if (out) out.textContent = `Meta: ${clp.format(total)}`;
  };

  // ---------- Eventos ----------
  document.addEventListener('click', async (event) => {
    const t = event.target;
    const dentro = t.closest('[data-ayudar], [data-my-profile]');
    if (!dentro) return;

    const abrir = t.closest('[data-abrir]');
    if (abrir) { event.preventDefault(); await abrirDetalle(abrir.dataset.abrir); return; }
    if (t.closest('[data-volver]')) { cerrarDetalle(); return; }
    if (t.closest('[data-aportar]')) { iniciarAporte(); return; }
    if (t.closest('[data-seguir]')) { el.detalle.querySelector('[data-seguimiento]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (t.closest('[data-consultar]')) { const n = el.detalle.querySelector('[data-consultar-nota]'); if (n) n.hidden = !n.hidden; return; }

    const monto = t.closest('[data-monto]');
    if (monto && aporteEstado) {
      aporteEstado.monto = monto.dataset.monto === 'otro' ? null : parseInt(monto.dataset.monto, 10);
      pintarAporte();
      if (monto.dataset.monto === 'otro') panelAporte().querySelector('[data-monto-input]')?.focus();
      return;
    }
    if (t.closest('[data-revisar]') && aporteEstado) { aporteEstado.paso = 'revisar'; aporteEstado.clave = uuid(); pintarAporte(); return; }
    if (t.closest('[data-editar-aporte]') && aporteEstado) { aporteEstado.paso = 'monto'; aporteEstado.clave = null; pintarAporte(); return; }
    const conf = t.closest('[data-confirmar]');
    if (conf && aporteEstado) { await confirmarAporte(conf); return; }

    if (t.closest('[data-nueva]')) { ui.formNueva = true; await refrescarPersonal('acciones'); return; }
    if (t.closest('[data-cancelar-form]')) { ui.formNueva = false; await refrescarPersonal('acciones'); return; }
    if (t.closest('[data-agregar-partida]')) { t.closest('form').querySelector('[data-partidas]').insertAdjacentHTML('beforeend', filaPartida()); return; }
    const quitar = t.closest('[data-quitar]');
    if (quitar) { const form = quitar.closest('form'); if (form.querySelectorAll('.partida-fila').length > 1) quitar.closest('.partida-fila').remove(); actualizarMetaForm(form); return; }

    const bt = t.closest('[data-act]');
    if (bt) {
      const id = bt.dataset.id;
      const act = bt.dataset.act;
      try {
        if (act === 'abrir-avance') { ui.avanceId = ui.avanceId === id ? null : id; ui.fechaId = null; await refrescarPersonal('acciones'); return; }
        if (act === 'abrir-fecha') { ui.fechaId = ui.fechaId === id ? null : id; ui.avanceId = null; await refrescarPersonal('acciones'); return; }
        if (act === 'cancelar') {
          const motivo = window.prompt('Motivo de la cancelación (opcional). Si ya hay aportes, quedarán con devolución pendiente.');
          if (motivo === null) return;
          await api.cancelar(id, motivo);
        } else if (act === 'enviar') await api.enviar(id);
        else if (act === 'aprobar') await api.aprobarDemo(id);
        else if (act === 'iniciar') await api.iniciar(id);
        else if (act === 'cierre') await api.cierre(id);
        await refrescarPersonal('acciones');
      } catch (e) { window.alert(mensajeError(e)); }
    }
  });

  document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-form-nueva]');
    if (form) { actualizarMetaForm(form); return; }
    const inp = event.target.closest('[data-monto-input]');
    if (inp && aporteEstado) {
      const v = parseInt(inp.value, 10);
      aporteEstado.monto = Number.isInteger(v) ? v : null;
      const a = detalleActual.accion;
      const ok = Number.isInteger(aporteEstado.monto) && aporteEstado.monto >= 1000 && aporteEstado.monto <= a.meta_clp - a.recaudado_clp;
      const boton = panelAporte().querySelector('[data-revisar]');
      if (boton) boton.disabled = !ok;
      panelAporte().querySelectorAll('[data-monto]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.monto !== 'otro' ? parseInt(x.dataset.monto, 10) === aporteEstado.monto : ![5000, 10000, 20000].includes(aporteEstado.monto) && aporteEstado.monto !== null)));
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (form.matches('[data-ayudar-filtros]')) { event.preventDefault(); cargarLista(); return; }
    if (!form.closest('[data-ayudar], [data-my-profile]')) return;
    if (form.matches('[data-form-nueva]')) {
      event.preventDefault();
      const msg = form.querySelector('[data-form-msg]');
      const boton = form.querySelector('[type="submit"]');
      boton.disabled = true;
      try {
        await api.crear(leerFormNueva(form));
        ui.formNueva = false;
        await refrescarPersonal('acciones');
      } catch (e) { msg.textContent = mensajeError(e); msg.className = 'ayudar-msg is-error'; boton.disabled = false; }
      return;
    }
    if (form.matches('[data-form-avance]')) {
      event.preventDefault();
      try {
        await api.avance(form.dataset.id, form.elements.tipo.value, form.elements.texto.value.trim(), form.elements.url.value.trim());
        ui.avanceId = null; await refrescarPersonal('acciones');
      } catch (e) { window.alert(mensajeError(e)); }
      return;
    }
    if (form.matches('[data-form-fecha]')) {
      event.preventDefault();
      try {
        await api.programar(form.dataset.id, new Date(`${form.elements.fecha.value}T12:00:00`).toISOString());
        ui.fechaId = null; await refrescarPersonal('acciones');
      } catch (e) { window.alert(mensajeError(e)); }
    }
  });

  el.filtros.addEventListener('change', cargarLista);

  // Las pestañas de Mi perfil cargan su contenido al abrirse.
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-my-profile-tab="aportes"], [data-my-profile-tab="acciones"]');
    if (tab) refrescarPersonal(tab.dataset.myProfileTab);
  });

  // ---------- Inicio ----------
  const iniciar = async () => {
    // Bloque personal dentro de la sección (también sirve en modo demo, sin cuenta).
    const pers = document.createElement('div');
    pers.className = 'ayudar-personal';
    pers.innerHTML = `<h3 style="margin-top:36px">Mi actividad</h3>
      <div class="accion-meta" role="tablist" aria-label="Mi actividad">
        <button class="button-borde" type="button" role="tab" data-pers-tab="aportes" aria-selected="true">Mis aportes</button>
        <button class="button-borde" type="button" role="tab" data-pers-tab="acciones" aria-selected="false">Mis acciones</button></div>
      <div data-pers-aportes></div><div data-pers-acciones hidden></div>`;
    root.querySelector('.shell').append(pers);
    pers.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-pers-tab]');
      if (!tab) return;
      pers.querySelectorAll('[data-pers-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
      pers.querySelector('[data-pers-aportes]').hidden = tab.dataset.persTab !== 'aportes';
      pers.querySelector('[data-pers-acciones]').hidden = tab.dataset.persTab !== 'acciones';
      refrescarPersonal(tab.dataset.persTab);
    });

    try { session = (await db.auth.getSession()).data.session; } catch { session = null; }
    try {
      await servidor.listar({});
    } catch (e) {
      if (faltaBackend(e)) { modo = 'demo'; api = demo; } else { el.modo.textContent = 'No pudimos conectar con el servidor. Intenta de nuevo más tarde.'; }
    }
    window.auraLadraAcciones = { calendario: () => api.listar({}) };
    document.dispatchEvent(new CustomEvent('acciones:listas'));
    textoModo();
    await cargarLista();
    await refrescarPersonal();
    db.auth.onAuthStateChange((_ev, s) => { session = s; window.setTimeout(refrescarPersonal, 0); });
  };

  iniciar();
})();

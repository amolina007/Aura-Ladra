// Personal → Mi perfil → Mi árbol de vínculos.
// - Con la migración 20261003190000 aplicada, todo pasa por funciones del servidor (ladra.*):
//   el navegador no decide permisos; la base de datos sí.
// - Sin la migración, cae a una DEMOSTRACIÓN con datos ficticios claramente rotulados,
//   guardados solo en este navegador.
// El árbol se dibuja con SVG (no es una imagen): troncos, ramas, hojas y flores salen de datos reales.
(() => {
  'use strict';

  const resumen = document.querySelector('[data-arbol-resumen]');
  if (!resumen) return;
  const db = window.auraLadraDb;

  // ---------- Utilidades ----------
  const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fecha = (iso) => {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  };
  const mes = (iso) => {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    const t = Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mensajeError = (e) => String(e?.message || e || 'No pudimos completar la acción.').replace(/^[A-Z_]{4,}:\s*/, '');
  const faltaBackend = (e) => {
    const t = `${e?.code || ''} ${e?.message || ''}`;
    return /PGRST202|42883|42P01|PGRST205|schema cache|Could not find the function|does not exist/i.test(t);
  };
  const reducirMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const TIPO_VINCULO = {
    familia: 'Familia', tutor: 'Tutor/a', cuidador: 'Cuidador/a', rescatista: 'Rescatista', colaborador: 'Colaborador/a',
    amistad: 'Amistad', companero_paseo: 'Compañero/a de paseo', otro: 'Otro vínculo', convivencia: 'Convivencia', colonia: 'Colonia', manada: 'Manada',
  };
  const ESTADO_VINCULO = { pendiente: 'Pendiente de aceptación', confirmado: 'Confirmado', privado: 'Anotación privada', rechazado: 'Rechazado', revocado: 'Retirado' };
  const MOMENTOS = {
    paseo: { etiqueta: 'Paseo', forma: 'hoja' }, juego: { etiqueta: 'Juego', forma: 'hoja' }, cuidado: { etiqueta: 'Cuidado', forma: 'hoja' },
    encuentro: { etiqueta: 'Encuentro', forma: 'flor' }, adopcion: { etiqueta: 'Adopción', forma: 'flor' }, recuerdo: { etiqueta: 'Recuerdo', forma: 'flor' },
  };
  const CATEGORIAS = { familia: 'Familia', compania: 'Compañía', cuidados: 'Cuidados', recuerdos: 'Recuerdos' };
  const ROL_FAMILIAR = { dueno_principal: 'Responsable principal', secundario: 'Familia' };
  const etiquetaTipo = (t) => TIPO_VINCULO[t] || t || 'Vínculo';
  const formaDe = (tipo) => MOMENTOS[tipo]?.forma || 'hoja';
  const articulo = (tipo) => (formaDe(tipo) === 'flor' ? 'una flor' : 'una hoja');

  const iconoHoja = '<svg class="icono-forma" viewBox="-2 -12 28 24" aria-hidden="true" focusable="false"><path class="hoja" d="M0 0C5 -9 15 -9 22 0C15 9 5 9 0 0Z"/></svg>';
  const iconoFlor = '<svg class="icono-forma" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><g class="flor"><circle cx="0" cy="-6" r="4.5"/><circle cx="5.7" cy="-1.9" r="4.5"/><circle cx="3.5" cy="4.9" r="4.5"/><circle cx="-3.5" cy="4.9" r="4.5"/><circle cx="-5.7" cy="-1.9" r="4.5"/><circle class="flor-centro" cx="0" cy="0" r="3"/></g></svg>';
  const iconoForma = (tipo) => (formaDe(tipo) === 'flor' ? iconoFlor : iconoHoja);

  // ---------- Categoría de cada integrante (familia, compañía, cuidados, recuerdos) ----------
  const categoriaDe = (m) => {
    if (m.memoria) return 'recuerdos';
    const tipos = (m.relaciones || []).map((r) => r.tipo);
    if (m.propio || tipos.some((t) => t === 'familia' || t === 'tutor')) return 'familia';
    if (tipos.some((t) => ['cuidador', 'rescatista', 'colaborador'].includes(t))) return 'cuidados';
    return 'compania';
  };
  const esPendiente = (m) => (m.relaciones || []).length > 0 && (m.relaciones || []).every((r) => r.estado === 'pendiente');

  // =====================================================================
  // Adaptador DEMOSTRACIÓN (solo navegador, datos ficticios)
  // =====================================================================
  const demo = (() => {
    const KEY = 'auraladra.demo.arbol.v2';
    let st = null;
    const guardar = () => { try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* sin almacenamiento */ } };
    const rel = (origen, tipo, descripcion, estado, extra = {}) => ({ origen, id: uuid(), tipo, descripcion: descripcion || null, estado, editable: true, retirable: true, publico: null, ...extra });
    const semilla = () => ({
      integrantes: [
        { clave: 'animal:demo-luna', clase: 'animal', ref_id: 'demo-luna', nombre: 'Luna (ejemplo)', especie: 'Perra', foto_url: null, propio: true, memoria: false, comunitario: false, oculta: false, relaciones: [rel('familia', 'tutor', null, 'confirmado', { editable: false, retirable: false })] },
        { clave: 'animal:demo-tom', clase: 'animal', ref_id: 'demo-tom', nombre: 'Tom (ejemplo)', especie: 'Gato', foto_url: null, propio: true, memoria: true, comunitario: false, oculta: false, relaciones: [rel('familia', 'tutor', null, 'confirmado', { editable: false, retirable: false })] },
        { clave: 'perfil:demo-rosa', clase: 'persona', ref_id: 'demo-rosa', nombre: 'Rosa (ejemplo)', especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('personas', 'cuidador', 'Cuida a Luna cuando viajo', 'confirmado')] },
        { clave: 'animal:demo-canela', clase: 'animal', ref_id: 'demo-canela', nombre: 'Canela (ejemplo)', especie: 'Perra', foto_url: null, propio: false, memoria: false, comunitario: true, oculta: false, relaciones: [rel('animal_humano', 'amistad', 'Perra de la plaza', 'confirmado', { publico: true })] },
        { clave: 'perfil:demo-cate', clase: 'persona', ref_id: 'demo-cate', nombre: 'Cate (ejemplo)', especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, animales: [{ nombre: 'Kira (ejemplo)', foto_url: null }, { nombre: 'Max (ejemplo)', foto_url: null }], relaciones: [rel('personas', 'familia', 'Pareja (ejemplo)', 'confirmado')] },
        { clave: 'perfil:demo-camilo', clase: 'persona', ref_id: 'demo-camilo', nombre: 'Camilo (ejemplo)', especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('personas', 'companero_paseo', null, 'confirmado')] },
        { clave: 'privado:demo-abuela', clase: 'persona', ref_id: 'demo-abuela', nombre: 'Abuela Elena (ejemplo)', especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('privado', 'familia', 'Anotación privada', 'privado')] },
      ],
      conexiones: [{ a: 'animal:demo-luna', b: 'animal:demo-canela', tipo: 'amistad' }],
      momentos: [
        { id: 'm1', tipo: 'adopcion', fecha: '2024-03-10', texto: 'Luna llegó a casa (ejemplo).', visibilidad: 'privado', es_mio: true, autor_alias: 'Tú', participantes: [{ id: 'p1', clave: 'animal:demo-luna', nombre: 'Luna (ejemplo)', estado: 'confirmado' }] },
        { id: 'm2', tipo: 'paseo', fecha: '2026-09-20', texto: 'Paseo largo por el parque.', visibilidad: 'compartido', es_mio: true, autor_alias: 'Tú', participantes: [{ id: 'p2', clave: 'animal:demo-luna', nombre: 'Luna (ejemplo)', estado: 'confirmado' }, { id: 'p3', clave: 'perfil:demo-camilo', nombre: 'Camilo (ejemplo)', estado: 'confirmado' }] },
        { id: 'm3', tipo: 'juego', fecha: '2026-09-27', texto: null, visibilidad: 'privado', es_mio: true, autor_alias: 'Tú', participantes: [{ id: 'p4', clave: 'animal:demo-luna', nombre: 'Luna (ejemplo)', estado: 'confirmado' }, { id: 'p5', clave: 'animal:demo-canela', nombre: 'Canela (ejemplo)', estado: 'confirmado' }] },
        { id: 'm4', tipo: 'recuerdo', fecha: '2025-12-24', texto: 'Tom dormía siempre junto al árbol de Navidad (ejemplo).', visibilidad: 'privado', es_mio: true, autor_alias: 'Tú', participantes: [{ id: 'p6', clave: 'animal:demo-tom', nombre: 'Tom (ejemplo)', estado: 'confirmado' }] },
        { id: 'm5', tipo: 'cuidado', fecha: '2026-10-01', texto: 'Rosa la cuidó el fin de semana.', visibilidad: 'privado', es_mio: true, autor_alias: 'Tú', participantes: [{ id: 'p7', clave: 'animal:demo-luna', nombre: 'Luna (ejemplo)', estado: 'confirmado' }, { id: 'p8', clave: 'perfil:demo-rosa', nombre: 'Rosa (ejemplo)', estado: 'confirmado' }] },
      ],
      pendientes: { personas: [{ id: 'demo-sol-1', de_alias: 'Marta (ejemplo)', tipo: 'amistad', descripcion: 'Nos conocimos en el parque' }], participaciones: [] },
    });
    const cargar = () => { try { const v = JSON.parse(window.localStorage.getItem(KEY)); if (v?.integrantes) return v; } catch { /* sin almacenamiento */ } return semilla(); };
    const d = () => { if (!st) st = cargar(); return st; };
    const falla = (t) => { throw new Error(t); };
    const buscarRel = (id) => { for (const m of d().integrantes) { const r = m.relaciones.find((x) => x.id === id); if (r) return { m, r }; } return null; };
    const CATALOGO = [{ id: 'demo-bruno', nombre: 'Bruno (ejemplo)', especie: 'Perro' }, { id: 'demo-mia', nombre: 'Mía (ejemplo)', especie: 'Gata' }];
    const PERSONAS = [{ perfil_id: 'demo-ines', alias: 'Inés (ejemplo)' }, { perfil_id: 'demo-pablo', alias: 'Pablo (ejemplo)' }];
    return {
      async cargar() { return JSON.parse(JSON.stringify({ yo: { perfil_id: 'demo', alias: 'Tú', publicado: true }, ...d() })); },
      async vincularAnimal(id, tipo, desc) {
        const a = CATALOGO.find((x) => x.id === id) || falla('Animal no disponible.');
        const clave = `animal:${a.id}`;
        if (d().integrantes.some((m) => m.clave === clave)) falla('Ya tienes un vínculo con este animal.');
        d().integrantes.push({ clave, clase: 'animal', ref_id: a.id, nombre: a.nombre, especie: a.especie, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('animal_humano', tipo, desc, 'pendiente', { publico: false })] });
        guardar(); return 'pendiente';
      },
      async vincularPersona(id, tipo, desc) {
        const p = PERSONAS.find((x) => x.perfil_id === id) || falla('Persona no disponible.');
        const clave = `perfil:${p.perfil_id}`;
        if (d().integrantes.some((m) => m.clave === clave)) falla('Ya existe un vínculo con esta persona.');
        d().integrantes.push({ clave, clase: 'persona', ref_id: p.perfil_id, nombre: p.alias, especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('personas', tipo, desc, 'pendiente')] });
        guardar(); return 'pendiente';
      },
      async agregarPrivado(tipo, desc, nombre, clase) {
        if (!nombre) falla('Escribe un nombre.');
        const id = uuid();
        d().integrantes.push({ clave: `privado:${id}`, clase, ref_id: id, nombre, especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('privado', tipo, desc, 'privado')] });
        guardar(); return id;
      },
      async editarVinculo(origen, id, tipo, desc, publico) {
        const f = buscarRel(id) || falla('No puedes editar este vínculo.');
        if (origen === 'privado' && tipo) f.r.tipo = tipo;
        f.r.descripcion = desc || null;
        if (origen === 'animal_humano' && publico !== null && publico !== undefined) f.r.publico = publico;
        guardar();
      },
      async retirarVinculo(origen, id) {
        const f = buscarRel(id) || falla('Vínculo no encontrado.');
        f.m.relaciones = f.m.relaciones.filter((x) => x.id !== id);
        if (!f.m.relaciones.length) d().integrantes = d().integrantes.filter((x) => x !== f.m);
        guardar();
      },
      async buscarPersonas(texto) { const t = String(texto).toLowerCase(); return PERSONAS.filter((p) => p.alias.toLowerCase().includes(t)); },
      async animalesRed() { return CATALOGO; },
      async humanosDe() { return [{ alias: 'Tú', rol: 'dueno_principal' }]; },
      async responderPersona(id, decision) {
        const s = d().pendientes.personas.find((x) => x.id === id) || falla('Solicitud no encontrada.');
        d().pendientes.personas = d().pendientes.personas.filter((x) => x !== s);
        if (decision === 'confirmado') {
          const idp = uuid();
          d().integrantes.push({ clave: `perfil:${idp}`, clase: 'persona', ref_id: idp, nombre: s.de_alias, especie: null, foto_url: null, propio: false, memoria: false, comunitario: false, oculta: false, relaciones: [rel('personas', s.tipo, s.descripcion, 'confirmado')] });
        }
        guardar();
      },
      async responderParticipacion() { guardar(); },
      async registrarMomento(tipo, fechaIso, texto, visibilidad, participantes) {
        const ps = participantes.map((p) => {
          const m = d().integrantes.find((x) => x.ref_id === p.id) || falla('Participante inválido.');
          const confirmado = m.propio || m.clave.startsWith('privado:') || m.comunitario;
          return { id: uuid(), clave: m.clave, nombre: m.nombre, estado: confirmado ? 'confirmado' : 'pendiente' };
        });
        const id = uuid();
        d().momentos.unshift({ id, tipo, fecha: fechaIso, texto: texto || null, visibilidad, es_mio: true, autor_alias: 'Tú', creado_en: new Date().toISOString(), participantes: ps });
        guardar(); return id;
      },
      async editarMomento(id, tipo, fechaIso, texto, visibilidad) {
        const m = d().momentos.find((x) => x.id === id) || falla('No puedes editar este momento.');
        Object.assign(m, { tipo, fecha: fechaIso, texto: texto || null, visibilidad }); guardar();
      },
      async eliminarMomento(id) { d().momentos = d().momentos.filter((x) => x.id !== id); guardar(); },
      async alternarMemoria(refId, ocultar) {
        const m = d().integrantes.find((x) => x.ref_id === refId); if (m) m.oculta = ocultar; guardar();
      },
    };
  })();

  // =====================================================================
  // Adaptador SERVIDOR (funciones ladra.* de la migración)
  // =====================================================================
  const rpc = async (fn, args) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw error;
    return data;
  };
  const servidor = {
    cargar: () => rpc('mi_arbol'),
    vincularAnimal: (id, tipo, desc) => rpc('arbol_vincular_animal', { p_animal_id: id, p_tipo: tipo, p_descripcion: desc || null }),
    vincularPersona: (id, tipo, desc) => rpc('arbol_vincular_persona', { p_perfil_id: id, p_tipo: tipo, p_descripcion: desc || null }),
    agregarPrivado: (tipo, desc, nombre, clase) => rpc('arbol_agregar_privado', { p_tipo: tipo, p_descripcion: desc || null, p_nombre: nombre, p_clase: clase }),
    editarVinculo: (origen, id, tipo, desc, publico) => rpc('arbol_editar_vinculo', { p_origen: origen, p_id: id, p_tipo: tipo ?? null, p_descripcion: desc || null, p_publico: publico ?? null }),
    retirarVinculo: (origen, id) => rpc('arbol_retirar_vinculo', { p_origen: origen, p_id: id }),
    buscarPersonas: (texto) => rpc('arbol_buscar_personas', { p_texto: texto }),
    animalesRed: async () => window.auraLadraFicha?.animalesRed?.() || [],
    humanosDe: (id) => rpc('humanos_visibles_de_animal', { p_animal_id: id }),
    responderPersona: (id, decision) => rpc('arbol_responder_vinculo_persona', { p_id: id, p_decision: decision }),
    responderParticipacion: (id, decision) => rpc('arbol_responder_participacion', { p_id: id, p_decision: decision }),
    registrarMomento: (tipo, fechaIso, texto, visibilidad, participantes) => rpc('arbol_registrar_momento', { p_tipo: tipo, p_fecha: fechaIso, p_texto: texto || null, p_visibilidad: visibilidad, p_participantes: participantes }),
    editarMomento: (id, tipo, fechaIso, texto, visibilidad) => rpc('arbol_editar_momento', { p_id: id, p_tipo: tipo, p_fecha: fechaIso, p_texto: texto || null, p_visibilidad: visibilidad }),
    eliminarMomento: (id) => rpc('arbol_eliminar_momento', { p_id: id }),
    alternarMemoria: (refId, ocultar) => rpc('arbol_alternar_rama_memoria', { p_animal_id: refId, p_ocultar: ocultar }),
  };

  // =====================================================================
  // Estado
  // =====================================================================
  const S = {
    modo: 'servidor', api: servidor,
    data: null, cargando: true, error: '',
    pestana: 'arbol', vistaArbol: 'arbol', // 'arbol' | 'lista'
    filtros: { familia: true, compania: true, cuidados: true, recuerdos: true },
    sel: null, foco: null, nuevo: null, mostrarOcultas: false,
    z: { x: 0, y: 0, k: 1 }, reajustar: true, bbox: null, confirmando: null,
    aviso: '', humanos: {},
  };

  const integrantes = () => S.data?.integrantes || [];
  const momentos = () => S.data?.momentos || [];
  const porClave = (clave) => integrantes().find((m) => m.clave === clave);
  const visibles = () => integrantes()
    .filter((m) => !m.oculta)
    .map((m) => ({ ...m, cat: categoriaDe(m) }))
    .filter((m) => S.filtros[m.cat]);

  // Hojas y flores: salen de momentos REALES con participación confirmada.
  const crecimiento = () => {
    const mapa = new Map();
    const tomar = (c) => { if (!mapa.has(c)) mapa.set(c, { hojas: [], flores: [] }); return mapa.get(c); };
    momentos().forEach((mo) => {
      if (mo.tipo === 'recuerdo' && !S.filtros.recuerdos) return;
      (mo.participantes || []).filter((p) => p.estado === 'confirmado').forEach((p) => {
        const reg = tomar(p.clave);
        (formaDe(mo.tipo) === 'flor' ? reg.flores : reg.hojas).push({ id: mo.id, tipo: mo.tipo, fecha: mo.fecha });
      });
    });
    return mapa;
  };

  // =====================================================================
  // Estructura de la vista (diálogo a pantalla completa)
  // =====================================================================
  const vista = document.createElement('dialog');
  vista.className = 'arbol-vista';
  vista.setAttribute('aria-labelledby', 'arbol-titulo');
  vista.innerHTML = `
    <div class="arbol-marco">
      <nav class="arbol-riel" aria-label="Personal">
        <p class="kicker">Personal</p>
        <button type="button" data-ir-tab="perfil">Perfil</button>
        <button type="button" data-ir-tab="animales">Mis animales</button>
        <button type="button" data-ir-tab="arbol" aria-current="page">Mi árbol</button>
        <button type="button" data-ir-tab="actividad">Actividad</button>
        <button type="button" data-ir-tab="aportes">Mis aportes</button>
        <button type="button" data-ir-tab="acciones">Mis acciones</button>
      </nav>
      <div class="arbol-central">
        <header class="arbol-cabecera">
          <div>
            <p class="arbol-migas"><button type="button" class="arbol-volver" data-act="cerrar">‹ Personal</button> <span aria-hidden="true">/</span> <span>Mi árbol de vínculos</span></p>
            <h2 id="arbol-titulo">Mi árbol</h2>
          </div>
          <button type="button" class="arbol-cerrar" data-act="cerrar" aria-label="Cerrar Mi árbol y volver a Personal">×</button>
        </header>
        <p class="arbol-demo" data-arbol-demo hidden><strong>Demostración.</strong> Los nombres con «(ejemplo)» son ficticios y se guardan solo en este navegador. Cuando la base de datos tenga la migración aplicada, verás aquí tus vínculos reales.</p>
        <p class="arbol-aviso" role="status" aria-live="polite" data-arbol-aviso></p>
        <div class="arbol-pendientes" data-arbol-pendientes></div>
        <div class="arbol-acciones">
          <button type="button" class="button-verde" data-act="vinculo">＋ Añadir vínculo</button>
          <button type="button" class="button-borde" data-act="momento">Registrar un momento</button>
        </div>
        <div class="arbol-pestanas" role="tablist" aria-label="Mi árbol">
          <button type="button" role="tab" id="arbol-tab-arbol" aria-selected="true" aria-controls="arbol-panel-arbol" data-pestana="arbol">Árbol</button>
          <button type="button" role="tab" id="arbol-tab-historia" aria-selected="false" aria-controls="arbol-panel-historia" tabindex="-1" data-pestana="historia">Historia</button>
        </div>
        <div class="arbol-cuerpo" role="tabpanel" id="arbol-panel-arbol" aria-labelledby="arbol-tab-arbol" data-panel-arbol>
          <div class="arbol-herramientas">
            <div class="arbol-filtros" role="group" aria-label="Filtros del árbol" data-arbol-filtros></div>
            <div class="arbol-buscar">
              <label class="sr-only" for="arbol-buscar">Buscar integrante</label>
              <input id="arbol-buscar" type="search" placeholder="Buscar integrante" autocomplete="off" data-arbol-buscar aria-controls="arbol-resultados">
              <ul id="arbol-resultados" class="arbol-resultados" hidden data-arbol-resultados></ul>
            </div>
            <div class="arbol-modo" role="group" aria-label="Forma de ver">
              <button type="button" data-modo="arbol" aria-pressed="true">Árbol</button>
              <button type="button" data-modo="lista" aria-pressed="false">Lista</button>
            </div>
          </div>
          <div class="arbol-escenario">
            <div class="arbol-lienzo" tabindex="0" data-arbol-lienzo aria-label="Árbol de vínculos. Tab recorre a los integrantes. Con el lienzo enfocado: flechas para mover, más y menos para ampliar, cero para centrar.">
              <svg class="arbol-svg" role="group" aria-label="Dibujo del árbol" data-arbol-svg xmlns="http://www.w3.org/2000/svg"></svg>
              <div class="arbol-zoom" role="group" aria-label="Zoom">
                <button type="button" data-act="zoom-mas" aria-label="Acercar">＋</button>
                <button type="button" data-act="zoom-menos" aria-label="Alejar">−</button>
                <button type="button" data-act="centrar" aria-label="Centrar el árbol">◎</button>
              </div>
              <button type="button" class="arbol-vista-general" data-act="general" hidden>‹ Vista general</button>
              <p class="arbol-estado" data-arbol-estado hidden></p>
            </div>
            <div class="arbol-lista-alt" data-arbol-lista hidden></div>
            <aside class="arbol-panel" data-arbol-panel aria-label="Detalle del integrante seleccionado"></aside>
          </div>
        </div>
        <div class="arbol-cuerpo" role="tabpanel" id="arbol-panel-historia" aria-labelledby="arbol-tab-historia" data-panel-historia hidden></div>
      </div>
    </div>`;
  document.body.append(vista);
  const $ = (sel, el = vista) => el.querySelector(sel);
  const $$ = (sel, el = vista) => [...el.querySelectorAll(sel)];
  const lienzo = $('[data-arbol-lienzo]');
  const svg = $('[data-arbol-svg]');

  // Diálogos de formularios
  const dlg = (nombre, html) => {
    const d = document.createElement('dialog');
    d.className = 'arbol-dialogo';
    d.dataset.dlg = nombre;
    d.setAttribute('aria-labelledby', `arbol-dlg-${nombre}-t`);
    d.innerHTML = html;
    document.body.append(d);
    return d;
  };
  const opcionesTipo = (lista) => lista.map((t) => `<option value="${t}">${esc(etiquetaTipo(t))}</option>`).join('');

  const dVinculo = dlg('vinculo', `
    <form class="arbol-form" data-form-vinculo novalidate>
      <div class="arbol-form-cab"><h3 id="arbol-dlg-vinculo-t">Añadir vínculo</h3><button type="button" class="arbol-cerrar" data-cerrar-dlg aria-label="Cerrar">×</button></div>
      <fieldset class="arbol-opciones"><legend>¿Con quién?</legend>
        <label><input type="radio" name="quien" value="animal" checked> Una mascota que ya existe</label>
        <label><input type="radio" name="quien" value="persona"> Una persona con cuenta</label>
        <label><input type="radio" name="quien" value="privado"> Un integrante privado (sin cuenta)</label>
      </fieldset>
      <div data-quien="animal">
        <label class="field"><span>Mascota</span><select name="animal_id"></select></label>
        <p class="arbol-nota">Reutilizamos su ficha: no se crea otra. Si tiene responsable, deberá aceptar el vínculo antes de verse como confirmado.</p>
      </div>
      <div data-quien="persona" hidden>
        <label class="field"><span>Buscar por alias</span><input type="search" name="buscar" autocomplete="off" placeholder="Escribe al menos 2 letras"></label>
        <div class="arbol-personas" data-personas role="radiogroup" aria-label="Resultados"></div>
        <p class="arbol-nota">La otra persona debe aceptar antes de que el vínculo se vea como confirmado.</p>
      </div>
      <div data-quien="privado" hidden>
        <label class="field"><span>Nombre</span><input name="nombre" maxlength="60" autocomplete="off"></label>
        <label class="field"><span>¿Es una persona o un animal?</span><select name="clase"><option value="persona">Persona</option><option value="animal">Animal</option></select></label>
        <p class="arbol-nota">Es una anotación solo tuya: no se envía, no se publica y nadie más la ve.</p>
      </div>
      <label class="field"><span>Tipo de relación</span><select name="tipo" data-tipo-vinculo></select></label>
      <label class="field"><span>Descripción (opcional)</span><input name="descripcion" maxlength="240" autocomplete="off" placeholder="Ej.: Cuida a Luna cuando viajo"></label>
      <p class="form-message arbol-error" role="alert" data-form-error></p>
      <div class="arbol-form-pie"><button type="button" class="button-borde" data-cerrar-dlg>Cancelar</button><button type="submit" class="button-verde">Añadir</button></div>
    </form>`);

  const dMomento = dlg('momento', `
    <form class="arbol-form" data-form-momento novalidate>
      <div class="arbol-form-cab"><h3 id="arbol-dlg-momento-t" data-momento-titulo>Registrar un momento</h3><button type="button" class="arbol-cerrar" data-cerrar-dlg aria-label="Cerrar">×</button></div>
      <fieldset class="arbol-opciones arbol-tipos"><legend>¿Qué pasó?</legend>
        ${Object.entries(MOMENTOS).map(([k, v], i) => `<label><input type="radio" name="tipo" value="${k}"${i === 0 ? ' checked' : ''}> ${iconoForma(k)} ${esc(v.etiqueta)}</label>`).join('')}
      </fieldset>
      <label class="field"><span>Fecha</span><input type="date" name="fecha" required></label>
      <fieldset class="arbol-opciones" data-participantes><legend>¿Quiénes participaron?</legend><div data-lista-participantes></div></fieldset>
      <label class="field"><span>Texto (opcional)</span><textarea name="texto" rows="3" maxlength="600"></textarea><small data-contador>0 / 600</small></label>
      <fieldset class="arbol-opciones"><legend>¿Quién puede verlo?</legend>
        <label><input type="radio" name="visibilidad" value="privado" checked> Solo yo</label>
        <label><input type="radio" name="visibilidad" value="compartido"> Participantes que lo confirmen</label>
      </fieldset>
      <p class="arbol-nota">Foto: todavía no disponible. Aún no hay un almacenamiento privado preparado para fotos de momentos.</p>
      <p class="arbol-efecto" data-efecto aria-live="polite"></p>
      <p class="form-message arbol-error" role="alert" data-form-error></p>
      <div class="arbol-form-pie"><button type="button" class="button-borde" data-cerrar-dlg>Cancelar</button><button type="submit" class="button-verde" data-momento-guardar>Guardar momento</button></div>
    </form>`);

  const dEditar = dlg('editar', `
    <form class="arbol-form" data-form-editar novalidate>
      <div class="arbol-form-cab"><h3 id="arbol-dlg-editar-t">Editar vínculo</h3><button type="button" class="arbol-cerrar" data-cerrar-dlg aria-label="Cerrar">×</button></div>
      <p class="arbol-nota">Esto cambia solo tu relación. Para cambiar datos del animal usa «Editar ficha».</p>
      <label class="field" data-campo-tipo><span>Tipo de relación</span><select name="tipo" data-tipo-vinculo></select></label>
      <label class="field"><span>Descripción (opcional)</span><input name="descripcion" maxlength="240" autocomplete="off"></label>
      <label class="arbol-check" data-campo-publico><input type="checkbox" name="publico"> Mostrar este vínculo en la ficha del animal</label>
      <p class="form-message arbol-error" role="alert" data-form-error></p>
      <div class="arbol-form-pie"><button type="button" class="button-borde" data-cerrar-dlg>Cancelar</button><button type="submit" class="button-verde">Guardar</button></div>
    </form>`);

  // =====================================================================
  // Geometría del árbol
  // =====================================================================
  const ARMS_ANCHO = {
    familia: [[500, 540], [420, 520], [300, 480], [150, 410]],
    compania: [[500, 520], [580, 490], [700, 450], [850, 390]],
    cuidados: [[500, 450], [570, 380], [650, 300], [730, 190]],
    recuerdos: [[500, 440], [430, 370], [350, 290], [270, 180]],
  };
  const ARMS_ESTRECHO = {
    familia: [[500, 540], [440, 520], [360, 490], [250, 440]],
    compania: [[500, 520], [560, 495], [640, 465], [750, 420]],
    cuidados: [[500, 450], [560, 370], [610, 290], [660, 190]],
    recuerdos: [[500, 440], [440, 370], [390, 290], [340, 190]],
  };
  const bez = (p, t) => {
    const u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
    const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
    const l = Math.hypot(dx, dy) || 1;
    return { x, y, nx: -dy / l, ny: dx / l };
  };
  const pathBez = (p) => `M${p[0][0]} ${p[0][1]} C${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]}`;

  const calcularLayout = (items, ancho) => {
    const ARMS = ancho < 700 ? ARMS_ESTRECHO : ARMS_ANCHO;
    const nodos = [];
    Object.keys(CATEGORIAS).forEach((cat) => {
      const lista = items.filter((m) => m.cat === cat).sort((a, b) => (b.propio - a.propio) || a.nombre.localeCompare(b.nombre, 'es'));
      const n = lista.length;
      lista.forEach((m, i) => {
        const t = n === 1 ? 0.7 : 0.32 + 0.64 * (i / (n - 1));
        const p = bez(ARMS[cat], t);
        const lado = i % 2 === 0 ? -1 : 1;
        const mag = 62 + (n > 5 && Math.floor(i / 2) % 2 ? 34 : 0);
        nodos.push({ m, cat, x: p.x + p.nx * lado * mag, y: p.y + p.ny * lado * mag, ax: p.x, ay: p.y, r: m.propio ? 34 : 29 });
      });
    });
    return { ARMS, nodos };
  };

  const SLOTS = [-90, -55, -125, -20, -160, 15, 165, 50, 130, 85, 95, 0];
  const adornos = (n, crec) => {
    if (!crec) return '';
    const items = [...crec.flores.map((f) => ({ k: 'flor', ...f })), ...crec.hojas.map((h) => ({ k: 'hoja', ...h }))];
    const mostrar = items.slice(-SLOTS.length);
    const extra = items.length - mostrar.length;
    let html = mostrar.map((it, i) => {
      const ang = SLOTS[i] * Math.PI / 180;
      const d = n.r + 14;
      const px = Math.cos(ang) * d; const py = Math.sin(ang) * d;
      const nueva = S.nuevo && S.nuevo.id === it.id && S.nuevo.clave === n.m.clave ? ' is-nueva' : '';
      if (it.k === 'flor') {
        return `<g class="adorno flor-g${nueva}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(1.15)"><title>${esc(MOMENTOS[it.tipo].etiqueta)} · ${esc(fecha(it.fecha))}</title><g class="flor"><circle cx="0" cy="-6" r="4.5"/><circle cx="5.7" cy="-1.9" r="4.5"/><circle cx="3.5" cy="4.9" r="4.5"/><circle cx="-3.5" cy="4.9" r="4.5"/><circle cx="-5.7" cy="-1.9" r="4.5"/><circle class="flor-centro" cx="0" cy="0" r="3"/></g></g>`;
      }
      return `<g class="adorno hoja-g${nueva}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${SLOTS[i]})"><title>${esc(MOMENTOS[it.tipo].etiqueta)} · ${esc(fecha(it.fecha))}</title><path class="hoja" d="M0 0C5 -9 15 -9 22 0C15 9 5 9 0 0Z"/></g>`;
    }).join('');
    if (extra > 0) html += `<text class="mas" x="${n.r + 8}" y="${-n.r - 4}">+${extra}</text>`;
    return html;
  };

  const inicial = (nombre) => (String(nombre || '?').trim().charAt(0) || '?').toUpperCase();
  const fotoDe = (m) => (m.clase === 'animal' ? (window.auraLadraFicha?.fotoDe?.(m.ref_id) || httpsUrl(m.foto_url)) : '');
  const nombreCorto = (n) => (n.length > 16 ? `${n.slice(0, 15)}…` : n);

  const dibujarArbol = () => {
    const items = visibles();
    const W = lienzo.clientWidth || 360;
    const { ARMS, nodos } = calcularLayout(items, W);
    const crec = crecimiento();
    const claves = new Set(nodos.map((n) => n.m.clave));
    const posicion = new Map(nodos.map((n) => [n.m.clave, n]));
    const activas = new Set(nodos.map((n) => n.cat));

    const ramas = Object.entries(ARMS).map(([cat, p]) => `
      <g class="rama-g cat-${cat}${S.foco && S.foco !== cat ? ' is-atenuado' : ''}${activas.has(cat) ? '' : ' is-vacia'}">
        <path class="copa" d="${pathBez(p)}"/>
        <path class="rama" d="${pathBez(p)}"/>
        <text class="rama-rotulo" x="${p[3][0]}" y="${p[3][1] - 22}" text-anchor="middle">${esc(CATEGORIAS[cat])}</text>
      </g>`).join('');

    const ramitas = nodos.map((n) => `<path class="ramita cat-${n.cat}${S.foco && S.foco !== n.cat ? ' is-atenuado' : ''}" d="M${n.ax.toFixed(1)} ${n.ay.toFixed(1)} Q${((n.ax + n.x) / 2 + 8).toFixed(1)} ${((n.ay + n.y) / 2 - 6).toFixed(1)} ${n.x.toFixed(1)} ${n.y.toFixed(1)}"/>`).join('');

    // Conexiones entre ramas: vínculos confirmados entre animales y momentos compartidos entre 2+ integrantes
    const pares = new Map();
    (S.data?.conexiones || []).forEach((c) => { if (claves.has(c.a) && claves.has(c.b)) pares.set([c.a, c.b].sort().join('|'), { a: c.a, b: c.b, clase: 'vinculo', texto: etiquetaTipo(c.tipo) }); });
    momentos().forEach((mo) => {
      const ps = (mo.participantes || []).filter((p) => p.estado === 'confirmado' && claves.has(p.clave)).map((p) => p.clave);
      for (let i = 1; i < ps.length; i += 1) {
        const k = [ps[0], ps[i]].sort().join('|');
        if (!pares.has(k)) pares.set(k, { a: ps[0], b: ps[i], clase: 'momento', texto: 'Momento compartido' });
      }
    });
    const conexiones = [...pares.values()].map((c) => {
      const a = posicion.get(c.a); const b = posicion.get(c.b);
      if (!a || !b) return '';
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2 - 40;
      return `<path class="conexion conexion-${c.clase}" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"><title>${esc(c.texto)}</title></path>`;
    }).join('');

    const primero = momentos().map((m) => m.fecha).filter(Boolean).sort()[0];
    const raices = `
      <g class="raices" aria-hidden="true">
        <path d="M500 660 C470 700 420 715 360 725"/><path d="M500 660 C520 705 580 718 650 722"/>
        <path d="M495 665 C485 710 470 740 455 765"/><path d="M505 665 C515 712 535 742 560 768"/>
        <path d="M490 662 C440 676 400 690 345 686"/><path d="M510 662 C565 676 612 690 665 684"/>
      </g>
      <text class="raiz-rotulo" x="500" y="800" text-anchor="middle">${primero ? `Raíces: tu historia registrada empieza el ${esc(fecha(primero))}` : 'Raíces: aquí empieza tu historia'}</text>`;

    const nodosSvg = nodos.map((n, i) => {
      const m = n.m; const foto = fotoDe(m); const pend = esPendiente(m);
      const cg = crec.get(m.clave);
      const etiqueta = `${m.nombre}, ${m.clase === 'animal' ? 'animal' : 'persona'}, ${CATEGORIAS[n.cat].toLowerCase()}${pend ? ', vínculo pendiente' : ''}${m.memoria ? ', en memoria' : ''}. ${cg ? `${cg.hojas.length} hojas y ${cg.flores.length} flores.` : 'Sin momentos registrados.'}`;
      const sel = S.sel === m.clave;
      return `<g class="nodo cat-${n.cat}${sel ? ' is-sel' : ''}${pend ? ' is-pendiente' : ''}${m.memoria ? ' is-memoria' : ''}${S.foco && S.foco !== n.cat ? ' is-atenuado' : ''}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(etiqueta)}" data-clave="${esc(m.clave)}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})">
        <clipPath id="arbol-clip-${i}"><circle r="${n.r}"/></clipPath>
        ${adornos(n, cg)}
        <circle class="nodo-halo" r="${n.r + 7}"/>
        <circle class="nodo-fondo" r="${n.r}"/>
        <text class="nodo-inicial" y="9" text-anchor="middle">${esc(inicial(m.nombre))}</text>
        ${foto ? `<image href="${esc(foto)}" x="${-n.r}" y="${-n.r}" width="${n.r * 2}" height="${n.r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#arbol-clip-${i})"/>` : ''}
        <circle class="nodo-borde" r="${n.r}"/>
        ${m.memoria ? `<g class="memoria-marca" transform="translate(${n.r - 4} ${-n.r + 4})"><circle r="10"/><text y="5" text-anchor="middle">✿</text></g>` : ''}
        <text class="nodo-nombre" y="${n.r + 22}" text-anchor="middle">${esc(nombreCorto(m.nombre))}</text>
        ${pend ? `<text class="nodo-pend" y="${n.r + 40}" text-anchor="middle">pendiente</text>` : ''}
      </g>`;
    }).join('');

    svg.innerHTML = `<g class="vp" data-vp>
      ${raices}
      <path class="tronco" d="M452 668 C474 622 480 540 482 420 L518 420 C520 540 526 622 548 668 C528 676 472 676 452 668 Z"/>
      <path class="tronco-veta" d="M498 650 C500 580 499 500 500 430"/>
      ${ramas}${ramitas}${conexiones}
      <g class="yo" transform="translate(500 395)"><circle r="30" class="yo-fondo"/><text y="9" text-anchor="middle" class="yo-inicial">${esc(inicial(S.data?.yo?.alias || 'Yo'))}</text><text y="52" text-anchor="middle" class="nodo-nombre">${esc(S.data?.yo?.alias ? nombreCorto(S.data.yo.alias) : 'Yo')}</text></g>
      ${nodosSvg}
    </g>`;

    // Caja que contiene todo el dibujo (para ajustar la vista)
    const xs = [380, 620]; const ys = [330, 810];
    nodos.forEach((n) => { xs.push(n.x - n.r - 45, n.x + n.r + 45); ys.push(n.y - n.r - 50, n.y + n.r + 55); });
    Object.entries(ARMS).forEach(([cat, p]) => { if (activas.has(cat)) { xs.push(p[3][0] - 50, p[3][0] + 50); ys.push(p[3][1] - 40); } });
    S.bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    S.nodos = nodos;
  };

  // ---------- Pan y zoom ----------
  const vp = () => svg.querySelector('[data-vp]');
  const aplicarZ = (suave = false) => {
    const g = vp();
    if (!g) return;
    g.classList.toggle('con-transicion', suave && !reducirMovimiento());
    g.style.transform = `translate(${S.z.x.toFixed(1)}px, ${S.z.y.toFixed(1)}px) scale(${S.z.k.toFixed(3)})`;
  };
  const ajustarA = (b, kMax = 1.6) => {
    const W = lienzo.clientWidth || 360; const H = lienzo.clientHeight || 480;
    const k = clamp(Math.min(W / b.w, H / b.h) * 0.97, 0.45, kMax);
    S.z = { k, x: W / 2 - (b.x + b.w / 2) * k, y: H / 2 - (b.y + b.h / 2) * k };
  };
  const centrar = () => { S.foco = null; if (S.bbox) ajustarA(S.bbox); dibujarArbol(); aplicarZ(true); actualizarControlesFoco(); };
  const zoomEn = (factor, cx, cy, suave = true) => {
    const W = lienzo.clientWidth || 360; const H = lienzo.clientHeight || 480;
    const px = cx ?? W / 2; const py = cy ?? H / 2;
    const k = clamp(S.z.k * factor, 0.35, 4);
    const f = k / S.z.k;
    S.z = { k, x: px - (px - S.z.x) * f, y: py - (py - S.z.y) * f };
    aplicarZ(suave);
  };
  // Mantiene el zoom y solo mueve la vista si el integrante queda fuera del área visible
  // (en celular, el área visible es la que deja libre el panel inferior).
  const asegurarVisible = (clave) => {
    const n = (S.nodos || []).find((x) => x.m.clave === clave);
    if (!n) return;
    const W = lienzo.clientWidth || 360; const H = lienzo.clientHeight || 480;
    const panel = $('[data-arbol-panel]');
    const hoja = panel.classList.contains('is-abierto') && getComputedStyle(panel).position === 'fixed';
    const limite = hoja ? clamp(panel.getBoundingClientRect().top - lienzo.getBoundingClientRect().top, 120, H) : H;
    const m = 70;
    const sx = n.x * S.z.k + S.z.x; const sy = n.y * S.z.k + S.z.y;
    let dx = 0; let dy = 0;
    if (sx < m) dx = m - sx; else if (sx > W - m) dx = W - m - sx;
    if (sy < m) dy = m - sy; else if (sy > limite - m - 20) dy = limite - m - 20 - sy;
    if (dx || dy) { S.z.x += dx; S.z.y += dy; aplicarZ(true); }
  };
  const enfocarRama = (cat) => {
    const ns = (S.nodos || []).filter((n) => n.cat === cat);
    if (!ns.length) return;
    S.foco = cat;
    const xs = [500]; const ys = [S.nodos ? 470 : 470];
    ns.forEach((n) => { xs.push(n.x - n.r - 50, n.x + n.r + 50); ys.push(n.y - n.r - 55, n.y + n.r + 60); });
    const x0 = Math.min(...xs); const y0 = Math.min(...ys);
    dibujarArbol();
    ajustarA({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, 1.25);
    aplicarZ(true);
    actualizarControlesFoco();
    renderPanel();
  };
  const actualizarControlesFoco = () => { $('[data-act="general"]').hidden = !S.foco; };

  // Arrastrar con 1 dedo/mouse; pellizcar con 2
  const punteros = new Map();
  let arrastre = null; let pellizco = null; let arrastrado = false;
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.arbol-zoom, .arbol-vista-general')) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrastrado = false;
    if (punteros.size === 1) arrastre = { x: e.clientX, y: e.clientY, zx: S.z.x, zy: S.z.y };
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), k: S.z.k };
      arrastre = null;
    }
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2 && pellizco) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = lienzo.getBoundingClientRect();
      zoomEn((pellizco.k * d / pellizco.d) / S.z.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, false);
      arrastrado = true;
    } else if (arrastre) {
      const dx = e.clientX - arrastre.x; const dy = e.clientY - arrastre.y;
      if (!arrastrado && Math.hypot(dx, dy) < 6) return;
      arrastrado = true;
      lienzo.classList.add('is-arrastrando');
      S.z.x = arrastre.zx + dx; S.z.y = arrastre.zy + dy;
      aplicarZ(false);
    }
  });
  const soltar = (e) => {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pellizco = null;
    if (punteros.size === 0) { arrastre = null; lienzo.classList.remove('is-arrastrando'); window.setTimeout(() => { arrastrado = false; }, 0); }
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = lienzo.getBoundingClientRect();
    zoomEn(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top, false);
  }, { passive: false });
  lienzo.addEventListener('keydown', (e) => {
    if (e.target !== lienzo) return;
    const paso = 48;
    const mapa = { ArrowLeft: [paso, 0], ArrowRight: [-paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mapa[e.key]) { e.preventDefault(); S.z.x += mapa[e.key][0]; S.z.y += mapa[e.key][1]; aplicarZ(true); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomEn(1.2); } else if (e.key === '-') { e.preventDefault(); zoomEn(1 / 1.2); } else if (e.key === '0') { e.preventDefault(); centrar(); }
  });

  // =====================================================================
  // Renderizado de cada parte
  // =====================================================================
  const avatarHtml = (m, clase = '') => {
    const f = fotoDe(m);
    return `<span class="arbol-avatar cat-${categoriaDe(m)} ${clase}" aria-hidden="true"><span>${esc(inicial(m.nombre))}</span>${f ? `<img src="${esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
  };
  vista.addEventListener('error', (e) => {
    const t = e.target;
    if (t?.tagName?.toLowerCase() === 'img' && t.closest('.arbol-avatar')) t.remove();
    else if (t?.tagName?.toLowerCase() === 'image') t.remove();
  }, true);

  const renderFiltros = () => {
    const cuenta = {};
    integrantes().filter((m) => !m.oculta).forEach((m) => { const c = categoriaDe(m); cuenta[c] = (cuenta[c] || 0) + 1; });
    $('[data-arbol-filtros]').innerHTML = Object.entries(CATEGORIAS).map(([k, v]) => `<button type="button" class="arbol-chip cat-${k}" data-filtro="${k}" aria-pressed="${S.filtros[k]}">${esc(v)} <span>${cuenta[k] || 0}</span></button>`).join('');
  };

  const renderPendientes = () => {
    const p = S.data?.pendientes || { personas: [], participaciones: [] };
    const html = [
      ...p.personas.map((s) => `<article class="arbol-solicitud"><p><strong>${esc(s.de_alias)}</strong> quiere vincularse contigo como <strong>${esc(etiquetaTipo(s.tipo))}</strong>${s.descripcion ? ` («${esc(s.descripcion)}»)` : ''}. No se mostrará como confirmado hasta que aceptes.</p><div><button type="button" class="button-verde" data-resp="persona" data-id="${esc(s.id)}" data-dec="confirmado">Aceptar</button><button type="button" class="button-borde" data-resp="persona" data-id="${esc(s.id)}" data-dec="rechazado">Rechazar</button></div></article>`),
      ...p.participaciones.map((s) => `<article class="arbol-solicitud"><p><strong>${esc(s.de_alias || 'Alguien')}</strong> registró un momento (${esc(MOMENTOS[s.momento_tipo]?.etiqueta || 'momento')}, ${esc(fecha(s.fecha))}) donde aparece <strong>${esc(s.participante || 'tu vínculo')}</strong>. ¿Lo confirmas?</p><div><button type="button" class="button-verde" data-resp="participacion" data-id="${esc(s.id)}" data-dec="confirmado">Confirmar</button><button type="button" class="button-borde" data-resp="participacion" data-id="${esc(s.id)}" data-dec="rechazado">Rechazar</button></div></article>`),
    ].join('');
    $('[data-arbol-pendientes]').innerHTML = html ? `<h3 class="arbol-sub">Esperan tu respuesta</h3>${html}<p class="arbol-nota">Las solicitudes sobre tus mascotas se responden en «Solicitudes de vínculo», como siempre.</p>` : '';
  };

  const mensajeVacio = () => `
    <div class="arbol-vacio">
      <h3>Tu árbol todavía es una semilla</h3>
      <p>Cada mascota, persona y momento que registres hará crecer una rama, una hoja o una flor.</p>
      <div class="arbol-vacio-acciones">
        <button type="button" class="button-verde" data-act="primera-mascota">Añade tu primera mascota</button>
        <button type="button" class="button-borde" data-act="vinculo">Crea tu primer vínculo</button>
      </div>
    </div>`;

  const nombresRamas = (clave) => {
    const m = porClave(clave);
    return m ? m.nombre : '';
  };

  const renderLista = () => {
    const cont = $('[data-arbol-lista]');
    const todos = integrantes();
    const grupos = Object.entries(CATEGORIAS).map(([cat, nombre]) => {
      const lista = todos.filter((m) => !m.oculta && categoriaDe(m) === cat && S.filtros[cat]);
      if (!lista.length) return '';
      return `<section class="arbol-grupo cat-${cat}"><h3>${esc(nombre)} <span>${lista.length}</span></h3><ul>${lista.map((m) => {
        const crec = crecimiento().get(m.clave);
        const rels = m.relaciones.map((r) => `${etiquetaTipo(r.tipo)} · ${ESTADO_VINCULO[r.estado] || r.estado}`).join(' · ');
        return `<li><button type="button" class="arbol-item" data-abrir="${esc(m.clave)}">${avatarHtml(m)}<span class="arbol-item-txt"><strong>${esc(m.nombre)}</strong><small>${esc(m.clase === 'animal' ? (m.especie || 'Animal') : 'Persona')} · ${esc(rels)}</small><small>${crec ? `${crec.hojas.length} hojas · ${crec.flores.length} flores` : 'Sin momentos aún'}</small></span></button></li>`;
      }).join('')}</ul></section>`;
    }).join('');
    const ocultas = todos.filter((m) => m.oculta);
    const bloqueOcultas = ocultas.length ? `<section class="arbol-grupo"><h3>Ramas de memoria ocultas <span>${ocultas.length}</span></h3><ul>${ocultas.map((m) => `<li class="arbol-oculta"><span>${esc(m.nombre)}</span><button type="button" class="button-borde" data-act="mostrar-rama" data-ref="${esc(m.ref_id)}">Mostrar de nuevo</button></li>`).join('')}</ul></section>` : '';
    cont.innerHTML = `<p class="arbol-nota">Es el mismo árbol, en forma de lista.</p>${grupos || '<p class="arbol-nota">No hay integrantes con los filtros elegidos.</p>'}${bloqueOcultas}`;
  };

  const leyenda = () => `
    <section class="arbol-leyenda"><h3>Cómo crece tu árbol</h3>
      <ul>
        <li>${iconoHoja} <span>Una <strong>hoja</strong> aparece en la rama de quien participó cuando registras un <strong>paseo, juego o cuidado</strong>.</span></li>
        <li>${iconoFlor} <span>Una <strong>flor</strong> aparece cuando registras un <strong>encuentro, adopción o recuerdo</strong>.</span></li>
        <li><span class="leyenda-linea" aria-hidden="true"></span> <span>Una <strong>línea punteada</strong> une ramas con un vínculo o un momento compartido.</span></li>
        <li><span class="leyenda-borde" aria-hidden="true"></span> <span>Borde discontinuo: el vínculo espera aceptación. Hasta entonces no hay hojas ni flores en esa rama.</span></li>
      </ul>
      <p>Tu árbol no se marchita por estar sin actividad, y no hay puntajes: solo cuenta lo que realmente registraste.</p>
    </section>`;

  const renderPanel = () => {
    const panel = $('[data-arbol-panel]');
    const m = S.sel ? porClave(S.sel) : null;
    panel.classList.toggle('is-abierto', Boolean(m));
    $('.arbol-central').classList.toggle('con-hoja', Boolean(m));
    if (!m) {
      panel.innerHTML = `<p class="arbol-panel-ayuda">Toca un integrante para ver su vínculo, sus recuerdos y su ficha.</p>${leyenda()}`;
      return;
    }
    const cat = categoriaDe(m);
    const esAnimal = m.clase === 'animal';
    const mios = momentos().filter((mo) => (mo.participantes || []).some((p) => p.clave === m.clave));
    const rels = m.relaciones.map((r) => {
      const conf = S.confirmando === r.id;
      return `<li class="arbol-rel">
        <div><strong>${esc(etiquetaTipo(r.tipo))}</strong> <span class="chip ${r.estado === 'pendiente' ? 'is-ambar' : ''}">${esc(ESTADO_VINCULO[r.estado] || r.estado)}</span></div>
        ${r.descripcion ? `<p>${esc(r.descripcion)}</p>` : ''}
        ${r.estado === 'pendiente' ? '<p class="arbol-nota">Espera la aceptación de la otra parte; todavía no se muestra como confirmado.</p>' : ''}
        <div class="arbol-rel-acciones">
          ${r.editable ? `<button type="button" class="button-borde" data-act="editar-vinculo" data-origen="${esc(r.origen)}" data-id="${esc(r.id)}">Editar vínculo</button>` : ''}
          ${r.retirable ? (conf ? `<span class="arbol-conf">¿Retirar este vínculo? <button type="button" class="button-peligro" data-act="retirar" data-origen="${esc(r.origen)}" data-id="${esc(r.id)}">Sí, retirar</button> <button type="button" class="button-borde" data-act="no-retirar">No</button></span>` : `<button type="button" class="button-borde" data-act="pedir-retiro" data-id="${esc(r.id)}">Retirar vínculo</button>`) : ''}
        </div>
      </li>`;
    }).join('');
    const propiaSinRetiro = m.relaciones.some((r) => !r.retirable && m.propio);
    const humanos = esAnimal ? S.humanos[m.ref_id] : null;
    panel.innerHTML = `
      <div class="arbol-panel-cab">
        ${avatarHtml(m, 'grande')}
        <div><h3>${esc(m.nombre)}</h3><p>${esc(esAnimal ? (m.especie || 'Animal') : 'Persona')} · rama de ${esc(CATEGORIAS[cat].toLowerCase())}</p>
        <p>${m.propio ? '<span class="chip">Tu mascota</span> ' : ''}${m.comunitario ? '<span class="chip">Comunitario</span> ' : ''}${m.memoria ? '<span class="chip">En memoria</span>' : ''}</p></div>
        <button type="button" class="arbol-cerrar" data-act="cerrar-panel" aria-label="Cerrar el detalle">×</button>
      </div>
      <div class="arbol-panel-acciones">
        <button type="button" class="button-verde" data-act="momento" data-clave="${esc(m.clave)}">Registrar un momento</button>
        ${esAnimal ? `<button type="button" class="button-borde" data-act="ver-ficha" data-ref="${esc(m.ref_id)}">Ver ficha</button>` : ''}
        ${esAnimal && m.propio ? `<button type="button" class="button-borde" data-act="editar-ficha" data-ref="${esc(m.ref_id)}">Editar ficha</button>` : ''}
        ${S.foco === cat ? '<button type="button" class="button-borde" data-act="general">Volver a la vista general</button>' : `<button type="button" class="button-borde" data-act="enfocar" data-cat="${cat}">Enfocar esta rama</button>`}
        ${esAnimal && m.memoria ? `<button type="button" class="button-borde" data-act="ocultar-rama" data-ref="${esc(m.ref_id)}">Ocultar rama de memoria</button>` : ''}
      </div>
      <section><h4>Mi relación</h4><ul class="arbol-rels">${rels}</ul>
        ${propiaSinRetiro ? '<p class="arbol-nota">Es tu mascota: su ficha se gestiona desde «Mis animales».</p>' : ''}</section>
      ${esAnimal ? `<section><h4>Quienes lo cuidan</h4>${humanos === undefined || humanos === null ? '<p class="arbol-nota">Cargando…</p>' : humanos.length ? `<ul class="arbol-humanos">${humanos.map((h) => `<li><strong>${esc(h.alias)}</strong> <small>${esc(ROL_FAMILIAR[h.rol] || 'Familia')}</small></li>`).join('')}</ul>` : '<p class="arbol-nota">No hay personas visibles. Cada persona decide si aparece.</p>'}</section>` : ''}
      <section><h4>Momentos compartidos (${mios.length})</h4>${mios.length ? `<ul class="arbol-mini">${mios.slice(0, 4).map((mo) => `<li>${iconoForma(mo.tipo)} <span><strong>${esc(MOMENTOS[mo.tipo].etiqueta)}</strong> · ${esc(fecha(mo.fecha))}${mo.texto ? `<br><small>${esc(mo.texto)}</small>` : ''}</span></li>`).join('')}</ul>${mios.length > 4 ? '<button type="button" class="enlace" data-act="ver-historia">Ver todos en Historia</button>' : ''}` : '<p class="arbol-nota">Aún no hay momentos. Registra el primero y verás aparecer una hoja o una flor.</p>'}</section>

      <p class="arbol-nota">«Editar ficha» cambia los datos del animal. «Editar vínculo» cambia solo tu relación con él. La salud no se muestra en el árbol.</p>`;
  };

  const renderHistoria = () => {
    const cont = $('[data-panel-historia]');
    const ms = momentos();
    if (!ms.length) {
      cont.innerHTML = `<div class="arbol-vacio"><h3>Aún no hay historia</h3><p>Cuando registres un paseo, un juego, un cuidado, un encuentro, una adopción o un recuerdo, aparecerá aquí y hará crecer el árbol.</p><button type="button" class="button-verde" data-act="momento">Registrar un momento</button></div>`;
      return;
    }
    const meses = new Map();
    ms.forEach((mo) => { const k = mes(mo.fecha); if (!meses.has(k)) meses.set(k, []); meses.get(k).push(mo); });
    cont.innerHTML = [...meses.entries()].map(([k, lista]) => `<section class="arbol-mes"><h3>${esc(k)}</h3><ol>${lista.map((mo) => {
      const conf = (mo.participantes || []).filter((p) => p.estado === 'confirmado');
      const pend = (mo.participantes || []).filter((p) => p.estado === 'pendiente');
      const confirmando = S.confirmando === `m:${mo.id}`;
      return `<li class="arbol-momento" id="mo-${esc(mo.id)}">
        <div class="arbol-momento-ico forma-${formaDe(mo.tipo)}">${iconoForma(mo.tipo)}</div>
        <div class="arbol-momento-txt">
          <p><strong>${esc(MOMENTOS[mo.tipo]?.etiqueta || mo.tipo)}</strong> · ${esc(fecha(mo.fecha))} <span class="chip">${mo.visibilidad === 'privado' ? 'Privado' : 'Compartido'}</span></p>
          ${mo.texto ? `<p>${esc(mo.texto)}</p>` : ''}
          <p class="arbol-efectos">${conf.length ? conf.map((p) => `<span class="chip">${esc(articulo(mo.tipo) === 'una flor' ? 'Flor' : 'Hoja')} en ${esc(p.nombre)}</span>`).join(' ') : ''}${pend.length ? ` <span class="chip is-ambar">Pendiente de confirmar: ${esc(pend.map((p) => p.nombre).join(', '))}</span>` : ''}</p>
          ${mo.es_mio ? '' : `<p class="arbol-nota">Registrado por ${esc(mo.autor_alias || 'otra persona')}.</p>`}
          ${mo.es_mio ? `<div class="arbol-rel-acciones"><button type="button" class="button-borde" data-act="editar-momento" data-id="${esc(mo.id)}">Editar</button>${confirmando ? `<span class="arbol-conf">¿Eliminar este momento? <button type="button" class="button-peligro" data-act="eliminar-momento" data-id="${esc(mo.id)}">Sí, eliminar</button> <button type="button" class="button-borde" data-act="no-retirar">No</button></span>` : `<button type="button" class="button-borde" data-act="pedir-eliminar" data-id="${esc(mo.id)}">Eliminar</button>`}</div>` : ''}
        </div>
      </li>`;
    }).join('')}</ol></section>`).join('');
  };

  // ---------- Ilustración en Mi perfil: mi árbol y, al lado, el de mi pareja de vínculo ----------
  // Copa = mis animales · Tronco = mi miniatura · Raíces = animales conmemorativos.
  const limpiarNombre = (n) => String(n || '').replace(/\s*\(ejemplo\)\s*/i, '').trim() || '?';
  const corto = (n, max = 12) => (n.length > max ? `${n.slice(0, max - 1)}…` : n);
  let YO = { alias: '', foto: '' }; // lo informa main.js con el evento perfil:cambio
  const PASTELES = ['#e8e1f6', '#fbe3b2', '#d6ecdc'];
  const parejaDe = () => integrantes().find((m) => m.clase === 'persona' && !m.oculta && !esPendiente(m)
    && (m.relaciones || []).some((r) => r.estado === 'confirmado' && r.tipo === 'familia' && r.origen !== 'privado'));

  const dibujoArbol = (cuidados, encuentros) => {
    let n = 0;
    const avatar = (nombre, foto, cx, cy, r, tono) => {
      const id = `mpa-c${n += 1}`;
      const base = `<circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="#fff"/>`;
      const https = typeof foto === 'string' && foto.startsWith('https://') ? foto : '';
      if (https) return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>${base}<image href="${esc(https)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
      return `${base}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PASTELES[tono % 3]}"/><text x="${cx}" y="${cy + r * 0.36}" text-anchor="middle" font-size="${Math.round(r * 0.95)}" font-weight="800" fill="#5d4a9c" font-family="Nunito, sans-serif">${esc(limpiarNombre(nombre).charAt(0).toUpperCase())}</text>`;
    };
    const pildora = (texto, cx, y) => {
      const w = Math.max(40, texto.length * 7 + 16);
      return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="18" rx="9" fill="#fff"/><text x="${cx}" y="${y + 13}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#17462c" font-family="Nunito, sans-serif">${esc(texto)}</text>`;
    };
    // Un árbol: cx = eje del tronco; perros en la copa; raíces con conmemorativos; miniatura en el tronco.
    const arbol = (cx, perros, memorias, duenoNombre, duenoFoto, hojas, flores) => {
      const copa = perros.length >= 2 ? [[cx - 22, 92], [cx + 22, 92]] : [[cx, 92]];
      const rp = perros.length >= 2 ? 21 : 26;
      const hs = [[-48, 55], [48, 52], [-60, 105], [60, 108], [-20, 38], [22, 36]].slice(0, hojas);
      const fs = [[-38, 128], [40, 130], [0, 134]].slice(0, flores);
      const raices = memorias.slice(0, 3).map((m, i, a) => [cx + (i - (a.length - 1) / 2) * 44, 270]);
      return `
        <circle cx="${cx}" cy="95" r="66" fill="#8cc79b"/><circle cx="${cx - 38}" cy="118" r="38" fill="#7bb98b"/><circle cx="${cx + 38}" cy="118" r="38" fill="#7bb98b"/>
        ${hs.map(([dx, y]) => `<ellipse cx="${cx + dx}" cy="${y}" rx="8" ry="4.5" fill="#3f8a5c" transform="rotate(-30 ${cx + dx} ${y})"/>`).join('')}
        ${fs.map(([dx, y]) => `<use href="#mpa-flor" x="${cx + dx - 8}" y="${y - 8}" width="16" height="16"/>`).join('')}
        <path d="M${cx - 9} 232 C${cx - 8} 200 ${cx - 7} 175 ${cx - 5} 150 H${cx + 5} C${cx + 7} 175 ${cx + 8} 200 ${cx + 9} 232Z" fill="#8a6a4a"/>
        ${raices.map(([rx]) => `<path d="M${cx} 232 Q${(cx + rx) / 2} 240 ${rx} 258" stroke="#8a6a4a" stroke-width="4" fill="none" stroke-linecap="round"/>`).join('')}
        ${perros.slice(0, 2).map((p, i) => avatar(p.nombre, p.foto_url, copa[i][0], copa[i][1], rp, i)).join('')}
        ${avatar(duenoNombre, duenoFoto, cx, 196, 17, 0)}
        ${raices.map(([rx, ry], i) => avatar(memorias[i].nombre, memorias[i].foto_url, rx, ry, 13, i + 1)).join('')}
        ${pildora(corto(limpiarNombre(duenoNombre), 10), cx, 218)}`;
    };
    const vivos = (m) => m.clase === 'animal' && !m.oculta && !esPendiente(m);
    const mios = integrantes().filter((m) => vivos(m) && m.propio);
    const perrosMios = mios.filter((m) => !m.memoria);
    const memoriasMias = mios.filter((m) => m.memoria);
    const pareja = parejaDe();
    const perrosPareja = (pareja?.animales || []).filter((a) => !a.memoria);
    const memoriasPareja = (pareja?.animales || []).filter((a) => a.memoria);
    const nombres = [YO.alias || 'tú', ...perrosMios.map((m) => m.nombre), pareja?.nombre, ...perrosPareja.map((a) => a.nombre)].filter(Boolean).map(limpiarNombre).join(', ');
    const hojas = Math.min(cuidados, 6);
    const flores = Math.min(encuentros, 3);
    return `<svg class="mp-arbol-svg" viewBox="0 0 340 300" role="img" aria-label="Ilustración de tu árbol${pareja ? ' y el de ' + esc(limpiarNombre(pareja.nombre)) : ''}: ${esc(nombres)}" xmlns="http://www.w3.org/2000/svg">
      <defs><symbol id="mpa-flor" viewBox="-12 -12 24 24"><g fill="#f7a8c4"><circle cx="0" cy="-6" r="4.5"/><circle cx="5.7" cy="-1.9" r="4.5"/><circle cx="3.5" cy="4.9" r="4.5"/><circle cx="-3.5" cy="4.9" r="4.5"/><circle cx="-5.7" cy="-1.9" r="4.5"/></g><circle r="3" fill="#f5b32f"/></symbol></defs>
      <path d="M0 238 Q85 222 170 236 T340 230 V300 H0Z" fill="#d6ecdc"/>
      <path d="M0 262 Q110 248 200 260 T340 255 V300 H0Z" fill="#b9dcc4"/>
      ${arbol(pareja ? 90 : 170, perrosMios, memoriasMias, YO.alias || 'Yo', YO.foto, hojas, flores)}
      ${pareja ? arbol(250, perrosPareja, memoriasPareja, pareja.nombre, pareja.foto_url, 0, 0) : ''}
    </svg>`;
  };

  const renderResumen = () => {
    if (S.cargando && !S.data) { resumen.innerHTML = '<p class="mp-muted" role="status">Cargando tu árbol…</p>'; return; }
    if (S.error && !S.data) {
      resumen.innerHTML = `<p class="mp-muted arbol-error">${esc(S.error)}</p><button type="button" class="mp-btn mp-btn-soft" data-arbol-reintentar>Reintentar</button>`;
      document.dispatchEvent(new CustomEvent('arbol:cambio', { detail: { cuidados: 0, encuentros: 0 } }));
      return;
    }
    const ints = integrantes();
    const ms = momentos();
    const animales = ints.filter((m) => m.clase === 'animal').length;
    const personas = ints.length - animales;
    const cuidados = ms.filter((mo) => ['paseo', 'juego', 'cuidado'].includes(mo.tipo)).length;
    const encuentros = ms.filter((mo) => mo.tipo === 'encuentro').length;
    const pend = (S.data?.pendientes?.personas?.length || 0) + (S.data?.pendientes?.participaciones?.length || 0);
    resumen.innerHTML = `
      ${S.modo === 'demo' ? '<p class="arbol-demo"><strong>Demostración.</strong> Datos ficticios guardados solo en este navegador.</p>' : ''}
      ${ints.length ? `<div class="mp-arbol">${dibujoArbol(cuidados, encuentros)}</div>
      <p class="mp-muted mp-arbol-cuenta">${animales} ${animales === 1 ? 'animal' : 'animales'} · ${personas} ${personas === 1 ? 'persona' : 'personas'} · ${ms.length} ${ms.length === 1 ? 'momento' : 'momentos'}</p>
      ${pend ? `<p class="arbol-nota"><strong>${pend}</strong> ${pend === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu respuesta.</p>` : ''}` : '<p class="mp-muted">Aún no tienes vínculos. Tu árbol empieza con tu primera mascota o tu primer vínculo.</p>'}
      <button type="button" class="mp-btn" data-arbol-abrir>${ints.length ? 'Gestionar vínculos' : 'Empezar mi árbol'}</button>`;
    document.dispatchEvent(new CustomEvent('arbol:cambio', { detail: { cuidados, encuentros } }));
  };

  document.addEventListener('perfil:cambio', (e) => { YO = { alias: e.detail?.alias || '', foto: e.detail?.foto || '' }; renderResumen(); });

  const render = () => {
    renderResumen();
    if (!vista.open) return;
    $('[data-arbol-demo]').hidden = S.modo !== 'demo';
    $('[data-arbol-aviso]').textContent = S.aviso;
    renderPendientes();
    $$('[data-pestana]').forEach((b) => { const a = b.dataset.pestana === S.pestana; b.setAttribute('aria-selected', String(a)); b.tabIndex = a ? 0 : -1; });
    $('[data-panel-arbol]').hidden = S.pestana !== 'arbol';
    $('[data-panel-historia]').hidden = S.pestana !== 'historia';
    const estado = $('[data-arbol-estado]');
    const vacio = !S.cargando && !S.error && integrantes().length === 0 && S.data;
    if (S.cargando && !S.data) { estado.hidden = false; estado.textContent = 'Cargando tu árbol…'; } else if (S.error && !S.data) { estado.hidden = false; estado.innerHTML = `${esc(S.error)} <button type="button" class="button-borde" data-arbol-reintentar>Reintentar</button>`; } else estado.hidden = true;
    $$('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === S.vistaArbol)));
    const hayArbol = S.pestana === 'arbol';
    if (hayArbol) {
      renderFiltros();
      const lista = $('[data-arbol-lista]');
      lienzo.hidden = S.vistaArbol !== 'arbol';
      lista.hidden = S.vistaArbol !== 'lista';
      if (vacio) {
        lienzo.hidden = true; lista.hidden = false; lista.innerHTML = mensajeVacio();
      } else if (S.data) {
        if (S.vistaArbol === 'arbol') {
          dibujarArbol();
          if (S.reajustar) { ajustarA(S.bbox); S.reajustar = false; }
          aplicarZ(false);
          actualizarControlesFoco();
        } else renderLista();
      }
      renderPanel();
    } else renderHistoria();
  };

  // =====================================================================
  // Carga y acciones
  // =====================================================================
  const cargar = async (silencioso = false) => {
    if (!silencioso) { S.cargando = true; S.error = ''; render(); }
    try {
      S.data = await S.api.cargar();
      S.error = '';
    } catch (e) {
      if (S.modo === 'servidor' && faltaBackend(e)) { S.modo = 'demo'; S.api = demo; return cargar(silencioso); }
      S.error = mensajeError(e);
    }
    S.cargando = false;
    if (S.sel && !porClave(S.sel)) S.sel = null;
    render();
    return undefined;
  };

  const aviso = (t) => { S.aviso = t; const el = $('[data-arbol-aviso]'); if (el) el.textContent = t; };

  const ejecutar = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) aviso(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await cargar(true);
      return { ok: true, r };
    } catch (e) {
      aviso(mensajeError(e));
      return { ok: false, error: e };
    }
  };

  const seleccionar = async (clave) => {
    S.sel = clave; S.confirmando = null;
    const m = porClave(clave);
    if (S.vistaArbol === 'arbol') { dibujarArbol(); aplicarZ(false); }
    renderPanel();
    if (S.vistaArbol === 'arbol') {
      if (window.matchMedia('(max-width: 899px)').matches) lienzo.scrollIntoView({ block: 'start', behavior: 'auto' });
      asegurarVisible(clave);
    }
    if (m?.clase === 'animal' && S.humanos[m.ref_id] === undefined) {
      S.humanos[m.ref_id] = null;
      try { S.humanos[m.ref_id] = (await S.api.humanosDe(m.ref_id)) || []; } catch { S.humanos[m.ref_id] = []; }
      if (S.sel === clave) renderPanel();
    }
  };

  // ---------- Formularios ----------
  const setError = (form, t) => { const p = form.querySelector('[data-form-error]'); if (p) p.textContent = t || ''; };
  const abrirDlg = (d) => { if (!d.open) d.showModal(); };

  const TIPOS_ANIMAL = ['familia', 'cuidador', 'rescatista', 'colaborador', 'amistad', 'companero_paseo', 'otro'];
  const TIPOS_PERSONA = ['familia', 'tutor', 'cuidador', 'amistad', 'companero_paseo', 'otro'];

  const actualizarTiposVinculo = () => {
    const f = $('[data-form-vinculo]', dVinculo);
    const quien = f.elements.quien.value;
    f.querySelectorAll('[data-quien]').forEach((x) => { x.hidden = x.dataset.quien !== quien; });
    const sel = f.querySelector('[data-tipo-vinculo]');
    const previo = sel.value;
    sel.innerHTML = opcionesTipo(quien === 'animal' ? TIPOS_ANIMAL : TIPOS_PERSONA);
    if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
  };

  const abrirVinculo = async () => {
    const f = $('[data-form-vinculo]', dVinculo);
    f.reset(); setError(f, '');
    f.querySelector('[data-personas]').innerHTML = '';
    actualizarTiposVinculo();
    const ya = new Set(integrantes().map((m) => m.clave));
    let candidatos = [];
    try { candidatos = (await S.api.animalesRed()) || []; } catch { candidatos = []; }
    candidatos = candidatos.filter((a) => !ya.has(`animal:${a.id}`));
    const selA = f.elements.animal_id;
    selA.innerHTML = candidatos.length ? candidatos.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}${a.especie ? ` (${esc(a.especie)})` : ''}</option>`).join('') : '<option value="">No hay mascotas disponibles para vincular</option>';
    abrirDlg(dVinculo);
  };

  let tBuscar = null;
  $('[data-form-vinculo]', dVinculo).addEventListener('input', (e) => {
    const f = e.currentTarget;
    if (e.target.name === 'quien') actualizarTiposVinculo();
    if (e.target.name === 'buscar') {
      window.clearTimeout(tBuscar);
      const texto = e.target.value.trim();
      const cont = f.querySelector('[data-personas]');
      if (texto.length < 2) { cont.innerHTML = ''; return; }
      tBuscar = window.setTimeout(async () => {
        try {
          const rs = (await S.api.buscarPersonas(texto)) || [];
          cont.innerHTML = rs.length ? rs.map((p, i) => `<label class="arbol-persona"><input type="radio" name="perfil" value="${esc(p.perfil_id)}"${i === 0 ? ' checked' : ''}> ${esc(p.alias)}</label>`).join('') : '<p class="arbol-nota">No encontramos a nadie con ese alias.</p>';
        } catch (err) { cont.innerHTML = `<p class="arbol-error">${esc(mensajeError(err))}</p>`; }
      }, 250);
    }
  });
  $('[data-form-vinculo]', dVinculo).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; setError(f, '');
    const quien = f.elements.quien.value; const tipo = f.elements.tipo.value; const desc = f.elements.descripcion.value.trim();
    let fn; let msg;
    if (quien === 'animal') {
      const id = f.elements.animal_id.value;
      if (!id) { setError(f, 'Elige una mascota.'); return; }
      fn = () => S.api.vincularAnimal(id, tipo, desc);
      msg = (r) => (r === 'confirmado' ? 'Vínculo confirmado: la rama ya está en tu árbol.' : 'Vínculo solicitado. Aparecerá como confirmado cuando su responsable lo acepte.');
    } else if (quien === 'persona') {
      const id = f.querySelector('[name="perfil"]:checked')?.value;
      if (!id) { setError(f, 'Busca y elige a una persona.'); return; }
      fn = () => S.api.vincularPersona(id, tipo, desc);
      msg = () => 'Solicitud enviada. El vínculo aparecerá como confirmado cuando la otra persona acepte.';
    } else {
      const nombre = f.elements.nombre.value.trim();
      if (!nombre) { setError(f, 'Escribe un nombre.'); return; }
      fn = () => S.api.agregarPrivado(tipo, desc, nombre, f.elements.clase.value);
      msg = () => `${nombre} se añadió como integrante privado: solo tú lo ves.`;
    }
    const r = await ejecutar(fn, msg);
    if (r.ok) { dVinculo.close(); S.filtros = { familia: true, compania: true, cuidados: true, recuerdos: true }; render(); } else setError(f, mensajeError(r.error));
  });

  // Registrar / editar un momento
  const participantesPosibles = () => integrantes().filter((m) => !m.oculta && (m.relaciones || []).some((r) => r.estado !== 'rechazado'));
  const partId = (m) => ({ t: m.clave.split(':')[0] === 'perfil' ? 'perfil' : m.clave.split(':')[0], id: m.ref_id });
  const actualizarEfecto = () => {
    const f = $('[data-form-momento]', dMomento);
    if (f.dataset.edita) { $('[data-efecto]', dMomento).textContent = ''; return; }
    const tipo = f.elements.tipo.value;
    const sel = [...f.querySelectorAll('[name="part"]:checked')].map((c) => porClave(c.value)).filter(Boolean);
    const ef = $('[data-efecto]', dMomento);
    if (!sel.length) { ef.textContent = 'Elige a quienes participaron para ver dónde crecerá.'; return; }
    const seguros = sel.filter((m) => m.propio || m.clave.startsWith('privado:') || m.comunitario);
    const otros = sel.filter((m) => !seguros.includes(m));
    const partes = [];
    if (seguros.length) partes.push(`Al guardar, aparecerá ${articulo(tipo)} en la rama de ${seguros.map((m) => m.nombre).join(', ')}.`);
    if (otros.length) partes.push(`${otros.map((m) => m.nombre).join(', ')} deberá confirmar su participación; hasta entonces no verás la ${formaDe(tipo) === 'flor' ? 'flor' : 'hoja'} en su rama.`);
    ef.textContent = partes.join(' ');
  };
  const abrirMomento = (clave = null, editar = null) => {
    const f = $('[data-form-momento]', dMomento);
    f.reset(); setError(f, '');
    delete f.dataset.edita;
    f.elements.fecha.max = hoyIso(); f.elements.fecha.value = hoyIso();
    const lista = $('[data-lista-participantes]', dMomento);
    const posibles = participantesPosibles();
    lista.innerHTML = posibles.length ? posibles.map((m) => `<label><input type="checkbox" name="part" value="${esc(m.clave)}"${clave === m.clave ? ' checked' : ''}> ${esc(m.nombre)} <small>${m.clase === 'animal' ? 'animal' : 'persona'}</small></label>`).join('') : '<p class="arbol-nota">Primero añade una mascota o un vínculo para poder registrar momentos con ellos.</p>';
    $('[data-momento-titulo]', dMomento).textContent = editar ? 'Editar momento' : 'Registrar un momento';
    $('[data-participantes]', dMomento).hidden = Boolean(editar);
    if (editar) {
      f.dataset.edita = editar.id;
      f.elements.tipo.value = editar.tipo; f.elements.fecha.value = String(editar.fecha).slice(0, 10);
      f.elements.texto.value = editar.texto || ''; f.elements.visibilidad.value = editar.visibilidad;
    }
    $('[data-contador]', dMomento).textContent = `${f.elements.texto.value.length} / 600`;
    actualizarEfecto();
    abrirDlg(dMomento);
  };
  $('[data-form-momento]', dMomento).addEventListener('input', (e) => {
    const f = e.currentTarget;
    if (e.target.name === 'texto') $('[data-contador]', dMomento).textContent = `${e.target.value.length} / 600`;
    actualizarEfecto();
    void f;
  });
  $('[data-form-momento]', dMomento).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; setError(f, '');
    const tipo = f.elements.tipo.value; const fechaIso = f.elements.fecha.value; const texto = f.elements.texto.value.trim(); const vis = f.elements.visibilidad.value;
    if (!fechaIso) { setError(f, 'Elige la fecha.'); return; }
    if (fechaIso > hoyIso()) { setError(f, 'La fecha no puede ser futura.'); return; }
    if (f.dataset.edita) {
      const r = await ejecutar(() => S.api.editarMomento(f.dataset.edita, tipo, fechaIso, texto, vis), 'Momento actualizado en la historia y en el árbol.');
      if (r.ok) dMomento.close(); else setError(f, mensajeError(r.error));
      return;
    }
    const claves = [...f.querySelectorAll('[name="part"]:checked')].map((c) => c.value);
    if (!claves.length) { setError(f, 'Elige al menos un participante.'); return; }
    const partes = claves.map((c) => partId(porClave(c)));
    const r = await ejecutar(() => S.api.registrarMomento(tipo, fechaIso, texto, vis, partes), null);
    if (!r.ok) { setError(f, mensajeError(r.error)); return; }
    const id = r.r;
    const mo = momentos().find((x) => x.id === id);
    const confirmados = (mo?.participantes || []).filter((p) => p.estado === 'confirmado');
    const pendientes = (mo?.participantes || []).filter((p) => p.estado === 'pendiente');
    if (confirmados.length) S.nuevo = { id, clave: confirmados[0].clave };
    const partesMsg = [];
    if (confirmados.length) partesMsg.push(`Listo: apareció ${articulo(tipo)} en la rama de ${confirmados.map((p) => p.nombre).join(', ')}.`);
    if (pendientes.length) partesMsg.push(`Queda pendiente de confirmación: ${pendientes.map((p) => p.nombre).join(', ')}.`);
    aviso(partesMsg.join(' ') || 'Momento guardado.');
    dMomento.close();
    S.pestana = 'arbol'; S.vistaArbol = 'arbol';
    render();
    if (confirmados.length) { seleccionar(confirmados[0].clave); }
  });

  // Editar vínculo
  const abrirEditarVinculo = (origen, id) => {
    const m = integrantes().find((x) => x.relaciones.some((r) => r.id === id));
    const r = m?.relaciones.find((x) => x.id === id);
    if (!r) return;
    const f = $('[data-form-editar]', dEditar);
    f.reset(); setError(f, '');
    f.dataset.origen = origen; f.dataset.id = id;
    const selT = f.querySelector('[data-tipo-vinculo]');
    selT.innerHTML = opcionesTipo(TIPOS_PERSONA);
    selT.value = r.tipo;
    f.querySelector('[data-campo-tipo]').hidden = origen !== 'privado';
    f.querySelector('[data-campo-publico]').hidden = origen !== 'animal_humano';
    f.elements.descripcion.value = r.descripcion || '';
    f.elements.publico.checked = Boolean(r.publico);
    $('#arbol-dlg-editar-t', dEditar).textContent = `Editar vínculo con ${m.nombre}`;
    abrirDlg(dEditar);
  };
  $('[data-form-editar]', dEditar).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; setError(f, '');
    const origen = f.dataset.origen;
    const r = await ejecutar(() => S.api.editarVinculo(origen, f.dataset.id, origen === 'privado' ? f.querySelector('[data-tipo-vinculo]').value : null, f.elements.descripcion.value.trim(), origen === 'animal_humano' ? f.elements.publico.checked : null), 'Vínculo actualizado en todas las vistas.');
    if (r.ok) dEditar.close(); else setError(f, mensajeError(r.error));
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar-dlg]')) e.target.closest('dialog')?.close();
  });

  // ---------- Búsqueda de integrantes ----------
  const buscarInput = $('[data-arbol-buscar]');
  const resultados = $('[data-arbol-resultados]');
  buscarInput.addEventListener('input', () => {
    const t = buscarInput.value.trim().toLowerCase();
    if (!t) { resultados.hidden = true; resultados.innerHTML = ''; return; }
    const rs = integrantes().filter((m) => m.nombre.toLowerCase().includes(t)).slice(0, 6);
    resultados.innerHTML = rs.length ? rs.map((m) => `<li><button type="button" data-abrir="${esc(m.clave)}">${esc(m.nombre)} <small>${m.oculta ? 'rama oculta' : esc(CATEGORIAS[categoriaDe(m)])}</small></button></li>`).join('') : '<li class="arbol-nota">Sin resultados</li>';
    resultados.hidden = false;
  });
  buscarInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { resultados.hidden = true; } });

  // ---------- Eventos principales ----------
  const irATab = (tab) => {
    vista.close();
    // Mi perfil ya no tiene pestañas: el árbol vive en la pantalla principal.
    const destino = tab === 'arbol' ? 'perfil' : tab;
    document.querySelector(`[data-my-profile-tab="${destino}"]`)?.click();
  };

  const abrirVista = async () => {
    if (!vista.open) vista.showModal();
    S.reajustar = true; S.foco = null; S.aviso = '';
    render();
    await cargar(Boolean(S.data));
    S.reajustar = true; render();
  };

  vista.addEventListener('click', async (e) => {
    const t = e.target;
    const filtro = t.closest('[data-filtro]');
    if (filtro) { const k = filtro.dataset.filtro; S.filtros[k] = !S.filtros[k]; if (S.foco && !S.filtros[S.foco]) S.foco = null; render(); return; }
    const modo = t.closest('[data-modo]');
    if (modo) { S.vistaArbol = modo.dataset.modo; S.reajustar = true; render(); return; }
    const pest = t.closest('[data-pestana]');
    if (pest) { S.pestana = pest.dataset.pestana; render(); return; }
    const ir = t.closest('[data-ir-tab]');
    if (ir) { irATab(ir.dataset.irTab); return; }
    const abrir = t.closest('[data-abrir]');
    if (abrir) {
      resultados.hidden = true; buscarInput.value = '';
      const m = porClave(abrir.dataset.abrir);
      if (m?.oculta) { await ejecutar(() => S.api.alternarMemoria(m.ref_id, false), `La rama de ${m.nombre} vuelve a verse.`); }
      S.pestana = 'arbol';
      if (m && !S.filtros[categoriaDe(m)]) S.filtros[categoriaDe(m)] = true;
      render();
      seleccionar(abrir.dataset.abrir);
      return;
    }
    const nodo = t.closest('.nodo');
    if (nodo && !arrastrado) { seleccionar(nodo.dataset.clave); return; }
    if (t.closest('[data-arbol-reintentar]')) { cargar(); return; }
    const resp = t.closest('[data-resp]');
    if (resp) {
      const { resp: tipo, id, dec } = resp.dataset;
      await ejecutar(() => (tipo === 'persona' ? S.api.responderPersona(id, dec) : S.api.responderParticipacion(id, dec)), dec === 'confirmado' ? 'Listo, quedó confirmado.' : 'Solicitud rechazada.');
      return;
    }
    const act = t.closest('[data-act]');
    if (!act) { return; }
    const a = act.dataset.act;
    if (a === 'cerrar') vista.close();
    else if (a === 'vinculo') abrirVinculo();
    else if (a === 'momento') abrirMomento(act.dataset.clave || null);
    else if (a === 'zoom-mas') zoomEn(1.25);
    else if (a === 'zoom-menos') zoomEn(1 / 1.25);
    else if (a === 'centrar' || a === 'general') { S.foco = null; S.reajustar = true; render(); actualizarControlesFoco(); }
    else if (a === 'enfocar') enfocarRama(act.dataset.cat);
    else if (a === 'cerrar-panel') { S.sel = null; render(); }
    else if (a === 'ver-historia') { S.pestana = 'historia'; render(); }
    else if (a === 'ver-ficha' || a === 'editar-ficha') {
      const ok = a === 'ver-ficha' ? window.auraLadraFicha?.abrir(act.dataset.ref) : window.auraLadraFicha?.editar(act.dataset.ref);
      if (!ok) aviso(S.modo === 'demo' ? 'En la demostración los animales de ejemplo no tienen ficha real.' : 'No pudimos abrir la ficha de este animal.');
    } else if (a === 'editar-vinculo') abrirEditarVinculo(act.dataset.origen, act.dataset.id);
    else if (a === 'pedir-retiro') { S.confirmando = act.dataset.id; renderPanel(); }
    else if (a === 'pedir-eliminar') { S.confirmando = `m:${act.dataset.id}`; renderHistoria(); }
    else if (a === 'no-retirar') { S.confirmando = null; renderPanel(); renderHistoria(); }
    else if (a === 'retirar') {
      S.confirmando = null;
      const r = await ejecutar(() => S.api.retirarVinculo(act.dataset.origen, act.dataset.id), 'Vínculo retirado. Se actualizó el árbol y la ficha.');
      if (r.ok && S.sel && !porClave(S.sel)) S.sel = null;
      render();
    } else if (a === 'editar-momento') { const mo = momentos().find((x) => x.id === act.dataset.id); if (mo) abrirMomento(null, mo); }
    else if (a === 'eliminar-momento') { S.confirmando = null; await ejecutar(() => S.api.eliminarMomento(act.dataset.id), 'Momento eliminado de la historia y del árbol.'); }
    else if (a === 'ocultar-rama') { await ejecutar(() => S.api.alternarMemoria(act.dataset.ref, true), 'Rama de memoria oculta. La encuentras en la vista de lista.'); S.sel = null; render(); }
    else if (a === 'mostrar-rama') { await ejecutar(() => S.api.alternarMemoria(act.dataset.ref, false), 'La rama de memoria vuelve a verse.'); }
    else if (a === 'primera-mascota') { document.querySelector('[data-open-pet-connect]')?.click(); }
  });

  vista.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[data-pestana]');
    if (tab && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      S.pestana = S.pestana === 'arbol' ? 'historia' : 'arbol'; render();
      $(`[data-pestana="${S.pestana}"]`).focus();
      return;
    }
    const nodo = e.target.closest?.('.nodo');
    if (nodo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); seleccionar(nodo.dataset.clave); }
  });

  // Resumen en la pestaña de Mi perfil
  resumen.addEventListener('click', (e) => {
    if (e.target.closest('[data-arbol-abrir]')) abrirVista();
    if (e.target.closest('[data-arbol-reintentar]')) cargar();
  });
  // Si cambian las mascotas desde sus propios diálogos, el árbol se vuelve a leer.
  ['[data-pet-connect-dialog]', '[data-pet-profile-dialog]'].forEach((s) => document.querySelector(s)?.addEventListener('close', () => cargar(true)));

  let tResize = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(tResize);
    tResize = window.setTimeout(() => { if (vista.open && S.pestana === 'arbol' && S.vistaArbol === 'arbol') { S.reajustar = true; render(); } }, 150);
  });

  // ---------- Inicio ----------
  const iniciar = async () => {
    let sesion = null;
    try { sesion = (await db.auth.getSession()).data.session; } catch { sesion = null; }
    if (!sesion) { S.cargando = false; S.error = 'Inicia sesión para ver tu árbol.'; renderResumen(); } else await cargar();
    db.auth.onAuthStateChange((_ev, s) => {
      window.setTimeout(() => {
        if (s) cargar(true); else { S.data = null; S.error = 'Inicia sesión para ver tu árbol.'; S.cargando = false; if (vista.open) vista.close(); render(); }
      }, 0);
    });
  };
  iniciar();

  // Para pruebas: permite abrir la vista desde fuera.
  window.auraLadraArbol = { abrir: abrirVista };
})();

// Encuentros en el Calendario de Locaciones. Usa las funciones del servidor de la migración
// 20261010010000_encuentros.sql (aún NO aplicada en ningún entorno). Si el servidor no las tiene, el botón
// queda desactivado y lo explica: no se simula ningún encuentro.
(() => {
  'use strict';
  const root = document.querySelector('[data-cal]');
  if (!root || !window.auraLadraEventos) return;
  const db = window.auraLadraDb;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const TIPOS = { paseo: 'Paseo coordinado', junta_canil: 'Junta de canil', jornada_adopcion: 'Jornada de adopción', campana: 'Campaña', mantenimiento_estacion: 'Mantenimiento de estación', otro: 'Otro' };
  const faltaBackend = (e) => /PGRST20[25]|PGRST106|schema cache|Could not find|does not exist|404/i.test(`${e?.code || ''} ${e?.message || ''} ${e?.status || ''}`);
  const hayCuenta = () => !!window.auraLadraRed?.sesion?.()?.user;
  const MSG_NO = 'Los encuentros todavía no están disponibles: falta aplicar la actualización en el servidor.';

  let disponible = true;
  let confirmarCancelar = null;

  const aviso = $('[data-enc-aviso]');
  const botonNuevo = $('[data-enc-nuevo]');
  const pintarEstado = () => {
    if (!botonNuevo) return;
    botonNuevo.disabled = !disponible || !hayCuenta();
    aviso.textContent = !disponible ? MSG_NO : !hayCuenta() ? 'Inicia sesión para proponer un encuentro o confirmar asistencia.' : '';
  };

  // ---------- Fuente del calendario ----------
  const hora = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' });
  const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const ics = (r) => {
    const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (t) => String(t || '').replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
    const fin = r.termina_en || new Date(new Date(r.inicia_en).getTime() + 3600000).toISOString();
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AuraLadra//Encuentros//ES', 'BEGIN:VEVENT', `UID:${r.id}@auraladra`, `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(r.inicia_en)}`, `DTEND:${f(fin)}`, `SUMMARY:${esc(r.titulo)}`, `LOCATION:${esc(r.lugar_texto || window.auraLadraMapa?.lugar?.(r.lugar_id)?.nombre)}`,
      `DESCRIPTION:${esc(r.descripcion)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  };
  const descargar = (r) => {
    const url = URL.createObjectURL(new Blob([ics(r)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'encuentro.ics';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const responder = async (r, estado, personas = 1, animales = []) => {
    const { error } = await db.rpc('responder_encuentro', { p_id: r.id, p_estado: estado, p_personas: personas, p_animales: animales });
    return error;
  };

  const comoEvento = (r) => {
    const lugar = window.auraLadraMapa?.lugar?.(r.lugar_id);
    const cancelado = r.estado === 'cancelado';
    const nota = [];
    nota.push(r.visibilidad === 'publico' ? 'Público' : 'Privado: solo participantes invitados');
    if (!cancelado) nota.push(`${cuenta(Number(r.personas_confirmadas), 'persona confirmada', 'personas confirmadas')} · ${cuenta(Number(r.animales_confirmados), 'mascota', 'mascotas')}`);
    if (r.mi_estado === 'confirmado') nota.push('Tú confirmaste asistencia');
    if (r.mi_estado === 'rechazado') nota.push('Dijiste que no asistirás');
    if (r.mi_estado === 'invitado') nota.push('Estás invitada o invitado');
    const detalle = [TIPOS[r.tipo], r.descripcion, r.condiciones && `Condiciones: ${r.condiciones}`, r.necesidades_animal && `Necesidades del animal (no garantiza compatibilidad ni seguridad): ${r.necesidades_animal}`].filter(Boolean).join(' · ');
    const acciones = [];
    if (r.lugar_id && window.auraLadraMapa?.lugar?.(r.lugar_id)) {
      acciones.push({ txt: 'Ver en el mapa', fn: () => { window.auraLadraEventos.verMapa(); setTimeout(() => window.auraLadraMapa.enfocar(r.lugar_id, r.titulo), 450); } });
    }
    acciones.push({ txt: 'Guardar en calendario', fn: () => descargar(r) });
    if (!cancelado && hayCuenta()) {
      if (r.soy_organizador) {
        acciones.push({ txt: 'Invitar amistades', fn: () => abrirInvitar(r) });
        acciones.push({ txt: 'Editar', fn: () => abrirEditar(r) });
        acciones.push({ txt: confirmarCancelar === r.id ? 'Sí, cancelar encuentro' : 'Cancelar encuentro', cls: 'cal-link cal-eliminar', fn: async () => {
          if (confirmarCancelar !== r.id) { confirmarCancelar = r.id; window.auraLadraEventos.refrescar(); return; }
          confirmarCancelar = null;
          const { error } = await db.rpc('cancelar_encuentro', { p_id: r.id, p_motivo: null });
          aviso.textContent = error ? (error.message || 'No pudimos cancelar el encuentro.') : '';
          window.auraLadraEventos.refrescar();
        } });
      } else {
        acciones.push({ txt: r.mi_estado === 'confirmado' ? 'Cambiar asistencia' : 'Confirmar asistencia', fn: () => abrirRespuesta(r) });
        if (r.mi_estado !== 'rechazado') acciones.push({ txt: 'No asistiré', fn: async () => { const e = await responder(r, 'rechazado'); aviso.textContent = e ? (e.message || 'No pudimos guardar tu respuesta.') : ''; window.auraLadraEventos.refrescar(); } });
      }
    }
    return {
      id: `en-${r.id}`, tipo: 'encuentro', titulo: `${cancelado ? 'Cancelado: ' : ''}${r.titulo}`, fecha: new Date(r.inicia_en), conHora: true,
      lugar: r.lugar_texto || lugar?.nombre || '', detalle, nota: nota.join(' · '), acciones,
    };
  };

  window.auraLadraEventos.fuente(async (desde, hasta) => {
    if (!db) { disponible = false; pintarEstado(); return []; }
    const { data, error } = await db.rpc('encuentros_visibles', { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });
    if (error) { if (faltaBackend(error)) disponible = false; pintarEstado(); return []; }
    disponible = true; pintarEstado();
    return (data || []).map(comoEvento);
  });

  // ---------- Confirmar asistencia ----------
  const dlgR = $('[data-enc-resp-dialog]'); const formR = $('[data-enc-resp-form]'); const msgR = $('[data-enc-resp-message]');
  let actual = null;
  function abrirRespuesta(r) {
    actual = r; formR.reset(); msgR.textContent = '';
    $('[data-enc-resp-resumen]').textContent = r.titulo;
    const caja = $('[data-enc-resp-mascotas]');
    caja.replaceChildren(el('legend', null, 'Mascotas que llevas'));
    const propias = (window.auraLadraRed?.propias?.() || []).filter((a) => !a.es_conmemorativa);
    if (!propias.length) caja.append(el('p', 'cal-demo', 'No tienes mascotas con ficha propia para llevar.'));
    propias.forEach((a) => {
      const l = el('label', 'tarea-op'); const i = document.createElement('input'); i.type = 'checkbox'; i.value = a.id; i.name = 'animal';
      l.append(i, document.createTextNode(' '), el('span', null, a.nombre)); caja.append(l);
    });
    dlgR.showModal?.() ?? dlgR.setAttribute('open', '');
  }
  $('[data-enc-resp-close]')?.addEventListener('click', () => dlgR.close());
  formR?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!actual) return;
    const animales = [...formR.querySelectorAll('input[name="animal"]:checked')].map((i) => i.value);
    const personas = Math.min(10, Math.max(1, Number(formR.elements.personas.value) || 1));
    msgR.textContent = 'Guardando…';
    const error = await responder(actual, 'confirmado', personas, animales);
    if (error) { msgR.textContent = faltaBackend(error) ? MSG_NO : (error.message || 'No pudimos guardar tu respuesta.'); return; }
    dlgR.close(); window.auraLadraEventos.refrescar();
  });

  // ---------- Invitar amistades ----------
  const dlgI = $('[data-enc-inv-dialog]'); const formI = $('[data-enc-inv-form]'); const msgI = $('[data-enc-inv-message]');
  let invitando = null;
  async function abrirInvitar(r) {
    invitando = r; msgI.textContent = '';
    $('[data-enc-inv-resumen]').textContent = r.titulo;
    const caja = $('[data-enc-inv-lista]');
    caja.replaceChildren(el('legend', null, 'Tus amistades'), el('p', 'cal-demo', 'Cargando…'));
    dlgI.showModal?.() ?? dlgI.setAttribute('open', '');
    const yo = window.auraLadraRed?.sesion?.()?.user?.id;
    try {
      const { data: am, error } = await db.schema('core').from('amistades').select('usuario_menor,usuario_mayor');
      if (error) throw error;
      const ids = (am || []).map((a) => (a.usuario_menor === yo ? a.usuario_mayor : a.usuario_menor));
      let perfiles = [];
      if (ids.length) { const res = await db.schema('core').from('perfiles').select('id,alias').in('id', ids); if (res.error) throw res.error; perfiles = res.data || []; }
      caja.replaceChildren(el('legend', null, 'Tus amistades'));
      if (!perfiles.length) { caja.append(el('p', 'cal-demo', 'Aún no tienes amistades aceptadas para invitar. Solo se puede invitar a amistades.')); return; }
      perfiles.forEach((p) => { const l = el('label', 'tarea-op'); const i = document.createElement('input'); i.type = 'checkbox'; i.value = p.id; i.name = 'amigo'; l.append(i, document.createTextNode(' '), el('span', null, p.alias)); caja.append(l); });
    } catch {
      caja.replaceChildren(el('legend', null, 'Tus amistades'), el('p', 'cal-demo', 'No pudimos cargar tus amistades. Intenta de nuevo más tarde.'));
    }
  }
  $('[data-enc-inv-close]')?.addEventListener('click', () => dlgI.close());
  formI?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ids = [...formI.querySelectorAll('input[name="amigo"]:checked')].map((i) => i.value);
    if (!ids.length) { msgI.textContent = 'Elige al menos una amistad.'; return; }
    msgI.textContent = 'Enviando…';
    const { data, error } = await db.rpc('invitar_a_encuentro', { p_id: invitando.id, p_usuarios: ids });
    if (error) { msgI.textContent = faltaBackend(error) ? MSG_NO : (error.message || 'No pudimos enviar las invitaciones.'); return; }
    dlgI.close();
    aviso.textContent = Number(data) ? `Invitaste a ${cuenta(Number(data), 'amistad', 'amistades')}.` : 'Esas amistades ya estaban invitadas.';
    window.auraLadraEventos.refrescar();
  });

  // ---------- Proponer ----------
  const dlg = $('[data-enc-dialog]'); const form = $('[data-enc-form]'); const msg = $('[data-enc-message]');
  let editando = null;
  const modo = (edicion) => {
    editando = edicion;
    $('[data-enc-titulo]').textContent = edicion ? 'Editar encuentro' : 'Proponer un encuentro';
    $('[data-enc-enviar]').textContent = edicion ? 'Guardar cambios' : 'Proponer encuentro';
    ['tipo', 'lugar', 'visibilidad'].forEach((n) => { form.elements[n].disabled = !!edicion; });
  };
  const aHora = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function abrirEditar(r) {
    modo(r); form.reset(); msg.textContent = '';
    const f = form.elements; const d = new Date(r.inicia_en);
    f.titulo.value = r.titulo; f.fecha.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    f.hora.value = aHora(r.inicia_en); f.termino.value = r.termina_en ? aHora(r.termina_en) : '';
    f.lugar_texto.value = r.lugar_texto || ''; f.descripcion.value = r.descripcion || ''; f.condiciones.value = r.condiciones || ''; f.necesidades.value = r.necesidades_animal || '';
    dlg.showModal?.() ?? dlg.setAttribute('open', '');
  }
  botonNuevo?.addEventListener('click', () => {
    modo(null);
    form.reset(); msg.textContent = '';
    const sel = $('[data-enc-lugares]');
    sel.replaceChildren(el('option', null, 'Otro punto de encuentro (lo escribo)'));
    sel.firstChild.value = '';
    (window.auraLadraMapa?.lugares?.() || []).forEach((l) => { const o = el('option', null, l.nombre); o.value = l.id; sel.append(o); });
    const hoy = new Date(); hoy.setDate(hoy.getDate() + 1);
    form.elements.fecha.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    dlg.showModal?.() ?? dlg.setAttribute('open', '');
  });
  $('[data-enc-close]')?.addEventListener('click', () => dlg.close());
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = form.elements;
    const titulo = f.titulo.value.trim();
    if (titulo.length < 3) { msg.textContent = 'Escribe un título de al menos 3 letras.'; return; }
    if (!f.fecha.value || !f.hora.value) { msg.textContent = 'Elige fecha y hora de inicio.'; return; }
    if (!editando && !f.lugar.value && !f.lugar_texto.value.trim()) { msg.textContent = 'Elige un lugar o escribe el punto de encuentro.'; return; }
    const inicia = new Date(`${f.fecha.value}T${f.hora.value}`);
    const termina = f.termino.value ? new Date(`${f.fecha.value}T${f.termino.value}`) : null;
    if (termina && termina <= inicia) { msg.textContent = 'La hora de término debe ser después del inicio.'; return; }
    msg.textContent = 'Guardando…';
    if (editando) {
      const { error: errE } = await db.rpc('actualizar_encuentro', { p_id: editando.id, p_titulo: titulo, p_descripcion: f.descripcion.value.trim() || null, p_condiciones: f.condiciones.value.trim() || null, p_necesidades_animal: f.necesidades.value.trim() || null, p_inicia_en: inicia.toISOString(), p_termina_en: termina ? termina.toISOString() : null, p_lugar_texto: f.lugar_texto.value.trim() || null });
      if (errE) { msg.textContent = faltaBackend(errE) ? MSG_NO : (errE.message || 'No pudimos guardar los cambios.'); return; }
      window.auraLadraEventos.elegirDia(f.fecha.value); dlg.close(); window.auraLadraEventos.refrescar(); return;
    }
    const { error } = await db.rpc('crear_encuentro', {
      p_tipo: f.tipo.value, p_titulo: titulo, p_inicia_en: inicia.toISOString(), p_termina_en: termina ? termina.toISOString() : null,
      p_lugar_id: f.lugar.value || null, p_lugar_texto: f.lugar_texto.value.trim() || null, p_visibilidad: f.visibilidad.value,
      p_descripcion: f.descripcion.value.trim() || null, p_condiciones: f.condiciones.value.trim() || null, p_necesidades_animal: f.necesidades.value.trim() || null,
    });
    if (error) { msg.textContent = faltaBackend(error) ? MSG_NO : (error.message || 'No pudimos crear el encuentro.'); if (faltaBackend(error)) { disponible = false; pintarEstado(); } return; }
    window.auraLadraEventos.elegirDia(f.fecha.value);
    dlg.close(); window.auraLadraEventos.refrescar();
  });

  document.addEventListener('red:cambio', pintarEstado);
  pintarEstado();
})();

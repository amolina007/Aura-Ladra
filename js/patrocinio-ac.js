// Campañas reales en AC. La identidad, los saldos y los permisos se validan en Postgres.
(() => {
  'use strict';
  const db = window.auraLadraDb;
  if (!db) return;
  const fmt = new Intl.NumberFormat('es-CL');
  const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const estados = { recaudando: 'Financiamiento abierto', meta_alcanzada: 'Meta alcanzada', completada: 'Completada', expirada: 'Plazo terminado', cancelada: 'Cancelada' };
  const wallet = (() => { try { return `${new URL(document.querySelector('script[src*="aura-hub.js"]').src).origin}/wallet`; } catch { return 'https://convergenciaaura.cl/wallet'; } })();
  const rpc = async (nombre, args) => { const r = await db.rpc(nombre, args); if (r.error) throw r.error; return r.data; };
  const errorTexto = (e) => /PGRST20[25]|schema cache|Could not find the function/i.test(`${e?.code} ${e?.message}`)
    ? 'El patrocinio en AC aún no está activado en el servidor.'
    : String(e?.message || 'No pudimos confirmar la operación. Puedes reintentar con la misma confirmación.').replace(/^[A-Z_]+:\s*/, '');
  const guardado = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  let actual = null;
  let peticion = 0;
  const vigente = (s) => actual === s && s.caja.isConnected && !s.caja.closest('.vista-oculta');
  const claveAlmacen = (s) => `ladra.patrocinio.pendiente:${s.usuario}:${s.id}`;
  const pendiente = (s, valor) => { s.pendiente = valor; try { if (valor) sessionStorage.setItem(claveAlmacen(s), JSON.stringify(valor)); else sessionStorage.removeItem(claveAlmacen(s)); } catch { /* la clave en memoria protege el reintento en esta página */ } };

  const render = (s) => {
    if (!s.caja.isConnected || actual !== s) return;
    const d = s.datos;
    if (!d) { s.caja.innerHTML = `<p role="status">${esc(s.mensaje || 'Consultando patrocinio en AC…')}</p><button type="button" class="button-borde" data-ac-recargar>Volver a consultar</button>`; return; }
    if (!d.habilitado) { s.caja.innerHTML = '<p>Esta propuesta todavía no recibe patrocinios en AC.</p>'; return; }
    const falta = Math.max(0, d.meta_ac - d.recaudado_ac);
    const pct = Math.min(100, Math.round(d.recaudado_ac / d.meta_ac * 100));
    const disponible = Number(s.saldo?.disponible) || 0;
    const monto = s.pendiente?.monto ?? s.monto;
    const operable = d.estado === 'recaudando' && !d.soy_responsable && s.saldo?.operaciones_habilitadas && s.saldo?.terminos?.aceptada;
    let aporte = '';
    if (!s.usuario) aporte = '<a class="button-verde" href="#cuenta">Inicia sesión para patrocinar</a>';
    else if (s.pendiente || (s.revisar && operable)) aporte = `<div class="ac-confirmacion"><h4>Revisa tu patrocinio</h4><p>Reservarás <strong>${fmt.format(monto)} AC</strong> de tu saldo disponible para esta campaña.</p><p>No se entregan todavía al responsable. Se liberan por hitos aprobados; si vence el plazo se devuelve lo no liberado.</p>${s.pendiente ? '<p>Hay una confirmación pendiente. Reintentar usa la misma clave y no duplica el aporte.</p>' : ''}<button type="button" class="button-verde" data-ac-confirmar ${s.ocupado ? 'disabled' : ''}>${s.ocupado ? 'Confirmando…' : s.pendiente ? 'Reintentar confirmación' : `Confirmar reserva de ${fmt.format(monto)} AC`}</button>${!s.pendiente ? '<button type="button" class="button-borde" data-ac-cambiar>Cambiar monto</button>' : ''}</div>`;
    else if (d.soy_responsable) aporte = '<p>Eres responsable de esta campaña. Los patrocinios los realizan otras personas.</p>';
    else if (d.estado !== 'recaudando') aporte = '<p>Esta campaña ya no recibe aportes.</p>';
    else if (!s.saldo) aporte = '<p>No pudimos consultar tu saldo. Vuelve a consultar antes de aportar.</p>';
    else if (!s.saldo.operaciones_habilitadas) aporte = '<p>Las operaciones de AC están pausadas.</p>';
    else if (!s.saldo.terminos?.aceptada) aporte = `<p>Revisa los términos de AC en tu billetera antes de patrocinar.</p><a class="button-borde" href="${esc(wallet)}" target="_blank" rel="noopener noreferrer">Abrir billetera</a>`;
    else aporte = `<form data-ac-monto><label>Tu aporte en AC<input type="number" name="monto" min="1" max="${Math.min(falta, disponible)}" step="1" inputmode="numeric" value="${s.monto || ''}" required ${disponible < 1 ? 'disabled' : ''}></label><p><small>Disponible: ${fmt.format(disponible)} AC · Faltan ${fmt.format(falta)} AC</small></p><button class="button-verde" type="submit" ${disponible < 1 ? 'disabled' : ''}>Revisar patrocinio</button>${disponible < 1 ? `<a href="${esc(wallet)}" target="_blank" rel="noopener noreferrer">Ver mi billetera</a>` : ''}</form>`;
    const hitos = d.hitos.map((h) => `<article class="ac-hito"><strong>${esc(h.titulo)}</strong><p>${fmt.format(h.monto_ac)} AC · ${esc({en_revision:'En revisión',aprobado:'Aprobado',rechazado:'Rechazado'}[h.estado] || h.estado)}</p><a href="${esc(h.evidencia_url)}" target="_blank" rel="noopener noreferrer">Ver evidencia</a>${h.resolucion ? `<p>${esc(h.resolucion)}</p>` : ''}${d.puedo_moderar && h.estado === 'en_revision' && d.estado === 'meta_alcanzada' ? `<form data-ac-revision="${esc(h.id)}"><label>Resolución<textarea name="resolucion" minlength="10" maxlength="600" required></textarea></label><label class="ac-check"><input type="checkbox" name="evidencia"> Revisé la evidencia y los permisos del puesto. Al aprobar se entregarán ${fmt.format(h.monto_ac)} AC al responsable.</label><button class="button-verde" name="decision" value="aprobar" ${s.ocupado ? 'disabled' : ''}>Aprobar y liberar ${fmt.format(h.monto_ac)} AC</button><button class="button-borde" name="decision" value="rechazar" ${s.ocupado ? 'disabled' : ''}>Rechazar hito</button></form>` : ''}</article>`).join('');
    const proponer = d.soy_responsable && d.estado === 'meta_alcanzada' ? `<details><summary>Solicitar liberación por un hito</summary><form data-ac-hito><label>Avance realizado<input name="titulo" minlength="8" maxlength="120" required></label><label>Enlace público a la evidencia<input name="evidencia" type="url" placeholder="https://…" maxlength="1000" required></label><small>Comparte solo evidencia del trabajo, sin datos privados.</small><label>AC a solicitar<input name="monto" type="number" min="1" max="${d.reservado_ac}" step="1" required></label><button class="button-verde" type="submit" ${s.ocupado ? 'disabled' : ''}>Enviar hito a revisión</button></form></details>` : '';
    s.caja.innerHTML = `<p class="ac-estado">${esc(estados[d.estado] || d.estado)}</p><p class="pz-cifra"><span><strong>${fmt.format(d.recaudado_ac)}</strong> / ${fmt.format(d.meta_ac)} AC</span><em>${pct}%</em></p><div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Patrocinio de la campaña"><span data-ac-ancho></span></div><dl class="ac-resumen"><div><dt>Reservadas</dt><dd>${fmt.format(d.reservado_ac)} AC</dd></div><div><dt>Entregadas por hitos</dt><dd>${fmt.format(d.liberado_ac)} AC</dd></div><div><dt>Devueltas</dt><dd>${fmt.format(d.devuelto_ac)} AC</dd></div>${s.usuario ? `<div><dt>Mi patrocinio</dt><dd>${fmt.format(d.mi_aporte_ac)} AC</dd></div>` : ''}</dl>${d.entrega_hasta ? `<p><small>Entrega hasta ${esc(new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeZone:'America/Santiago'}).format(new Date(d.entrega_hasta)))}</small></p>` : ''}${d.devolucion_pendiente ? '<p>La devolución del saldo restante está pendiente de procesamiento automático.</p>' : ''}<p role="status" class="ayudar-msg">${esc(s.mensaje)}</p>${aporte}<button type="button" class="ac-actualizar" data-ac-recargar ${s.ocupado ? 'disabled' : ''}>Actualizar saldo y campaña</button>${proponer}${hitos ? `<details open><summary>Hitos y evidencia</summary>${hitos}</details>` : ''}`;
    s.caja.querySelector('[data-ac-ancho]').style.width = `${pct}%`;
  };

  const cargar = async (s) => {
    const request = ++peticion;
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      s.usuario = data.session?.user?.id || null;
      const [estado, saldo] = await Promise.all([rpc('estado_patrocinio_ac', {p_aviso:s.id}), s.usuario ? rpc('saldo_patrocinio_ac').catch(() => null) : null]);
      if (request !== peticion || actual !== s) return;
      s.datos = estado; s.saldo = saldo;
      document.dispatchEvent(new CustomEvent('puestos:patrocinio', {detail:{id:s.id,estado}}));
      const intento = s.usuario ? guardado(claveAlmacen(s)) : null;
      if (intento && Number.isSafeInteger(intento.monto) && /^[0-9a-f-]{36}$/i.test(intento.clave)) s.pendiente = intento;
      else s.pendiente = null;
      render(s);
    } catch (e) { if (request === peticion && actual === s) { s.datos = null; s.mensaje = errorTexto(e); render(s); } }
  };
  document.addEventListener('puestos:campana', (e) => {
    const caja = document.querySelector('[data-patrocinio-ac]');
    if (!caja) return;
    const s = { id:e.detail.id, caja, datos:null, saldo:null, usuario:null, monto:null, revisar:false, pendiente:null, ocupado:false, mensaje:'' };
    actual = s; cargar(s);
  });
  db.auth.onAuthStateChange(() => { const s = actual; if (!s?.caja.isConnected) return; s.datos = null; s.saldo = null; s.revisar = false; s.pendiente = null; s.mensaje = ''; render(s); setTimeout(() => cargar(s),0); });

  document.addEventListener('click', async (e) => {
    const s = actual;
    if (!s || !s.caja.contains(e.target)) return;
    if (e.target.closest('[data-ac-recargar]')) { if (!s.ocupado) await cargar(s); return; }
    if (e.target.closest('[data-ac-cambiar]')) { s.revisar = false; render(s); return; }
    if (!e.target.closest('[data-ac-confirmar]') || s.ocupado || !s.usuario) return;
    if (!s.pendiente) pendiente(s, {monto:s.monto,clave:crypto.randomUUID()});
    s.ocupado = true; s.mensaje = ''; render(s);
    try {
      await rpc('patrocinar_campana_ac', {p_aviso:s.id,p_monto:s.pendiente.monto,p_clave:s.pendiente.clave});
      pendiente(s, null); s.monto = null; s.revisar = false; s.mensaje = 'Patrocinio confirmado. Tus AC quedaron reservadas para la campaña.';
      document.dispatchEvent(new CustomEvent('aura:wallet-cambio'));
      await cargar(s);
    } catch (err) {
      // Un rechazo SQL confirma rollback. Un corte de red no confirma el resultado:
      // en ese caso se conserva la clave y solo se permite reintentar el mismo aporte.
      if (/^(P[0-9A-Z]{4}|AC[0-9]{3}|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501|28000)$/.test(err?.code || '')) { pendiente(s, null); s.revisar = false; }
      s.mensaje = errorTexto(err);
    }
    finally { s.ocupado = false; render(s); }
  });
  document.addEventListener('submit', async (e) => {
    const s = actual;
    if (!s || !s.caja.contains(e.target)) return;
    const f = e.target;
    if (!f.matches('[data-ac-monto],[data-ac-hito],[data-ac-revision]')) return;
    e.preventDefault();
    if (s.ocupado || !vigente(s)) return;
    const fields = new FormData(f);
    if (f.matches('[data-ac-monto]')) {
      const monto = Number(fields.get('monto'));
      if (!Number.isSafeInteger(monto) || monto<1 || monto>s.saldo.disponible || monto>s.datos.meta_ac-s.datos.recaudado_ac) { s.mensaje = 'Revisa el monto: debe ser entero y no superar tu saldo ni lo que falta.'; render(s); return; }
      s.monto = monto; s.revisar = true; s.mensaje = ''; render(s); return;
    }
    let nombre, args;
    let completado = false;
    if (f.matches('[data-ac-hito]')) {
      const evidencia = String(fields.get('evidencia') || '');
      try { if (new URL(evidencia).protocol !== 'https:') throw Error(); } catch { s.mensaje = 'La evidencia debe ser un enlace HTTPS.'; render(s); return; }
      // Conservar la clave en el formulario si una respuesta se pierde.
      f.dataset.clave ||= crypto.randomUUID();
      nombre = 'proponer_hito_patrocinio_ac'; args = {p_aviso:s.id,p_titulo:fields.get('titulo'),p_evidencia:evidencia,p_monto:Number(fields.get('monto')),p_clave:f.dataset.clave};
    } else {
      if (!['aprobar','rechazar'].includes(e.submitter?.value)) return;
      const aprobar = e.submitter.value === 'aprobar';
      if (aprobar && !fields.get('evidencia')) { s.mensaje = 'Confirma que revisaste la evidencia y los permisos antes de liberar AC.'; s.caja.querySelector('[role="status"]').textContent = s.mensaje; return; }
      nombre = 'revisar_hito_patrocinio_ac'; args = {p_hito:f.dataset.acRevision,p_aprobar:aprobar,p_resolucion:fields.get('resolucion')};
    }
    s.ocupado = true; f.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await rpc(nombre,args); completado = true; s.mensaje = nombre === 'proponer_hito_patrocinio_ac' ? 'Hito enviado a moderación. Todavía no se liberaron AC.' : args.p_aprobar ? 'Hito aprobado y AC entregadas al responsable.' : 'Hito rechazado. Las AC siguen reservadas.'; await cargar(s); }
    catch (err) { s.mensaje = errorTexto(err); const msg = s.caja.querySelector('[role="status"]'); if (msg) msg.textContent = s.mensaje; }
    finally { s.ocupado = false; if (completado) render(s); else f.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  });
})();

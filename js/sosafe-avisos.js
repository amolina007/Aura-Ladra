/* Avisos públicos independientes de cuentas y mascotas registradas en Ladra. */
(() => {
  const root = document.querySelector('[data-sosafe-avisos]');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const display = value => String(value ?? '').replace(/\bsosafe\b/gi, 'la fuente original');
  const lossDate = info => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(info?.fecha || '')) return '';
    const day = info.fecha.split('-').reverse().join('/');
    return `Extravío: ${day} · ${info.precision === 'indicada' ? 'fecha indicada en el aviso' : info.criterio === 'referencia relativa del aviso' ? 'estimada según el aviso' : 'estimada por la primera publicación'}${info.requiere_revision ? ' · fechas contradictorias por revisar' : ''}`;
  };
  const date = value => new Date(value).toLocaleString('es-CL', {timeZone: 'America/Santiago'});
  const types = {perdida:'Mascota perdida · la están buscando', encontrada:'Mascota encontrada o avistada · buscan a su familia', por_confirmar:'Tipo de aviso por confirmar', reencuentro:'Reencuentro informado', fallecida:'Mascota fallecida · aviso a su familia'};
  const typeLabel = row => row.estado_mascota === 'fallecida' ? 'Mascota encontrada · fallecida · aviso a su familia' : types[row.tipo_aviso] || types.por_confirmar;
  const noticeDate = row => row.tipo_aviso === 'perdida' ? lossDate(row.fecha_extravio_info) : `Fecha del aviso: ${date(row.publicado_en)}`;
  fetch('data/sosafe-maipu.json', {cache: 'no-cache'}).then(r => {
    if (!r.ok) throw Error('No disponible');
    return r.json();
  }).then(data => {
    const rows = data.avisos.filter(r => {
      const age = Date.now() - Date.parse(r.publicado_en);
      return r.tipo_aviso !== 'reencuentro' && /^data\/sosafe-fotos\/[a-f0-9]+\.(?:jpg|png)$/.test(r.foto_mascota || '') && Number.isFinite(age) && age >= 0 && age <= 30 * 86400000;
    });
    const contactDialog = document.createElement('dialog');
    contactDialog.className = 'pet-contact-dialog';
    contactDialog.setAttribute('aria-label', 'Contactar por la mascota');
    document.body.append(contactDialog);
    const contactar = id => {
      const row = rows.find(row => row.id === id);
      if (!row) return;
      const phones = (row.celulares || []).filter(p => /^\+569\d{8}$/.test(p));
      const reading = row.lectura_foto || {};
      const ocr = (reading.celulares || []).filter(p => /^\+569\d{8}$/.test(p) && !phones.includes(p));
      const names = (reading.nombres || []).filter(n => /contacto|responsable|dueñ/i.test(n.etiqueta || ''));
      contactDialog.innerHTML = `<h3>${esc(row.nombre_mascota || 'Mascota sin nombre informado')}</h3>
        ${row.autor_publicacion ? `<p>Publicado por: <strong>${esc(row.autor_publicacion)}</strong></p>` : ''}
        ${names.map(n => `<p>${esc(n.etiqueta)}: ${esc(n.nombre)} <small>· leído del afiche, sin verificar</small></p>`).join('')}
        ${!names.length ? '<p>Nombre de la persona de contacto no informado.</p>' : ''}
        ${phones.map(phone => `<p><a class="pet-call" href="tel:${esc(phone)}">Llamar al ${esc(phone)}</a></p>`).join('')}
        ${ocr.length ? `<p>Teléfonos leídos del afiche · sin verificar</p>${ocr.map(phone => `<p>${esc(phone)}</p>`).join('')}` : ''}
        ${!phones.length && !ocr.length ? '<p>Este aviso no tiene teléfono disponible.</p>' : ''}
        <form method="dialog"><button class="button button-dark">Cerrar</button></form>`;
      contactDialog.showModal();
    };
    window.auraLadraSosafe = { contactar, lugares: () => rows.filter(r => Number.isFinite(r.ubicacion_reporte?.lat) && Number.isFinite(r.ubicacion_reporte?.lng) && r.ubicacion_reporte.lat >= -33.65 && r.ubicacion_reporte.lat <= -33.45 && r.ubicacion_reporte.lng >= -70.95 && r.ubicacion_reporte.lng <= -70.70).map(r => ({
      id: 'sosafe-' + r.id, nombre: (r.nombre_mascota || 'Mascota') + ' · ' + typeLabel(r), categoria: r.tipo_aviso === 'perdida' ? 'mascota_perdida' : r.tipo_aviso === 'encontrada' ? 'mascota_encontrada' : 'mascota_sin_clasificar', origen: 'sosafe',
      antiguedad_texto: window.auraLadraAntiguedad?.(r) || '', tipo_aviso: r.tipo_aviso, tipo_aviso_texto: typeLabel(r), fecha_extravio_texto: noticeDate(r), descripcion: display(r.descripcion), comuna: 'Maipú', direccion_publica: 'Ubicación aproximada del aviso externo',
      latitud: r.ubicacion_reporte.lat, longitud: r.ubicacion_reporte.lng, precision_ubicacion: 'aproximada',
      estado_verificacion: 'comunitario', fuente_nombre: 'Aviso externo · estado sin verificar', fuente_url: '',
      foto_mascota: r.foto_mascota, telefono_publico: r.celulares[0] || '',
    })) };
    document.dispatchEvent(new CustomEvent('sosafe:cambio'));
    document.querySelectorAll('[data-sosafe-acceso]').forEach(link => { link.textContent = `Ver ${rows.length} avisos externos en Most Wanted`; });
    const stale = Date.now() - Date.parse(data.actualizado_en) > 48 * 3600000;
    root.innerHTML = `<p>${rows.length} avisos · Última consulta: ${esc(date(data.actualizado_en))}${stale ? ' · Actualización pendiente' : ''}</p>
      <p>${esc(data.cobertura)} El autor puede ser un vecino, no necesariamente el dueño. El estado actual de cada mascota no está confirmado.</p>
      <div class="wanted-grid">${rows.map(row => {
        const photo = /^data\/sosafe-fotos\/[a-f0-9]+\.(?:jpg|png)$/.test(row.foto_mascota || '') ? row.foto_mascota : '';
        const reading = row.lectura_foto || {};
        const ocrPhones = (reading.celulares || []).filter(p => /^\+569\d{8}$/.test(p) && !row.celulares.includes(p));
        return `<article class="card sosafe-card has-pet-age"><span class="pet-age">${esc(window.auraLadraAntiguedad?.(row) || '')}</span><strong class="aviso-tipo" data-tipo="${esc(row.tipo_aviso || 'por_confirmar')}">${esc(typeLabel(row))}</strong><small>Aviso externo · estado sin verificar</small>
          <img src="${esc(photo)}" alt="Foto del aviso de mascota en ${esc(row.zona)}" loading="lazy" referrerpolicy="no-referrer">
          <h4>${esc(row.nombre_mascota || "Mascota sin nombre informado")}</h4>${Number.isFinite(row.ubicacion_reporte?.lat) && Number.isFinite(row.ubicacion_reporte?.lng) ? `<span class="pet-distance" hidden data-distance-lat="${row.ubicacion_reporte.lat}" data-distance-lng="${row.ubicacion_reporte.lng}"></span>` : ''}<p>${esc(row.zona)}</p>
          <p class="fecha-extravio">${esc(noticeDate(row))}</p>
          <button type="button" class="button button-dark pet-contact" data-contactar="${esc(row.id)}">Contactar</button>
          <details class="pet-details"><summary>Ver detalles</summary>
          <p>Publicado: ${esc(date(row.publicado_en))}</p>
          <p class="sosafe-description">${esc(display(row.descripcion))}</p>
          ${row.publicaciones?.length > 1 ? `<details class="avisos-reunidos"><summary>${row.publicaciones.length} publicaciones reunidas · ver antecedentes</summary>${row.publicaciones.map(p => {
            return `<section><p>Publicado: ${esc(date(p.publicado_en))}</p><p>${esc(display(p.descripcion))}</p></section>`;
          }).join('')}</details>` : ''}
          ${reading.estado === 'error' ? '<p>Lectura del afiche pendiente.</p>' : ''}
          </details>
        </article>`;
      }).join('') || '<p>No hay avisos disponibles para este período.</p>'}</div>`;
    root.querySelectorAll('[data-contactar]').forEach(button => button.addEventListener('click', () => contactar(button.dataset.contactar)));
    root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const fallback = document.createElement('p'); fallback.textContent = 'La foto no está disponible.'; img.replaceWith(fallback);
    }, {once: true}));
  }).catch(() => { root.textContent = 'No pudimos cargar los avisos externos. Recarga la página para reintentar.'; });
})();

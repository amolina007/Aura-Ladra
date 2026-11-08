/* Avisos públicos independientes de cuentas y mascotas registradas en Ladra. */
(() => {
  const root = document.querySelector('[data-sosafe-avisos]');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => new Date(value).toLocaleString('es-CL', {timeZone: 'America/Santiago'});
  const safe = (value, origin, prefix) => {
    try { const url = new URL(value); return url.origin === origin && url.pathname.startsWith(prefix) ? url.href : ''; }
    catch { return ''; }
  };
  fetch('data/sosafe-maipu.json', {cache: 'no-cache'}).then(r => {
    if (!r.ok) throw Error('No disponible');
    return r.json();
  }).then(data => {
    const rows = data.avisos.filter(r => {
      const age = Date.now() - Date.parse(r.publicado_en);
      return Number.isFinite(age) && age >= 0 && age <= 30 * 86400000;
    });
    window.auraLadraSosafe = { lugares: () => rows.filter(r => Number.isFinite(r.ubicacion_reporte?.lat) && Number.isFinite(r.ubicacion_reporte?.lng) && r.ubicacion_reporte.lat >= -33.65 && r.ubicacion_reporte.lat <= -33.45 && r.ubicacion_reporte.lng >= -70.95 && r.ubicacion_reporte.lng <= -70.70).map(r => ({
      id: 'sosafe-' + r.id, nombre: (r.nombre_mascota || 'Mascota') + ' · SOSAFE', categoria: 'aviso_sosafe',
      descripcion: r.descripcion, comuna: 'Maipú', direccion_publica: 'Ubicación aproximada del reporte de SOSAFE',
      latitud: r.ubicacion_reporte.lat, longitud: r.ubicacion_reporte.lng, precision_ubicacion: 'aproximada',
      estado_verificacion: 'comunitario', fuente_nombre: 'SOSAFE · estado sin verificar', fuente_url: r.fuente_url,
      foto_mascota: r.foto_mascota, telefono_publico: r.celulares[0] || '',
    })) };
    document.dispatchEvent(new CustomEvent('sosafe:cambio'));
    document.querySelectorAll('[data-sosafe-acceso]').forEach(link => { link.textContent = `Ver ${rows.length} avisos de SOSAFE en Most Wanted`; });
    const stale = Date.now() - Date.parse(data.actualizado_en) > 48 * 3600000;
    root.innerHTML = `<p>${rows.length} avisos · Última consulta: ${esc(date(data.actualizado_en))}${stale ? ' · Actualización pendiente' : ''}</p>
      <p>${esc(data.cobertura)} El autor puede ser un vecino, no necesariamente el dueño. El estado actual de cada mascota no está confirmado.</p>
      <div class="wanted-grid">${rows.map(row => {
        const original = safe(row.foto, 'https://api.sosafeapp.com', '/reports/');
        const photo = /^data\/sosafe-fotos\/[a-f0-9]+\.(?:jpg|png)$/.test(row.foto_mascota || '') ? row.foto_mascota : '';
        const reading = row.lectura_foto || {};
        const ocrPhones = (reading.celulares || []).filter(p => /^\+569\d{8}$/.test(p) && !row.celulares.includes(p));
        const source = safe(row.fuente_url, 'https://www.widgets.sosafeapp.com', '/report/');
        return `<article class="card sosafe-card"><small>Aviso externo · SOSAFE · estado sin verificar</small>
          ${photo ? `<img src="${esc(photo)}" alt="Foto del aviso de mascota en ${esc(row.zona)}" loading="lazy" referrerpolicy="no-referrer">` : (original ? '<p>No se pudo separar la mascota sin alterar la foto. Puedes ver el afiche original completo.</p>' : '<p>La fuente no entrega foto.</p>')}
          <h4>${esc(row.nombre_mascota || "Mascota")} · ${esc(row.zona)}</h4><p>Publicado: ${esc(date(row.publicado_en))}</p>
          <p class="sosafe-description">${esc(row.descripcion)}</p>
          ${row.autor_publicacion ? `<p>Publicado por: ${esc(row.autor_publicacion)}</p>` : ''}
          ${row.celulares.filter(p => /^\+569\d{8}$/.test(p)).map(p => `<p>Contacto del aviso: <a href="tel:${esc(p)}">${esc(p)}</a></p>`).join('')}
          ${(ocrPhones.length || reading.nombres?.length) ? `<div class="sosafe-ocr"><strong>Leído del afiche · revisar en el original</strong>${ocrPhones.map(p => `<p>Teléfono: ${esc(p)}</p>`).join('')}${(reading.nombres || []).map(n => `<p>${esc(n.etiqueta)}: ${esc(n.nombre)}</p>`).join('')}</div>` : ''}
          ${reading.estado === 'error' ? '<p>Lectura del afiche pendiente. Consulta el original.</p>' : ''}
          ${original ? `<p><a href="${esc(original)}" target="_blank" rel="noopener noreferrer">Ver afiche original completo</a></p>` : ''}
          ${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Ver aviso original</a>` : ''}
        </article>`;
      }).join('') || '<p>No hay avisos disponibles para este período.</p>'}</div>`;
    root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const fallback = document.createElement('p'); fallback.textContent = 'La foto no está disponible. Consulta el aviso original.'; img.replaceWith(fallback);
    }, {once: true}));
  }).catch(() => { root.textContent = 'No pudimos cargar los avisos de SOSAFE. Recarga la página para reintentar.'; });
})();

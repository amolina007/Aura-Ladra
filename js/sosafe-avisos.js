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
    const stale = Date.now() - Date.parse(data.actualizado_en) > 48 * 3600000;
    root.innerHTML = `<p>${rows.length} avisos · Última consulta: ${esc(date(data.actualizado_en))}${stale ? ' · Actualización pendiente' : ''}</p>
      <p>${esc(data.cobertura)} El autor puede ser un vecino, no necesariamente el dueño. El estado actual de cada mascota no está confirmado.</p>
      <div class="wanted-grid">${rows.map(row => {
        const photo = safe(row.foto, 'https://api.sosafeapp.com', '/reports/');
        const source = safe(row.fuente_url, 'https://www.widgets.sosafeapp.com', '/report/');
        return `<article class="card sosafe-card"><small>Aviso externo · SOSAFE · estado sin verificar</small>
          ${photo ? `<img src="${esc(photo)}" alt="Foto del aviso de mascota en ${esc(row.zona)}" loading="lazy" referrerpolicy="no-referrer">` : '<p>La fuente no entrega foto.</p>'}
          <h4>Mascota · ${esc(row.zona)}</h4><p>Publicado: ${esc(date(row.publicado_en))}</p>
          <p class="sosafe-description">${esc(row.descripcion)}</p>
          ${row.autor_publicacion ? `<p>Publicado por: ${esc(row.autor_publicacion)}</p>` : ''}
          ${row.celulares.filter(p => /^\+569\d{8}$/.test(p)).map(p => `<p>Contacto del aviso: <a href="tel:${esc(p)}">${esc(p)}</a></p>`).join('')}
          ${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Ver aviso original</a>` : ''}
        </article>`;
      }).join('') || '<p>No hay avisos disponibles para este período.</p>'}</div>`;
    root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const fallback = document.createElement('p'); fallback.textContent = 'La foto no está disponible. Consulta el aviso original.'; img.replaceWith(fallback);
    }, {once: true}));
  }).catch(() => { root.textContent = 'No pudimos cargar los avisos de SOSAFE. Recarga la página para reintentar.'; });
})();

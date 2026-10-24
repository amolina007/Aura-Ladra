// Catálogo inicial de Ladra. Las publicaciones se mantienen en data/tienda.json.
// Las consultas abren el perfil central del vendedor; este módulo no cobra ni mueve AC.
(() => {
  'use strict';
  const root = document.querySelector('[data-tienda]');
  const list = root?.querySelector('[data-tienda-lista]');
  const form = root?.querySelector('[data-tienda-busqueda]');
  const dialog = document.querySelector('[data-tienda-dialog]');
  const detail = dialog?.querySelector('[data-tienda-detalle]');
  if (!root || !list || !form || !dialog || !detail) return;
  const fmt = new Intl.NumberFormat('es-CL');
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const profile = (p) => `https://core.convergenciaaura.cl/perfil.html?u=${encodeURIComponent(p.vendedor.alias_core)}`;
  let products = [];
  let loading = false;
  let lastTrigger = null;
  let initialShopAnchor = window.location.hash === '#tienda';
  const settleShopAnchor = () => {
    const causes = document.querySelector('[data-puestos-resumen]');
    if (!initialShopAnchor || window.location.hash !== '#tienda' || !causes || causes.hidden) return;
    requestAnimationFrame(() => {
      if (initialShopAnchor && window.location.hash === '#tienda') root.scrollIntoView({block:'start',behavior:'instant'});
      initialShopAnchor = false;
    });
  };
  document.addEventListener('puestos:cambio', settleShopAnchor);
  document.addEventListener('pointerdown', () => { initialShopAnchor = false; }, {once:true,passive:true});
  document.addEventListener('wheel', () => { initialShopAnchor = false; }, {once:true,passive:true});

  const validate = (p) => p && /^[a-z0-9-]+$/.test(p.id) && typeof p.titulo === 'string' && typeof p.descripcion === 'string'
    && Number.isSafeInteger(p.precio_ac) && p.precio_ac > 0 && p.precio_ac <= 1000000000
    && typeof p.vendedor?.nombre === 'string' && /^[a-z0-9_]{3,24}$/.test(p.vendedor.alias_core)
    && /^assets\/[a-z0-9/_\-.]+\.(png|webp|jpe?g)$/.test(p.imagen)
    && Array.isArray(p.proyectos) && p.proyectos.includes('ladra') && Array.isArray(p.incluye);
  const card = (p) => `<article class="shop-card">
    <button type="button" class="shop-card-image" data-producto="${esc(p.id)}" aria-label="Ver publicación: ${esc(p.titulo)}"><img src="${esc(p.imagen)}" alt="${esc(p.imagen_alt)}" loading="lazy" width="1448" height="1086"><span class="shop-image-label">Imagen ilustrativa</span></button>
    <div class="shop-card-content"><span class="shop-project-tag">Ladra</span><h4><button type="button" data-producto="${esc(p.id)}">${esc(p.titulo)}</button></h4><p class="shop-price">${fmt.format(p.precio_ac)} <span>AC</span></p>
    <a class="shop-seller" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer"><span class="shop-avatar" aria-hidden="true">${esc(p.vendedor.nombre.slice(0,1))}</span><span><small>Publicado por</small><strong>${esc(p.vendedor.nombre)}</strong></span><span aria-hidden="true">↗</span></a>
    <button type="button" class="shop-primary" data-producto="${esc(p.id)}">Ver publicación <span aria-hidden="true">→</span></button></div>
  </article>`;
  const render = () => {
    const q = normalize(form.elements.q.value);
    const visible = products.filter(p => normalize(`${p.titulo} ${p.descripcion} ${p.vendedor.nombre}`).includes(q));
    root.querySelector('[data-tienda-cantidad]').textContent = `${visible.length} ${visible.length === 1 ? 'publicación' : 'publicaciones'}`;
    list.innerHTML = visible.length ? visible.map(card).join('') : `<p class="empty-state">${q ? 'No encontramos publicaciones con esa búsqueda.' : 'Todavía no hay publicaciones en la tienda.'}</p>`;
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('data/tienda.json?v=1');
      if (!response.ok) throw new Error('Catálogo no disponible');
      const data = await response.json();
      if (!Array.isArray(data.productos) || !data.productos.every(validate)) throw new Error('Publicaciones inválidas');
      products = data.productos;
      render();
      settleShopAnchor();
    } catch {
      root.querySelector('[data-tienda-cantidad]').textContent = '';
      list.innerHTML = '<div class="shop-load-error" role="status"><p>No pudimos cargar la tienda. Vuelve a intentarlo.</p><button class="shop-primary" type="button" data-tienda-reintentar>Reintentar</button></div>';
    } finally { loading = false; }
  };
  const open = (p, trigger) => {
    lastTrigger = trigger;
    detail.innerHTML = `<figure class="shop-detail-photo"><img src="${esc(p.imagen)}" alt="${esc(p.imagen_alt)}" width="1448" height="1086"><figcaption>${esc(p.nota_imagen)}</figcaption></figure>
      <div class="shop-detail-body"><span class="shop-project-tag">Relacionado con Ladra</span><h3 id="shop-product-title">${esc(p.titulo)}</h3><p class="shop-price">${fmt.format(p.precio_ac)} <span>AC</span></p>
      <a class="shop-seller" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer"><span class="shop-avatar" aria-hidden="true">${esc(p.vendedor.nombre.slice(0,1))}</span><span><small>Publicado por</small><strong>${esc(p.vendedor.nombre)}</strong></span><span aria-hidden="true">↗</span></a>
      <p>${esc(p.descripcion)}</p><section class="shop-includes" aria-label="Contenido de la publicación"><h4>Incluye</h4><ul>${p.incluye.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section><p class="shop-delivery">${esc(p.entrega)}</p><p class="shop-tag-note">La etiqueta Ladra indica el proyecto relacionado con esta publicación.</p>
      <a class="shop-primary shop-contact" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer">Consultar a ${esc(p.vendedor.nombre)} <span aria-hidden="true">↗</span></a></div>`;
    if (!dialog.open) dialog.showModal();
  };
  root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-producto]');
    if (button) { const p = products.find(p => p.id === button.dataset.producto); if (p) open(p, button); }
    if (e.target.closest('[data-tienda-reintentar]')) load();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-tienda-cerrar]')) dialog.close(); });
  dialog.addEventListener('close', () => { detail.replaceChildren(); lastTrigger?.focus({preventScroll:true}); });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('reset', () => setTimeout(render,0));
  // Los accesos a Causas/Tienda también sirven para salir del detalle de una acción.
  document.querySelector('.market-categories')?.addEventListener('click', () => {
    const causeDetail = document.querySelector('[data-ayudar-detalle]');
    if (causeDetail && !causeDetail.hidden) causeDetail.querySelector('[data-volver]')?.click();
  });
  document.addEventListener('vista:cambio', (e) => { if (e.detail?.vista !== 'ayudar' && dialog.open) dialog.close(); });
  load();
})();

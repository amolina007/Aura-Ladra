// Catálogo inicial de Ladra. Las publicaciones se mantienen en data/tienda.json.
// El pago se conecta con la transferencia central mediante js/tienda-transferencia.js.
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
  const sellerBox = root.querySelector('[data-tienda-vendedor]');
  const sellerAlias = new URLSearchParams(window.location.search).get('vendedor');
  const stock = p => Number.isSafeInteger(p.stock) ? `<span class="shop-stock${p.stock === 0 ? ' is-empty' : ''}">${p.stock === 0 ? 'Agotado' : `${p.stock} ${p.stock === 1 ? 'paquete disponible' : 'paquetes disponibles'}`}</span>` : '';
  const shopURL = alias => `?vendedor=${encodeURIComponent(alias)}#tienda`;
  let products = [];
  let loading = false;
  let lastTrigger = null;

  const validate = (p) => p && /^[a-z0-9-]+$/.test(p.id) && typeof p.titulo === 'string' && typeof p.descripcion === 'string'
    && (p.stock === undefined || (Number.isSafeInteger(p.stock) && p.stock >= 0))
    && Number.isSafeInteger(p.precio_ac) && p.precio_ac > 0 && p.precio_ac <= 1000000000
    && typeof p.vendedor?.nombre === 'string' && /^[a-z0-9_]{3,24}$/.test(p.vendedor.alias_core)
    && /^assets\/[a-z0-9/_\-.]+\.(png|webp|jpe?g)$/.test(p.imagen)
    && Array.isArray(p.proyectos) && p.proyectos.includes('ladra') && Array.isArray(p.incluye);
  const card = (p) => `<article class="shop-card">
    <button type="button" class="shop-card-image${p.imagen_tipo === 'catalogo' ? ' is-catalog' : ''}" data-producto="${esc(p.id)}" aria-label="Ver publicación: ${esc(p.titulo)}"><img src="${esc(p.imagen)}" alt="${esc(p.imagen_alt)}" loading="lazy" width="1448" height="1086"><span class="shop-image-label">${p.imagen_tipo === 'catalogo' ? 'Imagen referencial' : 'Imagen ilustrativa'}</span></button>
    <div class="shop-card-content"><div class="shop-card-labels"><span class="shop-project-tag">Ladra</span>${stock(p)}</div><h4><button type="button" data-producto="${esc(p.id)}">${esc(p.titulo)}</button></h4><p class="shop-price">${fmt.format(p.precio_ac)} <span>AC</span></p>
    <a class="shop-seller" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer"><span class="shop-avatar" aria-hidden="true">${esc(p.vendedor.nombre.slice(0,1))}</span><span><small>Publicado por</small><strong>${esc(p.vendedor.nombre)}</strong></span><span aria-hidden="true">↗</span></a>
    <button type="button" class="shop-primary" data-producto="${esc(p.id)}">Ver publicación <span aria-hidden="true">→</span></button></div>
  </article>`;
  const render = () => {
    const q = normalize(form.elements.q.value);
    const visible = products.filter(p => (!sellerAlias || p.vendedor.alias_core === sellerAlias) && normalize(`${p.titulo} ${p.descripcion} ${p.vendedor.nombre}`).includes(q));
    root.querySelector('[data-tienda-cantidad]').textContent = `${visible.length} ${visible.length === 1 ? 'publicación' : 'publicaciones'}`;
    list.innerHTML = visible.length ? visible.map(card).join('') : `<p class="empty-state">${q ? 'No encontramos publicaciones con esa búsqueda.' : 'Todavía no hay publicaciones en la tienda.'}</p>`;
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('data/tienda.json?v=snacks-2');
      if (!response.ok) throw new Error('Catálogo no disponible');
      const data = await response.json();
      if (!Array.isArray(data.productos) || !data.productos.every(validate)) throw new Error('Publicaciones inválidas');
      products = data.productos;
      if (sellerBox) {
        const seller = products.find(p => !sellerAlias || p.vendedor.alias_core === sellerAlias)?.vendedor;
        sellerBox.hidden = !seller;
        if (seller) sellerBox.innerHTML = `<div class="shop-storefront-top"><span class="shop-avatar" aria-hidden="true">${esc(seller.nombre.slice(0,1))}</span><div><h4>Tienda de ${esc(seller.nombre)}</h4><a href="${esc(shopURL(seller.alias_core))}">Ver tienda</a> · <a href="https://core.convergenciaaura.cl/perfil.html?u=${encodeURIComponent(seller.alias_core)}" target="_blank" rel="noopener noreferrer">Ver perfil ↗</a></div></div>${seller.entregas ? `<p class="shop-storefront-delivery">${esc(seller.entregas)}</p>` : ''}`;
      }
      render();
    } catch {
      root.querySelector('[data-tienda-cantidad]').textContent = '';
      list.innerHTML = '<div class="shop-load-error" role="status"><p>No pudimos cargar la tienda. Vuelve a intentarlo.</p><button class="shop-primary" type="button" data-tienda-reintentar>Reintentar</button></div>';
    } finally { loading = false; }
  };
  const open = (p, trigger) => {
    lastTrigger = trigger;
    detail.innerHTML = `<figure class="shop-detail-photo${p.imagen_tipo === 'catalogo' ? ' is-catalog' : ''}"><img src="${esc(p.imagen)}" alt="${esc(p.imagen_alt)}" width="1448" height="1086"><figcaption>${esc(p.nota_imagen)}</figcaption></figure>
      <div class="shop-detail-body"><span class="shop-project-tag">Relacionado con Ladra</span><h3 id="shop-product-title">${esc(p.titulo)}</h3><p class="shop-price">${fmt.format(p.precio_ac)} <span>AC</span></p>
      <a class="shop-seller" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer"><span class="shop-avatar" aria-hidden="true">${esc(p.vendedor.nombre.slice(0,1))}</span><span><small>Publicado por</small><strong>${esc(p.vendedor.nombre)}</strong></span><span aria-hidden="true">↗</span></a>
      ${stock(p)}<p>${esc(p.descripcion)}</p><section class="shop-includes" aria-label="Contenido de la publicación"><h4>Incluye</h4><ul>${p.incluye.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section><p class="shop-delivery">${esc(p.entrega)}</p><p class="shop-tag-note">La etiqueta Ladra indica el proyecto relacionado con esta publicación.</p>
      ${p.stock === 0 ? '<p class="shop-payment" role="status">Este producto está agotado. Consulta al vendedor por disponibilidad.</p>' : '<section class="shop-payment" data-compra-ac aria-label="Compra con AC"><p role="status">Consultando transferencia en AC…</p></section>'}
      <a class="shop-contact-link shop-contact" href="${esc(profile(p))}" target="_blank" rel="noopener noreferrer">Consultar a ${esc(p.vendedor.nombre)} <span aria-hidden="true">↗</span></a></div>`;
    if (!dialog.open) dialog.showModal();
    document.dispatchEvent(new CustomEvent('tienda:producto', {detail:{producto:p}}));
  };
  root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-producto]');
    if (button) { const p = products.find(p => p.id === button.dataset.producto); if (p) open(p, button); }
    if (e.target.closest('[data-tienda-reintentar]')) load();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-tienda-cerrar]')) dialog.close(); });
  dialog.addEventListener('close', () => { document.dispatchEvent(new CustomEvent('tienda:cerrar')); detail.replaceChildren(); if (!root.hidden) lastTrigger?.focus({preventScroll:true}); });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('reset', () => setTimeout(render,0));
  // Los accesos a Causas/Tienda también sirven para salir del detalle de una acción.
  document.querySelector('.market-categories')?.addEventListener('click', () => {
    const causeDetail = document.querySelector('[data-ayudar-detalle]');
    if (causeDetail && !causeDetail.hidden) causeDetail.querySelector('[data-volver]')?.click();
  });
  document.addEventListener('vista:cambio', (e) => { if (e.detail?.vista !== 'ayudar' && dialog.open) dialog.close(); });
  document.addEventListener('mercado:cambio', (e) => { if (e.detail.panel !== 'tienda' && dialog.open) dialog.close(); });
  load();
})();

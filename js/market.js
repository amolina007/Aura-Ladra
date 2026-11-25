// Market de Ladra: avisos entre usuarios, con consultas privadas y fotos protegidas.
(() => {
  'use strict';
  const root = document.querySelector('#market');
  const db = window.auraLadraDb;
  if (!root || !db) return;
  const $ = (s) => root.querySelector(s);
  const list = $('[data-market-list]');
  const status = $('[data-market-status]');
  const filters = $('[data-market-filters]');
  const mineBox = $('[data-market-mine]');
  const exploreBox = $('[data-market-explorar]');
  const publishDialog = document.querySelector('[data-market-publish-dialog]');
  const publishForm = publishDialog?.querySelector('[data-market-publish-form]');
  const publishMessage = publishForm?.querySelector('[data-market-publish-message]');
  const productDialog = document.querySelector('[data-market-product-dialog]');
  const detail = productDialog?.querySelector('[data-market-detalle]');
  const categories = { alimento:'Alimento', accesorios:'Accesorios', juguetes:'Juguetes', higiene:'Higiene', descanso:'Descanso', transporte:'Transporte', ropa:'Ropa', otros:'Otros' };
  const bucket = 'market-ladra';
  const money = new Intl.NumberFormat('es-CL');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const currentUser = () => db.auth.getUser().then(({data,error}) => { if (error) throw error; return data.user; });
  const message = (node, text, error = false) => { if (node) { node.textContent = text || ''; node.classList.toggle('is-error', error); } };
  let editingProduct = null;
  let products = [], ownProducts = [], consultations = [], active = null, busy = false, chosenPhoto = null, previewUrl = null;
  const available = p => p.estado === 'publicado';
  const price = p => Number(p.precio_clp) === 0 ? 'Gratis' : `$${money.format(Number(p.precio_clp))}`;
  const photoUrl = async (path) => {
    if (!path) return '';
    const {data,error} = await db.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  };
  const cleanPreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; };
  const updatePhotoPreview = () => {
    cleanPreview();
    const box = publishForm?.querySelector('[data-market-preview]');
    const img = publishForm?.querySelector('[data-market-preview-img]');
    if (!box || !img) return;
    if (!chosenPhoto) { box.hidden = true; img.removeAttribute('src'); return; }
    previewUrl = URL.createObjectURL(chosenPhoto); img.src = previewUrl; box.hidden = false;
  };
  const loginPrompt = () => '<p class="market-empty">Para explorar Market, <a href="#cuenta">inicia sesión en Ladra</a>.</p>';
  const card = async (p) => {
    let image = '';
    try { image = await photoUrl(p.foto_path); } catch { /* La ficha permanece visible aunque la imagen tenga un error temporal. */ }
    return `<article class="market-card">
      <button class="market-card-photo" type="button" data-market-product="${esc(p.id)}" aria-label="Ver ${esc(p.titulo)}"><img src="${esc(image)}" alt="${esc(p.titulo)}" loading="lazy"><span>${esc(p.condicion === 'nuevo' ? 'Nuevo' : 'Usado')}</span></button>
      <div class="market-card-body"><p class="market-card-category">${esc(categories[p.categoria] || 'Producto')}</p><h3><button type="button" data-market-product="${esc(p.id)}">${esc(p.titulo)}</button></h3>
      <strong class="market-price">${esc(price(p))}</strong><p class="market-card-place">${esc(p.comuna)} · Publicado por ${esc(p.vendedor_alias)}</p>
      <button class="button button-dark" type="button" data-market-product="${esc(p.id)}">Ver producto</button></div></article>`;
  };
  const renderProducts = async () => {
    const user = await currentUser().catch(() => null);
    const q = norm(filters.elements.q.value), comuna = norm(filters.elements.comuna.value), category = filters.elements.categoria.value;
    const rows = products.filter(p => available(p) && (!category || p.categoria === category) && norm(`${p.titulo} ${p.descripcion} ${p.vendedor_alias}`).includes(q) && norm(p.comuna).includes(comuna));
    status.textContent = `${rows.length} ${rows.length === 1 ? 'producto disponible' : 'productos disponibles'}`;
    list.innerHTML = rows.length ? (await Promise.all(rows.map(card))).join('') : '<p class="market-empty">No encontramos productos con esos filtros. Prueba otra búsqueda o publica el primero.</p>';
    list.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.closest('.market-card-photo')?.classList.add('has-image-error'), {once:true}));
  };
  const loadProducts = async () => {
    const user = await currentUser().catch(() => null);
    status.textContent = 'Cargando productos…';
    const {data,error} = await db.schema('ladra').from('market_productos')
      .select('id,vendedor_alias,titulo,descripcion,categoria,condicion,precio_clp,comuna,entrega,foto_path,estado,creado_en')
      .eq('estado','publicado').order('creado_en',{ascending:false}).limit(120);
    if (error) { products=[]; status.textContent = 'No pudimos cargar Market. Vuelve a intentarlo.'; list.innerHTML = '<button class="button button-ghost" type="button" data-market-retry>Actualizar</button>'; return; }
    products = data || [];
    await renderProducts();
  };
  const renderMine = async () => {
    const {data,error} = await db.schema('ladra').rpc('market_mis_publicaciones');
    const container = $('[data-market-mine-list]');
    if (error) { container.innerHTML = '<p class="market-empty">No pudimos cargar tus publicaciones.</p>'; return; }
    ownProducts = data || [];
    container.innerHTML = ownProducts.length ? (await Promise.all(ownProducts.map(async p => {
      let image=''; try { image=await photoUrl(p.foto_path); } catch {}
      return `<article class="market-own-card"><img src="${esc(image)}" alt="" loading="lazy"><div><strong>${esc(p.titulo)}</strong><p>${esc(price(p))} · ${esc(p.comuna)} · ${esc(p.estado)}</p><div class="market-own-actions">${p.estado==='publicado' ? '<button type="button" data-market-state="vendido" data-market-id="'+esc(p.id)+'">Marcar vendido</button><button type="button" data-market-state="retirado" data-market-id="'+esc(p.id)+'">Retirar</button>' : p.estado==='retirado' ? '<button type="button" data-market-state="publicado" data-market-id="'+esc(p.id)+'">Volver a publicar</button>' : ''}</div></div></article>`;
    }))).join('') : '<p class="market-empty">Aún no has publicado productos.</p>';
    await renderConsultations();
  };
  const renderConsultations = async () => {
    const box = $('[data-market-consultas]');
    const {data,error} = await db.schema('ladra').rpc('market_mis_consultas');
    if (error) { box.innerHTML='<p class="market-empty">No pudimos cargar tus consultas.</p>'; return; }
    consultations=(data||[]).filter(c=>!c.soy_vendedor);
    box.innerHTML = consultations.length ? consultations.map(c => `<article class="market-query"><p class="market-query-meta">${c.soy_vendedor ? 'Consulta recibida' : 'Tu consulta'} · ${esc(c.producto_titulo)} · ${esc(c.contraparte)}</p><p>${esc(c.mensaje)}</p>${c.respuesta ? `<div class="market-answer"><strong>Respuesta del vendedor</strong><p>${esc(c.respuesta)}</p></div>` : c.soy_vendedor ? `<form class="market-reply" data-market-reply="${esc(c.id)}"><label><span>Responder en Ladra</span><textarea name="respuesta" required minlength="2" maxlength="800" rows="2"></textarea></label><button type="submit">Enviar respuesta</button><p role="status"></p></form>` : '<p class="market-muted">El vendedor aún no responde.</p>'}</article>`).join('') : '<p class="market-empty">Todavía no tienes consultas.</p>';
  };
  const showMode = (mode) => {
    const mine = mode === 'mio';
    exploreBox.hidden=mine; mineBox.hidden=!mine;
    root.querySelectorAll('#market [data-market-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.marketView===mode)));
    if (mine) renderMine();
  };
  const openProduct = async (id) => {
    const p = products.find(x=>x.id===id) || ownProducts.find(x=>x.id===id);
    if (!p || !detail) return;
    active=p;
    const isOwn = ownProducts.some(x=>x.id===id);
    let image=''; try { image=await photoUrl(p.foto_path); } catch {}
    detail.innerHTML = `<div class="market-detail"><img class="market-detail-photo" src="${esc(image)}" alt="${esc(p.titulo)}"><div class="market-detail-body"><span class="market-card-category">${esc(categories[p.categoria]||'Producto')} · ${esc(p.condicion==='nuevo'?'Nuevo':'Usado')}</span><h2 id="market-product-title">${esc(p.titulo)}</h2><strong class="market-price">${esc(price(p))}</strong><p class="market-detail-seller">Publicado por <strong>${esc(p.vendedor_alias)}</strong></p><p>${esc(p.descripcion)}</p><p><strong>Comuna:</strong> ${esc(p.comuna)}</p><p><strong>Entrega:</strong> ${esc(p.entrega)}</p><p class="market-muted">Coordina el pago y la entrega directamente con el vendedor. Ladra no procesa pagos ni comparte teléfonos.</p>${!isOwn && available(p) ? `<form class="market-contact-form" data-market-contact="${esc(p.id)}"><label><span>Consulta al vendedor</span><textarea name="mensaje" required minlength="10" maxlength="800" rows="3" placeholder="Hola, ¿sigue disponible?"></textarea></label><button class="button button-dark" type="submit">Contactar por Ladra</button><p role="status"></p></form>` : isOwn ? '<p class="market-muted">Este producto es tuyo. Administra su estado desde Mi Market.</p>' : '<p class="market-muted">Este producto ya no está disponible.</p>'}</div></div>`;
    if (!productDialog.open) productDialog.showModal();
    if (!isOwn && available(p)) {
      const user=await currentUser().catch(()=>null);
      const form=detail.querySelector('[data-market-contact]');
      if (!user) { form.innerHTML='<p>Inicia sesión para enviar una consulta.</p><a class="button button-dark" href="#cuenta">Ir a Mi espacio</a>'; return; }
      const {data}=await db.schema('ladra').rpc('market_mis_consultas');
      const previous=(data||[]).find(c=>c.producto_id===id && !c.soy_vendedor);
      if(previous) form.innerHTML=`<p class="market-muted">Ya consultaste por este producto.</p><p>${esc(previous.mensaje)}</p>${previous.respuesta?`<div class="market-answer"><strong>Respuesta</strong><p>${esc(previous.respuesta)}</p></div>`:'<p>El vendedor aún no responde. Revisa tus consultas en Mi Market.</p>'}`;
    }
  };
  const uploadPhoto = async (user) => {
    const blob=await window.auraLadraServiciosFotos.prepare(chosenPhoto);
    const path=`${user.id}/${crypto.randomUUID()}.webp`;
    const {error}=await db.storage.from(bucket).upload(path,blob,{contentType:'image/webp',cacheControl:'3600',upsert:false});
    if(error) throw error;
    return path;
  };
  const resetPublish = () => { editingProduct=null; publishForm.querySelector('[data-market-file]').required=true;publishForm.querySelector('[data-market-file]').closest('.service-photo-field').hidden=false; publishForm.reset(); chosenPhoto=null; cleanPreview(); updatePhotoPreview(); message(publishMessage,''); };

  root.addEventListener('click', async e => {
    const mode=e.target.closest('[data-market-view]');
    if(mode){showMode(mode.dataset.marketView);return;}
    const open=e.target.closest('[data-market-product]');
    if(open){await openProduct(open.dataset.marketProduct);return;}
    if(e.target.closest('[data-market-publicar]')) { window.auraLadraVistas?.ir('mi-negocio');return; }
    if(e.target.closest('[data-market-retry]')) loadProducts();
    const stateButton=e.target.closest('[data-market-state]');
    if(stateButton){
      stateButton.disabled=true;
      const {error}=await db.schema('ladra').rpc('market_cambiar_estado',{p_producto_id:stateButton.dataset.marketId,p_estado:stateButton.dataset.marketState});
      if(error) alert('No pudimos actualizar la publicación. Inténtalo otra vez.');
      await loadProducts();await renderMine();
    }
  });
  productDialog?.addEventListener('click',e=>{if(e.target===productDialog||e.target.closest('[data-market-cerrar]'))productDialog.close();});
  publishDialog?.addEventListener('click',e=>{if(e.target===publishDialog||e.target.closest('[data-market-publicar-cerrar]'))publishDialog.close();});
  publishDialog?.addEventListener('close',resetPublish);
  filters.addEventListener('input',renderProducts); filters.addEventListener('change',renderProducts); filters.addEventListener('submit',e=>e.preventDefault());
  publishForm.querySelector('[data-market-file]').addEventListener('change',e=>{chosenPhoto=e.target.files?.[0]||null;updatePhotoPreview();});
  publishForm.addEventListener('submit',async e=>{
    e.preventDefault(); if(busy||!publishForm.reportValidity())return;
    busy=true;const button=publishForm.querySelector('[type=submit]');button.disabled=true;message(publishMessage,'Preparando foto…');
    let path='';
    try{
      const user=await currentUser();
      if(!await window.auraLadraNegocio?.permitir())throw Error('Activa Mi negocio.');
      if(!editingProduct && !chosenPhoto)throw Error('Elige una foto del producto.');
      if(!editingProduct)path=await uploadPhoto(user); message(publishMessage,'Publicando…');
      const f=new FormData(publishForm);
      const payload={titulo:String(f.get('titulo')).trim(),descripcion:String(f.get('descripcion')).trim(),categoria:f.get('categoria'),condicion:f.get('condicion'),precio_clp:Number(f.get('precio_clp')),comuna:String(f.get('comuna')).trim(),entrega:String(f.get('entrega')).trim()};
      const {error}=editingProduct ? await db.from('market_productos').update(payload).eq('id',editingProduct.id).select('id').single() : await db.from('market_productos').insert({...payload,foto_path:path});
      if(error)throw error;
      message(publishMessage,'Producto publicado. Ya aparece en Market.');
      await loadProducts();publishDialog.close();document.dispatchEvent(new Event('negocio:actualizar'));
    }catch(err){
      if(path) await db.storage.from(bucket).remove([path]).catch(()=>{});
      const copy=/perfil de Ladra/.test(err?.message||'')?'Primero publica tu perfil de Ladra en Mi espacio.':/42501/.test(err?.code||'')?'Inicia sesión y vuelve a intentarlo.':'No pudimos publicar el producto. Revisa la foto y vuelve a intentarlo.';
      message(publishMessage,copy,true);
    }finally{busy=false;button.disabled=false;}
  });
  detail?.addEventListener('submit',async e=>{
    const form=e.target.closest('[data-market-contact]'); if(!form)return;
    e.preventDefault();if(busy||!form.reportValidity())return;
    busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
    const statusNode=form.querySelector('[role=status]');
    const {data,error}=await db.schema('ladra').rpc('market_contactar_producto',{p_producto_id:form.dataset.marketContact,p_mensaje:form.elements.mensaje.value.trim()});
    busy=false;button.disabled=false;
    if(error){message(statusNode,'No pudimos enviar tu consulta. Inicia sesión y vuelve a intentarlo.',true);return;}
    form.innerHTML='<p class="market-success" role="status">Consulta enviada. El vendedor podrá responderte por Ladra; revisa Mi Market.</p>';
    if(data) renderMine();
  });
  mineBox.addEventListener('submit',async e=>{
    const form=e.target.closest('[data-market-reply]');if(!form)return;
    e.preventDefault();if(!form.reportValidity())return;
    const button=form.querySelector('[type=submit]');button.disabled=true;
    const {error}=await db.schema('ladra').rpc('market_responder_consulta',{p_consulta_id:form.dataset.marketReply,p_respuesta:form.elements.respuesta.value.trim()});
    if(error){message(form.querySelector('[role=status]'),'No pudimos enviar la respuesta.',true);button.disabled=false;return;}
    await renderConsultations();
  });
  db.auth.onAuthStateChange(()=>{window.setTimeout(()=>{loadProducts();if(!mineBox.hidden)renderMine();},0);});
  document.addEventListener('vista:cambio',e=>{if(e.detail?.vista!=='productos'&&productDialog?.open)productDialog.close();});
  window.auraLadraMarket = {
    actualizar: loadProducts,
    async editar(p=null) {
      if (!await window.auraLadraNegocio?.permitir()) return;
      resetPublish();editingProduct=p;
      document.querySelector('#market-publish-title').textContent=p?'Editar producto':'Publicar producto';
      if(p) for(const key of ['titulo','descripcion','categoria','condicion','precio_clp','comuna','entrega'])publishForm.elements[key].value=p[key]??'';
      publishForm.querySelector('[data-market-file]').required=!p;
      publishForm.querySelector('[data-market-file]').closest('.service-photo-field').hidden=Boolean(p);
      publishForm.querySelector('[type=submit]').textContent=p?'Guardar cambios':'Publicar producto';
      publishDialog.showModal();
    }
  };
  loadProducts();
})();

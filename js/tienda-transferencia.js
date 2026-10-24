// Usa la billetera central y conserva la misma clave al reintentar una transferencia.
(() => {
  'use strict';
  const db = window.auraLadraDb;
  const fmt = new Intl.NumberFormat('es-CL');
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const wallet = '<a href="https://convergenciaaura.cl/wallet" target="_blank" rel="noopener noreferrer">Abrir mi billetera ↗</a>';
  let active;
  const deliveries = p => Array.isArray(p.opciones_entrega) && p.opciones_entrega.length ? p.opciones_entrega : [{id:'acordada',texto:'Entrega acordada con el comprador'}];
  const deliveryText = s => s.delivery?.texto || 'Entrega acordada con el comprador';
  const read = key => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { sessionStorage.setItem(key, JSON.stringify(value)); };
  const rpc = async (name, args) => { const r = await db.schema('public').rpc(name,args); if(r.error) throw r.error; return r.data; };
  const live = s => active === s && s.box.isConnected;
  const render = s => {
    if (!live(s)) return;
    const p = s.product;
    let html = '';
    if (s.receipt) html = `<h4>Transferencia realizada</h4><p>Transferiste ${fmt.format(s.receipt.amount)} AC a ${esc(s.receipt.seller)}.</p><p>${esc(s.receipt.delivery || 'Entrega acordada con el comprador')}</p><p class="shop-payment-note">Coordinen los detalles de la entrega.</p><small class="shop-receipt">Operación: ${esc(s.receipt.id)}</small>`;
    else if (s.loading) html = '<p role="status">Consultando tu billetera…</p>';
    else if (!s.user) html = '<h4>Comprar con AC</h4><p>Inicia sesión para transferir AC.</p><a href="#cuenta" data-compra-login>Iniciar sesión</a>';
    else if (s.block) html = `<p role="status">${esc(s.block)}</p>${wallet}`;
    else {
      const review = s.stage === 'review' || s.intent;
      html = `<h4>${review ? 'Revisar transferencia' : 'Comprar con AC'}</h4><p>Disponible: <strong>${fmt.format(s.balance)} AC</strong></p>`;
      if (review) html += `<dl class="shop-payment-summary"><div><dt>Destinatario</dt><dd>${esc(p.vendedor.nombre)} · @${esc(p.vendedor.alias_core)}</dd></div><div><dt>Producto</dt><dd>${esc(p.titulo)}</dd></div><div><dt>Monto</dt><dd>${fmt.format(p.precio_ac)} AC</dd></div><div><dt>Entrega</dt><dd>${esc(deliveryText(s))}</dd></div></dl><p class="shop-payment-note">Los AC se transfieren de inmediato a ${esc(p.vendedor.nombre)}. Coordinen los detalles de la entrega.</p>`;
      else html += `<label for="shop-delivery-choice">Entrega</label><select id="shop-delivery-choice" data-compra-entrega required><option value="">Selecciona la entrega</option>${deliveries(p).map(d => `<option value="${esc(d.id)}">${esc(d.texto)}</option>`).join('')}</select>`;
      if (s.error) html += `<p role="alert">${esc(s.error)}</p>`;
      html += `<button class="shop-primary" type="button" data-compra-${review?'confirmar':'revisar'} ${s.busy?'disabled':''}>${s.busy?'Procesando…':review?(s.intent?'Reintentar la misma transferencia':`Confirmar transferencia de ${fmt.format(p.precio_ac)} AC`):'Revisar transferencia'}</button>`;
      if (review && !s.intent && !s.busy) html += '<button class="shop-payment-secondary" type="button" data-compra-volver>Volver</button>';
    }
    s.box.innerHTML = html;
  };
  const start = async product => {
    const box = document.querySelector('[data-compra-ac]');
    if (!box) return;
    const s = active = {product,box,loading:true,stage:'choose'};
    if(product.stock === 0 || !Number.isSafeInteger(product.precio_ac) || product.precio_ac <= 0) {
      s.loading=false; s.user={}; s.block='Este producto no está disponible para transferir AC.'; render(s); return;
    }
    render(s);
    try {
      if (!db) { s.loading=false; render(s); return; }
      const {data,error} = await db.auth.getSession();
      if(error) throw error;
      s.user = data.session?.user;
      if (s.user?.is_anonymous) s.user=null;
      if(!s.user) { s.loading=false; render(s); return; }
      s.key = `ladra:compra:${s.user.id}:${product.id}`;
      const stored = read(s.key);
      if(stored?.receipt) { s.receipt=stored.receipt; s.loading=false; render(s); return; }
      const [balance,alias,terms] = await Promise.all([rpc('fn_ac_mi_saldo'),rpc('fn_ac_mi_alias'),rpc('fn_ac_mi_aceptacion')]);
      s.balance = Number(balance.disponible);
      if (stored?.intent) {
        s.intent=stored.intent;
        s.delivery=stored.delivery || deliveries(product).find(d => d.id === 'acordada');
        if(s.intent.p_monedas!==product.precio_ac || s.intent.p_destino_alias!==product.vendedor.alias_core) s.block='Hay una transferencia pendiente de comprobar. Revisa tu billetera antes de realizar otra compra.';
      }
      if(String(alias).toLowerCase()===product.vendedor.alias_core.toLowerCase()) s.block='Esta publicación es tuya.';
      else if(balance.operaciones_habilitadas===false) s.block='Las transferencias de AC están pausadas.';
      else if(terms.requerida && !terms.aceptada) s.block='Acepta los términos de AC en tu billetera para continuar.';
      else if(!s.intent && (!Number.isSafeInteger(s.balance) || s.balance<product.precio_ac)) s.block=`Necesitas ${fmt.format(product.precio_ac)} AC disponibles para esta compra.`;
    } catch { s.block='No pudimos consultar tu billetera. Cierra la publicación y vuelve a intentarlo.'; }
    s.loading=false; render(s);
  };
  const transfer = async s => {
    if(s.busy || s.block || !s.user || s.receipt) return;
    s.busy=true; s.error=''; render(s);
    try {
      const {data,error} = await db.auth.getSession();
      if(error) throw error;
      if(data.session?.user.id!==s.user.id) { if(live(s)) start(s.product); return; }
      if (!s.intent) {
        s.intent={p_destino_alias:s.product.vendedor.alias_core,p_monedas:s.product.precio_ac,p_motivo:`Compra: ${s.product.titulo}`,p_clave:`ladra-tienda:${crypto.randomUUID()}`,p_precio_clp:null,p_referencia:`ladra:tienda:${s.product.id};entrega=${s.delivery?.id === 'domicilio_maipu' ? 'domicilio_maipu' : 'acordada_con_comprador'}`};
      }
      // No se envía dinero si el navegador no puede conservar la clave de reintento.
      save(s.key,{intent:s.intent,delivery:s.delivery});
      const result = await rpc('fn_ac_transferir',s.intent);
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result?.operacion_id || '')) throw new Error('Respuesta sin comprobante');
      s.receipt={id:result.operacion_id,amount:s.intent.p_monedas,seller:s.product.vendedor.nombre,delivery:deliveryText(s)};
      save(s.key,{receipt:s.receipt});
      document.dispatchEvent(new CustomEvent('aura:wallet-cambio'));
    } catch(error) {
      if (/^(AC\d+|22\w+|23\w+|28\w+|42501)$/.test(error.code || '')) {
        sessionStorage.removeItem(s.key); s.intent=null;
        s.error=error.code==='AC040'?'No tienes suficientes AC disponibles.':error.code==='AC033'?'No puedes transferirte AC a ti mismo.':'La billetera rechazó la transferencia. Revisa tu saldo y vuelve a intentarlo.';
      } else s.error='No pudimos comprobar el resultado. Reintenta la misma transferencia para evitar duplicados.';
    } finally { s.busy=false; render(s); }
  };
  document.addEventListener('tienda:producto', e => start(e.detail.producto));
  document.addEventListener('tienda:cerrar', () => { active=null; });
  document.addEventListener('click', e => {
    const s=active;
    if(!s || !s.box.contains(e.target)) return;
    if(e.target.closest('[data-compra-login]')) document.querySelector('[data-tienda-dialog]')?.close();
    if(e.target.closest('[data-compra-revisar]')) {
      const select=s.box.querySelector('[data-compra-entrega]');
      if(!select?.value) { select?.reportValidity(); return; }
      s.delivery=deliveries(s.product).find(d => d.id === select.value);
      if(!s.delivery) return;
      s.stage='review'; render(s);
    }
    if(e.target.closest('[data-compra-volver]')) { s.stage='choose'; s.error=''; render(s); }
    if(e.target.closest('[data-compra-confirmar]')) transfer(s);
  });
  db?.auth.onAuthStateChange?.(() => { if(active) setTimeout(() => { if(active) start(active.product); },0); });
})();

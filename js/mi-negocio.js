// Vitrina pública y espacio de trabajo privado. La autorización también se aplica en PostgreSQL.
(() => {
 'use strict';
 const db=window.auraLadraDb, root=document.querySelector('#mi-negocio');if(!db||!root)return;
 const $=s=>root.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const categories={veterinaria:'Veterinaria',peluqueria:'Peluquería',tienda:'Tienda',cuidados:'Cuidados y paseos',otros:'Emprendimiento'};
 const money=v=>'$'+Number(v||0).toLocaleString('es-CL');
 const empty=t=>`<p class="business-empty">${esc(t)}</p>`;
 const photo=p=>p?db.storage.from('servicios-ladra').getPublicUrl(p).data.publicUrl:'';
 const avatar=n=>n.foto_path?`<img class="business-avatar" src="${esc(photo(n.foto_path))}" alt="Foto de ${esc(n.nombre)}">`:`<span class="business-avatar business-initial" aria-hidden="true">${esc(n.nombre?.slice(0,1))}</span>`;
 let user=null, business=null, tab='resumen', companies=[], generation=0, working=false;
 let data={services:[],products:[],queries:[],requests:[],orders:[],appointments:[]};
 const dialog=document.querySelector('[data-business-dialog]'),form=dialog.querySelector('form');
 const publicDialog=document.querySelector('[data-business-public-dialog]');
 const err=(e)=>e?.code==='23505'?'Ya existe ese pedido o hay una cita confirmada a esa hora. Actualiza la agenda.':e?.code==='42501'?'No tienes acceso a esta gestión. Revisa tu perfil de trabajador.':'No pudimos guardar los cambios. Revisa tu conexión e inténtalo otra vez.';
 async function identity(){
  const {data:a,error}=await db.auth.getUser();if(error&&!a?.user)return {user:null,business:null};
  if(!a.user)return {user:null,business:null};
  const r=await db.from('negocios').select('*').eq('propietario_id',a.user.id).maybeSingle();if(r.error)throw r.error;
  return {user:a.user,business:r.data};
 }
 async function permitir(){
  try{const i=await identity();if(i.business)return true;}catch{}
  window.auraLadraVistas?.ir('mi-negocio');await load();return false;
 }
 function editor(){
  form.reset();if(business)for(const key of ['nombre','categoria','comuna','descripcion'])form.elements[key].value=business[key]||'';
  form.elements.publicado.checked=business?business.publicado:true;
  dialog.querySelector('[data-business-form-status]').textContent='';dialog.showModal();
 }
 async function directory(){
  const node=document.querySelector('[data-business-directory]');if(!node)return;
  const r=await db.from('negocios').select('*').eq('publicado',true).order('creado_en',{ascending:false}).limit(200);
  if(r.error){node.innerHTML=empty('No pudimos cargar los negocios. Vuelve a entrar a Servicios para reintentar.');return;}
  companies=r.data||[];
  node.innerHTML=companies.length?companies.map(n=>`<article class="business-card business-public-card">${avatar(n)}<div><p class="kicker">${esc(categories[n.categoria])}</p><h3>${esc(n.nombre)}</h3><p>${esc(n.comuna)}</p><button class="button button-outline" data-business-open="${esc(n.propietario_id)}">Ver negocio</button></div></article>`).join(''):empty('Aquí aparecerán los emprendimientos y empresas que publiquen su perfil.');
 }
 async function load(){
  const gen=++generation;$('[data-business-status]').textContent='Comprobando acceso…';$('[data-business-panel]').hidden=true;
  try{
   const i=await identity();if(gen!==generation)return;user=i.user;business=i.business;
   $('[data-business-login]').hidden=Boolean(user);$('[data-business-onboard]').hidden=!user||Boolean(business);
   if(!business){$('[data-business-status]').textContent='';return;}
   const results=await Promise.all([
    db.from('servicios').select('*').eq('propietario_id',user.id).order('creado_en',{ascending:false}).limit(200),
    db.rpc('market_mis_publicaciones'),db.rpc('market_mis_consultas'),
    db.from('servicio_consultas').select('*').eq('prestador_id',user.id).order('creado_en',{ascending:false}).limit(200),
    db.from('negocio_pedidos').select('*').eq('propietario_id',user.id).order('creado_en',{ascending:false}).limit(200),
    db.from('negocio_citas').select('*').eq('propietario_id',user.id).order('dia',{ascending:true}).order('hora',{ascending:true}).limit(200)
   ]);if(gen!==generation)return;
   const failure=results.find(r=>r.error);if(failure)throw failure.error;
   ['services','products','queries','requests','orders','appointments'].forEach((k,i)=>data[k]=results[i].data||[]);
   data.queries=data.queries.filter(q=>q.soy_vendedor);
   $('[data-business-status]').textContent='Acceso de trabajador · Gestión privada de tu negocio';
   $('[data-business-panel]').hidden=false;$('[data-business-identity]').innerHTML=`${avatar(business)}<strong>${esc(business.nombre)}</strong><small>${esc(categories[business.categoria])}</small>`;render();
  }catch(e){if(gen!==generation)return;$('[data-business-status]').textContent='No pudimos comprobar tu acceso. '+err(e);}
 }
 const productRows=()=>data.products.map(p=>`<article class="business-row"><div><strong>${esc(p.titulo)}</strong><p>${money(p.precio_clp)} · ${esc(p.estado)}</p></div><div class="business-row-actions"><button data-business-product-edit="${esc(p.id)}">Editar</button>${p.estado==='publicado'?`<button data-business-product-state="${esc(p.id)}" data-state="vendido">Marcar vendido</button><button data-business-product-state="${esc(p.id)}" data-state="retirado">Retirar</button>`:p.estado==='retirado'?`<button data-business-product-state="${esc(p.id)}" data-state="publicado">Republicar</button>`:''}</div></article>`).join('')||empty('Publica tu primer producto con su foto, precio y condiciones de entrega.');
 const serviceRows=()=>data.services.map(s=>`<article class="business-row"><div><strong>${esc(s.titulo)}</strong><p>${s.precio_clp==null?'A convenir':money(s.precio_clp)} · ${s.publicado?'Publicado':'Retirado'}</p></div><div class="business-row-actions"><button data-business-service-edit="${esc(s.id)}">Editar</button><button data-business-service-toggle="${esc(s.id)}">${s.publicado?'Retirar':'Republicar'}</button></div></article>`).join('')||empty('Ofrece atención veterinaria, peluquería u otros cuidados.');
 function orderRows(){return data.orders.map(o=>{
  const q=data.queries.find(x=>x.id===o.consulta_id);
  return `<article class="business-row"><div><strong>${esc(q?.producto_titulo||'Pedido')}</strong><p>${esc(q?.mensaje||'')} </p><small>Estado acordado con el cliente. Pago y entrega por coordinar.</small></div><label>Estado<select data-business-order-state="${esc(o.id)}">${['por_confirmar','preparando','listo','entregado','cancelado'].map(s=>`<option value="${s}" ${s===o.estado?'selected':''}>${esc(s.replaceAll('_',' '))}</option>`).join('')}</select></label></article>`;
 }).join('')||empty('Aún no tienes pedidos. Puedes crear uno desde una consulta recibida.');}
 function appointmentRows(){return data.appointments.map(a=>{
  const q=data.requests.find(x=>x.id===a.consulta_id);
  return `<article class="business-row"><div><strong>${esc(q?.servicio_titulo||'Cita')} · ${esc(q?.mascota_nombre||'Mascota')}</strong><p>${esc(a.dia)} · ${esc(a.hora.slice(0,5))} · hora de Chile</p></div><label>Estado<select data-business-appointment-state="${esc(a.id)}">${['confirmada','completada','cancelada'].map(s=>`<option ${s===a.estado?'selected':''}>${s}</option>`).join('')}</select></label></article>`;
 }).join('')||empty('Todavía no hay citas confirmadas. Confirma una desde una solicitud recibida.');}
 function queries(){return data.queries.map(q=>`<article class="business-card"><h3>${esc(q.producto_titulo)}</h3><p>${esc(q.mensaje)}</p>${q.respuesta?`<p><strong>Tu respuesta:</strong> ${esc(q.respuesta)}</p>`:`<form data-business-reply-product="${esc(q.id)}"><label>Responder por Ladra<textarea name="respuesta" required minlength="2" maxlength="800"></textarea></label><button type="submit">Enviar respuesta</button></form>`}${!data.orders.some(o=>o.consulta_id===q.id)?`<button class="button button-outline" data-business-create-order="${esc(q.id)}">Crear pedido acordado</button>`:''}</article>`).join('')||empty('Las consultas de tus clientes aparecerán aquí.');}
 function requests(){return data.requests.map(q=>`<article class="business-card"><h3>${esc(q.servicio_titulo)} · ${esc(q.mascota_nombre)}</h3><p>Solicita ${esc(q.dia_preferido)} · ${esc(q.horario)}</p><p>${esc(q.mensaje)}</p>${q.respuesta?`<p><strong>Tu respuesta:</strong> ${esc(q.respuesta)}</p>`:`<form data-business-reply-service="${esc(q.id)}"><label>Disponibilidad y condiciones<textarea name="respuesta" required minlength="10" maxlength="800"></textarea></label><button type="submit">Responder</button></form>`}${q.estado!=='no_disponible'&&!data.appointments.some(a=>a.consulta_id===q.id)?`<form class="business-appointment-form" data-business-book="${esc(q.id)}"><label>Día (Chile)<input type="date" name="dia" value="${esc(q.dia_preferido)}" required></label><label>Hora (Chile)<input type="time" name="hora" required></label><label class="service-consent"><input type="checkbox" required><span>Horario acordado con el cliente</span></label><button type="submit">Confirmar cita</button></form>`:''}</article>`).join('')||empty('Aquí recibirás las solicitudes de atención.');}
 function render(){
  if(!business)return;
  const titles={resumen:'Resumen',productos:'Productos',servicios:'Servicios',pedidos:'Pedidos',agenda:'Agenda',empresa:'Mi empresa'};
  $('[data-business-panel-title]').textContent=titles[tab];root.querySelectorAll('[data-business-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.businessTab===tab)));
  const box=$('[data-business-content]');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(tab==='resumen')box.innerHTML=`<div class="business-stats"><article><span>Pedidos pendientes</span><strong>${data.orders.filter(o=>!['entregado','cancelado'].includes(o.estado)).length}</strong></article><article><span>Citas de hoy</span><strong>${data.appointments.filter(a=>a.dia===today&&a.estado==='confirmada').length}</strong></article><article><span>Productos activos</span><strong>${data.products.filter(p=>p.estado==='publicado').length}</strong></article></div><div class="business-overview-grid"><section class="business-card"><h3>Agenda</h3>${appointmentRows()}<button data-business-tab="agenda">Ver agenda y solicitudes →</button></section><section class="business-card"><h3>Pedidos por gestionar</h3>${orderRows()}<button data-business-tab="pedidos">Ver pedidos y consultas →</button></section></div><section class="business-card"><h3>Así se presenta tu emprendimiento</h3><div class="business-public-card">${avatar(business)}<div><strong>${esc(business.nombre)}</strong><p>${esc(categories[business.categoria])} · ${esc(business.comuna)}</p><p>${business.publicado?'Visible en la vitrina':'Perfil de empresa sin publicar'}</p></div></div><button data-business-edit>Editar perfil de empresa</button></section>`;
  if(tab==='productos')box.innerHTML=productRows();if(tab==='servicios')box.innerHTML=serviceRows();
  if(tab==='pedidos')box.innerHTML=orderRows()+'<h3>Consultas de productos</h3>'+queries();
  if(tab==='agenda')box.innerHTML=appointmentRows()+'<h3>Solicitudes de atención</h3>'+requests();
  if(tab==='empresa')box.innerHTML=`<article class="business-card">${avatar(business)}<h3>${esc(business.nombre)}</h3><p class="business-description">${esc(business.descripcion)}</p><p>${esc(business.comuna)} · ${esc(categories[business.categoria])}</p><p>${business.publicado?'Vitrina pública activa':'Perfil de empresa sin publicar'}</p><button class="button button-dark" data-business-edit>Editar mi empresa</button></article>`;
 }
 async function mutation(fn){
  if(working)return;working=true;const actor=user?.id;$('[data-business-status]').textContent='Guardando…';
  try{if(!await permitir())return;const r=await fn();if(r.error)throw r.error;if(user?.id!==actor)return;await load();window.auraLadraServicios?.actualizar();window.auraLadraMarket?.actualizar();}
  catch(e){$('[data-business-status]').textContent=err(e);}
  finally{working=false;}
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-business-register')||b.hasAttribute('data-business-edit')){editor();return;}
  if(b.dataset.businessTab){tab=b.dataset.businessTab;render();return;}
  if(b.dataset.businessAdd){if(b.dataset.businessAdd==='servicio'){await window.auraLadraServicios?.editar(null,b);const f=document.querySelector('[data-service-publish-form]');if(f){f.elements.prestador.value=business.nombre;f.elements.zona.value=business.comuna;}}else window.auraLadraMarket?.editar();return;}
  if(b.dataset.businessProductEdit){window.auraLadraMarket?.editar(data.products.find(p=>p.id===b.dataset.businessProductEdit));return;}
  if(b.dataset.businessServiceEdit){window.auraLadraServicios?.editar(data.services.find(s=>s.id===b.dataset.businessServiceEdit),b);return;}
  if(b.dataset.businessServiceToggle){const s=data.services.find(s=>s.id===b.dataset.businessServiceToggle);await mutation(()=>db.from('servicios').update({publicado:!s.publicado}).eq('id',s.id).eq('revision',s.revision).select('id').single());}
  if(b.dataset.businessProductState)await mutation(()=>db.rpc('market_cambiar_estado',{p_producto_id:b.dataset.businessProductState,p_estado:b.dataset.state}));
  if(b.dataset.businessCreateOrder)await mutation(()=>db.from('negocio_pedidos').insert({consulta_id:b.dataset.businessCreateOrder}));
 });
 root.addEventListener('change',e=>{
  const b=e.target;if(b.dataset.businessOrderState)mutation(()=>db.from('negocio_pedidos').update({estado:b.value}).eq('id',b.dataset.businessOrderState).select('id').single());
  if(b.dataset.businessAppointmentState)mutation(()=>db.from('negocio_citas').update({estado:b.value}).eq('id',b.dataset.businessAppointmentState).select('id').single());
 });
 root.addEventListener('submit',e=>{
  const f=e.target;if(!f.matches('[data-business-reply-product],[data-business-reply-service],[data-business-book]'))return;
  e.preventDefault();if(!f.reportValidity())return;
  if(f.dataset.businessReplyProduct)mutation(()=>db.rpc('market_responder_consulta',{p_consulta_id:f.dataset.businessReplyProduct,p_respuesta:f.elements.respuesta.value.trim()}));
  if(f.dataset.businessReplyService)mutation(()=>db.from('servicio_consultas').update({respuesta:f.elements.respuesta.value.trim(),estado:'respondida'}).eq('id',f.dataset.businessReplyService).eq('estado','pendiente').select('id').single());
  if(f.dataset.businessBook)mutation(()=>db.from('negocio_citas').insert({consulta_id:f.dataset.businessBook,dia:f.elements.dia.value,hora:f.elements.hora.value}));
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(working||!form.reportValidity())return;working=true;const btn=form.querySelector('[type=submit]'),note=form.querySelector('[data-business-form-status]');btn.disabled=true;note.textContent='Guardando perfil…';
  try{
   const i=await identity();if(!i.user)throw Error('Sin sesión');
   let path=i.business?.foto_path||null;const file=form.elements.foto.files[0];
   if(file){const blob=await window.auraLadraServiciosFotos.prepare(file);path=`${i.user.id}/${crypto.randomUUID()}.webp`;const upload=await db.storage.from('servicios-ladra').upload(path,blob,{contentType:'image/webp',upsert:false});if(upload.error)throw upload.error;}
   const payload={};for(const key of ['nombre','categoria','comuna','descripcion'])payload[key]=form.elements[key].value.trim();payload.publicado=form.elements.publicado.checked;payload.foto_path=path;
   const r=i.business?await db.from('negocios').update(payload).eq('propietario_id',i.user.id).select().single():await db.from('negocios').insert(payload).select().single();if(r.error)throw r.error;
   dialog.close();await load();await directory();
  }catch(e){note.textContent=err(e);}finally{working=false;btn.disabled=false;}
 });
 document.querySelector('[data-business-close]').addEventListener('click',()=>{if(!working)dialog.close();});dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});
 document.querySelector('[data-business-public-close]').addEventListener('click',()=>publicDialog.close());
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-business-open]');if(!b)return;const n=companies.find(n=>n.propietario_id===b.dataset.businessOpen);if(!n)return;
  document.querySelector('[data-business-public-detail]').innerHTML=`${avatar(n)}<p class="kicker">${esc(categories[n.categoria])}</p><h2 id="business-public-title">${esc(n.nombre)}</h2><p>${esc(n.comuna)}</p><p class="business-description">${esc(n.descripcion)}</p><a class="button button-dark" href="#servicios" data-business-public-services>Ver servicios y contactar</a><a class="button button-outline" href="#market" data-business-public-products>Ver productos</a>`;
  publicDialog.showModal();
  publicDialog.querySelector('[data-business-public-services]').addEventListener('click',()=>{window.auraLadraServicios?.porNegocio(n.propietario_id);publicDialog.close();});
  publicDialog.querySelector('[data-business-public-products]').addEventListener('click',()=>{const f=document.querySelector('[data-market-filters]');f.elements.q.value=n.nombre;f.dispatchEvent(new Event('input',{bubbles:true}));publicDialog.close();});
 });
 document.addEventListener('vista:cambio',e=>{if(e.detail?.vista==='negocio')load();if(e.detail?.vista==='servicios')directory();});
 document.addEventListener('negocio:actualizar',()=>{if(window.auraLadraVistas?.actual()==='negocio')load();});
 db.auth.onAuthStateChange(()=>{generation++;user=null;business=null;data={services:[],products:[],queries:[],requests:[],orders:[],appointments:[]};$('[data-business-panel]').hidden=true;dialog.close();queueMicrotask(()=>{if(window.auraLadraVistas?.actual()==='negocio')load();});});
 window.auraLadraNegocio={permitir};directory();if(window.auraLadraVistas?.actual()==='negocio')load();
})();

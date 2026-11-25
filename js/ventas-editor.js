// Un solo editor para publicar, guardar borradores y administrar la galería desde Mi negocio.
(() => {
 'use strict';const db=window.auraLadraDb,dialog=document.querySelector('[data-market-publish-dialog]');if(!db||!dialog)return;
 const form=dialog.querySelector('form'),status=form.querySelector('[data-market-publish-message]'),photosBox=form.querySelector('[data-sales-photos]'),preview=form.querySelector('[data-sales-preview-card]');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let photos=[],record=null,actor=null,company='',generation=0,busy=false,key=null;
 const revoke=()=>photos.filter(p=>p.url?.startsWith('blob:')).forEach(p=>URL.revokeObjectURL(p.url));
 const values=()=>{const f=new FormData(form);return {titulo:String(f.get('titulo')||'').trim(),descripcion:String(f.get('descripcion')||'').trim(),categoria:f.get('categoria'),condicion:f.get('condicion'),precio_clp:Number(f.get('precio_clp')||0),stock:Number(f.get('stock')||0),variantes:String(f.get('variantes')||'').trim(),comuna:String(f.get('comuna')||'').trim(),entrega:String(f.get('entrega')||'').trim()};};
 function draw(){
  photosBox.innerHTML=photos.map((p,i)=>`<figure><img src="${esc(p.url)}" alt="Foto ${i+1} del producto"><figcaption><button type="button" data-sales-cover="${i}" aria-pressed="${i===0}">${i===0?'Portada':'Usar de portada'}</button><button type="button" data-sales-remove="${i}" aria-label="Quitar foto ${i+1}">×</button></figcaption></figure>`).join('');
  if(!preview.hidden)drawPreview();
 }
 function drawPreview(){const p=values();preview.innerHTML=`${photos[0]?`<img src="${esc(photos[0].url)}" alt="Portada del producto">`:'<p>Agrega una foto para ver la portada.</p>'}<h3>${esc(p.titulo||'Nombre del producto')}</h3><strong>$${p.precio_clp.toLocaleString('es-CL')}</strong><p>${esc(company)}</p><p>${esc(p.descripcion)}</p><p>${p.stock} unidades · ${esc(p.variantes)}</p><p>${esc(p.comuna)} · ${esc(p.entrega)}</p><span class="button button-outline">Consultar por Ladra</span><small>Vista previa. Solo será visible al publicar.</small>`;}
 function reset(){generation++;revoke();photos=[];record=null;actor=null;busy=false;key=null;form.reset();photosBox.replaceChildren();preview.hidden=true;preview.replaceChildren();status.textContent='';form.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=false);}
 async function abrir(p=null){
  if(!await window.auraLadraNegocio?.permitir())return;reset();const gen=generation;
  const a=await db.auth.getUser();actor=a.data?.user?.id;if(!actor)return;
  const n=await db.from('negocios').select('nombre,comuna').eq('propietario_id',actor).single();if(gen!==generation)return;
  company=n.data?.nombre||'Tu negocio';record=p?{...p}:null;key=p?.id||crypto.randomUUID();
  document.querySelector('#market-publish-title').textContent=p?'Editar producto':'Publicar producto';
  for(const k of ['titulo','descripcion','categoria','condicion','precio_clp','stock','variantes','comuna','entrega'])if(p&&p[k]!=null)form.elements[k].value=p[k];
  if(!p)form.elements.comuna.value=n.data?.comuna||'';
  dialog.showModal();status.textContent='Cargando fotos…';
  try{for(const path of (p?.fotos?.length?p.fotos:p?.foto_path?[p.foto_path]:[])){const r=await db.storage.from('market-ladra').createSignedUrl(path,3600);if(r.error)throw r.error;if(gen!==generation)return;photos.push({path,url:r.data.signedUrl});}draw();status.textContent='';}
  catch{status.textContent='No pudimos cargar las fotos. Cierra y vuelve a abrir antes de guardar.';form.querySelectorAll('[type=submit]').forEach(b=>b.disabled=true);}
 }
 form.querySelector('[data-market-file]').addEventListener('change',async e=>{
  if(busy)return;const files=Array.from(e.target.files||[]);if(photos.length+files.length>6){status.textContent='Puedes agregar hasta 6 fotos.';e.target.value='';return;}
  try{for(const file of files)window.auraLadraServiciosFotos.validate(file);for(const file of files)photos.push({file,url:URL.createObjectURL(file)});draw();status.textContent='';}catch(error){status.textContent=error.message;}e.target.value='';
 });
 form.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;
  if(b.dataset.salesStep)dialog.querySelector('#'+b.dataset.salesStep)?.scrollIntoView({behavior:'smooth',block:'start'});
  if(b.dataset.salesRemove!==undefined){const p=photos.splice(Number(b.dataset.salesRemove),1)[0];if(p.url.startsWith('blob:'))URL.revokeObjectURL(p.url);draw();}
  if(b.dataset.salesCover!==undefined){photos.unshift(...photos.splice(Number(b.dataset.salesCover),1));draw();}
  if(b.dataset.salesDelivery)form.elements.entrega.value=b.dataset.salesDelivery;
  if(b.hasAttribute('data-sales-preview')){preview.hidden=!preview.hidden;if(!preview.hidden){drawPreview();preview.scrollIntoView({behavior:'smooth',block:'nearest'});}}
 });form.addEventListener('input',()=>{if(!preview.hidden)drawPreview();});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const mode=e.submitter?.value||'publicado';
  if(mode!=='borrador'&&(!form.reportValidity()||!photos.length)){status.textContent='Completa los datos, el consentimiento y al menos una foto.';return;}
  const payload=values();if(mode==='publicado'&&payload.stock<1){status.textContent='Indica stock disponible para publicar. Puedes guardar un borrador con stock cero.';return;}
  const gen=generation;busy=true;form.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=true);status.textContent='Guardando…';
  try{
   const a=await db.auth.getUser();if(a.data?.user?.id!==actor||!await window.auraLadraNegocio.permitir())throw Error('La sesión cambió.');
   for(const p of photos){if(!p.path){const blob=await window.auraLadraServiciosFotos.prepare(p.file);if(gen!==generation)return;p.path=`${actor}/${crypto.randomUUID()}.webp`;p.blob=blob;}if(p.file&&!p.uploaded){const r=await db.storage.from('market-ladra').upload(p.path,p.blob,{contentType:'image/webp',upsert:false});if(r.error){const check=await db.storage.from('market-ladra').download(p.path);if(check.error||check.data.size!==p.blob.size)throw r.error;}p.uploaded=true;}if(gen!==generation)return;}
   const paths=photos.map(p=>p.path);Object.assign(payload,{estado:mode,fotos:paths,foto_path:paths[0]||null});
   const r=record?await db.from('market_productos').update(payload).eq('id',record.id).eq('revision',record.revision).select('id,revision').single():await db.from('market_productos').insert({...payload,id:key}).select('id,revision').single();
   if(gen!==generation)return;
   if(r.error){const saved=await db.from('market_productos').select('id,revision,estado,titulo').eq('id',key).eq('propietario_id',actor).maybeSingle();if(!saved.data||saved.data.titulo!==payload.titulo||saved.data.estado!==payload.estado)throw r.error;record={...record,...saved.data};throw Error('El producto ya se guardó o cambió en otra pestaña. Cierra el editor y revisa Ventas antes de editar de nuevo.');}
   dialog.close();window.auraLadraMarket?.actualizar();document.dispatchEvent(new Event('negocio:actualizar'));
  }catch(error){if(gen===generation)status.textContent=error.message?.startsWith('El producto')?error.message:'No pudimos guardar los cambios. Revisa Ventas antes de reintentar para comprobar el último estado.';}
  finally{if(gen===generation){busy=false;form.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=false);}}
 });
 dialog.addEventListener('click',e=>{if(!busy&&(e.target===dialog||e.target.closest('[data-market-publicar-cerrar]')))dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',reset);
 db.auth.onAuthStateChange(()=>{if(dialog.open)dialog.close();else reset();});window.auraLadraVentasEditor={abrir};
})();

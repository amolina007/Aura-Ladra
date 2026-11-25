// Conversaciones privadas entre comprador y vendedor de una consulta de producto.
(() => {
 'use strict';const db=window.auraLadraDb;if(!db)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function montar(host,consulta){
  if(!host?.isConnected)return;
  host.querySelector('[data-sales-chat]')?.remove();
  const box=document.createElement('section');box.className='sales-chat';box.dataset.salesChat=consulta.id;
  box.innerHTML=`<h4>Conversación por Ladra</h4><div data-sales-chat-log role="log" aria-label="Mensajes privados"></div><form data-sales-chat-send><label>Mensaje<textarea name="texto" required maxlength="800" rows="2" placeholder="Escribe a la otra persona…"></textarea></label><div><button type="submit">Enviar mensaje</button><button type="button" data-sales-chat-refresh>Actualizar conversación</button></div><p role="status"></p></form>`;
  host.append(box);let actor=null,loading=0,busy=false;
  const status=box.querySelector('[role=status]'),form=box.querySelector('form');
  async function refresh(){
   const gen=++loading;const a=await db.auth.getUser();actor=a.data?.user?.id;
   if(!actor){box.replaceChildren();return;}
   const r=await db.from('ventas_mensajes').select('id,autor_id,texto,creado_en').eq('consulta_id',consulta.id).order('creado_en',{ascending:true}).limit(300);
   if(!box.isConnected||gen!==loading)return;
   if(r.error){status.textContent='No pudimos cargar los mensajes. Pulsa Actualizar conversación.';return;}
   box.querySelector('[data-sales-chat-log]').innerHTML=(r.data||[]).map(m=>`<p class="sales-bubble ${m.autor_id===actor?'is-own':''}"><strong>${m.autor_id===actor?'Tú':'La otra persona'}</strong><span>${esc(m.texto)}</span><small>${esc(new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(m.creado_en)))}</small></p>`).join('')||'<p class="market-muted">Continúa aquí la conversación sobre este producto.</p>';
  }
  form.addEventListener('submit',async e=>{
   e.preventDefault();e.stopPropagation();if(busy||!form.reportValidity())return;const text=form.elements.texto.value.trim();if(!text)return;
   busy=true;const b=form.querySelector('[type=submit]');b.disabled=true;status.textContent='Enviando…';
   try{
    const a=await db.auth.getUser();if(a.data?.user?.id!==actor)throw Error();
    const r=await db.from('ventas_mensajes').insert({consulta_id:consulta.id,texto:text});if(r.error)throw r.error;
    if(!box.isConnected)return;form.reset();status.textContent='Mensaje enviado.';await refresh();
   }catch{if(box.isConnected)status.textContent='No pudimos confirmar el envío. Actualiza la conversación antes de reintentar.';}
   finally{busy=false;b.disabled=false;}
  });box.querySelector('[data-sales-chat-refresh]').addEventListener('click',refresh);await refresh();
 }
 db.auth.onAuthStateChange(()=>document.querySelectorAll('[data-sales-chat]').forEach(n=>n.remove()));
 window.auraLadraVentasChat={montar};
})();

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const code=await readFile(new URL('../js/servicios.js',import.meta.url),'utf8');
const views=await readFile(new URL('../js/vistas.js',import.meta.url),'utf8');
const photos=await readFile(new URL('../js/servicios-fotos.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,0));};
const initial=[
  {id:'s1',propietario_id:'provider',titulo:'Baño y cepillado',prestador:'Cuidados del barrio',categoria:'estetica',zona:'Maipú',modalidad:'local',precio_clp:25000,precio_tipo:'desde',duracion_min:60,descripcion:'Baño y cepillado según tamaño y pelaje.',publicado:true},
  {id:'s2',propietario_id:'provider',titulo:'Entrenamiento con refuerzo positivo',prestador:'Educación canina',categoria:'entrenamiento',zona:'Providencia',modalidad:'domicilio',precio_clp:null,descripcion:'Sesiones personalizadas de acompañamiento.',publicado:true},
];
async function app({actor='buyer',missing=false,commitThenFail=false,serviceCommitThenFail=false,uploadFail=false,services=initial}={}){
 const dom=new JSDOM(html,{url:'https://ladra.test/#servicios',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false});
 w.URL.createObjectURL=()=> 'blob:preview';w.URL.revokeObjectURL=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 const store={servicios:structuredClone(services).map(s=>({revision:1,precio_tipo:'desde',...s})),servicio_consultas:[]},calls=[],files=new Map();let callback;
 const pet={id:'pet1',nombre:'Luna',es_conmemorativa:false};
 w.auraLadraRed={propias:()=>actor?[pet,{id:'memorial',nombre:'Recuerdo',es_conmemorativa:true}]:[],sesion:()=>actor?{user:{id:actor}}:null};
 w.auraLadraDb={auth:{getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}}),onAuthStateChange:fn=>{callback=fn;}},from(table){
  const q={table,op:'select',filters:[],select(){return this;},order(){return this;},limit(){return this;},eq(k,v){this.filters.push([k,v]);return this;},single(){this.one=true;return this;},maybeSingle(){this.one=true;return this;},insert(payload){this.op='insert';this.payload=payload;return this;},update(payload){this.op='update';this.payload=payload;return this;},then(resolve,reject){return Promise.resolve().then(()=>{
   calls.push({table,op:this.op,payload:this.payload});
   if(missing)return {error:{code:'42P01'}};
   let rows=store[table];
   if(this.op==='insert'){
    if(table==='servicio_consultas'&&rows.some(r=>r.solicitud_clave===this.payload.solicitud_clave))return {error:{code:'23505'}};
    if(table==='servicios'&&rows.some(r=>r.creacion_clave===this.payload.creacion_clave))return {error:{code:'23505'}};
    const row={revision:1,...this.payload,id:'new'+rows.length,propietario_id:actor,publicado:true};
    if(table==='servicio_consultas')Object.assign(row,{solicitante_id:actor,prestador_id:'provider',mascota_nombre:'Luna',servicio_titulo:'Baño y cepillado',estado:'pendiente'});
    rows.push(row);
    if(table==='servicio_consultas'&&commitThenFail){commitThenFail=false;throw Error('Respuesta perdida');}
    if(table==='servicios'&&serviceCommitThenFail){serviceCommitThenFail=false;throw Error('Respuesta perdida');}
    return {data:structuredClone(row)};
   }
   rows=rows.filter(r=>this.filters.every(([k,v])=>r[k]===v));
   if(table==='servicio_consultas')rows=rows.filter(r=>r.solicitante_id===actor||r.prestador_id===actor);
   if(this.op==='update')rows.forEach(r=>Object.assign(r,this.payload,{revision:r.revision+1}));
   return {data:this.one?rows[0]:structuredClone(rows)};
  }).then(resolve,reject);}};return q;
 }};
 w.auraLadraDb.storage={from:()=>({getPublicUrl:path=>({data:{publicUrl:'https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/servicios-ladra/'+path}}),upload:async(path,blob)=>{calls.push({op:'upload',path});if(uploadFail)return {error:{message:'No conexión'}};files.set(path,blob);return {data:{path}}},download:async path=>files.has(path)?{data:files.get(path)}:{error:{message:'No existe'}},remove:async paths=>{calls.push({op:'remove',paths});for(const path of paths)if(!store.servicios.some(s=>s.foto_path===path))files.delete(path);return {data:[]}}})};
 w.eval(photos);w.auraLadraServiciosFotos.prepare=async()=>new w.Blob(['webp'],{type:'image/webp'});
 w.eval(views);w.eval(code);await flush();
 return {w,doc,store,calls,files,close:()=>w.close(),setUser:async id=>{actor=id;callback('SIGNED_OUT',id?{user:{id}}:null);await flush();}};
}
function input(a,selector,value){const el=a.doc.querySelector(selector);el.value=value;el.dispatchEvent(new a.w.Event('input',{bubbles:true}));}
function submit(a,form,button){form.dispatchEvent(new a.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button||form.querySelector('[type=submit]')}));}
function inquiry(a){a.doc.querySelector('[data-service-open=s1]').click();a.doc.querySelector('[data-service-inquire]').click();const form=a.doc.querySelector('[data-service-inquiry-form]');form.elements.dia_preferido.value='2027-01-15';form.elements.mensaje.value='Quiero consultar un baño para Luna.';return form;}

test('Servicios tiene ruta propia, filtros combinados, condiciones y retorno de foco',async()=>{
 const a=await app();try{
 assert.equal(a.doc.body.dataset.vista,'servicios');assert.equal(a.doc.querySelectorAll('.service-card').length,2);
 input(a,'[name=busqueda]','BANO');assert.equal(a.doc.querySelectorAll('.service-card').length,1);
 input(a,'[name=zona]','providencia');assert.equal(a.doc.querySelectorAll('.service-card').length,0);
 input(a,'[name=zona]','');input(a,'[name=busqueda]','');input(a,'[name=precio]','26000');assert.equal(a.doc.querySelectorAll('.service-card').length,1);
 const opener=a.doc.querySelector('[data-service-open=s1]');opener.click();assert.equal(a.doc.querySelector('[data-service-dialog]').open,true);
 assert.match(a.doc.querySelector('[data-service-detail]').textContent,/tamaño y pelaje/);a.doc.querySelector('[data-service-close]').click();assert.equal(a.doc.activeElement,opener);
 }finally{a.close();}
});
test('Backend ausente informa preparación; ejemplos optativos no escriben',async()=>{
 const a=await app({missing:true});try{
 assert.match(a.doc.querySelector('[data-services-status]').textContent,/preparación/);assert.equal(a.doc.querySelectorAll('.service-card').length,0);
 a.doc.querySelector('[data-services-demo]').click();assert.equal(a.doc.querySelectorAll('.service-card').length,3);
 a.doc.querySelector('[data-service-open=ejemplo-estetica]').click();a.doc.querySelector('[data-service-inquire]').click();
 const form=a.doc.querySelector('[data-service-inquiry-form]');assert.equal(form.querySelector('[type=submit]').disabled,true);
 form.elements.dia_preferido.value='2027-01-15';form.elements.mensaje.value='Consulta en ejemplo de diseño';submit(a,form);await flush();assert.equal(a.calls.filter(c=>c.op==='insert').length,0);
 }finally{a.close();}
});
test('Sin sesión muestra acceso a cuenta y no admite consulta',async()=>{
 const a=await app({actor:null});try{
 a.doc.querySelector('[data-service-open=s1]').click();a.doc.querySelector('[data-service-inquire]').click();assert.equal(a.doc.querySelector('[data-service-inquiry-form]'),null);
 a.doc.querySelector('[data-service-login]').click();assert.equal(a.doc.querySelector('[data-service-dialog]').open,false);assert.equal(a.doc.body.dataset.vista,'cuenta');
 }finally{a.close();}
});
test('Envío vincula mascota real, excluye conmemorativas y aparece en bandeja',async()=>{
 const a=await app();try{
 const form=inquiry(a);assert.equal(form.elements.animal_id.options.length,1);submit(a,form);await flush();
 assert.match(form.textContent,/Consulta enviada/);assert.equal(a.store.servicio_consultas.length,1);assert.equal(a.store.servicio_consultas[0].animal_id,'pet1');
 a.doc.querySelector('[data-service-my-inquiries]').click();await flush();assert.match(a.doc.querySelector('[data-services-account-list]').textContent,/Luna/);assert.match(a.doc.querySelector('[data-services-account-list]').textContent,/Pendiente/);
 await a.setUser(null);assert.doesNotMatch(a.doc.querySelector('[data-services-account-list]').textContent,/Luna/);
 }finally{a.close();}
});
test('Reintentar tras respuesta de red perdida conserva clave y no duplica',async()=>{
 const a=await app({commitThenFail:true});try{
 const form=inquiry(a);submit(a,form);await flush();assert.match(a.doc.querySelector('[data-service-inquiry-message]').textContent,/no se duplica/);
 submit(a,form);await flush();assert.equal(a.store.servicio_consultas.length,1);assert.match(form.textContent,/Consulta enviada/);
 const inserts=a.calls.filter(c=>c.table==='servicio_consultas'&&c.op==='insert');assert.equal(inserts[0].payload.solicitud_clave,inserts[1].payload.solicitud_clave);
 }finally{a.close();}
});
test('Publicar servicio, retirarlo y volver a publicarlo',async()=>{
 const a=await app({actor:'provider'});try{
 a.doc.querySelector('[data-service-publish]').click();const f=a.doc.querySelector('[data-service-publish-form]');
 for(const [key,value] of Object.entries({titulo:'Paseos del barrio',prestador:'Persona responsable',zona:'Maipú',descripcion:'Paseo individual con condiciones acordadas.'}))f.elements[key].value=value;
 f.elements.precio_tipo.value='acordar';f.elements.precio_tipo.dispatchEvent(new a.w.Event('change'));f.elements.consentimiento.checked=true;submit(a,f);await flush();
 assert.equal(a.store.servicios.length,3);assert.equal(a.doc.querySelector('[data-service-publish-dialog]').open,false);
 const btn=a.doc.querySelector('[data-service-toggle=new2]');assert.ok(btn);btn.click();await flush();assert.equal(a.store.servicios[2].publicado,false);
 a.doc.querySelector('[data-service-toggle=new2]').click();await flush();assert.equal(a.store.servicios[2].publicado,true);
 }finally{a.close();}
});
test('Prestador responde en bandeja, tutor revisa su respuesta',async()=>{
 const a=await app();try{
 submit(a,inquiry(a));await flush();await a.setUser('provider');a.doc.querySelector('[data-services-panel=consultas]').click();await flush();
 const f=a.doc.querySelector('[data-service-response]');assert.ok(f);f.elements.respuesta.value='Tengo disponibilidad el día solicitado por $25.000.';submit(a,f);await flush();
 assert.equal(a.store.servicio_consultas[0].estado,'respondida');await a.setUser('buyer');await flush();assert.match(a.doc.querySelector('[data-services-account-list]').textContent,/Tengo disponibilidad/);
 }finally{a.close();}
});
test('Texto ajeno se escapa y foto insegura no se inserta',async()=>{
 const a=await app({services:[{...initial[0],titulo:'<img src=x onerror=alert(1)>',descripcion:'<script>bad()</script>',foto_url:'javascript:alert(1)'}]});try{
 assert.equal(a.doc.querySelector('.service-card h3 img'),null);assert.equal(a.doc.querySelector('.service-cover img'),null);
 a.doc.querySelector('[data-service-open=s1]').click();assert.equal(a.doc.querySelector('[data-service-detail] script'),null);assert.match(a.doc.querySelector('[data-service-detail]').textContent,/<script>/);
 }finally{a.close();}
});
test('Acceso a entrenamiento desde trucos y servicios desde ficha propia',async()=>{
 const a=await app();try{
 a.doc.querySelector('[data-services-training]').click();assert.equal(a.doc.body.dataset.vista,'servicios');assert.equal(a.doc.querySelectorAll('.service-card').length,1);
 a.doc.dispatchEvent(new a.w.CustomEvent('mascota:perfil',{detail:{animal:{id:'pet1'},puedeEditar:true}}));assert.ok(a.doc.querySelector('[data-pet-services]'));
 }finally{a.close();}
});

async function edit(a,id='s1'){
 a.doc.querySelector('[data-services-panel=consultas]').click();await flush();
 a.doc.querySelector(`[data-service-edit="${id}"]`).click();
 const form=a.doc.querySelector('[data-service-publish-form]');form.elements.consentimiento.checked=true;return form;
}
function choosePhoto(a,form,type='image/jpeg'){
 const file=new a.w.File(['image'],'foto.jpg',{type});
 Object.defineProperty(form.elements.foto_file,'files',{value:[file],configurable:true});
 form.elements.foto_file.dispatchEvent(new a.w.Event('change',{bubbles:true}));return file;
}
test('Editar precarga datos, conserva identidad y retiro, y actualiza precio y descripción',async()=>{
 const a=await app({actor:'provider',services:[{...initial[0],publicado:false}]});try{
 const f=await edit(a);assert.equal(f.elements.titulo.value,initial[0].titulo);assert.equal(a.doc.querySelector('#service-publish-title').textContent,'Editar servicio');
 f.elements.precio_clp.value='28000';f.elements.descripcion.value='Nueva descripción de baño y cepillado con condiciones.';submit(a,f);await flush();
 assert.equal(a.store.servicios.length,1);assert.equal(a.store.servicios[0].id,'s1');assert.equal(a.store.servicios[0].precio_clp,28000);assert.equal(a.store.servicios[0].publicado,false);
 assert.equal(a.store.servicios[0].revision,2);assert.equal(a.doc.querySelector('[data-service-publish-dialog]').open,false);
 }finally{a.close();}
});
test('Foto con vista previa, reemplazo, retiro y limpieza de archivos sin uso',async()=>{
 const a=await app({actor:'provider'});try{
 let f=await edit(a);choosePhoto(a,f);assert.equal(a.doc.querySelector('[data-service-photo-preview]').hidden,false);assert.equal(a.calls.filter(c=>c.op==='upload').length,0);
 submit(a,f);await flush();const first=a.store.servicios[0].foto_path;assert.match(first,/^provider\/.+\.webp$/);assert.ok(a.files.has(first));
 f=await edit(a);choosePhoto(a,f);submit(a,f);await flush();const second=a.store.servicios[0].foto_path;assert.notEqual(first,second);assert.equal(a.files.has(first),false);assert.ok(a.files.has(second));
 f=await edit(a);a.doc.querySelector('[data-service-photo-remove]').click();submit(a,f);await flush();assert.equal(a.store.servicios[0].foto_path,null);assert.equal(a.store.servicios[0].foto_url,null);assert.equal(a.files.size,0);
 }finally{a.close();}
});
test('Cancelar una selección no sube archivos; formato inválido se informa',async()=>{
 const a=await app({actor:'provider'});try{
 const f=await edit(a);choosePhoto(a,f,'image/svg+xml');assert.match(a.doc.querySelector('[data-service-publish-message]').textContent,/JPG/);
 choosePhoto(a,f);a.doc.querySelector('[data-service-publish-close]').click();assert.equal(a.files.size,0);assert.equal(a.calls.filter(c=>c.op==='upload').length,0);
 assert.throws(()=>a.w.auraLadraServiciosFotos.validate({type:'image/jpeg',size:21*1024*1024}),/20 MB/);
 }finally{a.close();}
});
test('Falla de subida conserva el servicio y permite reintentar',async()=>{
 const a=await app({actor:'provider',uploadFail:true});try{
 const f=await edit(a);choosePhoto(a,f);f.elements.precio_clp.value='28000';submit(a,f);await flush();assert.equal(a.store.servicios[0].precio_clp,25000);assert.match(a.doc.querySelector('[data-service-publish-message]').textContent,/subida/);assert.equal(f.querySelector('[type=submit]').disabled,false);
 }finally{a.close();}
});
test('Una edición desactualizada no sobrescribe los cambios de otra pestaña',async()=>{
 const a=await app({actor:'provider'});try{
 const f=await edit(a);a.store.servicios[0].revision=2;a.store.servicios[0].precio_clp=35000;f.elements.precio_clp.value='28000';submit(a,f);await flush();
 assert.equal(a.store.servicios[0].precio_clp,35000);assert.match(a.doc.querySelector('[data-service-publish-message]').textContent,/otra pestaña/);
 }finally{a.close();}
});
test('Respuesta de publicación perdida no duplica el servicio al reintentar',async()=>{
 const a=await app({actor:'provider',serviceCommitThenFail:true});try{
 a.doc.querySelector('[data-service-publish]').click();const f=a.doc.querySelector('[data-service-publish-form]');
 for(const [key,value]of Object.entries({titulo:'Nuevo servicio',prestador:'Prestador',zona:'Maipú',descripcion:'Descripción del servicio suficientemente larga.'}))f.elements[key].value=value;
 f.elements.precio_tipo.value='acordar';f.elements.precio_tipo.dispatchEvent(new a.w.Event('change'));f.elements.consentimiento.checked=true;submit(a,f);await flush();assert.equal(a.store.servicios.length,3);submit(a,f);await flush();assert.equal(a.store.servicios.length,3);assert.equal(a.doc.querySelector('[data-service-publish-dialog]').open,false);
 }finally{a.close();}
});

test('Refugio y transporte tienen accesos directos y precio explícito gratis o pagado',async()=>{
 const a=await app({actor:'provider'});try{
 a.doc.querySelector('[data-service-offer=refugio]').click();let f=a.doc.querySelector('[data-service-publish-form]');
 assert.equal(f.elements.categoria.value,'refugio');assert.equal(f.elements.titulo.value,'Refugio temporal');assert.equal(f.elements.precio_tipo.value,'');
 f.elements.prestador.value='Persona del barrio';f.elements.zona.value='Maipú';f.elements.descripcion.value='Puedo recibir mascotas temporalmente, previa coordinación.';f.elements.consentimiento.checked=true;
 assert.equal(f.reportValidity(),false);
 f.elements.precio_tipo.value='gratis';f.elements.precio_tipo.dispatchEvent(new a.w.Event('change'));assert.equal(f.elements.precio_clp.disabled,true);
 submit(a,f);await flush();assert.equal(a.store.servicios.at(-1).precio_clp,0);assert.equal(a.store.servicios.at(-1).precio_tipo,'fijo');
 a.doc.querySelector('[data-services-panel=catalogo]').click();assert.match(a.doc.querySelector('[data-services-list]').textContent,/Gratis/);assert.doesNotMatch(a.doc.querySelector('[data-services-list]').textContent,/Desde \$0/);
 a.doc.querySelector('[data-service-offer=transporte]').click();f=a.doc.querySelector('[data-service-publish-form]');assert.equal(f.elements.modalidad.value,'traslado');assert.equal(f.elements.categoria.value,'transporte');
 f.elements.prestador.value='Persona del barrio';f.elements.zona.value='Maipú';f.elements.descripcion.value='Traslados coordinados para mascotas dentro de la comuna.';f.elements.consentimiento.checked=true;
 f.elements.precio_tipo.value='fijo';f.elements.precio_tipo.dispatchEvent(new a.w.Event('change'));assert.equal(f.elements.precio_clp.required,true);assert.equal(f.reportValidity(),false);
 f.elements.precio_clp.value='10000';submit(a,f);await flush();assert.equal(a.store.servicios.at(-1).precio_clp,10000);assert.equal(a.store.servicios.at(-1).modalidad,'traslado');
 }finally{a.close();}
});
test('Solo gratis distingue cero de precio no definido y editar conserva esa elección',async()=>{
 const a=await app({actor:'provider',services:[{...initial[0],categoria:'refugio',precio_clp:0},{...initial[1],categoria:'transporte'}]});try{
 const cost=a.doc.querySelector('[data-services-filters] [name=costo]');cost.value='gratis';cost.dispatchEvent(new a.w.Event('change',{bubbles:true}));assert.equal(a.doc.querySelectorAll('.service-card').length,1);assert.match(a.doc.querySelector('.service-price').textContent,/Gratis/);
 const f=await edit(a);assert.equal(f.elements.precio_tipo.value,'gratis');assert.equal(f.elements.precio_clp.required,false);
 f.elements.descripcion.value='Descripción actualizada de refugio temporal gratuito.';submit(a,f);await flush();assert.equal(a.store.servicios[0].precio_clp,0);
 }finally{a.close();}
});

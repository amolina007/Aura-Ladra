// Comparte identidad y permisos del cliente del sitio. Nunca crea otra sesión.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first=data=>Array.isArray(data)?data[0]:data;
const must=r=>{if(r.error)throw r.error;return r.data;};
const noticia=item=>item.sitio==='atlas'&&/^[a-f0-9]{64}$/.test(item.noticia_id||'');
const native=(db,schema)=>db.schema(schema);
const perfil='Cuenta de Convergencia';
const uidActual=getUid=>getUid()||null;
async function publico(db,item){
 if(noticia(item))return true;
 if(!uuid.test(item.publicacion_id||''))throw {code:'22023',message:'Publicación no disponible.'};
}
async function generico(db,item,accion,params={}){
 return must(await native(db,'core').rpc('feed_compartido_dev',{p_sitio:item.sitio,p_publicacion_id:item.publicacion_id,p_accion:accion,...params}));
}
async function leerMuro(db,item){return first(must(await native(db,'public').rpc('history_wall_post',{p_id:item.publicacion_id})));}
async function leerRespuestas(db,item){return must(await native(db,'public').rpc('fn_respuestas_dev_question',{p_id:item.publicacion_id}));}
function ladraDestino(item){return item.imagen_bucket==='mascotas-medios'||item.origen_medio ? 'medio_id':'publicacion_id';}
async function comentarios(db,item,uid){
 if(noticia(item))return (must(await native(db,'public').from('atlas_dev_news_comments').select('id,body,author_name,created_at,user_id').eq('article_id',item.noticia_id).order('created_at',{ascending:false}).limit(50))||[]).reverse().map(c=>({id:c.id,alias:c.author_name||perfil,contenido:c.body,creado_en:c.created_at,propio:c.user_id===uid}));
 if(item.sitio==='muro00')return (must(await native(db,'public').rpc('history_wall_comments',{p_post:item.publicacion_id,p_limit:50}))||[]).map(c=>({id:c.id,alias:c.author_name,contenido:c.body,creado_en:c.created_at,propio:c.is_mine}));
 if(item.sitio==='respuestas'){const d=await leerRespuestas(db,item);return (d.comments||[]).map(c=>({id:c.id,alias:c.author,contenido:c.body,creado_en:c.created_at,propio:false}));}
 if(item.sitio==='ladra')return (must(await native(db,'ladra').from('comentarios_feed').select(uid?'id,autor_id,texto,creado_en':'id,texto,creado_en').eq(ladraDestino(item),item.publicacion_id).order('creado_en',{ascending:false}).limit(50))||[]).reverse().map(c=>({id:c.id,alias:c.autor_id===uid?'Tú':'Comunidad',contenido:c.texto,creado_en:c.creado_en,propio:c.autor_id===uid}));
 if(item.sitio==='armonia')return (must(await native(db,'musica').from('comentarios').select('id,autor_id,texto,creado_en').eq('publicacion_id',item.publicacion_id).order('creado_en',{ascending:false}).limit(50))||[]).reverse().map(c=>({id:c.id,alias:c.autor_id===uid?'Tú':'Comunidad',contenido:c.texto,creado_en:c.creado_en,propio:c.autor_id===uid}));
 return generico(db,item,'comentarios');
}
async function videoRitmos(db,item){
 const rows=must(await native(db,'public').rpc('ritmos_dev_videos_pasos',{p_paso:item.publicacion_id}))||[];
 const video=rows.find(r=>r.url===(item.video_url||item.url))||rows.find(r=>r.oficial)||rows[0];
 if(!video)throw {code:'22023',message:'El video ya no está disponible.'};return video;
}
async function stats(db,item,uid){
 if(noticia(item)){
  const n=first(must(await native(db,'public').rpc('atlas_dev_news_counts',{article_ids:[item.noticia_id]})))||{};
  const mine=uid?must(await native(db,'public').from('atlas_dev_news_likes').select('article_id').eq('article_id',item.noticia_id).eq('user_id',uid).limit(1)):[];
  return {me_gusta:Number(n.likes)||0,comentarios:Number(n.comments)||0,me_gusta_mio:!!mine?.length};
 }
 if(item.sitio==='muro00'){const p=await leerMuro(db,item);if(!p)throw {code:'22023'};return {me_gusta:p.likes,comentarios:p.comments,me_gusta_mio:p.liked};}
 if(item.sitio==='respuestas'){const d=await leerRespuestas(db,item);return {me_gusta:d.question.likes,comentarios:d.comments?.length||0,me_gusta_mio:d.question.liked};}
 const d=await generico(db,item,'estado');
 if(item.sitio==='ritmos'&&item.tipo==='paso'){const v=await videoRitmos(db,item);d.me_gusta=v.likes;d.me_gusta_mio=v.mi_like;}
 if(['ladra','armonia'].includes(item.sitio)){
  const schema=item.sitio==='ladra'?'ladra':'musica',table=item.sitio==='ladra'?'comentarios_feed':'comentarios',column=item.sitio==='ladra'?ladraDestino(item):'publicacion_id';
  const result=await native(db,schema).from(table).select('id',{count:'exact',head:true}).eq(column,item.publicacion_id);if(result.error)throw result.error;d.comentarios=result.count||0;
 }
 return d;
}
async function like(db,item,uid,activo){
 if(!uid)throw {code:'42501'};
 if(noticia(item)){
  const t=native(db,'public').from('atlas_dev_news_likes');
  must(await (activo?t.insert({article_id:item.noticia_id,user_id:uid}):t.delete().eq('article_id',item.noticia_id).eq('user_id',uid)));
 }else if(item.sitio==='ritmos'&&item.tipo==='paso'){const v=await videoRitmos(db,item);must(await native(db,'public').rpc('ritmos_dev_me_gusta_video',{p_video:v.video_id,p_me_gusta:activo}));}
 else if(item.sitio==='muro00')must(await native(db,'public').rpc('history_wall_like',{p_post:item.publicacion_id,p_liked:activo}));
 else if(item.sitio==='respuestas')must(await native(db,'public').rpc('fn_respuestas_dev_interact',{p_question:item.publicacion_id,p_action:'like',p_value:activo}));
 else {const d=await generico(db,item,'like',{p_activo:activo});return d;}
 const s=await stats(db,item,uid);return {me_gusta:s.me_gusta_mio,conteo:s.me_gusta};
}
async function comentar(db,item,uid,contenido){
 if(!uid)throw {code:'42501'};
 if(noticia(item)){const c=first(must(await native(db,'public').from('atlas_dev_news_comments').insert({article_id:item.noticia_id,user_id:uid,body:contenido}).select('id,body,author_name,created_at')));return {id:c.id,contenido:c.body,alias:c.author_name,creado_en:c.created_at,propio:true};}
 if(item.sitio==='muro00'){
  const id=crypto.randomUUID();must(await native(db,'public').rpc('history_wall_comment',{p_id:id,p_post:item.publicacion_id,p_body:contenido}));return (await comentarios(db,item,uid)).find(c=>c.id===id)||{id,contenido,alias:'Tú',creado_en:new Date().toISOString(),propio:true};
 }
 if(item.sitio==='respuestas'){const id=crypto.randomUUID();must(await native(db,'public').rpc('fn_respuestas_dev_interact',{p_question:item.publicacion_id,p_action:'comment',p_id:id,p_body:contenido}));return (await comentarios(db,item,uid)).find(c=>c.id===id);}
 if(item.sitio==='ladra'||item.sitio==='armonia'){
  const musica=item.sitio==='armonia',valores=musica?{publicacion_id:item.publicacion_id,texto:contenido,tipo:'sugerencia'}:{[ladraDestino(item)]:item.publicacion_id,autor_id:uid,texto:contenido};
  const c=first(must(await native(db,musica?'musica':'ladra').from(musica?'comentarios':'comentarios_feed').insert(valores).select('id,texto,creado_en')));
  return {id:c.id,contenido:c.texto,alias:'Tú',creado_en:c.creado_en,propio:true};
 }
 return generico(db,item,'comentar',{p_contenido:contenido});
}
async function borrar(db,item,id,uid){
 if(!uid||!uuid.test(id||''))throw {code:'42501'};
 if(noticia(item))return must(await native(db,'public').from('atlas_dev_news_comments').delete().eq('id',id).eq('article_id',item.noticia_id).eq('user_id',uid));
 if(item.sitio==='muro00')return must(await native(db,'public').rpc('history_wall_remove_comment',{p_id:id}));
 if(item.sitio==='ladra'||item.sitio==='armonia'){const m=item.sitio==='armonia';return must(await native(db,m?'musica':'ladra').from(m?'comentarios':'comentarios_feed').delete().eq('id',id).eq('autor_id',uid));}
 return generico(db,item,'eliminar',{p_comentario_id:id});
}
export function crearClienteInteracciones(db,item,getUid){return {async rpc(nombre,p){try{await publico(db,item);const uid=uidActual(getUid);let data;if(nombre==='feed_toggle_me_gusta')data=await like(db,item,uid,p.p_activo);else if(nombre==='feed_comentar')data=await comentar(db,item,uid,p.p_contenido);else if(nombre==='feed_comentarios')data=await comentarios(db,item,uid);else if(nombre==='feed_comentario_eliminar')data=await borrar(db,item,p.p_comentario_id,uid);else throw {code:'22023'};return {data,error:null};}catch(error){return {data:null,error};}}};}
// Solo los elementos de la página visible. Fallos de una fuente no bloquean otras.
export async function cargarContadores(db,items,uid){
 const resultado=await Promise.allSettled(items.slice(0,12).map(async item=>{await publico(db,item);return {...await stats(db,item,uid),sitio:item.sitio,publicacion_id:item.publicacion_id};}));
 return resultado.filter(r=>r.status==='fulfilled').map(r=>r.value);
}

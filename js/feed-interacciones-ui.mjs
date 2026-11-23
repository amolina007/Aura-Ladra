import { crearClienteInteracciones, cargarContadores } from './feed-interacciones-api.mjs';
const el=(tag,clase,texto)=>{const n=document.createElement(tag);if(clase)n.className=clase;if(texto!=null)n.textContent=texto;return n;};
const fechaLegible=v=>new Date(v).toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'});
export function crearInteracciones(item, obtenerUsuarioId, cliente) {
    const db = crearClienteInteracciones(cliente, item, obtenerUsuarioId);
    const datos = item.interacciones || {};
    const contenedor = el('section', 'feed-interacciones');
    contenedor.setAttribute('aria-label', 'Me gusta y comentarios');
    let likes = Number(datos.me_gusta) || 0;
    let comentarios = Number(datos.comentarios) || 0;
    let gusta = Boolean(datos.me_gusta_mio);
    let cargados = false;
    let enviandoLike = false;

    const acciones = el('div', 'feed-acciones');
    const botonLike = el('button', 'feed-accion feed-accion-like');
    const botonComentarios = el('button', 'feed-accion feed-accion-comentarios');
    const estado = el('p', 'feed-interacciones-estado');
    const panel = el('div', 'feed-comentarios-panel');
    const listaComentarios = el('div', 'feed-comentarios-lista');
    const formulario = el('form', 'feed-comentario-formulario');
    const campo = el('textarea', 'feed-comentario-campo');
    const publicar = el('button', 'feed-comentario-publicar', 'Publicar');

    botonLike.type = 'button';
    botonComentarios.type = 'button';
    botonComentarios.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    campo.maxLength = 1000;
    campo.rows = 3;
    campo.placeholder = 'Escribe un comentario…';
    campo.setAttribute('aria-label', 'Escribe un comentario público');
    publicar.type = 'submit';
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');

    function actualizarAcciones() {
      item.interacciones={...item.interacciones,me_gusta:likes,me_gusta_mio:gusta,comentarios};
      botonLike.textContent = `${gusta ? '♥ Te gusta' : '♡ Me gusta'} · ${likes}`;
      botonLike.classList.toggle('activo', gusta);
      botonLike.setAttribute('aria-pressed', String(gusta));
      botonComentarios.textContent = `Comentar · ${comentarios}`;
    }

    function avisoInicioSesion() {
      estado.replaceChildren(
        document.createTextNode('Inicia sesión para participar. '),
      );
      const enlace = el('a', '', 'Entrar');
      enlace.href = new URL('/mi-perfil.html', 'https://dev.core.convergenciaaura.cl').href;
      estado.append(enlace);
    }

    function mostrarComentario(comentario) {
      const fila = el('article', 'feed-comentario');
      const cabecera = el('div', 'feed-comentario-cabecera');
      cabecera.append(el('strong', '', comentario.alias || 'Cuenta de Convergencia'));
      if (comentario.creado_en) {
        cabecera.append(el('time', '', fechaLegible(comentario.creado_en)));
      }
      const texto = el('p', 'feed-comentario-texto', comentario.contenido || '');
      fila.append(cabecera, texto);

      if (comentario.propio && comentario.id) {
        const borrar = el('button', 'feed-comentario-borrar', 'Eliminar');
        borrar.type = 'button';
        borrar.setAttribute('aria-label', 'Eliminar mi comentario');
        borrar.addEventListener('click', async () => {
          const cuentaBorrar = obtenerUsuarioId();
          borrar.disabled = true;
          try {
            const { error } = await db.rpc('feed_comentario_eliminar', {
              p_comentario_id: comentario.id,
            });
            if (error) throw error;
            if (cuentaBorrar !== obtenerUsuarioId()) return;
            fila.remove();
            comentarios = Math.max(0, comentarios - 1);
            actualizarAcciones();
            estado.textContent = 'Comentario eliminado.';
          } catch {
            borrar.disabled = false;
            estado.textContent = 'No se pudo eliminar el comentario. Intenta de nuevo.';
          }
        });
        fila.append(borrar);
      }
      return fila;
    }

    async function cargarComentarios() {
      const cuenta = obtenerUsuarioId();
      listaComentarios.replaceChildren(el('p', 'feed-comentarios-cargando', 'Cargando comentarios…'));
      try {
        const { data, error } = await db.rpc('feed_comentarios', {
          p_sitio: item.sitio,
          p_publicacion_id: item.publicacion_id,
        });
        if (error) throw error;
        if (cuenta !== obtenerUsuarioId()) return;
        listaComentarios.replaceChildren();
        (Array.isArray(data) ? data : []).forEach(comentario => {
          listaComentarios.append(mostrarComentario(comentario));
        });
        if (!listaComentarios.childElementCount) {
          listaComentarios.append(el('p', 'feed-comentarios-vacio', 'Sé la primera persona en comentar.'));
        }
        cargados = true;
      } catch {
        listaComentarios.replaceChildren(el('p', 'feed-comentarios-error', 'No se pudieron cargar los comentarios.'));
      }
    }

    botonLike.addEventListener('click', async () => {
      const usuarioLike=obtenerUsuarioId();
      if (!usuarioLike) {
        avisoInicioSesion();
        return;
      }
      if (enviandoLike) return;
      enviandoLike = true;
      item.versionInteracciones=(item.versionInteracciones||0)+1;
      botonLike.disabled = true;
      try {
        const { data, error } = await db.rpc('feed_toggle_me_gusta', {
          p_sitio: item.sitio,
          p_publicacion_id: item.publicacion_id,
          p_activo: !gusta,
        });
        if (error) throw error;
        if(obtenerUsuarioId()!==usuarioLike)return;
        gusta = Boolean(data?.me_gusta);
        likes = Number(data?.conteo) || 0;
        actualizarAcciones();
        estado.textContent = '';
      } catch(error) {
        if(obtenerUsuarioId()!==usuarioLike)return;
        estado.textContent = error?.code==='42501'
          ? 'No se pudo autorizar el Me gusta con tu cuenta. Comprueba tu sesión; si continúa, avisa a soporte.'
          : error?.code==='22023' ? 'Esta publicación no está disponible para dar Me gusta desde Core.'
          : 'No se pudo actualizar el Me gusta. Intenta de nuevo.';
      } finally {
        enviandoLike = false;
        botonLike.disabled = false;
      }
    });

    botonComentarios.addEventListener('click', async () => {
      item.versionInteracciones=(item.versionInteracciones||0)+1;
      panel.hidden = !panel.hidden;
      botonComentarios.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden && !cargados) await cargarComentarios();
      if (!panel.hidden && !obtenerUsuarioId() && !formulario.isConnected) avisoInicioSesion();
    });

    formulario.addEventListener('submit', async evento => {
      evento.preventDefault();
      if (!obtenerUsuarioId()) {
        avisoInicioSesion();
        return;
      }
      const cuenta = obtenerUsuarioId();
      const texto = campo.value.trim();
      if (!texto) {
        campo.focus();
        return;
      }
      publicar.disabled = true;
      item.versionInteracciones=(item.versionInteracciones||0)+1;
      estado.textContent = 'Publicando comentario…';
      try {
        const { data, error } = await db.rpc('feed_comentar', {
          p_sitio: item.sitio,
          p_publicacion_id: item.publicacion_id,
          p_contenido: texto,
        });
        if (error) throw error;
        if (cuenta !== obtenerUsuarioId()) return;
        if (!data?.id) throw new Error('Comentario no recibido');
        if (!cargados) {
          listaComentarios.replaceChildren();
          cargados = true;
        }
        const vacioActual = listaComentarios.querySelector('.feed-comentarios-vacio');
        if (vacioActual) vacioActual.remove();
        listaComentarios.append(mostrarComentario(data));
        comentarios += 1;
        actualizarAcciones();
        campo.value = '';
        estado.textContent = 'Comentario publicado.';
      } catch (error) {
        if (cuenta !== obtenerUsuarioId()) return;
        estado.textContent = error?.code === '42501' ? 'El autor no permite comentar o tu cuenta no tiene acceso.' : error?.code === '22023' ? 'Revisa el texto del comentario y la disponibilidad de la publicación.' : 'No se pudo publicar. Revisa tu conexión e intenta de nuevo.';
      } finally {
        publicar.disabled = false;
      }
    });

    formulario.append(campo, publicar);
    panel.append(listaComentarios, formulario);
    acciones.append(botonLike);
    if (!item.soloMeGusta) acciones.append(botonComentarios);
    contenedor.append(acciones, estado, panel);
    actualizarAcciones();
    return contenedor;
  }

const sesiones=new WeakMap();
function estadoCliente(cliente){
 if(sesiones.has(cliente))return sesiones.get(cliente);
 const e={uid:null,hosts:new Map(),version:0};sesiones.set(cliente,e);
 e.listo=cliente.auth.getSession().then(({data})=>{if(e.version===0)e.uid=data?.session?.user?.id||null;});
 cliente.auth.onAuthStateChange((_evento,sesion)=>{
  e.version++;e.uid=sesion?.user?.id||null;
  for(const [n,item] of e.hosts){if(!n.isConnected){e.hosts.delete(n);continue;}item.interacciones={};n.replaceChildren(crearInteracciones(item,()=>e.uid,cliente));}
  setTimeout(()=>{for(const [n,item] of e.hosts)if(n.isConnected)montarInteracciones(n,item,cliente);},0);
 });return e;
}
function estilos(){const url=new URL('../css/feed-interacciones.css',import.meta.url).href;if(document.querySelector('link[data-feed-interacciones-css]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href=url;l.dataset.feedInteraccionesCss='';document.head.append(l);}
export async function montarInteracciones(nodo,item,cliente) {
 estilos();const e=estadoCliente(cliente);await e.listo;if(!nodo.isConnected)return;
 for(const host of e.hosts.keys())if(!host.isConnected)e.hosts.delete(host);
 e.hosts.set(nodo,item);const cuenta=e.uid;const stats=await cargarContadores(cliente,[item],cuenta);
 if(cuenta!==e.uid||!nodo.isConnected)return;
 item.interacciones=stats[0]||{};nodo.replaceChildren(crearInteracciones(item,()=>e.uid,cliente));
}

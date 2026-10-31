// Inicio: fotos y trucos de perfiles públicos guardados en Supabase.
// Publicaciones e historias compartidas. Solo las preferencias de lectura son locales.
(() => {
  'use strict';

  const root = document.querySelector('[data-feed]');
  if (!root) return;

  const KEY = 'auraladra.demo.feed.v1';
  const KEY_VISTAS = 'auraladra.demo.feed.vistas.v1';
  const HORAS_HISTORIA = 24;
  const fotos = window.auraLadraFeedFotos;
  const datos = window.auraLadraFeedDatos;

  const $ = (sel, el = document) => el.querySelector(sel);
  const listaEl = $('[data-feed-lista]', root);
  const historiasEl = $('[data-feed-historias]', root);
  const publicarBtn = $('[data-feed-publicar]', root);
  const demoEl = $('[data-feed-demo]', root);
  const dialog = $('[data-feed-dialog]');
  const form = $('[data-feed-form]');
  const msg = $('[data-feed-message]');
  const visor = $('[data-feed-historia-dialog]');

  let compartidos = [];
  let remotos = [];
  let ocupado = false;
  let editando = null;
  let foto = null;
  let lectura = 0;
  let operacion = null;
  let carga = 0;
  let errorMedios = false;
  let sesion = null;
  let mias = []; // mascotas propias [{id, nombre, especie, foto_url}]

  // ---------- Utilidades ----------
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const limpiar = (n) => String(n || '').replace(/\s*\(ejemplo\)\s*/i, '').trim() || '?';
  const inicial = (n) => limpiar(n).charAt(0).toUpperCase();
  const https = (u) => (typeof u === 'string' && /^(https:\/\/|data:image\/)/.test(u) ? u : '');
  const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const el = (tag, clase, texto) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  };
  const hace = (iso) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  };
  const guardar = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const leer = (k) => { try { return JSON.parse(window.localStorage.getItem(k)); } catch { return null; } };

  // Retirar ejemplos antiguos conservando las fotos reales que aún son locales.
  const estado = (() => {
    const anteriores = leer(KEY);
    const posts = Array.isArray(anteriores) ? anteriores.filter(p => p && !p.ejemplo && !String(p.id).startsWith('ej-')) : [];
    guardar(KEY, posts);
    const guardado = leer(KEY_VISTAS);
    const extra = Object.fromEntries(['megusta', 'denuncias', 'vistas'].map(k => [k, Array.isArray(guardado?.[k]) ? guardado[k] : []]));
    return { posts, extra, guardar() { guardar(KEY, this.posts); guardar(KEY_VISTAS, this.extra); } };
  })();

  const vigentes = () => {
    const limite = Date.now() - HORAS_HISTORIA * 3600000;
    return [...compartidos, ...remotos, ...estado.posts.filter(p => sesion && mias.some(m => m.id === p.mascota?.id) && !remotos.some(r => r.id === p.id))].filter((p) => !estado.extra.denuncias.includes(p.id) && (p.tipo !== 'historia' || new Date(p.creado).getTime() > limite));
  };

  // ---------- Avatares y medios ----------
  const fotoMascota = (m) => https(m.foto_url) || mias.find((x) => x.id === m.id)?.foto_url || '';
  const avatar = (m, clase = 'fd-avatar') => {
    const a = el('span', clase);
    a.setAttribute('aria-hidden', 'true');
    const foto = https(fotoMascota(m));
    if (foto) {
      const img = el('img');
      img.src = foto; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); a.textContent = inicial(m.nombre); });
      a.append(img);
    } else a.textContent = inicial(m.nombre);
    return a;
  };
  const medio = (p, clase = 'fd-medio') => {
    const caja = el('div', `${clase} tono-${(p.tono ?? 0) % 5}`);
    const img = https(p.imagen);
    if (https(p.video)) {
      const video = el('video');
      video.src = https(p.video);
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      video.setAttribute('aria-label', `Video de ${p.titulo || 'truco'} de ${limpiar(p.mascota.nombre)}`);
      caja.append(video);
    } else if (img) {
      const i = el('img');
      i.src = img; i.alt = `Foto de ${limpiar(p.mascota.nombre)}`; i.loading = 'lazy';
      caja.append(i);
    } else {
      const g = el('span', 'fd-glifo', inicial(p.mascota.nombre));
      g.setAttribute('aria-hidden', 'true');
      caja.append(g);
    }
    return caja;
  };

  // ---------- Historias ----------
  const gruposHistorias = () => {
    const mapa = new Map();
    vigentes().filter((p) => p.tipo === 'historia')
      .sort((a, b) => new Date(a.creado) - new Date(b.creado))
      .forEach((p) => { const k = p.mascota.id; if (!mapa.has(k)) mapa.set(k, { mascota: p.mascota, items: [] }); mapa.get(k).items.push(p); });
    return [...mapa.values()].sort((a, b) => new Date(b.items.at(-1).creado) - new Date(a.items.at(-1).creado));
  };

  const renderHistorias = () => {
    const grupos = gruposHistorias();
    const nodos = [];
    if (sesion && mias.length) {
      const nueva = el('button', 'fd-historia fd-historia-nueva');
      nueva.type = 'button'; nueva.dataset.feedNuevaHistoria = '';
      const aro = el('span', 'fd-aro'); const plus = el('span', 'fd-avatar fd-mas', '＋'); plus.setAttribute('aria-hidden', 'true'); aro.append(plus);
      nueva.append(aro, el('span', 'fd-nombre', 'Tu historia'));
      nodos.push(nueva);
    }
    grupos.forEach((g) => {
      const vista = g.items.every((i) => estado.extra.vistas.includes(i.id));
      const b = el('button', `fd-historia${vista ? ' es-vista' : ''}`);
      b.type = 'button'; b.dataset.feedHistoria = g.mascota.id;
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', `Historia de ${limpiar(g.mascota.nombre)}${vista ? ' (vista)' : ''}`);
      const aro = el('span', 'fd-aro'); aro.append(avatar(g.mascota));
      b.append(aro, el('span', 'fd-nombre', limpiar(g.mascota.nombre)));
      nodos.push(b);
    });
    historiasEl.replaceChildren(...nodos);
    historiasEl.hidden = nodos.length === 0;
  };

  // Visor de historias
  const V = { grupo: null, i: 0, timer: null };
  const barras = $('[data-fh-barras]', visor);
  const pararTimer = () => { window.clearTimeout(V.timer); V.timer = null; };
  const mostrarHistoria = () => {
    const it = V.grupo.items[V.i];
    if (!it) { visor.close(); return; }
    if (!estado.extra.vistas.includes(it.id)) { estado.extra.vistas.push(it.id); estado.guardar(); }
    $('[data-fh-avatar]', visor).replaceChildren(avatar(V.grupo.mascota, 'fd-avatar fh-av'));
    $('[data-fh-nombre]', visor).textContent = limpiar(V.grupo.mascota.nombre);
    $('[data-fh-hora]', visor).textContent = hace(it.creado);
    $('[data-fh-medio]', visor).replaceChildren(medio(it, 'fh-caja'));
    $('[data-fh-texto]', visor).textContent = it.texto || '';
    barras.replaceChildren(...V.grupo.items.map((_, k) => {
      const b = el('span', `fh-barra${k < V.i ? ' hecha' : ''}${k === V.i ? ' activa' : ''}`);
      b.append(el('span', 'fh-relleno'));
      return b;
    }));
    $('[data-fh-propias]', visor)?.remove();
    if ((it.remoto && it.autorId === sesion?.user.id) || (!it.remoto && !it.compartido)) {
      const acciones = controlesPropios(it); acciones.dataset.fhPropias = ''; visor.append(acciones);
    }
    pararTimer();
    if (!reducido()) V.timer = window.setTimeout(siguiente, 5000);
  };
  const siguiente = () => { if (V.i < V.grupo.items.length - 1) { V.i += 1; mostrarHistoria(); } else visor.close(); };
  const anterior = () => { if (V.i > 0) { V.i -= 1; mostrarHistoria(); } };
  const abrirHistorias = (mascotaId) => {
    const g = gruposHistorias().find((x) => x.mascota.id === mascotaId);
    if (!g) return;
    V.grupo = g;
    const sinVer = g.items.findIndex((i) => !estado.extra.vistas.includes(i.id));
    V.i = sinVer < 0 ? 0 : sinVer;
    if (!visor.open) visor.showModal();
    mostrarHistoria();
  };
  visor.addEventListener('close', () => { pararTimer(); renderHistorias(); });
  $('[data-fh-sig]', visor).addEventListener('click', siguiente);
  $('[data-fh-ant]', visor).addEventListener('click', anterior);
  $('[data-fh-cerrar]', visor).addEventListener('click', () => visor.close());
  visor.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') siguiente();
    else if (e.key === 'ArrowLeft') anterior();
  });

  // ---------- Publicaciones ----------
  const tarjeta = (p, personal = false) => {
    const art = el('article', 'fd-post');
    art.dataset.postId = p.id;
    const cab = el('header', 'fd-cab');
    const quien = el('div', 'fd-quien');
    quien.append(el('strong', '', limpiar(p.mascota.nombre)), el('small', '', p.compartido ? `Compartido en su perfil · ${hace(p.creado)}` : `de ${limpiar(p.autor || 'su familia')} · ${hace(p.creado)}`));
    cab.append(avatar(p.mascota), quien);
    const acciones = el('div', 'fd-acciones');
    const gusta = estado.extra.megusta.includes(p.id);
    const like = el('button', `fd-btn${gusta ? ' on' : ''}`);
    like.type = 'button'; like.dataset.feedLike = p.id;
    like.setAttribute('aria-pressed', String(gusta));
    like.setAttribute('aria-label', gusta ? 'Quitar me gusta' : 'Me gusta');
    like.append(el('span', '', gusta ? '♥' : '♡'), el('span', 'fd-n', String((p.likes || 0) + (gusta ? 1 : 0))));
    const den = el('button', 'fd-btn fd-denunciar');
    den.type = 'button'; den.dataset.feedDenunciar = p.id;
    den.setAttribute('aria-label', 'Denunciar esta publicación');
    den.textContent = 'Denunciar';
    acciones.append(like, den);
    art.append(cab, medio(p));
    if (p.titulo) {
      art.append(el('h3', 'fd-texto', p.titulo), el('p', 'fd-texto', p.estado === 'aprendido' ? 'Aprendido' : 'En práctica'));
    }
    if (p.texto) art.append(el('p', 'fd-texto', p.texto));
    if (!personal) art.append(acciones);
    if (p.remoto && p.autorId === sesion?.user.id) art.append(controlesPropios(p));
    else if (!p.remoto && !p.compartido) {
      art.append(el('p', 'fd-local', 'Guardada solo en este navegador.'));
      art.append(controlesPropios(p));
    }
    return art;
  };

  const renderLista = () => {
    const posts = vigentes().filter((p) => p.tipo === 'post').sort((a, b) => new Date(b.creado) - new Date(a.creado));
    if (!posts.length) {
      const v = el('div', 'fd-vacio');
      v.append(el('p', '', 'Todavía no hay publicaciones.'), el('p', 'fd-vacio-sub', sesion && mias.length ? 'Sé la primera persona en publicar algo de tu mascota.' : 'Inicia sesión y publica algo de tu mascota.'));
      listaEl.replaceChildren(v);
      return;
    }
    listaEl.replaceChildren(...posts.map(p => tarjeta(p)));
  };

  const render = () => {
    publicarBtn.hidden = !(sesion && mias.length);
    demoEl.hidden = false;
    demoEl.textContent = errorMedios ? 'No pudimos cargar todas las publicaciones. Vuelve a Inicio para reintentar.' : 'Publicaciones e historias compartidas entre dispositivos. Los me gusta y las ocultaciones se guardan en este navegador.';
    renderHistorias();
    renderLista();
  };

  // Leemos los medios existentes: no duplicamos archivos ni publicaciones en la base.
  const cargarCompartidos = async () => {
    const db = window.auraLadraDb;
    if (!db) return;
    const turno = ++carga;
    try {
      const publicaciones = await datos.cargar();
      const { data, error } = await db.from('medios_mascota')
        .select('id,tipo,titulo,estado,descripcion,ruta_archivo,creado_en,animales!inner(id,nombre,especie,foto_url,estado,mostrar_en_red)')
        .eq('animales.estado', 'publicado').eq('animales.mostrar_en_red', true)
        .order('creado_en', { ascending: false }).limit(100);
      if (turno !== carga) return;
      if (error) throw error;
      remotos = publicaciones;
      compartidos = (data || []).map((item) => {
        const url = db.storage.from('mascotas-medios').getPublicUrl(item.ruta_archivo).data.publicUrl;
        return {
          id: `medio-${item.id}`, tipo: 'post', compartido: true, mascota: item.animales,
          titulo: item.titulo, estado: item.estado, texto: item.descripcion || '',
          imagen: item.tipo === 'foto' ? url : '', video: item.tipo === 'video' ? url : '',
          creado: item.creado_en, likes: 0,
        };
      });
      errorMedios = false;
    } catch {
      if (turno !== carga) return;
      compartidos = [];
      errorMedios = true;
    }
    render();
    document.dispatchEvent(new CustomEvent('feed:cambio'));
  };
  document.addEventListener('trucos:actualizados', cargarCompartidos);
  document.addEventListener('vista:cambio', (event) => {
    if (event.detail?.vista === 'inicio') cargarCompartidos();
  });

  // ---------- Publicar, editar y encuadrar ----------
  const ajustes = () => ({ proporcion: Number(form.elements.encuadre.value), zoom: Number(form.elements.foto_zoom.value), x: Number(form.elements.foto_x.value), y: Number(form.elements.foto_y.value) });
  const preview = $('[data-feed-preview]', form);
  const mensaje = (texto, error = false) => { msg.textContent = texto; msg.className = `form-message${error ? ' is-error' : ''}`; };
  const mostrarRecorte = () => {
    if (!foto) return;
    try { fotos.dibujar(foto, preview, ajustes(), 480); } catch (error) { mensaje(error.message, true); }
  };
  const limpiarFoto = () => { lectura++; foto?.cerrar(); foto = null; $('[data-feed-recorte]', form).hidden = true; };
  const bloquear = valor => {
    ocupado = valor;
    for (const control of form.elements) control.disabled = valor;
    if (!valor && editando) { form.elements.mascota.disabled = true; for (const radio of form.elements.tipo) radio.disabled = true; }
    $('[data-feed-close]', dialog).disabled = valor;
  };
  form.addEventListener('input', () => { if (!ocupado) operacion = null; });
  form.elements.imagen.addEventListener('change', async () => {
    limpiarFoto(); operacion = null;
    const archivo = form.elements.imagen.files?.[0];
    if (!archivo) return;
    const turno = lectura;
    bloquear(true); mensaje('Abriendo foto…');
    try {
      const nueva = await fotos.abrir(archivo);
      if (turno !== lectura) { nueva.cerrar(); return; }
      foto = nueva; $('[data-feed-recorte]', form).hidden = false;
      $('[data-feed-foto-actual]', form).hidden = true;
      mostrarRecorte(); mensaje('Ajusta el encuadre antes de guardar.');
    } catch (error) { mensaje(error.message, true); }
    finally { bloquear(false); }
  });
  for (const nombre of ['encuadre', 'foto_zoom', 'foto_x', 'foto_y']) form.elements[nombre].addEventListener('input', mostrarRecorte);
  $('[data-feed-centrar]', form).addEventListener('click', () => {
    form.elements.foto_zoom.value = '1'; form.elements.foto_x.value = '0'; form.elements.foto_y.value = '0'; operacion = null; mostrarRecorte();
  });
  let arrastre = null;
  preview.addEventListener('pointerdown', event => {
    if (!foto || ocupado) return;
    arrastre = { x: event.clientX, y: event.clientY, inicio: ajustes(), rect: preview.getBoundingClientRect() };
    preview.setPointerCapture(event.pointerId);
  });
  preview.addEventListener('pointermove', event => {
    if (!arrastre || !foto || ocupado) return;
    const a = arrastre, r = fotos.rectangulo(foto.ancho, foto.alto, a.inicio.proporcion, a.inicio.zoom, a.inicio.x, a.inicio.y);
    const mover = (delta, tamaño, recorte, total, inicio) => Math.max(-100, Math.min(100, inicio - delta / Math.max(1, tamaño) * recorte / Math.max(1, total - recorte) * 200));
    form.elements.foto_x.value = String(mover(event.clientX - a.x, a.rect.width, r.w, foto.ancho, a.inicio.x));
    form.elements.foto_y.value = String(mover(event.clientY - a.y, a.rect.height, r.h, foto.alto, a.inicio.y));
    operacion = null; mostrarRecorte();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) preview.addEventListener(ev, () => { arrastre = null; });

  const abrirPublicar = (tipo = 'post', post = null) => {
    if (ocupado || !sesion || !mias.length) return;
    limpiarFoto(); form.reset(); editando = post; operacion = null;
    bloquear(false); mensaje('');
    form.elements.mascota.replaceChildren(...mias.map(m => { const o = el('option', '', limpiar(m.nombre)); o.value = m.id; return o; }));
    form.elements.tipo.value = post?.tipo || tipo;
    if (post) { form.elements.mascota.value = post.mascota.id; form.elements.texto.value = post.texto || ''; }
    const actual = $('[data-feed-foto-actual]', form);
    actual.hidden = !post?.imagen;
    if (post?.imagen) actual.src = https(post.imagen); else actual.removeAttribute('src');
    $('[id="feed-dialog-title"]', dialog).textContent = post ? (post.remoto ? 'Editar publicación' : 'Compartir publicación guardada') : 'Publicar';
    form.querySelector('[type="submit"]').textContent = post ? (post.remoto ? 'Guardar cambios' : 'Compartir entre dispositivos') : 'Publicar';
    $('[data-feed-publico]', form).textContent = post?.imagen ? 'Puedes conservar la foto actual o elegir otra para encuadrarla y reemplazarla.' : 'Visible en Inicio desde cualquier dispositivo. La mascota debe tener un perfil público.';
    dialog.showModal();
  };
  const controlesPropios = post => {
    const caja = el('div', 'fd-propias');
    caja.addEventListener('pointerdown', pararTimer);
    caja.addEventListener('focusin', pararTimer);
    const editar = el('button', 'fd-btn', post.remoto ? 'Editar' : 'Compartir entre dispositivos'); editar.type = 'button';
    editar.addEventListener('click', () => { if (visor.open) visor.close(); abrirPublicar(post.tipo, post); });
    const borrar = el('button', 'fd-btn', 'Eliminar'); borrar.type = 'button';
    borrar.addEventListener('click', () => {
      if (caja.querySelector('[data-feed-confirmar-borrado]')) return;
      const confirmar = el('button', 'fd-btn', 'Confirmar eliminación'); confirmar.type = 'button'; confirmar.dataset.feedConfirmarBorrado = '';
      const cancelar = el('button', 'fd-btn', 'Cancelar'); cancelar.type = 'button';
      cancelar.addEventListener('click', () => { confirmar.remove(); cancelar.remove(); });
      confirmar.addEventListener('click', async () => {
        if (ocupado) return;
        ocupado = true; confirmar.disabled = true;
        try {
          if (post.remoto) await datos.eliminar(post);
          else { estado.posts = estado.posts.filter(p => p.id !== post.id); estado.guardar(); }
          remotos = remotos.filter(p => p.id !== post.id);
          carga++;
          if (visor.open) visor.close();
          render(); document.dispatchEvent(new CustomEvent('feed:cambio'));
        } catch { confirmar.textContent = 'No se pudo eliminar. Reintentar'; }
        finally { ocupado = false; confirmar.disabled = false; }
      });
      caja.append(confirmar, cancelar);
    });
    caja.append(editar, borrar); return caja;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (ocupado || !sesion) return;
    const mascota = mias.find(m => m.id === form.elements.mascota.value);
    if (!mascota) return;
    const texto = form.elements.texto.value.trim();
    const archivo = form.elements.imagen.files?.[0];
    if (!texto && !archivo && !editando?.imagen) { mensaje('Agrega una foto o un texto.', true); return; }
    if (archivo && !foto) { mensaje('Vuelve a elegir la foto para poder abrirla y encuadrarla.', true); return; }
    bloquear(true); mensaje('Guardando publicación…');
    try {
      if (!operacion) {
        const clave = uuid();
        let blob = foto ? await fotos.preparar(foto, ajustes()) : null;
        if (!blob && editando && !editando.remoto && editando.imagen) {
          // Recuperar exclusivamente la copia local de esta mascota al pulsar Compartir.
          if (!/^data:image\/(jpeg|png|webp);base64,/.test(editando.imagen)) throw Error('Vuelve a elegir la foto para compartirla.');
          const original = await (await fetch(editando.imagen)).blob();
          const recuperada = await fotos.abrir(original);
          try { blob = await fotos.preparar(recuperada, { proporcion: 0, zoom: 1, x: 0, y: 0 }); } finally { recuperada.cerrar(); }
        }
        operacion = {
          id: editando?.remoto ? editando.id : (editando?.id && /^[0-9a-f-]{36}$/i.test(editando.id) ? editando.id : uuid()),
          autorId: sesion.user.id, animalId: mascota.id, tipo: form.elements.tipo.value,
          texto, clave, blob, editar: Boolean(editando?.remoto), revision: editando?.revision,
          ruta: blob ? `${sesion.user.id}/${mascota.id}/${clave}.jpg` : editando?.ruta || null,
          rutaAnterior: editando?.ruta || null,
        };
      }
      const guardado = await datos.guardar(operacion);
      if (sesion?.user.id !== operacion.autorId) throw Error('Tu sesión cambió. La publicación se guardó en la cuenta anterior.');
      remotos = [guardado, ...remotos.filter(p => p.id !== guardado.id)];
      carga++;
      if (editando && !editando.remoto) { estado.posts = estado.posts.filter(p => p.id !== editando.id); estado.guardar(); }
      bloquear(false); dialog.close(); limpiarFoto(); editando = null; operacion = null;
      render(); document.dispatchEvent(new CustomEvent('feed:cambio'));
    } catch (error) {
      const permiso = error?.code === '42501' || String(error?.statusCode) === '403';
      mensaje(permiso ? 'Solo puedes publicar con tus mascotas de perfil público. Revisa la visibilidad en Mi cuenta.' : (error instanceof Error ? error.message : 'No pudimos guardar la publicación. Comprueba tu conexión y reintenta; no se duplicará.'), true);
    } finally { bloquear(false); }
  });
  $('[data-feed-close]', dialog).addEventListener('click', () => { if (!ocupado) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (ocupado) event.preventDefault(); });
  dialog.addEventListener('close', () => { limpiarFoto(); editando = null; operacion = null; });

  // ---------- Eventos ----------
  root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-feed-publicar]')) { abrirPublicar('post'); return; }
    if (t.closest('[data-feed-nueva-historia]')) { abrirPublicar('historia'); return; }
    const h = t.closest('[data-feed-historia]');
    if (h) { abrirHistorias(h.dataset.feedHistoria); return; }
    const like = t.closest('[data-feed-like]');
    if (like) {
      const id = like.dataset.feedLike;
      const i = estado.extra.megusta.indexOf(id);
      if (i < 0) estado.extra.megusta.push(id); else estado.extra.megusta.splice(i, 1);
      estado.guardar(); renderLista();
      return;
    }
    const den = t.closest('[data-feed-denunciar]');
    if (den) {
      const id = den.dataset.feedDenunciar;
      const art = den.closest('.fd-post');
      // Confirmación en el mismo lugar (sin ventanas del navegador).
      const previa = art.querySelector('.fd-confirma');
      if (previa) { previa.remove(); return; }
      const c = el('div', 'fd-confirma');
      c.setAttribute('role', 'alert');
      c.append(el('span', '', '¿Ocultar esta publicación en este navegador?'));
      const si = el('button', 'fd-btn fd-si', 'Sí, denunciar'); si.type = 'button';
      const no = el('button', 'fd-btn', 'Cancelar'); no.type = 'button';
      si.addEventListener('click', () => { estado.extra.denuncias.push(id); estado.guardar(); renderLista(); renderHistorias(); });
      no.addEventListener('click', () => c.remove());
      c.append(si, no);
      art.append(c);
    }
  });

  document.addEventListener('mascotas:cambio', (e) => {
    mias = (e.detail?.animales || []).filter((a) => a?.id);
    render();
    cargarCompartidos();
  });

  const iniciar = async () => {
    try { sesion = (await window.auraLadraDb?.auth.getSession())?.data?.session || null; } catch { sesion = null; }
    window.auraLadraDb?.auth.onAuthStateChange((_ev, s) => {
      const cambio = sesion?.user.id !== s?.user.id;
      sesion = s;
      if (cambio) {
        carga++; mias = []; compartidos = []; remotos = [];
        if (dialog.open) dialog.close();
      }
      render(); window.setTimeout(cargarCompartidos, 0);
    });
    render();
  };
  render();
  iniciar();
  cargarCompartidos();

  // Para otras secciones (calendario): publicaciones visibles.
  window.auraLadraFeed = {
    posts: () => vigentes().map((p) => ({ ...p })),
    publicar: abrirPublicar,
    tarjetaPropia: p => tarjeta(p, true),
    propias: async () => {
      const usuario = sesion?.user.id;
      if (!usuario) return [];
      const publicaciones = await datos.cargar(usuario);
      if (sesion?.user.id !== usuario) return [];
      const locales = estado.posts.filter(p => mias.some(m => m.id === p.mascota?.id)
        && !publicaciones.some(r => r.id === p.id)
        && (p.tipo !== 'historia' || new Date(p.creado).getTime() > Date.now() - HORAS_HISTORIA * 3600000));
      return [...publicaciones, ...locales].sort((a, b) => new Date(b.creado) - new Date(a.creado));
    },
  };
})();

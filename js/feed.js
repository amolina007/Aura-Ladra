// Inicio: feed multimedia. Las mascotas publican (a través de quien las cuida) fotos e historias de 24 h.
// Primera versión: MODO DEMO. Todo se guarda solo en este navegador (localStorage); todavía no se usa
// Supabase ni almacenamiento de archivos. Los videos quedan para cuando exista almacenamiento.
// Moderación: cualquiera puede denunciar una publicación; en la demo la denuncia solo la oculta para quien denunció.
(() => {
  'use strict';

  const root = document.querySelector('[data-feed]');
  if (!root) return;

  const KEY = 'auraladra.demo.feed.v1';
  const KEY_VISTAS = 'auraladra.demo.feed.vistas.v1';
  const HORAS_HISTORIA = 24;
  const MAX_LADO = 960;

  const $ = (sel, el = document) => el.querySelector(sel);
  const listaEl = $('[data-feed-lista]', root);
  const historiasEl = $('[data-feed-historias]', root);
  const publicarBtn = $('[data-feed-publicar]', root);
  const demoEl = $('[data-feed-demo]', root);
  const dialog = $('[data-feed-dialog]');
  const form = $('[data-feed-form]');
  const msg = $('[data-feed-message]');
  const visor = $('[data-feed-historia-dialog]');

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

  // ---------- Datos de ejemplo ----------
  const haceH = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const semilla = () => ([
    { id: 'ej-1', ejemplo: true, tipo: 'post', mascota: { id: 'ej-luna', nombre: 'Luna (ejemplo)', especie: 'Perra' }, autor: 'Ana (ejemplo)', texto: 'Primera tarde de sol en el parque. Aprendí a esperar mi turno en el columpio de pasto.', imagen: '', tono: 0, creado: haceH(2), likes: 12 },
    { id: 'ej-2', ejemplo: true, tipo: 'historia', mascota: { id: 'ej-luna', nombre: 'Luna (ejemplo)', especie: 'Perra' }, autor: 'Ana (ejemplo)', texto: 'Paseo de las 7 🌅', imagen: '', tono: 2, creado: haceH(3), likes: 0 },
    { id: 'ej-3', ejemplo: true, tipo: 'historia', mascota: { id: 'ej-luna', nombre: 'Luna (ejemplo)', especie: 'Perra' }, autor: 'Ana (ejemplo)', texto: 'Hoy me bañaron y estoy digna.', imagen: '', tono: 1, creado: haceH(1), likes: 0 },
    { id: 'ej-4', ejemplo: true, tipo: 'post', mascota: { id: 'ej-canela', nombre: 'Canela (ejemplo)', especie: 'Perra' }, autor: 'Rosa (ejemplo)', texto: 'Canela, la perra de la plaza, ya tiene su puesto de agua nuevo. Gracias a quienes ayudaron 💧', imagen: '', tono: 3, creado: haceH(9), likes: 31 },
    { id: 'ej-5', ejemplo: true, tipo: 'historia', mascota: { id: 'ej-toby', nombre: 'Toby (ejemplo)', especie: 'Perro' }, autor: 'Diego (ejemplo)', texto: 'Mi primer encuentro con un gato. Fue... intenso.', imagen: '', tono: 4, creado: haceH(5), likes: 0 },
    { id: 'ej-6', ejemplo: true, tipo: 'post', mascota: { id: 'ej-toby', nombre: 'Toby (ejemplo)', especie: 'Perro' }, autor: 'Diego (ejemplo)', texto: 'Jornada de vacunación este sábado en la plaza. ¡Nos vemos en el calendario!', imagen: '', tono: 4, creado: haceH(30), likes: 8 },
  ]);

  const estado = (() => {
    let posts = leer(KEY);
    if (!Array.isArray(posts)) { posts = semilla(); guardar(KEY, posts); }
    let extra = leer(KEY_VISTAS);
    if (!extra || typeof extra !== 'object') extra = { megusta: [], denuncias: [], vistas: [] };
    return { posts, extra, guardar() { guardar(KEY, this.posts); guardar(KEY_VISTAS, this.extra); } };
  })();

  const vigentes = () => {
    const limite = Date.now() - HORAS_HISTORIA * 3600000;
    return estado.posts.filter((p) => !estado.extra.denuncias.includes(p.id) && (p.tipo !== 'historia' || new Date(p.creado).getTime() > limite));
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
    if (img) {
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
  const tarjeta = (p) => {
    const art = el('article', 'fd-post');
    art.dataset.postId = p.id;
    const cab = el('header', 'fd-cab');
    const quien = el('div', 'fd-quien');
    quien.append(el('strong', '', limpiar(p.mascota.nombre)), el('small', '', `de ${limpiar(p.autor || 'su familia')} · ${hace(p.creado)}`));
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
    if (p.texto) art.append(el('p', 'fd-texto', p.texto));
    art.append(acciones);
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
    listaEl.replaceChildren(...posts.map(tarjeta));
  };

  const render = () => {
    publicarBtn.hidden = !(sesion && mias.length);
    demoEl.hidden = false;
    renderHistorias();
    renderLista();
  };

  // ---------- Publicar ----------
  const reducirImagen = (archivo) => new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('lectura'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('imagen'));
      img.onload = () => {
        const k = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });

  const abrirPublicar = (tipo = 'post') => {
    if (!mias.length) return;
    msg.textContent = '';
    form.reset();
    form.elements.mascota.replaceChildren(...mias.map((m) => { const o = el('option', '', limpiar(m.nombre)); o.value = m.id; return o; }));
    form.elements.tipo.value = tipo;
    dialog.showModal();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mascota = mias.find((m) => m.id === form.elements.mascota.value);
    if (!mascota) return;
    const texto = form.elements.texto.value.trim();
    const archivo = form.elements.imagen.files?.[0] || null;
    if (!texto && !archivo) { msg.textContent = 'Agrega una foto o un texto.'; msg.className = 'form-message is-error'; return; }
    let imagen = '';
    if (archivo) {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) { msg.textContent = 'Usa una foto JPG, PNG o WebP.'; msg.className = 'form-message is-error'; return; }
      try { imagen = await reducirImagen(archivo); } catch { msg.textContent = 'No pudimos leer esa foto. Prueba con otra.'; msg.className = 'form-message is-error'; return; }
    }
    const post = {
      id: uuid(), tipo: form.elements.tipo.value === 'historia' ? 'historia' : 'post',
      mascota: { id: mascota.id, nombre: mascota.nombre, especie: mascota.especie, foto_url: '' },
      autor: 'Tú', texto, imagen, tono: Math.floor(Math.random() * 5), creado: new Date().toISOString(), likes: 0,
    };
    estado.posts.unshift(post);
    // La demo vive en localStorage: si no cabe, se avisa en vez de perder la publicación en silencio.
    if (!guardar(KEY, estado.posts)) {
      estado.posts.shift();
      msg.textContent = 'No hay espacio para guardar la foto en este navegador. Prueba con una más liviana.';
      msg.className = 'form-message is-error';
      return;
    }
    dialog.close();
    render();
    document.dispatchEvent(new CustomEvent('feed:cambio'));
  });
  $('[data-feed-close]', dialog).addEventListener('click', () => dialog.close());

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
      c.append(el('span', '', '¿Denunciar esta publicación? Moderación la revisará.'));
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
  });

  const iniciar = async () => {
    try { sesion = (await window.auraLadraDb?.auth.getSession())?.data?.session || null; } catch { sesion = null; }
    window.auraLadraDb?.auth.onAuthStateChange((_ev, s) => { sesion = s; if (!s) mias = []; render(); });
    render();
  };
  render();
  iniciar();

  // Para otras secciones (calendario): publicaciones visibles.
  window.auraLadraFeed = { posts: () => vigentes().map((p) => ({ ...p })) };
})();

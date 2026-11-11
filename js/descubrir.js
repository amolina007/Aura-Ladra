// Mi red y Descubrir: pestañas, filtros, y seguir / guardar perfiles de animales.
// Seguir y guardar usan funciones del servidor (migración 20261010000000, aún NO aplicada en ningún entorno).
// Si el servidor no las tiene, los botones quedan desactivados y lo explican: no se simula nada.
(() => {
  'use strict';
  const red = document.querySelector('#red');
  if (!red) return;
  const db = window.auraLadraDb;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const R = () => window.auraLadraRed;
  const hayCuenta = () => !!R()?.sesion?.()?.user;

  // ---------- Estado de seguidos / guardados ----------
  let estado = new Map();      // animal_id -> { seguido, guardado }
  let disponible = true;       // false si el servidor aún no tiene las funciones
  let cargaEstado = 0;
  const perfilesDueno = new Map();

  // Solo obtenemos el avatar del perfil Core cuando el dueño principal vinculó
  // y compartió esa identidad en Ladra (visibilidad ampliada).
  const perfilDueno = (animalId) => {
    if (perfilesDueno.has(animalId)) return perfilesDueno.get(animalId);
    const carga = (async () => {
      if (!db || !animalId) return null;
      const { data: humanos, error } = await db.rpc('humanos_visibles_de_animal', { p_animal_id: animalId });
      if (error) return null;
      const dueno = (humanos || []).find((persona) => persona.rol === 'dueno_principal');
      if (!dueno?.perfil_publico_id || !dueno.alias) return null;

      let foto = '';
      const { data: vinculados, error: errorVinculo } = await db.rpc('alias_core_de_humanos_visibles', { p_animal_id: animalId });
      const aliasCore = errorVinculo ? '' : (vinculados || []).find((persona) => persona.perfil_publico_id === dueno.perfil_publico_id)?.alias_core;
      if (aliasCore && db.schema && db.storage) {
        try {
          const { data: perfil } = await db.schema('core').from('perfiles').select('avatar_path').eq('alias', aliasCore).maybeSingle();
          if (perfil?.avatar_path) {
            const url = db.storage.from('core-avatars').getPublicUrl(perfil.avatar_path)?.data?.publicUrl || '';
            if (url.startsWith('https://')) foto = url;
          }
        } catch { foto = ''; }
      }
      return { alias: dueno.alias, foto };
    })().catch(() => null);
    perfilesDueno.set(animalId, carga);
    return carga;
  };

  const agregarAvatarDueno = (tile, animal) => {
    const badge = el('span', 'animal-owner-avatar');
    badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true');
    perfilDueno(animal.id).then((perfil) => {
      if (!perfil || !badge.isConnected) return;
      badge.textContent = perfil.alias.trim().charAt(0).toUpperCase();
      badge.title = `Perfil público de ${perfil.alias}`;
      badge.hidden = false;
      if (perfil.foto) {
        const image = el('img');
        image.src = perfil.foto;
        image.alt = '';
        image.loading = 'lazy';
        badge.replaceChildren(image);
      }
      tile.setAttribute('aria-label', `Conocer a ${animal.nombre}, mascota de ${perfil.alias}`);
    });
    tile.append(badge);
  };

  const faltaBackend = (e) => /PGRST20[25]|PGRST106|schema cache|Could not find|does not exist|404/i.test(`${e?.code || ''} ${e?.message || ''} ${e?.status || ''}`);

  const cargarEstado = async () => {
    const turno = ++cargaEstado;
    const usuario = R()?.sesion?.()?.user?.id;
    if (!db || !hayCuenta()) { estado = new Map(); redibujarSeguidos(); insertarBarra(); return; }
    try {
      const { data, error } = await db.rpc('mis_animales_seguidos');
      if (turno !== cargaEstado || usuario !== R()?.sesion?.()?.user?.id) return;
      if (error) { if (faltaBackend(error)) disponible = false; estado = new Map(); }
      else { disponible = true; estado = new Map((data || []).map((r) => [r.animal_id, { seguido: !!r.seguido, guardado: !!r.guardado }])); }
    } catch {
      if (turno !== cargaEstado || usuario !== R()?.sesion?.()?.user?.id) return;
      estado = new Map();
    }
    redibujarSeguidos();
    R()?.redibujar?.();
    actualizarBarraFicha();
  };

  // ---------- Pestañas ----------
  const tabs = red.querySelectorAll('[data-red-tab]');
  let vista = null;
  const mostrar = (nombre) => {
    vista = nombre;
    red.classList.toggle('ver-mi-red', nombre === 'mi-red');
    red.classList.toggle('ver-descubrir', nombre === 'descubrir');
    tabs.forEach((b) => { const on = b.dataset.redTab === nombre; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  };
  tabs.forEach((b) => {
    b.addEventListener('click', () => mostrar(b.dataset.redTab));
    b.addEventListener('keydown', (ev) => { if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return; const o = [...tabs].find((x) => x !== b); o.focus(); o.click(); });
  });
  mostrar('descubrir');

  // ---------- Filtros ----------
  const form = $('[data-desc-filtros]');
  const edadDe = (a) => {
    if (!a.fecha_nacimiento) return null;
    const n = new Date(`${a.fecha_nacimiento}T12:00:00`);
    if (Number.isNaN(n.getTime())) return null;
    return (Date.now() - n.getTime()) / (365.25 * 86400000);
  };
  const tramo = (anios) => (anios < 1 ? 'cachorro' : anios < 3 ? 'joven' : anios < 8 ? 'adulto' : 'mayor');
  const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const predicado = (a) => {
    if (!form) return true;
    const f = new FormData(form);
    const q = sinTildes(f.get('q')).trim();
    if (q && !sinTildes(`${a.nombre} ${a.raza || ''}`).includes(q)) return false;
    const zona = sinTildes(f.get('zona')).trim();
    if (zona && !sinTildes(a.zona_publica).includes(zona)) return false;
    if (f.get('especie') && a.especie !== f.get('especie')) return false;
    if (f.get('tamano') && a.tamano !== f.get('tamano')) return false;
    if (f.get('edad')) { const e = edadDe(a); if (e === null || tramo(e) !== f.get('edad')) return false; }
    if (f.get('guardados') && !estado.get(a.id)?.guardado) return false;
    return true;
  };
  const aplicarFiltro = () => R()?.redibujar?.();
  if (form) {
    form.addEventListener('input', aplicarFiltro);
    form.addEventListener('change', aplicarFiltro);
    form.addEventListener('reset', () => setTimeout(aplicarFiltro, 0));
    form.addEventListener('submit', (e) => e.preventDefault());
  }

  // ---------- «Animales que sigo» ----------
  function redibujarSeguidos() {
    const grupo = $('[data-animal-group="seguidos"]');
    const grid = $('[data-animal-grid="seguidos"]');
    const aviso = $('[data-seguir-aviso]');
    const lista = $('[data-desc-guardados-wrap]');
    if (lista) lista.hidden = !hayCuenta();
    if (!grupo || !grid) return;
    grupo.hidden = !hayCuenta();
    if (!hayCuenta()) { grid.replaceChildren(); return; }
    aviso.hidden = disponible;
    aviso.textContent = disponible ? '' : 'Seguir y guardar perfiles estará disponible próximamente.';
    const animales = (R()?.animales?.() || []).filter((a) => estado.get(a.id)?.seguido);
    if (!animales.length) {
      grid.replaceChildren(el('p', 'empty-state', disponible ? 'Aún no sigues a ningún animal. Abre un perfil en Descubrir y toca «Seguir».' : 'Cuando esté disponible, aquí verás los animales que sigues.'));
      return;
    }
    grid.replaceChildren(...animales.map((animal) => {
      const tile = R().tarjeta(animal);
      agregarAvatarDueno(tile, animal);
      return tile;
    }));
  }

  // ---------- Botones en la ficha del animal ----------
  const barraFicha = () => $('[data-pet-profile-view] .ficha-social');
  function actualizarBarraFicha() {
    const barra = barraFicha();
    const ficha = R()?.fichaActual?.();
    if (!barra || !ficha) return;
    const e = estado.get(ficha.id) || {};
    const seg = $('[data-ficha-seguir]', barra); const gua = $('[data-ficha-guardar]', barra);
    if (seg) { seg.textContent = e.seguido ? 'Siguiendo' : 'Seguir'; seg.setAttribute('aria-pressed', String(!!e.seguido)); seg.classList.toggle('is-on', !!e.seguido); seg.disabled = !disponible; }
    if (gua) { gua.textContent = e.guardado ? 'Guardado' : 'Guardar'; gua.setAttribute('aria-pressed', String(!!e.guardado)); gua.classList.toggle('is-on', !!e.guardado); gua.disabled = !disponible; }
    const nota = $('[data-ficha-nota]', barra);
    if (nota && disponible && nota.dataset.error !== '1') nota.textContent = '';
    if (nota && !disponible) nota.textContent = 'Seguir y guardar estará disponible próximamente.';
  }
  const alternar = async (campo) => {
    const usuario = R()?.sesion?.()?.user?.id;
    const ficha = R()?.fichaActual?.();
    const barra = barraFicha();
    if (!ficha || !barra || !db || !usuario) return;
    const nota = $('[data-ficha-nota]', barra);
    const actual = estado.get(ficha.id) || { seguido: false, guardado: false };
    const nuevo = !actual[campo];
    nota.dataset.error = '0'; nota.textContent = '';
    const { error } = await db.rpc(campo === 'seguido' ? 'seguir_animal' : 'guardar_animal', campo === 'seguido' ? { p_animal_id: ficha.id, p_seguir: nuevo } : { p_animal_id: ficha.id, p_guardar: nuevo });
    if (usuario !== R()?.sesion?.()?.user?.id) return;
    if (error) {
      if (faltaBackend(error)) disponible = false;
      nota.dataset.error = '1';
      nota.textContent = faltaBackend(error) ? 'Todavía no está disponible en el servidor.' : (error.message || 'No pudimos guardar el cambio. Intenta de nuevo.');
      actualizarBarraFicha();
      return;
    }
    estado.set(ficha.id, { ...actual, [campo]: nuevo });
    nota.textContent = campo === 'seguido' ? (nuevo ? `Ahora sigues a ${ficha.nombre}.` : `Dejaste de seguir a ${ficha.nombre}.`) : (nuevo ? 'Guardado en tus favoritos.' : 'Quitado de tus favoritos.');
    actualizarBarraFicha();
    redibujarSeguidos();
    if (form && new FormData(form).get('guardados')) R()?.redibujar?.();
  };
  const insertarBarra = () => {
    const vistaFicha = $('[data-pet-profile-view]');
    const ficha = R()?.fichaActual?.();
    if (!vistaFicha || !ficha) return;
    const usuario = R()?.sesion?.()?.user?.id || '';
    const propia = R().propias().some((a) => a.id === ficha.id);
    const anterior = barraFicha();
    if (anterior && anterior.dataset.usuario === usuario && anterior.dataset.animal === ficha.id && !propia) { actualizarBarraFicha(); return; }
    anterior?.remove();
    if (propia) return;   // las propias ya están en tu red
    const barra = el('div', 'ficha-social');
    barra.dataset.usuario = usuario;
    barra.dataset.animal = ficha.id;
    barra.setAttribute('role', 'group'); barra.setAttribute('aria-label', 'Seguir o guardar este perfil');
    if (!hayCuenta()) {
      barra.append(el('p', 'ficha-social-nota', 'Inicia sesión para seguir o guardar este perfil.'));
    } else {
      const seg = el('button', 'ficha-btn', 'Seguir'); seg.type = 'button'; seg.dataset.fichaSeguir = '';
      const gua = el('button', 'ficha-btn ficha-btn-sec', 'Guardar'); gua.type = 'button'; gua.dataset.fichaGuardar = '';
      seg.addEventListener('click', () => alternar('seguido'));
      gua.addEventListener('click', () => alternar('guardado'));
      const nota = el('p', 'ficha-social-nota'); nota.dataset.fichaNota = ''; nota.setAttribute('aria-live', 'polite');
      barra.append(seg, gua, nota);
    }
    const hero = vistaFicha.querySelector('.pet-profile-hero');
    if (hero) hero.after(barra); else vistaFicha.append(barra);
    actualizarBarraFicha();
  };
  const vistaFicha = $('[data-pet-profile-view]');
  if (vistaFicha) new MutationObserver(() => insertarBarra()).observe(vistaFicha, { childList: true });

  // ---------- Arranque ----------
  const iniciar = () => {
    if (R()) R().filtro = predicado;
    cargarEstado();
    if (hayCuenta()) mostrar('mi-red');
  };
  document.addEventListener('red:cambio', () => { if (R() && !R().filtro) R().filtro = predicado; redibujarSeguidos(); insertarBarra(); });
  document.addEventListener('sesion:cambio', () => { perfilesDueno.clear(); insertarBarra(); vigilarSesion(); });
  document.addEventListener('mascota:perfil', insertarBarra);
  // La sesión llega de forma asíncrona: cuando cambia, recargamos el estado y elegimos la pestaña.
  let sesionPrevia = null;
  const vigilarSesion = () => {
    const ahora = R()?.sesion?.()?.user?.id || null;
    if (ahora !== sesionPrevia) { sesionPrevia = ahora; estado = new Map(); insertarBarra(); if (ahora && vista === 'descubrir' && !red.dataset.tocoPestana) mostrar('mi-red'); cargarEstado(); }
  };
  document.addEventListener('red:cambio', vigilarSesion);
  tabs.forEach((b) => b.addEventListener('click', () => { red.dataset.tocoPestana = '1'; }));
  if (window.auraLadraRed) iniciar(); else window.addEventListener('load', iniciar);
  window.auraLadraDescubrir = { predicado, estado: () => new Map(estado) };
})();

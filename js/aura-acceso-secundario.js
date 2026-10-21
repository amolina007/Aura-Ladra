/*
 * aura-acceso-secundario.js — entrar con cualquiera de tus correos verificados.
 *
 * Cada correo extra de una identidad Aura tiene su propia «cuenta de acceso» en Supabase Auth.
 * Esa cuenta NO entra a nada (el hook del token le da rol anon). Cuando alguien inicia sesión
 * con ese correo, este módulo le pide al servidor (función aura-accesos, acción «canjear») un
 * token de un solo uso y con él abre la sesión de la identidad: el mismo perfil, historial,
 * Aura Coins y permisos de siempre.
 *
 * Uso: se carga después del cliente de Supabase del sitio y vigila solo las conexiones de Aura
 * (coreDb, auraClient, auraLadraDb, musicaDb, sorteosDb, ossDb, coloresDb).
 * Otros sitios (mismo proyecto Supabase): cargar este archivo y llamar
 *   AuraAccesoSecundario.vigilar(miClienteSupabase)
 * Para una página que no debe canjear (auth/confirmar-correo.html): window.AURA_SIN_CANJE = true.
 */
(() => {
  'use strict';

  const API = 'https://utilbunuziotzumuiayu.supabase.co/functions/v1/aura-accesos';
  const MARCAS = ['pendiente', 'secundario', 'revocado'];

  function claims(session) {
    try {
      const parte = String(session?.access_token || '').split('.')[1] || '';
      const b64 = parte.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    } catch (_e) {
      return {};
    }
  }

  /** ¿Esta sesión es de una cuenta de acceso (correo secundario o pendiente)? */
  function esSecundaria(session) {
    if (!session?.user) return false;
    const marca = session.user.app_metadata?.aura_acceso;
    const c = claims(session);
    return MARCAS.includes(marca) || c.aura_acceso === 'secundario' || (c.role && c.role !== 'authenticated');
  }

  const clientes = new Set(); // todas las conexiones vigiladas en esta página
  let enCurso = null; // un solo canje a la vez, aunque la página tenga varias conexiones
  const avisos = new Set();

  function avisar(estado) {
    avisos.forEach((f) => { try { f(estado); } catch (_e) { /* nada */ } });
  }

  /** Cambia la sesión de la cuenta de acceso por la de su identidad. Devuelve el estado final. */
  function canjear(client, session) {
    if (enCurso) return enCurso;
    const p = (async () => {
      avisar('canjeando');
      let respuesta = { status: 0, datos: {} };
      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'canjear' }),
          cache: 'no-store',
          credentials: 'omit',
        });
        respuesta = { status: r.status, datos: await r.json().catch(() => ({})) };
      } catch (_e) {
        avisar('error');
        return 'error';
      }
      const { status, datos } = respuesta;
      if (datos.estado === 'canjeado' && datos.token_hash) {
        const { data, error } = await client.auth.verifyOtp({ token_hash: datos.token_hash, type: 'magiclink' });
        if (error || !data?.session) {
          await client.auth.signOut({ scope: 'local' });
          avisar('error');
          return 'error';
        }
        // Las demás conexiones de la página pasan a la sesión de la identidad (misma persona).
        for (const otro of clientes) {
          if (otro === client) continue;
          await otro.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
        avisar('canjeado');
        return 'canjeado';
      }
      if (datos.estado === 'liberada') {
        // Era un correo con un pedido sin confirmar: ahora es una cuenta propia normal.
        await client.auth.refreshSession();
        avisar('normal');
        return 'liberada';
      }
      if (datos.estado === 'normal') {
        avisar('normal');
        return 'normal';
      }
      if (datos.estado === 'sin_acceso') {
        await client.auth.signOut({ scope: 'local' });
        avisar('sin_acceso');
        return 'sin_acceso';
      }
      // 401 u otro fallo (por ejemplo, otra conexión de la página ya canjeó esta sesión): no se toca nada.
      avisar(status === 401 ? 'normal' : 'error');
      return status === 401 ? 'normal' : 'error';
    })().finally(() => { enCurso = null; });
    enCurso = p;
    return p;
  }

  const vigilados = new WeakSet();

  function vigilar(client) {
    if (!client?.auth || vigilados.has(client)) return;
    vigilados.add(client);
    clientes.add(client);
    const revisar = (session) => {
      // Fuera del callback: supabase-js no permite llamar a auth dentro de onAuthStateChange.
      if (esSecundaria(session)) window.setTimeout(() => canjear(client, session), 0);
    };
    client.auth.onAuthStateChange((_evento, session) => revisar(session));
    client.auth.getSession().then(({ data }) => revisar(data?.session));
  }

  /** Para que una página reaccione (por ejemplo, mostrar «Conectando tu identidad…»). */
  function alCambiar(f) {
    if (typeof f === 'function') avisos.add(f);
  }

  window.AuraAccesoSecundario = Object.freeze({ esSecundaria, canjear, vigilar, alCambiar, claims });

  // Se engancha solo a las conexiones del sitio: Core (coreDb), la común (auraClient) y las propias
  // de cada sitio. Las que cargan después se enganchan al terminar de cargar la página.
  const NOMBRES = ['coreDb', 'auraClient', 'auraLadraDb', 'musicaDb', 'sorteosDb', 'ossDb', 'coloresDb'];
  function engancharPropios() {
    if (window.AURA_SIN_CANJE) return;
    NOMBRES.forEach((n) => { if (window[n]?.auth) vigilar(window[n]); });
  }
  engancharPropios();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', engancharPropios);
  window.addEventListener('load', engancharPropios);
})();

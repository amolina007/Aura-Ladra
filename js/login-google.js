(() => {
  'use strict';
  const db = window.auraLadraDb;
  const buttons = [...document.querySelectorAll('[data-login-google]')];
  const key = 'ladra-google-retorno';
  const allowed = ['inicio','servicios','cuenta','mapa','red','repertorio','ayudar','tienda','acciones','most-wanted','comida-agua'];
  let busy = false, signedIn = false, returned = false, authEvents = 0;
  const starting = new URL(window.location.href);
  const hash = new URLSearchParams(starting.hash.slice(1));
  const oauthError = starting.searchParams.get('error') || hash.get('error');
  const message = text => document.querySelectorAll('[data-login-google-message]').forEach(el => { el.textContent = text; });
  const readReturn = () => { try { return sessionStorage.getItem(key); } catch { return null; } };
  function clearReturn() { try { sessionStorage.removeItem(key); } catch {} }
  function reset() { busy = false; buttons.forEach(b => { b.disabled = signedIn; b.removeAttribute('aria-busy'); b.querySelector('span').textContent = 'Continuar con Google'; }); }
  function update(session) {
    signedIn = Boolean(session?.user);
    document.querySelectorAll('[data-login-google-zone]').forEach(zone => { zone.hidden = signedIn; });
    reset();
    if (signedIn && !returned && starting.searchParams.get('auth') === 'google' && !oauthError) {
      returned = true;
      const destination = readReturn(); clearReturn();
      const view = allowed.includes(destination) ? destination : 'cuenta';
      history.replaceState(null, '', window.location.pathname + '#' + view);
      window.auraLadraVistas?.mostrar(view, { desplazar: false });
    }
  }
  if (oauthError && (starting.searchParams.get('auth') === 'google' || readReturn())) {
    message(oauthError === 'access_denied' ? 'Cancelaste el acceso con Google. Puedes reintentarlo o entrar por correo.' : 'No pudimos completar el acceso con Google. Reintenta o entra por correo.');
    clearReturn(); history.replaceState(null, '', window.location.pathname + '#cuenta');
    window.auraLadraVistas?.mostrar('cuenta', { desplazar: false });
  }
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (busy || signedIn) return;
    busy = true; message(''); buttons.forEach(b => { b.disabled = true; b.setAttribute('aria-busy','true'); b.querySelector('span').textContent = 'Abriendo Google…'; });
    try {
      if (!db?.auth) throw Error('Sin conexión');
      const { data: current, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      if (current?.session?.user) { update(current.session); return; }
      const view = window.location.hash.slice(1);
      try { sessionStorage.setItem(key, allowed.includes(view) ? view : 'cuenta'); } catch {}
      const redirect = new URL(window.location.origin);
      redirect.pathname = window.location.pathname;
      redirect.searchParams.set('auth','google');
      const { error } = await db.auth.signInWithOAuth({ provider:'google', options:{redirectTo:redirect.href, scopes:'openid email profile', queryParams:{prompt:'select_account'}} });
      if (error) throw error;
    } catch {
      clearReturn(); message('No pudimos abrir Google. Revisa tu conexión o utiliza el acceso por correo.'); reset();
    }
  }));
  window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
  db?.auth?.onAuthStateChange((_event, session) => { authEvents++; queueMicrotask(() => update(session)); });
  const initialEvents = authEvents;
  db?.auth?.getSession().then(({data}) => { if (initialEvents === authEvents) update(data?.session); }).catch(() => {});
})();

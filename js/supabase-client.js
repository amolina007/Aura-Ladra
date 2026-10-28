(() => {
  'use strict';

  const SUPABASE_URL = 'https://utilbunuziotzumuiayu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yF7fkqR5YlWrwnGfyRP2gA_i2k5YiZh';

  if (!window.supabase?.createClient) {
    throw new Error('No se pudo cargar el cliente de Supabase.');
  }

  const COOKIE_DOMAIN = '.convergenciaaura.cl';
  const SHARED_STORAGE_KEY = 'convergencia-aura-auth';
  const LEGACY_STORAGE_KEY = 'sb-utilbunuziotzumuiayu-auth-token';

  // Solo en los sitios de Convergencia Aura se usa la cookie compartida.
  // En tu computador (localhost) o en una vista previa de Netlify se sigue
  // usando el almacenamiento normal del navegador, porque ahí la cookie no funciona.
  const enDominioAura = /(^|\.)convergenciaaura\.cl$/.test(window.location.hostname);

  // Mismo formato exacto que aura-auth.js: así Core y los demás sitios se entienden.
  const cookieStorage = {
    getItem: (key) => {
      const match = document.cookie.match(
        new RegExp('(?:^|; )' + key.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : null;
    },
    setItem: (key, value) => {
      const maxAge = 60 * 60 * 24 * 30;
      document.cookie =
        `${key}=${encodeURIComponent(value)}; domain=${COOKIE_DOMAIN}; path=/; max-age=${maxAge}; SameSite=Lax; Secure`;
    },
    removeItem: (key) => {
      document.cookie =
        `${key}=; domain=${COOKIE_DOMAIN}; path=/; max-age=0; SameSite=Lax; Secure`;
    },
  };

  // Recuperar una sesión anterior una sola vez. La sesión común tiene prioridad.
  // Borrar el respaldo evita que reaparezca después de cerrar sesión en otro sitio.
  if (enDominioAura) {
    try {
      const anterior = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!cookieStorage.getItem(SHARED_STORAGE_KEY) && anterior) {
        const sesion = JSON.parse(anterior);
        if (sesion?.access_token && sesion?.refresh_token) {
          cookieStorage.setItem(SHARED_STORAGE_KEY, anterior);
        }
      }
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (_e) { /* El navegador puede tener el almacenamiento bloqueado. */ }
  }

  window.auraLadraDb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: 'ladra' },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: enDominioAura ? SHARED_STORAGE_KEY : LEGACY_STORAGE_KEY,
        ...(enDominioAura ? { storage: cookieStorage } : {}),
      },
    },
  );

  // auraClient y auraLadraDb usan ahora la misma sesión compartida;
  // cada conexión conserva el esquema de datos que le corresponde.
})();

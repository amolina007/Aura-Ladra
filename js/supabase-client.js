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

  // Compatible con cookies simples y fragmentadas de los otros sitios Aura.
  const cookieStorage = window.auraLadraSesionCookie.crear(COOKIE_DOMAIN);

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

  // Una sola instancia renueva la sesión y procesa el retorno de Google/correo.
  // La navegación compartida consulta sus otros esquemas con .schema(...).
  // Crear dos clientes, aunque lean la misma cookie, duplica la renovación y
  // puede dejar los formularios con un estado distinto al de la cabecera.
  window.auraClient = window.auraLadraDb;
  window.auraSendMagicLink = async (email, returnTo) => {
    const { error } = await window.auraClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `https://convergenciaaura.cl/auth/callback.html?return_to=${encodeURIComponent(returnTo || window.location.href)}` },
    });
    return error;
  };
  window.auraSignOut = () => window.auraClient.auth.signOut();
})();

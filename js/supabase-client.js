(() => {
  'use strict';

  const SUPABASE_URL = 'https://utilbunuziotzumuiayu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yF7fkqR5YlWrwnGfyRP2gA_i2k5YiZh';

  if (!window.supabase?.createClient) {
    throw new Error('No se pudo cargar el cliente de Supabase.');
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
      },
    },
  );

  // Si el cliente compartido de convergenciaaura.cl está disponible,
  // heredamos su sesión. Si no carga por cualquier razón, el sitio
  // sigue funcionando normal con su propio login local.
  if (window.auraClient) {
    window.auraClient.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        window.auraLadraDb.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
    });
  }
})();

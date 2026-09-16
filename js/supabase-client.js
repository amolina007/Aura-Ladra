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
})();

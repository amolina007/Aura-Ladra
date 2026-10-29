// Conserva la sesión Aura y evita meter tokens del proveedor o perfiles duplicados en la cookie.
(() => {
  'use strict';
  function compactar(value) {
    let session;
    try { session = JSON.parse(value); } catch { return value; }
    if (!session?.access_token || !session?.refresh_token || !session?.user) return value;
    const user = session.user;
    const profile = {};
    for (const key of ['name','full_name','avatar_url','picture','email','email_verified','sub']) {
      const v = user.user_metadata?.[key];
      if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 500)) profile[key] = v;
    }
    const result = {};
    for (const key of ['access_token','refresh_token','expires_at','expires_in','token_type']) if (session[key] !== undefined) result[key] = session[key];
    result.user = { ...user, user_metadata: profile };
    if (Array.isArray(user.identities)) result.user.identities = user.identities.map(({id,identity_id,user_id,provider,created_at,updated_at}) => ({id,identity_id,user_id,provider,created_at,updated_at}));
    return JSON.stringify(result);
  }
  window.auraLadraSesionCookie = { compactar };
})();

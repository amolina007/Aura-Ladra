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
  // Aura puede escribir una cookie simple, partes numeradas (Ritmos) o partes
  // acompañadas por un contador .chunks (Convergencia). Auth vuelve a leerlas
  // al recuperar el foco: ignorar las partes equivale a perder la sesión.
  function crear(domain = '') {
    const suffix = `${domain ? `; domain=${domain}` : ''}; path=/; SameSite=Lax; Secure`;
    const cookies = () => new Map(document.cookie.split(/;\s*/).filter(Boolean).map(item => {
      const separador = item.indexOf('=');
      return [item.slice(0, separador), item.slice(separador + 1)];
    }));
    const nombres = key => [...cookies().keys()].filter(name => name === key || name === `${key}.chunks`
      || (name.startsWith(`${key}.`) && /^\d+$/.test(name.slice(key.length + 1))));
    const borrar = name => {
      document.cookie = `${name}=; max-age=0${suffix}`;
      if (domain) document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax; Secure`;
    };
    const storage = {
      getItem(key) {
        const saved = cookies();
        const contador = saved.get(`${key}.chunks`);
        let encoded;
        // Los escritores antiguos de Ritmos pueden dejar un contador viejo al
        // volver a una cookie simple. Nuestros escritores retiran la simple
        // cuando dividen la sesión, por lo que la simple presente tiene prioridad.
        if (saved.has(key)) encoded = saved.get(key);
        else if (contador !== undefined) {
          if (!/^[1-9]\d*$/.test(contador) || Number(contador) > 100) return null;
          const partes = [];
          for (let i = 0; i < Number(contador); i++) {
            const parte = saved.get(`${key}.${i}`);
            if (parte === undefined) return null;
            partes.push(parte);
          }
          encoded = partes.join('');
        } else {
          const indices = nombres(key).filter(name => /^\d+$/.test(name.slice(key.length + 1)))
            .map(name => Number(name.slice(key.length + 1))).sort((a, b) => a - b);
          if (!indices.length || indices.length > 100 || indices.some((n, i) => n !== i)) return null;
          encoded = indices.map(i => saved.get(`${key}.${i}`)).join('');
        }
        try { return decodeURIComponent(encoded); } catch { return null; }
      },
      setItem(key, value) {
        const compacto = compactar(value), encoded = encodeURIComponent(compacto);
        const previous = nombres(key), next = new Set();
        const partes = encoded.match(/.{1,3000}/g) || [''];
        const escribir = (name, data) => {
          // Retira posibles copias propias del host que puedan tapar la cookie compartida.
          if (domain) document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax; Secure`;
          document.cookie = `${name}=${data}; max-age=2592000${suffix}`;
          next.add(name);
        };
        partes.forEach((parte, i) => escribir(partes.length === 1 ? key : `${key}.${i}`, parte));
        if (partes.length > 1) escribir(`${key}.chunks`, String(partes.length));
        previous.filter(name => !next.has(name)).forEach(borrar);
        if (storage.getItem(key) !== compacto) throw Error('El navegador no permitió guardar la sesión. Revisa que las cookies estén habilitadas.');
      },
      removeItem(key) { nombres(key).forEach(borrar); },
    };
    return storage;
  }
  window.auraLadraSesionCookie = { compactar, crear };
})();

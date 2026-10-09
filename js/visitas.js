// Contador anónimo de visitas de Convergencia Aura: suma 1 a un número por día y sitio.
// No guarda IP, cookies ni identificadores. Respeta «No rastrear».
(function () {
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || /^dev\./.test(h) || /--/.test(h)) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try {
    if (sessionStorage.getItem('aura-visita-auraladra')) return;
    sessionStorage.setItem('aura-visita-auraladra', '1');
  } catch (e) {}
  try {
    fetch('https://utilbunuziotzumuiayu.supabase.co/rest/v1/rpc/fn_registrar_visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_yF7fkqR5YlWrwnGfyRP2gA_i2k5YiZh' },
      body: JSON.stringify({ p_proyecto: 'auraladra' }),
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();

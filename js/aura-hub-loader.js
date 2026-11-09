/* Un solo panel: Core dev en desarrollo; Core publicado en producción. */
(() => {
  'use strict';
  if (window.AuraHub || document.querySelector('script[data-aura-hub-core]')) return;
  const host = window.location.hostname;
  const dev = /^dev--[a-z0-9-]+\.netlify\.app$/.test(host) || /^dev(?:\.[a-z0-9-]+)?\.convergenciaaura\.cl$/.test(host) || ['localhost', '127.0.0.1', 'verde-dev-convergencia-aura.netlify.app', 'planvecinal-dev-convergencia-aura.netlify.app'].includes(host);
  const script = document.createElement('script');
  script.src = dev ? 'https://dev--convergencia-aura-core.netlify.app/js/aura-hub.js' : 'https://core.convergenciaaura.cl/js/aura-hub.js';
  script.defer = true;
  script.setAttribute('data-aura-hub-core', '');
  document.head.append(script);
})();

/* Site display identity: dev only; global Aura identity remains unchanged. */
(() => {
  const dev = /(^|[.-])dev([.-]|$)/i.test(location.hostname) || ['localhost','127.0.0.1'].includes(location.hostname);
  if (!dev || window.AuraSiteProfile || document.querySelector('script[data-site-profile-core]')) return;
  const script=document.createElement('script');script.src='https://dev--convergencia-aura-core.netlify.app/js/aura-site-profile.js';script.dataset.site='auraladra';script.dataset.siteProfileCore='';script.defer=true;document.head.append(script);
})();

/* Site display identity: dev only; global Aura identity remains unchanged. */
(() => {
  const dev = /(^|[.-])dev([.-]|$)/i.test(location.hostname) || ['localhost','127.0.0.1'].includes(location.hostname);
  if (!dev || window.AuraSiteProfile || document.querySelector('script[data-site-profile-core]')) return;
  const script=document.createElement('script');script.src='https://dev--convergencia-aura-core.netlify.app/js/aura-site-profile.js';script.dataset.site='auraladra';script.dataset.siteProfileCore='';script.defer=true;document.head.append(script);
})();

/* Ubicación efímera: cálculo local, sin almacenamiento ni envíos. */
(() => {
  let origin = null;
  const km = (a,b) => {
    const rad = x => x * Math.PI / 180;
    const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  };
  const refresh = () => document.querySelectorAll('[data-distance-lat]').forEach(badge => {
    if (!origin) return;
    const lat=Number(badge.dataset.distanceLat),lng=Number(badge.dataset.distanceLng);
    if (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) return;
    const distance=km(origin,{lat,lng});
    const label=distance.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
    if (badge.textContent !== label) badge.textContent=label;
    badge.hidden=false;
    badge.title='Distancia aproximada en línea recta desde tu ubicación al punto del aviso';
    badge.setAttribute('aria-label',label+' de ti, aproximadamente, en línea recta al punto del aviso');
  });
  const crear = place => {
    if (!Number.isFinite(place.latitud)||!Number.isFinite(place.longitud)) return null;
    const badge=document.createElement('span');badge.className='pet-distance';badge.hidden=true;
    badge.dataset.distanceLat=place.latitud;badge.dataset.distanceLng=place.longitud;
    return badge;
  };
  window.auraLadraDistancia={crear};
  const status = text => document.querySelectorAll('[data-distance-status]').forEach(el=>el.textContent=text);
  document.querySelectorAll('[data-use-location]').forEach(button=>button.addEventListener('click',()=>{
    if (!navigator.geolocation) {status('Este navegador no permite obtener tu ubicación.');return;}
    document.querySelectorAll('[data-use-location]').forEach(b=>b.disabled=true);
    status('Obteniendo tu ubicación…');
    navigator.geolocation.getCurrentPosition(position=>{
      origin={lat:position.coords.latitude,lng:position.coords.longitude};refresh();
      status('Distancias aproximadas en línea recta al punto de cada aviso. Tu ubicación no se guarda.');
      document.querySelectorAll('[data-use-location]').forEach(b=>{b.disabled=false;b.textContent='Actualizar mi ubicación';});
    },error=>{
      status(error.code===1?'Permiso de ubicación no concedido. Puedes habilitarlo en tu navegador.':'No pudimos obtener tu ubicación. Inténtalo nuevamente.');
      document.querySelectorAll('[data-use-location]').forEach(b=>b.disabled=false);
    },{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  }));
  new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
})();

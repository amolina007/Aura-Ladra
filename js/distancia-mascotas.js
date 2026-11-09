/* Ubicación efímera: cálculo local, sin almacenamiento ni envíos. */
(() => {
  let origin = null;
  const km = (a,b) => {
    const rad = x => x * Math.PI / 180;
    const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  };
  const distanceTo = (lat,lng) => origin && Number.isFinite(lat) && Number.isFinite(lng) ? km(origin,{lat,lng}) : Infinity;
  const refresh = () => { document.querySelectorAll('[data-distance-lat]').forEach(badge => {
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
    document.querySelectorAll('[data-sosafe-avisos] .wanted-grid').forEach(grid => {
      if (!origin) return;
      const before=Array.from(grid.children);
      const distance=card=>{const b=card.querySelector('[data-distance-lat]');return b ? distanceTo(Number(b.dataset.distanceLat),Number(b.dataset.distanceLng)) : Infinity;};
      const sorted=[...before].sort((a,b)=>distance(a)-distance(b));
      if (sorted.some((card,i)=>card!==before[i])) grid.append(...sorted);
    });
  };
  const crear = place => {
    if (!Number.isFinite(place.latitud)||!Number.isFinite(place.longitud)) return null;
    const badge=document.createElement('span');badge.className='pet-distance';badge.hidden=true;
    badge.dataset.distanceLat=place.latitud;badge.dataset.distanceLng=place.longitud;
    return badge;
  };
  window.auraLadraDistancia={crear, distanceTo};
  const status = (text,code='') => document.querySelectorAll('[data-distance-status]').forEach(el=>{el.textContent=text;el.dataset.locationState=code;});
  let pending=false;
  const request = (retry=false) => {
    if (!navigator.geolocation) {status('Este navegador no ofrece ubicación. Abre Ladra en un navegador con localización habilitada.','unsupported');return;}
    if (pending) return;
    pending=true;status(retry?'La ubicación tarda en responder. Reintentando…':'Permite tu ubicación para ver kilómetros y ordenar las mascotas cercanas.','pending');
    navigator.geolocation.getCurrentPosition(position=>{
      pending=false;
      origin={lat:position.coords.latitude,lng:position.coords.longitude};refresh();
      status('Ordenadas de más cerca a más lejos · distancia aproximada en línea recta.','ready');
      document.dispatchEvent(new CustomEvent('ubicacion:cambio'));
    },error=>{
      pending=false;
      if (error.code!==1 && !retry) {request(true);return;}
      const messages={1:'Ubicación no autorizada. Permítela en los ajustes del navegador y recarga el sitio.',2:'El navegador o dispositivo no pudo determinar tu ubicación. Revisa los servicios de localización del sistema.',3:'Se agotó el tiempo para obtener tu ubicación. Revisa la localización del dispositivo y recarga.'};
      status(messages[error.code] || 'La ubicación no está disponible en este navegador.',String(error.code));
    },{enableHighAccuracy:retry,timeout:retry?30000:15000,maximumAge:retry?300000:60000});
  };
  new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
  request();
})();

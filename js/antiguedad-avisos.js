(() => {
  const localDay = date => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const serial = day => {if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return NaN;const ms=Date.parse(day+'T12:00:00Z');return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===day ? ms : NaN;};
  window.auraLadraAntiguedad = (row, now=new Date()) => {
    let day,label='Anuncio',estimated=false;
    if (row.tipo_aviso==='perdida' && Number.isFinite(serial(row.fecha_extravio_info?.fecha))) {
      day=row.fecha_extravio_info.fecha;label='Perdido';estimated=row.fecha_extravio_info.precision!=='indicada';
    } else if (Number.isFinite(serial(row.fecha_avistamiento))) {day=row.fecha_avistamiento;label='Avistado';}
    else {const published=new Date(row.publicado_en);if (!Number.isFinite(published.getTime())) return '';day=localDay(published);}
    const days=Math.floor((serial(localDay(now))-serial(day))/86400000);
    if (!Number.isFinite(days)||days<0) return '';
    return `${label} · ${estimated?'≈ ':''}${days===0?'hoy':days+' '+(days===1?'día':'días')}`;
  };
})();

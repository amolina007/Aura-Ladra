"""Fechas con evidencia: nunca confundir una estimación con una fecha indicada."""
import datetime as dt
import re
import unicodedata
MONTHS={m:i+1 for i,m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}
def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD',value.lower()) if unicodedata.category(c)!='Mn')
def event_date(row, revisions=None):
    published=dt.datetime.fromisoformat(row['publicado_en']).date()
    review=(revisions or {}).get(row['id'],{}).get('fecha_extravio',{})
    if review.get('original_sha256') and review.get('original_sha256')==row.get('imagen_original_sha256'):
        try:
            day=dt.date.fromisoformat(review['fecha'])
            if day<=published:return {'fecha':day.isoformat(),'precision':'indicada','criterio':'afiche revisado','evidencia':review['evidencia'],'fuente_url':row.get('fuente_url','')}
        except (ValueError,KeyError):pass
    text=normalized(row.get('descripcion',''))
    anchor=r'(?:perdi[oó]|perdid[oa]|extrav[ií][oa]|escap[oe]|ultima vez|no (?:ha )?vuelt[oa]|desapareci[oó]|no llega|no la vemos|no lo vemos)'
    for event in re.finditer(anchor,text):
        fragment=text[event.end():event.end()+95].split('.')[0]
        numeric=re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(20\d{2}))?\b|\b(\d{1,2})-(\d{1,2})-(20\d{2})\b',fragment)
        if numeric and numeric[4]:
            numeric=re.search(r'(\d{1,2})-(\d{1,2})-(20\d{2})',numeric.group())
        written=re.search(r'\b(\d{1,2})\s+de\s+('+'|'.join(MONTHS)+r')(?:\s+(?:de\s+)?(20\d{2}))?\b',fragment)
        match=numeric or written
        if match and not re.search(r'\b(en|por|con|favor|corte|pelito|collar|vacunas|chip|castrado)\b',fragment[:match.start()]):
            day=int(match[1]);month=int(match[2]) if numeric else MONTHS[match[2]];year=int(match[3]) if match[3] else published.year
            try:
                value=dt.date(year,month,day)
                if value>published and not match[3] and published.month==1 and month==12:value=dt.date(year-1,month,day)
                if value<=published:return {'fecha':value.isoformat(),'precision':'indicada','criterio':'texto del aviso','evidencia':fragment.strip(),'fuente_url':row.get('fuente_url','')}
            except ValueError:pass
        relative=re.search(r'\b(anteayer|ayer|anoche|hoy)\b',fragment)
        days=re.search(r'(?:hace|desde hace)\s+(\d{1,2})\s+dias?\b',fragment)
        temporal=relative or days
        if temporal and not re.search(r'\b(en|por|con|favor|corte|pelito|collar|vacunas|chip|castrado)\b',fragment[:temporal.start()]):
            delta=int(days[1]) if days else {'anteayer':2,'ayer':1,'anoche':1,'hoy':0}[relative[1]]
            return {'fecha':(published-dt.timedelta(days=delta)).isoformat(),'precision':'estimada','criterio':'referencia relativa del aviso','evidencia':fragment.strip(),'fuente_url':row.get('fuente_url','')}
    return None

def group_date(rows,revisions=None):
    candidates=[x for x in (event_date(r,revisions) for r in rows) if x]
    explicit=[x for x in candidates if x['precision']=='indicada']
    selected=explicit or candidates
    if selected and len({x['fecha'] for x in selected})==1:return selected[0]
    first=min(rows,key=lambda r:r['publicado_en'])
    result={'fecha':dt.datetime.fromisoformat(first['publicado_en']).date().isoformat(),'precision':'estimada','criterio':'primera publicacion disponible','fuente_url':first.get('fuente_url','')}
    if selected:result.update(requiere_revision=True,fechas_en_conflicto=sorted({x['fecha'] for x in selected}))
    return result

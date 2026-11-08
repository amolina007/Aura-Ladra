"""Recolector público: diario del mapa -> widget oficial. Sin credenciales."""
import concurrent.futures
import datetime as dt
import json
import pathlib
import re
import sys
from sosafe_imagenes import enrich
from sosafe_duplicados import consolidate, expand
from sosafe_publicables import publicables
import unicodedata
import urllib.request
import urllib.error
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parents[1]
FEED = 'https://live-backend.s3-us-west-2.amazonaws.com/reports/reports.json'
API = 'https://api-v3.sosafeapp.com/widgets/report/'
DEST = ROOT / 'data/sosafe-maipu.json'

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.lower()) if unicodedata.category(c) != 'Mn')

def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)

def convert(report, now):
    if report.get('reportType', {}).get('id') != 32:
        return None
    if not re.search(r'\bmaipu\b', normalize(report.get('location', ''))):
        return None
    match = re.fullmatch(r'(\d{4}-\d\d-\d\d \d\d:\d\d) \(GMT([+-]\d\d:\d\d)\)', report.get('createdAt', ''))
    if not match:
        return None
    published = dt.datetime.fromisoformat(match[1] + match[2])
    if not dt.timedelta(0) <= now - published <= dt.timedelta(days=30):
        return None
    description = report.get('description', '').strip()
    if re.search(r'juguete\s*\(\s*gatito', normalize(description)):
        return None
    if not re.search(r'perdid|extrav|encontr|apareci|busc|desorient|retener|escap|abandon|adopci', normalize(description)):
        return None
    image = report.get('image', '')
    if not image.startswith('https://api.sosafeapp.com/reports/'):
        image = ''
    phones = []
    for value in re.findall(r'(?<!\d)(?:\+?56[\s-]*)?9(?:[\s-]*\d){8}(?!\d)', description):
        digits = re.sub(r'\D', '', value)
        phone = '+' + (digits if digits.startswith('56') else '56' + digits)
        if phone not in phones:
            phones.append(phone)
    return dict(id=report['uuid'], descripcion=description, publicado_en=published.isoformat(),
                zona=report['location'], autor_publicacion=report.get('user', {}).get('firstName', ''),
                celulares=phones, foto=image, fuente_url='https://www.widgets.sosafeapp.com/report/' + report['uuid'] + '?l=es',
                verificado_en=now.isoformat())

def prepare(rows):
    groups = consolidate(enrich(rows))
    visible = publicables(groups)
    ids = {row['id'] for row in visible}
    pending = ROOT / 'output/sosafe/pendientes-imagen.json'
    pending.parent.mkdir(parents=True, exist_ok=True)
    pending.write_text(json.dumps({'avisos': [r for r in groups if r['id'] not in ids]}, ensure_ascii=False, indent=2))
    return visible

def main():
    now = dt.datetime.now(ZoneInfo('America/Santiago'))
    if '--enrich-only' in sys.argv:
        data = json.loads(DEST.read_text())
        data['avisos'] = prepare(expand(data['avisos']))
        temp = DEST.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        temp.replace(DEST)
        print('Imágenes procesadas:', len(data['avisos']))
        return
    feed = get_json(FEED)
    if not isinstance(feed.get('features'), list) or not feed['features']:
        raise RuntimeError('Archivo diario vacío o incompatible; se conserva la versión anterior.')
    previous = json.loads(DEST.read_text()) if DEST.exists() else {'avisos': []}
    pending = ROOT / 'output/sosafe/pendientes-imagen.json'
    if pending.exists():
        previous['avisos'].extend(json.loads(pending.read_text()).get('avisos', []))
    previous['avisos'] = expand(previous['avisos'])
    ids = {r['id'] for r in previous['avisos']}
    coordinates = {r['id']: r.get('ubicacion_reporte') for r in previous['avisos']}
    for item in feed['features']:
        p = item['properties']
        if p['type'] == 32:
            lon, lat = map(float, item['geometry']['coordinates'])
            if -70.95 < lon < -70.70 and -33.65 < lat < -33.45:
                coordinates[p['uuid']] = {'lat': lat, 'lng': lon, 'precision': 'aproximada', 'fuente': FEED}
    # Prefiltro amplio: la comuna se confirma después en el detalle oficial.
    for item in feed['features']:
        p = item['properties']
        lon, lat = map(float, item['geometry']['coordinates'])
        if p['type'] == 32 and -70.95 < lon < -70.70 and -33.65 < lat < -33.45:
            ids.add(p['uuid'])
    rows, errors = [], []
    def fetch(uid):
        if not re.fullmatch(r'[a-f0-9-]{36}', uid):
            raise ValueError('Identificador inválido')
        try:
            data = get_json(API + uid + '?lang=es')
        except urllib.error.HTTPError as error:
            if error.code in (404, 410):
                return None  # Ya no está disponible públicamente: no republicar.
            raise
        if not data.get('success') or not data.get('report'):
            raise RuntimeError('Detalle no disponible')
        row = convert(data['report'], now)
        if row:
            row['ubicacion_reporte'] = coordinates.get(uid)
        return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch, uid): uid for uid in sorted(ids)}
        for future in concurrent.futures.as_completed(futures):
            try:
                row = future.result()
                if row:
                    rows.append(row)
            except Exception as error:
                errors.append({'id': futures[future], 'error': str(error)[:150]})
    if errors:
        path = ROOT / 'output/sosafe/errores.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(errors, indent=2))
        raise RuntimeError(f'{len(errors)} detalles fallaron; no se reemplaza el archivo publicado. Revisar output/sosafe/errores.json')
    consolidated = prepare(rows)
    result = {'actualizado_en': now.isoformat(), 'cobertura': 'Archivo diario público; acumulado desde el 6 de noviembre de 2026. No incluye todo el historial anterior.', 'avisos': consolidated}
    DEST.parent.mkdir(parents=True, exist_ok=True)
    temp = DEST.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temp.replace(DEST)
    print(json.dumps({'consultados': len(ids), 'avisos': len(consolidated), 'con_foto': sum(bool(r['foto']) for r in consolidated)}))

if __name__ == '__main__':
    main()

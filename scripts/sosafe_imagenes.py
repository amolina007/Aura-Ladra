"""Enriquecimiento local con Tesseract y detector de mascotas. Conserva fuente, evidencia y revisiones."""
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = pathlib.Path('/tmp/ladra-sosafe-vision-env/bin/python')
SOURCE = ROOT / 'scripts/sosafe-imagen.py'
CACHE = ROOT / 'output/sosafe/imagenes'


def phones(text):
    found = []
    for match in re.finditer(r'(?<!\d)(?:\+?56[\s.\u00a0-]*)?9(?:[\s.\u00a0-]*\d){8}(?!\d)', text):
        digits = re.sub(r'\D', '', match.group())
        value = '+' + (digits if digits.startswith('56') else '56' + digits)
        if value not in found:
            found.append(value)
    return found


def names(text):
    found = []
    for line in text.splitlines():
        match = re.match(r'^\s*(nombre(?: de la mascota)?|dueñ[oa]|responsable|contacto)\s*[:：]\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ -]{1,55})(?:$|\s*[+0-9])', line, re.I)
        if match:
            found.append({'etiqueta': match[1], 'nombre': match[2].strip(), 'evidencia': line})
    for match in re.finditer(r'(?:se llama|su nombre es|responde al nombre de|(?:ella|él|el) es (?:la|el))\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,35})', text, re.I):
        found.append({'etiqueta':'Nombre de la mascota', 'nombre':match[1], 'evidencia':match[0]})
    for match in re.finditer(r'([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,30})\s*:\s*(?:\+?56\s*)?9', text):
        if match[1].lower() not in ['telefono','teléfono','celular','contacto','llamar','whatsapp']:
            found.append({'etiqueta':'Contacto del afiche', 'nombre':match[1], 'evidencia':match[0]})
    return found


def enrich(rows):
    CACHE.mkdir(parents=True, exist_ok=True)
    photo_dir = ROOT / 'data/sosafe-fotos'
    photo_dir.mkdir(parents=True, exist_ok=True)
    if not BINARY.exists():
        raise RuntimeError('Ejecuta scripts/preparar-sosafe-imagenes.sh para instalar el lector local.')
    revisions_path = ROOT / 'data/sosafe-revisiones.json'
    revisions = json.loads(revisions_path.read_text()) if revisions_path.exists() else {}
    for row in rows:
        # Texto explícito, sin atribuir nombres de autor a la mascota.
        match = re.search(r'(?:se llama|su nombre es|responde al nombre de|(?:ella|él|el) es (?:la|el))\s+["“]?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,35})', row['descripcion'], re.I)
        row['nombre_mascota'] = match[1] if match else ''
        if not row.get('foto'):
            row['lectura_foto'] = {'estado': 'sin_foto'}
            continue
        key = hashlib.sha256((row['foto'] + SOURCE.read_text()).encode()).hexdigest()[:24]
        raw = CACHE / (key + '.original')
        record = CACHE / (key + '.json')
        dest = photo_dir / (key + '.jpg')
        try:
            if not raw.exists():
                with urllib.request.urlopen(row['foto'], timeout=30) as response:
                    if not response.headers.get('Content-Type','').startswith('image/'):
                        raise ValueError('La fuente no entregó una imagen')
                    data = response.read(20 * 1024 * 1024 + 1)
                    if len(data) > 20 * 1024 * 1024:
                        raise ValueError('Imagen supera 20 MB')
                    raw.write_bytes(data)
            if record.exists() and (dest.exists() or json.loads(record.read_text()).get('crop_status') != 'recortada'):
                result = json.loads(record.read_text())
            else:
                completed = subprocess.run([str(BINARY), str(SOURCE), str(raw), str(dest)], capture_output=True, text=True, check=True, timeout=90)
                result = json.loads(completed.stdout)
                record.write_text(json.dumps(result, ensure_ascii=False))
            text = '\n'.join(l['text'] for l in result['lines'])
            reliable = '\n'.join(l['text'] for l in result['lines'] if l['confidence'] >= 0.8)
            row['lectura_foto'] = {'estado':'leida', 'texto':text, 'celulares':phones(reliable),
                                   'nombres':names(text), 'requiere_revision':True}
            reviewed = revisions.get(row['id'], {})
            if reviewed.get('sha256') == hashlib.sha256(raw.read_bytes()).hexdigest():
                if reviewed.get('encuadre'):
                    subprocess.run([str(BINARY), str(ROOT / 'scripts/sosafe-recorte-revisado.py'), str(raw), str(dest), json.dumps(reviewed['encuadre'])], check=True, timeout=20)
                    result['crop_status'] = 'recortada'
                row['lectura_foto']['nombres'].extend(reviewed.get('nombres', []))
            if result['crop_status'] == 'recortada' and not (reviewed.get('sha256') == hashlib.sha256(raw.read_bytes()).hexdigest() and reviewed.get('recorte_sha256') == hashlib.sha256(dest.read_bytes()).hexdigest()):
                check = subprocess.run([str(BINARY), str(ROOT / 'scripts/sosafe-validar-recorte.py'), str(dest)], capture_output=True, text=True, check=True, timeout=20)
                if json.loads(check.stdout)['posible_logo']:
                    result['crop_status'] = 'revision_visual_pendiente'
            row['recorte_estado'] = result['crop_status']
            row['foto_mascota'] = 'data/sosafe-fotos/' + dest.name if result['crop_status'] == 'recortada' else ''
        except Exception as error:
            row['lectura_foto'] = {'estado':'error', 'detalle':str(error)[:180]}
            row['foto_mascota'] = ''
            row['recorte_estado'] = 'pendiente'
    return rows

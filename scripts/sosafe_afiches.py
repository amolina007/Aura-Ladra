"""Recorte rectangular real, aprobado por hash, cuando no hay silueta fiable."""
import hashlib
import json
import pathlib
import re
import sys
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]

def process(rows):
    revisions = json.loads((ROOT / 'data/sosafe-revisiones.json').read_text())
    approved = {v['afiche_recortado']['original_sha256']: v['afiche_recortado']
                for v in revisions.values() if v.get('afiche_recortado')}
    presentations = {v['presentacion_revisada']['original_sha256']: v['presentacion_revisada']
                     for v in revisions.values() if v.get('presentacion_revisada')}
    source = (ROOT / 'scripts/sosafe-imagen.py').read_text()
    for row in rows:
        if not row.get('foto'):
            continue
        key = hashlib.sha256((row['foto'] + source).encode()).hexdigest()[:24]
        raw = ROOT / 'output/sosafe/imagenes' / (key + '.original')
        if not raw.exists():
            continue
        digest = hashlib.sha256(raw.read_bytes()).hexdigest()
        presentation = presentations.get(digest, {})
        photo = presentation.get('foto', '')
        if re.fullmatch(r'data/sosafe-fotos/[a-f0-9]+\.png', photo):
            asset = ROOT / photo
            if asset.is_file() and hashlib.sha256(asset.read_bytes()).hexdigest() == presentation.get('imagen_sha256'):
                row.update(foto_mascota=photo, recorte_estado='sin_fondo', imagen_original_sha256=digest)
                continue
        if row.get('foto_mascota'):
            continue
        review = approved.get(digest)
        if not review:
            row['recorte_estado'] = 'encuadre_pendiente'
            continue
        box = review['encuadre']
        if len(box) != 4 or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
            raise ValueError('Encuadre revisado inválido')
        im = ImageOps.exif_transpose(Image.open(raw)).convert('RGB')
        im.thumbnail((2400, 2400))
        crop = im.crop(tuple(round(v * (im.width if i % 2 == 0 else im.height)) for i, v in enumerate(box)))
        # Solo recortar píxeles reales: no borrar, pintar ni reconstruir el sello.
        key = hashlib.sha256((digest + json.dumps(box) + 'afiche-v1').encode()).hexdigest()[:24]
        target = ROOT / 'data/sosafe-fotos' / (key + '.jpg')
        crop.save(target, quality=94)
        row['foto_mascota'] = 'data/sosafe-fotos/' + target.name
        row['imagen_original_sha256'] = digest
        row['recorte_estado'] = 'afiche_recortado'
    return rows

if __name__ == '__main__':
    path = pathlib.Path(sys.argv[1])
    data = json.loads(path.read_text())
    data['avisos'] = process(data['avisos'])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

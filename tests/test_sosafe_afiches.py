import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'scripts'))
import sosafe_afiches as afiches

class AficheTest(unittest.TestCase):
    def test_review_requires_exact_original_and_crop_preserves_real_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            for name in ['scripts', 'data/sosafe-fotos', 'output/sosafe/imagenes']:
                (root / name).mkdir(parents=True)
            (root / 'scripts/sosafe-imagen.py').write_text('test')
            row = {'id':'example', 'foto':'https://example.test/photo'}
            key = hashlib.sha256((row['foto'] + 'test').encode()).hexdigest()[:24]
            raw = root / 'output/sosafe/imagenes' / (key + '.original')
            im = Image.new('RGB', (100,100), 'white')
            for x in range(100):
                for y in range(80,100): im.putpixel((x,y),(255,0,120))
            im.save(raw,format='PNG')
            review = {'original_sha256':'wrong', 'encuadre':[0,0,1,.8]}
            path = root / 'data/sosafe-revisiones.json'
            with patch.object(afiches,'ROOT',root):
                path.write_text(json.dumps({'example':{'afiche_recortado':review}}))
                self.assertFalse(afiches.process([dict(row)])[0].get('foto_mascota'))
                review['original_sha256'] = hashlib.sha256(raw.read_bytes()).hexdigest()
                path.write_text(json.dumps({'example':{'afiche_recortado':review}}))
                out = afiches.process([dict(row)])[0]
                crop = Image.open(root / out['foto_mascota'])
                self.assertEqual(crop.size,(100,80))
                self.assertEqual(crop.getpixel((50,79)),(255,255,255))
                self.assertEqual(out['recorte_estado'],'afiche_recortado')

    def test_saved_silhouette_requires_matching_original_and_asset_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            for name in ['scripts', 'data/sosafe-fotos', 'output/sosafe/imagenes']:
                (root / name).mkdir(parents=True)
            (root / 'scripts/sosafe-imagen.py').write_text('test')
            row = {'id':'example', 'foto':'https://example.test/photo'}
            key = hashlib.sha256((row['foto'] + 'test').encode()).hexdigest()[:24]
            raw = root / 'output/sosafe/imagenes' / (key + '.original')
            Image.new('RGB', (10,10), 'white').save(raw, format='PNG')
            asset = root / 'data/sosafe-fotos/abc123.png'
            Image.new('RGBA', (10,10), (20,30,40,128)).save(asset)
            review = {'original_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
                      'imagen_sha256':'wrong', 'foto':'data/sosafe-fotos/abc123.png'}
            path = root / 'data/sosafe-revisiones.json'
            with patch.object(afiches, 'ROOT', root):
                path.write_text(json.dumps({'example':{'presentacion_revisada':review}}))
                self.assertFalse(afiches.process([dict(row)])[0].get('foto_mascota'))
                review['imagen_sha256'] = hashlib.sha256(asset.read_bytes()).hexdigest()
                path.write_text(json.dumps({'example':{'presentacion_revisada':review}}))
                self.assertEqual(afiches.process([dict(row)])[0]['foto_mascota'],review['foto'])
                raw.write_bytes(b'changed original')
                self.assertFalse(afiches.process([dict(row)])[0].get('foto_mascota'))

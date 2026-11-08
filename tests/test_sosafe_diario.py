import datetime as dt
import importlib.util
import pathlib
import unittest
import sys
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "scripts"))

spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).parents[1] / 'scripts/sosafe-diario.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTest(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.fromisoformat('2026-11-06T12:00:00-03:00')
        self.report = dict(uuid='example', reportType={'id': 32}, location='Maipú',
                           createdAt='2026-11-04 21:43 (GMT-03:00)',
                           description='Gatita perdida. Contacto +56 9 1234 5678.',
                           user={'firstName': 'Vecina'}, image='https://api.sosafeapp.com/reports/example.jpg')

    def test_ocr_names_require_explicit_label_and_phones_never_repair_digits(self):
        from sosafe_imagenes import names, phones
        self.assertEqual(names('SOSAFE\nPERDIDO\nContacto: Ana Pérez')[0]['nombre'], 'Ana Pérez')
        self.assertEqual(names('Ana Pérez'), [])
        self.assertEqual(phones('+56 9 1234 5678'), ['+56912345678'])
        self.assertEqual(phones('Camila: +56 9 8508\n8853'), ['+56985088853'])
        self.assertEqual(names('su nombre es\nZoro')[0]['nombre'], 'Zoro')
        self.assertEqual(phones('+56 9 1234 567:'), [])

    def test_public_data_without_owner_inference(self):
        row = collector.convert(self.report, self.now)
        self.assertEqual(row['celulares'], ['+56912345678'])
        self.assertEqual(row['autor_publicacion'], 'Vecina')
        self.assertNotIn('dueno', row)
        self.assertIn('2026-11-04', row['publicado_en'])

    def test_reject_other_communes_old_unknown_dates_and_categories(self):
        for patch in [{'location': 'Cerrillos'}, {'createdAt': '2025-11-04 21:43 (GMT-03:00)'},
                      {'createdAt': ''}, {'createdAt': '2026-11-07 21:43 (GMT-03:00)'},
                      {'reportType': {'id': 33}}, {'description':'vuelvo a publicar este hermoso juguete ( gatito), lo encontré'}, {'description': 'Vecinos cuiden sus mascotas'}]:
            self.assertIsNone(collector.convert(self.report | patch, self.now))

    def test_reject_non_report_image(self):
        row = collector.convert(self.report | {'image': 'https://evil.example/photo.jpg'}, self.now)
        self.assertEqual(row['foto'], '')


class DedupTest(unittest.TestCase):
    def row(self, uid, **patch):
        return dict(id=uid, descripcion='Mascota perdida', publicado_en='2026-11-08T12:00:00-03:00',celulares=[],foto='',**patch)

    def test_exact_photo_preserves_every_source_and_contacts_idempotently(self):
        from sosafe_duplicados import consolidate, expand
        a=self.row('a', imagen_original_sha256='same')
        b=self.row('b', imagen_original_sha256='same')
        b.update(descripcion='Mascota perdida en el parque, collar azul.',celulares=['+56912345678'])
        out=consolidate([a,b],[])
        self.assertEqual(len(out),1);self.assertEqual(out[0]['id'],'b')
        self.assertEqual(out[0]['celulares'],b['celulares'])
        self.assertEqual({x['id'] for x in expand(out)},{'a','b'})
        self.assertEqual(consolidate(out,[]),out)

    def test_name_or_phone_alone_does_not_merge(self):
        from sosafe_duplicados import consolidate
        a=self.row('a',nombre_mascota='Luna');b=self.row('b',nombre_mascota='Luna')
        self.assertEqual(len(consolidate([a,b],[])),2)
        a.update(celulares=['+56912345678'],nombre_mascota='Luna',descripcion='Gata gris')
        b.update(celulares=['+56912345678'],nombre_mascota='Rolfi',descripcion='Perro blanco')
        self.assertEqual(len(consolidate([a,b],[])),2)

    def test_reviewed_links_and_expired_member_not_resurrected(self):
        from sosafe_duplicados import consolidate
        a=self.row('a');b=self.row('b');rules=[{'ids':['a','b'],'nombre':'Taz'}]
        self.assertEqual(len(consolidate([a,b],rules)),1)
        result=consolidate([b],rules)
        self.assertEqual([r['id'] for r in result],['b'])
        self.assertNotIn('publicaciones',result[0])


class LossDatesTest(unittest.TestCase):
    def row(self,text,date='2026-11-07T12:00:00-03:00'):
        return {'id':'test','descripcion':text,'publicado_en':date,'fuente_url':'https://example.test'}
    def test_explicit_relative_and_publication_are_distinct(self):
        from sosafe_fechas import group_date
        explicit=group_date([self.row('Se perdió el 25 de octubre')]);self.assertEqual(explicit['fecha'],'2026-10-25');self.assertEqual(explicit['precision'],'indicada')
        relative=group_date([self.row('Se escapó ayer')]);self.assertEqual(relative['fecha'],'2026-11-06');self.assertEqual(relative['precision'],'estimada')
        fallback=group_date([self.row('Perro perdido'),self.row('Sigue perdido','2026-11-06T12:00:00-03:00')]);self.assertEqual(fallback['fecha'],'2026-11-06');self.assertEqual(fallback['criterio'],'primera publicacion disponible')
    def test_streets_ranges_and_grooming_are_not_loss_dates(self):
        from sosafe_fechas import event_date
        for text in ['Perrito perdido en la plaza, acá en 5 de abril con Pajaritos','Se perdió mi gato, hace como 5-6 días','Está perdido asustado por favor devolver, le corté el pelito ayer']:
            self.assertIsNone(event_date(self.row(text)),text)
    def test_conflicting_dates_are_not_presented_as_certain(self):
        from sosafe_fechas import group_date
        info=group_date([self.row('Se perdió el 2 de noviembre'),self.row('Se perdió el 3 de noviembre')]);self.assertTrue(info['requiere_revision']);self.assertEqual(info['precision'],'estimada')
    def test_poster_date_requires_matching_original_hash(self):
        from sosafe_fechas import event_date
        row=self.row('Se busca gato');row['imagen_original_sha256']='abc'
        review={'test':{'fecha_extravio':{'fecha':'2026-11-02','original_sha256':'other','evidencia':'afiche'}}}
        self.assertIsNone(event_date(row,review));review['test']['fecha_extravio']['original_sha256']='abc'
        self.assertEqual(event_date(row,review)['fecha'],'2026-11-02')

if __name__ == '__main__':
    unittest.main()

class PublicableTest(unittest.TestCase):
    def test_only_existing_local_images_are_published(self):
        import tempfile
        from unittest.mock import patch
        import sosafe_publicables as module
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            photo = root / 'data/sosafe-fotos/abc123.jpg'
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b'photo')
            rows = [{'id': 'ok', 'foto_mascota': 'data/sosafe-fotos/abc123.jpg'},
                    {'id': 'reunited', 'tipo_aviso':'reencuentro', 'foto_mascota':'data/sosafe-fotos/abc123.jpg'}, {'id': 'no-photo'}, {'id': 'raw', 'foto': 'https://api.sosafeapp.com/reports/a.jpg'},
                    {'id': 'missing', 'foto_mascota': 'data/sosafe-fotos/aaaa.png'},
                    {'id': 'escape', 'foto_mascota': '../abc123.jpg'}]
            with patch.object(module, 'ROOT', root):
                self.assertEqual([r['id'] for r in module.publicables(rows)], ['ok'])

class NoticeTypeTest(unittest.TestCase):
    def test_search_found_uncertain_and_review_invalidation(self):
        from sosafe_tipos import classify, signature
        def row(text): return {'id':'a', 'descripcion':text}
        self.assertEqual(classify(row('Busco a mi gatito'), {}),'perdida')
        self.assertEqual(classify(row('Encontré este perrito perdido'), {}),'encontrada')
        self.assertEqual(classify(row('Perro perdido'), {}),'por_confirmar')
        self.assertEqual(classify(row('FAMILIA ENCONTRADA gracias'), {}),'reencuentro')
        self.assertEqual(classify(row('Perrito fallecido'), {}),'fallecida')
        a=row('Perro perdido');review={'a':{'tipo_aviso':{'descripcion_sha256':signature(a),'valor':'encontrada'}}}
        self.assertEqual(classify(a,review),'encontrada')
        self.assertEqual(classify(row('Busco a mi perro'),review),'perdida')

class FoundStatusTest(unittest.TestCase):
    def test_deceased_is_found_with_explicit_status(self):
        from sosafe_duplicados import consolidate
        rows = [{'id':'deceased-test','descripcion':'Perrito fallecido', 'publicado_en':'2026-11-08T12:00:00-03:00','celulares':[],'foto':''}]
        result = consolidate(rows, [])[0]
        self.assertEqual(result['tipo_aviso'], 'encontrada')
        self.assertEqual(result['estado_mascota'], 'fallecida')

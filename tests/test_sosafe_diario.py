import datetime as dt
import importlib.util
import pathlib
import unittest

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

    def test_public_data_without_owner_inference(self):
        row = collector.convert(self.report, self.now)
        self.assertEqual(row['celulares'], ['+56912345678'])
        self.assertEqual(row['autor_publicacion'], 'Vecina')
        self.assertNotIn('dueno', row)
        self.assertIn('2026-11-04', row['publicado_en'])

    def test_reject_other_communes_old_unknown_dates_and_categories(self):
        for patch in [{'location': 'Cerrillos'}, {'createdAt': '2025-11-04 21:43 (GMT-03:00)'},
                      {'createdAt': ''}, {'createdAt': '2026-11-07 21:43 (GMT-03:00)'},
                      {'reportType': {'id': 33}}, {'description': 'Vecinos cuiden sus mascotas'}]:
            self.assertIsNone(collector.convert(self.report | patch, self.now))

    def test_reject_non_report_image(self):
        row = collector.convert(self.report | {'image': 'https://evil.example/photo.jpg'}, self.now)
        self.assertEqual(row['foto'], '')

if __name__ == '__main__':
    unittest.main()

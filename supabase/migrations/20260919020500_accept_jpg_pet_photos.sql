-- Algunos navegadores identifican archivos .jpg como image/jpg.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
where id = 'mascotas';

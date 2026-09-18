alter table ladra.lugares_publicos
  drop constraint if exists lugares_publicos_categoria_check;

alter table ladra.lugares_publicos
  add constraint lugares_publicos_categoria_check
  check (categoria in (
    'canil', 'parque', 'veterinaria', 'refugio', 'casa_acogida',
    'tienda_mascotas', 'alimento', 'juguetes_accesorios',
    'animal_comunitario', 'servicio', 'comercio', 'otro'
  ));

notify pgrst, 'reload schema';

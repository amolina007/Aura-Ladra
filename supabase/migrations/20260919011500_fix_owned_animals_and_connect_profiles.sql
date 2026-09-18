-- Corrige la lectura privada de mascotas propias y permite reclamar solo fichas sin responsable.
alter function ladra.mis_animales() security definer;

create or replace function ladra.conectar_mascota_sin_responsable(p_animal_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  update ladra.animales
     set creado_por = auth.uid(), actualizado_en = now()
   where id = p_animal_id
     and estado = 'publicado'
     and creado_por is null;

  if not found then
    raise exception using errcode = '23505', message = 'La mascota ya tiene responsable o no está disponible.';
  end if;
end;
$$;

revoke all on function ladra.conectar_mascota_sin_responsable(uuid) from public, anon, authenticated;
grant execute on function ladra.conectar_mascota_sin_responsable(uuid) to authenticated;

notify pgrst, 'reload schema';

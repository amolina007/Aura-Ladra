-- Mantiene las ediciones bajo RLS en vez de eludirla con SECURITY DEFINER.
drop policy if exists animales_edicion_por_creador on ladra.animales;
create policy animales_edicion_por_creador on ladra.animales for update to authenticated
using (creado_por = (select auth.uid()))
with check (creado_por = (select auth.uid()));

grant update (
  nombre, especie, biografia, raza, tamano, peso_kg, fecha_nacimiento, sexo,
  color_pelaje, estado_registro, numero_registro, senas_particulares, foto_urls,
  actualizado_en
) on ladra.animales to authenticated;

alter function ladra.mis_animales() security invoker;
alter function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[]) security invoker;

notify pgrst, 'reload schema';

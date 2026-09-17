-- En el piloto hay una sola cuenta. Vincula la ficha sembrada de Leia con esa
-- cuenta únicamente mientras la ficha siga sin propietario y exista un único
-- usuario registrado. No duplica la ficha ni reasigna mascotas ya reclamadas.
do $$
declare
  v_usuario_id uuid;
begin
  select (array_agg(id))[1]
    into v_usuario_id
  from auth.users
  having count(*) = 1;

  if v_usuario_id is not null then
    update ladra.animales
       set creado_por = v_usuario_id,
           actualizado_en = now()
     where slug = 'leia-embajadora'
       and creado_por is null;
  end if;
end
$$;

update ladra.estado_sistema
set version = '0.6.1', actualizado_en = now()
where id = 'auraladra';

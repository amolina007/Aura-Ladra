-- Prueba del servidor real. No crea usuarios ni mascotas y revierte todas las escrituras.
-- Ejecutar como administrador, nunca como migración. No muestra datos personales.
begin;
do $$
declare v_animal uuid; v_tutor uuid; v_prestador uuid;
begin
  select a.id,a.creado_por into v_animal,v_tutor from ladra.animales a
    join auth.users u on u.id=a.creado_por
    where not coalesce(a.es_conmemorativa,false) order by a.id limit 1;
  select id into v_prestador from auth.users where id<>v_tutor order by id limit 1;
  if v_animal is null or v_prestador is null then raise exception 'Faltan dos cuentas y una mascota para la prueba.'; end if;
  perform set_config('ladra.test_animal',v_animal::text,true);
  perform set_config('ladra.test_tutor',v_tutor::text,true);
  perform set_config('ladra.test_prestador',v_prestador::text,true);
end $$;

set local role authenticated;
do $$
declare v_servicio uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('ladra.test_prestador'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ladra.test_prestador'),'role','authenticated','is_anonymous',false)::text,true);
  insert into ladra.servicios(titulo,prestador,categoria,zona,modalidad,descripcion,precio_clp)
    values('PRUEBA TRANSACCIONAL - NO PUBLICAR','Validación técnica','estetica','Maipú','local','Prestación temporal para probar permisos. Se revierte al finalizar.',25000)
    returning id into v_servicio;
  perform set_config('ladra.test_servicio',v_servicio::text,true);
end $$;
reset role;
set local role anon;
do $$
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  if not exists(select 1 from ladra.servicios where id=current_setting('ladra.test_servicio')::uuid) then raise exception 'Falló lectura pública'; end if;
  begin
    perform 1 from ladra.servicio_consultas limit 1;
    raise exception 'Anónimo pudo leer consultas';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$
declare v_consulta uuid; v_clave uuid:=gen_random_uuid(); v_count integer;
begin
  perform set_config('request.jwt.claim.sub',current_setting('ladra.test_tutor'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ladra.test_tutor'),'role','authenticated','is_anonymous',false)::text,true);
  insert into ladra.servicio_consultas(solicitud_clave,servicio_id,animal_id,dia_preferido,horario,mensaje)
    values(v_clave,current_setting('ladra.test_servicio')::uuid,current_setting('ladra.test_animal')::uuid,(now() at time zone 'America/Santiago')::date+1,'manana','Consulta técnica temporal, se revierte al terminar.') returning id into v_consulta;
  perform set_config('ladra.test_consulta',v_consulta::text,true);
  if not exists(select 1 from ladra.servicio_consultas where id=v_consulta and solicitante_id=auth.uid() and prestador_id=current_setting('ladra.test_prestador')::uuid and mascota_nombre is not null) then raise exception 'Falló asignación de consulta'; end if;
  begin
    insert into ladra.servicio_consultas(solicitud_clave,servicio_id,animal_id,dia_preferido,horario,mensaje)
      values(v_clave,current_setting('ladra.test_servicio')::uuid,current_setting('ladra.test_animal')::uuid,(now() at time zone 'America/Santiago')::date+1,'manana','Consulta técnica temporal, se revierte al terminar.');
    raise exception 'Falló idempotencia';
  exception when unique_violation then null;
  end;
  update ladra.servicio_consultas set estado='respondida',respuesta='Respuesta no autorizada del tutor.' where id=v_consulta;
  get diagnostics v_count=row_count;
  if v_count<>0 then raise exception 'Tutor pudo responder'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated','is_anonymous',false)::text,true);
  if exists(select 1 from ladra.servicio_consultas where id=v_consulta) then raise exception 'Tercero pudo leer'; end if;
end $$;
reset role;
set local role authenticated;
do $$
declare v_count integer;
begin
  perform set_config('request.jwt.claim.sub',current_setting('ladra.test_prestador'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ladra.test_prestador'),'role','authenticated','is_anonymous',false)::text,true);
  update ladra.servicio_consultas set estado='respondida',respuesta='Respuesta técnica temporal, se revierte al terminar.' where id=current_setting('ladra.test_consulta')::uuid;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'Prestador no pudo responder'; end if;
  update ladra.servicios set publicado=false where id=current_setting('ladra.test_servicio')::uuid;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'Prestador no pudo retirar'; end if;
end $$;
reset role;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('ladra.test_tutor'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ladra.test_tutor'),'role','authenticated','is_anonymous',false)::text,true);
  if not exists(select 1 from ladra.servicio_consultas where id=current_setting('ladra.test_consulta')::uuid and estado='respondida') then raise exception 'Tutor no pudo leer respuesta'; end if;
  if exists(select 1 from ladra.servicios where id=current_setting('ladra.test_servicio')::uuid) then raise exception 'Servicio retirado sigue visible a otro usuario'; end if;
end $$;
reset role;
rollback;
select true as prueba_completa_revertida;

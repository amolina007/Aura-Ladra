-- Permisos de familia: dueño principal vs secundario. Schema ladra. Sin UI.

-- 1) Quién es quién en la familia ------------------------------------------------

create or replace function ladra.rol_familiar_de_animal(p_animal_id uuid, p_usuario uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_rol text;
begin
  if p_animal_id is null or p_usuario is null then
    return null;
  end if;

  select h.rol
    into v_rol
    from ladra.humanos_animal h
    join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
   where h.animal_id = p_animal_id
     and p.usuario_id = p_usuario
   limit 1;

  if v_rol is not null then
    return v_rol;
  end if;

  -- Si todavía no hay dueño principal en la tabla, quien creó la ficha actúa como tal.
  if exists (
    select 1 from ladra.animales a
    where a.id = p_animal_id and a.creado_por = p_usuario
  ) and not exists (
    select 1 from ladra.humanos_animal h
    where h.animal_id = p_animal_id and h.rol = 'dueno_principal'
  ) then
    return 'dueno_principal';
  end if;

  return null;
end;
$$;

create or replace function ladra.es_dueno_principal_de_animal(p_animal_id uuid, p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select ladra.rol_familiar_de_animal(p_animal_id, p_usuario) = 'dueno_principal';
$$;

create or replace function ladra.es_familia_de_animal(p_animal_id uuid, p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select ladra.rol_familiar_de_animal(p_animal_id, p_usuario) in ('dueno_principal', 'secundario');
$$;

create or replace function ladra.usuario_dueno_principal_de_animal(p_animal_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select coalesce(
    (
      select p.usuario_id
      from ladra.humanos_animal h
      join ladra.perfiles_publicos p on p.id = h.perfil_publico_id
      where h.animal_id = p_animal_id and h.rol = 'dueno_principal'
      limit 1
    ),
    (select a.creado_por from ladra.animales a where a.id = p_animal_id)
  );
$$;

revoke all on function ladra.rol_familiar_de_animal(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.es_dueno_principal_de_animal(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.es_familia_de_animal(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.usuario_dueno_principal_de_animal(uuid) from public, anon, authenticated;
grant execute on function ladra.rol_familiar_de_animal(uuid, uuid) to authenticated, service_role;
grant execute on function ladra.es_dueno_principal_de_animal(uuid, uuid) to authenticated, service_role;
grant execute on function ladra.es_familia_de_animal(uuid, uuid) to authenticated, service_role;
grant execute on function ladra.usuario_dueno_principal_de_animal(uuid) to authenticated, service_role;

-- 2) Lectura del perfil completo para la familia; edición solo del principal ------

drop policy if exists animales_lectura_autenticada on ladra.animales;
create policy animales_lectura_autenticada
on ladra.animales for select to authenticated
using (
  (estado = 'publicado' and mostrar_en_red)
  or ladra.es_familia_de_animal(id, (select auth.uid()))
  or exists (
    select 1 from ladra.moderadores m
    where m.usuario_id = (select auth.uid())
  )
);

drop policy if exists animales_edicion_por_creador on ladra.animales;
create policy animales_edicion_por_creador on ladra.animales for update to authenticated
using (ladra.es_dueno_principal_de_animal(id, (select auth.uid())))
with check (ladra.es_dueno_principal_de_animal(id, (select auth.uid())));

drop policy if exists ficha_salud_lectura_responsable on ladra.fichas_salud_animal;
create policy ficha_salud_lectura_responsable
on ladra.fichas_salud_animal for select to authenticated
using (ladra.es_familia_de_animal(animal_id, (select auth.uid())));

drop policy if exists ficha_salud_creacion_responsable on ladra.fichas_salud_animal;
create policy ficha_salud_creacion_responsable
on ladra.fichas_salud_animal for insert to authenticated
with check (ladra.es_dueno_principal_de_animal(animal_id, (select auth.uid())));

drop policy if exists ficha_salud_edicion_responsable on ladra.fichas_salud_animal;
create policy ficha_salud_edicion_responsable
on ladra.fichas_salud_animal for update to authenticated
using (ladra.es_dueno_principal_de_animal(animal_id, (select auth.uid())))
with check (ladra.es_dueno_principal_de_animal(animal_id, (select auth.uid())));

drop function if exists ladra.mis_animales();
create function ladra.mis_animales()
returns table(
  id uuid, nombre text, especie text, estado text, estado_seguridad text,
  biografia text, foto_url text, foto_urls text[], raza text, tamano text,
  peso_kg numeric, fecha_nacimiento date, sexo text, color_pelaje text,
  estado_registro text, numero_registro text, senas_particulares text,
  mostrar_en_red boolean, salud jsonb, habilidades jsonb,
  caracter_respuestas jsonb, caracter_puntaje smallint,
  diagnostico_nutricional text, bloques_resumen text[],
  es_conmemorativa boolean, fecha_deceso date, rol_familiar text
)
language sql
stable
security definer
set search_path = pg_catalog, ladra
as $$
  select a.id, a.nombre, a.especie, a.estado, a.estado_seguridad,
    a.biografia, a.foto_url, a.foto_urls, a.raza, a.tamano,
    a.peso_kg, a.fecha_nacimiento, a.sexo, a.color_pelaje,
    a.estado_registro, a.numero_registro, a.senas_particulares,
    a.mostrar_en_red, coalesce(s.datos, '{}'::jsonb), a.habilidades,
    a.caracter_respuestas, a.caracter_puntaje,
    a.diagnostico_nutricional, a.bloques_resumen,
    a.es_conmemorativa, a.fecha_deceso,
    ladra.rol_familiar_de_animal(a.id, (select auth.uid()))
  from ladra.animales a
  left join ladra.fichas_salud_animal s on s.animal_id = a.id
  where (select auth.uid()) is not null
    and ladra.es_familia_de_animal(a.id, (select auth.uid()))
  order by a.creado_en desc;
$$;

revoke all on function ladra.mis_animales() from public, anon, authenticated;
grant execute on function ladra.mis_animales() to authenticated;

create or replace function ladra.actualizar_mi_animal(
  p_animal_id uuid, p_nombre text, p_especie text, p_biografia text,
  p_raza text, p_tamano text, p_peso_kg numeric, p_fecha_nacimiento date,
  p_sexo text, p_color_pelaje text, p_estado_registro text,
  p_numero_registro text, p_senas_particulares text, p_foto_urls text[],
  p_foto_url text, p_mostrar_en_red boolean,
  p_diagnostico_nutricional text, p_bloques_resumen text[], p_salud jsonb,
  p_habilidades jsonb, p_caracter_respuestas jsonb, p_caracter_puntaje smallint,
  p_es_conmemorativa boolean default false, p_fecha_deceso date default null
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, ladra
as $$
declare
  v_skill text;
  v_key text;
  v_answer numeric;
  v_conmemorativa boolean := coalesce(p_es_conmemorativa, false);
  v_deceso date := p_fecha_deceso;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if not ladra.es_dueno_principal_de_animal(p_animal_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede editar los datos de esta mascota.';
  end if;
  if p_fecha_nacimiento > current_date then raise exception using errcode = '22023', message = 'La fecha de nacimiento no puede estar en el futuro.'; end if;
  if v_conmemorativa then
    if v_deceso is null then raise exception using errcode = '22023', message = 'Indica la fecha aproximada del deceso.'; end if;
    if v_deceso > current_date then raise exception using errcode = '22023', message = 'La fecha de deceso no puede estar en el futuro.'; end if;
    if p_fecha_nacimiento is not null and v_deceso < p_fecha_nacimiento then
      raise exception using errcode = '22023', message = 'La fecha de deceso no puede ser anterior al nacimiento.';
    end if;
  else
    v_deceso := null;
  end if;
  if p_foto_url is not null and p_foto_url not like 'https://utilbunuziotzumuiayu.supabase.co/storage/v1/object/public/mascotas-publicas/%' then
    raise exception using errcode = '22023', message = 'La foto de perfil debe provenir del espacio público de mascotas.';
  end if;
  if p_diagnostico_nutricional is not null and char_length(btrim(p_diagnostico_nutricional)) > 120 then
    raise exception using errcode = '22023', message = 'El diagnóstico nutricional es demasiado largo.';
  end if;
  if cardinality(p_bloques_resumen) <> 8
    or (select count(distinct item) from unnest(p_bloques_resumen) item) <> 8
    or not p_bloques_resumen <@ array['especie','raza','tamano','peso','sexo','nacimiento','color','registro','caracter','diagnostico_nutricional','habilidades','estado_seguridad']::text[] then
    raise exception using errcode = '22023', message = 'Selecciona ocho bloques diferentes y permitidos.';
  end if;
  if jsonb_typeof(coalesce(p_salud, '{}'::jsonb)) <> 'object' or pg_column_size(coalesce(p_salud, '{}'::jsonb)) > 12000 then
    raise exception using errcode = '22023', message = 'La ficha de salud no es válida.';
  end if;
  if jsonb_typeof(coalesce(p_habilidades, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_habilidades, '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'Las habilidades no son válidas.';
  end if;
  for v_skill in select jsonb_array_elements_text(coalesce(p_habilidades, '[]'::jsonb)) loop
    if v_skill not in ('reconoce_nombre','contacto_visual','sentarse','dar_patita','echarse','esperar','venir_llamado','soltar','paseo_correa','higiene','socializa') then
      raise exception using errcode = '22023', message = 'La habilidad no está permitida.';
    end if;
  end loop;
  if p_caracter_puntaje is null then
    if coalesce(p_caracter_respuestas, '{}'::jsonb) <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'El cuestionario de carácter está incompleto.';
    end if;
  else
    if p_caracter_puntaje not between 0 and 100 or jsonb_typeof(p_caracter_respuestas) <> 'object' then
      raise exception using errcode = '22023', message = 'El cuestionario de carácter no es válido.';
    end if;
    foreach v_key in array array['personas','animales','manipulacion','recursos','entorno'] loop
      v_answer := (p_caracter_respuestas ->> v_key)::numeric;
      if v_answer is null or v_answer not between 1 and 5 then
        raise exception using errcode = '22023', message = 'Completa las cinco respuestas de carácter.';
      end if;
    end loop;
  end if;

  update ladra.animales set
    nombre = btrim(p_nombre), especie = p_especie, biografia = nullif(btrim(p_biografia), ''),
    raza = nullif(btrim(p_raza), ''), tamano = p_tamano, peso_kg = p_peso_kg,
    fecha_nacimiento = p_fecha_nacimiento, sexo = p_sexo,
    color_pelaje = nullif(btrim(p_color_pelaje), ''), estado_registro = p_estado_registro,
    numero_registro = nullif(btrim(p_numero_registro), ''),
    senas_particulares = nullif(btrim(p_senas_particulares), ''),
    foto_urls = coalesce(p_foto_urls, '{}'), foto_url = nullif(btrim(p_foto_url), ''),
    mostrar_en_red = coalesce(p_mostrar_en_red, false),
    diagnostico_nutricional = nullif(btrim(p_diagnostico_nutricional), ''),
    bloques_resumen = p_bloques_resumen,
    habilidades = coalesce(p_habilidades, '[]'::jsonb),
    caracter_respuestas = coalesce(p_caracter_respuestas, '{}'::jsonb),
    caracter_puntaje = p_caracter_puntaje,
    es_conmemorativa = v_conmemorativa,
    fecha_deceso = v_deceso,
    estado_seguridad = case when v_conmemorativa then 'segura' else estado_seguridad end,
    actualizado_en = now()
  where id = p_animal_id;

  if not found then raise exception using errcode = '42501', message = 'No puedes editar esta mascota.'; end if;

  if v_conmemorativa then
    perform ladra.ocultar_alertas_activas_de_mi_animal(p_animal_id);
  end if;

  insert into ladra.fichas_salud_animal (animal_id, datos, actualizado_en)
  values (p_animal_id, coalesce(p_salud, '{}'::jsonb), now())
  on conflict (animal_id) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;
end;
$$;

revoke all on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint,boolean,date) from public, anon, authenticated;
grant execute on function ladra.actualizar_mi_animal(uuid,text,text,text,text,text,numeric,date,text,text,text,text,text,text[],text,boolean,text,text[],jsonb,jsonb,jsonb,smallint,boolean,date) to authenticated;

create or replace function ladra.ocultar_alertas_activas_de_mi_animal(p_animal_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;

  if not ladra.es_dueno_principal_de_animal(p_animal_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'No puedes administrar esta mascota.';
  end if;

  update ladra.alertas_mascotas
     set estado = 'oculta'
   where animal_id = p_animal_id
     and estado = 'activa';
end;
$$;

-- 3) Extraviada: familia. Encontrada y recompensa: solo principal ----------------

create or replace function ladra.cambiar_estado_seguridad_mascota(
  p_animal_id uuid,
  p_estado_seguridad text,
  p_descripcion text default null,
  p_direccion_publica text default null,
  p_latitud double precision default null,
  p_longitud double precision default null,
  p_perdida_en timestamptz default null,
  p_sitio_web text default null,
  p_monto_recompensa numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_rol text;
  v_animal ladra.animales%rowtype;
  v_alerta_id uuid;
  v_descripcion text := btrim(coalesce(p_descripcion, ''));
  v_direccion text := btrim(coalesce(p_direccion_publica, ''));
  v_titulo text;
  v_relato text;
  v_zona text;
  v_monto numeric := nullif(p_monto_recompensa, 0);
  v_dueno_aviso uuid;
begin
  if v_usuario_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión.';
  end if;

  if nullif(btrim(coalesce(p_sitio_web, '')), '') is not null then
    raise exception using errcode = '22023', message = 'Solicitud no válida.';
  end if;

  v_rol := ladra.rol_familiar_de_animal(p_animal_id, v_usuario_id);
  if v_rol is null then
    raise exception using errcode = '42501', message = 'No puedes administrar esta mascota.';
  end if;

  if p_estado_seguridad = 'segura' and v_rol is distinct from 'dueno_principal' then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede marcarla como encontrada.';
  end if;

  if v_rol is distinct from 'dueno_principal' and v_monto is not null then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede ofrecer o cambiar la recompensa.';
  end if;

  select a.*
    into v_animal
    from ladra.animales a
   where a.id = p_animal_id
     and a.estado in ('pendiente', 'publicado')
   for update;

  if not found then
    raise exception using errcode = '42501', message = 'No puedes administrar esta mascota.';
  end if;

  if p_estado_seguridad = 'segura' then
    update ladra.alertas_mascotas
       set estado = 'reunificada', actualizado_en = now()
     where animal_id = v_animal.id
       and estado = 'activa'
    returning id into v_alerta_id;

    if to_regclass('ladra.avisos_most_wanted') is not null then
      update ladra.avisos_most_wanted
         set estado = 'cerrado', actualizado_en = now()
       where animal_id = v_animal.id
         and estado in ('publicado', 'reclamado', 'en_verificacion', 'resuelto');
    end if;

    update ladra.animales
       set estado_seguridad = 'segura', actualizado_en = now()
     where id = v_animal.id;

    return v_alerta_id;
  end if;

  if p_estado_seguridad <> 'extraviada' then
    raise exception using errcode = '22023', message = 'Estado de seguridad no válido.';
  end if;

  if to_regclass('ladra.cuentas_baneadas') is not null
     and exists (select 1 from ladra.cuentas_baneadas b where b.usuario_id = v_usuario_id) then
    raise exception using errcode = '42501', message = 'Esta cuenta no puede publicar avisos.';
  end if;

  if v_animal.es_conmemorativa then
    raise exception using errcode = '22023', message = 'Una ficha conmemorativa no puede marcarse como extraviada.';
  end if;

  if char_length(v_descripcion) not between 10 and 350 then
    raise exception using errcode = '22023', message = 'La descripción debe tener entre 10 y 350 caracteres.';
  end if;

  if char_length(v_direccion) not between 5 and 180 then
    raise exception using errcode = '22023', message = 'Selecciona una dirección reconocida por el mapa.';
  end if;

  if p_latitud is null or p_longitud is null
     or p_latitud not between -33.60 and -33.42
     or p_longitud not between -70.86 and -70.64 then
    raise exception using errcode = '22023', message = 'La ubicación debe estar dentro de Maipú.';
  end if;

  if p_perdida_en is null
     or p_perdida_en < now() - interval '30 days'
     or p_perdida_en > now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'La fecha indicada no es válida.';
  end if;

  if v_monto is not null and v_monto < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;

  update ladra.alertas_mascotas
     set estado = 'oculta', actualizado_en = now()
   where animal_id = v_animal.id
     and estado = 'activa';

  insert into ladra.alertas_mascotas (
    animal_id, nombre, especie, descripcion, direccion_publica,
    latitud, longitud, perdida_en, reportante_id
  ) values (
    v_animal.id, v_animal.nombre, v_animal.especie, v_descripcion, v_direccion,
    p_latitud, p_longitud, p_perdida_en, v_usuario_id
  )
  returning id into v_alerta_id;

  update ladra.animales
     set estado_seguridad = 'extraviada', actualizado_en = now()
   where id = v_animal.id;

  v_titulo := left('Se busca a ' || btrim(v_animal.nombre), 80);
  v_relato := v_descripcion;
  if char_length(v_relato) < 20 then
    v_relato := left(v_descripcion || '. Visto en ' || v_direccion, 800);
  end if;
  v_zona := left(v_direccion, 80);
  v_dueno_aviso := coalesce(ladra.usuario_dueno_principal_de_animal(v_animal.id), v_usuario_id);

  if to_regclass('ladra.avisos_most_wanted') is not null
     and not exists (
    select 1 from ladra.avisos_most_wanted a
    where a.animal_id = v_animal.id
      and a.estado in ('publicado', 'reclamado', 'en_verificacion')
  ) then
    insert into ladra.avisos_most_wanted (
      animal_id, dueno_id, modalidad, monto_recompensa, titulo, relato, zona_publica, foto_path
    ) values (
      v_animal.id, v_dueno_aviso,
      case when v_monto is not null then 'recompensa' else 'buena_voluntad' end,
      v_monto,
      v_titulo,
      v_relato,
      v_zona,
      nullif(v_animal.foto_url, '')
    );
    insert into ladra.acciones_actividad (usuario_id, tipo) values (v_usuario_id, 'publicar_aviso');
  end if;

  return v_alerta_id;
end;
$$;

revoke all on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text, numeric
) from public, anon, authenticated;
grant execute on function ladra.cambiar_estado_seguridad_mascota(
  uuid, text, text, text, double precision, double precision, timestamptz, text, numeric
) to authenticated;

create or replace function ladra.migrar_aviso_a_recompensa(p_aviso_id uuid, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_aviso ladra.avisos_most_wanted;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if coalesce(p_monto, 0) < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;

  select * into v_aviso
  from ladra.avisos_most_wanted
  where id = p_aviso_id;

  if v_aviso.id is null
     or not ladra.es_dueno_principal_de_animal(v_aviso.animal_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'No puedes editar este aviso.';
  end if;
  if v_aviso.estado not in ('publicado', 'reclamado', 'en_verificacion') then
    raise exception using errcode = '22023', message = 'Este aviso ya no admite cambios de recompensa.';
  end if;
  if v_aviso.modalidad = 'recompensa' and p_monto <= coalesce(v_aviso.monto_recompensa, 0) then
    raise exception using errcode = '22023', message = 'Solo puedes aumentar el monto. Bajarlo o quitarlo no está disponible en este flujo.';
  end if;

  update ladra.avisos_most_wanted
    set modalidad = 'recompensa', monto_recompensa = p_monto, actualizado_en = now()
  where id = p_aviso_id;
end;
$$;

create or replace function ladra.retirar_avisos_most_wanted_de_mi_animal(p_animal_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_n integer := 0;
begin
  if v_me is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if not ladra.es_dueno_principal_de_animal(p_animal_id, v_me) then
    raise exception using errcode = '42501', message = 'No puedes retirar avisos de esta mascota.';
  end if;

  update ladra.reclamos_most_wanted r
     set estado = 'caducado'
   from ladra.avisos_most_wanted a
  where a.id = r.aviso_id
    and a.animal_id = p_animal_id
    and r.estado in ('en_cola', 'activo');

  update ladra.avisos_most_wanted
     set estado = 'cerrado', actualizado_en = now()
   where animal_id = p_animal_id
     and estado in ('publicado', 'reclamado', 'en_verificacion', 'resuelto');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function ladra.resolver_reclamo_most_wanted(p_reclamo_id uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_rec ladra.reclamos_most_wanted;
  v_aviso ladra.avisos_most_wanted;
  v_cfg ladra.configuracion_most_wanted;
  v_dueno_activo boolean;
  v_enc_activo boolean;
  v_reparto numeric;
  v_bono numeric := 0;
  v_bv bigint;
  v_ingreso numeric;
  v_fondo numeric;
  v_siguiente uuid;
begin
  if v_me is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  select * into v_rec from ladra.reclamos_most_wanted where id = p_reclamo_id;
  select * into v_aviso from ladra.avisos_most_wanted where id = v_rec.aviso_id;
  select * into v_cfg from ladra.configuracion_most_wanted where id = 'piloto';
  if not ladra.es_dueno_principal_de_animal(v_aviso.animal_id, v_me)
     and not exists (select 1 from ladra.moderadores m where m.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Solo el dueño principal o un moderador puede resolver.';
  end if;
  if v_rec.estado is distinct from 'activo' then
    raise exception using errcode = '22023', message = 'Este reclamo ya no está activo.';
  end if;

  if not p_aceptar then
    update ladra.reclamos_most_wanted set estado = 'rechazado' where id = v_rec.id;
    select r.id into v_siguiente
    from ladra.reclamos_most_wanted r
    where r.aviso_id = v_aviso.id and r.estado = 'en_cola'
    order by r.creado_en
    limit 1;
    if v_siguiente is not null then
      update ladra.reclamos_most_wanted set estado = 'activo', activado_en = now() where id = v_siguiente;
      update ladra.avisos_most_wanted set estado = 'reclamado', actualizado_en = now() where id = v_aviso.id;
    else
      update ladra.avisos_most_wanted set estado = 'publicado', actualizado_en = now() where id = v_aviso.id;
    end if;
    return;
  end if;

  update ladra.reclamos_most_wanted set estado = 'verificado' where id = v_rec.id;

  if v_aviso.modalidad = 'buena_voluntad' then
    if v_rec.reclamante_id is not null then
      insert into ladra.reconocimientos_buena_voluntad (usuario_id, aviso_id)
      values (v_rec.reclamante_id, v_aviso.id)
      on conflict (aviso_id) do nothing;
    end if;
    update ladra.avisos_most_wanted
      set estado = 'cerrado', resultado = 'reconocido', actualizado_en = now()
      where id = v_aviso.id;
  else
    v_dueno_activo := ladra.usuario_esta_activo(v_aviso.dueno_id);
    if v_rec.sin_cuenta or v_rec.reclamante_id is null then
      v_reparto := v_cfg.reparto_encontrador_sin_cuenta;
    else
      v_enc_activo := ladra.usuario_esta_activo(v_rec.reclamante_id);
      v_reparto := case when v_enc_activo then v_cfg.reparto_encontrador_activo else v_cfg.reparto_encontrador_inactivo end;
      select count(*) into v_bv from ladra.reconocimientos_buena_voluntad where usuario_id = v_rec.reclamante_id;
      if v_bv >= v_cfg.umbral_bono_buena_voluntad then
        v_bono := least(v_cfg.tope_bono_reparto_pp / 100.0, 1 - v_reparto);
        v_reparto := v_reparto + v_bono;
      end if;
    end if;

    v_ingreso := round(v_aviso.monto_recompensa * (1 - v_reparto), 0);
    v_fondo := round(v_ingreso * v_cfg.fraccion_fondo_altruismo, 0);
    insert into ladra.fondo_altruismo_movimientos (aviso_id, monto, detalle)
    values (v_aviso.id, v_fondo, '10% del ingreso neto del aviso, reinvertido en el canil Parque 3 Poniente.');

    update ladra.avisos_most_wanted
      set estado = 'cerrado', resultado = 'pago_pendiente_liberar', actualizado_en = now()
      where id = v_aviso.id;
  end if;

  update ladra.alertas_mascotas
     set estado = 'reunificada', actualizado_en = now()
   where animal_id = v_aviso.animal_id
     and estado = 'activa';

  update ladra.animales
     set estado_seguridad = 'segura', actualizado_en = now()
   where id = v_aviso.animal_id;
end;
$$;

create or replace function ladra.publicar_aviso_most_wanted(
  p_animal_id uuid,
  p_modalidad text,
  p_monto numeric,
  p_titulo text,
  p_relato text,
  p_zona text,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
  v_dueno uuid;
begin
  if v_me is null then raise exception using errcode = '42501', message = 'Sesión requerida.'; end if;
  if exists (select 1 from ladra.cuentas_baneadas b where b.usuario_id = v_me) then
    raise exception using errcode = '42501', message = 'Esta cuenta no puede publicar avisos.';
  end if;
  if not ladra.es_dueno_principal_de_animal(p_animal_id, v_me) then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede publicar o cambiar la recompensa.';
  end if;
  if p_modalidad = 'recompensa' and coalesce(p_monto, 0) < 1000 then
    raise exception using errcode = '22023', message = 'La recompensa debe ser de al menos $1.000.';
  end if;

  v_dueno := coalesce(ladra.usuario_dueno_principal_de_animal(p_animal_id), v_me);

  insert into ladra.avisos_most_wanted (
    animal_id, dueno_id, modalidad, monto_recompensa, titulo, relato, zona_publica, foto_path
  ) values (
    p_animal_id, v_dueno, p_modalidad,
    case when p_modalidad = 'recompensa' then p_monto else null end,
    btrim(p_titulo), btrim(p_relato), btrim(p_zona), nullif(p_foto_path, '')
  ) returning id into v_id;

  insert into ladra.acciones_actividad (usuario_id, tipo) values (v_me, 'publicar_aviso');
  return v_id;
end;
$$;

revoke all on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function ladra.publicar_aviso_most_wanted(uuid, text, numeric, text, text, text, text) to service_role;

-- 4) El principal arma o desarma el grupo de secundarios -------------------------

grant select (id, animal_id, perfil_publico_id, rol, creado_en, actualizado_en)
  on ladra.humanos_animal to authenticated;

drop policy if exists humanos_animal_lectura_familia on ladra.humanos_animal;
create policy humanos_animal_lectura_familia
on ladra.humanos_animal for select to authenticated
using (ladra.es_familia_de_animal(animal_id, (select auth.uid())));

create or replace function ladra.agregar_humano_secundario(p_animal_id uuid, p_perfil_publico_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if not ladra.es_dueno_principal_de_animal(p_animal_id, v_me) then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede agregar personas al grupo.';
  end if;
  if not exists (
    select 1 from ladra.perfiles_publicos p
    where p.id = p_perfil_publico_id and p.estado = 'publicado'
  ) then
    raise exception using errcode = '22023', message = 'Esa persona no tiene un alias público disponible.';
  end if;
  if exists (
    select 1 from ladra.humanos_animal h
    where h.animal_id = p_animal_id
      and h.perfil_publico_id = p_perfil_publico_id
  ) then
    raise exception using errcode = '23505', message = 'Esa persona ya está en el grupo.';
  end if;

  insert into ladra.humanos_animal (animal_id, perfil_publico_id, rol)
  values (p_animal_id, p_perfil_publico_id, 'secundario')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function ladra.quitar_humano_secundario(p_animal_id uuid, p_perfil_publico_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión requerida.';
  end if;
  if not ladra.es_dueno_principal_de_animal(p_animal_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Solo el dueño principal puede quitar personas del grupo.';
  end if;

  delete from ladra.humanos_animal
  where animal_id = p_animal_id
    and perfil_publico_id = p_perfil_publico_id
    and rol = 'secundario';

  if not found then
    raise exception using errcode = '22023', message = 'No hay un humano secundario con ese perfil en esta mascota.';
  end if;
end;
$$;

revoke all on function ladra.agregar_humano_secundario(uuid, uuid) from public, anon, authenticated;
revoke all on function ladra.quitar_humano_secundario(uuid, uuid) from public, anon, authenticated;
grant execute on function ladra.agregar_humano_secundario(uuid, uuid) to authenticated;
grant execute on function ladra.quitar_humano_secundario(uuid, uuid) to authenticated;

-- Si alguien reclama o crea una ficha, queda como dueño principal cuando tenga alias.
create or replace function ladra.asegurar_dueno_principal_desde_creador()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, ladra
as $$
declare
  v_perfil uuid;
begin
  if new.creado_por is null then
    return new;
  end if;
  if exists (
    select 1 from ladra.humanos_animal h
    where h.animal_id = new.id and h.rol = 'dueno_principal'
  ) then
    return new;
  end if;
  select id into v_perfil
  from ladra.perfiles_publicos
  where usuario_id = new.creado_por
  limit 1;
  if v_perfil is not null then
    insert into ladra.humanos_animal (animal_id, perfil_publico_id, rol)
    values (new.id, v_perfil, 'dueno_principal')
    on conflict (animal_id, perfil_publico_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists animales_asegurar_dueno_principal on ladra.animales;
create trigger animales_asegurar_dueno_principal
after insert or update of creado_por on ladra.animales
for each row
execute function ladra.asegurar_dueno_principal_desde_creador();

notify pgrst, 'reload schema';

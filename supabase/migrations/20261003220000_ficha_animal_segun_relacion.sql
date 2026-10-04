-- Ficha de una mascota según la relación de quien la mira. Schema ladra.
--
-- Entrega SOLO los datos que esa persona puede ver (la base decide, no la pantalla):
--
--   Todos         nombre, foto, especie, presentación, temperamento (carácter), estado de seguridad.
--   Mascota extraviada: además raza, tamaño, color, sexo y señas particulares (ayudan a reconocerla).
--   Amistad       además cumpleaños, peso, diagnóstico nutricional, habilidades, raza/tamaño/color/sexo,
--                 señas particulares y ficha de salud.
--   Familia       todo lo anterior y además n.º de registro, estado de registro y respuestas del carácter.
--
-- «Desconocido» incluye a quien sigue a la persona (seguir no da acceso extra) y a quien está bloqueado.
-- «Amistad» incluye a quien es cuidador/a o responsable confirmado de la mascota (no es familia).
-- «Familia» = dueño principal o secundario. Ver es_familia_de_animal.
-- Una mascota oculta de la red (mostrar_en_red = false) solo la ve su familia y quienes están vinculados a ella.
--
-- Esta migración solo AGREGA una función: no cambia tablas, políticas ni permisos existentes.
-- Lee de Convergencia Aura Core de forma indirecta, vía ladra.mi_relacion_con_animales().

do $$
begin
  if to_regprocedure('ladra.mi_relacion_con_animales()') is null
     or to_regprocedure('ladra.es_familia_de_animal(uuid,uuid)') is null then
    raise exception using errcode = '55000',
      message = 'Faltan ladra.mi_relacion_con_animales o ladra.es_familia_de_animal. Aplica antes las migraciones 20260920190000 y 20261003200000.';
  end if;
end $$;

create or replace function ladra.ficha_animal_segun_relacion(p_animal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_yo uuid := (select auth.uid());
  v_a ladra.animales%rowtype;
  v_rel text;
  v_nivel text;
  v_extraviada boolean;
  v_visible_en_red boolean;
  v_ficha jsonb;
begin
  select a.* into v_a from ladra.animales a where a.id = p_animal_id;
  if not found then
    return null;
  end if;

  v_visible_en_red := v_a.estado = 'publicado' and v_a.mostrar_en_red;

  if v_yo is not null and ladra.es_familia_de_animal(p_animal_id, v_yo) then
    v_nivel := 'familia';
  else
    if v_yo is not null then
      select r.relacion into v_rel
        from ladra.mi_relacion_con_animales() r
       where r.animal_id = p_animal_id;
    end if;

    -- Oculta de la red: solo su familia y quienes están vinculados a ella.
    if not v_visible_en_red and v_rel is distinct from 'vinculada' then
      return null;
    end if;

    v_nivel := case when v_rel in ('amistad', 'vinculada') then 'amistad' else 'desconocido' end;
  end if;

  v_extraviada := v_a.estado_seguridad = 'extraviada' and not v_a.es_conmemorativa;

  -- Lo que ve cualquiera
  v_ficha := jsonb_build_object(
    'id', v_a.id,
    'slug', v_a.slug,
    'nombre', v_a.nombre,
    'especie', v_a.especie,
    'biografia', v_a.biografia,
    'foto_url', v_a.foto_url,
    'foto_urls', v_a.foto_urls,
    'zona_publica', v_a.zona_publica,
    'es_comunitario', v_a.es_comunitario,
    'estado', v_a.estado,
    'estado_seguridad', v_a.estado_seguridad,
    'es_conmemorativa', v_a.es_conmemorativa,
    'fecha_deceso', v_a.fecha_deceso,
    'caracter_puntaje', v_a.caracter_puntaje,
    'bloques_resumen', v_a.bloques_resumen,
    'nivel', v_nivel,
    'extraviada', v_extraviada
  );

  -- Amistad, familia, o mascota extraviada: datos para reconocerla
  if v_nivel in ('amistad', 'familia') or v_extraviada then
    v_ficha := v_ficha || jsonb_build_object(
      'raza', v_a.raza,
      'tamano', v_a.tamano,
      'color_pelaje', v_a.color_pelaje,
      'sexo', v_a.sexo,
      'senas_particulares', v_a.senas_particulares
    );
  end if;

  -- Amistad y familia: cumpleaños, peso, nutrición, habilidades y salud
  if v_nivel in ('amistad', 'familia') then
    v_ficha := v_ficha || jsonb_build_object(
      'fecha_nacimiento', v_a.fecha_nacimiento,
      'peso_kg', v_a.peso_kg,
      'diagnostico_nutricional', v_a.diagnostico_nutricional,
      'habilidades', v_a.habilidades,
      'salud', coalesce((select s.datos from ladra.fichas_salud_animal s where s.animal_id = v_a.id), '{}'::jsonb)
    );
  end if;

  -- Solo la familia
  if v_nivel = 'familia' then
    v_ficha := v_ficha || jsonb_build_object(
      'numero_registro', v_a.numero_registro,
      'estado_registro', v_a.estado_registro,
      'caracter_respuestas', v_a.caracter_respuestas,
      'mostrar_en_red', v_a.mostrar_en_red,
      'rol_familiar', ladra.rol_familiar_de_animal(v_a.id, v_yo)
    );
  end if;

  return v_ficha;
end;
$$;

comment on function ladra.ficha_animal_segun_relacion(uuid) is
  'Ficha de una mascota con solo los datos que puede ver quien consulta (sesión): desconocido, amistad o familia; más datos de reconocimiento si está extraviada. Devuelve null si no existe o no es visible.';

revoke all on function ladra.ficha_animal_segun_relacion(uuid) from public, anon, authenticated;
grant execute on function ladra.ficha_animal_segun_relacion(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

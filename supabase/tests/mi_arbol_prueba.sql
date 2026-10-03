-- Prueba de laboratorio de «Mi árbol de vínculos». Base Postgres DESECHABLE (nunca Supabase real).
-- Preparación: cargar supabase/tests/laboratorio_piezas_falsas.sql, luego todas las migraciones
-- (omitiendo las dos de AuraRitmos) y por último 20261003190000_mi_arbol_de_vinculos.sql.
-- Uso: psql -d <base> -f supabase/tests/mi_arbol_prueba.sql
\set ON_ERROR_STOP on
create schema t; grant usage on schema t to public;
create table t.res (ok boolean, nombre text); grant all on t.res to public;
create function t.chk(nombre text, cond boolean) returns void language plpgsql as $$
begin insert into t.res values (coalesce(cond, false), nombre); end $$;
create function t.falla(nombre text, q text, patron text) returns void language plpgsql as $$
begin
  execute q;
  insert into t.res values (false, nombre || ' (debió fallar)');
exception when others then
  insert into t.res values (sqlerrm ilike '%' || patron || '%', nombre || ' -> ' || left(sqlerrm, 80));
end $$;
create function t.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
create function t.tiene(path text) returns boolean language sql as
  $$ select jsonb_path_exists(ladra.mi_arbol(), path::jsonpath) $$;
create table t.ids (k text primary key, v uuid); grant all on t.ids to public;
grant execute on all functions in schema t to public;

\set U1 '00000000-0000-0000-0000-000000000001'
\set U2 '00000000-0000-0000-0000-000000000002'
\set U3 '00000000-0000-0000-0000-000000000003'
\set U4 '00000000-0000-0000-0000-000000000004'

insert into auth.users (id) values (:'U1'), (:'U2'), (:'U3'), (:'U4');
insert into ladra.perfiles_publicos (id, usuario_id, alias, estado) values
  ('a0000000-0000-0000-0000-000000000001', :'U1', 'Ana', 'publicado'),
  ('a0000000-0000-0000-0000-000000000002', :'U2', 'Bruno', 'publicado'),
  ('a0000000-0000-0000-0000-000000000003', :'U3', 'Carla', 'publicado');
insert into ladra.perfiles_publicos (id, usuario_id, alias, estado, visibilidad) values
  ('a0000000-0000-0000-0000-000000000004', :'U4', 'Dani oculto', 'publicado', 'oculto');
insert into ladra.animales (id, slug, nombre, especie, estado, creado_por) values
  ('b0000000-0000-0000-0000-000000000001', 'leia', 'Leia', 'perro', 'publicado', :'U1'),
  ('b0000000-0000-0000-0000-000000000002', 'pelusa', 'Pelusa', 'perro', 'publicado', :'U2');
insert into ladra.animales (id, slug, nombre, especie, estado, es_comunitario) values
  ('b0000000-0000-0000-0000-000000000003', 'michi', 'Michi', 'gato', 'publicado', true);
insert into ladra.animales (id, slug, nombre, especie, estado, creado_por, es_conmemorativa, fecha_deceso) values
  ('b0000000-0000-0000-0000-000000000004', 'toby', 'Toby', 'perro', 'publicado', :'U1', true, '2024-05-01');
-- Datos de salud: NO deben aparecer jamás en el árbol
insert into ladra.fichas_salud_animal (animal_id, datos)
values ('b0000000-0000-0000-0000-000000000001', '{"alergias":["alergia secreta de prueba"],"vacunacion":[{"nombre":"vacuna secreta"}]}'::jsonb);

-- ===== 1. Árbol propio y usuario nuevo =====
set role authenticated;
select t.como(:'U1');
select t.chk('árbol de Ana: incluye a Leia como propia (tutora)', t.tiene('$.integrantes[*] ? (@.nombre == "Leia" && @.propio == true).relaciones[*] ? (@.tipo == "tutor")'));
select t.chk('árbol de Ana: yo = Ana', ladra.mi_arbol()->'yo'->>'alias' = 'Ana');
select t.chk('rama de memoria de Toby visible por defecto', t.tiene('$.integrantes[*] ? (@.nombre == "Toby" && @.memoria == true && @.oculta == false)'));
select t.como(:'U3');
select t.chk('usuaria nueva: árbol vacío', jsonb_array_length(ladra.mi_arbol()->'integrantes') = 0 and jsonb_array_length(ladra.mi_arbol()->'momentos') = 0);
select t.como('');
select t.falla('sin sesión no hay árbol', 'select ladra.mi_arbol()', 'Sesión requerida');
reset role; set role anon;
select t.falla('anon no puede llamar mi_arbol', 'select ladra.mi_arbol()', 'permission denied');
reset role; set role authenticated;
select t.como(:'U3');
select t.falla('el navegador no puede pedir relaciones de otro usuario', format('select * from ladra.arbol_relaciones(%L)', :'U1'), 'permission denied');

-- ===== 2. Vínculo persona ↔ animal =====
select t.como(:'U1');
select t.falla('no se vincula a su propia mascota', $q$select ladra.arbol_vincular_animal('b0000000-0000-0000-0000-000000000001','amistad')$q$, 'parte de tu familia');
select t.chk('vínculo con mascota ajena queda pendiente', ladra.arbol_vincular_animal('b0000000-0000-0000-0000-000000000002', 'companero_paseo', 'Paseamos juntos') = 'pendiente');
select t.chk('el árbol de Ana muestra a Pelusa como pendiente', t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.estado == "pendiente" && @.origen == "animal_humano")'));
select t.falla('vínculo duplicado', $q$select ladra.arbol_vincular_animal('b0000000-0000-0000-0000-000000000002','companero_paseo')$q$, 'ya existe');
select t.falla('tipo inválido', $q$select ladra.arbol_vincular_animal('b0000000-0000-0000-0000-000000000002','jefe')$q$, 'inválido');
select t.chk('animal comunitario se confirma sin pedir permiso', ladra.arbol_vincular_animal('b0000000-0000-0000-0000-000000000003', 'cuidador') = 'confirmado');
select t.como(:'U3');
select t.chk('Carla no ve nada de ese vínculo', not t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa")'));
select t.como(:'U2');
select t.chk('Bruno aún no tiene a Ana en su árbol por ese vínculo pendiente', not t.tiene('$.integrantes[*] ? (@.nombre == "Ana")'));
reset role;
select id as vid from ladra.vinculos_animal_humano where animal_id = 'b0000000-0000-0000-0000-000000000002' \gset
set role authenticated;
select t.como(:'U3');
select t.falla('una tercera persona no responde la solicitud', format($f$select ladra.responder_solicitud_vinculo('vinculos_animal_humano', %L, 'confirmado')$f$, :'vid'), 'No puedes responder');
select t.como(:'U2');
select ladra.responder_solicitud_vinculo('vinculos_animal_humano', :'vid', 'confirmado');
select t.como(:'U1');
select t.chk('tras aceptar, Pelusa aparece confirmada en el árbol de Ana', t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.estado == "confirmado" && @.origen == "animal_humano")'));
select t.chk('el vínculo nuevo es privado por defecto (no público)', t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.origen == "animal_humano" && @.publico == false)'));
select t.como(:'U3');
select t.falla('Carla no puede retirar el vínculo ajeno', format($f$select ladra.arbol_retirar_vinculo('animal_humano', %L)$f$, :'vid'), 'No puedes retirar');
select t.como(:'U1');
select t.falla('solo la creadora edita el vínculo; Bruno no', 'select 1', 'x') where false;
select ladra.arbol_editar_vinculo('animal_humano', :'vid', null, 'Paseos de los sábados', true);
select t.chk('descripción y visibilidad editadas', t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.descripcion == "Paseos de los sábados" && @.publico == true)'));
select t.como(:'U2');
select t.falla('Bruno no edita el vínculo de Ana', format($f$select ladra.arbol_editar_vinculo('animal_humano', %L, null, 'cambio ajeno')$f$, :'vid'), 'No puedes editar');

-- ===== 3. Vínculo persona ↔ persona =====
select t.como(:'U1');
select t.chk('vincular persona queda pendiente', ladra.arbol_vincular_persona('a0000000-0000-0000-0000-000000000002', 'amistad') = 'pendiente');
select t.falla('persona con visibilidad oculta no se puede vincular', $q$select ladra.arbol_vincular_persona('a0000000-0000-0000-0000-000000000004','amistad')$q$, 'no disponible');
select t.falla('no se vincula consigo misma', $q$select ladra.arbol_vincular_persona('a0000000-0000-0000-0000-000000000001','amistad')$q$, 'contigo');
select t.chk('Ana ve la solicitud como pendiente enviada', t.tiene('$.integrantes[*] ? (@.nombre == "Bruno").relaciones[*] ? (@.estado == "pendiente")'));
select t.como(:'U2');
select t.chk('Bruno ve la invitación pendiente', jsonb_array_length(ladra.mi_arbol()->'pendientes'->'personas') = 1);
select t.chk('hasta aceptar, Ana no está en el árbol de Bruno', not t.tiene('$.integrantes[*] ? (@.nombre == "Ana")'));
select t.como(:'U3');
select t.chk('Carla no ve invitaciones ajenas', jsonb_array_length(ladra.mi_arbol()->'pendientes'->'personas') = 0);
reset role;
select id as pid from ladra.vinculos_personas limit 1 \gset
set role authenticated;
select t.falla('Carla no acepta por Bruno', format($f$select ladra.arbol_responder_vinculo_persona(%L,'confirmado')$f$, :'pid'), 'No puedes responder');
select t.como(:'U1');
select t.falla('Ana no se acepta a sí misma', format($f$select ladra.arbol_responder_vinculo_persona(%L,'confirmado')$f$, :'pid'), 'No puedes responder');
select t.como(:'U2');
select ladra.arbol_responder_vinculo_persona(:'pid', 'confirmado');
select t.chk('confirmado: Ana aparece en el árbol de Bruno', t.tiene('$.integrantes[*] ? (@.nombre == "Ana").relaciones[*] ? (@.estado == "confirmado")'));
select t.como(:'U1');
select t.chk('confirmado: Bruno en el árbol de Ana', t.tiene('$.integrantes[*] ? (@.nombre == "Bruno").relaciones[*] ? (@.estado == "confirmado" && @.origen == "personas")'));
select t.como(:'U3');
select t.chk('Carla sigue sin ver ese vínculo', not t.tiene('$.integrantes[*] ? (@.nombre == "Ana")'));
select t.chk('Carla no lee la tabla de vínculos ajenos', (select count(*) from ladra.vinculos_personas) = 0);

-- ===== 4. Integrantes privados =====
select t.como(:'U1');
select ladra.arbol_agregar_privado('familia', 'Mi abuela', 'Rosa', 'persona');
select ladra.arbol_agregar_privado('amistad', null, 'Firulais del vecino', 'animal');
select t.chk('Ana ve a Rosa (integrante privado)', t.tiene('$.integrantes[*] ? (@.nombre == "Rosa").relaciones[*] ? (@.origen == "privado" && @.estado == "privado")'));
select t.falla('privado exige nombre y clase', $q$select ladra.arbol_agregar_privado('amistad', null, 'Sin clase')$q$, 'persona o animal');
select t.falla('anotación duplicada', $q$select ladra.arbol_agregar_privado('amistad', null, null, null, 'b0000000-0000-0000-0000-000000000002')$q$, 'x') where false;
select t.como(:'U2');
select t.chk('Bruno no ve a Rosa', not t.tiene('$.integrantes[*] ? (@.nombre == "Rosa")'));
select t.chk('Bruno no puede leer la tabla de privados de Ana', (select count(*) from ladra.arbol_vinculos_privados) = 0);
select t.como(:'U3');
select t.chk('Carla no puede leer la tabla de privados', (select count(*) from ladra.arbol_vinculos_privados) = 0);
select t.falla('no se escribe directo en la tabla', $q$insert into ladra.arbol_vinculos_privados (propietario_id, clase, nombre, tipo) values ('00000000-0000-0000-0000-000000000003','persona','x','amistad')$q$, 'permission denied');
select t.chk('búsqueda exige 3 letras', (select count(*) from ladra.arbol_buscar_personas('Br')) = 0);
select t.chk('búsqueda encuentra por alias', (select count(*) from ladra.arbol_buscar_personas('Bru')) = 1);
select t.chk('búsqueda no devuelve perfiles ocultos ni a sí misma', (select count(*) from ladra.arbol_buscar_personas('Dani')) = 0 and (select count(*) from ladra.arbol_buscar_personas('Carl')) = 0);

-- ===== 5. Momentos =====
select t.como(:'U1');
select t.chk('registrar momento privado con Leia', ladra.arbol_registrar_momento('paseo', current_date, 'Paseo por el canil', 'privado', '[{"t":"animal","id":"b0000000-0000-0000-0000-000000000001"}]'::jsonb) is not null);
select t.chk('aparece en la historia de Ana (con Leia confirmada)', t.tiene('$.momentos[*] ? (@.tipo == "paseo" && @.es_mio == true).participantes[*] ? (@.nombre == "Leia" && @.estado == "confirmado")'));
select t.como(:'U2');
select t.chk('Bruno NO ve el momento privado de Ana', jsonb_array_length(ladra.mi_arbol()->'momentos') = 0);
select t.chk('Bruno no lo lee en la tabla', (select count(*) from ladra.momentos) = 0);
select t.como(:'U1');
select t.falla('con otra persona el momento no puede ser privado', $q$select ladra.arbol_registrar_momento('juego', current_date, 'x', 'privado', '[{"t":"animal","id":"b0000000-0000-0000-0000-000000000002"}]'::jsonb)$q$, 'debe compartirse');
select t.falla('fecha futura', $q$select ladra.arbol_registrar_momento('paseo', current_date + 30, 'x', 'privado', '[{"t":"animal","id":"b0000000-0000-0000-0000-000000000001"}]'::jsonb)$q$, 'fecha');
select t.falla('participante repetido', $q$select ladra.arbol_registrar_momento('paseo', current_date, 'x', 'privado', '[{"t":"animal","id":"b0000000-0000-0000-0000-000000000001"},{"t":"animal","id":"b0000000-0000-0000-0000-000000000001"}]'::jsonb)$q$, 'repetido');
select t.falla('sin participantes', $q$select ladra.arbol_registrar_momento('paseo', current_date, 'x', 'privado', '[]'::jsonb)$q$, 'participantes');
select t.falla('integrante privado ajeno no se puede usar', $q$select ladra.arbol_registrar_momento('paseo', current_date, 'x', 'privado', jsonb_build_array(jsonb_build_object('t','privado','id', gen_random_uuid())))$q$, 'no disponible');
select t.chk('momento compartido con Pelusa (de Bruno) y Rosa (privada)', (select ladra.arbol_registrar_momento('juego', current_date - 1, 'Tarde de juegos en el parque', 'compartido',
   jsonb_build_array(jsonb_build_object('t','animal','id','b0000000-0000-0000-0000-000000000002'), jsonb_build_object('t','privado','id',(select id from ladra.arbol_vinculos_privados where nombre='Rosa')))) is not null));
reset role;
select id as mid from ladra.momentos where tipo = 'juego' \gset
set role authenticated;
select t.como(:'U2');
select t.chk('Bruno aún no ve el texto: falta que confirme', jsonb_array_length(ladra.mi_arbol()->'momentos') = 0);
select t.chk('Bruno ve la invitación sin el texto del momento', t.tiene('$.pendientes.participaciones[*] ? (@.participante == "Pelusa" && @.de_alias == "Ana")')
  and not (ladra.mi_arbol()::text like '%Tarde de juegos%'));
select t.como(:'U3');
select t.chk('Carla no ve invitaciones de Bruno', jsonb_array_length(ladra.mi_arbol()->'pendientes'->'participaciones') = 0);
reset role;
select id as ppid from ladra.momentos_participantes where animal_id = 'b0000000-0000-0000-0000-000000000002' \gset
set role authenticated;
select t.falla('Carla no confirma por Bruno', format($f$select ladra.arbol_responder_participacion(%L,'confirmado')$f$, :'ppid'), 'No puedes responder');
select t.como(:'U2');
select ladra.arbol_responder_participacion(:'ppid', 'confirmado');
select t.chk('confirmado: Bruno ve el momento con su texto', t.tiene('$.momentos[*] ? (@.tipo == "juego" && @.es_mio == false && @.texto == "Tarde de juegos en el parque")'));
select t.chk('Bruno NO ve a la integrante privada de Ana (Rosa) entre los participantes', not (ladra.mi_arbol()::text like '%Rosa%'));
select t.falla('Bruno no edita el momento de Ana', format($f$select ladra.arbol_editar_momento(%L,'paseo',current_date,'cambio','privado')$f$, :'mid'), 'No puedes editar');
select t.falla('Bruno no elimina el momento de Ana', format($f$select ladra.arbol_eliminar_momento(%L)$f$, :'mid'), 'No puedes eliminar');
select t.como(:'U3');
select t.chk('Carla sigue sin ver el momento compartido', not (ladra.mi_arbol()::text like '%Tarde de juegos%') and (select count(*) from ladra.momentos) = 0);
select t.como(:'U1');
select t.falla('no se pasa a privado con participantes de otros hogares', format($f$select ladra.arbol_editar_momento(%L,'juego',current_date,'x','privado')$f$, :'mid'), 'otros hogares');
select ladra.arbol_editar_momento(:'mid', 'encuentro', current_date - 1, 'Tarde de juegos y encuentro', 'compartido');
select t.como(:'U2');
select t.chk('la edición se refleja para Bruno sin duplicar el momento', t.tiene('$.momentos[*] ? (@.tipo == "encuentro" && @.texto == "Tarde de juegos y encuentro")') and jsonb_array_length(ladra.mi_arbol()->'momentos') = 1);
select t.como(:'U1');
select ladra.arbol_eliminar_momento(:'mid');
select t.chk('eliminado: desaparece para Ana', jsonb_array_length(ladra.mi_arbol()->'momentos') = 1);  -- queda el paseo privado
select t.como(:'U2');
select t.chk('eliminado: desaparece para Bruno', jsonb_array_length(ladra.mi_arbol()->'momentos') = 0);

-- ===== 6. Retirar y compatibilidad con la ficha =====
select t.como(:'U2');
select ladra.arbol_retirar_vinculo('animal_humano', :'vid');
select t.chk('el dueño principal de Pelusa puede retirar un vínculo hacia su mascota', (select estado from ladra.vinculos_animal_humano where id = :'vid') = 'revocado');
select t.como(:'U1');
select t.chk('retirado: Pelusa deja de aparecer en el árbol de Ana', not t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.origen == "animal_humano")'));
select t.chk('el mismo cambio se ve en la tabla que lee la ficha (estado revocado)', (select estado from ladra.vinculos_animal_humano where id = :'vid') = 'revocado');
select ladra.arbol_retirar_vinculo('privado', (select id from ladra.arbol_vinculos_privados where nombre = 'Firulais del vecino'));
select t.chk('Ana retira su anotación privada', not exists (select 1 from ladra.arbol_vinculos_privados where nombre = 'Firulais del vecino'));
select t.chk('retirada: ya no está', not t.tiene('$.integrantes[*] ? (@.nombre == "Firulais del vecino")'));

-- Vínculo animal ↔ animal existente (misma tabla que usa la ficha) aparece en el árbol
select ladra.solicitar_vinculo_animales('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'amistad', 'Amigas de paseo');
reset role;
select id as aid from ladra.vinculos_animales limit 1 \gset
set role authenticated;
select t.como(:'U2');
select ladra.responder_solicitud_vinculo('vinculos_animales', :'aid', 'confirmado');
select t.como(:'U1');
select t.chk('ficha→árbol: la amistad Leia–Pelusa creada en la red aparece en el árbol', t.tiene('$.integrantes[*] ? (@.nombre == "Pelusa").relaciones[*] ? (@.origen == "animales" && @.estado == "confirmado")') and jsonb_array_length(ladra.mi_arbol()->'conexiones') = 1);
select ladra.arbol_retirar_vinculo('animales', :'aid');
select t.chk('árbol→ficha: retirarla en el árbol la revoca en la tabla compartida', (select estado from ladra.vinculos_animales where id = :'aid') = 'revocado' and jsonb_array_length(ladra.mi_arbol()->'conexiones') = 0);
select t.como(:'U3');
select t.falla('Carla no retira vínculos entre animales ajenos', format($f$select ladra.arbol_retirar_vinculo('animales', %L)$f$, :'aid'), 'No puedes retirar');

-- ===== 7. Rama de memoria y privacidad de salud =====
select t.como(:'U1');
select ladra.arbol_alternar_rama_memoria('b0000000-0000-0000-0000-000000000004', true);
select t.chk('la rama de memoria se puede ocultar', t.tiene('$.integrantes[*] ? (@.nombre == "Toby" && @.oculta == true)'));
select ladra.arbol_alternar_rama_memoria('b0000000-0000-0000-0000-000000000004', false);
select t.chk('y volver a mostrar', t.tiene('$.integrantes[*] ? (@.nombre == "Toby" && @.oculta == false)'));
select t.falla('solo fichas conmemorativas tienen rama de memoria', $q$select ladra.arbol_alternar_rama_memoria('b0000000-0000-0000-0000-000000000001', true)$q$, 'conmemorativas');
select t.chk('datos de salud nunca aparecen en el árbol', not (ladra.mi_arbol()::text ilike '%alerg%') and not (ladra.mi_arbol()::text ilike '%secreta%') and not (ladra.mi_arbol()::text ilike '%vacun%'));
select t.chk('sin inactividad: el árbol no tiene campo de marchitamiento ni puntuación', not (ladra.mi_arbol()::text ~* '(puntaje|score|marchit|salud)'));

reset role;
select case when ok then 'PASS' else 'FAIL' end as r, nombre from t.res where not ok;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from t.res;

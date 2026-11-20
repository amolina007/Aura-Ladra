-- Catálogo único: recompensa, límites y progreso de EXP de Ladra.
create table ladra.misiones_experiencia (
 clave text primary key,
 titulo text not null,
 grupo text not null,
 descripcion text not null,
 puntos smallint not null check (puntos between 1 and 100),
 limite_diario smallint not null check (limite_diario between 1 and 10),
 una_vez boolean not null default false,
 destino text not null check (destino ~ '^#[a-z-]+$'),
 orden smallint not null
);
alter table ladra.misiones_experiencia enable row level security;
revoke all on ladra.misiones_experiencia from public, anon, authenticated;
grant select on ladra.misiones_experiencia to anon, authenticated;
create policy misiones_catalogo_lectura on ladra.misiones_experiencia for select to anon, authenticated using (true);
insert into ladra.misiones_experiencia values
('perfil_publico','Presentarte a la comunidad','Mi red','Publica tu alias y una biografía de al menos 10 caracteres. Una vez por cuenta.',10,1,true,'#red',1),
('perfil_mascota','Registrar tu mascota','Mis mascotas','Publica la ficha de tu mascota propia con foto. Una vez por mascota; máximo 3 al día.',20,3,false,'#mi-espacio',2),
('paseo_diario','Registrar un paseo','Día a día','Guarda un paseo con fecha de hoy. Un premio diario, aunque registres varios.',5,1,false,'#inicio',3),
('juego_diario','Compartir tiempo de juego','Día a día','Registra una actividad de juego con fecha de hoy. Un premio al día.',5,1,false,'#inicio',4),
('cuidado_diario','Registrar un cuidado','Día a día','Guarda un cuidado con fecha de hoy. Un premio al día.',5,1,false,'#inicio',5),
('encuentro_diario','Registrar un encuentro','Día a día','Registra un encuentro con fecha de hoy. Un premio al día.',5,1,false,'#inicio',6),
('momento_diario','Guardar otro momento','Día a día','Guarda un recuerdo o una adopción con fecha de hoy. Un premio diario entre ambos tipos.',3,1,false,'#inicio',7),
('foto_mascota','Añadir una foto','Fotos y comunidad','Sube una foto nueva a la galería de tu mascota. Un premio al día.',5,1,false,'#mi-espacio',8),
('publicacion_feed','Publicar en el Feed','Fotos y comunidad','Comparte una publicación nueva con texto o foto. Un premio al día.',5,1,false,'#feed-ladra',9),
('historia_feed','Compartir una historia','Fotos y comunidad','Publica una historia nueva. Un premio al día.',3,1,false,'#feed-ladra',10),
('video_truco','Practicar un truco','Fotos y comunidad','Sube un video nuevo de un truco con título. Un premio al día.',8,1,false,'#mi-espacio',11),
('truco_aprendido','Registrar un truco aprendido','Fotos y comunidad','Marca un video como aprendido. Una vez por mascota y nombre del truco; máximo 1 al día.',10,1,false,'#mi-espacio',12),
('comentario_feed','Comentar a otra persona','Fotos y comunidad','Escribe al menos 10 caracteres en una publicación ajena. Un premio al día.',2,1,false,'#feed-ladra',13),
('seguir_mascota','Seguir una mascota','Mi red','Sigue una mascota de otra persona. Una vez por mascota; máximo 1 al día.',2,1,false,'#red',14),
('guardar_mascota','Guardar una mascota','Mi red','Guarda una mascota ajena que te interese. Una vez por mascota; máximo 1 al día.',1,1,false,'#red',15),
('vinculo_confirmado','Conectar tu red','Mi red','Solicita un vínculo entre mascotas o entre una mascota y una persona y espera su confirmación. Una vez por vínculo; máximo 3 al día.',5,3,false,'#red',16),
('recurso_validado','Aportar un lugar útil','Ayuda y barrio','Propón un lugar o una corrección, como una veterinaria. Suma cuando moderación lo aprueba; máximo 3 al día.',15,3,false,'#mapa',17),
('aviso_busqueda','Publicar una búsqueda','Ayuda y barrio','Publica un aviso de Most Wanted con foto y relato. Una vez por mascota; máximo 1 al día.',15,1,false,'#most-wanted',18),
('aviso_externo','Importar un afiche','Ayuda y barrio','Importa manualmente un aviso con foto, descripción y fuente. Una vez por enlace de origen; máximo 1 al día. La importación automática no suma EXP.',10,1,false,'#most-wanted',19),
('alerta_mascota','Informar una mascota extraviada','Ayuda y barrio','Registra una alerta con nombre, descripción y zona. Una vez por alerta; máximo 1 al día.',10,1,false,'#mi-espacio',20),
('ayuda_verificada','Ayudar a recuperar una mascota','Ayuda y barrio','Presenta evidencia en Most Wanted y espera que tu reclamo quede verificado. Una vez por aviso; máximo 2 al día.',50,2,false,'#most-wanted',21),
('reporte_canil','Cuidar los lugares del barrio','Ayuda y barrio','Informa un problema de agua, limpieza, seguridad o infraestructura. Suma cuando el reporte queda verificado; máximo 3 al día.',15,3,false,'#mapa',22),
('reporte_red','Ayudar a moderar la red','Ayuda y barrio','Reporta un problema real. Suma cuando moderación toma una acción; máximo 3 al día.',10,3,false,'#red',23),
('producto_market','Ofrecer un producto','Mercado','Publica un producto con foto y descripción. Una vez por producto; máximo 1 al día.',10,1,false,'#market',24),
('servicio_publicado','Ofrecer un servicio','Mercado','Publica un servicio para mascotas con descripción. Una vez por servicio; máximo 1 al día.',10,1,false,'#servicios',25),
('respuesta_market','Responder sobre tu producto','Mercado','Responde con al menos 10 caracteres a la consulta de otra persona. Una vez por consulta; máximo 3 al día.',2,3,false,'#market',26),
('respuesta_servicio','Responder sobre tu servicio','Mercado','Responde con al menos 10 caracteres a una solicitud ajena. Una vez por consulta; máximo 3 al día.',2,3,false,'#servicios',27);

alter table ladra.experiencia_eventos drop constraint experiencia_eventos_evento_check;
alter table ladra.experiencia_eventos add constraint experiencia_eventos_mision_fk foreign key (evento) references ladra.misiones_experiencia(clave);
create index experiencia_eventos_limite_idx on ladra.experiencia_eventos(usuario_id, evento, creado_en);

create or replace function ladra.registrar_experiencia_interna(p_usuario_id uuid,p_evento text,p_referencia_id text)
returns void language plpgsql security definer set search_path=pg_catalog,ladra as $$
declare m ladra.misiones_experiencia%rowtype; inicio timestamptz;
begin
 if p_usuario_id is null or nullif(p_referencia_id,'') is null then return; end if;
 select * into m from ladra.misiones_experiencia where clave=p_evento;
 if not found then return; end if;
 -- Serializa por persona y misión: dos peticiones simultáneas no superan el tope.
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text||':'||p_evento,0));
 inicio := date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago';
 if m.una_vez and exists(select 1 from ladra.experiencia_eventos where usuario_id=p_usuario_id and evento=p_evento) then return; end if;
 if (select count(*) from ladra.experiencia_eventos where usuario_id=p_usuario_id and evento=p_evento and creado_en>=inicio) >= m.limite_diario then return; end if;
 insert into ladra.experiencia_eventos(usuario_id,evento,referencia_id,puntos)
 values(p_usuario_id,p_evento,p_referencia_id,m.puntos)
 on conflict(usuario_id,evento,referencia_id) do nothing;
end; $$;
revoke all on function ladra.registrar_experiencia_interna(uuid,text,text) from public,anon,authenticated;

create function ladra.experiencia_accion_guardada()
returns trigger language plpgsql security definer set search_path=pg_catalog,ladra as $$
declare d jsonb:=to_jsonb(new); u uuid; evento text; ref text:=d->>'id'; hoy text:=to_char(now() at time zone 'America/Santiago','YYYY-MM-DD'); propietario uuid;
begin
 case TG_TABLE_NAME
 when 'perfiles_publicos' then
  if d->>'estado'='publicado' and length(btrim(coalesce(d->>'biografia','')))>=10 and length(btrim(coalesce(d->>'alias','')))>=2 then
   u:=(d->>'usuario_id')::uuid; evento:='perfil_publico'; ref:='perfil';
  end if;
 when 'momentos' then
  if d->>'fecha'=hoy then
   u:=(d->>'autor_id')::uuid; ref:=hoy;
   evento:=case d->>'tipo' when 'paseo' then 'paseo_diario' when 'juego' then 'juego_diario' when 'cuidado' then 'cuidado_diario' when 'encuentro' then 'encuentro_diario' when 'recuerdo' then 'momento_diario' when 'adopcion' then 'momento_diario' end;
  end if;
 when 'publicaciones_feed' then
  u:=(d->>'autor_id')::uuid;
  evento:=case d->>'tipo' when 'post' then 'publicacion_feed' when 'historia' then 'historia_feed' end;
 when 'medios_mascota' then
  if nullif(d->>'ruta_archivo','') is not null then
   u:=(d->>'autor_id')::uuid;
   if TG_OP='INSERT' then
    evento:=case d->>'tipo' when 'foto' then 'foto_mascota' when 'video' then 'video_truco' end;
    perform ladra.registrar_experiencia_interna(u,evento,ref);
   end if;
   if d->>'tipo'='video' and d->>'estado'='aprendido' then
    evento:='truco_aprendido'; ref:=(d->>'animal_id')||':'||lower(regexp_replace(btrim(d->>'titulo'),'\s+',' ','g'));
   else return new; end if;
  end if;
 when 'comentarios_feed' then
  if length(btrim(d->>'texto'))>=10 then
   if d->>'publicacion_id' is not null then select autor_id into propietario from ladra.publicaciones_feed where id=(d->>'publicacion_id')::uuid;
   else select autor_id into propietario from ladra.medios_mascota where id=(d->>'medio_id')::uuid; end if;
   u:=(d->>'autor_id')::uuid;
   if propietario is not null and propietario<>u then evento:='comentario_feed'; end if;
  end if;
 when 'animales_seguidos','animales_guardados' then
  u:=(d->>'usuario_id')::uuid; ref:=d->>'animal_id';
  select creado_por into propietario from ladra.animales where id=ref::uuid;
  if propietario is not null and propietario<>u then
   evento:=case TG_TABLE_NAME when 'animales_seguidos' then 'seguir_mascota' else 'guardar_mascota' end;
  end if;
 when 'vinculos_animal_humano','vinculos_animales' then
  if d->>'estado'='confirmado' then
   u:=(d->>'creado_por')::uuid; evento:='vinculo_confirmado';
   ref:=case TG_TABLE_NAME when 'vinculos_animales' then least(d->>'animal_a_id',d->>'animal_b_id')||':'||greatest(d->>'animal_a_id',d->>'animal_b_id') else (d->>'animal_id')||':'||(d->>'perfil_publico_id') end;
  end if;
 when 'avisos_most_wanted' then
  if d->>'estado'='publicado' and nullif(d->>'foto_path','') is not null then u:=(d->>'dueno_id')::uuid; evento:='aviso_busqueda'; ref:=d->>'animal_id'; end if;
 when 'avisos_externos' then
  if d->>'estado'<>'retirado' and length(btrim(coalesce(d->>'descripcion','')))>=20 and (nullif(d->>'foto_path','') is not null or jsonb_array_length(coalesce(nullif(d->'fotos_paths','null'::jsonb),'[]'::jsonb))>0) then
   u:=(d->>'autor_id')::uuid; evento:='aviso_externo'; ref:=md5(lower(btrim(d->>'fuente_url')));
  end if;
 when 'alertas_mascotas' then
  if length(btrim(coalesce(d->>'nombre','')))>=2 and length(btrim(coalesce(d->>'descripcion','')))>=20 and nullif(btrim(d->>'direccion_publica'),'') is not null then
   u:=(d->>'reportante_id')::uuid; evento:='alerta_mascota'; ref:=coalesce(d->>'animal_id',ref);
  end if;
 when 'reclamos_most_wanted' then
  if d->>'estado'='verificado' then
   u:=(d->>'reclamante_id')::uuid; select dueno_id into propietario from ladra.avisos_most_wanted where id=(d->>'aviso_id')::uuid;
   if propietario<>u then evento:='ayuda_verificada'; ref:=d->>'aviso_id'; end if;
  end if;
 when 'reportes_canil' then
  if d->>'estado'='verificado' then u:=(d->>'reportante_id')::uuid; evento:='reporte_canil'; end if;
 when 'reportes_red' then
  if d->>'estado'='accion_tomada' then u:=(d->>'reportante_id')::uuid; evento:='reporte_red'; end if;
 when 'market_productos' then
  if d->>'estado'='publicado' and nullif(d->>'foto_path','') is not null then u:=(d->>'propietario_id')::uuid; evento:='producto_market'; end if;
 when 'servicios' then
  if (d->>'publicado')::boolean and length(btrim(coalesce(d->>'descripcion','')))>=20 then u:=(d->>'propietario_id')::uuid; evento:='servicio_publicado'; end if;
 when 'market_consultas','servicio_consultas' then
  if length(btrim(coalesce(d->>'respuesta','')))>=10 then
   if TG_TABLE_NAME='market_consultas' then u:=(d->>'vendedor_id')::uuid; propietario:=(d->>'comprador_id')::uuid; evento:='respuesta_market';
   else u:=(d->>'prestador_id')::uuid; propietario:=(d->>'solicitante_id')::uuid; evento:='respuesta_servicio'; end if;
   if u=propietario then return new; end if;
  end if;
 else return new;
 end case;
 if evento is not null then perform ladra.registrar_experiencia_interna(u,evento,ref); end if;
 return new;
end; $$;
revoke all on function ladra.experiencia_accion_guardada() from public,anon,authenticated;

-- El paseo anterior queda incluido en el mismo catálogo que las demás actividades.
drop trigger experiencia_paseo_diario on ladra.momentos;
do $$ declare tabla text; begin
 foreach tabla in array array['momentos','publicaciones_feed','comentarios_feed','animales_seguidos','animales_guardados','alertas_mascotas'] loop
  execute format('create trigger experiencia_mision after insert on ladra.%I for each row execute function ladra.experiencia_accion_guardada()',tabla);
 end loop;
 foreach tabla in array array['perfiles_publicos','medios_mascota','vinculos_animal_humano','vinculos_animales','avisos_most_wanted','avisos_externos','reclamos_most_wanted','reportes_canil','reportes_red','market_productos','servicios','market_consultas','servicio_consultas'] loop
  execute format('create trigger experiencia_mision after insert or update on ladra.%I for each row execute function ladra.experiencia_accion_guardada()',tabla);
 end loop;
end $$;

create function ladra.mis_misiones_experiencia()
returns table(clave text,titulo text,grupo text,descripcion text,puntos smallint,limite_diario smallint,una_vez boolean,destino text,completadas_hoy bigint,completadas_total bigint,exp_total bigint,con_sesion boolean)
language sql stable security definer set search_path=pg_catalog,ladra as $$
 select m.clave,m.titulo,m.grupo,m.descripcion,m.puntos,m.limite_diario,m.una_vez,m.destino,
 count(e.id) filter(where e.creado_en >= (date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago')),
 count(e.id),coalesce(sum(e.puntos),0)::bigint,(select auth.uid()) is not null
 from ladra.misiones_experiencia m
 left join ladra.experiencia_eventos e on e.evento=m.clave and e.usuario_id=(select auth.uid())
 group by m.clave order by m.orden;
$$;
revoke all on function ladra.mis_misiones_experiencia() from public;
grant execute on function ladra.mis_misiones_experiencia() to anon,authenticated;

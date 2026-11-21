-- Reconocimiento de registros ya existentes. No modifica mascotas ni publicaciones.
-- creado_en conserva la fecha del registro de origen para aplicar los topes originales;
-- reconocido_en registra cuándo se reconoció la EXP y es_historico deja su procedencia.
alter table ladra.experiencia_eventos
 add column reconocido_en timestamptz not null default now(),
 add column es_historico boolean not null default false;

create function ladra.reconocer_experiencia_historica()
returns integer language plpgsql security definer set search_path=pg_catalog,ladra as $$
declare v_candidato record; v_mision ladra.misiones_experiencia%rowtype; inicio timestamptz; fin timestamptz; n integer; total integer:=0;
begin
 for v_candidato in
  select usuario_id,evento,referencia_id,min(fecha) as fecha
  from (
   select a.creado_por as usuario_id,'perfil_mascota'::text as evento,a.id::text as referencia_id,a.creado_en as fecha
   from ladra.animales a
   where a.estado='publicado' and not a.es_comunitario and not a.es_conmemorativa
    and (nullif(btrim(a.foto_url),'') is not null or coalesce(cardinality(a.foto_urls),0)>0)
   union all
   select p.usuario_id,'perfil_publico','perfil',p.creado_en from ladra.perfiles_publicos p
   where p.estado='publicado' and length(btrim(coalesce(p.alias,'')))>=2 and length(btrim(coalesce(p.biografia,'')))>=10
   union all
   select m.autor_id,
    case m.tipo when 'paseo' then 'paseo_diario' when 'juego' then 'juego_diario' when 'cuidado' then 'cuidado_diario' when 'encuentro' then 'encuentro_diario' else 'momento_diario' end,
    to_char(m.fecha,'YYYY-MM-DD'),m.creado_en
   from ladra.momentos m
   where m.tipo in ('paseo','juego','cuidado','encuentro','recuerdo','adopcion')
    and m.fecha=(m.creado_en at time zone 'America/Santiago')::date
   union all
   select f.autor_id,case f.tipo when 'post' then 'publicacion_feed' else 'historia_feed' end,f.id::text,f.creado_en
   from ladra.publicaciones_feed f where f.tipo in ('post','historia')
    and (nullif(btrim(f.texto),'') is not null or nullif(f.ruta_archivo,'') is not null)
   union all
   select f.autor_id,case f.tipo when 'foto' then 'foto_mascota' else 'video_truco' end,f.id::text,f.creado_en
   from ladra.medios_mascota f where f.tipo in ('foto','video') and nullif(f.ruta_archivo,'') is not null
   union all
   select f.autor_id,'truco_aprendido',f.animal_id::text||':'||lower(regexp_replace(btrim(f.titulo),'\s+',' ','g')),f.creado_en
   from ladra.medios_mascota f where f.tipo='video' and f.estado='aprendido' and nullif(f.ruta_archivo,'') is not null
   union all
   select c.autor_id,'comentario_feed',c.id::text,c.creado_en
   from ladra.comentarios_feed c
   left join ladra.publicaciones_feed p on p.id=c.publicacion_id
   left join ladra.medios_mascota f on f.id=c.medio_id
   where length(btrim(c.texto))>=10 and coalesce(p.autor_id,f.autor_id)<>c.autor_id
   union all
   select s.usuario_id,'seguir_mascota',s.animal_id::text,s.creado_en from ladra.animales_seguidos s
   join ladra.animales a on a.id=s.animal_id where a.creado_por<>s.usuario_id
   union all
   select s.usuario_id,'guardar_mascota',s.animal_id::text,s.creado_en from ladra.animales_guardados s
   join ladra.animales a on a.id=s.animal_id where a.creado_por<>s.usuario_id
   union all
   select v.creado_por,'vinculo_confirmado',least(v.animal_a_id::text,v.animal_b_id::text)||':'||greatest(v.animal_a_id::text,v.animal_b_id::text),v.creado_en
   from ladra.vinculos_animales v where v.estado='confirmado'
   union all
   select v.creado_por,'vinculo_confirmado',v.animal_id::text||':'||v.perfil_publico_id::text,v.creado_en
   from ladra.vinculos_animal_humano v where v.estado='confirmado'
   union all
   select p.creado_por,'recurso_validado',p.id::text,coalesce(p.moderado_en,p.creado_en)
   from ladra.propuestas_lugares p where p.estado='aprobada'
   union all
   select a.dueno_id,'aviso_busqueda',a.animal_id::text,a.publicado_en from ladra.avisos_most_wanted a
   where a.estado='publicado' and nullif(a.foto_path,'') is not null
   union all
   select a.autor_id,'aviso_externo',md5(lower(btrim(a.fuente_url))),a.creado_en from ladra.avisos_externos a
   where a.estado<>'retirado' and length(btrim(coalesce(a.descripcion,'')))>=20
    and (nullif(a.foto_path,'') is not null or coalesce(cardinality(a.fotos_paths),0)>0)
   union all
   select a.reportante_id,'alerta_mascota',coalesce(a.animal_id::text,a.id::text),a.creado_en from ladra.alertas_mascotas a
   where length(btrim(coalesce(a.nombre,'')))>=2 and length(btrim(coalesce(a.descripcion,'')))>=20 and nullif(btrim(a.direccion_publica),'') is not null
   union all
   select r.reclamante_id,'ayuda_verificada',r.aviso_id::text,r.creado_en from ladra.reclamos_most_wanted r
   join ladra.avisos_most_wanted a on a.id=r.aviso_id where r.estado='verificado' and r.reclamante_id<>a.dueno_id
   union all
   select r.reportante_id,'reporte_canil',r.id::text,coalesce(r.moderado_en,r.creado_en) from ladra.reportes_canil r where r.estado='verificado'
   union all
   select r.reportante_id,'reporte_red',r.id::text,coalesce(r.moderado_en,r.creado_en) from ladra.reportes_red r where r.estado='accion_tomada'
   union all
   select p.propietario_id,'producto_market',p.id::text,p.creado_en from ladra.market_productos p
   where p.estado='publicado' and nullif(p.foto_path,'') is not null
   union all
   select s.propietario_id,'servicio_publicado',s.id::text,s.creado_en from ladra.servicios s
   where s.publicado and length(btrim(coalesce(s.descripcion,'')))>=20
   union all
   select c.vendedor_id,'respuesta_market',c.id::text,coalesce(c.respondido_en,c.creado_en) from ladra.market_consultas c
   where c.vendedor_id<>c.comprador_id and length(btrim(coalesce(c.respuesta,'')))>=10
   union all
   select c.prestador_id,'respuesta_servicio',c.id::text,c.creado_en from ladra.servicio_consultas c
   where c.prestador_id<>c.solicitante_id and length(btrim(coalesce(c.respuesta,'')))>=10
  ) candidatos
  where usuario_id is not null and referencia_id is not null and fecha is not null and fecha<=now()
  group by usuario_id,evento,referencia_id order by min(fecha),usuario_id,evento,referencia_id
 loop
  select * into v_mision from ladra.misiones_experiencia where clave=v_candidato.evento;
  if not found then continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_candidato.usuario_id::text||':'||v_candidato.evento,0));
  if exists(select 1 from ladra.experiencia_eventos e where e.usuario_id=v_candidato.usuario_id and e.evento=v_candidato.evento and e.referencia_id=v_candidato.referencia_id) then continue; end if;
  if v_mision.una_vez and exists(select 1 from ladra.experiencia_eventos e where e.usuario_id=v_candidato.usuario_id and e.evento=v_candidato.evento) then continue; end if;
  inicio := date_trunc('day',v_candidato.fecha at time zone 'America/Santiago') at time zone 'America/Santiago';
  fin := (date_trunc('day',v_candidato.fecha at time zone 'America/Santiago')+interval '1 day') at time zone 'America/Santiago';
  if (select count(*) from ladra.experiencia_eventos e where e.usuario_id=v_candidato.usuario_id and e.evento=v_candidato.evento and e.creado_en>=inicio and e.creado_en<fin)>=v_mision.limite_diario then continue; end if;
  insert into ladra.experiencia_eventos(usuario_id,evento,referencia_id,puntos,creado_en,reconocido_en,es_historico)
   values(v_candidato.usuario_id,v_candidato.evento,v_candidato.referencia_id,v_mision.puntos,v_candidato.fecha,now(),true)
   on conflict(usuario_id,evento,referencia_id) do nothing;
  get diagnostics n=row_count;
  total:=total+n;
 end loop;
 return total;
end; $$;
revoke all on function ladra.reconocer_experiencia_historica() from public,anon,authenticated;

-- La misma identificación (usuario, misión, registro) rige para historia y nuevos premios.
select ladra.reconocer_experiencia_historica();

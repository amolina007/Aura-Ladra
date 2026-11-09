(() => {
  'use strict';
  const tabla = 'publicaciones_feed', bucket = 'ladra-feed';
  const db = () => window.auraLadraDb;
  const columnas = 'id,animal_id,autor_id,tipo,texto,ruta_archivo,creado_en,revision,edicion_clave,animales!inner(id,nombre,especie,foto_url)';
  const convertir = item => ({
    id: item.id, tipo: item.tipo, mascota: item.animales, autorId: item.autor_id,
    texto: item.texto, imagen: item.ruta_archivo ? db().storage.from(bucket).getPublicUrl(item.ruta_archivo).data.publicUrl : '',
    ruta: item.ruta_archivo, creado: item.creado_en, revision: item.revision, edicionClave: item.edicion_clave, remoto: true,
  });
  const cargar = async (autorId = null) => {
    let consulta = db().from(tabla).select(columnas).order('creado_en', { ascending: false }).limit(200);
    if (autorId) consulta = consulta.eq('autor_id', autorId);
    const { data, error } = await consulta;
    if (error) throw error;
    return (data || []).map(convertir);
  };
  const buscar = async id => {
    const { data, error } = await db().from(tabla).select(columnas).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? convertir(data) : null;
  };
  const guardar = async operacion => {
    const { data: auth, error: authError } = await db().auth.getUser();
    if (authError || !auth.user || auth.user.id !== operacion.autorId) throw Error('Tu sesión cambió. Vuelve a iniciar sesión antes de publicar.');
    const existente = await buscar(operacion.id);
    if (existente && existente.autorId !== operacion.autorId) throw Error('Esta publicación pertenece a otra cuenta.');
    if (existente && (!operacion.editar || existente.edicionClave === operacion.clave)) return existente;
    if (operacion.editar && (!existente || existente.revision !== operacion.revision)) throw Error('La publicación cambió en otro dispositivo. Ciérrala y vuelve a abrirla antes de editar.');
    if (operacion.blob && !operacion.subida) {
      const { error } = await db().storage.from(bucket).upload(operacion.ruta, operacion.blob, { contentType: 'image/jpeg', upsert: false });
      // La ruta contiene una clave aleatoria estable por intento; un reintento puede
      // encontrar el archivo de una subida cuya respuesta se perdió.
      if (error && String(error.statusCode) !== '409' && error.error !== 'Duplicate') throw error;
      operacion.subida = true;
    }
    const valores = { texto: operacion.texto, ruta_archivo: operacion.ruta || null, edicion_clave: operacion.clave };
    const q = operacion.editar
      ? db().from(tabla).update(valores).eq('id', operacion.id).eq('revision', operacion.revision)
      : db().from(tabla).insert({ ...valores, id: operacion.id, animal_id: operacion.animalId, tipo: operacion.tipo });
    const { data, error } = await q.select(columnas).maybeSingle();
    if (error) throw error;
    if (!data) throw Error('La publicación cambió. Ciérrala y vuelve a abrirla antes de editar.');
    if (operacion.rutaAnterior && operacion.rutaAnterior !== operacion.ruta) {
      try { await db().storage.from(bucket).remove([operacion.rutaAnterior]); } catch { /* La publicación ya quedó guardada. */ }
    }
    return convertir(data);
  };
  const eliminar = async post => {
    const { data: auth, error: authError } = await db().auth.getUser();
    if (authError || auth.user?.id !== post.autorId) throw Error('Tu sesión cambió. Vuelve a iniciar sesión antes de eliminar.');
    const { error } = await db().from(tabla).delete().eq('id', post.id);
    if (error) throw error;
    if (post.ruta) { try { await db().storage.from(bucket).remove([post.ruta]); } catch { /* La publicación ya se eliminó. */ } }
  };
  const cargarComentarios = async (destino, incluirAutor = false) => {
    const campo = destino?.publicacionId ? 'publicacion_id' : destino?.medioId ? 'medio_id' : null;
    const id = destino?.publicacionId || destino?.medioId;
    if (!campo || !id) return [];
    const columnas = incluirAutor ? 'id,publicacion_id,medio_id,autor_id,texto,creado_en' : 'id,publicacion_id,medio_id,texto,creado_en';
    const { data, error } = await db().from('comentarios_feed')
      .select(columnas)
      .eq(campo, id).order('creado_en', { ascending: true }).limit(200);
    if (error) throw error;
    return data || [];
  };
  const comentar = async (destino, texto) => {
    const { data: auth, error: authError } = await db().auth.getUser();
    if (authError || !auth.user) throw Error('Inicia sesión para comentar.');
    const referencia = destino?.publicacionId
      ? { publicacion_id: destino.publicacionId }
      : destino?.medioId ? { medio_id: destino.medioId } : null;
    if (!referencia) throw Error('Esta publicación no admite comentarios compartidos.');
    const limpio = String(texto || '').trim();
    if (!limpio || limpio.length > 500) throw Error('Escribe un comentario de hasta 500 caracteres.');
    const { error } = await db().from('comentarios_feed').insert({ ...referencia, autor_id: auth.user.id, texto: limpio });
    if (error) throw error;
  };
  const eliminarComentario = async id => {
    const { data: auth, error: authError } = await db().auth.getUser();
    if (authError || !auth.user) throw Error('Inicia sesión para continuar.');
    const { error } = await db().from('comentarios_feed').delete().eq('id', id).eq('autor_id', auth.user.id);
    if (error) throw error;
  };
  window.auraLadraFeedDatos = { cargar, guardar, eliminar, cargarComentarios, comentar, eliminarComentario };
})();

(() => {
  'use strict';

  async function verificarBackend() {
    try {
      if (!window.auraLadraDb) {
        throw new Error('Cliente Supabase no inicializado.');
      }

      const { data, error } = await window.auraLadraDb
        .from('estado_sistema')
        .select('estado, version, actualizado_en')
        .eq('id', 'auraladra')
        .single();

      if (error) throw error;

      document.documentElement.dataset.backend = data.estado;
      window.dispatchEvent(
        new CustomEvent('auraladra:backend-listo', { detail: data }),
      );
    } catch (error) {
      document.documentElement.dataset.backend = 'pendiente';
      console.warn(
        'AuraLadra: Supabase aún no está disponible desde el frontend. Verifica que el schema ladra figure en Exposed schemas.',
        { code: error?.code, message: error?.message },
      );
    }
  }

  verificarBackend();
})();

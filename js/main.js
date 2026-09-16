(() => {
  'use strict';

  const actionContent = {
    perdida: {
      number: '01',
      kicker: 'Actúa con calma',
      title: 'Tu red cercana es el primer círculo de búsqueda.',
      steps: [
        'Confirma el último lugar y hora en que fue vista.',
        'Prepara una foto reciente y una descripción breve.',
        'Avisa primero a vecinos y redes locales verificables.',
      ],
      note: 'AuraLadra está preparando su canal de reportes. Si existe riesgo inmediato, utiliza los servicios municipales o de emergencia correspondientes.',
    },
    encontrada: {
      number: '02',
      kicker: 'Prioriza la seguridad',
      title: 'Ayudar no siempre significa acercarse de inmediato.',
      steps: [
        'Observa desde una distancia segura y evita perseguirla.',
        'Registra ubicación, hora, dirección de desplazamiento y una foto si es posible.',
        'Busca una identificación visible o pide apoyo local para contenerla con seguridad.',
      ],
      note: 'No arriesgues una mordedura ni lleves la mascota a un lugar inseguro. Una emergencia veterinaria requiere atención profesional.',
    },
    qr: {
      number: '03',
      kicker: 'Contacto protegido',
      title: 'El código conecta; no publica a la persona responsable.',
      steps: [
        'Escanea el código y confirma que corresponde a AuraLadra.',
        'Envía el aviso sin necesidad de revelar tu identidad.',
        'El responsable recibe el mensaje y decide cómo continuar el contacto.',
      ],
      note: 'Los QR revocables y el contacto protegido están en construcción. Nunca compartas públicamente domicilios, teléfonos o documentos encontrados.',
    },
  };

  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');
  const tabs = document.querySelectorAll('[data-action]');

  const setHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 20);
  setHeader();
  window.addEventListener('scroll', setHeader, { passive: true });

  menuButton?.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    nav?.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  }));

  const renderAction = (key) => {
    const content = actionContent[key];
    if (!content) return;
    document.querySelector('[data-panel-number]').textContent = content.number;
    document.querySelector('[data-panel-kicker]').textContent = content.kicker;
    document.querySelector('[data-panel-title]').textContent = content.title;
    document.querySelector('[data-panel-note]').textContent = content.note;
    document.querySelector('[data-panel-steps]').innerHTML = content.steps.map((step) => `<li>${step}</li>`).join('');
  };

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    renderAction(tab.dataset.action);
  }));

  document.querySelector('[data-year]').textContent = new Date().getFullYear();

  async function verificarBackend() {
    const status = document.querySelector('[data-system-status]');
    try {
      if (!window.auraLadraDb) throw new Error('Cliente Supabase no inicializado.');
      const { data, error } = await window.auraLadraDb
        .from('estado_sistema')
        .select('estado, version')
        .eq('id', 'auraladra')
        .single();
      if (error) throw error;
      document.documentElement.dataset.backend = data.estado;
      if (status) {
        status.classList.add('is-online');
        status.lastChild.textContent = ` Sistema conectado · v${data.version}`;
      }
    } catch (error) {
      document.documentElement.dataset.backend = 'pendiente';
      if (status) status.lastChild.textContent = ' Piloto en preparación';
      console.warn('AuraLadra: backend no disponible.', { code: error?.code, message: error?.message });
    }
  }

  verificarBackend();
})();

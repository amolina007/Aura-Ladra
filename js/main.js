(() => {
  'use strict';

  const db = window.auraLadraDb;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const statusLabels = { pendiente: 'Pendiente', verificado: 'Verificado', cerrado: 'Cerrado', rechazado: 'Rechazado' };
  const categoryLabels = { agua: 'Agua', limpieza: 'Limpieza', seguridad: 'Seguridad', infraestructura: 'Infraestructura' };
  let currentSession = null;
  let currentUserIsModerator = false;

  const actionContent = {
    perdida: {
      number: '01', kicker: 'Actúa con calma', title: 'Tu red cercana es el primer círculo de búsqueda.',
      steps: ['Confirma el último lugar y hora en que fue vista.', 'Prepara una foto reciente y una descripción breve.', 'Avisa primero a vecinos y redes locales verificables.'],
      note: 'AuraLadra está preparando su canal de reportes. Si existe riesgo inmediato, utiliza los servicios municipales o de emergencia correspondientes.',
    },
    encontrada: {
      number: '02', kicker: 'Prioriza la seguridad', title: 'Ayudar no siempre significa acercarse de inmediato.',
      steps: ['Observa desde una distancia segura y evita perseguirla.', 'Registra ubicación, hora, dirección de desplazamiento y una foto si es posible.', 'Busca una identificación visible o pide apoyo local para contenerla con seguridad.'],
      note: 'No arriesgues una mordedura ni lleves la mascota a un lugar inseguro. Una emergencia veterinaria requiere atención profesional.',
    },
    qr: {
      number: '03', kicker: 'Contacto protegido', title: 'El código conecta; no publica a la persona responsable.',
      steps: ['Escanea el código y confirma que corresponde a AuraLadra.', 'Envía el aviso sin necesidad de revelar tu identidad.', 'El responsable recibe el mensaje y decide cómo continuar el contacto.'],
      note: 'Los QR revocables y el contacto protegido están en construcción. Nunca compartas públicamente domicilios, teléfonos o documentos encontrados.',
    },
  };

  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');
  const reportForm = document.querySelector('[data-report-form]');
  const reportMessage = document.querySelector('[data-report-message]');
  const reportSubmit = document.querySelector('[data-report-submit]');
  const observedInput = reportForm?.elements.observado_en;
  const descriptionInput = reportForm?.elements.descripcion;

  const setMessage = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-success', type === 'success');
    element.classList.toggle('is-error', type === 'error');
  };

  const toLocalDateTimeValue = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const setDefaultObservedDate = () => {
    if (!observedInput) return;
    const now = new Date();
    observedInput.value = toLocalDateTimeValue(now);
    observedInput.max = toLocalDateTimeValue(new Date(now.getTime() + 15 * 60 * 1000));
    observedInput.min = toLocalDateTimeValue(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  };

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
    const list = document.querySelector('[data-panel-steps]');
    list.replaceChildren(...content.steps.map((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));
  };

  document.querySelectorAll('[data-action]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-action]').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    renderAction(tab.dataset.action);
  }));

  const createReportCard = (report, moderation = false) => {
    const article = document.createElement('article');
    article.className = 'report-item';
    const top = document.createElement('div');
    top.className = 'report-item-top';
    const category = document.createElement('strong');
    category.className = 'report-category';
    category.textContent = categoryLabels[report.categoria] || report.categoria;
    const status = document.createElement('span');
    status.className = 'status-badge';
    status.dataset.status = report.estado;
    status.textContent = statusLabels[report.estado] || report.estado;
    top.append(category, status);
    const description = document.createElement('p');
    description.className = 'report-description';
    description.textContent = report.descripcion;
    const meta = document.createElement('p');
    meta.className = 'report-meta';
    meta.textContent = `Observado: ${dateFormatter.format(new Date(report.observado_en))}`;
    article.append(top, description, meta);

    if (moderation) {
      const actions = document.createElement('div');
      actions.className = 'moderation-actions';
      ['pendiente', 'verificado', 'cerrado', 'rechazado'].forEach((nextStatus) => {
        if (nextStatus === report.estado) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.reportId = report.id;
        button.dataset.nextStatus = nextStatus;
        button.textContent = `Marcar ${statusLabels[nextStatus].toLowerCase()}`;
        actions.append(button);
      });
      article.append(actions);
    }
    return article;
  };

  const renderReportList = (container, reports, emptyText, moderation = false) => {
    if (!container) return;
    if (!reports.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = emptyText;
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...reports.map((report) => createReportCard(report, moderation)));
  };

  async function loadPublicReports() {
    const container = document.querySelector('[data-public-reports]');
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .in('estado', ['verificado', 'cerrado']).order('observado_en', { ascending: false }).limit(12);
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar los reportes en este momento.' : 'Aún no hay reportes verificados.');
  }

  async function loadMyReports() {
    const section = document.querySelector('[data-my-reports-section]');
    const container = document.querySelector('[data-my-reports]');
    if (!currentSession?.user) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .order('creado_en', { ascending: false }).limit(30);
    document.querySelector('[data-my-count]').textContent = String(error ? 0 : (data?.length || 0));
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar tu historial.' : 'Todavía no tienes reportes asociados a esta sesión.');
  }

  async function loadModeratorReports() {
    const panel = document.querySelector('[data-moderator-panel]');
    if (!currentUserIsModerator) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const container = document.querySelector('[data-moderator-reports]');
    const { data, error } = await db.from('reportes_canil')
      .select('id,categoria,descripcion,observado_en,estado,creado_en')
      .order('creado_en', { ascending: false }).limit(50);
    document.querySelector('[data-moderator-count]').textContent = String(error ? 0 : (data?.length || 0));
    renderReportList(container, error ? [] : (data || []), error ? 'No pudimos cargar la bandeja de moderación.' : 'No hay reportes por revisar.', true);
  }

  async function syncSession(session) {
    currentSession = session;
    currentUserIsModerator = false;
    const signedOut = document.querySelector('[data-signed-out]');
    const signedIn = document.querySelector('[data-signed-in]');
    if (!session?.user) {
      signedOut.hidden = false;
      signedIn.hidden = true;
      await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports()]);
      return;
    }
    signedOut.hidden = true;
    signedIn.hidden = false;
    document.querySelector('[data-session-email]').textContent = session.user.email || 'cuenta activa';
    const { data, error } = await db.from('moderadores').select('usuario_id').eq('usuario_id', session.user.id).maybeSingle();
    currentUserIsModerator = !error && Boolean(data);
    await Promise.all([loadMyReports(), loadModeratorReports(), loadPublicReports()]);
  }

  reportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(reportMessage);
    if (!reportForm.reportValidity()) return;
    reportSubmit.disabled = true;
    reportSubmit.firstChild.textContent = 'Enviando… ';
    try {
      const observedDate = new Date(reportForm.elements.observado_en.value);
      if (Number.isNaN(observedDate.getTime())) throw new Error('Fecha inválida.');
      const { error } = await db.rpc('crear_reporte_canil', {
        p_categoria: reportForm.elements.categoria.value,
        p_descripcion: reportForm.elements.descripcion.value,
        p_observado_en: observedDate.toISOString(),
        p_sitio_web: reportForm.elements.sitio_web.value,
      });
      if (error) throw error;
      reportForm.reset();
      setDefaultObservedDate();
      document.querySelector('[data-description-count]').textContent = '0';
      setMessage(reportMessage, currentSession?.user ? 'Reporte recibido. Ya puedes seguirlo en “Mis reportes”.' : 'Reporte recibido de forma anónima. Quedará privado hasta su revisión.', 'success');
      await Promise.all([loadMyReports(), loadModeratorReports()]);
    } catch (error) {
      setMessage(reportMessage, /20 y 600/.test(error?.message || '') ? 'La descripción debe tener entre 20 y 600 caracteres.' : 'No pudimos enviar el reporte. Revisa los datos e inténtalo nuevamente.', 'error');
      console.warn('AuraLadra: no fue posible crear el reporte.', { code: error?.code });
    } finally {
      reportSubmit.disabled = false;
      reportSubmit.firstChild.textContent = 'Enviar reporte ';
    }
  });

  descriptionInput?.addEventListener('input', () => {
    document.querySelector('[data-description-count]').textContent = String(descriptionInput.value.length);
  });

  document.querySelector('[data-magic-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector('[data-magic-submit]');
    const message = document.querySelector('[data-auth-message]');
    setMessage(message);
    if (!form.reportValidity()) return;
    button.disabled = true;
    try {
      const { error } = await db.auth.signInWithOtp({
        email: form.elements.email.value.trim(),
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#cuenta`, shouldCreateUser: true },
      });
      if (error) throw error;
      form.reset();
      setMessage(message, 'Revisa tu correo: te enviamos un enlace de acceso.', 'success');
    } catch (error) {
      setMessage(message, 'No pudimos enviar el enlace. Verifica el correo e inténtalo nuevamente.', 'error');
      console.warn('AuraLadra: error al solicitar Magic Link.', { code: error?.code });
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('[data-sign-out]')?.addEventListener('click', async () => {
    const { error } = await db.auth.signOut();
    if (error) setMessage(document.querySelector('[data-auth-message]'), 'No pudimos cerrar la sesión.', 'error');
  });

  document.querySelector('[data-moderator-reports]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-report-id][data-next-status]');
    if (!button) return;
    const message = document.querySelector('[data-moderator-message]');
    button.disabled = true;
    setMessage(message);
    const { data, error } = await db.from('reportes_canil').update({ estado: button.dataset.nextStatus })
      .eq('id', button.dataset.reportId).select('id,estado').single();
    if (error || !data) {
      button.disabled = false;
      setMessage(message, 'No pudimos actualizar el reporte.', 'error');
      return;
    }
    setMessage(message, 'Estado actualizado.', 'success');
    await Promise.all([loadModeratorReports(), loadMyReports(), loadPublicReports()]);
  });

  async function verifyBackend() {
    const status = document.querySelector('[data-system-status]');
    try {
      if (!db) throw new Error('Cliente Supabase no inicializado.');
      const { data, error } = await db.from('estado_sistema').select('estado, version').eq('id', 'auraladra').single();
      if (error) throw error;
      document.documentElement.dataset.backend = data.estado;
      if (status) {
        status.classList.add('is-online');
        status.lastChild.textContent = ` Sistema conectado · v${data.version}`;
      }
    } catch (error) {
      document.documentElement.dataset.backend = 'pendiente';
      if (status) status.lastChild.textContent = ' Piloto en preparación';
      console.warn('AuraLadra: backend no disponible.', { code: error?.code });
    }
  }

  async function initialize() {
    document.querySelector('[data-year]').textContent = new Date().getFullYear();
    setDefaultObservedDate();
    if (!db) {
      setMessage(reportMessage, 'El sistema de reportes no está disponible temporalmente.', 'error');
      return;
    }
    const [{ data }] = await Promise.all([db.auth.getSession(), verifyBackend()]);
    await syncSession(data.session);
    db.auth.onAuthStateChange((_event, session) => window.setTimeout(() => syncSession(session), 0));
  }

  initialize();
})();

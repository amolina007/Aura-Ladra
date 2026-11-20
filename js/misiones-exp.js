/* Misiones de EXP de Ladra: catálogo y progreso proceden de la misma regla del servidor. */
(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'exp-missions-dialog';
  dialog.setAttribute('aria-labelledby', 'exp-missions-title');
  dialog.innerHTML = `<div class="exp-missions-top"><div><p class="exp-eyebrow">TU APORTE DEJA HUELLA</p><h2 id="exp-missions-title">Misiones de Ladra</h2></div><button type="button" class="exp-missions-close" aria-label="Cerrar misiones">×</button></div>
    <p class="exp-missions-intro">Cuida a tus mascotas, comparte y ayuda a la comunidad. La EXP se suma automáticamente al guardar una acción que cumpla estas condiciones.</p>
    <div class="exp-missions-summary" aria-live="polite">Cargando tu progreso…</div>
    <label class="exp-missions-filter">Actividades<select aria-label="Filtrar misiones"><option value="">Todas las actividades</option></select></label>
    <div class="exp-missions-list" aria-live="polite"></div>
    <p class="exp-missions-footnote">Los límites se renuevan a medianoche de Chile. Editar o volver a guardar el mismo registro no repite su premio. Navegar, enviar consultas, comprar o marcar ventas no dan EXP. Las misiones de Auracoin tienen sus propias reglas.</p>
    <a class="exp-ac-link" href="https://convergenciaaura.cl/misiones?sitio=ladra" target="_blank" rel="noopener noreferrer">Ver misiones de Auracoin ↗</a>`;
  document.body.append(dialog);
  const list = dialog.querySelector('.exp-missions-list');
  const summary = dialog.querySelector('.exp-missions-summary');
  const select = dialog.querySelector('select');
  const format = new Intl.NumberFormat('es-CL');
  let rows = [], request = 0, returnFocus = null;
  const text = (tag, className, value) => {
    const node = document.createElement(tag); node.className = className; node.textContent = value; return node;
  };
  const render = () => {
    const filtered = rows.filter(row => !select.value || row.grupo === select.value);
    const groups = [...new Set(rows.map(row => row.grupo))];
    filtered.sort((a, b) => groups.indexOf(a.grupo) - groups.indexOf(b.grupo));
    const nodes = [];
    let group = '';
    for (const row of filtered) {
      if (group !== row.grupo) { group = row.grupo; nodes.push(text('h3', 'exp-missions-group', group)); }
      const article = document.createElement('article'); article.className = 'exp-mission';
      const complete = row.una_vez ? Number(row.completadas_total) > 0 : Number(row.completadas_hoy) >= Number(row.limite_diario);
      article.classList.toggle('is-complete', complete);
      const heading = document.createElement('div'); heading.className = 'exp-mission-heading';
      heading.append(text('h4', '', row.titulo), text('strong', 'exp-mission-prize', `+${row.puntos} EXP`));
      const footer = document.createElement('div'); footer.className = 'exp-mission-footer';
      const status = !row.con_sesion ? 'Inicia sesión para guardar tu progreso'
        : row.una_vez ? (complete ? '✓ Completada' : 'Una vez por cuenta')
        : `${complete ? '✓ ' : ''}${row.completadas_hoy}/${row.limite_diario} hoy · ${row.completadas_total} recompensas acumuladas`;
      footer.append(text('span', 'exp-mission-status', status));
      const link = document.createElement('a'); link.className = 'exp-mission-go';
      link.href = /^#[a-z-]+$/.test(row.destino) ? row.destino : '#inicio';
      link.textContent = complete ? 'Ver actividad' : 'Ir a la actividad';
      link.addEventListener('click', () => dialog.close()); footer.append(link);
      article.append(heading, text('p', '', row.descripcion), footer); nodes.push(article);
    }
    list.replaceChildren(...nodes);
    const logged = rows.some(row => row.con_sesion);
    const total = rows.reduce((sum, row) => sum + Number(row.exp_total || 0), 0);
    summary.textContent = logged ? `${format.format(total)} EXP acumulada · ${rows.filter(row => Number(row.completadas_hoy) > 0).length} misiones con EXP hoy`
      : 'Explora las misiones. Inicia sesión para sumar EXP y aparecer en la clasificación.';
  };
  const load = async () => {
    const turn = ++request;
    summary.textContent = 'Actualizando tu progreso…';
    try {
      const db = window.auraLadraDb;
      if (!db) throw new Error('CONEXION');
      const { data, error } = await db.rpc('mis_misiones_experiencia');
      if (error) throw error;
      if (turn !== request) return;
      rows = Array.isArray(data) ? data : [];
      const selected = select.value;
      const all = text('option', '', 'Todas las actividades'); all.value = '';
      select.replaceChildren(all, ...[...new Set(rows.map(row => row.grupo))].map(group => { const option = text('option', '', group); option.value = group; return option; }));
      select.value = selected;
      render();
      document.dispatchEvent(new CustomEvent('misiones:actualizadas'));
    } catch (error) {
      if (turn !== request) return;
      summary.textContent = 'No pudimos consultar las misiones. Tu EXP guardada se conserva.';
      list.replaceChildren();
      const retry = text('button', 'exp-missions-open', 'Volver a intentar'); retry.type = 'button'; retry.addEventListener('click', load); list.append(retry);
    }
  };
  const open = (trigger) => {
    returnFocus = trigger || document.activeElement;
    if (!dialog.open) dialog.showModal();
    load();
  };
  const profileCard = document.querySelector('[data-exp-ranking]');
  if (profileCard && !profileCard.querySelector('[data-exp-open-missions]')) {
    const button = text('button', 'exp-missions-open', 'Ver misiones y ganar EXP'); button.type = 'button'; button.dataset.expOpenMissions = '';
    button.addEventListener('click', () => open(button)); profileCard.append(button);
  }
  // El control flotante sigue perteneciendo a Core. Su panel enlaza al catálogo local.
  const watched = new WeakSet();
  const connectFloating = () => {
    document.querySelectorAll('[data-globo-aura]').forEach(host => {
      const root = host.shadowRoot;
      if (!root || watched.has(root)) return;
      watched.add(root);
      const addLink = () => {
        const panel = root.querySelector('.misiones');
        if (!panel || panel.querySelector('[data-ladra-exp-missions]')) return;
        const button = text('button', '', '🐾 Misiones de Ladra · Ganar EXP'); button.type = 'button'; button.dataset.ladraExpMissions = '';
        button.style.cssText = 'display:block;width:100%;padding:12px;margin:0 0 10px;border:1px solid #e3ae54;border-radius:10px;background:#fff5df;color:#23452e;font:700 14px/1.4 system-ui;cursor:pointer';
        button.addEventListener('click', () => { const info = root.querySelector('button.info'); if (info?.getAttribute('aria-expanded') === 'true') info.click(); open(info); });
        panel.prepend(button);
      };
      new MutationObserver(addLink).observe(root, { childList: true, subtree: true }); addLink();
    });
  };
  new MutationObserver(connectFloating).observe(document.body, { childList: true }); connectFloating();
  dialog.querySelector('.exp-missions-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => returnFocus?.focus());
  select.addEventListener('change', render);
  for (const event of ['sesion:cambio', 'experiencia:actualizada', 'mascotas:cambio', 'feed:cambio', 'trucos:actualizados']) document.addEventListener(event, () => { if (dialog.open) load(); });
  document.addEventListener('vista:cambio', () => document.dispatchEvent(new CustomEvent('experiencia:actualizada')));
})();

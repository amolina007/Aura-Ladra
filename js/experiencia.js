(() => {
  'use strict';
  const db = () => window.auraLadraDb || null;
  const format = new Intl.NumberFormat('es-CL');
  const homeLinks = [
    ...document.querySelectorAll('[data-ladra-tabbar-link="inicio"]'),
    ...document.querySelectorAll('[data-nav] > a[href="#inicio"]'),
  ];
  const badges = homeLinks.map(link => {
    let badge = link.querySelector('[data-exp-home-badge]');
    if (!badge) {
      badge = document.createElement('small');
      badge.className = 'exp-home-badge';
      badge.dataset.expHomeBadge = '';
      badge.textContent = 'EXP 0';
      link.append(badge);
    }
    return { link, badge };
  });

  const profile = document.querySelector('[data-my-profile-panel="perfil"]');
  let card = profile?.querySelector('[data-exp-ranking]');
  if (profile && !card) {
    card = document.createElement('section');
    card.className = 'exp-card space-section';
    card.dataset.expRanking = '';
    card.setAttribute('aria-labelledby', 'exp-ranking-title');
    card.innerHTML = `
      <header class="exp-card-heading"><div><p class="exp-eyebrow">PROGRESO EN LADRA</p><h4 id="exp-ranking-title">Clasificación</h4></div><span class="exp-level" data-exp-level>Huella nueva</span></header>
      <div class="exp-total-row"><strong data-exp-total>0</strong><span>EXP acumulada</span></div>
      <div class="exp-progress-track" role="progressbar" aria-label="Avance al siguiente nivel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-exp-progress></span></div>
      <p class="exp-next-level" data-exp-next>Registra acciones de cuidado para avanzar.</p>
      <div class="exp-board-heading"><h5>Ranking global</h5><span>Solo se muestran alias y EXP</span></div>
      <ol class="exp-board" data-exp-board aria-live="polite"><li class="exp-loading">Cargando clasificación…</li></ol>
      <p class="exp-status" data-exp-status role="status"></p>
    `;
    const firstSection = profile.querySelector('.space-section');
    profile.insertBefore(card, firstSection || profile.firstChild);
  }

  let turn = 0;
  const currentUserId = session => session?.user?.id || null;
  const formatBadge = points => `EXP ${format.format(points)}`;
  const makeRow = row => {
    const li = document.createElement('li');
    li.className = `exp-board-row${row.es_mi_posicion ? ' is-me' : ''}`;
    const rank = document.createElement('span'); rank.className = 'exp-rank'; rank.textContent = `#${row.posicion}`;
    const alias = document.createElement('strong'); alias.className = 'exp-alias'; alias.textContent = row.alias || 'Ladra';
    if (row.es_mi_posicion) { const me = document.createElement('small'); me.className = 'exp-me-tag'; me.textContent = 'Tú'; alias.append(' ', me); }
    const points = document.createElement('span'); points.className = 'exp-row-points'; points.textContent = `${format.format(Number(row.puntos_exp) || 0)} EXP`;
    li.append(rank, alias, points);
    return li;
  };
  const renderFailure = message => {
    if (card) {
      const board = card.querySelector('[data-exp-board]');
      board.replaceChildren();
      const li = document.createElement('li'); li.className = 'exp-loading'; li.textContent = message;
      board.append(li);
    }
  };
  const load = async () => {
    const client = db();
    const request = ++turn;
    if (!client) { renderFailure('El puntaje aparecerá cuando Ladra esté disponible.'); return; }
    try {
      const { data: auth, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      const userId = currentUserId(auth?.session);
      if (!userId) {
        badges.forEach(({ link, badge }) => { badge.textContent = 'EXP 0'; link.setAttribute('aria-label', 'Inicio. Inicia sesión para ver tu EXP.'); });
        if (card) {
          card.querySelector('[data-exp-total]').textContent = '0';
          card.querySelector('[data-exp-level]').textContent = 'Huella nueva';
          card.querySelector('[data-exp-board]').replaceChildren();
          const li = document.createElement('li'); li.className = 'exp-loading'; li.textContent = 'Inicia sesión para ver tu puntaje y la clasificación.';
          card.querySelector('[data-exp-board]').append(li);
        }
        return;
      }
      const [mineResult, boardResult] = await Promise.all([
        client.rpc('mi_experiencia'),
        client.rpc('clasificacion_experiencia', { p_limite: 20 }),
      ]);
      if (mineResult.error) throw mineResult.error;
      if (boardResult.error) throw boardResult.error;
      if (request !== turn) return;
      const mine = Array.isArray(mineResult.data) ? mineResult.data[0] : mineResult.data;
      const points = Number(mine?.puntos_exp) || 0;
      badges.forEach(({ link, badge }) => {
        badge.textContent = formatBadge(points);
        link.setAttribute('aria-label', `Inicio. Tu puntaje: ${format.format(points)} EXP.`);
      });
      if (!card) return;
      card.querySelector('[data-exp-total]').textContent = format.format(points);
      card.querySelector('[data-exp-level]').textContent = mine?.nivel || 'Huella nueva';
      const levels = [
        { name: 'Buen compañero', start: 100 },
        { name: 'Guardián del barrio', start: 500 },
        { name: 'Referente animalista', start: 1200 },
      ];
      const next = levels.find(level => points < level.start);
      const previous = next ? (levels[levels.indexOf(next) - 1]?.start || 0) : 1200;
      const progress = next ? Math.max(0, Math.min(100, Math.round(((points - previous) / (next.start - previous)) * 100))) : 100;
      card.querySelector('[data-exp-progress]').style.width = `${progress}%`;
      const track = card.querySelector('[role="progressbar"]');
      track.setAttribute('aria-valuenow', String(progress));
      card.querySelector('[data-exp-next]').textContent = next
        ? `Te faltan ${format.format(next.start - points)} EXP para ${next.name}.`
        : 'Alcanzaste el nivel más alto de Ladra.';
      const board = card.querySelector('[data-exp-board]');
      const rows = Array.isArray(boardResult.data) ? boardResult.data : [];
      board.replaceChildren(...rows.map(makeRow));
      if (!rows.length) {
        const li = document.createElement('li'); li.className = 'exp-loading';
        li.textContent = mine?.aparece_en_clasificacion
          ? 'Todavía no hay puntajes para comparar. ¡Puedes iniciar la clasificación!'
          : 'Publica tu alias en Mi red para aparecer en el ranking. Tu puntaje personal se conserva.';
        board.append(li);
      }
      card.querySelector('[data-exp-status]').textContent = '';
    } catch (error) {
      if (request !== turn) return;
      console.warn('No se pudo cargar la clasificación de Ladra:', error);
      renderFailure('No pudimos cargar el ranking. Intenta de nuevo más tarde.');
    }
  };

  card?.addEventListener('click', event => {
    if (event.target.closest('[data-exp-retry]')) load();
  });
  document.addEventListener('sesion:cambio', load);
  document.addEventListener('mascotas:cambio', load);
  document.addEventListener('experiencia:actualizada', load);
  document.addEventListener('feed:cambio', load);
  document.addEventListener('trucos:actualizados', load);
  document.addEventListener('misiones:actualizadas', load);
  document.addEventListener('vista:cambio', event => { if (['inicio', 'cuenta'].includes(event.detail?.vista)) load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  window.addEventListener('focus', load);
  load();
})();

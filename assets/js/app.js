/* =====================================================================
   USM Tennis Montargis — rendu du site public
   Les zones dynamiques sont marquées dans le HTML par data-render="…".
   ===================================================================== */
(function () {
  'use strict';
  const USM = (window.USM = window.USM || {});
  const store = USM.store;
  const base = document.documentElement.getAttribute('data-base') || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Utilitaires ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = (p) => (!p ? '' : /^(https?:|data:|blob:|\/\/|mailto:|tel:)/.test(p) ? p : base + p);
  const icon = (id, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const fmtDate = (s) => { const d = parseISO(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const euro = (n) => (n == null || n === '' ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  const CATS = { competition: 'Compétition', ecole: 'École de tennis', 'vie-du-club': 'Vie du club', evenement: 'Événement' };
  const SURF = { 'terre-battue': 'Terre battue', couvert: 'Couvert', 'beton-poreux': 'Béton poreux', 'club-house': 'Club house', mur: 'Mur' };

  function md(text) {
    const lines = esc(text || '').split(/\n/);
    let html = '', para = [], list = [];
    const inline = (s) => s
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+|[a-z0-9\-_.\/#?=]+)\)/gi, (m, t, h) => `<a href="${h}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (m, p, h) => `${p}<a href="${h}" target="_blank" rel="noopener">${h.replace(/^https?:\/\//, '').slice(0, 42)}${h.length > 50 ? '…' : ''}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
    const flushL = () => { if (list.length) { html += `<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`; list = []; } };
    lines.forEach((l) => {
      const t = l.trim();
      if (!t) { flushP(); flushL(); return; }
      const m = t.match(/^(?:[-•·]|\d+[.)])\s+(.*)$/);
      if (m) { flushP(); list.push(m[1]); return; }
      flushL(); para.push(t);
    });
    flushP(); flushL();
    return html;
  }
  const emph = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

  function pic(im, { sizes = '100vw', eager = false, alt, cls = '', attrs = '' } = {}) {
    if (!im) return '';
    const src = url(im.src), sm = url(im.sm || im.src);
    const big = im.w || 1400;
    const md = im.md && big > 1100 ? `, ${url(im.md)} 1024w` : '';
    const srcset = im.sm && im.sm !== im.src && big > 680 ? ` srcset="${sm} 640w${md}, ${src} ${big}w" sizes="${sizes}"` : '';
    const wh = im.w && im.h ? ` width="${im.w}" height="${im.h}"` : '';
    return `<img src="${src}"${srcset}${wh} alt="${esc(alt != null ? alt : im.alt || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" class="${cls}" ${attrs}>`;
  }
  const visible = (arr) => (arr || []).filter((x) => x && !x.draft);
  let CONTENT = null;
  /* Lien WhatsApp : numéro (discussion privée, message prérempli) ou lien d'invitation https://… */
  function waLink(text) {
    const v = String(((CONTENT || {}).settings || {}).links ? (CONTENT.settings.links.whatsappContact || '') : '').trim();
    if (!v) return '';
    if (/^https?:\/\//.test(v)) return v;
    let d = v.replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') d = '33' + d.slice(1);
    return d ? `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
  }
  const rateLabel = (r) => `${r.title} (${r.code}, ${euro(r.price)} €${r.unit ? ' ' + r.unit : ''})`;
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const track = (name, tags) => { try { USM.track && USM.track(name, tags); } catch (e) { /* ignore */ } };
  function toast(msg, ms) {
    $$('.toast').forEach((x) => x.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2600);
  }
  function jsonLD(obj) {
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  /* ---------- Thème ---------- */
  function initTheme() {
    $$('.theme-toggle').forEach((b) => b.addEventListener('click', () => {
      const root = document.documentElement;
      const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('usm_theme', next); } catch (e) { /* ignore */ }
      b.setAttribute('aria-label', next === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre');
    }));
  }

  /* ---------- En-tête & menu mobile ---------- */
  function initHeader() {
    const h = $('.site-header');
    if (h) {
      const on = () => h.classList.toggle('is-scrolled', window.scrollY > 8);
      on(); window.addEventListener('scroll', on, { passive: true });
    }
    const panel = $('#mobile-panel');
    const openBtn = $('.menu-toggle');
    if (!panel || !openBtn) return;
    const close = () => { panel.classList.remove('is-open'); openBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; openBtn.focus(); };
    openBtn.addEventListener('click', () => {
      panel.classList.add('is-open'); openBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden';
      setTimeout(() => { const f = $('a, button', panel); f && f.focus(); }, 50);
    });
    $$('[data-close-menu]', panel).forEach((b) => b.addEventListener('click', close));
    $$('a', panel).forEach((a) => a.addEventListener('click', () => { panel.classList.remove('is-open'); document.body.style.overflow = ''; }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('is-open')) close(); });
  }

  /* ---------- Bouton haut / bas de page ---------- */
  function initScrollButton() {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'to-edge'; b.hidden = true;
    b.innerHTML = icon('chevron-up');
    document.body.appendChild(b);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let goUp = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max < innerHeight * 0.6) { b.hidden = true; return; } // page courte : inutile
      b.hidden = false;
      goUp = scrollY > max / 2;
      b.classList.toggle('down', !goUp);
      const l = goUp ? 'Revenir en haut de la page' : 'Aller en bas de la page';
      b.setAttribute('aria-label', l); b.title = l;
    };
    b.addEventListener('click', () => {
      const top = goUp ? 0 : document.documentElement.scrollHeight;
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    });
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    new ResizeObserver(update).observe(document.body);
    update();
  }

  /* ---------- Mobile : barre d'action, blocs repliés ---------- */
  function openBand(form) {
    const band = form && form.closest('.contact-band');
    if (!band || band.classList.contains('form-open')) return;
    band.classList.add('form-open');
    $$('[data-open-form]', band).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  }
  function initMobileUI() {
    // Barre d'action : page en cours + masquée pendant la saisie (clavier ouvert)
    const bar = $('.action-bar');
    if (bar) {
      const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'index';
      // Bouton de la page en cours : descend au contenu utile au lieu de recharger la page
      const TARGET = { tarifs: '#tarifs', contact: '#contact-form' };
      $$('a[data-bar]', bar).forEach((a) => {
        const h = (a.getAttribute('href') || '').split('/').pop().replace(/\.html.*$/, '');
        if (!h || h !== page) return;
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', (e) => {
          const t = $(TARGET[a.dataset.bar] || '#contenu'); if (!t) return;
          e.preventDefault();
          t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
      });
      const typing = (on) => document.body.classList.toggle('typing', on);
      document.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) typing(true); });
      document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; typing(!!a && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')); }, 60));
    }
    // Quiz « Trouver ma formule » replié sur mobile
    $$('[data-open-finder]').forEach((b) => b.addEventListener('click', () => {
      const f = b.closest('.finder'); if (!f) return;
      f.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
      setTimeout(() => { const o = $('.finder-opt', f); o && o.focus({ preventScroll: true }); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    }));
    // Formulaire de l'accueil replié sur mobile
    $$('[data-open-form]').forEach((b) => b.addEventListener('click', () => {
      const band = b.closest('.contact-band'); const form = band && $('form', band);
      openBand(form);
      setTimeout(() => { const n = form && $('select, input:not([type=hidden])', form); n && n.focus({ preventScroll: true }); form && form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    }));
  }

  /* ---------- Aperçu affiché dans un cadre (claude.ai) ----------
     Le cadre de l'aperçu bloque les appels, les e-mails et les nouveaux onglets :
     sans cette garde, « Appeler » affichait une page blanche. Sur le vrai site,
     jamais affiché dans un cadre, ce code ne fait rien. */
  function initFramedPreview() {
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (!framed) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented) return;
      const href = a.getAttribute('href') || '';
      if (/^tel:/i.test(href)) {
        e.preventDefault();
        const num = /\d{2}/.test(a.textContent) ? a.textContent.trim() : (((CONTENT || {}).settings || {}).phone || href.slice(4));
        toast(`Aperçu : l'appel est bloqué ici. Sur le site en ligne, le téléphone compose le ${String(num).replace(/ /g, '\u00a0')}.`, 5000);
      } else if (/^mailto:/i.test(href)) {
        e.preventDefault();
        toast(`Aperçu : la messagerie ne s'ouvre pas ici. Sur le site en ligne, elle s'ouvre vers ${href.slice(7).split('?')[0]}.`, 5000);
      } else if (a.target === '_blank') {
        e.preventDefault();
        let w = null;
        try { w = window.open(href, '_blank'); } catch (err) { w = null; }
        if (w) { try { w.opener = null; } catch (err) { /* ignore */ } }
        else toast("Aperçu : les liens vers un autre site (Ten'Up, Facebook…) sont bloqués ici. Ils s'ouvriront normalement sur le site en ligne.", 5000);
      }
    });
  }

  /* ---------- Réglages & textes ---------- */
  const get =(o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function bindSettings(c) {
    const s = c.settings || {};
    $$('[data-set]').forEach((el) => { const v = get(s, el.dataset.set); if (v) el.textContent = v; });
    const hl = hoursLine(s.hours || []);
    $$('[data-hours-line]').forEach((el) => { if (hl) el.textContent = hl; });
    $$('[data-href]').forEach((el) => {
      const key = el.dataset.href; let v = get(s, key);
      if (key === 'phone' && v) v = 'tel:' + v.replace(/\s+/g, '');
      if (key === 'email' && v) v = 'mailto:' + v;
      if (v) {
        el.setAttribute('href', v);
        // Lien vers un autre site (Ten'Up, espace membre hébergé ailleurs…) : nouvel onglet
        try { if (/^https?:/.test(v) && new URL(v).origin !== location.origin) { el.target = '_blank'; el.rel = 'noopener'; } } catch (e) { /* ignore */ }
      } else if (el.hasAttribute('data-hide-empty')) el.hidden = true;
    });
    const t = c.texts || {};
    $$('[data-text]').forEach((el) => { const v = t[el.dataset.text]; if (v && String(v).trim()) el.innerHTML = emph(v); });
    const st = s.sticker || {};
    $$('[data-sticker]').forEach((el) => {
      if (st.enabled === false) { el.hidden = true; return; }
      if (st.link) el.setAttribute('href', url(st.link));
      const top = $('[data-sticker-top]', el), txt = $('[data-sticker-text]', el);
      if (top && st.top) top.textContent = st.top;
      if (txt && st.text) txt.textContent = st.text;
    });
    $$('[data-address]').forEach((el) => { el.innerHTML = `${esc(s.address)}<br>${esc(s.zip)} ${esc(s.city)}`; });
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  function renderAnnounce(c) {
    const a = (c.settings || {}).announcement;
    const el = $('[data-render="announce"]');
    if (!el) return;
    if (!a || !a.enabled || !a.text) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<a href="${esc(url(a.link || '#'))}"><span class="dot-ball" aria-hidden="true"></span><strong>${esc(a.text)}</strong>${a.link ? icon('arrow') : ''}</a>`;
  }

  function renderStats(c, el) {
    const st = (c.settings || {}).stats || [];
    const season = (c.settings || {}).season || '';
    el.innerHTML = `<div class="sb-head"><span class="serve"><i aria-hidden="true"></i>USM Montargis</span><span>Saison ${esc(season)}</span></div>` +
      st.slice(0, 4).map((x) => `<div class="sb-cell"><b class="num">${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join('');
  }

  /* ---------- Prix mini par parcours ---------- */
  function renderMinPrices(c) {
    $$('[data-min-price]').forEach((el) => {
      const codes = el.dataset.minPrice.split(',');
      const list = visible(c.rates).filter((r) => codes.includes(r.category) || codes.includes(r.code));
      const min = list.reduce((m, r) => (r.price != null && (m == null || r.price < m) ? r.price : m), null);
      if (min != null) el.textContent = euro(min) + ' €';
    });
  }

  /* ---------- Quiz « Trouver ma formule » ---------- */
  const FINDER = {
    start: { q: 'Pour qui cherchez-vous une formule ?', opts: [
      { t: 'Un tout-petit', s: 'Premiers pas raquette en main', go: 'B45' },
      { t: 'Un enfant ou un ado', s: 'De 5 à 18 ans', go: 'jeunes' },
      { t: 'Un adulte', s: 'Loisir ou compétition', go: 'adultes' },
      { t: "Je veux d'abord essayer", s: 'Sans engagement', go: 'ESSAI' }] },
    jeunes: { q: 'Combien de cours par semaine ?', opts: [
      { t: '1 h', s: 'Découvrir et progresser', go: 'JTC1' },
      { t: '1 h 30', s: 'Progresser plus vite', go: 'JTC2' },
      { t: '3 h', s: 'Viser la compétition', go: 'JTC3' }] },
    adultes: { q: 'Souhaitez-vous suivre des cours collectifs ?', opts: [
      { t: 'Non, juste jouer', s: 'Jeu libre avec vos partenaires', go: 'libre' },
      { t: 'Oui, 1 h 30 par semaine', s: 'Encadré par notre enseignant', go: 'ATC1' },
      { t: 'Oui, 3 h par semaine', s: 'Pour progresser vite', go: 'ATC2' }] },
    libre: { q: 'Quand comptez-vous jouer ?', opts: [
      { t: "Toute l'année", s: 'Courts couverts compris', go: 'AT1' },
      { t: 'Aux beaux jours', s: 'Courts extérieurs uniquement', go: 'ATEX' },
      { t: "Seulement l'été", s: 'De mai à août', go: 'PASS-ETE' }] }
  };
  function initFinder(c, el) {
    const docs = c.documents || [];
    const form = docs.find((d) => d.category === 'inscription');
    let path = ['start'];
    const total = 3;
    function draw() {
      const key = path[path.length - 1];
      const node = FINDER[key];
      const prog = `<div class="finder-progress" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i < path.length ? 'on' : ''}"></i>`).join('')}</div>`;
      if (node) {
        el.innerHTML = prog + `<p class="finder-q" id="finder-q">${esc(node.q)}</p>
          <div class="finder-opts" role="group" aria-labelledby="finder-q">${node.opts.map((o, i) => `<button type="button" class="finder-opt" data-i="${i}"><b>${esc(o.t)}</b><small>${esc(o.s)}</small></button>`).join('')}</div>
          ${path.length > 1 ? `<button type="button" class="finder-back">${icon('chevron-left')} Retour</button>` : ''}`;
        $$('.finder-opt', el).forEach((b) => b.addEventListener('click', () => { path.push(node.opts[+b.dataset.i].go); draw(); }));
      } else {
        const code = key === 'ESSAI' ? 'LIC-D' : key;
        const r = (c.rates || []).find((x) => x.code === code);
        const essai = key === 'ESSAI';
        el.innerHTML = `<div class="finder-progress" aria-hidden="true">${'<i class="on"></i>'.repeat(total)}</div>
          <div class="finder-result" aria-live="polite">
            <div class="res-top"><span class="res-code">${essai ? 'NOTRE CONSEIL' : 'VOTRE FORMULE · ' + esc(r ? r.code : '')}</span></div>
            <h3>${essai ? 'Séance d\'essai' : esc(r ? r.title : '')}</h3>
            ${essai ? `<p class="muted">Réservez une séance d'essai avec notre enseignant, puis prenez la licence Découverte (${r ? euro(r.price) : 4} €) pour jouer quelques semaines avec l'assurance fédérale, sans engagement sur la saison.</p>`
              : `<p class="price num">${r ? euro(r.price) : ''} € <small>${esc(r ? r.unit || '' : '')}</small></p>
                 ${r && r.licence ? `<p class="lic" style="color:var(--grass);font-weight:600">${esc(r.licence)}</p>` : ''}
                 <ul>${(r ? r.features : []).map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>`}
            <div class="res-ctas">
              ${essai ? `<a class="btn btn-blue" href="${url('contact.html#essai')}">Réserver mon essai ${icon('arrow')}</a>`
                : `${form ? `<a class="btn btn-blue" href="${esc(url(form.url))}" target="_blank" rel="noopener">${icon('download')} Formulaire d'inscription</a>` : ''}
                   <a class="btn" href="#formule-${esc(r ? r.code : '')}" data-formule="${esc(r ? r.code : '')}">Être recontacté(e)</a>`}
              <button type="button" class="btn btn-sm finder-restart" style="border:0">Recommencer</button>
            </div>
          </div>`;
        $('.finder-restart', el).addEventListener('click', () => { path = ['start']; draw(); });
        track('quiz_formule', { formule: code });
      }
      const back = $('.finder-back', el);
      back && back.addEventListener('click', () => { path.pop(); draw(); });
    }
    draw();
  }

  /* ---------- Installations ---------- */
  function renderBento(c, el) {
    const list = visible(c.facilities).sort(byOrder);
    const n = Math.min(list.length, 6);
    const cls = n === 5 ? ['t1', 't2', 't3', 'half', 'half'] : n === 4 ? ['t1', 't2', 't3', 'full'] : ['t1', 't2', 't3', 't4', 't5', 't6'];
    el.innerHTML = list.slice(0, 6).map((f, i) => {
      const im = (f.images || [])[0];
      return `<a class="tile ${cls[i] || 't6'} ${im ? '' : 'no-img'}" href="${url('le-club.html#installations')}">
        ${im ? pic(im, { sizes: i === 0 ? '(max-width:960px) 100vw, 58vw' : '(max-width:960px) 50vw, 40vw', alt: im.alt || f.title }) : icon('court', 'tile-ic')}
        <div class="tile-body"><span class="chip chip-dot surface-${esc(f.surface)}">${esc(f.count || SURF[f.surface] || '')}</span><h3>${esc(f.title)}</h3>${i < 2 ? `<p>${esc(f.desc)}</p>` : ''}</div></a>`;
    }).join('');
  }
  function renderFacilities(c, el) {
    const list = visible(c.facilities).sort(byOrder);
    el.innerHTML = list.map((f, i) => {
      const ims = f.images || [];
      // Titre puis photos (mobile) ; sur ordinateur, photos à gauche une fois sur deux
      return `<article class="split fac${i % 2 ? '' : ' fac-media-first'}" style="${i ? 'margin-top:clamp(40px,6vw,80px)' : ''}">
        <div><span class="chip chip-dot surface-${esc(f.surface)}">${esc(SURF[f.surface] || f.surface || '')}</span>
          <h3 class="h3" style="margin-top:14px;font-size:var(--step-3);text-transform:uppercase;font-stretch:112%">${esc(f.title)}</h3>
          ${f.count ? `<p class="num" style="font-size:1.6rem;color:var(--blue);margin-top:8px">${esc(f.count)}</p>` : ''}
          <p class="lead" style="margin-top:12px">${esc(f.desc)}</p></div>
        <div class="media">${ims[0] ? `<button type="button" class="lb-trigger" data-group="fac-${esc(f.id)}" data-i="0" style="all:unset;cursor:zoom-in;display:block">${pic(ims[0], { sizes: '(max-width:960px) 100vw, 50vw', alt: ims[0].alt || f.title })}</button>` : `<div class="court" style="aspect-ratio:4/3;display:grid;place-items:center;border-radius:var(--radius-l)">${icon('ball', '')}</div>`}
          ${ims.length > 1 ? `<div style="display:flex;gap:8px;margin-top:10px">${ims.slice(1, 5).map((im, j) => `<button type="button" class="lb-trigger" data-group="fac-${esc(f.id)}" data-i="${j + 1}" style="all:unset;cursor:zoom-in;flex:1">${pic(im, { sizes: '160px', alt: im.alt || f.title, attrs: 'style="aspect-ratio:1;object-fit:cover;border-radius:6px;width:100%"' })}</button>`).join('')}</div>` : ''}
        </div>
      </article>`;
    }).join('');
    list.forEach((f) => registerGroup('fac-' + f.id, f.images || []));
  }

  /* ---------- Agenda ---------- */
  function upcoming(c) {
    const t = today();
    return visible(c.events).filter((e) => e.dateStart && (parseISO(e.dateEnd || e.dateStart) >= t)).sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  }
  function countdown(e) {
    const t = today(), s = parseISO(e.dateStart), end = parseISO(e.dateEnd || e.dateStart);
    if (s <= t && end >= t) return 'En cours';
    const d = Math.round((s - t) / 86400000);
    return d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `Dans ${d} jours`;
  }
  function dateBox(e) {
    if (!e.dateStart) return `<div class="datebox recurring" aria-hidden="true">${icon('repeat')}</div>`;
    const d = parseISO(e.dateStart);
    return `<div class="datebox"><span class="d">${d.getDate()}</span><span class="m">${MSHORT[d.getMonth()]}</span></div>`;
  }
  function whenText(e) {
    if (!e.dateStart) return e.when || '';
    const s = parseISO(e.dateStart);
    if (e.dateEnd && e.dateEnd !== e.dateStart) { const en = parseISO(e.dateEnd); return `Du ${s.getDate()} ${MONTHS[s.getMonth()]} au ${en.getDate()} ${MONTHS[en.getMonth()]}`; }
    return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]}`;
  }
  function eventCard(e, withCountdown = true) {
    return `<a class="event" href="${url('agenda.html#' + e.id)}">${dateBox(e)}<div>
      <h3>${esc(e.title)}</h3>
      <div class="meta"><span>${icon('calendar')}${esc(whenText(e))}${e.time ? ' · ' + esc(e.time) : ''}</span>${e.location ? `<span>${icon('pin')}${esc(e.location)}</span>` : ''}</div>
      <p>${esc(e.summary || '')}</p>
      ${withCountdown && e.dateStart ? `<span class="countdown">${countdown(e)}</span>` : ''}</div></a>`;
  }
  function renderAgendaHome(c, el) {
    const n = +(el.dataset.limit || 3);
    let list = upcoming(c).slice(0, n);
    if (list.length < n) list = list.concat(visible(c.events).filter((e) => e.recurring).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)).slice(0, n - list.length));
    el.innerHTML = list.map((e) => eventCard(e)).join('') || '<p class="empty">Aucun rendez-vous programmé pour le moment.</p>';
  }
  function renderEventsCat(c, el) {
    const cats = (el.dataset.cat || '').split(',');
    el.innerHTML = visible(c.events).filter((e) => cats.includes(e.category)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)).map((e) => eventCard(e, false)).join('');
  }
  function eventDetail(e) {
    const ims = e.images || [];
    registerGroup('ev-' + e.id, ims);
    return `<article class="event-detail" id="${esc(e.id)}">
      <div>
        <div class="ed-head">${dateBox(e)}<div><span class="chip">${esc({ tournoi: 'Tournoi', animation: 'Animation', competition: 'Compétition', stage: 'Stage' }[e.category] || 'Événement')}</span>
        <h3 style="margin-top:10px">${esc(e.title)}</h3>
        <div class="meta" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;color:var(--ink-3);font-size:.9rem"><span>${icon('calendar')} ${esc(whenText(e))}${e.time ? ' · ' + esc(e.time) : ''}</span>${e.location ? `<span>${icon('pin')} ${esc(e.location)}</span>` : ''}</div></div></div>
        <div class="body prose">${md(e.body || e.summary)}</div>
        ${e.link ? `<p style="margin-top:18px"><a class="btn btn-blue btn-sm" href="${esc(e.link)}" target="_blank" rel="noopener">En savoir plus ${icon('external')}</a></p>` : ''}
      </div>
      <div class="ed-media">${ims.slice(0, 2).map((im, i) => `<button type="button" class="lb-trigger" data-group="ev-${esc(e.id)}" data-i="${i}" style="all:unset;cursor:zoom-in">${pic(im, { sizes: '(max-width:960px) 100vw, 45vw', alt: im.alt || e.title })}</button>`).join('')}</div>
    </article>`;
  }
  function renderAgendaFull(c) {
    const up = upcoming(c);
    const rec = visible(c.events).filter((e) => !e.dateStart || e.recurring);
    const u = $('[data-render="agenda-upcoming"]'), r = $('[data-render="agenda-recurring"]');
    if (u) u.innerHTML = up.length ? up.map(eventDetail).join('') : '<p class="empty">Pas de date programmée pour le moment : suivez nos actualités ou notre page Facebook.</p>';
    if (r) r.innerHTML = rec.map(eventDetail).join('');
    up.forEach((e) => jsonLD({
      '@context': 'https://schema.org', '@type': 'SportsEvent', name: e.title, startDate: e.dateStart, endDate: e.dateEnd || e.dateStart,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', description: e.summary,
      location: { '@type': 'Place', name: 'USM Tennis Montargis', address: { '@type': 'PostalAddress', streetAddress: c.settings.address, postalCode: c.settings.zip, addressLocality: c.settings.city, addressCountry: 'FR' } },
      organizer: { '@type': 'SportsClub', name: 'USM Tennis Montargis', url: (window.USM_CONFIG || {}).siteUrl }
    }));
    if (location.hash) setTimeout(() => { const t = document.getElementById(location.hash.slice(1)); t && t.scrollIntoView(); }, 60);
  }

  /* ---------- Actualités ---------- */
  const newsHref = (n) => url('actualite.html#' + n.slug);
  function newsCard(n, variant = '') {
    const im = (n.images || [])[0];
    return `<a class="card-news ${variant}" href="${newsHref(n)}">
      <div class="media">${im ? pic(im, { sizes: variant === 'big' ? '(max-width:960px) 100vw, 58vw' : '(max-width:640px) 100vw, 33vw', alt: n.title }) : ''}${n.featured && variant === 'big' ? '<span class="badge-une">À la une</span>' : ''}</div>
      <div class="body"><div class="top"><span class="chip cat-${esc(n.category)}">${esc(CATS[n.category] || 'Actualité')}</span><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time></div>
      <h3>${esc(n.title)}</h3>${variant === 'row' ? '' : `<p>${esc(n.excerpt || '')}</p>`}</div></a>`;
  }
  const sortedNews = (c) => visible(c.news).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  function renderNewsHome(c, el) {
    const list = sortedNews(c);
    const feat = list.find((n) => n.featured) || list[0];
    const rest = list.filter((n) => n !== feat).slice(0, 3);
    el.innerHTML = feat ? `${newsCard(feat, 'big')}<div class="news-stack">${rest.map((n) => newsCard(n, 'row')).join('')}</div>` : '';
  }
  function renderNewsFiltered(c, el) {
    const cat = el.dataset.cat, n = +(el.dataset.limit || 3);
    el.innerHTML = sortedNews(c).filter((x) => !cat || x.category === cat).slice(0, n).map((x) => newsCard(x)).join('');
  }
  function renderNewsList(c) {
    const grid = $('[data-render="news-list"]'); if (!grid) return;
    const all = sortedNews(c);
    const filters = $('#news-filters'), search = $('#news-search'), more = $('#news-more'), count = $('#news-count');
    let cat = '', q = '', page = 1; const per = 9;
    const initial = new URLSearchParams(location.search).get('cat') || (location.hash.startsWith('#cat-') ? location.hash.slice(5) : '');
    if (initial && CATS[initial]) cat = initial;
    filters.innerHTML = [['', 'Toutes']].concat(Object.entries(CATS)).map(([k, v]) => `<button type="button" class="filter" data-cat="${k}" aria-pressed="${k === cat}">${v}</button>`).join('');
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function draw() {
      const res = all.filter((n) => (!cat || n.category === cat) && (!q || norm(n.title + ' ' + n.body).includes(norm(q))));
      grid.innerHTML = res.slice(0, page * per).map((n) => newsCard(n)).join('') || '<p class="empty" style="grid-column:1/-1">Aucune actualité ne correspond à votre recherche.</p>';
      more.hidden = res.length <= page * per;
      count.textContent = `${res.length} actualité${res.length > 1 ? 's' : ''}`;
    }
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('.filter'); if (!b) return;
      cat = b.dataset.cat; page = 1;
      $$('.filter', filters).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    let tmr; search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { q = search.value.trim(); page = 1; draw(); }, 160); });
    more.addEventListener('click', () => { page++; draw(); });
    draw();
  }
  function renderArticle(c) {
    const el = $('[data-render="article"]'); if (!el) return;
    const params = new URLSearchParams(location.search);
    const slug = decodeURIComponent((location.hash || '').slice(1)) || params.get('a') || '';
    const list = sortedNews(c);
    const n = list.find((x) => x.slug === slug || x.id === slug);
    if (!n) {
      el.innerHTML = `<div class="container section"><p class="eyebrow">Actualité introuvable</p><h1 class="h2" style="margin-top:14px">Cet article n'existe plus</h1><p class="lead" style="margin-top:14px">Il a peut-être été retiré ou renommé.</p><p style="margin-top:24px"><a class="btn btn-blue" href="${url('actualites.html')}">Toutes les actualités ${icon('arrow')}</a></p></div>`;
      return;
    }
    const ims = n.images || [];
    registerGroup('article', ims);
    const others = list.filter((x) => x !== n).slice(0, 3);
    const siteUrl = (window.USM_CONFIG || {}).siteUrl || '';
    const shareUrl = siteUrl + '/actualite.html#' + n.slug;
    document.title = `${n.title} | USM Tennis Montargis`;
    const md_ = $('meta[name="description"]'); if (md_) md_.setAttribute('content', n.excerpt || '');
    el.innerHTML = `
      <section class="page-hero"><div class="container"><div class="court">${courtSVG()}
        <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${url('index.html')}">Accueil</a><span>/</span><a href="${url('actualites.html')}">Actualités</a><span>/</span><span>${esc(CATS[n.category] || '')}</span></nav>
        <div class="article-head"><span class="chip" style="margin-top:18px;background:rgba(255,255,255,.14);color:#fff">${esc(CATS[n.category] || 'Actualité')}</span>
          <h1 style="color:#fff;font-size:var(--step-4);text-transform:none;max-width:24ch">${esc(n.title)}</h1>
          <div class="article-meta" style="color:var(--on-blue-2)"><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time><span>·</span><span>${Math.max(1, Math.round((n.body || '').split(/\s+/).length / 200))} min de lecture</span></div></div>
      </div></div></section>
      <div class="container">
        ${ims[0] ? `<figure class="article-cover"><button type="button" class="lb-trigger" data-group="article" data-i="0" style="all:unset;display:block;cursor:zoom-in;width:100%">${pic(ims[0], { eager: true, sizes: '(max-width:1280px) 100vw, 1240px', alt: n.title })}</button></figure>` : ''}
        <div class="article-layout">
          <div><div class="article-body prose">${md(n.body)}</div>
            ${ims.length > 1 ? `<div class="article-gallery">${ims.map((im, i) => `<button type="button" class="lb-trigger" data-group="article" data-i="${i}" style="all:unset;cursor:zoom-in">${pic(im, { sizes: '200px', alt: n.title + ' – photo ' + (i + 1) })}</button>`).join('')}</div>` : ''}
          </div>
          <aside style="display:grid;gap:14px;align-content:start">
            <div class="aside-card"><h3>Partager</h3><div class="share-row">
              <a class="btn btn-sm" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">${icon('facebook')} Facebook</a>
              <button type="button" class="btn btn-sm" data-copy="${esc(shareUrl)}">${icon('link')} Copier le lien</button></div></div>
            <div class="aside-card"><h3>Envie de jouer ?</h3><p class="muted" style="font-size:.93rem">Demandez une séance d'essai avec notre enseignant, pour tous les âges et tous les niveaux.</p><a class="btn btn-ball btn-sm" href="${url('contact.html#essai')}">Réserver un essai</a></div>
          </aside>
        </div>
        ${others.length ? `<section class="section-tight"><div class="section-head"><div><p class="eyebrow">À lire aussi</p><h2 class="h3" style="margin-top:10px;font-size:var(--step-3);text-transform:uppercase">Autres actualités</h2></div><a class="link-arrow" href="${url('actualites.html')}">Toutes les actualités ${icon('arrow')}</a></div><div class="news-grid">${others.map((x) => newsCard(x)).join('')}</div></section>` : ''}
      </div>`;
    jsonLD({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, datePublished: n.date, image: ims.map((i) => url(i.src)).filter((s) => !s.startsWith('data:')).map((s) => (/^https?:/.test(s) ? s : siteUrl + '/' + s)), author: { '@type': 'Organization', name: 'USM Tennis Montargis' }, publisher: { '@type': 'Organization', name: 'USM Tennis Montargis' }, description: n.excerpt });
    window.scrollTo(0, 0);
  }

  /* ---------- Tarifs ---------- */
  const RATE_TABS = [['adultes', 'Adultes'], ['jeunes', 'Jeunes'], ['licences', 'Licences & cours'], ['ete', 'Été & stages']];
  function rateCard(r) {
    return `<article class="rate ${r.featured ? 'featured' : ''}">${r.featured ? '<span class="flag">Le plus choisi</span>' : ''}
      <div><span class="code">${esc(r.code || '')}</span><h3>${esc(r.title)}</h3></div>
      <p class="price"><span class="num">${euro(r.price)}&nbsp;€</span><small>${esc(r.unit || '')}</small></p>
      ${r.licence ? `<p class="lic">${esc(r.licence)}</p>` : ''}
      ${r.features && r.features.length ? `<ul>${r.features.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
      ${r.desc ? `<p>${esc(r.desc)}</p>` : ''}
      ${r.note ? `<p class="rate-note" style="margin:0">${esc(r.note)}</p>` : ''}
      <div class="rate-ctas">
        <a class="btn btn-blue btn-sm" href="#formule-${esc(r.code)}" data-formule="${esc(r.code)}">${icon('mail')}Je suis intéressé(e)</a>
        ${waLink('x') ? `<a class="btn btn-wa btn-sm" href="${esc(waLink(`Bonjour, je souhaite des informations sur la formule ${rateLabel(r)}.`))}" target="_blank" rel="noopener" aria-label="Poser une question sur WhatsApp">${icon('whatsapp')}WhatsApp</a>` : ''}
      </div>
    </article>`;
  }
  function renderRates(c, el) {
    const tabs = $('[data-rate-tabs]');
    const rates = visible(c.rates);
    const fromHash = (location.hash.match(/^#tarifs-(\w+)/) || [])[1];
    let cur = fromHash || 'adultes';
    function draw() {
      const list = rates.filter((r) => r.category === (cur === 'licences' ? 'licences' : cur) || (cur === 'licences' && r.category === 'cours')).sort(byOrder);
      el.innerHTML = list.map(rateCard).join('');
      el.style.gridTemplateColumns = list.length < 4 && innerWidth > 960 ? `repeat(${Math.max(list.length, 2)}, minmax(0, 360px))` : '';
      if (tabs) $$('.tab', tabs).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === cur)));
    }
    if (tabs) {
      tabs.innerHTML = RATE_TABS.filter(([k]) => rates.some((r) => r.category === k || (k === 'licences' && r.category === 'cours'))).map(([k, v]) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="false">${v}</button>`).join('');
      tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; cur = t.dataset.tab; draw(); });
    }
    draw();
    // Arrivée depuis un lien « tarifs.html#tarifs-adultes » : on descend directement aux formules
    if (fromHash) setTimeout(() => { const sec = $('#tarifs'); if (sec) sec.scrollIntoView({ block: 'start' }); }, 60);
  }
  function renderRatesCat(c, el) {
    const cats = el.dataset.cat.split(',');
    el.innerHTML = visible(c.rates).filter((r) => cats.includes(r.category)).sort(byOrder).map(rateCard).join('');
  }
  function renderDocs(c, el) {
    el.innerHTML = (c.documents || []).map((d) => `<a class="doc" href="${esc(url(d.url))}" target="_blank" rel="noopener"><span class="ic">PDF</span><span><b>${esc(d.name)}</b><small>${d.size ? Math.round(d.size / 1024) + ' Ko' : 'Document'}</small></span>${icon('download')}</a>`).join('');
  }
  function renderFaq(c, el) {
    const list = visible(c.faq).sort(byOrder);
    el.innerHTML = list.map((f) => `<details><summary>${esc(f.q)}${icon('plus')}</summary><div><p>${esc(f.a)}</p></div></details>`).join('');
    jsonLD({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }

  /* ---------- Avis (citations) ---------- */
  function stars(n, label) {
    const v = Math.max(0, Math.min(5, parseFloat(String(n || 0).replace(',', '.')) || 0));
    const row = Array.from({ length: 5 }, () => icon('star', 'fill')).join('');
    const txt = label || `Note : ${String(Math.round(v * 10) / 10).replace('.', ',')} sur 5`;
    return `<span class="stars" style="--v:${(v / 5) * 100}%" role="img" aria-label="${esc(txt)}"><span class="s-bg">${row}</span><span class="s-fg">${row}</span></span>`;
  }
  function renderReviews(c, el) {
    let list = visible(c.reviews).filter((r) => r.text).sort(byOrder);
    if (el.dataset.topic) { const t = el.dataset.topic.split(','); list = list.filter((r) => t.includes(r.topic)); }
    if (el.dataset.limit) list = list.slice(0, +el.dataset.limit);
    const sec = el.closest('[data-reviews-section]');
    if (!list.length) { if (sec) sec.hidden = true; el.innerHTML = ''; return; }
    if (sec) sec.hidden = false;
    el.innerHTML = list.map((r) => `<figure class="quote${String(r.text).length > 70 ? ' long' : ''}">
      <blockquote><p>${esc(r.text)}</p></blockquote>
      <figcaption>${stars(r.rating, `${r.rating || 5} étoiles sur 5`)}<span class="who"><b>${esc(r.author || 'Anonyme')}</b><small>Avis ${esc(r.source || 'Google')}</small></span></figcaption>
    </figure>`).join('');
  }
  function renderReviewsSummary(c, el) {
    const s = (c.settings || {}).reviews || {};
    const link = s.url || '', write = s.writeUrl || s.url || '';
    const links = `<div class="rating-links">${write ? `<a class="btn btn-sm" href="${esc(write)}" target="_blank" rel="noopener">${icon('star')}Laisser un avis</a>` : ''}${link ? `<a class="link-arrow" href="${esc(link)}" target="_blank" rel="noopener">Lire tous les avis${icon('external')}</a>` : ''}</div>`;
    el.innerHTML = s.rating
      ? `<div class="rating-top"><span class="rating-num num">${esc(s.rating)}<small>/5</small></span><span>${stars(s.rating)}<span class="rating-count">${s.count ? `${esc(s.count)} avis sur Google` : 'sur Google'}</span></span></div>${links}`
      : links;
  }

  /* ---------- Planning ---------- */
  function renderPlanning(c, el) {
    const slots = (c.slots || []).filter((s) => !el.dataset.audience || s.audience === el.dataset.audience);
    const toH = (t) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };
    const min = Math.floor(Math.min(...slots.map((s) => toH(s.start)), 9));
    const max = Math.ceil(Math.max(...slots.map((s) => toH(s.end)), 20));
    const H = 40, height = (max - min) * H;
    const days = [1, 2, 3, 4, 5, 6];
    let html = `<div class="planning-grid"><div class="ph"></div>${days.map((d) => `<div class="ph">${DAYS[d]}</div>`).join('')}`;
    html += `<div class="hours" style="height:${height}px">${Array.from({ length: max - min + 1 }, (_, i) => `<span style="top:${i * H}px">${min + i} h</span>`).join('')}</div>`;
    days.forEach((d) => {
      html += `<div class="col" style="height:${height}px">${slots.filter((s) => +s.day === d).map((s) => {
        const top = (toH(s.start) - min) * H, h = (toH(s.end) - toH(s.start)) * H;
        return `<div class="slot ${esc(s.audience)}" style="top:${top + 2}px;height:${h - 4}px" title="${esc(s.label)}"><b>${s.start.replace(':', 'h')} – ${s.end.replace(':', 'h')}</b>${h > 50 ? esc(s.label || '') : ''}</div>`;
      }).join('')}</div>`;
    });
    el.innerHTML = html + '</div>';
  }

  /* ---------- Équipe ---------- */
  const initials = (n) => (n || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  function renderCoach(c, el) {
    const k = visible(c.team).filter((t) => t.group === 'coach').sort(byOrder)[0];
    if (!k) { el.hidden = true; return; }
    el.innerHTML = `<div class="photo">${k.photo ? pic(k.photo, { sizes: '300px', alt: k.name }) : `<div class="avatar" style="width:100%;height:auto;aspect-ratio:4/5;border-radius:var(--radius);font-size:3rem">${initials(k.name)}</div>`}
        ${k.ranking ? `<span class="rank"><small>Classement</small>${esc(k.ranking)}</span>` : ''}</div>
      <div><p class="eyebrow">Notre enseignant</p><h2 class="h2" style="margin-top:12px">${esc(k.name)}</h2>
        ${k.quote ? `<blockquote>${esc(k.quote)}</blockquote>` : ''}
        <p class="lead" style="margin-top:18px;font-size:1.02rem">${esc(k.bio || '')}</p>
        <div class="who"><span><b>${esc(k.role)}</b></span>${k.phone ? `<span>${icon('phone')} <a href="tel:${esc(k.phone.replace(/\s/g, ''))}">${esc(k.phone)}</a></span>` : ''}${k.email ? `<span>${icon('mail')} <a href="mailto:${esc(k.email)}">${esc(k.email)}</a></span>` : ''}</div></div>`;
  }
  function renderTeam(c, el) {
    const g = (el.dataset.group || 'bureau').split(',');
    const phoneOnly = el.hasAttribute('data-phone-only');
    el.innerHTML = visible(c.team).filter((t) => g.includes(t.group) && (!phoneOnly || t.phone)).sort((a, b) => g.indexOf(a.group) - g.indexOf(b.group) || byOrder(a, b)).map((t) => `<div class="member"><span class="avatar">${t.photo ? pic(t.photo, { sizes: '56px', alt: t.name }) : initials(t.name)}</span><span><b>${esc(t.name)}</b><span>${esc(t.role)}</span>${t.phone ? `<br><span><a href="tel:${esc(t.phone.replace(/\s/g, ''))}">${esc(t.phone)}</a></span>` : ''}</span></div>`).join('');
  }

  /* ---------- Galerie & lightbox ---------- */
  const groups = {};
  function registerGroup(name, ims) { groups[name] = ims || []; }
  function renderGallery(c, el) {
    const ims = (c.gallery || []).slice(0, +(el.dataset.limit || 40));
    registerGroup('gallery', ims);
    el.innerHTML = ims.map((im, i) => `<button type="button" class="lb-trigger" data-group="gallery" data-i="${i}" aria-label="Agrandir la photo ${i + 1}">${pic(im, { sizes: '(max-width:640px) 50vw, 25vw', alt: im.alt })}</button>`).join('');
  }
  function initLightbox() {
    let box, cur = 0, list = [], opener = null;
    function show() {
      const im = list[cur]; if (!im) return;
      $('img', box).src = url(im.src); $('img', box).alt = im.alt || '';
      $('.lb-count', box).textContent = `${cur + 1} / ${list.length}`;
      $$('.lb-nav', box).forEach((b) => (b.hidden = list.length < 2));
    }
    function close() { box.hidden = true; document.body.style.overflow = ''; opener && opener.focus(); }
    function open(g, i, from) {
      list = groups[g] || []; if (!list.length) return;
      cur = i; opener = from;
      if (!box) {
        box = document.createElement('div'); box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo agrandie');
        box.innerHTML = `<img alt=""><button type="button" class="lb-close" aria-label="Fermer">${icon('close')}</button><button type="button" class="lb-nav lb-prev" aria-label="Photo précédente">${icon('chevron-left')}</button><button type="button" class="lb-nav lb-next" aria-label="Photo suivante">${icon('chevron-right')}</button><div class="lb-count"></div>`;
        document.body.appendChild(box);
        $('.lb-close', box).addEventListener('click', close);
        $('.lb-prev', box).addEventListener('click', () => { cur = (cur - 1 + list.length) % list.length; show(); });
        $('.lb-next', box).addEventListener('click', () => { cur = (cur + 1) % list.length; show(); });
        box.addEventListener('click', (e) => { if (e.target === box) close(); });
        document.addEventListener('keydown', (e) => {
          if (box.hidden) return;
          if (e.key === 'Escape') close();
          if (e.key === 'ArrowLeft') { cur = (cur - 1 + list.length) % list.length; show(); }
          if (e.key === 'ArrowRight') { cur = (cur + 1) % list.length; show(); }
        });
      }
      box.hidden = false; document.body.style.overflow = 'hidden'; show(); $('.lb-close', box).focus();
    }
    document.addEventListener('click', (e) => {
      const t = e.target.closest('.lb-trigger'); if (!t) return;
      e.preventDefault(); open(t.dataset.group, +t.dataset.i || 0, t);
    });
  }

  /* ---------- Partenaires ---------- */
  function logoTile(s) {
    const inner = s.logo ? pic(s.logo, { sizes: '200px', alt: s.name }) : esc(s.name);
    return s.url ? `<a class="logo-tile" href="${esc(s.url)}" target="_blank" rel="noopener sponsored" title="${esc(s.name)}" data-sponsor="${esc(s.name)}">${inner}</a>` : `<span class="logo-tile" title="${esc(s.name)}">${inner}</span>`;
  }
  function renderMarquee(c, el) {
    const list = visible(c.sponsors).sort(byOrder);
    const reps = Math.max(2, Math.ceil(8 / Math.max(list.length, 1)));
    const once = Array.from({ length: reps }, () => list.map(logoTile).join('')).join('');
    el.innerHTML = `<div class="marquee-track">${once}<span style="display:contents" aria-hidden="true">${once}</span></div>`;
  }
  function renderSponsors(c, el) {
    el.innerHTML = visible(c.sponsors).sort(byOrder).map((s) => `<article class="sponsor"><div class="logo-area">${s.logo ? pic(s.logo, { sizes: '260px', alt: s.name }) : esc(s.name)}</div>
      <div class="s-body"><h3>${esc(s.name)}</h3><p>${esc(s.desc || '')}</p>${s.perk ? `<span class="perk">${icon('sparkle')} ${esc(s.perk)}</span>` : ''}
      ${s.url ? `<a class="link-arrow" href="${esc(s.url)}" target="_blank" rel="noopener sponsored" data-sponsor="${esc(s.name)}">Visiter le site ${icon('external')}</a>` : ''}</div></article>`).join('');
  }
  function renderPacks(c, el) {
    const packs = c.sponsorPacks || [];
    /* Un prix chiffré (« 500 € ») s'affiche en grand ; un texte (« Sur devis ») garde le style simple */
    const price = (p) => {
      const v = String(p.price || '').trim();
      if (!v) return '';
      return /\d/.test(v)
        ? `<p class="p-price is-amount"><span class="p-amount">${esc(v)}</span>${p.period ? `<span class="p-period">${esc(p.period)}</span>` : ''}</p>`
        : `<p class="p-price">${esc(v)}${p.period ? ` <span class="p-period">${esc(p.period)}</span>` : ''}</p>`;
    };
    el.innerHTML = packs.map((p) => `<article class="pack ${p.highlight ? 'highlight' : ''}"><div class="pack-head"><h3>${esc(p.name)}</h3>${price(p)}</div>
      <ul>${(p.features || []).map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
      <a class="btn ${p.highlight ? 'btn-ball' : 'btn-blue'}" href="#devenir-partenaire" data-pack="${esc(p.name)}">Choisir ce pack</a></article>`).join('');
    /* Le menu du formulaire suit les packs de l'admin (nom + prix) */
    const sel = $('#pf-pack');
    if (sel && packs.length) {
      const cur = sel.value;
      sel.innerHTML = packs.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}${p.price ? ' · ' + esc(p.price) : ''}</option>`).join('') + '<option value="Je ne sais pas encore">Je ne sais pas encore</option>';
      if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    }
    $$('[data-pack]', el).forEach((a) => a.addEventListener('click', () => { const s = $('#pf-pack'); if (s) s.value = a.dataset.pack; }));
  }

  /* ---------- Horaires ----------
     Une ligne = { days: 'Lundi – vendredi', open: '17:00', close: '20:00' } → « Accueil du lundi au vendredi de 17 h à 20 h ».
     Une ligne sans heures n'est pas affichée. */
  const hm = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const hFr = (t) => { const v = hm(t); if (v == null) return ''; const m = v % 60; return Math.floor(v / 60) + '\u00a0h' + (m ? '\u00a0' + String(m).padStart(2, '0') : ''); };
  const isOpenRow = (x) => hm(x.open) != null && hm(x.close) != null;
  function hoursSentence(x) {
    const days = String(x.days || '').trim().toLowerCase();
    const r = days.split(/\s*(?:–|—|-)\s*/);
    return `Accueil ${r.length === 2 ? `du ${r[0]} au ${r[1]}` : `le ${days}`} de ${hFr(x.open)} à ${hFr(x.close)}`;
  }
  const hoursLine = (h) => h.filter(isOpenRow).map(hoursSentence).join(' · ');
  function renderHours(c, el) {
    const h = ((c.settings || {}).hours || []).filter(isOpenRow);
    el.innerHTML = h.map((x) => `<p class="hours-line">${esc(hoursSentence(x))}</p>`).join('');
  }

  /* ---------- Formulaires ---------- */
  function initForms() {
    $$('form[data-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (form.querySelector('.hp input') && form.querySelector('.hp input').value) return;
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        const data = {}; fd.forEach((v, k) => { if (k !== 'website') data[k] = v; });
        const btn = form.querySelector('[type="submit"]'); const label = btn.innerHTML;
        btn.disabled = true; btn.textContent = 'Envoi…';
        try {
          await store.addMessage({ type: form.dataset.form, name: data.name, email: data.email, phone: data.phone || '', subject: data.subject || '', message: data.message || '', extra: data });
          const ok = document.createElement('div'); ok.className = 'form-ok'; ok.setAttribute('role', 'status');
          ok.innerHTML = `${icon('check')}<div><b>Merci ${esc(data.name || '')}, votre demande est bien enregistrée.</b><p class="muted" style="margin-top:4px">Le club vous répond par e-mail ou téléphone sous quelques jours.${store.isLocal ? ' (Aperçu : le message est visible dans l\'admin, rubrique Messages.)' : ''}</p></div>`;
          form.replaceWith(ok);
          track(form.dataset.form === 'contact' ? 'contact_form_submit' : form.dataset.form + '_form_submit', { formulaire: form.id || form.dataset.form });
        } catch (err) {
          btn.disabled = false; btn.innerHTML = label;
          toast("L'envoi a échoué. Vérifiez votre connexion ou écrivez-nous directement par e-mail.");
        }
      });
    });
    // Sujet pré-rempli par l'ancre (#essai, #inscription, #partenariat)
    const h = location.hash.slice(1);
    const sel = $('#cf-subject');
    if (sel && h) { const opt = $$('option', sel).find((o) => o.value === h); if (opt) { sel.value = h; const f = $('#contact-form'); f && setTimeout(() => f.scrollIntoView({ block: 'start' }), 50); } }
    // Formule choisie (#formule-AT1) : préremplit le formulaire de la page, sinon renvoie vers Contact
    const fromHash = () => { const m = location.hash.match(/^#formule-([\w-]+)$/); if (m) prefillFormule(m[1], false); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-formule]'); if (!a) return;
      e.preventDefault();
      prefillFormule(a.dataset.formule, true);
    });
    // Boutons WhatsApp génériques
    $$('[data-wa]').forEach((a) => { const l = waLink(a.dataset.wa || 'Bonjour, je souhaite des informations sur le club.'); if (l) { a.href = l; a.hidden = false; } else a.hidden = true; });
  }
  function prefillFormule(code, fromClick) {
    const form = $('form[data-prefill]');
    if (!form) { location.href = url('contact.html#formule-' + code); return; }
    const r = ((CONTENT || {}).rates || []).find((x) => x.code === code);
    if (!r) return;
    openBand(form);
    try { history.replaceState(null, '', '#formule-' + code); } catch (e) { /* ignore */ }
    const subj = $('select[name="subject"]', form); if (subj) subj.value = r.category === 'licences' && r.code === 'LIC-D' ? 'essai' : 'inscription';
    const msg = $('textarea[name="message"]', form);
    if (msg) msg.value = `Bonjour, je suis intéressé(e) par la formule ${rateLabel(r)}. `;
    const hid = $('input[name="formule"]', form); if (hid) hid.value = r.code;
    let chip = $('.formule-chip', form);
    if (!chip) { chip = document.createElement('p'); chip.className = 'formule-chip'; const t = $('h3', form); if (t) t.after(chip); else form.prepend(chip); }
    chip.innerHTML = `${icon('check')}<span>Formule choisie : <b>${esc(r.title)}</b> · ${euro(r.price)} €</span>`;
    const wa = $('[data-wa]', form.closest('section') || document);
    if (wa) { const l = waLink(`Bonjour, je souhaite des informations sur la formule ${rateLabel(r)}.`); if (l) wa.href = l; }
    form.scrollIntoView({ behavior: fromClick ? 'smooth' : 'auto', block: 'start' });
    setTimeout(() => { const n = $('input[name="name"]', form); n && n.focus({ preventScroll: true }); }, fromClick ? 450 : 50);
  }

  /* ---------- Copier ---------- */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Lien copié'); } catch (err) { toast(b.dataset.copy); }
  });

  /* ---------- Carte (chargée au clic, sans cookie avant consentement) ---------- */
  function initMap(c) {
    const f = $('.map-facade'); if (!f) return;
    const s = c.settings || {}, g = s.geo || {};
    const q = encodeURIComponent(`${s.address}, ${s.zip} ${s.city}`);
    $$('[data-route]', f.parentElement).forEach((a) => {
      const t = a.dataset.route;
      a.href = t === 'google' ? `https://www.google.com/maps/dir/?api=1&destination=${q}` : t === 'waze' ? `https://waze.com/ul?ll=${g.lat},${g.lng}&navigate=yes` : `https://maps.apple.com/?daddr=${q}`;
    });
    const btn = $('[data-load-map]', f);
    btn && btn.addEventListener('click', () => {
      const d = 0.004;
      f.insertAdjacentHTML('beforeend', `<iframe title="Plan d'accès au club" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${g.lng - d},${g.lat - d / 2},${g.lng + d},${g.lat + d / 2}&layer=mapnik&marker=${g.lat},${g.lng}"></iframe>`);
    });
  }

  /* ---------- Météo (Open-Meteo, sans clé) ---------- */
  async function initWeather(c) {
    const el = $('[data-weather]'); if (!el || (c.settings && c.settings.weather === false)) return;
    const g = (c.settings || {}).geo || { lat: 48.0094, lng: 2.7499 };
    const label = (code) => code === 0 ? ['sun', 'Grand soleil'] : code <= 2 ? ['sun', 'Éclaircies'] : code === 3 ? ['cloud', 'Couvert'] : code <= 48 ? ['cloud', 'Brouillard'] : code <= 67 || (code >= 80 && code <= 82) ? ['rain', 'Pluie'] : code <= 77 || code === 85 || code === 86 ? ['cloud', 'Neige'] : ['rain', 'Orage'];
    try {
      let data;
      try { const cached = JSON.parse(sessionStorage.getItem('usm_wx') || 'null'); if (cached && Date.now() - cached.t < 1800000) data = cached.d; } catch (e) { /* ignore */ }
      if (!data) {
        const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lng}&current=temperature_2m,weather_code,precipitation,wind_speed_10m&timezone=Europe%2FParis`, { signal: ctrl.signal });
        data = (await r.json()).current;
        try { sessionStorage.setItem('usm_wx', JSON.stringify({ t: Date.now(), d: data })); } catch (e) { /* ignore */ }
      }
      const [ic, txt] = label(data.weather_code);
      const good = data.weather_code <= 3 && !data.precipitation && data.wind_speed_10m < 30;
      el.innerHTML = `${icon(ic)}<span>${Math.round(data.temperature_2m)}°</span>`;
      el.title = `Montargis : ${txt}, ${Math.round(data.temperature_2m)} °C, vent ${Math.round(data.wind_speed_10m)} km/h${good ? ' — temps idéal pour jouer dehors' : ' — pensez aux courts couverts'}`;
      el.setAttribute('aria-label', el.title);
      el.hidden = false;
    } catch (e) { el.hidden = true; }
  }

  /* ---------- Tracé du court (réutilisé) ---------- */
  function courtSVG() {
    return '<svg class="court-lines" viewBox="0 0 2377 1097" preserveAspectRatio="none" aria-hidden="true"><g class="h"><rect x="40" y="40" width="2297" height="1017"/><line x1="40" y1="167" x2="2337" y2="167"/><line x1="40" y1="930" x2="2337" y2="930"/><line x1="570" y1="167" x2="570" y2="930"/><line x1="1807" y1="167" x2="1807" y2="930"/><line x1="570" y1="548" x2="1807" y2="548"/><line class="net" x1="1188" y1="12" x2="1188" y2="1085"/></g><g class="v"><rect x="40" y="40" width="2297" height="1017"/><line x1="327" y1="40" x2="327" y2="1057"/><line x1="2050" y1="40" x2="2050" y2="1057"/><line x1="327" y1="274" x2="2050" y2="274"/><line x1="327" y1="822" x2="2050" y2="822"/><line x1="1188" y1="274" x2="1188" y2="822"/><line class="net" x1="12" y1="548" x2="2365" y2="548"/></g></svg>';
  }

  /* ---------- Démarrage ---------- */
  const RENDERERS = {
    stats: renderStats, finder: initFinder, 'facilities-bento': renderBento, facilities: renderFacilities,
    'agenda-home': renderAgendaHome, 'events-cat': renderEventsCat, 'news-home': renderNewsHome, 'news-filtered': renderNewsFiltered,
    rates: renderRates, 'rates-cat': renderRatesCat, documents: renderDocs, faq: renderFaq, planning: renderPlanning,
    coach: renderCoach, team: renderTeam, gallery: renderGallery, 'sponsors-marquee': renderMarquee,
    sponsors: renderSponsors, packs: renderPacks, hours: renderHours,
    reviews: renderReviews, 'reviews-summary': renderReviewsSummary
  };
  async function boot() {
    initTheme(); initHeader(); initLightbox(); initScrollButton(); initMobileUI(); initFramedPreview();
    const c = await store.load();
    CONTENT = c;
    bindSettings(c); renderAnnounce(c); renderMinPrices(c);
    $$('[data-render]').forEach((el) => { const fn = RENDERERS[el.dataset.render]; if (fn) { try { fn(c, el); } catch (e) { console.error('[USM] rendu', el.dataset.render, e); } } });
    renderAgendaFull(c); renderNewsList(c); renderArticle(c);
    initForms(); initMap(c); initWeather(c);
    if (store.isLocal && !document.documentElement.hasAttribute('data-no-flag')) {
      document.body.classList.add('has-flag');
      document.body.insertAdjacentHTML('beforeend', `<a class="preview-flag" href="${url('admin/index.html')}"><i aria-hidden="true"></i>Aperçu local · Ouvrir l'admin</a>`);
    }
    window.addEventListener('hashchange', () => { if ($('[data-render="article"]')) renderArticle(c); });
    window.addEventListener('storage', (e) => { if (e.key === 'usm_v2_content_ping') location.reload(); });
    document.documentElement.classList.add('is-ready');
  }
  USM.util = { esc, md, pic, url, icon, fmtDate, euro, CATS, SURF };
  if (!document.documentElement.hasAttribute('data-admin')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();

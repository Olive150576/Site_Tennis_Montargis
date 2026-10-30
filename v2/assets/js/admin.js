/* =====================================================================
   USM Tennis Montargis — panneau d'administration
   Application monopage : routes #/tableau, #/actualites, #/actualites/<id>…
   ===================================================================== */
(function () {
  'use strict';
  const store = USM.store;
  const U = USM.util;
  const esc = U.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = document.getElementById('app');
  const icon = (id, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 70);
  const fmtDate = (s) => (s ? U.fmtDate(s) : '—');
  const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
  const imgUrl = (im) => (im ? U.url(im.sm || im.src) : '');

  let C = null;          // contenu courant
  let dirty = false;     // modifications non enregistrées dans l'éditeur ouvert
  let current = null;    // contrôleur de la vue ouverte

  /* =====================================================================
     Interface : toasts, modales
     ===================================================================== */
  function toast(msg, type = 'ok') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + type;
    t.innerHTML = (type === 'ok' ? icon('check') : icon('info')) + `<span>${esc(msg)}</span>`;
    box.appendChild(t); setTimeout(() => t.remove(), type === 'err' ? 6000 : 2800);
  }
  function modal({ title, body = '', confirm = 'Confirmer', cancel = 'Annuler', danger = false, html = '' }) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'modal-back';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdl-t"><h2 id="mdl-t">${esc(title)}</h2>${body ? `<p class="muted">${esc(body)}</p>` : ''}${html}
        <div class="acts">${cancel ? `<button type="button" class="btn" data-a="0">${esc(cancel)}</button>` : ''}<button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-a="1">${esc(confirm)}</button></div></div>`;
      document.body.appendChild(back);
      const done = (v) => { back.remove(); document.removeEventListener('keydown', key); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', key);
      back.addEventListener('click', (e) => { if (e.target === back) done(false); const b = e.target.closest('[data-a]'); if (b) done(b.dataset.a === '1' ? (html ? back : true) : false); });
      setTimeout(() => { const f = $('input', back) || $('[data-a="1"]', back); f && f.focus(); }, 30);
    });
  }
  const confirmLeave = () => (!dirty ? Promise.resolve(true) : modal({ title: 'Modifications non enregistrées', body: 'Si vous quittez cette page, vos changements seront perdus.', confirm: 'Quitter sans enregistrer', danger: true }));
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* =====================================================================
     Schémas des contenus
     ===================================================================== */
  const NEWS_CATS = [['vie-du-club', 'Vie du club'], ['competition', 'Compétition'], ['ecole', 'École de tennis'], ['evenement', 'Événement']];
  const EVENT_CATS = [['tournoi', 'Tournoi'], ['animation', 'Animation'], ['competition', 'Compétition'], ['stage', 'Stage']];
  const RATE_CATS = [['adultes', 'Adultes'], ['jeunes', 'Jeunes'], ['licences', 'Licences'], ['cours', 'Cours'], ['ete', 'Été & stages']];
  const SURFACES = [['terre-battue', 'Terre battue'], ['couvert', 'Couvert'], ['beton-poreux', 'Béton poreux'], ['club-house', 'Club house'], ['mur', 'Mur']];
  const DAYS = [['1', 'Lundi'], ['2', 'Mardi'], ['3', 'Mercredi'], ['4', 'Jeudi'], ['5', 'Vendredi'], ['6', 'Samedi']];
  const label = (opts, v) => (opts.find((o) => o[0] === String(v)) || [0, v || '—'])[1];
  const SHOP_STATUS = [['brouillon', 'Brouillon'], ['ouverte', 'Ouverte'], ['commandee', 'Commandée'], ['disponible', 'Disponible au club'], ['terminee', 'Terminée'], ['annulee', 'Annulée']];
  const isoIn = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const euro = (n) => { n = Math.round((Number(n) || 0) * 100) / 100; return (n % 1 ? n.toFixed(2).replace('.', ',') : String(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + '\u00a0€'; };
  let SHOPSUM = {}; // compteurs et montants par produit (Store.shop.summary)
  async function loadShopSum() { try { SHOPSUM = await store.shop.summary(C.shopProducts || []); } catch (e) { console.warn('[USM] Boutique', e); SHOPSUM = {}; } }
  /* Même calcul que l'espace membre : pièces réservées, minimum, pièces manquantes */
  function shopProgress(p, sum) {
    sum = sum || SHOPSUM[p.id] || { total: 0, parTaille: {} };
    const min = Math.max(1, +p.minQty || 1), total = sum.total || 0;
    if (p.minMode === 'size') {
      const per = (p.sizes || []).map((sz) => ({ size: sz, n: (sum.parTaille || {})[store.shop.sizeKey(sz)] || 0 })).filter((x) => x.n).map((x) => Object.assign(x, { missing: Math.max(0, min - x.n) }));
      const missing = per.length ? per.reduce((n, x) => n + x.missing, 0) : min;
      return { total, min, missing, reached: per.length > 0 && missing === 0, per, bySize: true };
    }
    return { total, min, missing: Math.max(0, min - total), reached: total >= min, per: [], bySize: false };
  }
  const shopLate = (p) => p.status === 'ouverte' && p.deadline && p.deadline < todayISO();
  function shopPill(p) {
    const pr = shopProgress(p);
    let h = p.status === 'ouverte' ? (shopLate(p) ? '<span class="pill warn dot">Date limite passée</span>' : pr.reached ? '<span class="pill ok dot">Minimum atteint</span>' : '<span class="pill blue dot">Ouverte</span>')
      : ({ brouillon: '<span class="pill">Brouillon</span>', commandee: '<span class="pill blue">Commandée</span>', disponible: '<span class="pill ball">Disponible au club</span>', terminee: '<span class="pill">Terminée</span>', annulee: '<span class="pill err">Annulée</span>' })[p.status] || '';
    if (p.draft) h += ' <span class="pill warn">Masqué</span>';
    if (p.demo) h += ' <span class="pill">Exemple</span>';
    return h;
  }

  const SCHEMAS = {
    news: {
      title: 'Actualités', one: 'une actualité', icon: 'file', route: 'actualites', page: 'actualites.html',
      intro: 'Publiez les résultats, annonces et temps forts du club. Une actualité « à la une » apparaît en grand sur la page d\'accueil.',
      fields: [
        { k: 'title', t: 'text', l: 'Titre', req: true, max: 90 },
        { k: 'date', t: 'date', l: 'Date de publication', half: true },
        { k: 'category', t: 'select', l: 'Catégorie', opts: NEWS_CATS, half: true },
        { k: 'body', t: 'markdown', l: 'Texte de l\'article', hint: 'Une ligne vide = nouveau paragraphe. Commencez une ligne par « - » pour une liste.' },
        { k: 'excerpt', t: 'textarea', l: 'Résumé', max: 180, hint: 'Affiché sous le titre dans les cartes. Laissez vide pour le générer depuis le texte.' },
        { k: 'images', t: 'images', l: 'Photos', hint: 'La première photo sert de couverture. Formats JPG, PNG ou WebP, redimensionnés automatiquement.' },
        { k: 'featured', t: 'switch', l: 'Mettre à la une sur l\'accueil', half: true },
        { k: 'draft', t: 'switch', l: 'Brouillon (non visible sur le site)', half: true },
        { k: 'slug', t: 'slug', l: 'Adresse de la page', from: 'title', hint: 'Générée à partir du titre. Modifiez-la seulement si nécessaire.' }
      ],
      blank: () => ({ id: uid('n'), title: '', date: todayISO(), category: 'vie-du-club', body: '', excerpt: '', images: [], featured: false, draft: false, slug: '' }),
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      columns: [
        { h: '', w: 70, r: (x) => thumb((x.images || [])[0]) },
        { h: 'Titre', r: (x) => `<div class="title">${esc(x.title || 'Sans titre')}</div><div class="sub">${esc((x.excerpt || '').slice(0, 90))}</div>` },
        { h: 'Catégorie', cls: 'hide-sm', r: (x) => `<span class="pill blue">${esc(label(NEWS_CATS, x.category))}</span>` },
        { h: 'Date', cls: 'hide-sm', r: (x) => fmtDate(x.date) },
        { h: 'Statut', r: (x) => status(x) }
      ],
      filter: { k: 'category', opts: NEWS_CATS, l: 'Toutes les catégories' },
      search: (x) => x.title + ' ' + x.body,
      beforeSave: (x) => {
        if (!x.slug) x.slug = slugify(x.title);
        if (!x.excerpt) x.excerpt = excerptFrom(x.body);
        if (x.featured) C.news.forEach((n) => { if (n.id !== x.id) n.featured = false; });
        const dup = C.news.find((n) => n.id !== x.id && n.slug === x.slug);
        if (dup) x.slug = x.slug + '-' + x.id.slice(-4);
      },
      preview: (x) => `<div class="card preview-card"><div class="p-media">${(x.images || [])[0] ? `<img src="${imgUrl(x.images[0])}" alt="">` : icon('image')}</div>
        <div class="p-body"><div><span class="pill blue">${esc(label(NEWS_CATS, x.category))}</span> <span class="small muted">${fmtDate(x.date)}</span></div><h3>${esc(x.title || 'Titre de l\'actualité')}</h3><p>${esc(x.excerpt || excerptFrom(x.body) || 'Le résumé apparaîtra ici.')}</p></div></div>`,
      view: (x) => `actualite.html#${x.slug || slugify(x.title)}`
    },
    events: {
      title: 'Agenda', one: 'un événement', icon: 'calendar', route: 'agenda', page: 'agenda.html',
      intro: 'Les événements datés s\'affichent dans « Prochaines dates » avec un compte à rebours. Sans date, ils rejoignent « Les grands rendez-vous » de la saison.',
      fields: [
        { k: 'title', t: 'text', l: 'Nom de l\'événement', req: true },
        { k: 'category', t: 'select', l: 'Type', opts: EVENT_CATS, half: true },
        { k: 'location', t: 'text', l: 'Lieu', half: true, placeholder: 'Au club' },
        { k: 'dateStart', t: 'date', l: 'Date de début', half: true },
        { k: 'dateEnd', t: 'date', l: 'Date de fin (facultatif)', half: true },
        { k: 'time', t: 'text', l: 'Horaires', half: true, placeholder: '14 h – 17 h' },
        { k: 'when', t: 'text', l: 'Période (si pas de date)', half: true, placeholder: 'Chaque année en juin' },
        { k: 'summary', t: 'textarea', l: 'Résumé', max: 200, hint: 'Deux lignes affichées dans les cartes de l\'agenda.' },
        { k: 'body', t: 'markdown', l: 'Description complète' },
        { k: 'images', t: 'images', l: 'Visuels' },
        { k: 'link', t: 'url', l: 'Lien d\'inscription ou d\'information', placeholder: 'https://tenup.fft.fr/…' },
        { k: 'recurring', t: 'switch', l: 'Rendez-vous annuel', half: true },
        { k: 'featured', t: 'switch', l: 'Mettre en avant', half: true },
        { k: 'draft', t: 'switch', l: 'Brouillon (non visible)', half: true }
      ],
      blank: () => ({ id: uid('e'), title: '', category: 'animation', location: 'Au club', dateStart: '', dateEnd: '', time: '', when: '', summary: '', body: '', images: [], link: '', recurring: false, featured: false, draft: false }),
      sort: (a, b) => (b.dateStart || '0').localeCompare(a.dateStart || '0'),
      columns: [
        { h: '', w: 70, r: (x) => thumb((x.images || [])[0]) },
        { h: 'Événement', r: (x) => `<div class="title">${esc(x.title)}</div><div class="sub">${esc(x.location || '')}</div>` },
        { h: 'Quand', r: (x) => (x.dateStart ? `${fmtDate(x.dateStart)}${x.dateEnd ? ' → ' + fmtDate(x.dateEnd) : ''}` : `<span class="muted">${esc(x.when || 'Sans date')}</span>`) },
        { h: 'Type', cls: 'hide-sm', r: (x) => `<span class="pill">${esc(label(EVENT_CATS, x.category))}</span>` },
        { h: 'Statut', r: (x) => (x.draft ? '<span class="pill warn dot">Brouillon</span>' : x.dateStart && (x.dateEnd || x.dateStart) < todayISO() ? '<span class="pill">Passé</span>' : x.dateStart ? '<span class="pill ok dot">À venir</span>' : '<span class="pill blue">Annuel</span>') }
      ],
      filter: { k: 'category', opts: EVENT_CATS, l: 'Tous les types' },
      search: (x) => x.title + ' ' + x.summary,
      validate: (x) => (x.dateEnd && x.dateStart && x.dateEnd < x.dateStart ? 'La date de fin est avant la date de début.' : ''),
      view: (x) => `agenda.html#${x.id}`
    },
    rates: {
      title: 'Tarifs', one: 'une formule', icon: 'euro', route: 'tarifs', page: 'tarifs.html', ordered: true,
      intro: 'Chaque formule apparaît dans l\'onglet de sa catégorie sur la page Tarifs, dans l\'ordre ci-dessous (glissez-déposez pour réordonner). Le quiz « Trouver ma formule » s\'appuie sur les codes (AT1, JTC1…).',
      fields: [
        { k: 'title', t: 'text', l: 'Nom de la formule', req: true },
        { k: 'code', t: 'text', l: 'Code', half: true, hint: 'Ex. AT1, JTC2. Utilisé par le quiz.' },
        { k: 'category', t: 'select', l: 'Catégorie', opts: RATE_CATS, half: true },
        { k: 'price', t: 'number', l: 'Prix (€)', half: true, req: true },
        { k: 'unit', t: 'text', l: 'Unité', half: true, placeholder: '/ saison' },
        { k: 'licence', t: 'text', l: 'Mention licence', placeholder: 'Licence adulte incluse (33 €)' },
        { k: 'features', t: 'list', l: 'Ce qui est inclus', hint: 'Une ligne par avantage.' },
        { k: 'desc', t: 'textarea', l: 'Description (facultatif)' },
        { k: 'note', t: 'text', l: 'Note en bas de carte' },
        { k: 'featured', t: 'switch', l: 'Badge « Le plus choisi »', half: true },
        { k: 'draft', t: 'switch', l: 'Masquer du site', half: true }
      ],
      blank: () => ({ id: uid('r-'), title: '', code: '', category: 'adultes', price: 0, unit: '/ saison', licence: '', features: [], desc: '', note: '', featured: false, draft: false }),
      columns: [
        { h: 'Formule', r: (x) => `<div class="title">${esc(x.title)}</div><div class="sub">${esc(x.code || '')}</div>` },
        { h: 'Catégorie', r: (x) => `<span class="pill">${esc(label(RATE_CATS, x.category))}</span>` },
        { h: 'Prix', r: (x) => `<b class="num" style="font-size:20px">${U.euro(x.price)} €</b> <span class="sub">${esc(x.unit || '')}</span>` },
        { h: 'Statut', cls: 'hide-sm', r: (x) => (x.draft ? '<span class="pill warn dot">Masquée</span>' : x.featured ? '<span class="pill ball">Mise en avant</span>' : '<span class="pill ok dot">Visible</span>') }
      ],
      filter: { k: 'category', opts: RATE_CATS, l: 'Toutes les catégories' },
      search: (x) => x.title + ' ' + x.code
    },
    team: {
      title: 'Équipe', one: 'une personne', icon: 'users', route: 'equipe', page: 'le-club.html#equipe', ordered: true,
      intro: 'L\'enseignant principal s\'affiche en grand sur l\'accueil et la page Cours. Les membres du bureau avec un téléphone apparaissent dans les contacts directs.',
      fields: [
        { k: 'name', t: 'text', l: 'Nom', req: true, half: true },
        { k: 'role', t: 'text', l: 'Rôle', half: true, placeholder: 'Présidente, Trésorier…' },
        { k: 'group', t: 'select', l: 'Groupe', opts: [['coach', 'Enseignant'], ['bureau', 'Bureau']], half: true },
        { k: 'ranking', t: 'text', l: 'Classement (facultatif)', half: true, placeholder: '15/1' },
        { k: 'photo', t: 'image', l: 'Photo' },
        { k: 'quote', t: 'textarea', l: 'Citation (enseignant)' },
        { k: 'bio', t: 'textarea', l: 'Présentation' },
        { k: 'phone', t: 'text', l: 'Téléphone public', half: true },
        { k: 'email', t: 'text', l: 'E-mail public', half: true },
        { k: 'draft', t: 'switch', l: 'Masquer du site' }
      ],
      blank: () => ({ id: uid('t-'), name: '', role: '', group: 'bureau', ranking: '', photo: null, quote: '', bio: '', phone: '', email: '', draft: false }),
      columns: [
        { h: '', w: 60, r: (x) => (x.photo ? `<img class="thumb" style="width:42px;border-radius:50%" src="${imgUrl(x.photo)}" alt="">` : `<span class="thumb empty" style="width:42px;border-radius:50%">${esc((x.name || '?')[0])}</span>`) },
        { h: 'Nom', r: (x) => `<div class="title">${esc(x.name)}</div><div class="sub">${esc(x.role)}</div>` },
        { h: 'Groupe', r: (x) => `<span class="pill ${x.group === 'coach' ? 'blue' : ''}">${x.group === 'coach' ? 'Enseignant' : 'Bureau'}</span>` },
        { h: 'Contact', cls: 'hide-sm', r: (x) => esc(x.phone || x.email || '—') }
      ],
      search: (x) => x.name + ' ' + x.role
    },
    slots: {
      title: 'Planning des cours', one: 'un créneau', icon: 'clock', route: 'planning', page: 'ecole-de-tennis.html#planning',
      intro: 'Les créneaux alimentent le planning hebdomadaire de la page Cours (jaune = jeunes, bleu = adultes).',
      fields: [
        { k: 'audience', t: 'select', l: 'Public', opts: [['jeunes', 'École de tennis (jeunes)'], ['adultes', 'Adultes']], half: true },
        { k: 'day', t: 'select', l: 'Jour', opts: DAYS, half: true },
        { k: 'start', t: 'time', l: 'Début', half: true, req: true },
        { k: 'end', t: 'time', l: 'Fin', half: true, req: true },
        { k: 'label', t: 'text', l: 'Intitulé', placeholder: 'Cours collectifs adultes' }
      ],
      blank: () => ({ id: uid('s-'), audience: 'adultes', day: '1', start: '18:00', end: '19:30', label: '' }),
      sort: (a, b) => (+a.day - +b.day) || a.start.localeCompare(b.start),
      columns: [
        { h: 'Jour', r: (x) => `<b>${esc(label(DAYS, x.day))}</b>` },
        { h: 'Horaire', r: (x) => `${esc(x.start)} – ${esc(x.end)}` },
        { h: 'Public', r: (x) => `<span class="pill ${x.audience === 'jeunes' ? 'ball' : 'blue'}">${x.audience === 'jeunes' ? 'Jeunes' : 'Adultes'}</span>` },
        { h: 'Intitulé', cls: 'hide-sm', r: (x) => esc(x.label || '') }
      ],
      validate: (x) => (x.end <= x.start ? 'L\'heure de fin doit être après l\'heure de début.' : '')
    },
    facilities: {
      title: 'Installations', one: 'une installation', icon: 'court', route: 'installations', page: 'le-club.html#installations', ordered: true,
      intro: 'Les installations s\'affichent en mosaïque sur l\'accueil (les 5 premières) et en détail sur la page Le club.',
      fields: [
        { k: 'title', t: 'text', l: 'Nom', req: true, half: true },
        { k: 'surface', t: 'select', l: 'Type', opts: SURFACES, half: true },
        { k: 'count', t: 'text', l: 'Mention courte', placeholder: '2 courts', half: true },
        { k: 'desc', t: 'textarea', l: 'Description' },
        { k: 'images', t: 'images', l: 'Photos' },
        { k: 'draft', t: 'switch', l: 'Masquer du site' }
      ],
      blank: () => ({ id: uid('f-'), title: '', surface: 'beton-poreux', count: '', desc: '', images: [], draft: false }),
      columns: [
        { h: '', w: 70, r: (x) => thumb((x.images || [])[0]) },
        { h: 'Installation', r: (x) => `<div class="title">${esc(x.title)}</div><div class="sub">${esc(x.count || '')}</div>` },
        { h: 'Type', r: (x) => `<span class="pill">${esc(label(SURFACES, x.surface))}</span>` },
        { h: 'Photos', cls: 'hide-sm', r: (x) => (x.images || []).length }
      ]
    },
    sponsors: {
      title: 'Partenaires', one: 'un partenaire', icon: 'handshake', route: 'partenaires', page: 'partenaires.html', ordered: true,
      intro: 'Les logos défilent sur l\'accueil et sont présentés sur la page Partenaires. Préférez des logos sur fond blanc ou transparent.',
      fields: [
        { k: 'name', t: 'text', l: 'Nom', req: true, half: true },
        { k: 'desc', t: 'text', l: 'Activité', half: true, placeholder: 'Magasin de sport' },
        { k: 'logo', t: 'image', l: 'Logo' },
        { k: 'url', t: 'url', l: 'Site internet' },
        { k: 'perk', t: 'text', l: 'Avantage réservé aux membres', placeholder: '-10 % sur présentation de la carte' },
        { k: 'perkDetails', t: 'textarea', l: 'Comment en profiter (espace membre)', placeholder: 'Sur présentation de la carte de membre en caisse, hors promotions.' },
        { k: 'perkCode', t: 'text', l: 'Code promo (facultatif)', half: true },
        { k: 'perkUntil', t: 'date', l: 'Offre valable jusqu\'au', half: true },
        { k: 'tier', t: 'select', l: 'Niveau', opts: [['officiel', 'Partenaire officiel'], ['equipement', 'Équipementier'], ['institution', 'Institution'], ['soutien', 'Soutien']], half: true },
        { k: 'draft', t: 'switch', l: 'Masquer du site', half: true }
      ],
      blank: () => ({ id: uid('p-'), name: '', desc: '', logo: null, url: '', perk: '', tier: 'officiel', draft: false }),
      columns: [
        { h: '', w: 90, r: (x) => (x.logo ? `<img class="thumb" style="object-fit:contain;background:#fff;width:72px" src="${imgUrl(x.logo)}" alt="">` : '<span class="thumb empty" style="width:72px">Logo</span>') },
        { h: 'Partenaire', r: (x) => `<div class="title">${esc(x.name)}</div><div class="sub">${esc(x.desc || '')}</div>` },
        { h: 'Avantage membres', cls: 'hide-sm', r: (x) => esc(x.perk || '—') },
        { h: 'Statut', r: (x) => (x.draft ? '<span class="pill warn dot">Masqué</span>' : x.logo ? '<span class="pill ok dot">En ligne</span>' : '<span class="pill warn">Sans logo</span>') }
      ],
      search: (x) => x.name + ' ' + x.desc
    },
    sponsorPacks: {
      title: 'Offres partenaires', one: 'une offre', icon: 'sparkle', route: 'offres', page: 'partenaires.html#packs', ordered: true,
      intro: 'Les packs de sponsoring proposés sur la page Partenaires. Le pack « mis en avant » est affiché en bleu.',
      fields: [
        { k: 'name', t: 'text', l: 'Nom du pack', req: true },
        { k: 'price', t: 'text', l: 'Prix affiché', half: true, placeholder: '500 €, Sur devis…' },
        { k: 'period', t: 'text', l: 'Après le prix', half: true, placeholder: 'par saison' },
        { k: 'features', t: 'list', l: 'Contreparties' },
        { k: 'highlight', t: 'switch', l: 'Mettre en avant' }
      ],
      blank: () => ({ id: uid('k-'), name: '', price: '', period: 'par saison', features: [], highlight: false }),
      columns: [
        { h: 'Pack', r: (x) => `<div class="title">${esc(x.name)}</div><div class="sub">${(x.features || []).length} contreparties</div>` },
        { h: 'Prix', r: (x) => esc([x.price, x.price && x.period].filter(Boolean).join(' ')) },
        { h: '', r: (x) => (x.highlight ? '<span class="pill ball">Mis en avant</span>' : '') }
      ]
    },
    documents: {
      title: 'Documents', one: 'un document', icon: 'download', route: 'documents', page: 'tarifs.html#documents',
      intro: 'Formulaires et questionnaires téléchargeables depuis la page Tarifs. Pensez à mettre à jour le formulaire à chaque nouvelle saison.',
      fields: [
        { k: 'name', t: 'text', l: 'Nom affiché', req: true },
        { k: 'category', t: 'select', l: 'Type', opts: [['inscription', 'Formulaire d\'inscription'], ['sante', 'Questionnaire de santé'], ['autre', 'Autre']], half: true },
        { k: 'file', t: 'file', l: 'Fichier PDF' },
        { k: 'url', t: 'url', l: 'Ou adresse du fichier en ligne' }
      ],
      blank: () => ({ id: uid('d-'), name: '', category: 'autre', url: '', size: 0 }),
      columns: [
        { h: 'Document', r: (x) => `<div class="title">${esc(x.name)}</div><div class="sub">${x.size ? Math.round(x.size / 1024) + ' Ko' : ''}</div>` },
        { h: 'Type', r: (x) => `<span class="pill">${esc({ inscription: 'Inscription', sante: 'Santé', autre: 'Autre' }[x.category] || 'Autre')}</span>` },
        { h: 'Fichier', cls: 'hide-sm', r: (x) => (x.url ? '<span class="pill ok dot">Disponible</span>' : '<span class="pill err dot">Manquant</span>') }
      ]
    },
    faq: {
      title: 'Questions fréquentes', one: 'une question', icon: 'info', route: 'faq', page: 'tarifs.html#faq-title', ordered: true,
      intro: 'Les questions s\'affichent sur la page Tarifs et sont transmises à Google (données structurées FAQ).',
      fields: [
        { k: 'q', t: 'text', l: 'Question', req: true },
        { k: 'a', t: 'textarea', l: 'Réponse', req: true },
        { k: 'draft', t: 'switch', l: 'Masquer du site' }
      ],
      blank: () => ({ id: uid('q'), q: '', a: '', draft: false }),
      columns: [
        { h: 'Question', r: (x) => `<div class="title">${esc(x.q)}</div><div class="sub">${esc((x.a || '').slice(0, 110))}…</div>` },
        { h: 'Statut', cls: 'hide-sm', r: (x) => (x.draft ? '<span class="pill warn dot">Masquée</span>' : '<span class="pill ok dot">Visible</span>') }
      ],
      search: (x) => x.q + ' ' + x.a
    },
    shopProducts: {
      title: 'Boutique', one: 'un produit', icon: 'bag', route: 'boutique', page: 'espace-membre.html#boutique', ordered: true,
      intro: 'Commandes groupées présentées dans l\'espace membre. Le membre réserve sa taille, le compteur affiche les pièces manquantes, et vous passez la commande au fournisseur quand le minimum est atteint. Personne ne paie avant. « Suivi » donne les réservations, l\'export CSV et les boutons pour faire avancer la commande.',
      fields: [
        { k: 'name', t: 'text', l: 'Nom', req: true, placeholder: 'Veste de survêtement USM' },
        { k: 'desc', t: 'textarea', l: 'Description', hint: 'Matière, coupe, entretien. Une ligne par idée.' },
        { k: 'images', t: 'images', l: 'Photos', hint: 'La première sert de couverture. Une photo par couleur ? Écrivez la couleur dans la description de la photo : la fiche l\'affiche quand le membre choisit cette couleur.' },
        { k: 'priceMember', t: 'number', l: 'Prix membre (€)', req: true, half: true },
        { k: 'pricePublic', t: 'number', l: 'Prix public (€)', half: true, hint: 'Facultatif, affiché barré.' },
        { k: 'sizes', t: 'list', l: 'Tailles proposées', hint: 'Une taille par ligne : XS, S, M, L, XL, XXL, 3XL, 6 ans, 8 ans… ou « Taille unique ».' },
        { k: 'colors', t: 'list', l: 'Couleurs (facultatif)', hint: 'Laissez vide si le produit n\'existe qu\'en une couleur.' },
        { k: 'minQty', t: 'number', l: 'Minimum de pièces pour commander', req: true, half: true, hint: 'Quantité minimale exigée par le fournisseur.' },
        { k: 'minMode', t: 'select', l: 'Le minimum s\'applique', opts: [['total', 'Au total, toutes tailles confondues'], ['size', 'Par taille']], half: true },
        { k: 'maxPerMember', t: 'number', l: 'Maximum par membre', half: true, hint: 'Facultatif.' },
        { k: 'deadline', t: 'date', l: 'Date limite de réservation', req: true, half: true },
        { k: 'deliveryDate', t: 'date', l: 'Date de livraison estimée', half: true },
        { k: 'marking', t: 'switch', l: 'Marquage possible (prénom ou initiales, 12 caractères)', half: true },
        { k: 'markingPrice', t: 'number', l: 'Supplément marquage (€ par pièce)', half: true },
        { k: 'sizeGuide', t: 'image', l: 'Guide des tailles en image (facultatif)' },
        { k: 'sizeGuideText', t: 'textarea', l: 'Ou guide des tailles en tableau', placeholder: 'Taille | Tour de poitrine\nS | 88-96 cm\nM | 96-104 cm', hint: 'Une ligne par taille, colonnes séparées par « | ». La première ligne donne les titres.' },
        { k: 'partner', t: 'select', l: 'Floqué avec le partenaire (facultatif)', get opts() { return [['', 'Aucun']].concat((C.sponsors || []).filter((x) => !x.draft && x.name).map((x) => [x.id, x.name])); }, hint: 'Le logo s\'affiche sur la fiche, avec un lien vers son avantage membre.' },
        { k: 'payUrl', t: 'url', l: 'Lien de paiement (HelloAsso ou autre)', placeholder: 'https://www.helloasso.com/…', hint: 'Affiché aux membres seulement quand la commande passe en « Commandée ». Laissez vide pour un règlement au club.' },
        { k: 'supplier', t: 'text', l: 'Fournisseur', half: true, hint: 'Visible dans l\'admin seulement.' },
        { k: 'supplierRef', t: 'text', l: 'Référence fournisseur', half: true, hint: 'Visible dans l\'admin seulement.' },
        { k: 'status', t: 'select', l: 'Statut', opts: SHOP_STATUS, half: true, hint: '« Minimum atteint » est calculé tout seul. Pour prévenir les membres d\'un changement, utilisez les boutons de « Suivi ».' },
        { k: 'draft', t: 'switch', l: 'Masquer de l\'espace membre', half: true }
      ],
      blank: () => ({ id: uid('sp-'), name: '', desc: '', images: [], priceMember: null, pricePublic: null, sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: [], minQty: 10, minMode: 'total', maxPerMember: null,
        deadline: isoIn(21), deliveryDate: '', marking: false, markingPrice: 5, sizeGuide: null, sizeGuideText: '', partner: '', payUrl: '', supplier: '', supplierRef: '', status: 'brouillon', draft: false }),
      columns: [
        { h: '', w: 70, r: (x) => thumb((x.images || [])[0]) },
        { h: 'Produit', r: (x) => `<div class="title">${esc(x.name || 'Sans nom')}</div><div class="sub">${euro(x.priceMember)} membre${x.pricePublic ? ' · ' + euro(x.pricePublic) + ' public' : ''}</div>` },
        { h: 'Compteur', r: (x) => { const pr = shopProgress(x); return `<b class="num">${pr.total}</b> <span class="sub">/ ${pr.min}${pr.bySize ? ' par taille' : ''}</span><div class="sub">${pr.reached ? 'Objectif atteint' : 'il en manque ' + pr.missing}</div>`; } },
        { h: 'Date limite', cls: 'hide-sm', r: (x) => fmtDate(x.deadline) },
        { h: 'Statut', r: (x) => shopPill(x) },
        { h: '', w: 90, r: (x) => `<a class="btn btn-sm" href="#/boutique/${esc(x.id)}/suivi">Suivi</a>` }
      ],
      search: (x) => x.name + ' ' + (x.desc || ''),
      validate: (x) => {
        if (!(+x.priceMember > 0)) return 'Indiquez le prix membre.';
        if (!(+x.minQty >= 1)) return 'Le minimum de pièces doit être d\'au moins 1.';
        if (x.marking && !(+x.markingPrice >= 0)) return 'Indiquez le supplément du marquage (0 si gratuit).';
        if (x.status === 'ouverte' && x.deadline < todayISO()) return 'La date limite est passée : choisissez une date à venir pour ouvrir les réservations.';
        if (x.deliveryDate && x.deadline && x.deliveryDate < x.deadline) return 'La livraison estimée est avant la date limite.';
        return '';
      },
      beforeSave: (x) => {
        if (!(x.sizes || []).length) x.sizes = ['Taille unique'];
        x.deadlineTs = new Date(x.deadline + 'T23:59:59').getTime(); // utilisé par les règles Firebase
        if (!x.marking) x.markingPrice = x.markingPrice || 0;
        delete x._demo;
      },
      afterSave: async (x, before) => { if (before && before.status !== x.status) { try { await store.shop.setStatus(x, x.status); } catch (e) { toast('Statut des réservations non mis à jour : ' + e.message, 'err'); } } },
      actions: (x) => `<a class="btn" href="#/boutique/${esc(x.id)}/suivi">${icon('users')} Suivi des réservations</a>`,
      preview: (x) => `<div class="card preview-card"><div class="p-media" style="background:#eef1f8">${(x.images || [])[0] ? `<img src="${imgUrl(x.images[0])}" alt="" style="object-fit:contain">` : icon('bag')}</div>
        <div class="p-body"><div>${shopPill(x)}</div><h3>${esc(x.name || 'Nom du produit')}</h3><p><b>${euro(x.priceMember)}</b>${x.pricePublic ? ` <s class="muted">${euro(x.pricePublic)}</s>` : ''} · minimum ${esc(x.minQty || '?')} pièces${x.minMode === 'size' ? ' par taille' : ''}</p><p class="small muted">Réservations jusqu'au ${fmtDate(x.deadline)}</p></div></div>`,
      view: () => 'espace-membre.html#boutique',
      statusPill: (x) => shopPill(x)
    },
    reviews: {
      title: 'Avis', one: 'un avis', icon: 'star', route: 'avis', page: 'index.html#avis-title', ordered: true,
      intro: 'Citations d\'avis réels (Google, Facebook…) affichées sur l\'accueil (les 6 premiers) et, pour le thème « École de tennis », sur la page Cours. Recopiez le texte d\'origine sans le réécrire. La note globale et le lien vers la fiche Google se règlent dans Paramètres › Avis Google.',
      fields: [
        { k: 'author', t: 'text', l: 'Auteur', req: true, half: true, placeholder: 'Prénom + initiale : Sandrine F.' },
        { k: 'rating', t: 'select', l: 'Note', opts: [['5', '★★★★★ 5/5'], ['4', '★★★★ 4/5'], ['3', '★★★ 3/5']], half: true },
        { k: 'text', t: 'textarea', l: 'Texte de l\'avis', req: true, max: 220, hint: 'Les avis courts et concrets (accueil, enfants, courts) fonctionnent le mieux. Au-delà de 220 caractères, coupez avec « … ».' },
        { k: 'topic', t: 'select', l: 'Thème', opts: [['club', 'Le club (général)'], ['ecole', 'École de tennis / enfants'], ['competition', 'Compétition']], half: true },
        { k: 'source', t: 'select', l: 'Source', opts: [['Google', 'Google'], ['Facebook', 'Facebook'], ['membre', 'Témoignage de membre']], half: true },
        { k: 'when', t: 'text', l: 'Année de l\'avis', half: true, placeholder: '2026', hint: 'Pour mémoire (non affichée sur le site).' },
        { k: 'draft', t: 'switch', l: 'Masquer du site', half: true }
      ],
      blank: () => ({ id: uid('r'), author: '', rating: '5', text: '', topic: 'club', source: 'Google', when: String(new Date().getFullYear()), draft: false }),
      columns: [
        { h: 'Avis', r: (x) => `<div class="title">« ${esc((x.text || '').slice(0, 90))}${(x.text || '').length > 90 ? '…' : ''} »</div><div class="sub">${esc(x.author || '')} · ${esc(x.source || 'Google')}${x.when ? ' · ' + esc(x.when) : ''}</div>` },
        { h: 'Note', r: (x) => `<span class="pill ball">${esc(x.rating || '5')} ★</span>` },
        { h: 'Thème', cls: 'hide-sm', r: (x) => `<span class="pill">${esc({ club: 'Club', ecole: 'École', competition: 'Compétition' }[x.topic] || 'Club')}</span>` },
        { h: 'Statut', cls: 'hide-sm', r: (x) => (x.draft ? '<span class="pill warn dot">Masqué</span>' : '<span class="pill ok dot">Visible</span>') }
      ],
      search: (x) => x.author + ' ' + x.text
    }
  };
  const ROUTES = {}; Object.entries(SCHEMAS).forEach(([k, s]) => { ROUTES[s.route] = k; });

  function thumb(im) { return im ? `<img class="thumb" src="${imgUrl(im)}" alt="" loading="lazy">` : `<span class="thumb empty">${icon('image')}</span>`; }
  function status(x) {
    if (x.draft) return '<span class="pill warn dot">Brouillon</span>';
    if (x.date && x.date > todayISO()) return '<span class="pill blue dot">Programmée</span>';
    return `<span class="pill ok dot">Publiée</span>${x.featured ? ' <span class="pill ball">À la une</span>' : ''}`;
  }
  function excerptFrom(body) {
    const t = String(body || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim();
    return t.length <= 170 ? t : t.slice(0, 170).replace(/\s+\S*$/, '') + '…';
  }

  /* =====================================================================
     Champs de formulaire
     ===================================================================== */
  function fieldHTML(f, v, id) {
    const cls = `field ${f.half ? 'half' : ''}`;
    const lab = `<label for="${id}">${esc(f.l)}${f.req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
    const hint = f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    const val = v == null ? '' : v;
    switch (f.t) {
      case 'text': case 'url': case 'slug':
        return `<div class="${cls}" data-f="${f.k}">${lab}<input type="${f.t === 'url' ? 'url' : 'text'}" id="${id}" value="${esc(val)}"${ph}${f.req ? ' required' : ''}${f.max ? ` maxlength="${f.max + 40}"` : ''}>${f.max ? `<div class="counter" data-for="${id}"></div>` : ''}${hint}</div>`;
      case 'number':
        return `<div class="${cls}" data-f="${f.k}">${lab}<input type="number" inputmode="decimal" min="0" step="0.5" id="${id}" value="${esc(val)}"${f.req ? ' required' : ''}>${hint}</div>`;
      case 'date': case 'time':
        return `<div class="${cls}" data-f="${f.k}">${lab}<input type="${f.t}" id="${id}" value="${esc(val)}"${f.req ? ' required' : ''}>${hint}</div>`;
      case 'textarea':
        return `<div class="${cls}" data-f="${f.k}">${lab}<textarea id="${id}"${ph}${f.req ? ' required' : ''}>${esc(val)}</textarea>${f.max ? `<div class="counter" data-for="${id}"></div>` : ''}${hint}</div>`;
      case 'markdown':
        return `<div class="${cls}" data-f="${f.k}">${lab}<div class="md-tools" role="toolbar" aria-label="Mise en forme">
          <button type="button" class="btn btn-ghost" data-md="bold" title="Gras"><b>G</b></button>
          <button type="button" class="btn btn-ghost" data-md="list" title="Liste">${icon('menu')} Liste</button>
          <button type="button" class="btn btn-ghost" data-md="link" title="Lien">${icon('link')} Lien</button>
          <span style="flex:1"></span><button type="button" class="btn btn-ghost" data-md="preview">${icon('eye')} Aperçu</button></div>
          <textarea id="${id}" class="tall">${esc(val)}</textarea><div class="md-preview" hidden></div>${hint}</div>`;
      case 'select':
        return `<div class="${cls}" data-f="${f.k}">${lab}<select id="${id}">${f.opts.map(([k, l]) => `<option value="${esc(k)}"${String(val) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
      case 'switch':
        return `<div class="${cls}" data-f="${f.k}"><label class="switch"><input type="checkbox" id="${id}"${val ? ' checked' : ''}><span class="track"></span><span>${esc(f.l)}</span></label>${hint}</div>`;
      case 'list':
        return `<div class="${cls}" data-f="${f.k}"><span class="label">${esc(f.l)}</span><div class="list-edit" id="${id}"></div>${hint}</div>`;
      case 'images': case 'image':
        return `<div class="${cls}" data-f="${f.k}"><span class="label">${esc(f.l)}</span><div class="images" id="${id}"></div>${hint}</div>`;
      case 'file':
        return `<div class="${cls}" data-f="${f.k}"><span class="label">${esc(f.l)}</span><label class="dropzone" style="min-height:90px">${icon('upload')}<span>Choisir un PDF (ou glisser-déposer)</span><input type="file" accept="application/pdf" class="sr-only" id="${id}"></label>${hint}</div>`;
      default: return '';
    }
  }

  /* Formulaire générique : rend les champs, garde l'état des champs complexes */
  function Form(root, fields, item, onChange) {
    const state = clone(item);
    const idp = 'f' + Math.random().toString(36).slice(2, 6);
    root.innerHTML = `<div class="fields">${fields.map((f) => fieldHTML(f, state[f.k], `${idp}-${f.k}`)).join('')}</div>`;
    const change = () => { onChange && onChange(collect()); };

    fields.forEach((f) => {
      const el = document.getElementById(`${idp}-${f.k}`);
      if (!el) return;
      if (f.t === 'list') drawList(f, el);
      else if (f.t === 'images' || f.t === 'image') drawImages(f, el);
      else if (f.t === 'file') bindFile(f, el);
      else el.addEventListener('input', change);
      if (f.t === 'markdown') bindMarkdown(el, change);
      if (f.max) { const upd = () => { const cnt = $(`.counter[data-for="${el.id}"]`, root); const n = el.value.length; cnt.textContent = `${n} / ${f.max}`; cnt.classList.toggle('over', n > f.max); }; upd(); el.addEventListener('input', upd); }
      if (f.t === 'slug') {
        const src = document.getElementById(`${idp}-${f.from}`);
        let manual = !!state[f.k] && state[f.k] !== slugify(state[f.from]);
        el.addEventListener('input', () => { manual = true; });
        src && src.addEventListener('input', () => { if (!manual) { el.value = slugify(src.value); change(); } });
      }
    });

    function drawList(f, el) {
      const arr = state[f.k] = Array.isArray(state[f.k]) ? state[f.k] : [];
      el.innerHTML = arr.map((v, i) => `<div class="li"><input type="text" value="${esc(v)}" data-i="${i}" aria-label="${esc(f.l)} ${i + 1}"><button type="button" class="btn btn-icon btn-ghost" data-up="${i}" title="Monter" ${i ? '' : 'disabled'}>${icon('chevron-up')}</button><button type="button" class="btn btn-icon btn-ghost btn-danger" data-del="${i}" title="Supprimer">${icon('trash')}</button></div>`).join('') +
        `<div><button type="button" class="btn btn-sm" data-add>${icon('plus')} Ajouter une ligne</button></div>`;
      $$('input', el).forEach((inp) => inp.addEventListener('input', () => { arr[+inp.dataset.i] = inp.value; change(); }));
      $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => { arr.splice(+b.dataset.del, 1); drawList(f, el); change(); }));
      $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.up; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; drawList(f, el); change(); }));
      $('[data-add]', el).addEventListener('click', () => { arr.push(''); drawList(f, el); const ins = $$('input', el); ins[ins.length - 1].focus(); change(); });
    }

    function drawImages(f, el) {
      const single = f.t === 'image';
      let arr = single ? (state[f.k] ? [state[f.k]] : []) : (state[f.k] = Array.isArray(state[f.k]) ? state[f.k] : []);
      const commit = () => { if (single) state[f.k] = arr[0] || null; else state[f.k] = arr; change(); };
      el.innerHTML = arr.map((im, i) => `<div class="img-item">${i === 0 && !single && arr.length > 1 ? '<span class="pill ball cover">Couverture</span>' : ''}<img src="${imgUrl(im)}" alt="">
          <div class="img-tools">${!single && i > 0 ? `<button type="button" class="mv" data-first="${i}" title="Utiliser en couverture">${icon('star')}</button>` : ''}<button type="button" data-rm="${i}" title="Retirer l'image">${icon('trash')}</button></div>
          <input type="text" value="${esc(im.alt || '')}" data-alt="${i}" placeholder="Description (accessibilité, SEO)" aria-label="Description de l'image ${i + 1}"></div>`).join('') +
        (single && arr.length ? '' : `<label class="dropzone">${icon('upload')}<span>${single ? 'Choisir une image' : 'Ajouter des photos'}<br><span class="muted">ou glisser-déposer</span></span><input type="file" accept="image/*" class="sr-only" ${single ? '' : 'multiple'}></label>`);
      $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { arr.splice(+b.dataset.rm, 1); commit(); drawImages(f, el); }));
      $$('[data-first]', el).forEach((b) => b.addEventListener('click', () => { const [x] = arr.splice(+b.dataset.first, 1); arr.unshift(x); commit(); drawImages(f, el); }));
      $$('[data-alt]', el).forEach((inp) => inp.addEventListener('input', () => { arr[+inp.dataset.alt].alt = inp.value; commit(); }));
      const dz = $('.dropzone', el);
      if (!dz) return;
      const input = $('input[type=file]', dz);
      const handle = async (files) => {
        files = Array.from(files).filter((x) => /^image\//.test(x.type));
        if (!files.length) return;
        dz.classList.add('busy'); dz.querySelector('span').innerHTML = '<span class="spinner"></span> Optimisation des images…';
        try {
          for (const file of files) {
            if (file.size > 15 * 1024 * 1024) { toast(`${file.name} dépasse 15 Mo.`, 'err'); continue; }
            const im = await store.uploadImage(file);
            im.alt = f.k === 'logo' ? (state.name || '') : (state.title || state.name || '');
            arr.push(im); if (single) break;
          }
          commit();
        } catch (e) { toast('Import impossible : ' + e.message, 'err'); }
        drawImages(f, el);
      };
      input.addEventListener('change', () => handle(input.files));
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); handle(e.dataTransfer.files); });
    }

    function bindFile(f, input) {
      const dz = input.closest('.dropzone');
      const show = () => { dz.querySelector('span').innerHTML = state.url ? `${icon('check')} Fichier en place${state.size ? ' (' + Math.round(state.size / 1024) + ' Ko)' : ''} — cliquer pour remplacer` : 'Choisir un PDF (ou glisser-déposer)'; };
      show();
      const handle = async (file) => {
        if (!file) return;
        dz.classList.add('busy'); dz.querySelector('span').innerHTML = '<span class="spinner"></span> Envoi…';
        try { const r = await store.uploadFile(file); state.url = r.url; state.size = r.size; if (!state.name) { state.name = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '); const n = $('[data-f="name"] input', root); if (n) n.value = state.name; } const u = $('[data-f="url"] input', root); if (u) u.value = r.url.startsWith('data:') ? '' : r.url; change(); }
        catch (e) { toast(e.message, 'err'); }
        dz.classList.remove('busy'); show();
      };
      input.addEventListener('change', () => handle(input.files[0]));
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); handle(e.dataTransfer.files[0]); });
    }

    function bindMarkdown(ta, onChange) {
      const wrap = ta.closest('.field'); const pv = $('.md-preview', wrap);
      const surround = (before, after, ph) => {
        const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
        ta.setRangeText(before + sel + after, s, e, 'end'); ta.focus(); onChange();
      };
      $$('[data-md]', wrap).forEach((b) => b.addEventListener('click', async () => {
        const a = b.dataset.md;
        if (a === 'bold') surround('**', '**', 'texte en gras');
        if (a === 'list') { const s = ta.selectionStart; const start = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setRangeText('- ', start, start, 'end'); ta.focus(); onChange(); }
        if (a === 'link') {
          const m = await modal({ title: 'Insérer un lien', confirm: 'Insérer', html: `<div class="field"><label for="lk-url">Adresse</label><input type="url" id="lk-url" placeholder="https://…"></div><div class="field"><label for="lk-txt">Texte du lien</label><input type="text" id="lk-txt" value="${esc(ta.value.slice(ta.selectionStart, ta.selectionEnd))}"></div>` });
          if (m) { const u = $('#lk-url', m).value.trim(), t = $('#lk-txt', m).value.trim() || u; if (u) { ta.setRangeText(`[${t}](${u})`, ta.selectionStart, ta.selectionEnd, 'end'); onChange(); } }
        }
        if (a === 'preview') { pv.hidden = !pv.hidden; b.classList.toggle('btn-primary', !pv.hidden); if (!pv.hidden) pv.innerHTML = U.md(ta.value) || '<p class="muted">Rien à afficher.</p>'; }
      }));
      ta.addEventListener('input', () => { if (!pv.hidden) pv.innerHTML = U.md(ta.value); });
    }

    function collect() {
      fields.forEach((f) => {
        const el = document.getElementById(`${idp}-${f.k}`);
        if (!el || ['list', 'images', 'image', 'file'].includes(f.t)) return;
        if (f.t === 'switch') state[f.k] = el.checked;
        else if (f.t === 'number') state[f.k] = el.value === '' ? null : Number(el.value);
        else state[f.k] = el.value.trim ? el.value.trim() : el.value;
      });
      fields.filter((f) => f.t === 'list').forEach((f) => { state[f.k] = (state[f.k] || []).map((x) => x.trim()).filter(Boolean); });
      return state;
    }
    function validate() {
      let ok = true;
      fields.forEach((f) => {
        const w = $(`[data-f="${f.k}"]`, root); if (!w) return;
        const bad = f.req && (state[f.k] == null || state[f.k] === '');
        w.classList.toggle('invalid', bad); if (bad && ok) { ok = false; const i = $('input,textarea', w); i && i.focus(); }
      });
      return ok;
    }
    return { collect, validate, state };
  }

  /* =====================================================================
     Vues
     ===================================================================== */
  const NAV = [
    { r: 'tableau', l: 'Tableau de bord', i: 'home' },
    { g: 'Contenus' },
    { r: 'actualites', l: 'Actualités', i: 'file', c: 'news' },
    { r: 'agenda', l: 'Agenda', i: 'calendar', c: 'events' },
    { r: 'tarifs', l: 'Tarifs', i: 'euro', c: 'rates' },
    { r: 'planning', l: 'Planning des cours', i: 'clock', c: 'slots' },
    { r: 'equipe', l: 'Équipe', i: 'users', c: 'team' },
    { r: 'installations', l: 'Installations', i: 'court', c: 'facilities' },
    { r: 'galerie', l: 'Galerie photos', i: 'image', c: 'gallery' },
    { r: 'documents', l: 'Documents', i: 'download', c: 'documents' },
    { r: 'faq', l: 'Questions fréquentes', i: 'info', c: 'faq' },
    { r: 'avis', l: 'Avis', i: 'star', c: 'reviews' },
    { g: 'Partenaires' },
    { r: 'partenaires', l: 'Partenaires', i: 'handshake', c: 'sponsors' },
    { r: 'offres', l: 'Offres de sponsoring', i: 'sparkle', c: 'sponsorPacks' },
    { g: 'Boutique' },
    { r: 'boutique', l: 'Commandes groupées', i: 'bag', c: 'shopProducts' },
    { g: 'Site' },
    { r: 'messages', l: 'Messages', i: 'mail' },
    { r: 'textes', l: 'Textes des pages', i: 'edit' },
    { r: 'reglages', l: 'Paramètres', i: 'settings' },
    { r: 'sauvegarde', l: 'Sauvegarde', i: 'shield' }
  ];

  function shell(title, crumb, actions = '') {
    const r = (location.hash.slice(2).split('/')[0]) || 'tableau';
    const unread = (C.messages || []).filter((m) => !m.read).length;
    app.innerHTML = `<div class="shell">
      <aside class="side" id="side" aria-label="Menu d'administration">
        <a class="brand" href="#/tableau"><img src="../assets/img/brand/logo-usm.webp" alt=""><span><b>USM Tennis</b><span>Administration</span></span></a>
        <nav>${NAV.map((n) => n.g ? `<div class="group">${n.g}</div>` : `<a class="nav" href="#/${n.r}"${n.r === r ? ' aria-current="page"' : ''}>${icon(n.i)}<span>${n.l}</span>${n.r === 'messages' && unread ? `<span class="badge">${unread}</span>` : n.c && C[n.c] ? `<span class="count">${C[n.c].length}</span>` : ''}</a>`).join('')}</nav>
        <div class="side-foot">
          <div class="mode ${store.isLocal ? '' : 'live'}"><i></i>${store.isLocal ? 'Mode aperçu (ce navigateur)' : 'En ligne · Firebase'}</div>
          <a href="../index.html" target="_blank" rel="noopener">${icon('external')} Voir le site</a>
          <button type="button" id="theme-btn">${icon('moon')} Thème clair / sombre</button>
          <button type="button" id="logout">${icon('logout')} Se déconnecter</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button type="button" class="btn btn-icon btn-ghost menu-btn" id="menu-btn" aria-label="Ouvrir le menu">${icon('menu')}</button>
          <div>${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1>${esc(title)}</h1></div>
          <div class="actions">${actions}</div>
        </header>
        <div class="content" id="view"></div>
      </div></div>`;
    $('#logout').addEventListener('click', async () => { if (!(await confirmLeave())) return; dirty = false; await store.logout(); renderLogin(); });
    $('#theme-btn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('usm_admin_theme', next); } catch (e) { /* ignore */ }
    });
    const side = $('#side');
    $('#menu-btn').addEventListener('click', () => {
      side.classList.add('open');
      const bd = document.createElement('div'); bd.className = 'side-backdrop'; document.body.appendChild(bd);
      const close = () => { side.classList.remove('open'); bd.remove(); };
      bd.addEventListener('click', close); $$('a', side).forEach((a) => a.addEventListener('click', close, { once: true }));
    });
    return $('#view');
  }

  /* ---------- Tableau de bord ---------- */
  function viewDashboard() {
    const v = shell('Tableau de bord', '', `<a class="btn btn-primary" href="#/actualites/nouveau">${icon('plus')} Nouvelle actualité</a>`);
    const t = todayISO();
    const news = C.news || [];
    const pub = news.filter((n) => !n.draft);
    const drafts = news.filter((n) => n.draft);
    const up = (C.events || []).filter((e) => !e.draft && e.dateStart && (e.dateEnd || e.dateStart) >= t).sort((a, b) => a.dateStart.localeCompare(b.dateStart));
    const unread = (C.messages || []).filter((m) => !m.read);
    const last = pub.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const daysSince = last ? Math.round((new Date(t) - new Date(last.date)) / 86400000) : null;
    const hour = new Date().getHours();

    const checks = [];
    const ann = C.settings.announcement || {};
    if (ann.enabled) {
      const m = (ann.link || '').match(/#(e-[\w-]+)/);
      const ev = m && C.events.find((e) => e.id === m[1]);
      if (ev && ev.dateStart && (ev.dateEnd || ev.dateStart) < t) checks.push(['err', 'Le bandeau d\'annonce renvoie vers un événement terminé.', '#/reglages', 'Modifier']);
      else checks.push(['ok', `Bandeau d'annonce actif : « ${ann.text} »`, '#/reglages', 'Modifier']);
    } else checks.push(['warn', 'Aucun bandeau d\'annonce actif en haut du site.', '#/reglages', 'Activer']);
    if (daysSince != null && daysSince > 21) checks.push(['warn', `Dernière actualité publiée il y a ${daysSince} jours. Un site vivant rassure les visiteurs.`, '#/actualites/nouveau', 'Publier']);
    const noImg = pub.filter((n) => !(n.images || []).length).length;
    if (noImg) checks.push(['warn', `${noImg} actualité(s) sans photo.`, '#/actualites', 'Voir']);
    const pastFeat = (C.events || []).filter((e) => e.featured && e.dateStart && (e.dateEnd || e.dateStart) < t);
    if (pastFeat.length) checks.push(['warn', `${pastFeat.length} événement(s) passé(s) encore mis en avant.`, '#/agenda', 'Voir']);
    if (!up.length) checks.push(['warn', 'Aucun événement daté à venir dans l\'agenda.', '#/agenda/nouveau', 'Ajouter']);
    const noLogo = (C.sponsors || []).filter((s) => !s.logo && !s.draft).length;
    if (noLogo) checks.push(['warn', `${noLogo} partenaire(s) sans logo.`, '#/partenaires', 'Compléter']);
    const noPhoto = (C.team || []).filter((m) => !m.photo && !m.draft).length;
    if (noPhoto) checks.push(['warn', `${noPhoto} membre(s) de l'équipe sans photo.`, '#/equipe', 'Compléter']);
    const revs = (C.reviews || []).filter((r) => !r.draft);
    const lastRev = Math.max(0, ...revs.map((r) => parseInt(r.when, 10) || 0));
    if (revs.length < 3) checks.push(['warn', `Seulement ${revs.length} avis affiché(s) sur l'accueil.`, '#/avis', 'Ajouter']);
    else if (lastRev && lastRev < +t.slice(0, 4) - 1) checks.push(['warn', `L'avis le plus récent affiché date de ${lastRev}. Demandez à quelques membres de laisser un avis Google, puis ajoutez les meilleurs ici.`, '#/avis', 'Voir']);
    if (!(C.documents || []).some((d) => d.category === 'inscription' && d.url)) checks.push(['err', 'Aucun formulaire d\'inscription téléchargeable.', '#/documents', 'Ajouter']);
    (C.shopProducts || []).filter((p) => !p.draft && shopLate(p)).forEach((p) => checks.push(['err', `Boutique : la date limite de « ${p.name} » est passée. Passez la commande ou annulez-la.`, `#/boutique/${p.id}/suivi`, 'Suivi']));
    if (store.isLocal) checks.push(['warn', 'Mode aperçu : les modifications restent dans ce navigateur. Exportez une sauvegarde régulièrement.', '#/sauvegarde', 'Sauvegarder']);
    const shopLive = (C.shopProducts || []).filter((p) => !p.draft && ['ouverte', 'commandee', 'disponible'].includes(p.status));
    const shopOpen = shopLive.filter((p) => p.status === 'ouverte' && !shopLate(p));
    const sh = shopLive.reduce((a, p) => { const x = SHOPSUM[p.id] || {}; a.pieces += x.total || 0; a.amount += x.amount || 0; a.unpaid += p.status === 'ouverte' ? 0 : (x.unpaid || 0); return a; }, { pieces: 0, amount: 0, unpaid: 0 });

    v.innerHTML = `
      <p class="intro">${hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'} ! Voici l'état du site au ${U.fmtDate(t)}.</p>
      <div class="grid-kpi">
        <a class="card kpi" href="#/actualites"><span class="label">${icon('file')} Actualités publiées</span><b class="value num">${pub.length}</b><span class="sub">${drafts.length} brouillon(s)${last ? ` · dernière le ${fmtDate(last.date)}` : ''}</span></a>
        <a class="card kpi" href="#/agenda"><span class="label">${icon('calendar')} Prochain événement</span><b class="value num">${up[0] ? Math.max(0, Math.round((new Date(up[0].dateStart) - new Date(t)) / 86400000)) + ' j' : '—'}</b><span class="sub">${up[0] ? esc(up[0].title) : 'Rien de programmé'}</span></a>
        <a class="card kpi" href="#/messages"><span class="label">${icon('mail')} Messages non lus</span><b class="value num">${unread.length}</b><span class="sub">${(C.messages || []).length} au total</span></a>
        <a class="card kpi" href="#/tarifs"><span class="label">${icon('euro')} Formules en ligne</span><b class="value num">${(C.rates || []).filter((r) => !r.draft).length}</b><span class="sub">Saison ${esc(C.settings.season || '')}</span></a>
        <a class="card kpi kpi-wide" href="#/boutique" id="kpi-boutique"><span class="label">${icon('bag')} Boutique · commandes groupées</span>
          <span class="kpi-row"><span><b class="value num">${shopOpen.length}</b><span class="sub">commande${shopOpen.length > 1 ? 's' : ''} ouverte${shopOpen.length > 1 ? 's' : ''}</span></span><span><b class="value num">${sh.pieces}</b><span class="sub">pièces réservées</span></span><span><b class="value num">${euro(sh.amount)}</b><span class="sub">montant total</span></span><span><b class="value num">${euro(sh.unpaid)}</b><span class="sub">reste à encaisser</span></span></span></a>
      </div>
      <div class="grid-2">
        <div class="card card-pad"><h2>À vérifier</h2><div class="checks">${checks.map(([lv, txt, href, act]) => `<div class="check-row ${lv}"><span class="dot"></span><span>${esc(txt)}</span><a href="${href}">${act}</a></div>`).join('')}</div></div>
        <div class="card card-pad"><h2>Raccourcis</h2><div class="quick">
          <a href="#/actualites/nouveau"><span class="ic">${icon('plus')}</span>Publier une actualité</a>
          <a href="#/agenda/nouveau"><span class="ic">${icon('calendar')}</span>Ajouter un événement</a>
          <a href="#/reglages"><span class="ic">${icon('megaphone')}</span>Changer l'annonce</a>
          <a href="#/galerie"><span class="ic">${icon('image')}</span>Ajouter des photos</a>
          <a href="#/partenaires/nouveau"><span class="ic">${icon('handshake')}</span>Nouveau partenaire</a>
          <a href="../index.html" target="_blank" rel="noopener"><span class="ic">${icon('external')}</span>Voir le site</a>
        </div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-pad" style="display:flex;justify-content:space-between;align-items:center"><h2>Dernières actualités</h2><a href="#/actualites">Tout voir</a></div>
        <div class="table-wrap"><table class="table"><tbody>${news.slice().sort(SCHEMAS.news.sort).slice(0, 5).map((n) => `<tr data-go="#/actualites/${n.id}"><td style="width:70px">${thumb((n.images || [])[0])}</td><td><div class="title">${esc(n.title)}</div><div class="sub">${fmtDate(n.date)}</div></td><td>${status(n)}</td></tr>`).join('')}</tbody></table></div></div>`;
    $$('[data-go]', v).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.go; }));
  }

  /* ---------- Liste d'une collection ---------- */
  function viewList(key) {
    const S = SCHEMAS[key];
    const v = shell(S.title, '', `<a class="btn hide-sm" href="../${S.page}" target="_blank" rel="noopener">${icon('external')} Voir sur le site</a><a class="btn btn-primary" href="#/${S.route}/nouveau">${icon('plus')} Ajouter ${S.one}</a>`);
    let q = '', filt = '';
    v.innerHTML = `<p class="intro">${esc(S.intro || '')}</p>
      <div class="toolbar">${S.search ? `<label class="search"><span class="sr-only">Rechercher</span>${icon('search')}<input type="search" id="l-q" placeholder="Rechercher…"></label>` : ''}
        ${S.filter ? `<select id="l-f" aria-label="Filtrer"><option value="">${esc(S.filter.l)}</option>${S.filter.opts.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>` : ''}
        <span class="spacer"></span>${S.ordered ? `<span class="small muted">${icon('grip')} Glissez les lignes pour changer l'ordre d'affichage</span>` : ''}</div>
      <div class="card"><div class="table-wrap" id="l-table"></div></div>`;
    function draw() {
      let list = (C[key] || []).slice();
      if (S.sort) list.sort(S.sort);
      const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const filtered = list.filter((x) => (!q || norm(S.search(x)).includes(norm(q))) && (!filt || String(x[S.filter.k]) === filt));
      const box = $('#l-table', v);
      if (!filtered.length) { box.innerHTML = `<div class="empty-state">${icon(S.icon)}<p>${list.length ? 'Aucun résultat pour ce filtre.' : 'Rien pour le moment.'}</p><a class="btn btn-primary" href="#/${S.route}/nouveau">${icon('plus')} Ajouter ${S.one}</a></div>`; return; }
      const canDrag = S.ordered && !q && !filt;
      box.innerHTML = `<table class="table"><thead><tr>${canDrag ? '<th style="width:30px"></th>' : ''}${S.columns.map((c) => `<th class="${c.cls || ''}"${c.w ? ` style="width:${c.w}px"` : ''}>${c.h}</th>`).join('')}<th style="width:120px"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${filtered.map((x) => `<tr data-id="${esc(x.id)}"${canDrag ? ' draggable="true"' : ''}>${canDrag ? `<td class="grip" title="Glisser pour déplacer">${icon('grip')}</td>` : ''}${S.columns.map((c) => `<td class="${c.cls || ''}">${c.r(x)}</td>`).join('')}
          <td><div class="row-actions"><button type="button" class="btn btn-icon btn-ghost" data-dup="${esc(x.id)}" title="Dupliquer">${icon('copy')}</button><button type="button" class="btn btn-icon btn-ghost btn-danger" data-del="${esc(x.id)}" title="Supprimer">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table>`;
      $$('tbody tr', box).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('button, a')) return; location.hash = `#/${S.route}/${tr.dataset.id}`; }));
      $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
        const item = C[key].find((x) => x.id === b.dataset.del);
        if (!(await modal({ title: `Supprimer ${S.one} ?`, body: `« ${item.title || item.name || item.q || item.label || 'Sans titre'} » sera supprimé définitivement du site.`, confirm: 'Supprimer', danger: true }))) return;
        await persist(key, C[key].filter((x) => x.id !== b.dataset.del), 'Supprimé');
        draw();
      }));
      $$('[data-dup]', box).forEach((b) => b.addEventListener('click', async () => {
        const src = C[key].find((x) => x.id === b.dataset.dup);
        const copy = Object.assign(clone(src), { id: uid(key.slice(0, 2)) });
        if (copy.title) copy.title += ' (copie)'; if (copy.name) copy.name += ' (copie)';
        if ('draft' in copy || key === 'news' || key === 'events') copy.draft = true;
        if (copy.slug) copy.slug = slugify(copy.title);
        copy.featured = false;
        if (key === 'shopProducts') { copy.status = 'brouillon'; copy.demo = false; delete copy._demo; copy.deadline = isoIn(21); copy.deliveryDate = ''; }
        const arr = C[key].slice(); arr.splice(arr.indexOf(src) + 1, 0, copy);
        await persist(key, arr, 'Copie créée en brouillon');
        location.hash = `#/${S.route}/${copy.id}`;
      }));
      if (canDrag) bindDrag(box, key, draw);
    }
    const qi = $('#l-q', v); qi && qi.addEventListener('input', () => { q = qi.value.trim(); draw(); });
    const fi = $('#l-f', v); fi && fi.addEventListener('change', () => { filt = fi.value; draw(); });
    draw();
  }
  function bindDrag(box, key, redraw) {
    let dragId = null;
    $$('tbody tr', box).forEach((tr) => {
      tr.addEventListener('dragstart', (e) => { dragId = tr.dataset.id; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ } });
      tr.addEventListener('dragend', () => { tr.classList.remove('dragging'); $$('.drop-before', box).forEach((x) => x.classList.remove('drop-before')); });
      tr.addEventListener('dragover', (e) => { e.preventDefault(); $$('.drop-before', box).forEach((x) => x.classList.remove('drop-before')); tr.classList.add('drop-before'); });
      tr.addEventListener('drop', async (e) => {
        e.preventDefault();
        const to = tr.dataset.id; if (!dragId || dragId === to) return;
        const arr = C[key].slice(); const from = arr.findIndex((x) => x.id === dragId);
        const [it] = arr.splice(from, 1); arr.splice(arr.findIndex((x) => x.id === to), 0, it);
        arr.forEach((x, i) => { x.order = i + 1; });
        await persist(key, arr, 'Ordre enregistré'); redraw();
      });
    });
  }

  async function persist(key, value, msg) {
    try { await store.save(key, value); C[key] = value; if (key !== 'messages' && store.content && store.content.messages) C.messages = store.content.messages; if (msg) toast(store.isLocal ? msg + ' · visible uniquement dans ce navigateur (aperçu)' : msg); return true; }
    catch (e) { console.error(e); toast('Enregistrement impossible : ' + (e.message || e), 'err'); return false; }
  }

  /* ---------- Édition d'un élément ---------- */
  function viewEdit(key, id) {
    const S = SCHEMAS[key];
    const isNew = id === 'nouveau';
    const orig = isNew ? S.blank() : (C[key] || []).find((x) => x.id === id);
    if (!orig) { location.hash = `#/${S.route}`; return; }
    const name = orig.title || orig.name || orig.q || (orig.label ? orig.label : '') || '';
    const v = shell(isNew ? `Ajouter ${S.one}` : (name || 'Modifier'), `<a href="#/${S.route}">${esc(S.title)}</a> /`,
      (!isNew && S.actions ? S.actions(orig) : '') + (!isNew && S.view ? `<a class="btn hide-sm" href="../${S.view(orig)}" target="_blank" rel="noopener">${icon('eye')} Voir sur le site</a>` : ''));
    const hasSide = !!S.preview;
    v.innerHTML = `<div class="editor ${hasSide ? '' : 'single'}"><div class="card form-card" id="ed-form"></div>
      ${hasSide ? `<aside class="side-card"><div id="ed-prev"></div><div class="card card-pad meta-list"><div><span>Statut</span>${S.statusPill ? S.statusPill(orig) : status(orig)}</div><div><span>Identifiant</span><code>${esc(orig.id)}</code></div></div></aside>` : ''}</div>
      <div class="savebar"><span class="state" id="sv-state"><i></i>Aucune modification</span><span class="grow"></span>
        ${!isNew ? `<button type="button" class="btn btn-danger hide-sm" id="sv-del">${icon('trash')} Supprimer</button>` : ''}
        <a class="btn" href="#/${S.route}">Annuler</a><button type="button" class="btn btn-primary" id="sv-save">${icon('check')} Enregistrer</button></div>`;
    const prev = $('#ed-prev', v);
    const st = $('#sv-state', v);
    if (key === 'shopProducts' && orig.demo) $('.editor', v).insertAdjacentHTML('beforebegin', `<div class="callout" style="margin-bottom:16px">${icon('info')}<div><b>Produit d'exemple.</b> Il sert à la démonstration en mode aperçu et n'est jamais publié en ligne. Supprimez-le ou dupliquez-le pour créer un vrai produit.</div></div>`);
    const setDirty = (d) => { dirty = d; st.classList.toggle('dirty', d); st.lastChild.textContent = d ? 'Modifications non enregistrées' : 'Tout est enregistré'; };
    const form = Form($('#ed-form', v), S.fields, orig, (x) => { setDirty(true); if (prev) prev.innerHTML = S.preview(x); });
    if (prev) prev.innerHTML = S.preview(orig);
    setDirty(isNew);
    if (isNew) st.lastChild.textContent = 'Nouveau — pas encore enregistré';
    const save = async () => {
      const item = form.collect();
      if (!form.validate()) { toast('Complétez les champs obligatoires (*).', 'err'); return; }
      const err = S.validate && S.validate(item);
      if (err) { toast(err, 'err'); return; }
      if (S.beforeSave) S.beforeSave(item);
      const arr = (C[key] || []).slice();
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else if (S.ordered) arr.push(item); else arr.unshift(item);
      const btn = $('#sv-save', v); btn.disabled = true;
      const ok = await persist(key, arr, isNew ? 'Ajouté au site' : 'Modifications enregistrées');
      btn.disabled = false;
      if (ok && S.afterSave) await S.afterSave(item, isNew ? null : orig);
      if (ok) { setDirty(false); if (isNew) { history.replaceState(null, '', `#/${S.route}/${item.id}`); route(); } }
    };
    $('#sv-save', v).addEventListener('click', save);
    const del = $('#sv-del', v);
    del && del.addEventListener('click', async () => {
      if (!(await modal({ title: `Supprimer ${S.one} ?`, body: 'Cette action est définitive.', confirm: 'Supprimer', danger: true }))) return;
      dirty = false;
      if (await persist(key, C[key].filter((x) => x.id !== orig.id), 'Supprimé')) location.hash = `#/${S.route}`;
    });
    current = { save };
  }

  /* ---------- Boutique : suivi des réservations d'un produit ---------- */
  async function viewShopOrders(id) {
    let p = (C.shopProducts || []).find((x) => x.id === id);
    if (!p) { location.hash = '#/boutique'; return; }
    const v = shell(p.name, '<a href="#/boutique">Boutique</a> / Suivi des réservations', `<a class="btn" href="#/boutique/${esc(p.id)}">${icon('edit')} Modifier la fiche</a>`);
    v.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';
    let list = [], waitN = 0;
    const load = async () => { list = await store.shop.list(p.id); waitN = await store.shop.waitCount(p.id); };
    try { await load(); } catch (e) { toast('Lecture des réservations impossible : ' + e.message, 'err'); }
    const colorsOf = () => { const c = (p.colors || []).slice(); list.forEach((r) => { if (r.color && !c.includes(r.color)) c.push(r.color); }); return c.length ? c : ['']; };
    const sizesOf = () => { const z = (p.sizes || []).slice(); list.forEach((r) => { if (r.size && !z.includes(r.size)) z.push(r.size); }); return z; };
    function stats() {
      const live = list.filter((r) => r.status !== 'annulee');
      const grid = {}; const marks = [];
      live.forEach((r) => { const k = r.size + '|' + (r.color || ''); grid[k] = (grid[k] || 0) + (r.qty || 0); if (r.marking) marks.push(r); });
      const sum = { total: live.reduce((n, r) => n + (r.qty || 0), 0), parTaille: {} };
      live.forEach((r) => { const k = store.shop.sizeKey(r.size); sum.parTaille[k] = (sum.parTaille[k] || 0) + (r.qty || 0); });
      return { live, grid, marks, sum, pr: shopProgress(p, sum), amount: live.reduce((n, r) => n + (r.total || 0), 0), unpaid: live.filter((r) => !r.paid).reduce((n, r) => n + (r.total || 0), 0),
        paid: live.filter((r) => r.paid).length, picked: live.filter((r) => r.pickedUp).length, members: new Set(live.map((r) => r.uid)).size };
    }
    function recapText() {
      const st = stats(), cols = colorsOf(), lines = [`Commande USM Tennis Montargis — ${p.name}`];
      if (p.supplierRef || p.supplier) lines.push([p.supplier ? 'Fournisseur : ' + p.supplier : '', p.supplierRef ? 'Réf. ' + p.supplierRef : ''].filter(Boolean).join(' · '));
      lines.push(`Total : ${st.sum.total} pièce${st.sum.total > 1 ? 's' : ''}`, '');
      cols.forEach((c) => {
        const row = sizesOf().map((z) => [z, st.grid[z + '|' + c] || 0]).filter((x) => x[1]);
        if (row.length) lines.push((c ? c + ' : ' : 'Tailles : ') + row.map(([z, n]) => `${z} × ${n}`).join(', '));
      });
      if (st.marks.length) { lines.push('', `Marquages (${st.marks.reduce((n, r) => n + r.qty, 0)} pièces) :`); st.marks.forEach((r) => lines.push(`- ${r.marking} — ${r.size}${r.color ? ', ' + r.color : ''}${r.qty > 1 ? ' × ' + r.qty : ''}`)); }
      if (p.deliveryDate) lines.push('', 'Livraison souhaitée : ' + fmtDate(p.deliveryDate));
      return lines.join('\n');
    }
    function csv() {
      const st = stats(), q = (c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`, num = (n) => String(Math.round((n || 0) * 100) / 100).replace('.', ',');
      const rows = [['Commande groupée', p.name], ['Fournisseur', p.supplier || '', 'Référence', p.supplierRef || ''], ['Pièces réservées', st.sum.total, 'Minimum', p.minQty + (p.minMode === 'size' ? ' par taille' : '')], [],
        ['Récapitulatif fournisseur'], ['Taille', 'Couleur', 'Quantité', 'Dont marquages']];
      sizesOf().forEach((z) => colorsOf().forEach((c) => { const n = st.grid[z + '|' + c] || 0; if (n) rows.push([z, c, n, st.marks.filter((r) => r.size === z && (r.color || '') === c).reduce((m, r) => m + r.qty, 0)]); }));
      rows.push(['Total', '', st.sum.total, st.marks.reduce((n, r) => n + r.qty, 0)], [], ['Détail des réservations'], ['Membre', 'Taille', 'Couleur', 'Quantité', 'Marquage', 'Prix unitaire (€)', 'Montant (€)', 'Réglé', 'Retiré', 'Statut', 'Réservé le']);
      list.forEach((r) => rows.push([r.name || r.uid, r.size, r.color, r.qty, r.marking, num(r.unitPrice), num(r.total), r.paid ? 'oui' : 'non', r.pickedUp ? 'oui' : 'non', ({ reservee: 'Réservée', commandee: 'Commandée', disponible: 'Disponible au club', retiree: 'Retirée', annulee: 'Annulée' })[r.status] || r.status, r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : '']));
      rows.push([], ['Montant total (€)', num(st.amount)], ['Reste à encaisser (€)', num(st.unpaid)]);
      return '﻿' + rows.map((r) => r.map(q).join(';')).join('\n');
    }
    const uidsLive = () => stats().live.map((r) => r.uid);
    async function setPhase(status, note, msg) {
      const next = Object.assign(clone(p), { status });
      const arr = (C.shopProducts || []).map((x) => (x.id === p.id ? next : x));
      if (!(await persist('shopProducts', arr, msg))) return;
      p = next;
      try {
        await store.shop.setStatus(p, status);
        if (note) { const n = await store.shop.notify(p.id, uidsLive(), note); toast(`${n} membre${n > 1 ? 's' : ''} prévenu${n > 1 ? 's' : ''} dans leur espace`); }
        await load();
      } catch (e) { toast(e.message, 'err'); }
      draw();
    }
    function draw() {
      const st = stats(), pr = st.pr, cols = colorsOf(), sizes = sizesOf().filter((z) => cols.some((c) => st.grid[z + '|' + c]));
      const left = p.deadline ? Math.round((new Date(p.deadline) - new Date(todayISO())) / 864e5) : null;
      const acts = [];
      if (p.status === 'brouillon') acts.push(`<button type="button" class="btn btn-primary" data-ph="ouverte">${icon('check')} Ouvrir les réservations</button>`);
      if (p.status === 'ouverte') acts.push(`<button type="button" class="btn btn-primary" data-ph="commandee">${icon('check')} Passer en « Commandée »</button>`);
      if (p.status === 'commandee') acts.push(`<button type="button" class="btn btn-primary" data-ph="disponible">${icon('pin')} Marquer « Disponible au club »</button>`);
      if (p.status === 'disponible') acts.push(`<button type="button" class="btn btn-primary" data-ph="terminee">${icon('check')} Terminer la commande</button>`);
      if (['ouverte', 'commandee'].includes(p.status)) acts.push(`<button type="button" class="btn btn-danger" data-ph="annulee">${icon('close')} Annuler la commande groupée</button>`);
      if (['terminee', 'annulee'].includes(p.status)) acts.push(`<button type="button" class="btn btn-primary" data-relaunch>${icon('repeat')} Relancer ce produit</button>`);
      v.innerHTML = `
      <div class="grid-kpi shop-kpi">
        <div class="card kpi"><span class="label">${icon('bag')} Pièces réservées</span><b class="value num">${st.sum.total}<small> / ${pr.min}${pr.bySize ? ' par taille' : ''}</small></b><span class="sub">${pr.reached ? '<b class="ok-txt">Objectif atteint</b>' : 'il en manque <b>' + pr.missing + '</b>'}</span><span class="meter"><i style="width:${Math.min(100, Math.round(100 * st.sum.total / Math.max(1, st.sum.total + pr.missing)))}%"></i></span></div>
        <div class="card kpi"><span class="label">${icon('euro')} Montant total</span><b class="value num">${euro(st.amount)}</b><span class="sub">${st.members} membre${st.members > 1 ? 's' : ''} · ${st.live.length} réservation${st.live.length > 1 ? 's' : ''}</span></div>
        <div class="card kpi"><span class="label">${icon('euro')} Reste à encaisser</span><b class="value num">${euro(p.status === 'ouverte' ? 0 : st.unpaid)}</b><span class="sub">${p.status === 'ouverte' ? 'Personne ne paie avant la commande' : st.paid + ' réservation' + (st.paid > 1 ? 's' : '') + ' réglée' + (st.paid > 1 ? 's' : '') + ' · ' + st.picked + ' retirée' + (st.picked > 1 ? 's' : '')}</span></div>
        <div class="card kpi"><span class="label">${icon('megaphone')} Liste d'attente</span><b class="value num">${waitN}</b><span class="sub">membre${waitN > 1 ? 's' : ''} à prévenir à la prochaine commande</span></div>
      </div>
      <div class="card card-pad shop-phase">
        <div><div>${shopPill(p)}</div><p class="muted small">${p.status === 'ouverte' ? (left >= 0 ? `Réservations jusqu'au ${fmtDate(p.deadline)} (${left === 0 ? 'dernier jour' : 'J-' + left})` : `Date limite passée depuis le ${fmtDate(p.deadline)} : les membres ne peuvent plus modifier.`) : p.status === 'commandee' ? 'Réservations verrouillées.' + (p.payUrl ? ' Le lien de paiement est affiché aux membres.' : ' Règlement au club.') : p.status === 'disponible' ? 'Cochez « Retiré » au fur et à mesure.' : ''}${p.deliveryDate ? ' · Livraison estimée le ' + fmtDate(p.deliveryDate) : ''}</p></div>
        <div class="shop-acts">${acts.join('')}</div>
      </div>
      <div class="grid-2 shop-grid2">
        <div class="card card-pad"><div class="card-head"><h2>Récap fournisseur</h2><span class="spacer"></span><button type="button" class="btn btn-sm" id="sh-copy">${icon('copy')} Copier le récap</button><button type="button" class="btn btn-sm" id="sh-csv">${icon('download')} Exporter en CSV</button></div>
          ${sizes.length ? `<div class="table-wrap"><table class="table recap"><thead><tr><th>Taille</th>${cols.map((c) => `<th class="num">${esc(c || 'Quantité')}</th>`).join('')}${cols.length > 1 ? '<th class="num">Total</th>' : ''}${pr.bySize ? '<th>Minimum</th>' : ''}</tr></thead><tbody>
            ${sizes.map((z) => { const tot = cols.reduce((n, c) => n + (st.grid[z + '|' + c] || 0), 0); return `<tr><th>${esc(z)}</th>${cols.map((c) => `<td class="num">${st.grid[z + '|' + c] || ''}</td>`).join('')}${cols.length > 1 ? `<td class="num"><b>${tot}</b></td>` : ''}${pr.bySize ? `<td>${tot >= pr.min ? '<span class="pill ok">OK</span>' : `<span class="pill warn">manque ${pr.min - tot}</span>`}</td>` : ''}</tr>`; }).join('')}
            <tr class="tot"><th>Total</th>${cols.map((c) => `<td class="num">${sizes.reduce((n, z) => n + (st.grid[z + '|' + c] || 0), 0)}</td>`).join('')}${cols.length > 1 ? `<td class="num"><b>${st.sum.total}</b></td>` : ''}${pr.bySize ? '<td></td>' : ''}</tr></tbody></table></div>` : '<p class="muted">Aucune pièce réservée pour le moment.</p>'}
          ${st.marks.length ? `<h3 class="small" style="margin-top:14px">Marquages (${st.marks.reduce((n, r) => n + r.qty, 0)} pièces, +${euro(p.markingPrice)} chacune)</h3><p class="small">${st.marks.map((r) => `<span class="pill">${esc(r.marking)} · ${esc(r.size)}${r.qty > 1 ? ' ×' + r.qty : ''}</span>`).join(' ')}</p>` : ''}
        </div>
        <div class="card card-pad"><h2>Fiche</h2><div class="meta-list">
          <div><span>Prix membre</span><b>${euro(p.priceMember)}</b></div>${p.marking ? `<div><span>Marquage</span><b>+${euro(p.markingPrice)}</b></div>` : ''}
          <div><span>Minimum</span><b>${esc(p.minQty)} pièces${p.minMode === 'size' ? ' par taille' : ''}</b></div>${p.maxPerMember ? `<div><span>Maximum par membre</span><b>${esc(p.maxPerMember)}</b></div>` : ''}
          <div><span>Fournisseur</span><b>${esc(p.supplier || '—')}</b></div><div><span>Référence</span><b>${esc(p.supplierRef || '—')}</b></div>
          <div><span>Paiement</span><b>${p.payUrl ? 'Lien en ligne' : 'Au club'}</b></div></div>
          ${store.isLocal ? '' : `<p style="margin-top:12px"><button type="button" class="btn btn-sm btn-ghost" id="sh-recount">${icon('repeat')} Recalculer le compteur public</button></p>`}</div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-pad card-head"><h2>Réservations <span class="pill">${list.length}</span></h2></div>
        ${list.length ? `<div class="table-wrap"><table class="table shop-res"><thead><tr><th>Membre</th><th>Taille</th><th class="hide-sm">Couleur</th><th class="num">Qté</th><th class="hide-sm">Marquage</th><th class="num">Montant</th><th>Réglé</th><th>Retiré</th><th class="hide-sm">Réservé le</th></tr></thead><tbody>
          ${list.map((r) => `<tr class="${r.status === 'annulee' ? 'is-off' : ''}"><td><div class="title">${esc(r.name || r.uid)}</div>${r.status === 'annulee' ? '<div class="sub">annulée</div>' : ''}</td><td>${esc(r.size)}</td><td class="hide-sm">${esc(r.color || '')}</td><td class="num">${r.qty}</td><td class="hide-sm">${esc(r.marking || '')}</td><td class="num">${euro(r.total)}</td>
            <td><label class="check"><input type="checkbox" data-flag="paid" data-u="${esc(r.uid)}" data-r="${esc(r.id)}"${r.paid ? ' checked' : ''} aria-label="Réglé : ${esc(r.name || r.uid)}"><span></span></label></td>
            <td><label class="check"><input type="checkbox" data-flag="pickedUp" data-u="${esc(r.uid)}" data-r="${esc(r.id)}"${r.pickedUp ? ' checked' : ''} aria-label="Retiré : ${esc(r.name || r.uid)}"><span></span></label></td>
            <td class="hide-sm small muted">${r.createdAt ? fmtDateTime(r.createdAt) : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('bag')}<p>Aucune réservation pour le moment. Partagez la commande sur le groupe WhatsApp du club !</p></div>`}
      </div>`;
      $('#sh-csv', v).addEventListener('click', () => { download(`boutique-${slugify(p.name)}-${todayISO()}.csv`, csv(), 'text/csv'); toast('Export CSV téléchargé'); });
      $('#sh-copy', v).addEventListener('click', async () => {
        const txt = recapText();
        try { await navigator.clipboard.writeText(txt); toast('Récap copié : collez-le dans votre e-mail au fournisseur'); }
        catch (e) { modal({ title: 'Récap fournisseur', confirm: 'Fermer', cancel: '', html: `<textarea readonly style="width:100%;min-height:220px">${esc(txt)}</textarea>` }); }
      });
      const rc = $('#sh-recount', v); rc && rc.addEventListener('click', async () => { try { await store.shop.recount(p.id); toast('Compteur recalculé'); } catch (e) { toast(e.message, 'err'); } });
      $$('[data-flag]', v).forEach((cb) => cb.addEventListener('change', async () => {
        try { const r = await store.shop.setFlags(p.id, cb.dataset.u, cb.dataset.r, { [cb.dataset.flag]: cb.checked }); const it = list.find((x) => x.id === cb.dataset.r && x.uid === cb.dataset.u); Object.assign(it, r); draw(); toast(cb.checked ? 'Coché' : 'Décoché'); }
        catch (e) { cb.checked = !cb.checked; toast(e.message, 'err'); }
      }));
      const rl = $('[data-relaunch]', v);
      rl && rl.addEventListener('click', async () => {
        const copy = Object.assign(clone(p), { id: uid('sp-'), status: 'brouillon', demo: false, deadline: isoIn(21), deliveryDate: '' }); delete copy._demo;
        const arr = (C.shopProducts || []).slice(); arr.splice(arr.findIndex((x) => x.id === p.id) + 1, 0, copy);
        if (await persist('shopProducts', arr, 'Nouvelle commande créée en brouillon')) location.hash = `#/boutique/${copy.id}`;
      });
      $$('[data-ph]', v).forEach((b) => b.addEventListener('click', async () => {
        const to = b.dataset.ph, n = new Set(uidsLive()).size, name = p.name;
        if (to === 'ouverte') {
          if (!p.deadline || p.deadline < todayISO()) { toast('Choisissez d\'abord une date limite à venir (Modifier la fiche).', 'err'); return; }
          return setPhase('ouverte', null, 'Réservations ouvertes dans l\'espace membre');
        }
        if (to === 'commandee') {
          const warn = pr.reached ? '' : `Attention : le minimum n'est pas atteint (${st.sum.total} / ${pr.min}${pr.bySize ? ' par taille' : ''}). `;
          if (!(await modal({ title: 'Passer la commande ?', body: `${warn}Les réservations seront verrouillées : les membres ne pourront plus les modifier ni les annuler.${p.payUrl ? ' Le lien de paiement leur sera affiché.' : ''} Les ${n} membres concernés seront prévenus dans leur espace.`, confirm: 'Passer en « Commandée »', danger: !pr.reached }))) return;
          return setPhase('commandee', { type: 'warning', kind: 'commandee', title: 'Commande lancée : ' + name, text: `Le minimum est atteint : le club passe la commande au fournisseur. Réglez votre part ${p.payUrl ? 'en ligne depuis la Boutique de votre espace membre' : 'au club'}${p.deliveryDate ? '. Livraison estimée le ' + fmtDate(p.deliveryDate) : ''}.` }, 'Commande passée : réservations verrouillées');
        }
        if (to === 'disponible') {
          if (!(await modal({ title: 'Commande arrivée au club ?', body: `Les ${n} membres concernés seront prévenus qu'ils peuvent venir la retirer.`, confirm: 'Prévenir les membres' }))) return;
          return setPhase('disponible', { type: 'warning', kind: 'disponible', title: 'À retirer au club : ' + name, text: 'Votre commande est arrivée ! Elle vous attend au club house. Pensez à votre carte de membre.' }, 'Commande marquée disponible');
        }
        if (to === 'terminee') {
          if (st.picked < st.live.length && !(await modal({ title: 'Terminer la commande ?', body: `${st.live.length - st.picked} réservation(s) ne sont pas cochées « Retiré ». Terminer quand même ?`, confirm: 'Terminer' }))) return;
          return setPhase('terminee', null, 'Commande terminée');
        }
        if (to === 'annulee') {
          const def = `Le minimum de ${p.minQty} pièces${p.minMode === 'size' ? ' par taille' : ''} n'a pas été atteint pour « ${name} ». La commande groupée est annulée : vous n'avez rien à payer. Merci à toutes celles et ceux qui avaient réservé !`;
          const m = await modal({ title: 'Annuler la commande groupée ?', confirm: 'Annuler la commande', cancel: 'Retour', danger: true,
            html: `<p class="muted">Les ${n} membres concernés recevront ce message dans leur espace (et par e-mail une fois Firebase branché).</p><div class="field"><label for="sh-msg">Message aux membres</label><textarea id="sh-msg" style="min-height:120px">${esc(def)}</textarea></div>` });
          if (!m) return;
          return setPhase('annulee', { type: 'warning', kind: 'annulee', title: 'Commande annulée : ' + name, text: ($('#sh-msg', m).value || def).trim() }, 'Commande groupée annulée');
        }
      }));
    }
    draw();
  }

  /* ---------- Galerie ---------- */
  function viewGallery() {
    const v = shell('Galerie photos', '', `<a class="btn hide-sm" href="../le-club.html#galerie" target="_blank" rel="noopener">${icon('external')} Voir sur le site</a>`);
    v.innerHTML = `<p class="intro">Les photos de la galerie apparaissent sur la page Le club (les 16 premières). Ajoutez une courte description pour chaque photo : elle aide Google et les personnes malvoyantes.</p>
      <div class="card card-pad"><div id="g-form"></div></div>`;
    const f = { k: 'gallery', t: 'images', l: 'Photos', hint: 'Cliquez sur l\'étoile pour placer une photo en premier.' };
    const form = Form($('#g-form', v), [f], { gallery: clone(C.gallery || []) }, async (x) => {
      const arr = x.gallery.map((im) => Object.assign({ id: im.id || uid('g') }, im));
      clearTimeout(viewGallery.t); viewGallery.t = setTimeout(() => persist('gallery', arr, 'Galerie enregistrée'), 500);
    });
    return form;
  }

  /* ---------- Messages ---------- */
  async function viewMessages() {
    const v = shell('Messages', '', `<button type="button" class="btn" id="m-csv">${icon('download')} Exporter (CSV)</button>`);
    v.innerHTML = '<p class="intro">Demandes envoyées depuis les formulaires Contact et Partenaires.</p><div class="toolbar"><div class="tabs-line" role="tablist" id="m-tabs" style="margin:0;border:0"></div></div><div class="card" id="m-list"><div class="empty-state"><span class="spinner"></span></div></div>';
    let msgs = [];
    try { msgs = await store.loadMessages(); C.messages = msgs; } catch (e) { toast('Lecture des messages impossible : ' + e.message, 'err'); }
    let tab = 'all';
    const TYPES = { contact: 'Contact', partenariat: 'Partenariat' };
    const SUBJ = { renseignement: 'Renseignement', essai: 'Séance d\'essai', inscription: 'Inscription', cours: 'Cours / stage', partenariat: 'Partenariat', autre: 'Autre' };
    function draw() {
      const unread = msgs.filter((m) => !m.read).length;
      $('#m-tabs', v).innerHTML = [['all', `Tous (${msgs.length})`], ['unread', `Non lus (${unread})`], ['essai', 'Essais'], ['partenariat', 'Partenariats']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-t="${k}">${l}</button>`).join('');
      $$('#m-tabs button', v).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; draw(); }));
      const list = msgs.filter((m) => tab === 'all' || (tab === 'unread' && !m.read) || (tab === 'essai' && m.subject === 'essai') || (tab === 'partenariat' && (m.type === 'partenariat' || m.subject === 'partenariat')));
      const box = $('#m-list', v);
      if (!list.length) { box.innerHTML = `<div class="empty-state">${icon('mail')}<p>Aucun message ${tab === 'unread' ? 'non lu' : 'pour le moment'}.</p></div>`; return; }
      box.innerHTML = list.map((m) => `<article class="msg ${m.read ? '' : 'unread'}" data-id="${esc(m.id)}">
        <span class="avatar">${esc((m.name || '?').trim()[0] || '?').toUpperCase()}</span>
        <div><div class="head"><b>${esc(m.name || 'Anonyme')}</b>${m.extra && m.extra.company ? `<span class="muted">${esc(m.extra.company)}</span>` : ''}<span class="pill ${m.type === 'partenariat' ? 'ball' : 'blue'}">${esc(TYPES[m.type] || m.type)}</span>${m.subject ? `<span class="pill">${esc(SUBJ[m.subject] || m.subject)}</span>` : ''}<span class="small muted">${fmtDateTime(m.createdAt)}</span></div>
          <p class="body">${esc(m.message || '')}</p>
          <div class="contact">${m.email ? `<a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('USM Tennis Montargis – votre demande')}">${icon('mail')} ${esc(m.email)}</a>` : ''}${m.phone ? `<a href="tel:${esc(m.phone.replace(/\s/g, ''))}">${icon('phone')} ${esc(m.phone)}</a>` : ''}</div></div>
        <div class="acts"><button type="button" class="btn btn-sm" data-read="${esc(m.id)}">${m.read ? 'Marquer non lu' : 'Marquer lu'}</button><button type="button" class="btn btn-sm btn-icon btn-danger" data-del="${esc(m.id)}" title="Supprimer">${icon('trash')}</button></div></article>`).join('');
      $$('[data-read]', box).forEach((b) => b.addEventListener('click', async () => { const m = msgs.find((x) => x.id === b.dataset.read); m.read = !m.read; await persist('messages', msgs); draw(); refreshBadge(); }));
      $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
        if (!(await modal({ title: 'Supprimer ce message ?', body: 'Conformément au RGPD, supprimez les demandes traitées depuis plus d\'un an.', confirm: 'Supprimer', danger: true }))) return;
        msgs = msgs.filter((x) => x.id !== b.dataset.del); await persist('messages', msgs, 'Message supprimé'); draw(); refreshBadge();
      }));
    }
    function refreshBadge() { const n = msgs.filter((m) => !m.read).length; const a = $('.side a[href="#/messages"]'); if (!a) return; const b = $('.badge', a); if (n) { if (b) b.textContent = n; else a.insertAdjacentHTML('beforeend', `<span class="badge">${n}</span>`); } else if (b) b.remove(); }
    $('#m-csv').addEventListener('click', () => {
      const rows = [['Date', 'Type', 'Sujet', 'Nom', 'E-mail', 'Téléphone', 'Message']].concat(msgs.map((m) => [m.createdAt, m.type, m.subject, m.name, m.email, m.phone, (m.message || '').replace(/\n/g, ' ')]));
      download('messages-usm-tennis.csv', '﻿' + rows.map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
    });
    draw(); refreshBadge();
  }
  // Nouveau message déposé depuis un autre onglet (mode aperçu)
  window.addEventListener('storage', async (e) => {
    if (e.key !== 'usm_v2_content_ping' || !store.user) return;
    C.messages = await store.loadMessages();
    const n = C.messages.filter((m) => !m.read).length; const a = $('.side a[href="#/messages"]'); if (!a) return;
    const b = $('.badge', a); if (n) { if (b) b.textContent = n; else a.insertAdjacentHTML('beforeend', `<span class="badge">${n}</span>`); } else if (b) b.remove();
  });

  /* ---------- Textes des pages ---------- */
  function viewTexts() {
    const reg = window.USM_TEXTS || [];
    const v = shell('Textes des pages', '');
    const pages = {};
    reg.forEach((t) => { (pages[t.page] = pages[t.page] || []).push(t); });
    const texts = Object.assign({}, C.texts || {});
    v.innerHTML = `<div class="callout" style="margin-bottom:16px">${icon('info')}<div>Modifiez les grands titres et accroches du site. Laissez un champ vide pour revenir au texte d'origine. Entourez un mot d'astérisques pour le mettre en valeur en jaune : <code>Le goût du *match*</code>.</div></div>
      <div style="display:grid;gap:12px">${Object.entries(pages).map(([p, list], gi) => `<details class="card text-group"${gi === 0 ? ' open' : ''}><summary>${esc(p)} <span class="pill">${list.length} textes</span>${icon('chevron-down')}</summary><div class="fields">
        ${list.map((t) => `<div class="field"><label for="tx-${esc(t.key)}">${esc(t.label)}</label>${t.long ? `<textarea id="tx-${esc(t.key)}" data-k="${esc(t.key)}" placeholder="${esc(t.def)}">${esc(texts[t.key] || '')}</textarea>` : `<input type="text" id="tx-${esc(t.key)}" data-k="${esc(t.key)}" placeholder="${esc(t.def)}" value="${esc(texts[t.key] || '')}">`}<p class="text-default"><b>Texte d'origine :</b> ${esc(t.def)}</p></div>`).join('')}
      </div></details>`).join('')}</div>
      <div class="savebar"><span class="state" id="sv-state"><i></i>Tout est enregistré</span><span class="grow"></span><button type="button" class="btn btn-primary" id="sv-save">${icon('check')} Enregistrer les textes</button></div>`;
    const st = $('#sv-state', v);
    $$('[data-k]', v).forEach((el) => el.addEventListener('input', () => { dirty = true; st.classList.add('dirty'); st.lastChild.textContent = 'Modifications non enregistrées'; }));
    const save = async () => {
      const out = {};
      $$('[data-k]', v).forEach((el) => { if (el.value.trim()) out[el.dataset.k] = el.value.trim(); });
      if (await persist('texts', out, 'Textes enregistrés')) { dirty = false; st.classList.remove('dirty'); st.lastChild.textContent = 'Tout est enregistré'; }
    };
    $('#sv-save', v).addEventListener('click', save);
    current = { save };
  }

  /* ---------- Paramètres ---------- */
  function viewSettings() {
    const v = shell('Paramètres', '', '<a class="btn hide-sm" href="../contact.html" target="_blank" rel="noopener">Voir la page Contact</a>');
    const s = clone(C.settings);
    s.announcement = s.announcement || { enabled: false, text: '', link: '' };
    s.sticker = Object.assign({ enabled: true, top: 'Saison', text: 'Inscriptions ouvertes', link: 'tarifs.html' }, s.sticker || {});
    s.links = s.links || {};
    s.stats = s.stats || [];
    s.hours = s.hours || [];
    s.seo = s.seo || {};
    s.reviews = s.reviews || { rating: '', count: '', url: '', writeUrl: '' };
    v.innerHTML = `<div style="display:grid;gap:16px;max-width:900px">
      <section class="card form-card"><h2>${icon('megaphone')} Bandeau d'annonce</h2><p class="muted small">Le bandeau s'affiche tout en haut de chaque page. Idéal pour un événement, une date d'inscription ou une fermeture exceptionnelle.</p><div id="s-ann"></div></section>
      <section class="card form-card"><h2>Pastille jaune de l'accueil</h2><p class="muted small">La balle jaune posée sur la photo en haut de l'accueil. Ligne du milieu = « Saison en cours » (rubrique Coordonnées). Textes courts : la pastille est petite.</p><div id="s-stk"></div></section>
      <section class="card form-card"><h2>Le club en chiffres</h2><p class="muted small">Les 4 chiffres du tableau de score sur l'accueil.</p><div class="rows-edit" id="s-stats"></div></section>
      <section class="card form-card"><h2>Coordonnées</h2><div id="s-club"></div></section>
      <section class="card form-card"><h2>Horaires d'ouverture</h2><p class="muted small">Affiché en haut de l'accueil et sur la page Contact sous la forme « Accueil du lundi au vendredi de 17 h à 20 h ». Jours en clair : « Lundi – vendredi », « Samedi »… Une ligne sans heures n'est pas affichée.</p><div class="rows-edit" id="s-hours"></div><div><button type="button" class="btn btn-sm" id="h-add">${icon('plus')} Ajouter une ligne</button></div></section>
      <section class="card form-card"><h2>Liens</h2><div id="s-links"></div></section>
      <section class="card form-card"><h2>Espace membre</h2><p class="muted small">Si les équipes s'organisent sur WhatsApp, désactivez la section Équipes : l'onglet, le bloc « Mon équipe » de l'accueil et les convocations disparaissent de l'espace membre. Vous pouvez la réactiver à tout moment, rien n'est supprimé.</p><div id="s-member"></div></section>
      <section class="card form-card"><h2>${icon('star')} Avis Google</h2><p class="muted small">Note affichée au-dessus des citations sur l'accueil. Relevez-la de temps en temps sur la fiche Google du club (laissez la note vide pour ne montrer que les liens).</p><div id="s-rev"></div></section>
      <section class="card form-card"><h2>Référencement (Google)</h2><div id="s-seo"></div></section>
      ${store.isLocal ? `<section class="card form-card"><h2>${icon('shield')} Mot de passe de l'aperçu</h2><p class="muted small">En mode aperçu, l'accès à l'admin est protégé par ce mot de passe. En production, chaque administrateur se connecte avec son compte Firebase.</p><div class="fields"><div class="field half"><label for="pw1">Nouveau mot de passe</label><input type="password" id="pw1" autocomplete="new-password"></div><div class="field half"><label for="pw2">Confirmer</label><input type="password" id="pw2" autocomplete="new-password"></div></div><div><button type="button" class="btn" id="pw-save">Changer le mot de passe</button></div></section>` : ''}
    </div>
    <div class="savebar"><span class="state" id="sv-state"><i></i>Tout est enregistré</span><span class="grow"></span><button type="button" class="btn btn-primary" id="sv-save">${icon('check')} Enregistrer les paramètres</button></div>`;
    const st = $('#sv-state', v);
    const mark = () => { dirty = true; st.classList.add('dirty'); st.lastChild.textContent = 'Modifications non enregistrées'; };
    const fAnn = Form($('#s-ann', v), [
      { k: 'enabled', t: 'switch', l: 'Afficher le bandeau' },
      { k: 'text', t: 'text', l: 'Texte', max: 90, placeholder: '10 octobre : journée test Dunlop au club' },
      { k: 'link', t: 'text', l: 'Lien (facultatif)', placeholder: 'agenda.html#e-dunlop-2026 ou https://…', hint: 'Une page du site (ex. tarifs.html) ou une adresse complète.' }
    ], s.announcement, mark);
    const fStk = Form($('#s-stk', v), [
      { k: 'enabled', t: 'switch', l: 'Afficher la pastille' },
      { k: 'top', t: 'text', l: 'Ligne du haut', max: 14, half: true, placeholder: 'Saison' },
      { k: 'text', t: 'text', l: 'Ligne du bas', max: 24, half: true, placeholder: 'Inscriptions ouvertes', hint: 'Ex. « Inscriptions ouvertes », « Complet », « Stages d\'été ».' },
      { k: 'link', t: 'text', l: 'Lien au clic', placeholder: 'tarifs.html', hint: 'Une page du site (ex. tarifs.html, agenda.html) ou une adresse complète.' }
    ], s.sticker, mark);
    const fClub = Form($('#s-club', v), [
      { k: 'clubName', t: 'text', l: 'Nom du club', half: true }, { k: 'season', t: 'text', l: 'Saison en cours', half: true, placeholder: '2026-2027' },
      { k: 'address', t: 'text', l: 'Adresse' }, { k: 'zip', t: 'text', l: 'Code postal', half: true }, { k: 'city', t: 'text', l: 'Ville', half: true },
      { k: 'phone', t: 'text', l: 'Téléphone', half: true }, { k: 'email', t: 'text', l: 'E-mail', half: true },
      { k: 'weather', t: 'switch', l: 'Afficher la météo de Montargis dans l\'en-tête' }
    ], s, mark);
    const fLinks = Form($('#s-links', v), [
      { k: 'whatsappContact', t: 'text', l: 'WhatsApp pour les demandes des visiteurs', placeholder: '06 12 34 56 78', hint: 'Recommandé : un numéro (idéalement un numéro WhatsApp Business du club). Le visiteur vous écrit en privé avec un message prérempli (formule choisie). Un lien de groupe (chat.whatsapp.com/…) fonctionne aussi, mais chaque visiteur verrait les autres membres du groupe et leurs numéros. Laissez vide pour masquer les boutons WhatsApp.' },
      { k: 'tenup', t: 'url', l: 'Réservation Ten\'Up (page du club)' }, { k: 'competitions', t: 'url', l: 'Compétitions Ten\'Up' },
      { k: 'espaceMembre', t: 'text', l: 'Espace membre', placeholder: 'espace-membre.html', hint: 'Page du site (espace-membre.html) ou adresse complète d\'un espace hébergé ailleurs.' }, { k: 'facebook', t: 'url', l: 'Facebook' },
      { k: 'instagram', t: 'url', l: 'Instagram', hint: 'Laissez vide pour masquer l\'icône.' }, { k: 'whatsapp', t: 'url', l: 'Communauté WhatsApp (lien d\'invitation)', hint: 'Laissez vide pour masquer l\'icône du site et la carte « Communauté WhatsApp » de l\'espace membre.' }
    ], s.links, mark);
    const fMember = Form($('#s-member', v), [
      { k: 'showTeams', t: 'switch', l: 'Afficher la section Équipes (championnats, convocations)' }
    ], s, mark);
    const fRev = Form($('#s-rev', v), [
      { k: 'rating', t: 'text', l: 'Note moyenne', half: true, placeholder: '4,3' },
      { k: 'count', t: 'text', l: 'Nombre d\'avis', half: true, placeholder: '35' },
      { k: 'url', t: 'url', l: 'Lien « Lire tous les avis »', hint: 'La fiche Google Maps du club.' },
      { k: 'writeUrl', t: 'url', l: 'Lien « Laisser un avis »', hint: 'Dans Google Business Profile › « Demander des avis », copiez le lien court (g.page/r/…/review). Il ouvre directement la fenêtre de notation. À défaut, le lien de la fiche est utilisé.' }
    ], s.reviews, mark);
    const fSeo = Form($('#s-seo', v), [
      { k: 'title', t: 'text', l: 'Titre par défaut', max: 65 },
      { k: 'description', t: 'textarea', l: 'Description par défaut', max: 160, hint: 'Texte affiché sous le lien dans les résultats Google.' }
    ], s.seo, mark);
    function drawStats() {
      while (s.stats.length < 4) s.stats.push({ value: '', label: '' });
      $('#s-stats', v).innerHTML = s.stats.slice(0, 4).map((x, i) => `<div class="r two"><input type="text" value="${esc(x.value)}" data-sv="${i}" aria-label="Chiffre ${i + 1}" placeholder="150+"><input type="text" value="${esc(x.label)}" data-sl="${i}" aria-label="Légende ${i + 1}" placeholder="licenciés"><span></span></div>`).join('');
      $$('[data-sv]', v).forEach((el) => el.addEventListener('input', () => { s.stats[+el.dataset.sv].value = el.value; mark(); }));
      $$('[data-sl]', v).forEach((el) => el.addEventListener('input', () => { s.stats[+el.dataset.sl].label = el.value; mark(); }));
    }
    function drawHours() {
      $('#s-hours', v).innerHTML = s.hours.map((x, i) => `<div class="r"><input type="text" value="${esc(x.days)}" data-hd="${i}" aria-label="Jours" placeholder="Lundi – vendredi"><input type="time" value="${esc(x.open)}" data-ho="${i}" aria-label="Ouverture"><input type="time" value="${esc(x.close)}" data-hc="${i}" aria-label="Fermeture"><button type="button" class="btn btn-icon btn-ghost btn-danger" data-hx="${i}" title="Supprimer">${icon('trash')}</button></div>`).join('');
      $$('[data-hd]', v).forEach((el) => el.addEventListener('input', () => { s.hours[+el.dataset.hd].days = el.value; mark(); }));
      $$('[data-ho]', v).forEach((el) => el.addEventListener('input', () => { s.hours[+el.dataset.ho].open = el.value; mark(); }));
      $$('[data-hc]', v).forEach((el) => el.addEventListener('input', () => { s.hours[+el.dataset.hc].close = el.value; mark(); }));
      $$('[data-hx]', v).forEach((el) => el.addEventListener('click', () => { s.hours.splice(+el.dataset.hx, 1); drawHours(); mark(); }));
    }
    drawStats(); drawHours();
    $('#h-add', v).addEventListener('click', () => { s.hours.push({ days: '', open: '17:00', close: '20:00' }); drawHours(); mark(); });
    const pw = $('#pw-save', v);
    pw && pw.addEventListener('click', async () => {
      const a = $('#pw1', v).value, b = $('#pw2', v).value;
      if (a.length < 6) return toast('Choisissez au moins 6 caractères.', 'err');
      if (a !== b) return toast('Les deux mots de passe ne correspondent pas.', 'err');
      const next = Object.assign(clone(C.settings), { adminPasswordHash: await store.hash(a) });
      if (await persist('settings', next, 'Mot de passe modifié')) { $('#pw1', v).value = ''; $('#pw2', v).value = ''; }
    });
    const save = async () => {
      const club = fClub.collect();
      const next = Object.assign(clone(C.settings), club, fMember.collect(), {
        announcement: fAnn.collect(), sticker: fStk.collect(), links: fLinks.collect(), seo: fSeo.collect(), reviews: fRev.collect(),
        stats: s.stats.filter((x) => x.value || x.label), hours: s.hours.filter((x) => x.days)
      });
      if (await persist('settings', next, 'Paramètres enregistrés')) { dirty = false; st.classList.remove('dirty'); st.lastChild.textContent = 'Tout est enregistré'; }
    };
    $('#sv-save', v).addEventListener('click', save);
    current = { save };
  }

  /* ---------- Sauvegarde ---------- */
  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function viewBackup() {
    const v = shell('Sauvegarde', '');
    const size = new Blob([JSON.stringify(C)]).size;
    v.innerHTML = `<div style="display:grid;gap:16px;max-width:900px">
      ${store.isLocal ? `<div class="callout warn">${icon('info')}<div><b>Mode aperçu.</b> Vos modifications sont stockées dans ce navigateur uniquement (${Math.round(size / 1024)} Ko). Exportez une sauvegarde avant de changer d'ordinateur, de vider le cache ou de passer en production.</div></div>` : `<div class="callout">${icon('info')}<div>Le contenu est enregistré dans Firebase (nœud <code>${esc((window.USM_CONFIG || {}).dbRoot || 'site_v2')}</code>). Une sauvegarde régulière reste recommandée.</div></div>`}
      <section class="card form-card"><h2>${icon('download')} Exporter</h2><p class="muted">Télécharge tout le contenu du site (textes, actualités, tarifs, photos importées…) dans un fichier.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="b-exp">Télécharger la sauvegarde (.json)</button><button type="button" class="btn" id="b-exp-fb">Format d'import Firebase</button></div>
        <p class="hint small muted">Le format Firebase s'importe directement dans la Realtime Database (Console Firebase › Realtime Database › nœud <code>site_v2</code> › Importer JSON).</p></section>
      <section class="card form-card"><h2>${icon('upload')} Restaurer</h2><p class="muted">Remplace le contenu actuel par celui d'un fichier de sauvegarde.</p>
        <label class="dropzone" style="min-height:90px">${icon('upload')}<span>Choisir un fichier .json</span><input type="file" accept="application/json,.json" class="sr-only" id="b-imp"></label></section>
      ${store.isLocal ? `<section class="card form-card"><h2>Repartir du contenu d'origine</h2><p class="muted">Efface les modifications faites dans ce navigateur et recharge le contenu repris du site actuel.</p><div><button type="button" class="btn btn-danger" id="b-reset">Réinitialiser l'aperçu</button></div></section>` : ''}
    </div>`;
    const stamp = new Date().toISOString().slice(0, 10);
    $('#b-exp', v).addEventListener('click', () => { download(`usm-tennis-site-${stamp}.json`, JSON.stringify(C, null, 1)); toast('Sauvegarde téléchargée'); });
    $('#b-exp-fb', v).addEventListener('click', () => {
      const st = Object.assign({}, C.settings); delete st.adminPasswordHash; const out = { settings: st, texts: C.texts || {}, updatedAt: new Date().toISOString() };
      store.COLLECTIONS.filter((c) => c !== 'messages').forEach((c) => { out[c] = {}; (C[c] || []).filter((x) => !(c === 'shopProducts' && x.demo)).forEach((x, i) => { out[c][x.id] = Object.assign({ order: i + 1 }, x); }); });
      download(`usm-tennis-firebase-site_v2-${stamp}.json`, JSON.stringify(out, null, 1)); toast('Export Firebase téléchargé');
    });
    $('#b-imp', v).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.settings || !Array.isArray(data.news)) throw new Error('Ce fichier n\'est pas une sauvegarde du site.');
        if (!(await modal({ title: 'Restaurer cette sauvegarde ?', body: `${data.news.length} actualités, ${(data.events || []).length} événements, ${(data.rates || []).length} formules. Le contenu actuel sera remplacé.`, confirm: 'Restaurer', danger: true }))) return;
        await store.saveAll(Object.assign(store.seed(), data)); C = await store.reload(); toast('Sauvegarde restaurée'); route();
      } catch (err) { toast(err.message, 'err'); }
    });
    const rs = $('#b-reset', v);
    rs && rs.addEventListener('click', async () => {
      if (!(await modal({ title: 'Réinitialiser l\'aperçu ?', body: 'Toutes les modifications faites dans ce navigateur seront perdues.', confirm: 'Réinitialiser', danger: true }))) return;
      store.shop.resetDemo(); C = await store.resetLocal(); toast('Contenu d\'origine rechargé'); route();
    });
  }

  /* =====================================================================
     Connexion
     ===================================================================== */
  function renderLogin(err) {
    app.innerHTML = `<div class="login">
      <div class="login-art"><svg class="lines" viewBox="0 0 1097 2377" preserveAspectRatio="none" aria-hidden="true"><rect x="40" y="40" width="1017" height="2297"/><line x1="167" y1="40" x2="167" y2="2337"/><line x1="930" y1="40" x2="930" y2="2337"/><line x1="167" y1="570" x2="930" y2="570"/><line x1="167" y1="1807" x2="930" y2="1807"/><line x1="548" y1="570" x2="548" y2="1807"/><line x1="10" y1="1188" x2="1087" y2="1188" stroke-dasharray="2 6"/></svg>
        <div class="brand"><img src="../assets/img/brand/logo-usm.webp" alt=""><div><b style="font-family:var(--font-display);font-stretch:115%;font-size:18px;text-transform:uppercase">USM Tennis</b><div style="opacity:.7;font-size:13px">Montargis</div></div></div>
        <div><h1>Espace <em>club</em></h1><p>Actualités, agenda, tarifs, partenaires : gérez tout le site du club depuis un seul endroit, sur ordinateur comme sur téléphone.</p></div></div>
      <div class="login-form"><form class="login-card" id="login" novalidate>
        <div><h2>Connexion</h2><p class="muted" style="margin-top:6px">Réservé aux membres du bureau.</p></div>
        ${err ? `<div class="login-error" role="alert">${esc(err)}</div>` : ''}
        ${store.isLocal ? `<div class="login-hint"><b>Mode aperçu :</b> mot de passe par défaut <code>${esc((window.USM_CONFIG || {}).localAdminPassword || 'usm2026')}</code> (modifiable dans Paramètres).</div>` : ''}
        <div class="field"${store.isLocal ? ' hidden' : ''}><label for="lg-email">E-mail</label><input type="email" id="lg-email" autocomplete="username" required></div>
        <div class="field"><label for="lg-pass">Mot de passe</label><input type="password" id="lg-pass" autocomplete="current-password" required></div>
        <button type="submit" class="btn btn-primary" style="min-height:46px">${icon('logout', '')} Se connecter</button>
        ${store.isLocal ? '' : '<button type="button" class="btn btn-ghost" id="lg-forgot">Mot de passe oublié ?</button>'}
        <a href="../index.html" class="small" style="text-align:center">← Retour au site</a>
      </form></div></div>`;
    const f = $('#login');
    setTimeout(() => $('#lg-pass').focus(), 50);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button[type=submit]', f); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Connexion…';
      try { await store.login($('#lg-email').value.trim(), $('#lg-pass').value); if (!store.isLocal) { try { localStorage.setItem('usm_no_clarity', '1'); } catch (e) { /* ignore */ } } C = await store.load(); if (!location.hash || location.hash === '#/') location.hash = '#/tableau'; route(); }
      catch (err2) { renderLogin(err2.code === 'auth/invalid-credential' || err2.code === 'auth/wrong-password' ? 'E-mail ou mot de passe incorrect.' : err2.message); }
    });
    const fg = $('#lg-forgot');
    fg && fg.addEventListener('click', async () => {
      const email = $('#lg-email').value.trim();
      if (!email) return renderLogin('Saisissez votre e-mail puis cliquez sur « Mot de passe oublié ».');
      try { await store.resetPassword(email); toast('E-mail de réinitialisation envoyé'); } catch (e2) { toast(e2.message, 'err'); }
    });
  }

  /* =====================================================================
     Routeur
     ===================================================================== */
  let lastHash = location.hash;
  async function route() {
    if (!store.user) return renderLogin();
    current = null;
    const [r, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
    window.scrollTo(0, 0);
    if (!r || r === 'tableau' || r === 'boutique') await loadShopSum();
    if (!r || r === 'tableau') viewDashboard();
    else if (r === 'boutique' && id && sub === 'suivi') await viewShopOrders(id);
    else if (ROUTES[r]) id ? viewEdit(ROUTES[r], id) : viewList(ROUTES[r]);
    else if (r === 'galerie') viewGallery();
    else if (r === 'messages') await viewMessages();
    else if (r === 'textes') viewTexts();
    else if (r === 'reglages') viewSettings();
    else if (r === 'sauvegarde') viewBackup();
    else location.hash = '#/tableau';
    lastHash = location.hash;
  }
  window.addEventListener('hashchange', async () => {
    if (dirty) {
      const go = await confirmLeave();
      if (!go) { history.replaceState(null, '', lastHash); return; }
      dirty = false;
    }
    route();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && current && current.save) { e.preventDefault(); current.save(); }
  });

  (async function start() {
    try { const t = localStorage.getItem('usm_admin_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { /* ignore */ }
    C = await store.load();
    await store.restoreSession();
    route();
  })();
})();

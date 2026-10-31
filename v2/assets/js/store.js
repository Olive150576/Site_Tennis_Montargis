/* =====================================================================
   Couche de données partagée (site public + admin)
   - mode 'local'    : seed + modifications stockées dans le navigateur
   - mode 'firebase' : Realtime Database (lecture REST publique, écriture SDK)
   Boutique (commandes groupées) : catalogue dans site_v2/shopProducts,
   réservations des membres hors site_v2 → voir Store.shop plus bas.
   ===================================================================== */
(function () {
  'use strict';
  const CFG = window.USM_CONFIG || { mode: 'local' };
  const KEY = 'usm_v2_content';
  const COLLECTIONS = ['news', 'events', 'rates', 'team', 'slots', 'facilities', 'sponsors', 'sponsorPacks', 'documents', 'gallery', 'faq', 'reviews', 'shopProducts', 'messages'];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const seed = () => clone(window.USM_SEED || {});

  /* ---------- Stockage navigateur (IndexedDB avec repli localStorage) ---------- */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open('usm-site', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => { this.db = req.result; resolve(this.db); };
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const r = db.transaction('kv', 'readonly').objectStore('kv').get(k);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async set(k, v) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async del(k) {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  };
  let memory = null; // dernier recours si le navigateur refuse tout stockage

  /* Aperçu : seules les parties modifiées dans l'admin (_edited) viennent du navigateur ;
     le reste suit le contenu par défaut, pour que les mises à jour du site (photos,
     textes…) apparaissent même après une modification dans l'admin. */
  const sameIds = (a, b) => JSON.stringify((a || []).map((x) => x && x.id)) === JSON.stringify((b || []).map((x) => x && x.id));
  /* Réglages (settings) : le navigateur ne garde ses propres valeurs que si « settings » a été modifié dans l'admin.
     Quand un réglage par défaut change (ex. les horaires), on augmente SETTINGS_REV et on ajoute sa clé à
     SETTINGS_RESET : les copies enregistrées avant cette version reprennent la nouvelle valeur par défaut. */
  const SETTINGS_REV = 3;
  const SETTINGS_RESET = ['hours', 'announcement'];
  function withSeed(saved) {
    const base = seed();
    if (!saved) return base;
    let edited = saved._edited;
    const legacy = !Array.isArray(edited);
    if (legacy) {
      // Ancien format (tout était enregistré) : on garde les listes où des fiches ont été ajoutées/retirées
      edited = COLLECTIONS.filter((c) => c !== 'messages' && saved[c] !== undefined && !sameIds(saved[c], base[c])).concat('texts');
    }
    const mine = (legacy || edited.indexOf('settings') !== -1) ? Object.assign({}, saved.settings || {}) : {};
    if ((saved.settingsRev || 0) < SETTINGS_REV) SETTINGS_RESET.forEach((k) => { delete mine[k]; });
    const out = Object.assign(base, { settings: Object.assign({}, base.settings, mine), settingsRev: SETTINGS_REV });
    edited.forEach((p) => { if (p !== 'settings' && saved[p] !== undefined) out[p] = saved[p]; });
    if (saved.messages) out.messages = saved.messages;
    if (saved.updatedAt) out.updatedAt = saved.updatedAt;
    out._edited = edited.slice();
    return out;
  }
  async function readLocal() {
    try { const v = await idb.get(KEY); if (v) return v; } catch (e) { /* repli */ }
    try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* repli */ }
    return memory;
  }
  async function writeLocal(data) {
    let ok = false;
    try { await idb.set(KEY, data); ok = true; } catch (e) { /* repli */ }
    if (!ok) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); ok = true; } catch (e) { /* repli */ }
    }
    if (!ok) memory = data;
    try { localStorage.setItem(KEY + '_ping', String(Date.now())); } catch (e) { /* notifie les autres onglets */ }
    return ok;
  }

  /* ---------- Firebase ---------- */
  const toObj = (arr) => {
    const o = {};
    (arr || []).forEach((it, i) => { if (it && it.id) o[it.id] = Object.assign({ order: i + 1 }, it); });
    return o;
  };
  const toArr = (obj) => {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj.filter(Boolean);
    return Object.keys(obj).map((k) => Object.assign({ id: k }, obj[k]));
  };
  function normalizeRemote(raw) {
    const base = seed();
    if (!raw) return noDemoShop(base);
    const out = Object.assign({}, base, { settings: Object.assign({}, base.settings, raw.settings || {}), texts: raw.texts || {} });
    COLLECTIONS.forEach((c) => { if (raw[c] !== undefined) out[c] = toArr(raw[c]); });
    ['team', 'facilities', 'sponsors', 'faq', 'rates', 'reviews', 'shopProducts'].forEach((c) => out[c].sort((a, b) => (a.order || 0) - (b.order || 0)));
    return noDemoShop(out);
  }
  /* Boutique : fin de la date limite en millisecondes, lue par les règles Firebase */
  const withDeadlineTs = (arr) => (arr || []).map((p) => (p && p.deadline ? Object.assign({}, p, { deadlineTs: new Date(p.deadline + 'T23:59:59').getTime() }) : p));
  /* Boutique : les produits d'exemple (demo) ne vivent qu'en mode aperçu */
  function noDemoShop(c) { c.shopProducts = (c.shopProducts || []).filter((p) => p && !p.demo); return c; }
  const isoDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  /* Aperçu : tant que la boutique n'a pas été modifiée dans l'admin, les dates des
     produits d'exemple suivent la date du jour (sinon la démo « vieillit »). */
  function demoDates(c) {
    if ((c._edited || []).indexOf('shopProducts') !== -1) return c;
    (c.shopProducts || []).forEach((p) => {
      if (!p._demo) return;
      p.deadline = isoDay(p._demo.deadline); delete p.deadlineTs;
      if (p._demo.delivery != null) p.deliveryDate = isoDay(p._demo.delivery);
    });
    return c;
  }
  let fbReady = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Chargement impossible : ' + src));
      document.head.appendChild(s);
    });
  }
  function firebaseSDK() {
    if (fbReady) return fbReady;
    // Firebase déjà chargé et initialisé par la page (ex. espace membre) : on le réutilise
    if (window.firebase && firebase.apps && firebase.apps.length && firebase.database && firebase.auth) return (fbReady = Promise.resolve(firebase));
    const v = '10.12.2', b = 'https://www.gstatic.com/firebasejs/' + v + '/';
    fbReady = loadScript(b + 'firebase-app-compat.js')
      .then(() => Promise.all(['auth', 'database', 'storage'].map((m) => loadScript(b + 'firebase-' + m + '-compat.js'))))
      .then(() => {
        if (!firebase.apps.length) {
          firebase.initializeApp(CFG.firebase);
          const E = CFG.emulators;
          if (E) { // tests uniquement (voir config.js)
            firebase.auth().useEmulator('http://' + E.host + ':' + E.auth);
            firebase.database().useEmulator(E.host, E.database);
            firebase.storage().useEmulator(E.host, E.storage);
          }
        }
        return firebase;
      });
    return fbReady;
  }
  /* Adresse REST de la base (lecture publique sans charger le SDK) */
  function restUrl(path) {
    const E = CFG.emulators;
    if (E) return 'http://' + E.host + ':' + E.database + '/' + path + '.json?ns=' + E.ns;
    return CFG.firebase.databaseURL + '/' + path + '.json';
  }
  /* Storage n'a pas accès à la liste admins/ de la base : il vérifie le « custom claim »
     admin du compte. On le fait poser par la Cloud Function grantAdminClaim (qui contrôle
     admins/{uid}) puis on rafraîchit le jeton, sinon les envois de photos/PDF sont refusés. */
  let claimReady = null;
  function ensureAdminClaim(fb, user) {
    if (claimReady) return claimReady;
    claimReady = (async () => {
      const tok = await user.getIdTokenResult();
      if (tok.claims && tok.claims.admin === true) return true;
      if (!fb.functions) await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js');
      if (CFG.emulators) fb.functions().useEmulator(CFG.emulators.host, CFG.emulators.functions);
      await fb.functions().httpsCallable('grantAdminClaim')();
      await user.getIdToken(true);
      return true;
    })().catch((e) => { claimReady = null; console.warn('[USM] Droit admin Storage non accordé', e); return false; });
    return claimReady;
  }
  /* Ne jamais publier l'empreinte du mot de passe de l'aperçu (site_v2 est lisible par tous) */
  const publicSettings = (s) => { const o = Object.assign({}, s || {}); delete o.adminPasswordHash; return o; };
  const root = () => (CFG.dbRoot || 'site_v2');
  const msgRoot = () => root() + '_messages'; // nœud séparé : lisible uniquement par les admins

  /* ---------- Images : redimensionnement dans le navigateur ---------- */
  function readAsImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = url;
    });
  }
  function resizeTo(img, maxW, type, quality) {
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => c.toBlob((blob) => resolve({ blob, w, h }), type, quality));
  }
  const blobToDataURL = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });

  /* =====================================================================
     Boutique — commandes groupées (espace membre + admin)
     ---------------------------------------------------------------------
     Firebase (hors site_v2, données de membres) :
       boutique_reservations/{produit}/{uid}/{reservation}
           = { size, color, qty, marking, unitPrice, total, status, paid, pickedUp,
               createdAt, updatedAt, name }      (name : affichage dans l'admin)
       boutique_compteurs/{produit} = { total, parTaille: { M: 4 … }, attente }
           lisible par les membres connectés, mis à jour par transaction
       boutique_attente/{produit}/{uid} = date   (« Prévenez-moi à la prochaine commande »)
       boutique_avis/{uid}/{id} = { pid, type, title, text, at }   (messages du bureau)
     Mode aperçu : même logique dans le navigateur (clé usm_boutique_v1, partagée
     entre l'admin et l'espace membre), avec des réservations fictives.
     Statut d'une réservation : reservee → commandee → disponible → retiree (ou annulee).
     ===================================================================== */
  const SHOP_KEY = 'usm_boutique_v1';
  const SHOP_NODES = { res: 'boutique_reservations', cnt: 'boutique_compteurs', wait: 'boutique_attente', notes: 'boutique_avis' };
  const sizeKey = (s) => String(s == null ? '' : s).replace(/[.#$/[\]]/g, '_');
  const deadlineEnd = (p) => p.deadlineTs || (p.deadline ? new Date(p.deadline + 'T23:59:59').getTime() : 0);
  const RES_STATUS = { ouverte: 'reservee', commandee: 'commandee', disponible: 'disponible', annulee: 'annulee' };
  const shopUid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function checkChoice(p, choice, mineQty) {
    if (!p || p.draft) throw new Error('Ce produit n\'est plus proposé.');
    if (p.status !== 'ouverte') throw new Error('La commande est lancée ou terminée : contactez le bureau.');
    if (Date.now() > deadlineEnd(p)) throw new Error('La date limite est passée : contactez le bureau.');
    const qty = Math.round(Number(choice.qty) || 0);
    if (qty < 1) throw new Error('Choisissez au moins une pièce.');
    if ((p.sizes || []).length && (p.sizes || []).indexOf(choice.size) === -1) throw new Error('Choisissez une taille.');
    if ((p.colors || []).length > 1 && (p.colors || []).indexOf(choice.color) === -1) throw new Error('Choisissez une couleur.');
    if (p.maxPerMember && mineQty + qty > p.maxPerMember) throw new Error('Maximum ' + p.maxPerMember + ' pièce' + (p.maxPerMember > 1 ? 's' : '') + ' par membre pour ce produit.');
    const marking = p.marking ? String(choice.marking || '').trim().toUpperCase().slice(0, 12) : '';
    const unitPrice = Number(p.priceMember || 0) + (marking ? Number(p.markingPrice || 0) : 0);
    return { size: choice.size || (p.sizes || [])[0] || 'Taille unique', color: choice.color || (p.colors || [])[0] || '', qty, marking, unitPrice, total: Math.round(unitPrice * qty * 100) / 100 };
  }
  function countOf(byUid) {
    const c = { total: 0, parTaille: {} };
    Object.keys(byUid || {}).forEach((u) => Object.keys(byUid[u] || {}).forEach((rid) => {
      const r = byUid[u][rid]; if (!r || r.status === 'annulee') return;
      c.total += r.qty || 0; const k = sizeKey(r.size); c.parTaille[k] = (c.parTaille[k] || 0) + (r.qty || 0);
    }));
    return c;
  }
  const flatRes = (byUid) => {
    const out = [];
    Object.keys(byUid || {}).forEach((u) => Object.keys(byUid[u] || {}).forEach((rid) => out.push(Object.assign({ uid: u, id: rid }, byUid[u][rid]))));
    return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  /* ---------- Mode aperçu : réservations fictives pour des compteurs vivants ---------- */
  function shopDemo() {
    const N = { p1: 'Sophie Laurent', p2: 'Karim Benali', p3: 'Hélène Roy', p4: 'Thomas Girard', p5: 'Nadia Petit', p6: 'Marc Fontaine', p7: 'Léa Moreau', p8: 'Philippe Dubois', p9: 'Yann Leroy',
      u10: 'Camille Bernard', u11: 'Lucas Martin', u12: 'Inès Garnier', u13: 'Paul Chevalier', u14: 'Emma Rousseau', u15: 'Hugo Lambert', u16: 'Chloé Fournier', u17: 'Manon Faure', u18: 'Louis Blanc', u19: 'Sarah Henry', u20: 'Antoine Morel', u21: 'Julie Simon', u22: 'Rémi Caron' };
    const res = {}; let t = Date.now() - 9 * 864e5;
    const add = (pid, u, size, color, qty, unit, marking, extra) => {
      t += 3.7 * 36e5; const id = 'd' + (t).toString(36);
      ((res[pid] = res[pid] || {})[u] = res[pid][u] || {})[id] = Object.assign({ size, color, qty, marking: marking || '', unitPrice: unit, total: unit * qty, status: 'reservee', paid: false, pickedUp: false, createdAt: t, updatedAt: t, name: N[u] || 'Julien Mercier' }, extra || {});
    };
    // Veste : 18 pièces sur 25
    [['p1', 'S', 1, 'SOPHIE'], ['p2', 'L', 1], ['p4', 'M', 1], ['p5', 'S', 1, 'NADIA'], ['p6', 'XL', 1], ['p7', 'XS', 1], ['p9', 'L', 2], ['u10', 'M', 1], ['u11', '12 ans', 1, 'LUCAS'], ['u11', '14 ans', 1],
      ['u12', 'S', 1], ['u13', 'XXL', 1], ['u14', 'M', 2], ['u15', '10 ans', 1], ['u16', 'L', 1], ['u17', 'M', 1, 'MANON']]
      .forEach(([u, s, q, m]) => add('sp-veste', u, s, 'Bleu royal', q, m ? 44 : 39, m));
    // T-shirt : 31 pièces sur 30 (objectif atteint)
    [['p1', 'S', 'Blanc', 2], ['p2', 'L', 'Bleu royal', 1], ['p3', 'M', 'Jaune balle', 1], ['p4', 'M', 'Bleu royal', 2], ['p5', 'S', 'Bleu royal', 1, 'NADIA'], ['p6', 'XL', 'Blanc', 1],
      ['p8', 'L', 'Bleu royal', 1], ['p9', 'L', 'Blanc', 1], ['u10', '8 ans', 'Jaune balle', 2], ['u11', '12 ans', 'Bleu royal', 2], ['u12', 'XS', 'Blanc', 1], ['u13', 'XXL', 'Bleu royal', 1],
      ['u14', '10 ans', 'Bleu royal', 3], ['u15', 'M', 'Blanc', 1], ['u16', 'S', 'Jaune balle', 2], ['u18', 'L', 'Bleu royal', 2], ['u19', '6 ans', 'Bleu royal', 1], ['u20', 'XL', 'Bleu royal', 2],
      ['u21', 'M', 'Blanc', 2], ['u22', 'L', 'Jaune balle', 2]]
      .forEach(([u, s, c, q, m]) => add('sp-tshirt', u, s, c, q, m ? 18 : 15, m));
    // Casquette : campagne terminée, tout le monde a payé et retiré (dont le compte démo)
    t = Date.now() - 95 * 864e5;
    [['p1', 'Blanc', 1], ['p2', 'Bleu marine', 2], ['p4', 'Bleu marine', 1], ['p5', 'Blanc', 1], ['p6', 'Bleu marine', 1], ['p7', 'Blanc', 1], ['p9', 'Bleu marine', 2], ['u10', 'Bleu marine', 1],
      ['u12', 'Blanc', 1], ['u13', 'Bleu marine', 1], ['u14', 'Bleu marine', 2], ['u16', 'Blanc', 1], ['u18', 'Bleu marine', 2], ['u20', 'Blanc', 1], ['u21', 'Bleu marine', 1], ['me', 'Bleu marine', 1]]
      .forEach(([u, c, q]) => add('sp-casquette', u, 'Taille unique', c, q, 12, '', { status: 'retiree', paid: true, pickedUp: true }));
    const wait = { 'sp-casquette': { p3: Date.now() - 20 * 864e5, p8: Date.now() - 12 * 864e5, u11: Date.now() - 9 * 864e5, u15: Date.now() - 6 * 864e5, u17: Date.now() - 4 * 864e5, u19: Date.now() - 2 * 864e5 } };
    return { v: 1, res, wait, notes: [] };
  }
  const shopLocal = {
    read() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(SHOP_KEY) || 'null'); } catch (e) { /* repli */ }
      if (!d || d.v !== 1) { d = shopLocal.mem || shopDemo(); shopLocal.write(d); }
      return d;
    },
    write(d) {
      shopLocal.mem = d;
      try { localStorage.setItem(SHOP_KEY, JSON.stringify(d)); } catch (e) { /* navigation privée : reste en mémoire */ }
    },
    mem: null
  };
  async function fbShop(needUser) {
    const fb = await firebaseSDK();
    const u = fb.auth().currentUser;
    if (needUser && !u) throw new Error('Connectez-vous à votre espace membre pour réserver.');
    return { db: fb.database(), uid: u && u.uid, now: firebase.database.ServerValue.TIMESTAMP };
  }
  /* Compteur public : transaction (deux réservations simultanées ne s'écrasent pas) */
  function fbBump(db, pid, changes, attente) {
    return db.ref(SHOP_NODES.cnt + '/' + pid).transaction((c) => {
      c = c || {}; c.total = c.total || 0; c.parTaille = c.parTaille || {};
      (changes || []).forEach((x) => { const k = sizeKey(x.size); c.parTaille[k] = Math.max(0, (c.parTaille[k] || 0) + x.d); if (!c.parTaille[k]) delete c.parTaille[k]; c.total = Math.max(0, c.total + x.d); });
      if (attente) c.attente = Math.max(0, (c.attente || 0) + attente);
      return c;
    });
  }

  const Shop = {
    sizeKey, deadlineEnd, NODES: SHOP_NODES,

    /* Vue membre : compteurs, mes réservations, ma liste d'attente, messages du bureau */
    async state(products, uid) {
      const ids = (products || []).map((p) => p.id);
      if (Store.isLocal) {
        const d = shopLocal.read(), me = uid || 'me', out = { counters: {}, mine: {}, waiting: {}, notes: [] };
        ids.forEach((pid) => {
          const c = countOf(d.res[pid]); c.attente = Object.keys((d.wait || {})[pid] || {}).length; out.counters[pid] = c;
          out.mine[pid] = flatRes({ [me]: ((d.res[pid] || {})[me]) || {} });
          if (((d.wait || {})[pid] || {})[me]) out.waiting[pid] = true;
        });
        out.notes = (d.notes || []).filter((n) => n.uid === me);
        return out;
      }
      const { db, uid: u } = await fbShop(false);
      const out = { counters: {}, mine: {}, waiting: {}, notes: [] };
      if (!u) return out;
      const cnt = (await db.ref(SHOP_NODES.cnt).once('value')).val() || {};
      await Promise.all(ids.map(async (pid) => {
        out.counters[pid] = Object.assign({ total: 0, parTaille: {} }, cnt[pid] || {});
        out.mine[pid] = flatRes({ [u]: (await db.ref(SHOP_NODES.res + '/' + pid + '/' + u).once('value')).val() || {} });
        if ((await db.ref(SHOP_NODES.wait + '/' + pid + '/' + u).once('value')).exists()) out.waiting[pid] = true;
      }));
      const notes = (await db.ref(SHOP_NODES.notes + '/' + u).once('value')).val() || {};
      out.notes = Object.keys(notes).map((k) => Object.assign({ id: k }, notes[k]));
      return out;
    },

    async reserve(p, choice, who) {
      who = who || {};
      if (Store.isLocal) {
        const d = shopLocal.read(), me = who.uid || 'me';
        const mine = flatRes({ [me]: ((d.res[p.id] || {})[me]) || {} }).reduce((n, r) => n + (r.qty || 0), 0);
        const r = Object.assign(checkChoice(p, choice, mine), { status: 'reservee', paid: false, pickedUp: false, createdAt: Date.now(), updatedAt: Date.now(), name: who.name || '' });
        const id = shopUid();
        ((d.res[p.id] = d.res[p.id] || {})[me] = d.res[p.id][me] || {})[id] = r;
        shopLocal.write(d);
        return Object.assign({ id }, r);
      }
      const { db, uid, now } = await fbShop(true);
      const ref = db.ref(SHOP_NODES.res + '/' + p.id + '/' + uid);
      const mineObj = (await ref.once('value')).val() || {};
      const mine = Object.keys(mineObj).reduce((n, k) => n + (mineObj[k].qty || 0), 0);
      const r = Object.assign(checkChoice(p, choice, mine), { status: 'reservee', paid: false, pickedUp: false, createdAt: now, updatedAt: now, name: who.name || '' });
      const id = ref.push().key;
      await fbBump(db, p.id, [{ size: r.size, d: r.qty }]);
      try { await ref.child(id).set(r); } catch (e) { await fbBump(db, p.id, [{ size: r.size, d: -r.qty }]); throw e; }
      return Object.assign({ id }, r, { createdAt: Date.now(), updatedAt: Date.now() });
    },

    async update(p, rid, choice, who) {
      who = who || {};
      if (Store.isLocal) {
        const d = shopLocal.read(), me = who.uid || 'me', mineObj = ((d.res[p.id] || {})[me]) || {};
        const old = mineObj[rid]; if (!old) throw new Error('Réservation introuvable.');
        const others = Object.keys(mineObj).filter((k) => k !== rid).reduce((n, k) => n + (mineObj[k].qty || 0), 0);
        mineObj[rid] = Object.assign({}, old, checkChoice(p, choice, others), { updatedAt: Date.now() });
        shopLocal.write(d);
        return Object.assign({ id: rid }, mineObj[rid]);
      }
      const { db, uid, now } = await fbShop(true);
      const ref = db.ref(SHOP_NODES.res + '/' + p.id + '/' + uid);
      const mineObj = (await ref.once('value')).val() || {};
      const old = mineObj[rid]; if (!old) throw new Error('Réservation introuvable.');
      const others = Object.keys(mineObj).filter((k) => k !== rid).reduce((n, k) => n + (mineObj[k].qty || 0), 0);
      const next = checkChoice(p, choice, others);
      await fbBump(db, p.id, [{ size: old.size, d: -old.qty }, { size: next.size, d: next.qty }]);
      try { await ref.child(rid).update(Object.assign({}, next, { updatedAt: now })); } catch (e) { await fbBump(db, p.id, [{ size: next.size, d: -next.qty }, { size: old.size, d: old.qty }]); throw e; }
      return Object.assign({ id: rid }, old, next);
    },

    async cancel(p, rid, who) {
      who = who || {};
      if (!p || p.status !== 'ouverte') throw new Error('La commande est lancée : contactez le bureau pour annuler.');
      if (Date.now() > deadlineEnd(p)) throw new Error('La date limite est passée : contactez le bureau pour annuler.');
      if (Store.isLocal) {
        const d = shopLocal.read(), me = who.uid || 'me', mineObj = ((d.res[p.id] || {})[me]) || {};
        if (!mineObj[rid]) throw new Error('Réservation introuvable.');
        delete mineObj[rid]; shopLocal.write(d); return true;
      }
      const { db, uid } = await fbShop(true);
      const ref = db.ref(SHOP_NODES.res + '/' + p.id + '/' + uid + '/' + rid);
      const old = (await ref.once('value')).val(); if (!old) throw new Error('Réservation introuvable.');
      await ref.remove();
      await fbBump(db, p.id, [{ size: old.size, d: -old.qty }]);
      return true;
    },

    /* Liste d'attente « Prévenez-moi à la prochaine commande » */
    async wait(p, on, who) {
      who = who || {};
      if (Store.isLocal) {
        const d = shopLocal.read(), me = who.uid || 'me'; d.wait = d.wait || {}; d.wait[p.id] = d.wait[p.id] || {};
        if (on) d.wait[p.id][me] = Date.now(); else delete d.wait[p.id][me];
        shopLocal.write(d); return on;
      }
      const { db, uid, now } = await fbShop(true);
      const ref = db.ref(SHOP_NODES.wait + '/' + p.id + '/' + uid);
      const was = (await ref.once('value')).exists();
      if (on === was) return on;
      if (on) await ref.set(now); else await ref.remove();
      await fbBump(db, p.id, [], on ? 1 : -1);
      return on;
    },

    /* ---------- Admin ---------- */
    async list(pid) {
      if (Store.isLocal) return flatRes(shopLocal.read().res[pid]);
      const { db } = await fbShop(false);
      return flatRes((await db.ref(SHOP_NODES.res + '/' + pid).once('value')).val() || {});
    },
    async waitCount(pid) {
      if (Store.isLocal) return Object.keys((shopLocal.read().wait || {})[pid] || {}).length;
      const { db } = await fbShop(false);
      return (await db.ref(SHOP_NODES.wait + '/' + pid).once('value')).numChildren();
    },
    async summary(products) {
      const out = {};
      await Promise.all((products || []).map(async (p) => {
        const list = await Shop.list(p.id), live = list.filter((r) => r.status !== 'annulee');
        const c = countOf({ x: Object.assign({}, ...live.map((r) => ({ [r.id]: r }))) });
        out[p.id] = { total: c.total, parTaille: c.parTaille, amount: live.reduce((n, r) => n + (r.total || 0), 0), unpaid: live.filter((r) => !r.paid).reduce((n, r) => n + (r.total || 0), 0),
          members: new Set(live.map((r) => r.uid)).size, reservations: live.length, attente: await Shop.waitCount(p.id) };
      }));
      return out;
    },
    async setFlags(pid, uid, rid, patch) {
      const clean = {}; ['paid', 'pickedUp'].forEach((k) => { if (k in patch) clean[k] = !!patch[k]; });
      if (Store.isLocal) {
        const d = shopLocal.read(), r = ((d.res[pid] || {})[uid] || {})[rid]; if (!r) throw new Error('Réservation introuvable.');
        Object.assign(r, clean, { updatedAt: Date.now() });
        if ('pickedUp' in clean) r.status = clean.pickedUp ? 'retiree' : (r.status === 'retiree' ? 'disponible' : r.status);
        shopLocal.write(d); return r;
      }
      const { db, now } = await fbShop(false);
      const ref = db.ref(SHOP_NODES.res + '/' + pid + '/' + uid + '/' + rid);
      const r = (await ref.once('value')).val() || {};
      if ('pickedUp' in clean) clean.status = clean.pickedUp ? 'retiree' : (r.status === 'retiree' ? 'disponible' : r.status);
      await ref.update(Object.assign(clean, { updatedAt: now }));
      return Object.assign(r, clean);
    },
    /* Passage d'étape décidé par le bureau : met à jour le statut de chaque réservation */
    async setStatus(p, status) {
      const next = RES_STATUS[status];
      if (!next) return;
      if (Store.isLocal) {
        const d = shopLocal.read();
        flatRes(d.res[p.id]).forEach((r) => { const o = d.res[p.id][r.uid][r.id]; if (!o.pickedUp || status === 'annulee') o.status = next; o.updatedAt = Date.now(); });
        shopLocal.write(d); return;
      }
      const { db } = await fbShop(false);
      const all = flatRes((await db.ref(SHOP_NODES.res + '/' + p.id).once('value')).val() || {});
      const up = {}; all.forEach((r) => { if (!r.pickedUp || status === 'annulee') up[p.id + '/' + r.uid + '/' + r.id + '/status'] = next; });
      if (Object.keys(up).length) await db.ref(SHOP_NODES.res).update(up);
    },
    /* Message du bureau aux membres concernés (affiché dans leur espace ; email plus tard) */
    async notify(pid, uids, note) {
      const at = Date.now(), uniq = Array.from(new Set(uids || []));
      if (Store.isLocal) {
        const d = shopLocal.read(); d.notes = d.notes || [];
        uniq.forEach((u) => d.notes.unshift(Object.assign({ id: shopUid(), uid: u, pid, at }, note)));
        shopLocal.write(d); return uniq.length;
      }
      const { db } = await fbShop(false);
      const up = {}; uniq.forEach((u) => { up[u + '/' + db.ref().push().key] = Object.assign({ pid, at }, note); });
      if (Object.keys(up).length) await db.ref(SHOP_NODES.notes).update(up);
      return uniq.length;
    },
    /* Remet le compteur public en accord avec les réservations (en cas d'écart) */
    async recount(pid) {
      if (Store.isLocal) return true;
      const { db } = await fbShop(false);
      const c = countOf((await db.ref(SHOP_NODES.res + '/' + pid).once('value')).val() || {});
      c.attente = (await db.ref(SHOP_NODES.wait + '/' + pid).once('value')).numChildren();
      await db.ref(SHOP_NODES.cnt + '/' + pid).set(c);
      return true;
    },
    resetDemo() { if (Store.isLocal) { shopLocal.mem = null; try { localStorage.removeItem(SHOP_KEY); } catch (e) { /* ignore */ } } }
  };

  /* ---------- API publique ---------- */
  const Store = {
    mode: CFG.mode,
    content: null,
    isLocal: CFG.mode !== 'firebase',
    user: null,

    async load() {
      if (this.content) return this.content;
      if (this.isLocal) {
        const saved = await readLocal();
        this.content = demoDates(withSeed(saved));
      } else {
        try {
          const res = await fetch(restUrl(root()));
          const raw = res.ok ? await res.json() : null;
          this.remoteEmpty = res.ok && !raw; // rien encore publié dans site_v2 : on affiche le contenu de départ
          this.content = normalizeRemote(raw);
        } catch (e) {
          console.warn('[USM] Base indisponible, contenu de secours utilisé', e);
          this.content = noDemoShop(seed());
        }
      }
      return this.content;
    },

    async reload() { this.content = null; return this.load(); },

    /* Lecture publique d'un nœud de l'ancien site (ex. 'news'), même en mode aperçu */
    async fetchLegacy(node) {
      const res = await fetch(restUrl(node));
      if (!res.ok) throw new Error('Lecture de l\'ancien site impossible (' + res.status + ')');
      return res.json();
    },

    /* Enregistre une partie du contenu (collection, 'settings' ou 'texts') */
    async save(part, value) {
      await this.load();
      if (part === 'shopProducts') value = withDeadlineTs(value);
      this.content[part] = value;
      this.content.updatedAt = new Date().toISOString();
      if (this.isLocal) {
        // Repart de la dernière version enregistrée (un autre onglet a pu ajouter un message)
        const latest = withSeed((await readLocal()) || this.content);
        latest[part] = value;
        latest.updatedAt = this.content.updatedAt;
        if (part !== 'messages' && latest._edited.indexOf(part) === -1) latest._edited.push(part);
        this.content = latest;
        return writeLocal(latest);
      }
      const fb = await firebaseSDK();
      if (part === 'messages') {
        // Pas de set() global : un message envoyé depuis le site pendant que l'admin
        // lit la liste serait effacé. On ne touche qu'aux messages connus de l'admin.
        const known = this._msgIds || [];
        const next = toObj(value), upd = {};
        Object.keys(next).forEach((id) => { upd[id] = next[id]; });
        known.forEach((id) => { if (!next[id]) upd[id] = null; });
        if (Object.keys(upd).length) await fb.database().ref(msgRoot()).update(upd);
        this._msgIds = Object.keys(next);
        return true;
      }
      if (part === 'settings') value = publicSettings(value);
      const data = COLLECTIONS.includes(part) ? toObj(value) : value;
      await fb.database().ref(root() + '/' + part).set(data);
      await fb.database().ref(root() + '/updatedAt').set(this.content.updatedAt);
      return true;
    },

    async saveAll(content) {
      content.shopProducts = withDeadlineTs(content.shopProducts);
      this.content = content;
      if (this.isLocal) { content._edited = COLLECTIONS.filter((c) => c !== 'messages').concat('texts'); return writeLocal(content); }
      const fb = await firebaseSDK();
      const payload = { settings: publicSettings(content.settings), texts: content.texts || {}, updatedAt: new Date().toISOString() };
      COLLECTIONS.filter((c) => c !== 'messages').forEach((c) => { payload[c] = toObj(c === 'shopProducts' ? (content[c] || []).filter((p) => !p.demo) : content[c]); });
      await fb.database().ref(root()).update(payload);
      return true;
    },

    async resetLocal() {
      try { await idb.del(KEY); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      memory = null; this.content = null;
      return this.load();
    },

    /* Messages des formulaires publics */
    async addMessage(msg) {
      const m = Object.assign({ id: 'm' + Date.now().toString(36), createdAt: new Date().toISOString(), read: false }, msg);
      if (this.isLocal) {
        const saved = await readLocal();
        const latest = saved ? Object.assign({}, saved) : { _edited: [] };
        latest.messages = [m].concat(latest.messages || []);
        await writeLocal(latest);
        if (this.content) this.content.messages = latest.messages;
        return m;
      }
      const res = await fetch(restUrl(msgRoot() + '/' + m.id), { method: 'PUT', body: JSON.stringify(m) });
      if (!res.ok) throw new Error('Envoi impossible');
      return m;
    },

    async loadMessages() {
      if (this.isLocal) {
        const latest = await readLocal();
        const list = (latest && latest.messages) || (this.content && this.content.messages) || [];
        if (this.content) this.content.messages = list;
        return list;
      }
      const fb = await firebaseSDK();
      const snap = await fb.database().ref(msgRoot()).once('value');
      const list = toArr(snap.val()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      this._msgIds = list.map((m) => m.id);
      return list;
    },

    /* Authentification admin */
    async login(email, password) {
      if (this.isLocal) {
        const c = await this.load();
        const expected = (c.settings && c.settings.adminPasswordHash) || await Store.hash(CFG.localAdminPassword || 'usm2026');
        if (await Store.hash(password) !== expected) throw new Error('Mot de passe incorrect.');
        this.user = { email: email || 'admin@local', local: true };
        try { sessionStorage.setItem('usm_admin', '1'); } catch (e) { /* ignore */ }
        return this.user;
      }
      const fb = await firebaseSDK();
      const cred = await fb.auth().signInWithEmailAndPassword(email, password);
      const ok = await fb.database().ref('admins/' + cred.user.uid).once('value');
      if (!ok.exists()) { await fb.auth().signOut(); throw new Error("Ce compte n'a pas les droits d'administration."); }
      this.user = { email: cred.user.email, uid: cred.user.uid };
      await ensureAdminClaim(fb, cred.user);
      return this.user;
    },
    async restoreSession() {
      if (this.isLocal) {
        try { if (sessionStorage.getItem('usm_admin') === '1') { this.user = { email: 'admin@local', local: true }; } } catch (e) { /* ignore */ }
        return this.user;
      }
      const fb = await firebaseSDK();
      return new Promise((resolve) => {
        const off = fb.auth().onAuthStateChanged(async (u) => {
          off();
          if (!u) return resolve(null);
          const ok = await fb.database().ref('admins/' + u.uid).once('value');
          this.user = ok.exists() ? { email: u.email, uid: u.uid } : null;
          if (this.user) await ensureAdminClaim(fb, u);
          resolve(this.user);
        });
      });
    },
    async logout() {
      this.user = null; claimReady = null;
      if (this.isLocal) { try { sessionStorage.removeItem('usm_admin'); } catch (e) { /* ignore */ } return; }
      const fb = await firebaseSDK(); await fb.auth().signOut();
    },
    async resetPassword(email) {
      if (this.isLocal) throw new Error('En mode aperçu, le mot de passe se change dans Paramètres.');
      const fb = await firebaseSDK(); await fb.auth().sendPasswordResetEmail(email);
    },

    /* Téléversement d'image : renvoie { src, sm, w, h } */
    async uploadImage(file) {
      const { img, url } = await readAsImage(file);
      const type = 'image/webp';
      const big = await resizeTo(img, 1600, type, 0.8);
      const small = await resizeTo(img, 640, type, 0.74);
      URL.revokeObjectURL(url);
      if (this.isLocal) {
        return { src: await blobToDataURL(big.blob), sm: await blobToDataURL(small.blob), w: big.w, h: big.h };
      }
      const fb = await firebaseSDK();
      const name = Date.now() + '-' + (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const ref = fb.storage().ref(root() + '/images/' + name);
      const up1 = await ref.child('lg.webp').put(big.blob, { contentType: type, cacheControl: 'public,max-age=31536000' });
      const up2 = await ref.child('sm.webp').put(small.blob, { contentType: type, cacheControl: 'public,max-age=31536000' });
      return { src: await up1.ref.getDownloadURL(), sm: await up2.ref.getDownloadURL(), w: big.w, h: big.h };
    },

    async uploadFile(file) {
      if (this.isLocal) {
        if (file.size > 4 * 1024 * 1024) throw new Error('En mode aperçu, les fichiers sont limités à 4 Mo.');
        return { url: await blobToDataURL(file), size: file.size };
      }
      const fb = await firebaseSDK();
      const ref = fb.storage().ref(root() + '/documents/' + Date.now() + '-' + file.name.replace(/[^a-z0-9.]+/gi, '-'));
      const up = await ref.put(file, { contentType: file.type || 'application/pdf' });
      return { url: await up.ref.getDownloadURL(), size: file.size };
    },

    async hash(str) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        let h = 0; const s = String(str);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return 'x' + h;
      }
    },

    /* ---------- Espace membre : nœuds partagés avec l'espace membre actuel ----------
       inscriptions_evenement/{idEvénement}/{uid} {prenom, nom, at}
       club_messages/{id} {titre, contenu, type: info|warning|urgent, date, actif, createdAt} */
    async eventSignups(eventId) {
      if (this.isLocal) return [];
      const fb = await firebaseSDK();
      const s = await fb.database().ref('inscriptions_evenement/' + eventId).once('value');
      return toArr(s.val()).map((x) => ({ uid: x.id, prenom: x.prenom || '', nom: x.nom || '', at: x.at || 0 })).sort((a, b) => a.at - b.at);
    },
    clubMessages: {
      KEY: 'usm_club_messages_apercu',
      readLocal() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
      async list() {
        if (Store.isLocal) return this.readLocal();
        const fb = await firebaseSDK();
        const s = await fb.database().ref('club_messages').once('value');
        return toArr(s.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      },
      /* Même format que l'ancien panneau : l'espace membre actuel les affiche aussi */
      async save(m) {
        const data = { titre: m.titre, contenu: m.contenu, type: m.type || 'info', date: m.date || '', actif: m.actif !== false };
        if (Store.isLocal) {
          const all = this.readLocal(); const i = all.findIndex((x) => x.id === m.id);
          if (i >= 0) all[i] = Object.assign(all[i], data); else all.unshift(Object.assign({ id: 'cm' + Date.now().toString(36), createdAt: Date.now() }, data));
          localStorage.setItem(this.KEY, JSON.stringify(all)); return true;
        }
        const fb = await firebaseSDK(); const db = fb.database();
        if (m.id) await db.ref('club_messages/' + m.id).update(data); // conserve createdAt
        else await db.ref('club_messages').push(Object.assign({ createdAt: Date.now() }, data));
        return true;
      },
      async remove(id) {
        if (Store.isLocal) { localStorage.setItem(this.KEY, JSON.stringify(this.readLocal().filter((x) => x.id !== id))); return true; }
        const fb = await firebaseSDK(); await fb.database().ref('club_messages/' + id).remove(); return true;
      }
    },

    seed,
    sdk: firebaseSDK, // même instance Firebase (et mêmes émulateurs en test) pour l'espace membre
    COLLECTIONS,
    shop: Shop
  };

  window.USM = window.USM || {};
  window.USM.store = Store;
})();

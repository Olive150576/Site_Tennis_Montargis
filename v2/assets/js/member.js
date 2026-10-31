/* =====================================================================
   USM Tennis Montargis — Espace membre v2
   ---------------------------------------------------------------------
   Aperçu : données de démonstration gardées dans ce navigateur.
   Branchement Firebase (phase suivante) : chaque bloc « Data » ci-dessous
   correspond à un nœud déjà utilisé par l'espace membre actuel, pour que
   les deux versions lisent les mêmes données :
     members/{uid}              → profil, carte, classementHistory, partenaire
     partenaire_index/{uid}     → annuaire « Trouver un partenaire »
     club_messages              → messages du bureau
     calendrier                 → agenda ; inscriptions_evenement/{id}/{uid}
     championnats_equipe, equipes, inscriptions_equipe → équipes
     chats_equipe/{equipe}      → discussion d'équipe
   Nouveau nœud proposé : annonces_jeu (tableau des parties).
   Classement : saisi par le membre lui-même chaque mois (rappel sur l'accueil), sans import
   Ten'Up → members/{uid}/classement, classementAt, classementHistory/{saison} (règles : le membre
   doit pouvoir écrire ces 3 champs sur son propre nœud, pas les autres).
   Boutique (commandes groupées), via USM.store.shop :
     boutique_reservations/{produit}/{uid}/{id} → réservations du membre
     boutique_compteurs/{produit}   → compteur public (total, parTaille, attente)
     boutique_attente/{produit}/{uid} → « Prévenez-moi à la prochaine commande »
     boutique_avis/{uid}            → messages du bureau liés à une commande
   Catalogue : site_v2/shopProducts (Admin › Boutique).
   ===================================================================== */
(function () {
  'use strict';

  var KEY = 'usm_member_demo_v2';
  var SESSION = 'usm_member_session';
  var SEASON = '2026-2027';
  var LADDER = ['NC','40','30/5','30/4','30/3','30/2','30/1','30','15/5','15/4','15/3','15/2','15/1','15','5/6','4/6','3/6','2/6','1/6','0','-2/6','-4/6','-15'];
  var DAYS = ['lun','mar','mer','jeu','ven','sam','dim'];
  var DAYS_L = ['L','M','M','J','V','S','D'];
  var SLOTS = ['matin','midi','soir'];

  /* ---------- Utilitaires ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(n, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + n + '"></use></svg>'; }
  function day0(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
  function addDays(n, h, m) { var d = day0(new Date()); d.setDate(d.getDate() + n); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); }
  function nextDow(dow, h, weeksAhead) { // dow 0=dim … 6=sam
    var d = day0(new Date()); var diff = (dow - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff + 7 * (weeksAhead || 0)); d.setHours(h || 0, 0, 0, 0); return d.getTime();
  }
  var fmt = {
    long: function (t) { return new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); },
    short: function (t) { return new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); },
    time: function (t) { var d = new Date(t); return d.getHours() + ' h' + (d.getMinutes() ? ' ' + String(d.getMinutes()).padStart(2, '0') : ''); },
    month: function (t) { return new Date(t).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); },
    dnum: function (t) { return new Date(t).getDate(); },
    dmon: function (t) { return new Date(t).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''); },
    ago: function (t) { var m = Math.round((Date.now() - t) / 60000); if (m < 60) return 'il y a ' + Math.max(1, m) + ' min'; var h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h'; return 'il y a ' + Math.round(h / 24) + ' j'; }
  };
  function relDay(t) {
    var diff = Math.round((day0(t) - day0(Date.now())) / 864e5);
    if (diff === 0) return "aujourd'hui"; if (diff === 1) return 'demain'; if (diff > 1 && diff < 7) return new Date(t).toLocaleDateString('fr-FR', { weekday: 'long' });
    return fmt.short(t);
  }
  function initials(p) { return ((p.prenom || '?')[0] + (p.nom || '')[0]).toUpperCase(); }
  function avColor(id) { var h = 0; String(id).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 997; }); return 'c' + (h % 6 || ''); }
  function avatar(p, size) {
    var s = size ? ' style="--s:' + size + 'px"' : '';
    return '<span class="av ' + avColor(p.uid || p.nom) + '"' + s + ' aria-hidden="true">' + (p.photoURL ? '<img src="' + esc(p.photoURL) + '" alt="">' : esc(initials(p))) + '</span>';
  }
  function rankIdx(r) { var i = LADDER.indexOf(r); return i < 0 ? 0 : i; }
  var toastTimer;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2800);
  }
  /* Aperçu intégré (claude.ai) : le cadre bloque les appels, SMS, e-mails et nouveaux onglets → on l'explique */
  function initFramedPreview() {
    var framed = false; try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (!framed) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented) return;
      var href = a.getAttribute('href') || '';
      if (/^(tel|sms|mailto):/i.test(href)) {
        e.preventDefault();
        toast('Aperçu : ' + (/^tel/i.test(href) ? 'l\'appel' : /^sms/i.test(href) ? 'le SMS' : 'l\'e-mail') + ' est bloqué ici. Sur le site en ligne, il s\'ouvre normalement.', 4500);
      } else if (a.target === '_blank') {
        e.preventDefault();
        var w = null; try { w = window.open(href, '_blank'); } catch (x) { w = null; }
        if (w) { try { w.opener = null; } catch (x) {} } else toast('Aperçu : les liens vers un autre site (WhatsApp, Ten\'Up…) sont bloqués ici. Ils s\'ouvriront normalement sur le site en ligne.', 4500);
      }
    });
  }
  function uid() { return Math.random().toString(36).slice(2, 9); }

  /* ---------- Données de démonstration ---------- */
  function seed() {
    var me = {
      uid: 'me', prenom: 'Julien', nom: 'Mercier', email: 'julien.mercier@exemple.fr', telephone: '',
      classement: '30/2', licence: '1234567 A', categorie: 'Senior +35', statut: 'Adulte', depuis: 2019, photoURL: '',
      classementHistory: { '2020-2021': '40', '2021-2022': '30/5', '2022-2023': '30/4', '2023-2024': '30/3', '2024-2025': '30/3', '2025-2026': '30/2' },
      partenaire: { actif: true, partager_telephone: true, partager_email: false, style: ['Compétitif', 'Double'], message: 'Dispo le week-end, surtout sur terre battue.',
        dispos: { sam: { matin: true }, dim: { matin: true }, mar: { soir: true }, jeu: { soir: true } } },
      notifs: { convocations: true, annonces: true, bureau: true, push: false }
    };
    function P(id, prenom, nom, cl, style, dispos, msg, tel) {
      return { uid: id, prenom: prenom, nom: nom, classement: cl, style: style, dispos: dispos, message: msg || '', telephone: tel ? '06 00 00 00 ' + tel : '', email: tel ? '' : prenom.toLowerCase() + '@exemple.fr' };
    }
    var players = [
      P('p1', 'Sophie', 'Laurent', '30/1', ['Compétitif', 'Mixte'], { mar: { soir: 1 }, jeu: { soir: 1 }, sam: { matin: 1 } }, 'Je prépare le championnat, partante pour des matchs en 2 sets.', '12'),
      P('p2', 'Karim', 'Benali', '30/3', ['Loisir', 'Double'], { lun: { midi: 1 }, mer: { midi: 1 }, ven: { midi: 1 } }, 'Pause déjeuner = tennis !', '34'),
      P('p3', 'Hélène', 'Roy', '40', ['Loisir'], { sam: { matin: 1, midi: 1 }, dim: { matin: 1 } }, 'Reprise après 10 ans, patience bienvenue.', null),
      P('p4', 'Thomas', 'Girard', '15/5', ['Compétitif'], { lun: { soir: 1 }, mer: { soir: 1 }, ven: { soir: 1 } }, '', '56'),
      P('p5', 'Nadia', 'Petit', '30/2', ['Compétitif', 'Double', 'Mixte'], { mar: { soir: 1 }, sam: { matin: 1 }, dim: { matin: 1 } }, 'Cherche partenaire de double régulier.', '78'),
      P('p6', 'Marc', 'Fontaine', '30/4', ['Loisir', 'Double'], { lun: { matin: 1 }, mar: { matin: 1 }, jeu: { matin: 1 } }, 'Retraité, dispo en matinée.', '90'),
      P('p7', 'Léa', 'Moreau', '30', ['Compétitif'], { mer: { midi: 1, soir: 1 }, sam: { midi: 1 } }, '', '21'),
      P('p8', 'Philippe', 'Dubois', 'NC', ['Loisir'], { dim: { matin: 1, midi: 1 } }, 'Débutant motivé.', null)
    ];
    var posts = [
      { id: 'a1', uid: 'p5', kind: 'Double', when: nextDow(6, 10), slot: 'Samedi matin', surface: 'Terre battue', level: '30/4 à 30/1', text: 'On est 3, il manque un 4e pour un double.', created: Date.now() - 3 * 36e5, going: [] },
      { id: 'a2', uid: 'p2', kind: 'Simple', when: addDays(2, 12, 15), slot: 'Midi', surface: 'Court couvert', level: 'Tous niveaux', text: 'Échanges tranquilles, 1 h.', created: Date.now() - 20 * 36e5, going: [] },
      { id: 'a3', uid: 'p1', kind: 'Simple', when: nextDow(4, 19), slot: 'Jeudi soir', surface: 'Béton poreux', level: '30/3 à 30', text: 'Match en 2 sets, je prépare le championnat.', created: Date.now() - 50 * 36e5, going: ['p7'] }
    ];
    var msgs = [
      { id: 'm1', type: 'warning', titre: 'Courts couverts fermés mardi matin', texte: 'Entretien de l\'éclairage de 8 h à 13 h. Les courts extérieurs restent accessibles.', createdAt: Date.now() - 5 * 36e5 },
      { id: 'm2', type: 'info', titre: 'Assemblée générale', texte: 'Elle aura lieu en novembre au club house, la convocation arrive par email. Pensez à proposer vos idées au bureau.', createdAt: Date.now() - 4 * 864e5 }
    ];
    var dunlop = new Date(2026, 9, 10, 14, 0).getTime();
    var events = [
      { id: 'e1', titre: 'Après-midi test Dunlop & découverte du pickleball', cat: 'animation', start: dunlop > Date.now() ? dunlop : addDays(14, 14), end: 3, lieu: 'Club house', inscription: true, desc: 'Testez raquettes et balles Dunlop Fort, conseils d\'experts, et initiation pickleball. Réservé aux membres.' },
      { id: 'e2', titre: 'Championnat +35 · Journée 2', cat: 'competition', start: nextDow(0, 9, 1), end: 5, lieu: 'USM Montargis', inscription: false, desc: 'Équipe 2 contre TC Amilly, à domicile.' },
      { id: 'e3', titre: 'Tournoi interne · tirage des poules', cat: 'tournoi', start: addDays(24, 18, 30), end: 1, lieu: 'Club house', inscription: true, desc: 'Inscriptions jusqu\'au tirage. Format poules puis tableau final.' },
      { id: 'e4', titre: 'Soirée double surprise', cat: 'animation', start: addDays(33, 19), end: 3, lieu: 'Courts couverts', inscription: true, desc: 'Partenaires tirés au sort toutes les 30 minutes, apéro offert.' },
      { id: 'e5', titre: 'Assemblée générale', cat: 'vie', start: addDays(52, 19), end: 2, lieu: 'Club house', inscription: false, desc: 'Bilan de la saison, élections, projets 2027.' }
    ];
    var matches = [
      { id: 'r1', date: nextDow(0, 9, 1), adv: 'TC Amilly', dom: true, journee: 2 },
      { id: 'r2', date: nextDow(0, 9, 3), adv: 'AS Gien', dom: false, journee: 3 },
      { id: 'r3', date: nextDow(0, 9, 5), adv: 'Orléans ASPTT 3', dom: true, journee: 4 }
    ];
    var team = {
      id: 'eq2', nom: 'Équipe 2 Messieurs', champ: 'Championnat +35 · Départemental Loiret', capitaine: 'Thomas Girard',
      roster: [
        { uid: 'me', prenom: 'Julien', nom: 'Mercier', classement: '30/2' },
        { uid: 'p4', prenom: 'Thomas', nom: 'Girard', classement: '15/5' },
        { uid: 'p6', prenom: 'Marc', nom: 'Fontaine', classement: '30/4' },
        { uid: 'p9', prenom: 'Yann', nom: 'Leroy', classement: '30/1' },
        { uid: 'p2', prenom: 'Karim', nom: 'Benali', classement: '30/3' }
      ],
      dispos: { r1: { p4: 'y', p6: 'y', p9: 'n', p2: 'y' }, r2: { p4: 'y', p9: 'y' }, r3: {} },
      convocations: { r1: { me: 'pending', p4: 'y', p6: 'y', p2: 'pending' } }
    };
    var chat = [
      { uid: 'p4', nom: 'Thomas G.', text: 'Salut l\'équipe ! Dimanche on reçoit Amilly à 9 h, rendez-vous 8 h 30 au club.', at: Date.now() - 26 * 36e5 },
      { uid: 'p6', nom: 'Marc F.', text: 'Je m\'occupe des balles et du café.', at: Date.now() - 22 * 36e5 },
      { uid: 'p2', nom: 'Karim B.', text: 'Présent. Quelqu\'un a des nouvelles pour la terre battue, elle sera jouable ?', at: Date.now() - 3 * 36e5 }
    ];
    var champs = [
      { id: 'c1', nom: 'Championnat d\'hiver seniors par équipes', detail: 'Janvier – février · 3 simples par rencontre', limite: addDays(30), inscrit: false },
      { id: 'c2', nom: 'Coupe du Loiret double mixte', detail: 'Printemps 2027 · paires constituées ou à former', limite: addDays(60), inscrit: false }
    ];
    return { me: me, players: players, posts: posts, msgs: msgs, events: events, matches: matches, team: team, chat: chat, champs: champs, eventsIn: {}, readMsgs: {}, seenPostsAt: 0 };
  }

  var S;
  function load() { try { var raw = localStorage.getItem(KEY); S = raw ? JSON.parse(raw) : seed(); } catch (e) { S = seed(); } S.shopSeen = S.shopSeen || {}; }
  function save() { if (LIVE) { liveSave(); return; } try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  /* =====================================================================
     MODE RÉEL (Firebase) — mêmes comptes et mêmes données que l'espace
     membre actuel, formats conservés à l'identique (les deux espaces
     tournent en parallèle pendant la transition) :
       members/{uid}           email, telephone, classement, photoURL,
                               classementHistory/{push} {from, to, at},
                               partenaire {public_profile, updatedAt, style_jeu,
                               dispo {lundi: {matin…}}, partager_*, message} (+ styles[])
       partenaire_index/{uid}  fiche publique (membres actifs) si profil visible
       Storage members/{uid}/photo.jpg
     Démo : espace-membre.html?demo (ou site en mode aperçu).
     ===================================================================== */
  var LIVE = !window.USM_MEMBER_DEMO_MODE;
  var UID = null, SYNCED = null, syncT = null;
  var OLD_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var STYLE_OLD = { 'Loisir': 'loisir', 'Compétitif': 'competitif', 'Double': 'double', 'Mixte': 'double' };
  var STYLE_NEW = { loisir: 'Loisir', competitif: 'Compétitif', double: 'Double' };
  function sdk() { return window.USM.store.sdk(); }
  function seasonOf(ts) { var d = new Date(ts), y = d.getFullYear(); if (d.getMonth() < 8) y--; return y + '-' + (y + 1); }
  function meFromRecord(uid, r) {
    r = r || {};
    var hist = {}, lastAt = 0, h = r.classementHistory || {};
    Object.keys(h).map(function (k) { return h[k]; }).filter(function (x) { return x && x.at && x.to; })
      .sort(function (a, b) { return a.at - b.at; })
      .forEach(function (x) { hist[seasonOf(x.at)] = x.to; lastAt = x.at; });
    var cl = r.classement || 'NC';
    hist[SEASON] = cl;
    var p = r.partenaire || {}, dispos = {};
    OLD_DAYS.forEach(function (j, i) {
      var src = (p.dispo || {})[j] || {};
      SLOTS.forEach(function (s) { if (src[s]) { dispos[DAYS[i]] = dispos[DAYS[i]] || {}; dispos[DAYS[i]][s] = true; } });
    });
    var styles = Array.isArray(p.styles) ? p.styles.slice() : (STYLE_NEW[p.style_jeu] ? [STYLE_NEW[p.style_jeu]] : []);
    return {
      uid: uid, prenom: r.prenom || '', nom: r.nom || '', email: r.email || '', telephone: r.telephone || '',
      classement: cl, classementAt: lastAt, classementHistory: hist,
      licence: r.licence || '—', categorie: r.categorie || '', statut: r.statut || 'Membre',
      depuis: r.createdAt ? new Date(r.createdAt).getFullYear() : '', photoURL: r.photoURL || '',
      partenaire: { actif: !!p.public_profile, style: styles, dispos: dispos, partager_telephone: !!p.partager_telephone, partager_email: !!p.partager_email, message: p.message || '' },
      notifs: { convocations: true, annonces: true, bureau: true, push: false }
    };
  }
  /* Sections pas encore branchées : vides (jamais de données fictives en mode réel) */
  function liveState(me) {
    var ui = {}; try { ui = JSON.parse(localStorage.getItem(KEY + '_ui_' + me.uid) || '{}') || {}; } catch (e) {}
    if (ui.notifs) Object.assign(me.notifs, ui.notifs);
    return { me: me, players: [], posts: [], msgs: [], events: [], matches: [],
      team: { id: '', nom: '', champ: '', capitaine: '', roster: [], dispos: {}, convocations: {} },
      chat: [], champs: [], eventsIn: {}, readMsgs: ui.readMsgs || {}, seenPostsAt: ui.seenPostsAt || 0, shopSeen: ui.shopSeen || {} };
  }
  function partOld(me) {
    var P = me.partenaire, d = { public_profile: !!P.actif, styles: P.style.slice(), style_jeu: STYLE_OLD[P.style[0]] || 'loisir', dispo: {},
      partager_telephone: !!P.partager_telephone, partager_email: !!P.partager_email, message: String(P.message || '').slice(0, 100) };
    OLD_DAYS.forEach(function (j, i) { d.dispo[j] = {}; SLOTS.forEach(function (s) { d.dispo[j][s] = !!((P.dispos[DAYS[i]] || {})[s]); }); });
    return d;
  }
  function snapshot(me) { return { email: me.email, telephone: me.telephone, part: JSON.stringify(partOld(me)), photoURL: me.photoURL }; }
  /* save() en mode réel : l'état d'affichage reste dans le navigateur, le reste part dans Firebase */
  function liveSave() {
    if (!UID) return;
    try { localStorage.setItem(KEY + '_ui_' + UID, JSON.stringify({ readMsgs: S.readMsgs, seenPostsAt: S.seenPostsAt, shopSeen: S.shopSeen, notifs: S.me.notifs })); } catch (e) {}
    clearTimeout(syncT); syncT = setTimeout(liveSync, 400);
  }
  function liveErr(e) { var s = String((e && (e.code || e.message)) || e); return /PERMISSION_DENIED|permission/i.test(s) ? 'valeur refusée par le serveur' : (e && e.message) || s; }
  function liveSync() {
    var me = S.me, now = snapshot(me), was = SYNCED;
    if (!UID || !was) return Promise.resolve();
    SYNCED = now;
    return sdk().then(function (fb) {
      var db = fb.database(), jobs = [], up = {};
      if (now.email !== was.email) up.email = me.email;
      if (now.telephone !== was.telephone) up.telephone = me.telephone;
      if (Object.keys(up).length) jobs.push(db.ref('members/' + UID).update(up));
      var partChanged = now.part !== was.part;
      if (partChanged || now.photoURL !== was.photoURL || (me.partenaire.actif && Object.keys(up).length)) jobs.push(writePartner(db, me, partChanged));
      return Promise.all(jobs);
    }).catch(function (e) { SYNCED = was; toast('Enregistrement impossible : ' + liveErr(e), 6000); });
  }
  function writePartner(db, me, partChanged) {
    var d = partOld(me), jobs = [];
    if (partChanged) jobs.push(db.ref('members/' + UID + '/partenaire').set(Object.assign({ updatedAt: Date.now() }, d)));
    if (d.public_profile) {
      jobs.push(db.ref('partenaire_index/' + UID).set({ prenom: me.prenom, nom: me.nom, classement: me.classement, categorie: me.categorie, photoURL: me.photoURL || '',
        style_jeu: d.style_jeu, styles: d.styles, dispo: d.dispo, partager_telephone: d.partager_telephone, partager_email: d.partager_email,
        telephone: d.partager_telephone ? me.telephone : '', email: d.partager_email ? me.email : '', message: d.message }));
    } else jobs.push(db.ref('partenaire_index/' + UID).remove());
    return Promise.all(jobs);
  }
  /* Classement : même trace que l'espace actuel (classementHistory {from, to, at}) */
  function liveRank(from, to) {
    return sdk().then(function (fb) {
      var db = fb.database();
      return db.ref('members/' + UID).update({ classement: to })
        .then(function () { return db.ref('members/' + UID + '/classementHistory').push({ from: from, to: to, at: fb.database.ServerValue.TIMESTAMP }); })
        .then(function () { if (S.me.partenaire.actif) return db.ref('partenaire_index/' + UID + '/classement').set(to); });
    }).catch(function (e) { toast('Classement non enregistré : ' + liveErr(e), 6000); });
  }
  function livePhoto(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.85); }).then(function (blob) {
      return sdk().then(function (fb) {
        var ref = fb.storage().ref('members/' + UID + '/photo.jpg');
        return ref.put(blob, { contentType: 'image/jpeg' }).then(function () { return ref.getDownloadURL(); })
          .then(function (url) { return fb.database().ref('members/' + UID + '/photoURL').set(url).then(function () { return url; }); });
      });
    });
  }
  function authMsg(e) {
    var c = (e && e.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Email ou mot de passe incorrect. Besoin d\'aide ? « Mot de passe oublié ».';
    if (/too-many-requests/.test(c)) return 'Trop d\'essais : patientez quelques minutes ou utilisez « Mot de passe oublié ».';
    if (/network/.test(c)) return 'Pas de connexion internet : réessayez dans un instant.';
    if (/user-disabled/.test(c)) return 'Ce compte est désactivé : contactez le secrétariat du club.';
    return (e && e.message) || 'Connexion impossible.';
  }
  function liveEnter(user) {
    return sdk().then(function (fb) {
      return fb.database().ref('members/' + user.uid).once('value').then(function (snap) {
        var r = snap.val();
        if (!r || r.actif !== true) {
          return fb.auth().signOut().then(function () {
            throw new Error(r ? 'Votre adhésion n\'est pas active pour le moment : contactez le secrétariat du club.' : 'Aucune fiche membre n\'est liée à ce compte : contactez le secrétariat du club.');
          });
        }
        UID = user.uid; S = liveState(meFromRecord(user.uid, r)); SYNCED = snapshot(S.me);
        try { // compteur de visites (comme l'espace actuel) : une fois par session de navigation
          if (!sessionStorage.getItem('usm_visite_comptee')) {
            sessionStorage.setItem('usm_visite_comptee', '1');
            var db = fb.database();
            db.ref('members/' + UID + '/derniereVisite').set(Date.now()).catch(function () {});
            db.ref('members/' + UID + '/visites').set(fb.database.ServerValue.increment(1)).catch(function () {});
          }
        } catch (e) {}
        return liveLoadClub(fb).catch(function () {}).then(function () { showApp(); });
      });
    });
  }
  /* ---------- Agenda unique (site_v2/events, Admin › Agenda) + inscriptions ----------
     inscriptions_evenement/{idEvénement}/{uid} {prenom, nom, at} — nœud et règles existants
     Messages du bureau : club_messages (Admin › Messages aux membres, format de l'ancien panneau) */
  var EV_CAT = { tournoi: 'tournoi', animation: 'animation', competition: 'competition', stage: 'stage' };
  function evStart(e) {
    var d = new Date(e.dateStart + 'T00:00:00'), m = /(\d{1,2})\s*h\s*(\d{2})?/i.exec(e.time || '');
    if (m) d.setHours(+m[1], +(m[2] || 0));
    return d.getTime();
  }
  function liveLoadClub(fb) {
    var db = fb.database(), none = function () { return null; };
    return Promise.all([window.USM.store.load(), db.ref('inscriptions_evenement').once('value').catch(none), db.ref('club_messages').once('value').catch(none)])
      .then(function (res) {
        var c = res[0] || {}, ins = (res[1] && res[1].val()) || {}, cm = (res[2] && res[2].val()) || {};
        S.eventsIn = {};
        S.events = (c.events || []).filter(function (e) { return e && !e.draft && e.dateStart; }).map(function (e) {
          var reg = ins[e.id] || {};
          if (reg[UID]) S.eventsIn[e.id] = true;
          return { id: e.id, titre: e.title || '', cat: EV_CAT[e.category] || 'vie', start: evStart(e),
            endTs: new Date((e.dateEnd || e.dateStart) + 'T23:59:59').getTime(), end: 2, lieu: e.location || 'Au club',
            inscription: !!e.memberSignup, desc: e.summary || '', timeTxt: e.time || '', count: Object.keys(reg).length };
        });
        S.msgs = Object.keys(cm).map(function (k) {
          var m = cm[k] || {};
          return { id: k, actif: m.actif, type: ['warning', 'urgent'].indexOf(m.type) >= 0 ? m.type : 'info', titre: m.titre || 'Message du club', texte: m.contenu || m.message || '', createdAt: m.createdAt || 0 };
        }).filter(function (m) { return m.actif !== false; });
      });
  }
  function liveEventToggle(id) {
    var ev = S.events.filter(function (e) { return e.id === id; })[0]; if (!ev || !ev.inscription) return;
    var on = !S.eventsIn[id];
    S.eventsIn[id] = on; ev.count = Math.max(0, (ev.count || 0) + (on ? 1 : -1)); route();
    sdk().then(function (fb) {
      var r = fb.database().ref('inscriptions_evenement/' + id + '/' + UID);
      return on ? r.set({ prenom: S.me.prenom, nom: S.me.nom, at: fb.database.ServerValue.TIMESTAMP }) : r.remove();
    }).then(function () { toast(on ? 'Inscription enregistrée' : 'Inscription annulée'); })
      .catch(function (x) { S.eventsIn[id] = !on; ev.count = Math.max(0, ev.count + (on ? -1 : 1)); route(); toast('Inscription impossible : ' + liveErr(x), 6000); });
  }
  function liveLogout() {
    return sdk().then(function (fb) { return fb.auth().signOut(); }).then(function () {
      UID = null; SYNCED = null; S = liveState(meFromRecord('', {})); showLogin();
    });
  }
  function liveResetMail(email) {
    return sdk().then(function (fb) { return fb.auth().sendPasswordResetEmail(email); });
  }


  /* ---------- Réglages club (repris du site) ---------- */
  var CLUB = { tenup: 'https://tenup.fft.fr/club/53450084', phone: '02 38 85 44 30', email: 'usmmtennis@orange.fr', logo: 'assets/img/brand/logo-usm.webp', whatsapp: '' };
  var TEAMS_ON = true; // Admin › Paramètres › Espace membre : afficher ou non la section Équipes
  var SHOP_ON = false;  // idem pour la Boutique : masquée tant qu'elle n'est pas explicitement activée
  var REMOTE_FLAGS = null;
  var PREVIEW = ((window.USM_CONFIG || {}).mode || 'local') === 'local';
  function applySettings(st) {
    if (!st) return;
    var l = st.links || {};
    CLUB.tenup = l.tenup || CLUB.tenup; CLUB.phone = st.phone || CLUB.phone; CLUB.email = st.email || CLUB.email;
    CLUB.whatsapp = String(l.whatsapp || '').trim();
    var f = REMOTE_FLAGS || st; // les réglages de l'admin (Firebase) priment sur ceux de la démo
    TEAMS_ON = f.showTeams !== false;
    SHOP_ON = f.showShop === true;
  }
  try {
    var seedSite = window.USM_SEED && window.USM_SEED.settings;
    applySettings(seedSite);
  } catch (e) {}
  /* Les interrupteurs Équipes / Boutique (Admin › Paramètres › Espace membre) sont lus dans
     Firebase (site_v2/settings, lecture publique) même quand la maquette tourne en démo. */
  var settingsReady = (function () {
    var C = window.USM_CONFIG || {};
    if (window.USM_REAL_MODE !== 'firebase' || !C.firebase || !window.fetch) return Promise.resolve();
    return fetch(C.firebase.databaseURL + '/' + (C.dbRoot || 'site_v2') + '/settings.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (st) {
        if (!st) return;
        REMOTE_FLAGS = { showTeams: st.showTeams, showShop: st.showShop };
        applySettings(seedSite || {});
      })
      .catch(function () { /* réglages par défaut */ });
  })();
  /* Partenaires : même contenu que le site public (Admin › Partenaires).
     En mode Firebase, USM.store lit site_v2/sponsors : rien à changer ici. */
  /* Exemple de démonstration ajouté seulement tant qu'aucune vraie offre membre n'existe */
  function withDemo(list) {
    var real = list.some(function (s) { return s && !s.draft && s.perk && !/à venir|bientôt/i.test(s.perk); });
    return real ? list.slice() : list.concat(window.USM_MEMBER_DEMO || []);
  }
  var SPONSORS = withDemo((window.USM_SEED && window.USM_SEED.sponsors) || []);
  function loadSponsors() {
    if (!(window.USM && window.USM.store)) return Promise.resolve();
    return window.USM.store.load().then(function (c) {
      if (c && c.sponsors) SPONSORS = withDemo(c.sponsors);
      if (c && c.settings) applySettings(c.settings);
    }).catch(function () {});
  }
  function isOffer(s) {
    if (!s.perk || /à venir|bientôt/i.test(s.perk)) return false;
    if (s.perkUntil && new Date(s.perkUntil + 'T23:59:59') < new Date()) return false;
    return true;
  }
  function partners() {
    var list = SPONSORS.filter(function (s) { return s.name && !s.draft && !/^USM\b/.test(s.name); });
    return { offers: list.filter(isOffer), soon: list.filter(function (s) { return !isOffer(s); }) };
  }
  function logoOf(s, cls) {
    return s.logo && s.logo.src ? '<img class="' + (cls || '') + '" src="' + esc(s.logo.sm || s.logo.src) + '" alt="" loading="lazy">' : '<span class="ph ' + (cls || '') + '">' + esc(s.name[0]) + '</span>';
  }
  function perksBlock() {
    var P = partners();
    var offers = P.offers.map(function (s) {
      var i = SPONSORS.indexOf(s);
      return '<button type="button" class="perk has-offer" data-perk="' + i + '">' + logoOf(s) + '<div><b>' + esc(s.name) + (s.demo ? ' <span class="tag">Exemple</span>' : '') + '</b><span class="perk-offer">' + esc(s.perk) + '</span>' +
        (s.perkUntil ? '<small>Jusqu\'au ' + esc(fmt.short(new Date(s.perkUntil).getTime())) + '</small>' : '') + '</div>' + ic('chevron-right', 'perk-go') + '</button>';
    }).join('');
    var soon = P.soon.map(function (s) { return '<div class="perk is-soon">' + logoOf(s) + '<div><b>' + esc(s.name) + '</b><span>Offre membre en préparation</span></div></div>'; }).join('');
    var pitch = '<a class="perk perk-pitch" href="mailto:' + esc(CLUB.email) + '?subject=' + encodeURIComponent('Proposer un avantage aux membres USM') + '&body=' + encodeURIComponent('Bonjour,\n\nJe souhaite proposer un avantage aux membres du club.\n\nEnseigne :\nActivité :\nAvantage proposé :\nTéléphone :\n') + '"><span class="ph">' + ic('plus') + '</span><div><b>Vous avez un commerce ?</b><span>Proposez un avantage aux 150 membres du club</span></div></a>';
    return '<h2 class="v-sub" id="avantages">Mes avantages partenaires' + (P.offers.length ? ' <span class="count">' + P.offers.length + ' offre' + (P.offers.length > 1 ? 's' : '') + '</span>' : '') + '</h2>' +
      '<p class="muted" style="margin:-6px 0 14px;font-size:.92rem">Réservés aux membres à jour de cotisation : montrez votre carte en caisse.</p>' +
      (offers ? '<div class="perks">' + offers + '</div>' : '') +
      (soon ? (offers ? '<h3 class="perks-soon-label">En préparation chez nos partenaires</h3>' : '') + '<div class="perks">' + soon + pitch + '</div>' : '<div class="perks" style="margin-top:12px">' + pitch + '</div>');
  }
  function openPerk(i) {
    var s = SPONSORS[i]; if (!s) return;
    openDrawer('Avantage membre',
      '<div class="perk-hero">' + logoOf(s, 'perk-logo') + '<div><b>' + esc(s.name) + '</b>' + (s.desc ? '<span>' + esc(s.desc) + '</span>' : '') + '</div></div>' +
      '<div class="perk-deal"><span class="tag demo-tag">Avantage membres</span><p>' + esc(s.perk) + '</p>' + (s.perkUntil ? '<small>Valable jusqu\'au ' + esc(fmt.long(new Date(s.perkUntil).getTime())) + '</small>' : '') + '</div>' +
      (s.perkDetails ? '<div class="field"><span class="label">Comment en profiter</span><p class="muted">' + esc(s.perkDetails).replace(/\n/g, '<br>') + '</p></div>' : '<p class="muted">Présentez votre carte de membre (QR code) en caisse.</p>') +
      (s.perkCode ? '<div class="field"><span class="label">Code à donner ou à saisir en ligne</span><div class="perk-code"><code>' + esc(s.perkCode) + '</code><button class="btn btn-sm" data-copy="' + esc(s.perkCode) + '">' + ic('copy') + 'Copier</button></div></div>' : '') +
      '<div class="stack"><button class="btn btn-blue btn-block" data-qr-from-perk>' + ic('qr') + 'Montrer ma carte</button>' +
      (s.url ? '<a class="btn btn-block" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + ic('external') + 'Site du partenaire</a>' : '') + '</div>');
  }

  /* ---------- Comptes à faire / badges ---------- */
  function pendingConvocs() {
    if (!TEAMS_ON) return [];
    var c = S.team.convocations; return S.matches.filter(function (m) { return c[m.id] && c[m.id].me === 'pending' && m.date > Date.now(); });
  }
  function unreadMsgs() { return allMsgs().filter(function (m) { return !S.readMsgs[m.id]; }); }
  function freshPosts() {
    var mine = rankIdx(S.me.classement);
    return S.posts.filter(function (p) { return p.uid !== 'me' && p.created > S.seenPostsAt && p.when > Date.now() && levelOk(p, mine); });
  }
  function levelOk(p, mine) {
    if (!p.level || /tous/i.test(p.level)) return true;
    var m = p.level.match(/(\S+)\s+à\s+(\S+)/); if (!m) return true;
    return mine >= rankIdx(m[1]) - 1 && mine <= rankIdx(m[2]) + 1;
  }
  function updateBadges() {
    var set = function (name, n) {
      $$('[data-badge="' + name + '"]').forEach(function (b) { b.textContent = n; b.hidden = !n; });
    };
    set('equipes', pendingConvocs().length);
    set('agenda', unreadMsgs().length);
    set('jouer', freshPosts().length);
    var shopN = SHOP_ON ? unseenShop().length : 0;
    set('boutique', shopN);
    set('plus', unreadMsgs().length + shopN);
  }

  /* ---------- Navigation ---------- */
  var VIEWS = ['accueil', 'carte', 'jouer', 'equipes', 'agenda', 'boutique', 'profil'];
  var RENDER = {};
  function applyTeamsNav() {
    $$('[data-nav="equipes"]').forEach(function (a) { var li = a.closest('li') || a; li.style.display = TEAMS_ON ? '' : 'none'; });
    $$('[data-nav="boutique"]').forEach(function (a) { var li = a.closest('li') || a; li.style.display = SHOP_ON ? '' : 'none'; });
  }
  /* Vue désactivée dans Admin › Paramètres › Espace membre → retour à l'accueil */
  function viewOff(v) { return (v === 'equipes' && !TEAMS_ON) || (v === 'boutique' && !SHOP_ON); }
  function go(view) {
    if (VIEWS.indexOf(view) < 0 || viewOff(view)) view = 'accueil';
    applyTeamsNav();
    VIEWS.forEach(function (v) { var el = $('#v-' + v); if (el) el.hidden = v !== view; });
    $$('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('[data-more]').forEach(function (b) { b.classList.toggle('is-current', ['agenda', 'boutique', 'profil'].indexOf(view) >= 0); });
    closeMore(true);
    RENDER[view]();
    updateBadges();
    document.title = ({ accueil: 'Mon espace', carte: 'Ma carte', jouer: 'Jouer', equipes: 'Mes équipes', agenda: 'Agenda', boutique: 'Boutique', profil: 'Mon profil' })[view] + ' · USM Tennis Montargis';
    window.scrollTo(0, 0);
  }
  function route() { go((location.hash || '#accueil').slice(1)); }

  /* ---------- Accueil ---------- */
  function matchBoard(m, compact) {
    var conv = (S.team.convocations[m.id] || {}).me;
    var st = conv === 'y' ? '<span class="status-pill ok"><i></i>Présence confirmée</span>'
      : conv === 'n' ? '<span class="status-pill no"><i></i>Absence signalée au capitaine</span>'
      : conv === 'pending' ? '<span class="status-pill"><i></i>Convocation à confirmer</span>'
      : '<span class="status-pill"><i></i>Pas encore convoqué</span>';
    var btns = conv === 'pending' && !compact
      ? '<div class="todo-actions"><button class="btn btn-ball btn-sm" data-convoc="' + m.id + '" data-v="y">' + ic('check') + 'Je confirme</button><button class="btn btn-sm" data-convoc="' + m.id + '" data-v="n">Je ne peux pas</button></div>'
      : '<button class="btn btn-sm" data-chat>' + ic('chat') + 'Discussion d\'équipe</button>';
    var home = m.dom ? 'USM 2' : m.adv, away = m.dom ? m.adv : 'USM 2';
    return '<article class="match-board" aria-label="Prochain match">' +
      '<div class="mb-meta"><span class="serve"><i aria-hidden="true"></i>Prochain match</span><span>' + esc(S.team.champ) + '</span><span>Journée ' + m.journee + '</span></div>' +
      '<div class="mb-team"><small>' + (m.dom ? 'Domicile' : 'Recevant') + '</small><b>' + esc(home) + '</b></div>' +
      '<div class="mb-vs">' + fmt.dnum(m.date) + '<small>' + esc(fmt.dmon(m.date)) + ' · ' + fmt.time(m.date) + '</small></div>' +
      '<div class="mb-team mb-away"><small>' + (m.dom ? 'Visiteur' : 'Nous') + '</small><b>' + esc(away) + '</b></div>' +
      '<div class="mb-foot">' + st + btns + '</div></article>';
  }

  RENDER.accueil = function () {
    var me = S.me, todos = [];
    pendingConvocs().forEach(function (m) {
      todos.push('<div class="todo-item is-urgent"><span class="ti-ico">' + ic('trophy') + '</span><div><b>Convocation · ' + esc(fmt.short(m.date)) + ' à ' + fmt.time(m.date) + '</b><span>' + esc(S.team.nom) + (m.dom ? ' reçoit ' : ' à ') + esc(m.adv) + '. Le capitaine attend votre réponse.</span></div>' +
        '<div class="todo-actions"><button class="btn btn-ball btn-sm" data-convoc="' + m.id + '" data-v="y">Je confirme</button><button class="btn btn-sm" data-convoc="' + m.id + '" data-v="n">Je ne peux pas</button></div></div>');
    });
    unreadMsgs().filter(function (m) { return m.type !== 'info'; }).forEach(function (m) {
      todos.push('<div class="todo-item"><span class="ti-ico">' + ic('megaphone') + '</span><div><b>' + esc(m.titre) + '</b><span>' + esc(m.texte) + '</span></div><div class="todo-actions"><button class="btn btn-sm" data-read="' + m.id + '">' + ic('check') + 'Lu</button></div></div>');
    });
    if (!me.telephone) {
      todos.push('<div class="todo-item is-info"><span class="ti-ico">' + ic('phone') + '</span><div><b>Ajoutez votre téléphone</b><span>Vos coéquipiers et partenaires ne peuvent pas vous joindre avant un match.</span></div><div class="todo-actions"><a class="btn btn-sm" href="#profil">Compléter</a></div></div>');
    }
    if (rankDue()) {
      todos.push('<div class="todo-item is-info"><span class="ti-ico">' + ic('trophy') + '</span><div><b>Votre classement a-t-il changé ?</b><span>Le classement FFT est mis à jour chaque mois. Ici, vous êtes à ' + esc(me.classement) + '.</span></div><div class="todo-actions"><button class="btn btn-sm" data-rank>' + ic('edit') + 'Mettre à jour</button><button class="btn btn-sm" data-rank-same>Rien n\'a changé</button></div></div>');
    }
    var next = S.matches.filter(function (m) { return m.date > Date.now(); }).sort(function (a, b) { return a.date - b.date; })[0];
    var evs = S.events.filter(function (e) { return (e.endTs || e.start) > Date.now(); }).sort(function (a, b) { return a.start - b.start; }).slice(0, 3);
    var fresh = freshPosts().length;

    $('#v-accueil').innerHTML =
      '<div class="v-head"><div class="hello">' + avatar(me) + '<div><p class="hello-date">' + esc(fmt.long(Date.now())) + '</p><h1>Bonjour ' + esc(me.prenom) + '</h1></div></div></div>' +
      (todos.length ? '<h2 class="v-sub">À faire <span class="count">' + todos.length + '</span></h2><div class="todo">' + todos.join('') + '</div>'
        : '<div class="all-clear">' + ic('check') + 'Rien en attente. Bon jeu !</div>') +
      shopBanner() +
      (next && TEAMS_ON ? '<h2 class="v-sub">Mon équipe <a class="link-arrow" href="#equipes">Mes équipes' + ic('arrow') + '</a></h2>' + matchBoard(next, true) : '') +
      '<h2 class="v-sub">Raccourcis</h2><div class="quick">' +
        '<a href="' + esc(CLUB.tenup) + '" target="_blank" rel="noopener"><span class="q-ico ball">' + ic('calendar') + '</span><span>Réserver un court<small>Sur Ten\'Up</small></span></a>' +
        '<button type="button" data-qr><span class="q-ico">' + ic('qr') + '</span><span>Montrer ma carte<small>QR plein écran</small></span></button>' +
        '<a href="#jouer"><span class="q-ico">' + ic('users') + '</span><span>Trouver un partenaire<small>' + (fresh ? fresh + ' annonce' + (fresh > 1 ? 's' : '') + ' à mon niveau' : 'Annonces et annuaire') + '</small></span></a>' +
        (SHOP_ON ? '<a href="#boutique"><span class="q-ico">' + ic('bag') + '</span><span>Boutique du club<small>Commandes groupées</small></span></a>' : '') +
      '</div>' +
      waCard() +
      perksTeaser() +
      '<h2 class="v-sub">Au club prochainement <a class="link-arrow" href="#agenda">Tout l\'agenda' + ic('arrow') + '</a></h2><div class="ev-list">' + evs.map(eventRow).join('') + '</div>';
  };

  /* ---------- Carte « Communauté WhatsApp » ----------
     Lien : Admin › Paramètres › Liens › Communauté WhatsApp. Vide = carte masquée
     (sauf en aperçu, où elle s'affiche en exemple pour la voir). */
  function waCard() {
    var link = CLUB.whatsapp, example = !link && PREVIEW;
    if (!link && !example) return '';
    var txt = TEAMS_ON ? 'Annonces du club, vie du club et un groupe par équipe. Rien d\'obligatoire.' : 'Les équipes s\'organisent sur WhatsApp : rejoignez le groupe de votre équipe et les annonces du club.';
    return '<a class="wa-card" href="' + (link ? esc(link) + '" target="_blank" rel="noopener"' : '#" data-wa-example') + '>' +
      '<span class="wa-ico">' + ic('whatsapp') + '</span>' +
      '<span class="wa-txt"><b>Communauté WhatsApp du club</b><small>' + txt + '</small>' + (example ? '<small class="wa-ex">Aperçu : la carte s\'affiche une fois le lien ajouté dans l\'admin.</small>' : '') + '</span>' +
      '<span class="btn btn-wa btn-sm">Rejoindre</span></a>';
  }

  function perksTeaser() {
    var P = partners(); if (!P.offers.length && !P.soon.length) return '';
    var logos = P.offers.concat(P.soon).slice(0, 5).map(function (s) { return logoOf(s); }).join('');
    return '<a class="perks-teaser" href="#carte" data-goto-perks><div class="pt-logos">' + logos + '</div><div><b>' + (P.offers.length ? P.offers.length + ' avantage' + (P.offers.length > 1 ? 's' : '') + ' chez nos partenaires' : 'Vos avantages partenaires arrivent') + '</b><span>' + (P.offers.length ? 'Montrez votre carte en caisse' : P.soon.length + ' partenaires préparent une offre réservée aux membres') + '</span></div>' + ic('arrow') + '</a>';
  }

  /* ---------- Carte ---------- */
  var COURT_SVG = '<svg class="lines" viewBox="0 0 1586 1000" preserveAspectRatio="none" aria-hidden="true"><rect x="60" y="80" width="1466" height="840"/><line x1="60" y1="185" x2="1526" y2="185"/><line x1="60" y1="815" x2="1526" y2="815"/><line x1="400" y1="185" x2="400" y2="815"/><line x1="1186" y1="185" x2="1186" y2="815"/><line x1="400" y1="500" x2="1186" y2="500"/><line class="net" x1="793" y1="40" x2="793" y2="960"/></svg>';
  /* Même adresse que les cartes actuelles : tennismontargis.fr/v/{uid} → verify.html (contrôle à l'entrée et chez les partenaires) */
  function qrPayload() { return ((window.USM_CONFIG || {}).siteUrl || 'https://tennismontargis.fr').replace(/\/$/, '') + '/v/' + encodeURIComponent(S.me.uid || 'demo'); }
  function drawQR(el, size) {
    el.innerHTML = '';
    if (window.QRCode) { try { new window.QRCode(el, { text: qrPayload(), width: size, height: size, colorDark: '#0b1640', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); return; } catch (e) {} }
    el.innerHTML = '<span style="font-size:10px;color:#0b1640">QR</span>';
  }
  RENDER.carte = function () {
    var me = S.me;
    $('#v-carte').innerHTML =
      '<div class="v-head"><div><h1>Ma carte de membre</h1><p>Elle prouve que vous êtes à jour de votre cotisation. Présentez le QR code à l\'accueil, chez nos partenaires ou lors d\'un tournoi.</p></div></div>' +
      '<div class="card-wrap">' +
        '<button type="button" class="mcard" data-qr aria-label="Afficher le QR code en plein écran">' + COURT_SVG +
          '<div class="mc-top"><div class="mc-club"><img src="' + CLUB.logo + '" alt=""><div><b>USM Tennis</b><span>Montargis</span></div></div><span class="mc-season">' + SEASON + '</span></div>' +
          '<div><div class="mc-name">' + esc(me.prenom) + '<br>' + esc(me.nom.toUpperCase()) + '</div><span class="mc-status"><i></i>' + (/^membre$/i.test(me.statut) ? 'Membre' : 'Membre ' + esc(me.statut.toLowerCase())) + ' · cotisation à jour</span></div>' +
          '<div class="mc-bottom"><div class="mc-data"><div><small>Licence</small><b>' + esc(me.licence) + '</b></div><div><small>Classement</small><b>' + esc(me.classement) + '</b></div></div><div class="mc-qr" id="mc-qr"></div></div>' +
        '</button>' +
        '<div class="card-side"><p class="hint">Touchez la carte pour agrandir le QR code : l\'écran passe en blanc pour un scan facile.</p>' +
          '<div class="card-actions"><button class="btn btn-blue" data-qr>' + ic('qr') + 'Afficher en plein écran</button><button class="btn" data-print>' + ic('download') + 'Imprimer (format carte)</button></div>' +
        '</div>' +
      '</div>' +
      perksBlock();
    drawQR($('#mc-qr'), 120);
  };
  function openQR() {
    var s = $('#qr-screen');
    $('#qr-name').textContent = S.me.prenom + ' ' + S.me.nom;
    $('#qr-meta').textContent = 'Licence ' + S.me.licence + ' · Saison ' + SEASON;
    drawQR($('#qr-big'), 340); s.hidden = false; $('#qr-close').focus();
  }

  /* ---------- Jouer ---------- */
  var playTab = 'annonces';
  var F = { near: false, slots: {}, styles: {}, q: '' };
  function dispoGrid(d) {
    var h = '<div class="dispo" aria-label="Disponibilités"><span></span>' + DAYS_L.map(function (x) { return '<span class="d-h">' + x + '</span>'; }).join('');
    SLOTS.forEach(function (s) { h += '<span>' + s + '</span>'; DAYS.forEach(function (dd) { h += '<i class="' + (d && d[dd] && d[dd][s] ? 'on' : '') + '"></i>'; }); });
    return h + '</div>';
  }
  function hasSlot(d, s) { return DAYS.some(function (dd) { return d && d[dd] && d[dd][s]; }); }
  function playerCard(p) {
    var contact = [];
    if (p.telephone) contact.push('<button class="btn btn-blue" data-contact="sms" data-to="' + esc(p.telephone) + '" data-name="' + esc(p.prenom) + '">SMS</button><button class="btn" data-contact="tel" data-to="' + esc(p.telephone) + '" data-name="' + esc(p.prenom) + '">' + ic('phone') + 'Appeler</button>');
    if (p.email) contact.push('<button class="btn btn-blue" data-contact="mail" data-to="' + esc(p.email) + '" data-name="' + esc(p.prenom) + '">' + ic('mail') + 'Email</button>');
    return '<article class="player"><div class="player-top">' + avatar(p) + '<div><b>' + esc(p.prenom + ' ' + p.nom[0] + '.') + '</b></div><span class="rank" title="Classement">' + esc(p.classement) + '</span></div>' +
      '<div class="player-tags">' + p.style.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div>' +
      (p.message ? '<p class="player-msg">« ' + esc(p.message) + ' »</p>' : '') + dispoGrid(p.dispos) +
      '<div class="player-contact">' + contact.join('') + '</div></article>';
  }
  function postCard(p) {
    var who = p.uid === 'me' ? S.me : S.players.filter(function (x) { return x.uid === p.uid; })[0] || { prenom: '?', nom: '?' };
    var iGo = p.going.indexOf('me') >= 0, mine = p.uid === 'me';
    var act = mine ? '<button class="btn btn-sm post-act" data-delpost="' + p.id + '">' + ic('trash') + 'Retirer</button>'
      : iGo ? '<button class="btn btn-sm post-act" data-go="' + p.id + '">' + ic('check') + 'Partant</button>'
      : '<button class="btn btn-ball btn-sm post-act" data-go="' + p.id + '">Je suis partant</button>';
    return '<article class="post' + (mine ? ' mine' : '') + '">' + avatar(who) + '<div><div class="post-kind">' + esc(p.kind) + ' · ' + esc(relDay(p.when)) + ' à ' + fmt.time(p.when) + '</div>' +
      '<div class="post-meta"><span>' + esc(who.prenom + ' ' + who.nom[0] + '.') + ' <span class="rank">' + esc(who.classement) + '</span></span><span>' + ic('court') + esc(p.surface) + '</span><span>' + ic('target') + esc(p.level) + '</span><span>' + ic('clock') + esc(fmt.ago(p.created)) + '</span></div>' +
      (p.text ? '<p>' + esc(p.text) + '</p>' : '') +
      (p.going.length ? '<span class="going">' + ic('users') + p.going.length + ' partant' + (p.going.length > 1 ? 's' : '') + (iGo ? ' dont vous' : '') + '</span>' : '') +
      '</div>' + act + '</article>';
  }
  RENDER.jouer = function () {
    var me = S.me, mine = rankIdx(me.classement);
    var body;
    if (playTab === 'annonces') {
      var list = S.posts.filter(function (p) { return p.when > Date.now(); }).sort(function (a, b) { return a.when - b.when; });
      body = '<div class="filters-bar post-bar"><button class="btn btn-ball" data-newpost>' + ic('plus') + 'Publier une annonce</button><span class="muted" style="font-size:.9rem">Les annonces disparaissent seules après la date du match.</span></div>' +
        (list.length ? '<div class="posts">' + list.map(postCard).join('') + '</div>' : '<div class="empty">Aucune annonce en cours. Lancez la première !</div>');
      S.seenPostsAt = Date.now(); save();
    } else {
      var list2 = S.players.filter(function (p) {
        if (F.near && Math.abs(rankIdx(p.classement) - mine) > 2) return false;
        var sl = Object.keys(F.slots).filter(function (k) { return F.slots[k]; });
        if (sl.length && !sl.some(function (s) { return hasSlot(p.dispos, s); })) return false;
        var st = Object.keys(F.styles).filter(function (k) { return F.styles[k]; });
        if (st.length && !st.every(function (s) { return p.style.indexOf(s) >= 0; })) return false;
        if (F.q && (p.prenom + ' ' + p.nom).toLowerCase().indexOf(F.q.toLowerCase()) < 0) return false;
        return true;
      });
      var pressed = function (b) { return ' aria-pressed="' + (!!b) + '"'; };
      body = '<div class="panel-m visibility" style="margin-top:18px"><div><b>' + (me.partenaire.actif ? 'Vous apparaissez dans l\'annuaire' : 'Vous êtes invisible dans l\'annuaire') + '</b><span>' + (me.partenaire.actif ? 'Les membres connectés voient votre niveau, vos créneaux et ' + (me.partenaire.partager_telephone ? 'votre téléphone.' : 'votre email.') : 'Activez pour que d\'autres membres vous proposent des matchs.') + '</span></div>' +
        '<div style="display:flex;gap:10px;align-items:center"><a class="link-arrow" href="#profil" style="font-size:.88rem">Mes créneaux</a><label class="switch"><input type="checkbox" data-visible' + (me.partenaire.actif ? ' checked' : '') + ' aria-label="Apparaître dans l\'annuaire"><span></span></label></div></div>' +
        '<div class="filters-bar"><label class="search-m">' + ic('search') + '<input type="search" placeholder="Rechercher un nom" value="' + esc(F.q) + '" data-q aria-label="Rechercher un joueur"></label>' +
          '<button class="fchip" data-f="near"' + pressed(F.near) + '>' + ic('target') + 'Mon niveau (' + esc(me.classement) + ')</button>' +
          SLOTS.map(function (s) { return '<button class="fchip" data-f="slot" data-v="' + s + '"' + pressed(F.slots[s]) + '>' + s[0].toUpperCase() + s.slice(1) + '</button>'; }).join('') +
          ['Loisir', 'Compétitif', 'Double', 'Mixte'].map(function (s) { return '<button class="fchip" data-f="style" data-v="' + s + '"' + pressed(F.styles[s]) + '>' + s + '</button>'; }).join('') +
        '</div><p class="muted" style="margin-bottom:12px;font-size:.9rem" aria-live="polite">' + list2.length + ' joueur' + (list2.length > 1 ? 's' : '') + '</p>' +
        (list2.length ? '<div class="players">' + list2.map(playerCard).join('') + '</div>' : '<div class="empty">Aucun joueur ne correspond. Retirez un filtre ou publiez une annonce.</div>');
    }
    $('#v-jouer').innerHTML = '<div class="v-head"><div><h1>Jouer</h1><p>Trouvez un partenaire pour un simple, un double ou une partie à quatre.</p></div>' +
      '<div class="seg-tabs" role="tablist"><button role="tab" data-ptab="annonces" aria-selected="' + (playTab === 'annonces') + '">Annonces</button><button role="tab" data-ptab="annuaire" aria-selected="' + (playTab === 'annuaire') + '">Annuaire</button></div></div>' + body;
    var q = $('[data-q]'); if (q) q.addEventListener('input', function () { F.q = q.value; var pos = q.selectionStart; RENDER.jouer(); var nq = $('[data-q]'); nq.focus(); nq.setSelectionRange(pos, pos); });
  };
  function openPostForm() {
    var dayOpts = ''; for (var i = 0; i < 10; i++) { var t = addDays(i); dayOpts += '<option value="' + i + '">' + esc(i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : fmt.short(t)) + '</option>'; }
    var hours = ''; for (var h = 8; h <= 21; h++) hours += '<option' + (h === 18 ? ' selected' : '') + '>' + h + '</option>';
    var mi = rankIdx(S.me.classement);
    openDrawer('Publier une annonce',
      '<form class="form" id="post-form">' +
        '<div class="field"><span class="label">Type de partie</span><div class="segmented">' + ['Simple', 'Double', 'Mixte', 'Partie à 4'].map(function (k, i) { return '<input type="radio" name="kind" id="k' + i + '" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><label for="k' + i + '">' + k + '</label>'; }).join('') + '</div></div>' +
        '<div class="row"><div class="field"><label for="pf-day">Jour</label><select id="pf-day" name="day">' + dayOpts + '</select></div><div class="field"><label for="pf-h">Heure</label><select id="pf-h" name="h">' + hours + '</select></div></div>' +
        '<div class="field"><label for="pf-s">Surface</label><select id="pf-s" name="surface"><option>Peu importe</option><option>Terre battue</option><option>Béton poreux</option><option>Court couvert</option></select></div>' +
        '<div class="field"><label for="pf-l">Niveau recherché</label><select id="pf-l" name="level"><option>Tous niveaux</option><option selected>' + LADDER[Math.max(0, mi - 2)] + ' à ' + LADDER[Math.min(LADDER.length - 1, mi + 2)] + '</option></select><span class="hint">Les joueurs de ce niveau voient une pastille sur « Jouer ».</span></div>' +
        '<div class="field"><label for="pf-t">Message (facultatif)</label><textarea id="pf-t" name="text" maxlength="140" style="min-height:90px" placeholder="Ex. : 1 h d\'échanges puis un set"></textarea></div>' +
        '<button class="btn btn-ball btn-block" type="submit">' + ic('megaphone') + 'Publier</button></form>',
      function () {
        $('#post-form').addEventListener('submit', function (e) {
          e.preventDefault(); var fd = new FormData(e.target);
          S.posts.push({ id: uid(), uid: 'me', kind: fd.get('kind'), when: addDays(+fd.get('day'), +fd.get('h')), slot: '', surface: fd.get('surface'), level: fd.get('level'), text: fd.get('text').trim(), created: Date.now(), going: [] });
          save(); closeDrawer(); playTab = 'annonces'; go('jouer'); toast('Annonce publiée');
        });
      });
  }

  /* ---------- Équipes ---------- */
  RENDER.equipes = function () {
    var T = S.team, up = S.matches.filter(function (m) { return m.date > Date.now(); }).sort(function (a, b) { return a.date - b.date; });
    var convs = up.filter(function (m) { return T.convocations[m.id] && T.convocations[m.id].me; });
    var head = '<tr><th scope="col">Joueur</th>' + up.map(function (m) { return '<th scope="col">' + esc(fmt.short(m.date)) + '<br>' + (m.dom ? 'vs ' : '@ ') + esc(m.adv) + '</th>'; }).join('') + '</tr>';
    var rows = T.roster.map(function (p) {
      var isMe = p.uid === 'me';
      return '<tr class="' + (isMe ? 'me' : '') + '"><td>' + esc(isMe ? 'Moi' : p.prenom + ' ' + p.nom[0] + '.') + ' <span class="rank" style="color:var(--ink-3)">' + esc(p.classement) + '</span></td>' +
        up.map(function (m) {
          var v = (T.dispos[m.id] || {})[p.uid] || '';
          if (isMe) return '<td><button class="av-toggle ' + v + '" data-dispo="' + m.id + '" aria-label="Ma disponibilité le ' + esc(fmt.short(m.date)) + '">' + (v === 'y' ? 'Dispo' : v === 'n' ? 'Indispo' : 'À dire') + '</button></td>';
          return '<td><span class="dot-s ' + v + '" title="' + (v === 'y' ? 'Disponible' : v === 'n' ? 'Indisponible' : 'Pas de réponse') + '"></span></td>';
        }).join('') + '</tr>';
    }).join('');
    $('#v-equipes').innerHTML =
      '<div class="v-head"><div><h1>Mes équipes</h1><p>' + esc(T.nom) + ' · ' + esc(T.champ) + '. Capitaine : ' + esc(T.capitaine) + '.</p></div><button class="btn" data-chat>' + ic('chat') + 'Discussion d\'équipe <span class="badge">' + S.chat.length + '</span></button></div>' +
      (convs.length ? '<h2 class="v-sub">Convocations</h2><div class="convoc">' + convs.map(function (m) { return matchBoard(m); }).join('') + '</div>' : '') +
      '<h2 class="v-sub">Disponibilités de l\'équipe</h2><p class="muted" style="margin:-6px 0 12px;font-size:.9rem">Touchez vos cases pour indiquer si vous êtes disponible. Le capitaine compose l\'équipe avec.</p>' +
      '<p class="legend-m"><span><i class="dot-s y"></i>Disponible</span><span><i class="dot-s n"></i>Indisponible</span><span><i class="dot-s"></i>Pas de réponse</span></p><div class="roster-wrap"><table class="roster"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<h2 class="v-sub">Championnats ouverts aux inscriptions</h2><div class="stack">' + S.champs.map(function (c) {
        return '<div class="champ"><div><b>' + esc(c.nom) + '</b><span>' + esc(c.detail) + ' · inscription avant le ' + esc(fmt.short(c.limite)) + '</span></div>' +
          (c.inscrit ? '<span class="status-pill ok" style="color:var(--ok)"><i></i>Demande envoyée, le capitaine valide</span>' : '<button class="btn btn-blue btn-sm" data-champ="' + c.id + '">Je m\'inscris</button>') + '</div>';
      }).join('') + '</div>';
  };
  function openChat() {
    var render = function () {
      return S.chat.map(function (c) {
        var me = c.uid === 'me';
        return '<div class="chat-line' + (me ? ' me' : '') + '"><span class="who">' + esc(me ? 'Moi' : c.nom) + ' · ' + esc(fmt.ago(c.at)) + '</span><div class="bubble">' + esc(c.text) + '</div></div>';
      }).join('');
    };
    openDrawer(S.team.nom, '<div id="chat-list" class="stack" aria-live="polite">' + render() + '</div>',
      function () {
        var b = $('.drawer-body'); b.scrollTop = b.scrollHeight;
        $('#chat-form').addEventListener('submit', function (e) {
          e.preventDefault(); var i = $('#chat-in'), v = i.value.trim(); if (!v) return;
          S.chat.push({ uid: 'me', nom: 'Moi', text: v, at: Date.now() }); save(); i.value = '';
          $('#chat-list').innerHTML = render(); b.scrollTop = b.scrollHeight;
        });
        $('#chat-in').focus();
      },
      '<form class="chat-form" id="chat-form"><input id="chat-in" autocomplete="off" placeholder="Covoiturage, balles, horaires…" aria-label="Votre message"><button class="icon-btn" aria-label="Envoyer">' + ic('send') + '</button></form>');
  }

  /* ---------- Agenda ---------- */
  var agFilter = 'tout';
  var CAT = { animation: ['Animation', 'cat-evenement'], competition: ['Compétition', 'cat-competition'], tournoi: ['Tournoi', 'cat-competition'], stage: ['Stage', 'cat-ecole'], vie: ['Vie du club', 'cat-vie-du-club'] };
  function gcal(e) {
    var f = function (t) { return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.titre) + '&dates=' + f(e.start) + '/' + f(e.start + e.end * 36e5) + '&location=' + encodeURIComponent('USM Tennis Montargis, 43 avenue Louis Maurice Chautemps, 45200 Montargis') + '&details=' + encodeURIComponent(e.desc || '');
  }
  function eventRow(e) {
    var inn = S.eventsIn[e.id], c = CAT[e.cat] || ['Club', 'cat-vie-du-club'];
    return '<article class="ev' + (inn ? ' is-in' : '') + '"><div class="ev-date"><b>' + fmt.dnum(e.start) + '</b><span>' + esc(fmt.dmon(e.start)) + '</span></div>' +
      '<div><div class="ev-title">' + esc(e.titre) + '</div><div class="ev-meta"><span class="chip ' + c[1] + '">' + c[0] + '</span><span>' + ic('clock') + esc(e.timeTxt || fmt.time(e.start)) + '</span><span>' + ic('pin') + esc(e.lieu) + '</span>' + (e.inscription && e.count ? '<span>' + ic('users') + e.count + ' inscrit' + (e.count > 1 ? 's' : '') + '</span>' : '') + '</div></div>' +
      '<div class="ev-actions">' + (e.inscription ? (inn ? '<button class="btn btn-sm" data-evin="' + e.id + '">' + ic('check') + 'Inscrit</button>' : '<button class="btn btn-blue btn-sm" data-evin="' + e.id + '">Je m\'inscris</button>') : '') +
      '<a class="icon-btn" href="' + esc(gcal(e)) + '" target="_blank" rel="noopener" aria-label="Ajouter à mon agenda" title="Ajouter à mon agenda">' + ic('calendar') + '</a></div></article>';
  }
  RENDER.agenda = function () {
    var list = S.events.filter(function (e) { return (e.endTs || e.start) > Date.now() && (agFilter === 'tout' || (agFilter === 'inscrit' ? S.eventsIn[e.id] : e.cat === agFilter)); }).sort(function (a, b) { return a.start - b.start; });
    var byMonth = {}, order = [];
    list.forEach(function (e) { var k = fmt.month(e.start); if (!byMonth[k]) { byMonth[k] = []; order.push(k); } byMonth[k].push(e); });
    var unread = unreadMsgs().length;
    var msgs = allMsgs().sort(function (a, b) { return (b.type === 'urgent') - (a.type === 'urgent') || b.createdAt - a.createdAt; });
    $('#v-agenda').innerHTML =
      '<div class="v-head"><div><h1>Agenda du club</h1><p>Tournois, animations, rencontres par équipes et messages du bureau.</p></div></div>' +
      '<details class="msgs"' + (unread ? ' open' : '') + '><summary>' + ic('megaphone') + 'Messages du bureau' + (unread ? ' <span class="badge" style="margin-left:0">' + unread + ' nouveau' + (unread > 1 ? 'x' : '') + '</span>' : '') + ic('chevron-down') + '</summary><div class="stack">' +
        msgs.map(function (m) { return '<div class="msg ' + (m.type !== 'info' ? m.type : '') + '"><div class="msg-top">' + (m.type !== 'info' ? '<span class="tag ' + m.type + '">' + (m.type === 'urgent' ? 'Urgent' : 'Important') + '</span>' : '') + '<span>' + esc(fmt.ago(m.createdAt)) + '</span></div><b>' + esc(m.titre) + '</b><p>' + esc(m.texte) + '</p></div>'; }).join('') +
      '</div></details>' +
      '<div class="filters-bar">' + [['tout', 'Tout'], ['inscrit', 'Mes inscriptions'], ['tournoi', 'Tournois'], ['animation', 'Animations'], ['competition', 'Compétition'], ['stage', 'Stages'], ['vie', 'Vie du club']].map(function (f) { return '<button class="fchip" data-ag="' + f[0] + '" aria-pressed="' + (agFilter === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      (order.length ? order.map(function (k) { return '<h2 class="month-label">' + esc(k) + '</h2><div class="ev-list">' + byMonth[k].map(eventRow).join('') + '</div>'; }).join('') : '<div class="empty">Rien pour ce filtre.</div>');
    var d = $('details.msgs'); if (d) d.addEventListener('toggle', function () { if (d.open) { allMsgs().forEach(function (m) { S.readMsgs[m.id] = 1; }); save(); updateBadges(); } });
    if (unread) { allMsgs().forEach(function (m) { S.readMsgs[m.id] = 1; }); save(); }
  };

  /* ---------- Profil ---------- */
  function ladderChart(hist) {
    var seasons = Object.keys(hist).sort(), vals = seasons.map(function (s) { return rankIdx(hist[s]); });
    var lo = Math.max(0, Math.min.apply(null, vals) - 1), hi = Math.min(LADDER.length - 1, Math.max.apply(null, vals) + 1);
    var W = 560, H = 250, pl = 50, pr = 18, pt = 18, pb = 34;
    var x = function (i) { return pl + (seasons.length === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (seasons.length - 1)); };
    var y = function (v) { return pt + (hi - v) * (H - pt - pb) / Math.max(1, hi - lo); };
    var g = '';
    for (var v = lo; v <= hi; v++) g += '<line class="grid-l" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="lbl" x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + LADDER[v] + '</text>';
    var d = vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(v); }).join(' ');
    var area = d + ' L' + x(vals.length - 1) + ' ' + (H - pb) + ' L' + x(0) + ' ' + (H - pb) + ' Z';
    var pts = vals.map(function (v, i) { var last = i === vals.length - 1; return '<circle class="pt' + (last ? ' last' : '') + '" cx="' + x(i) + '" cy="' + y(v) + '" r="' + (last ? 7 : 5) + '"/>' + '<text class="lbl" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + seasons[i].slice(2, 4) + '-' + seasons[i].slice(7) + '</text>'; }).join('');
    return '<svg class="ladder" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Évolution du classement de ' + esc(hist[seasons[0]]) + ' à ' + esc(hist[seasons[seasons.length - 1]]) + '">' + g + '<path class="area" d="' + area + '"/><path class="path" d="' + d + '"/>' + pts + '</svg>';
  }
  RENDER.profil = function () {
    var me = S.me, P = me.partenaire, hist = me.classementHistory, seasons = Object.keys(hist).sort();
    var gained = rankIdx(me.classement) - rankIdx(hist[seasons[0]]);
    var dispoEdit = '<div class="dispo" style="max-width:420px"><span></span>' + DAYS_L.map(function (x) { return '<span class="d-h">' + x + '</span>'; }).join('');
    SLOTS.forEach(function (s) { dispoEdit += '<span>' + s + '</span>'; DAYS.forEach(function (dd) { var on = P.dispos[dd] && P.dispos[dd][s]; dispoEdit += '<button type="button" class="dispo-cell" data-cell="' + dd + '|' + s + '" aria-pressed="' + !!on + '" aria-label="' + dd + ' ' + s + '" style="height:26px;border:0;border-radius:4px;cursor:pointer;background:' + (on ? 'var(--grass)' : 'var(--bg-2)') + '"></button>'; }); });
    dispoEdit += '</div>';
    var tg = function (k, t, s) { return '<div class="toggle-row"><div><b>' + t + '</b><span>' + s + '</span></div><label class="switch"><input type="checkbox" data-notif="' + k + '"' + (me.notifs[k] ? ' checked' : '') + ' aria-label="' + t + '"><span></span></label></div>'; };
    $('#v-profil').innerHTML =
      '<div class="v-head"><div class="profile-head"><div class="photo-edit">' + avatar(me) + '<label title="Changer ma photo">' + ic('camera') + '<span class="sr-only">Changer ma photo</span><input type="file" accept="image/*" data-photo></label></div>' +
        '<div><h1>' + esc(me.prenom + ' ' + me.nom) + '</h1><p>' + [me.depuis ? 'Membre depuis ' + me.depuis : '', esc(me.categorie)].filter(Boolean).join(' · ') + '</p></div></div></div>' +
      (!me.telephone ? '<div class="alert-soft">' + ic('info') + '<div><b>Sans téléphone, vos coéquipiers ne peuvent pas vous joindre rapidement avant un match.</b> Ajoutez-le ci-dessous, il n\'est visible que par les membres de vos équipes' + (P.partager_telephone ? ' et de l\'annuaire' : '') + '.</div></div>' : '') +
      '<div class="grid-2" style="margin-top:20px">' +
        '<section class="panel-m"><h2 class="v-sub" style="margin-top:0">Mes coordonnées</h2><form class="form" id="coord-form">' +
          '<div class="field"><label for="pe-email">Email</label><input id="pe-email" type="email" name="email" value="' + esc(me.email) + '" autocomplete="email" required></div>' +
          '<div class="field"><label for="pe-tel">Téléphone</label><input id="pe-tel" type="tel" name="telephone" value="' + esc(me.telephone) + '" autocomplete="tel" placeholder="06 12 34 56 78"></div>' +
          '<button class="btn btn-blue" type="submit">Enregistrer</button></form>' +
          '</section><section class="panel-m"><h2 class="v-sub" style="margin-top:0">Gérées par le club</h2><div class="kv"><div><small>Licence FFT</small><b>' + esc(me.licence) + '</b></div><div><small>Catégorie</small><b>' + esc(me.categorie) + '</b></div></div>' +
          '<p class="muted" style="font-size:.85rem;margin-top:10px">Une erreur ? Écrivez au secrétariat : <a href="mailto:' + esc(CLUB.email) + '">' + esc(CLUB.email) + '</a></p></section>' +
        '</div><section class="panel-m" style="margin-top:16px"><h2 class="v-sub" style="margin-top:0">Ma progression' + (gained > 0 ? ' <span class="chip cat-ecole">+' + gained + ' échelon' + (gained > 1 ? 's' : '') + ' depuis ' + seasons[0].slice(0, 4) + '</span>' : '') + '</h2>' +
          '<div class="rank-now"><div><small>Classement actuel</small><b>' + esc(me.classement) + '</b><span>' + (me.classementAt ? 'confirmé le ' + esc(fmt.short(me.classementAt)) : 'à confirmer') + '</span></div><button type="button" class="btn btn-sm" data-rank>' + ic('edit') + 'Mettre à jour</button></div>' + ladderChart(hist) +
          '<p class="muted" style="font-size:.85rem;margin-top:8px">Chaque mois, reportez ici votre classement Ten\'Up. Il alimente votre carte, l\'annuaire et les annonces à votre niveau.</p></section>' +
      shopReminder() +
      '<section class="panel-m" style="margin-top:16px"><h2 class="v-sub" style="margin-top:0">Mon profil de joueur</h2><p class="muted" style="margin:-6px 0 14px;font-size:.9rem">Ces infos alimentent l\'annuaire « Jouer » et les annonces à votre niveau.</p>' +
        '<div class="grid-2"><div class="stack"><div class="field"><span class="label">Style de jeu</span><div class="filters-bar" style="margin:0">' + ['Loisir', 'Compétitif', 'Double', 'Mixte'].map(function (s) { return '<button type="button" class="fchip" data-pstyle="' + s + '" aria-pressed="' + (P.style.indexOf(s) >= 0) + '">' + s + '</button>'; }).join('') + '</div></div>' +
          '<div class="field"><span class="label">Les membres peuvent me joindre par</span><div class="filters-bar" style="margin:0"><button type="button" class="fchip" data-share="partager_telephone" aria-pressed="' + !!P.partager_telephone + '">' + ic('phone') + 'Téléphone</button><button type="button" class="fchip" data-share="partager_email" aria-pressed="' + !!P.partager_email + '">' + ic('mail') + 'Email</button></div></div>' +
          '<div class="field"><label for="pp-msg">Petit mot (100 caractères)</label><input id="pp-msg" maxlength="100" value="' + esc(P.message) + '" data-pmsg></div></div>' +
          '<div class="field"><span class="label">Mes créneaux habituels</span>' + dispoEdit + '<span class="hint">Touchez une case pour l\'activer.</span></div></div></section>' +
      '<div class="grid-2" style="margin-top:16px">' +
        '<section class="panel-m"><h2 class="v-sub" style="margin-top:0">Notifications</h2><div class="toggles">' +
          (TEAMS_ON ? tg('convocations', 'Convocations et équipe', 'Par email, dès que le capitaine vous convoque') : '') + tg('annonces', 'Annonces à mon niveau', 'Quand un membre cherche un partenaire proche de votre classement') + tg('bureau', 'Messages du bureau', 'Fermetures, événements, infos importantes') + tg('push', 'Notifications sur ce téléphone', 'En plus des emails, avec l\'application installée') +
        '</div></section>' +
        '<section class="panel-m"><h2 class="v-sub" style="margin-top:0">Compte</h2><div class="stack">' +
          '<button class="btn" data-install>' + ic('download') + 'Installer l\'application sur mon téléphone</button>' +
          '<button class="btn" data-pw>' + ic('lock') + 'Changer mon mot de passe</button>' +
          '<button class="btn" data-logout>' + ic('logout') + 'Se déconnecter</button>' +
          (LIVE ? '' : '<button class="btn" data-reset style="border-style:dashed">' + ic('repeat') + 'Réinitialiser la démo</button>') +
        '</div></section>' +
      '</div>';
    $('#coord-form').addEventListener('submit', function (e) {
      e.preventDefault(); var fd = new FormData(e.target);
      me.email = fd.get('email').trim(); me.telephone = fd.get('telephone').trim(); save(); toast('Coordonnées enregistrées'); RENDER.profil(); updateBadges();
    });
    var msg = $('[data-pmsg]'); msg.addEventListener('change', function () { P.message = msg.value.trim(); save(); toast('Petit mot enregistré'); });
  };

  /* =====================================================================
     Boutique — commandes groupées
     Catalogue : Admin › Boutique (site_v2/shopProducts). Réservations,
     compteurs et liste d'attente : USM.store.shop (voir store.js).
     ===================================================================== */
  var SHOP = { ready: false, products: [], counters: {}, mine: {}, waiting: {}, notes: [] };
  var shopTab = 'produits', shopFilter = 'tout';
  var PS = null; // fiche produit ouverte : { pid, size, color, qty, mark, marking, rid, step, cancel, busy, err }
  var ST = {
    ouverte: ['Ouverte', 'st-open'], atteint: ['Minimum atteint', 'st-ok'], commandee: ['Commandée', 'st-ordered'],
    disponible: ['Disponible au club', 'st-ready'], terminee: ['Terminée', 'st-done'], annulee: ['Annulée', 'st-cancel']
  };
  var SWATCH = { 'bleu royal': '#1541c9', 'bleu marine': '#0b1640', 'marine': '#0b1640', 'blanc': '#ffffff', 'jaune balle': '#dcf23f', 'jaune': '#dcf23f', 'noir': '#14161c', 'gris': '#9aa3b8', 'rouge': '#c43a31', 'vert': '#2f7a55', 'orange': '#e8833a' };
  var TRACK_STEPS = ['Réservée', 'Commande passée', 'Disponible au club', 'Retirée'];
  var SITE = ((window.USM_CONFIG || {}).siteUrl || 'https://tennismontargis.fr').replace(/\/$/, '');

  function shopApi() { return window.USM && window.USM.store && window.USM.store.shop; }
  /* Mesure : passe par la fonction de suivi du site si elle est chargée, sinon ne fait rien */
  function track(name, tags) { try { if (window.USM && typeof window.USM.track === 'function') window.USM.track(name, tags); } catch (e) {} }
  function euro(n) { n = Math.round((Number(n) || 0) * 100) / 100; return (n % 1 ? n.toFixed(2).replace('.', ',') : String(n)) + ' €'; }
  function dm(t) { return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  function dEnd(p) { var a = shopApi(); return a ? a.deadlineEnd(p) : new Date(p.deadline + 'T23:59:59').getTime(); }
  function isOpen(p) { return p.status === 'ouverte' && Date.now() <= dEnd(p); }
  function daysLeft(p) { return Math.round((day0(dEnd(p)) - day0(Date.now())) / 864e5); }
  function sKey(s) { var a = shopApi(); return a ? a.sizeKey(s) : String(s); }
  function product(pid) { return SHOP.products.filter(function (p) { return p.id === pid; })[0]; }
  function visibleProducts() { return SHOP.products.filter(function (p) { return p && !p.draft && p.status && p.status !== 'brouillon'; }); }
  function openOrders() { return visibleProducts().filter(isOpen).sort(function (a, b) { return dEnd(a) - dEnd(b); }); }
  function unseenShop() { return openOrders().filter(function (p) { return !S.shopSeen[p.id]; }); }
  function mineOf(pid) { return SHOP.mine[pid] || []; }
  function mineQty(pid, except) { return mineOf(pid).reduce(function (n, r) { return n + (r.id === except || r.status === 'annulee' ? 0 : r.qty || 0); }, 0); }
  function allMine() {
    var out = []; visibleProducts().concat(SHOP.products.filter(function (p) { return p.draft; })).forEach(function (p) { mineOf(p.id).forEach(function (r) { out.push({ p: p, r: r }); }); });
    return out.sort(function (a, b) { return (b.r.createdAt || 0) - (a.r.createdAt || 0); });
  }
  function imgSrc(p, i) { var im = (p.images || [])[i || 0]; return im ? (im.sm || im.src) : ''; }
  function thumbOf(p, cls) { var s = imgSrc(p); return s ? '<img class="' + (cls || '') + '" src="' + esc(s) + '" alt="" loading="lazy">' : '<span class="' + (cls || '') + ' ph-bag">' + ic('bag') + '</span>'; }
  function noun(p, n) { var w = String(p.name || 'pièce').split(/\s+/)[0].toLowerCase(); if (p.minMode === 'size') w = 'pièce'; return n > 1 && !/[sx]$/.test(w) ? w + 's' : w; }

  function progress(p) {
    var c = SHOP.counters[p.id] || { total: 0, parTaille: {} }, min = Math.max(1, +p.minQty || 1), total = c.total || 0;
    if (p.minMode === 'size') {
      var per = [], missing = 0;
      (p.sizes || []).forEach(function (s) { var n = (c.parTaille || {})[sKey(s)] || 0; if (n) { var m = Math.max(0, min - n); missing += m; per.push({ size: s, n: n, missing: m }); } });
      if (!per.length) missing = min;
      var ok = per.length > 0 && missing === 0;
      return { total: total, min: min, missing: missing, reached: ok, pct: ok ? 100 : Math.round(100 * total / (total + missing)), per: per, bySize: true };
    }
    var miss = Math.max(0, min - total);
    return { total: total, min: min, missing: miss, reached: miss === 0, pct: Math.min(100, Math.round(100 * total / min)), per: [], bySize: false };
  }
  function statusKey(p) { if (p.status === 'ouverte') return progress(p).reached ? 'atteint' : 'ouverte'; return ST[p.status] ? p.status : 'ouverte'; }
  function statusChip(p, cls) { var s = ST[statusKey(p)]; return '<span class="shop-st ' + s[1] + (cls ? ' ' + cls : '') + '">' + s[0] + '</span>'; }
  function meterCls(pr) { return pr.reached ? ' full' : pr.missing <= 5 ? ' near' : ''; }
  function meter(pr, label) {
    return '<div class="meter' + meterCls(pr) + '" role="progressbar" aria-label="' + esc(label || 'Pièces réservées') + '" aria-valuemin="0" aria-valuemax="' + (pr.total + pr.missing) + '" aria-valuenow="' + pr.total + '"><i style="width:' + Math.max(3, pr.pct) + '%"></i></div>';
  }
  function counterText(p, pr) {
    if (pr.reached) return '<b>Objectif atteint</b>, la commande partira le ' + esc(dm(dEnd(p) + 1000));
    if (pr.missing <= 5) return '<b>Presque !</b> Plus que ' + pr.missing + ' pièce' + (pr.missing > 1 ? 's' : '') + (pr.bySize ? ' (' + pr.per.filter(function (x) { return x.missing; }).map(function (x) { return esc(x.size) + ' : ' + x.missing; }).join(', ') + ')' : '');
    if (pr.bySize) return pr.total + ' pièce' + (pr.total > 1 ? 's' : '') + ' · minimum ' + pr.min + ' par taille — <b>il en manque ' + pr.missing + '</b>';
    return pr.total + ' / ' + pr.min + ' pièces — <b>il en manque ' + pr.missing + '</b>';
  }
  function deadlineLine(p) {
    if (p.status !== 'ouverte') return '';
    var n = daysLeft(p);
    if (n < 0) return '<p class="sc-dead is-closed">' + ic('lock') + 'Réservations closes depuis le ' + esc(fmt.short(dEnd(p))) + '</p>';
    var cd = n === 0 ? 'dernier jour' : n === 1 ? 'jusqu\'à demain' : n <= 7 ? 'plus que ' + n + ' jours' : '';
    return '<p class="sc-dead">' + ic('clock') + '<span>Réservations jusqu\'au ' + esc(fmt.short(dEnd(p))) + '</span>' + (cd ? '<span class="countdown">' + cd + '</span>' : '') + '</p>';
  }
  function phaseText(p) {
    var a = SHOP.counters[p.id] || {};
    if (p.status === 'commandee') return ic('check') + 'Commande passée chez le fournisseur' + (p.deliveryDate ? ' · livraison estimée le ' + esc(fmt.short(new Date(p.deliveryDate + 'T12:00').getTime())) : '');
    if (p.status === 'disponible') return ic('pin') + 'Arrivée ! À retirer au club house';
    if (p.status === 'terminee') return ic('repeat') + 'Commande terminée' + (a.attente ? ' · ' + a.attente + ' membre' + (a.attente > 1 ? 's' : '') + ' attendent la prochaine' : '');
    if (p.status === 'annulee') return ic('info') + 'Minimum non atteint : commande annulée, personne n\'a payé';
    return '';
  }

  function shopCard(p) {
    var pr = progress(p), mq = mineQty(p.id), live = p.status === 'ouverte';
    return '<article class="shop-card ' + ST[statusKey(p)][1] + '"><div class="sc-media">' + thumbOf(p) + statusChip(p) + (mq ? '<span class="sc-mine">' + ic('check') + 'Réservé · ' + mq + '</span>' : '') + '</div>' +
      '<div class="sc-body"><h3><button type="button" class="sc-link" data-product="' + esc(p.id) + '">' + esc(p.name) + '</button></h3>' +
      '<p class="sc-price"><b>' + euro(p.priceMember) + '</b>' + (p.pricePublic ? ' <s aria-label="Prix public ' + esc(euro(p.pricePublic)) + '">' + euro(p.pricePublic) + '</s>' : '') + ' <small>prix membre</small></p>' +
      (live ? meter(pr) + '<p class="meter-txt' + meterCls(pr) + '">' + counterText(p, pr) + '</p>' + deadlineLine(p) : '<p class="sc-phase">' + phaseText(p) + '</p>') +
      '</div></article>';
  }
  function resStep(r) { return { reservee: 0, commandee: 1, disponible: 2, retiree: 3 }[r.status] || 0; }
  function payPill(p, r) {
    if (r.status === 'annulee' || p.status === 'annulee') return '<span class="pay-pill">Rien à payer</span>';
    if (r.paid) return '<span class="pay-pill ok">' + ic('check') + 'Réglé</span>';
    if (r.status === 'reservee') return '<span class="pay-pill">Rien à payer pour l\'instant</span>';
    return '<span class="pay-pill due">À régler</span>';
  }
  function resLine(r) {
    return [r.size, r.color, '× ' + r.qty].filter(Boolean).map(esc).join(' · ') + (r.marking ? ' · marquage « ' + esc(r.marking) + ' »' : '');
  }
  function resActions(p, r, inDrawer) {
    if (r.status === 'annulee' || p.status === 'annulee') return '';
    if (isOpen(p)) return '<div class="res-actions"><button type="button" class="btn btn-sm" data-editres="' + esc(r.id) + '" data-pid="' + esc(p.id) + '">' + ic('edit') + 'Modifier</button><button type="button" class="btn btn-sm btn-quiet" data-cancelres="' + esc(r.id) + '" data-pid="' + esc(p.id) + '">' + ic('trash') + 'Annuler</button></div>';
    if (p.status === 'ouverte') return '<p class="res-lock">' + ic('lock') + 'Date limite passée : pour modifier ou annuler, contactez le bureau (<a href="mailto:' + esc(CLUB.email) + '">' + esc(CLUB.email) + '</a>).</p>';
    if (p.status === 'commandee' && p.payUrl && !r.paid && !inDrawer) return '<div class="res-actions"><a class="btn btn-blue btn-sm" href="' + esc(p.payUrl) + '" target="_blank" rel="noopener">' + ic('euro') + 'Régler ' + euro(r.total) + '</a></div>';
    return '';
  }
  function resCard(p, r) {
    var cancelled = r.status === 'annulee' || p.status === 'annulee', step = resStep(r);
    var steps = cancelled ? '<p class="res-cancel">' + ic('info') + 'Commande annulée, minimum non atteint</p>'
      : '<ol class="track" aria-label="Suivi de la réservation">' + TRACK_STEPS.map(function (t, i) { return '<li class="' + (i < step ? 'done' : i === step ? 'now' : '') + '"' + (i === step ? ' aria-current="step"' : '') + '><i></i><span>' + t + '</span></li>'; }).join('') + '</ol>' +
        '<p class="track-now" aria-hidden="true">Étape ' + (step + 1) + '/4 : <b>' + TRACK_STEPS[step] + '</b>' + (step < 3 ? ' · ensuite : ' + TRACK_STEPS[step + 1].toLowerCase() : '') + '</p>';
    return '<article class="res' + (cancelled ? ' is-cancel' : '') + '">' + thumbOf(p, 'res-img') + '<div class="res-main"><b>' + esc(p.name) + '</b><span>' + resLine(r) + '</span></div>' +
      '<div class="res-side"><b class="res-amt">' + euro(r.total) + '</b>' + payPill(p, r) + '</div>' + steps + resActions(p, r) + '</article>';
  }

  RENDER.boutique = function () {
    var el = $('#v-boutique');
    var mine = allMine(), mineN = mine.filter(function (x) { return x.r.status !== 'annulee' && x.p.status !== 'annulee' && !x.r.pickedUp; }).length;
    var head = '<div class="v-head"><div><h1>Boutique du club</h1><p>Commandes groupées aux couleurs de l\'USM : vous réservez, le club commande dès que le minimum est atteint.</p></div>' +
      '<div class="seg-tabs" role="tablist" aria-label="Boutique"><button role="tab" data-stab="produits" aria-selected="' + (shopTab === 'produits') + '">Produits</button><button role="tab" data-stab="mine" aria-selected="' + (shopTab === 'mine') + '">Mes réservations' + (mineN ? ' <span class="count-pill">' + mineN + '</span>' : '') + '</button></div></div>';
    if (!SHOP.ready) { el.innerHTML = head + '<div class="empty">Chargement de la boutique…</div>'; return; }
    openOrders().forEach(function (p) { S.shopSeen[p.id] = 1; }); save();
    var rule = '<div class="rule">' + ic('shield') + '<p><b>Règle d\'or :</b> personne ne paie tant que le minimum n\'est pas atteint. Pas atteint à la date limite ? La commande est annulée et chacun est prévenu.</p></div>';
    var body;
    if (shopTab === 'produits') {
      var list = visibleProducts().filter(function (p) { return shopFilter === 'tout' || (shopFilter === 'ouvertes' ? isOpen(p) : mineOf(p.id).length); })
        .sort(function (a, b) { return (isOpen(b) - isOpen(a)) || ((a.order || 0) - (b.order || 0)); });
      body = rule + '<div class="filters-bar" role="group" aria-label="Filtrer les produits">' + [['tout', 'Tout'], ['ouvertes', 'Ouvertes'], ['mine', 'Mes réservations']].map(function (f) { return '<button class="fchip" data-shopf="' + f[0] + '" aria-pressed="' + (shopFilter === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        (list.length ? '<div class="shop-grid">' + list.map(shopCard).join('') + '</div>'
          : '<div class="empty">' + (shopFilter === 'mine' ? 'Aucune réservation pour le moment.' : shopFilter === 'ouvertes' ? 'Aucune commande groupée ouverte en ce moment. Les prochaines apparaîtront ici.' : 'La boutique est vide pour le moment.') + '</div>');
    } else {
      body = mine.length ? '<div class="res-list">' + mine.map(function (x) { return resCard(x.p, x.r); }).join('') + '</div>' + rule
        : '<div class="empty">Vous n\'avez rien réservé. <button class="btn btn-sm" data-stab="produits">Voir les produits</button></div>';
    }
    el.innerHTML = head + (SHOP.error ? '<div class="alert-soft">' + ic('info') + '<div>Boutique momentanément indisponible : ' + esc(SHOP.error) + '</div></div>' : '') + body;
    updateBadges();
  };

  /* Bandeau d'accueil */
  function shopBanner() {
    if (!SHOP_ON) return '';
    var open = openOrders(); if (!open.length) return '';
    var p = open[0], pr = progress(p), n = daysLeft(p);
    var when = n === 0 ? 'dernier jour' : n === 1 ? 'jusqu\'à demain' : n <= 7 ? 'plus que ' + n + ' jours' : 'jusqu\'au ' + fmt.short(dEnd(p));
    return '<h2 class="v-sub">Commande groupée en cours' + (open.length > 1 ? ' <a class="link-arrow" href="#boutique">' + open.length + ' commandes' + ic('arrow') + '</a>' : '') + '</h2>' +
      '<a class="shop-banner" href="#boutique" data-product="' + esc(p.id) + '">' + thumbOf(p, 'sb-img') +
      '<span class="sb-main"><span class="sb-kicker"><i aria-hidden="true"></i>' + (pr.reached ? 'Objectif atteint' : 'Il en manque ' + pr.missing) + ' · ' + esc(when) + '</span><b>' + esc(p.name) + ' · ' + euro(p.priceMember) + '</b>' + meter(pr) +
      '<span class="sb-count">' + (pr.bySize ? pr.total + ' pièces réservées' : pr.total + ' / ' + pr.min + ' pièces') + (mineQty(p.id) ? ' · dont ' + mineQty(p.id) + ' à vous' : '') + '</span></span>' +
      '<span class="sb-cta">' + (mineQty(p.id) ? 'Voir' : 'Je réserve') + '</span></a>';
  }

  /* ---------- Fiche produit (tiroir) ---------- */
  function sizeGuide(p) {
    var rows = String(p.sizeGuideText || '').split('\n').map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); }).filter(function (r) { return r[0]; });
    var img = p.sizeGuide && p.sizeGuide.src ? '<img src="' + esc(p.sizeGuide.src) + '" alt="Guide des tailles" loading="lazy">' : '';
    if (!rows.length && !img) return '';
    var table = rows.length ? '<div class="guide-wrap"><table class="guide"><thead><tr>' + rows[0].map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice(1).map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td>' + esc(c) + '</td>' : '<th scope="row">' + esc(c) + '</th>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '';
    return '<details class="ps-guide"><summary>' + ic('target') + 'Guide des tailles' + ic('chevron-down') + '</summary>' + img + table + '</details>';
  }
  function partnerLink(p) {
    if (!p.partner) return '';
    var s = SPONSORS.filter(function (x) { return x.id === p.partner; })[0]; if (!s) return '';
    var i = SPONSORS.indexOf(s), offer = isOffer(s);
    return '<a class="ps-partner" href="#carte" ' + (offer ? 'data-perk="' + i + '"' : 'data-goto-perks') + '>' + logoOf(s) + '<span>Floqué avec notre partenaire <b>' + esc(s.name) + '</b><small>' + (offer ? 'Voir son avantage membre' : 'Ses avantages membres arrivent') + '</small></span>' + ic('chevron-right') + '</a>';
  }
  function board(p, pr, big) {
    var a = SHOP.counters[p.id] || {};
    var right = p.status !== 'ouverte' ? '<span class="pb-state">' + esc(ST[statusKey(p)][0]) + '</span>'
      : pr.reached ? '<span class="pb-miss ok">Objectif atteint' + (big ? '<span class="pb-ball" aria-hidden="true"></span>' : '') + '</span>'
      : '<span class="pb-miss' + (pr.missing <= 5 ? ' near' : '') + '">' + (pr.missing <= 5 ? 'Presque ! ' : '') + 'il en manque <b>' + pr.missing + '</b></span>';
    return '<div class="ps-board' + (pr.reached ? ' is-full' : '') + '"><div class="pb-top"><div class="pb-num"><b>' + pr.total + '</b><span>/ ' + (pr.bySize ? pr.min + ' par taille' : pr.min) + '</span><small>pièces réservées</small></div>' + right + '</div>' +
      meter(pr) + (pr.bySize && pr.per.length ? '<div class="pb-sizes">' + pr.per.map(function (x) { return '<span class="' + (x.missing ? '' : 'ok') + '">' + esc(x.size) + ' <b>' + x.n + '</b>' + (x.missing ? '<small>−' + x.missing + '</small>' : ic('check')) + '</span>'; }).join('') + '</div>' : '') +
      (p.status === 'ouverte' ? deadlineLine(p).replace('sc-dead', 'sc-dead pb-dead') : '') +
      (a.attente && (p.status === 'terminee' || p.status === 'annulee') ? '<p class="pb-wait">' + a.attente + ' membre' + (a.attente > 1 ? 's' : '') + ' attendent la prochaine commande</p>' : '') + '</div>';
  }
  function maxFor(p) { var left = p.maxPerMember ? p.maxPerMember - mineQty(p.id, PS && PS.rid) : 99; return Math.max(0, Math.min(20, left)); }
  function unitPrice(p) { return (+p.priceMember || 0) + (PS.mark && p.marking ? (+p.markingPrice || 0) : 0); }
  function psForm(p) {
    var sizes = p.sizes || [], colors = p.colors || [], max = maxFor(p);
    var opt = function (name, vals, cur, swatch) {
      return vals.map(function (v, i) {
        var id = 'ps-' + name + '-' + i, sw = swatch ? '<i class="sw" style="background:' + (SWATCH[String(v).toLowerCase()] || 'var(--bg-2)') + '"></i>' : '';
        return '<input type="radio" name="ps-' + name + '" id="' + id + '" value="' + esc(v) + '"' + (cur === v ? ' checked' : '') + '><label for="' + id + '">' + sw + esc(v) + '</label>';
      }).join('');
    };
    return '<div class="ps-form">' +
      (sizes.length > 1 ? '<fieldset class="ps-opt"><legend>Taille</legend><div class="ps-chips">' + opt('size', sizes, PS.size) + '</div>' + sizeGuide(p) + '</fieldset>' : (sizes[0] ? '<p class="ps-one"><b>Taille</b> ' + esc(sizes[0]) + '</p>' : '')) +
      (colors.length > 1 ? '<fieldset class="ps-opt"><legend>Couleur</legend><div class="ps-chips">' + opt('color', colors, PS.color, true) + '</div></fieldset>' : (colors[0] ? '<p class="ps-one"><b>Couleur</b> ' + esc(colors[0]) + '</p>' : '')) +
      '<div class="ps-opt"><span class="label" id="ps-qty-l">Quantité</span><div class="stepper" role="group" aria-labelledby="ps-qty-l"><button type="button" data-qty="-1" aria-label="Une pièce de moins"' + (PS.qty <= 1 ? ' disabled' : '') + '>' + ic('minus') + '</button><output id="ps-qty" aria-live="polite">' + PS.qty + '</output><button type="button" data-qty="1" aria-label="Une pièce de plus"' + (PS.qty >= max ? ' disabled' : '') + '>' + ic('plus') + '</button></div>' +
        (p.maxPerMember ? '<span class="hint">' + p.maxPerMember + ' pièce' + (p.maxPerMember > 1 ? 's' : '') + ' maximum par membre</span>' : '') + '</div>' +
      (p.marking ? '<div class="ps-opt"><label class="ps-mark"><input type="checkbox" id="ps-markon"' + (PS.mark ? ' checked' : '') + '><span>Marquage au dos <small>+' + euro(p.markingPrice || 0) + ' par pièce</small></span></label>' +
        '<div class="ps-mark-in"' + (PS.mark ? '' : ' hidden') + '><label class="sr-only" for="ps-marking">Texte du marquage</label><input id="ps-marking" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="Prénom ou initiales" value="' + esc(PS.marking) + '"><span class="hint" id="ps-mark-n">' + PS.marking.length + '/12</span></div></div>' : '') +
      '<p class="ps-total" id="ps-total">' + totalTxt(p) + '</p><p class="form-err" id="ps-err" role="alert"' + (PS.err ? '' : ' hidden') + '>' + esc(PS.err || '') + '</p></div>';
  }
  function totalTxt(p) { var u = unitPrice(p); return 'Total <b>' + euro(u * PS.qty) + '</b>' + (PS.qty > 1 ? '<small>' + PS.qty + ' × ' + euro(u) + '</small>' : ''); }
  function psRefresh() {
    var p = product(PS.pid); if (!p) return;
    var t = $('#ps-total'); if (t) t.innerHTML = totalTxt(p);
    var q = $('#ps-qty'); if (q) q.textContent = PS.qty;
    var max = maxFor(p);
    $$('[data-qty]').forEach(function (b) { b.disabled = +b.getAttribute('data-qty') < 0 ? PS.qty <= 1 : PS.qty >= max; });
    var mi = $('.ps-mark-in'); if (mi) mi.hidden = !PS.mark;
    var n = $('#ps-mark-n'); if (n) n.textContent = PS.marking.length + '/12';
    var b = $('[data-reserve]'); if (b) b.innerHTML = ic('bag') + (PS.rid ? 'Enregistrer · ' : 'Je réserve · ') + euro(unitPrice(p) * PS.qty);
    var e = $('#ps-err'); if (e) { e.hidden = !PS.err; e.textContent = PS.err || ''; }
  }
  function gallery(p) {
    var ims = p.images || [];
    if (!ims.length) return '<div class="ps-gal is-empty">' + ic('bag') + '</div>';
    return '<div class="ps-gal-wrap"><div class="ps-gal" id="ps-gal" tabindex="0" aria-label="Photos du produit, faites défiler">' + ims.map(function (im, i) { return '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || p.name) + '"' + (i ? ' loading="lazy"' : '') + '>'; }).join('') + '</div>' +
      (ims.length > 1 ? '<div class="ps-dots">' + ims.map(function (im, i) { return '<button type="button" data-gal="' + i + '" aria-label="Photo ' + (i + 1) + ' sur ' + ims.length + '"' + (i ? '' : ' aria-current="true"') + '></button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function shareBlock(p, pr) {
    var w = noun(p, pr.missing), when = fmt.short(dEnd(p));
    var text = pr.reached ? 'La commande groupée « ' + p.name + ' » de l\'USM Tennis Montargis est lancée ! Tu as jusqu\'au ' + when + ' pour réserver la tienne dans l\'espace membre : ' + SITE + '/espace-membre.html#boutique'
      : 'Il manque ' + pr.missing + ' ' + w + ' pour lancer la commande groupée de l\'USM Tennis Montargis (' + p.name + ', ' + euro(p.priceMember).replace(' ', ' ') + '). Réserve la tienne avant le ' + when + ' dans l\'espace membre : ' + SITE + '/espace-membre.html#boutique';
    return '<div class="share-box"><p><b>' + (pr.reached ? 'Faites-en profiter les copains' : 'Le partage fait tomber le compteur') + '</b>' + (pr.reached ? 'Ils ont jusqu\'au ' + esc(when) + ' pour réserver.' : 'Il manque encore ' + pr.missing + ' ' + esc(w) + '. Envoyez le lien à vos partenaires de jeu.') + '</p>' +
      '<div class="card-actions"><a class="btn btn-wa btn-sm" data-sharech="whatsapp" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">' + ic('whatsapp') + 'WhatsApp</a>' +
      '<a class="btn btn-sm" data-sharech="sms" href="sms:?&body=' + encodeURIComponent(text) + '">' + ic('chat') + 'SMS</a>' +
      '<button type="button" class="btn btn-sm" data-sharech="copie" data-copy="' + esc(text) + '">' + ic('copy') + 'Copier</button></div></div>';
  }
  function renderProduct() {
    var p = product(PS.pid); if (!p) { closeDrawer(); return; }
    var pr = progress(p), mine = mineOf(p.id).filter(function (r) { return r.status !== 'annulee'; }), open = isOpen(p), body, foot = '';
    if (PS.step === 'confirm') {
      var u = unitPrice(p);
      body = '<h3 class="ps-step" tabindex="-1">Vérifiez votre ' + (PS.rid ? 'modification' : 'réservation') + '</h3><div class="ps-recap">' + thumbOf(p) + '<div><b>' + esc(p.name) + '</b><dl>' +
        (p.sizes && p.sizes.length ? '<div><dt>Taille</dt><dd>' + esc(PS.size) + '</dd></div>' : '') + (p.colors && p.colors.length ? '<div><dt>Couleur</dt><dd>' + esc(PS.color) + '</dd></div>' : '') +
        '<div><dt>Quantité</dt><dd>' + PS.qty + '</dd></div>' + (PS.mark ? '<div><dt>Marquage</dt><dd>« ' + esc(PS.marking) + ' » (+' + euro(p.markingPrice) + ' par pièce)</dd></div>' : '') +
        '<div><dt>Prix</dt><dd>' + euro(u) + ' par pièce</dd></div></dl></div></div><p class="ps-total big">Total <b>' + euro(u * PS.qty) + '</b></p>' +
        '<div class="rule">' + ic('shield') + '<p><b>Vous ne payez rien aujourd\'hui.</b> Personne ne paie tant que le minimum n\'est pas atteint. S\'il ne l\'est pas le ' + esc(fmt.short(dEnd(p))) + ', la commande est annulée et vous êtes prévenu(e).</p></div>' +
        '<p class="muted" style="font-size:.9rem">Vous pourrez modifier ou annuler jusqu\'au ' + esc(fmt.long(dEnd(p))) + ' inclus.</p>' + (PS.err ? '<p class="form-err" role="alert">' + esc(PS.err) + '</p>' : '');
      foot = '<div class="ps-foot"><button type="button" class="btn" data-psback>' + ic('chevron-left') + 'Modifier</button><button type="button" class="btn btn-ball" data-confirm' + (PS.busy ? ' disabled' : '') + '>' + ic('check') + (PS.rid ? 'Enregistrer' : 'Je confirme') + '</button></div>';
    } else if (PS.step === 'done') {
      body = '<div class="ps-done"><span class="ok-ico">' + ic('check') + '</span><h3 class="ps-step" tabindex="-1">' + (PS.rid ? 'Réservation modifiée' : 'C\'est réservé !') + '</h3><p>' + PS.qty + ' × ' + esc(p.name) + (PS.size && (p.sizes || []).length > 1 ? ', taille ' + esc(PS.size) : '') + (PS.mark ? ', marquage « ' + esc(PS.marking) + ' »' : '') + '.</p></div>' +
        board(p, pr, true) + (pr.reached && PS.justReached ? '<p class="ps-cheer">' + ic('sparkle') + 'Grâce à vous, l\'objectif est atteint : la commande partira le ' + esc(dm(dEnd(p) + 1000)) + '.</p>' : '') + shareBlock(p, pr);
      foot = '<div class="ps-foot"><button type="button" class="btn" data-stab="mine" data-closeafter>Mes réservations</button><button type="button" class="btn btn-blue" data-close>Fermer</button></div>';
    } else {
      var minePanel = mine.length ? '<section class="ps-mine"><h3>Mes réservations pour ce produit</h3>' + mine.map(function (r) {
        if (PS.cancel === r.id) return '<div class="ps-cancel" role="alert"><p><b>Annuler cette réservation ?</b> ' + r.qty + ' pièce' + (r.qty > 1 ? 's' : '') + ' (' + resLine(r) + ') seront retirées du compteur.</p><div class="card-actions"><button type="button" class="btn btn-sm" data-cancelno>Garder</button><button type="button" class="btn btn-sm btn-danger" data-cancelyes="' + esc(r.id) + '"' + (PS.busy ? ' disabled' : '') + '>Oui, annuler</button></div></div>';
        return '<div class="ps-mine-row"><div><b>' + resLine(r) + '</b><span>' + euro(r.total) + ' · ' + payPill(p, r) + '</span></div>' + resActions(p, r, true) + '</div>';
      }).join('') + '</section>' : '';
      var action = '';
      var payDue = mine.filter(function (r) { return !r.paid; }).reduce(function (n, r) { return n + (r.total || 0); }, 0);
      if (open && (PS.rid || maxFor(p) > 0)) {
        action = (PS.rid ? '<h3 class="ps-step" tabindex="-1">Modifier ma réservation</h3>' : '') + psForm(p);
        foot = '<div class="ps-foot">' + (PS.rid ? '<button type="button" class="btn" data-editcancel>Annuler</button>' : '') + '<button type="button" class="btn btn-ball btn-block" data-reserve>' + ic('bag') + (PS.rid ? 'Enregistrer · ' : 'Je réserve · ') + euro(unitPrice(p) * PS.qty) + '</button></div>';
      } else if (open) {
        action = '<p class="ps-note">' + ic('check') + 'Vous avez réservé le maximum autorisé (' + p.maxPerMember + ' pièces). Modifiez une réservation pour changer de taille.</p>';
      } else if (p.status === 'ouverte') {
        action = '<p class="ps-note is-lock">' + ic('lock') + 'Réservations closes depuis le ' + esc(fmt.short(dEnd(p))) + '. Le bureau prépare la commande. Pour toute modification, contactez le bureau : <a href="mailto:' + esc(CLUB.email) + '">' + esc(CLUB.email) + '</a>.</p>';
      } else if (p.status === 'commandee') {
        action = '<p class="ps-note">' + phaseText(p) + '</p>' + (mine.length && p.payUrl && payDue ? '<a class="btn btn-blue btn-block" href="' + esc(p.payUrl) + '" target="_blank" rel="noopener">' + ic('euro') + 'Régler ma commande · ' + euro(payDue) + '</a><p class="hint" style="text-align:center">Paiement sécurisé chez notre prestataire. Vous pouvez aussi régler au club.</p>' : '');
      } else if (p.status === 'disponible') {
        action = '<p class="ps-note">' + phaseText(p) + (mine.length ? '. Pensez à votre carte de membre.' : '') + '</p>';
      } else {
        var w = !!SHOP.waiting[p.id];
        action = '<div class="wait-box"><p>' + (p.status === 'annulee' ? 'Cette commande n\'a pas atteint son minimum.' : 'Cette commande est terminée.') + ' <b>Envie de ce produit ?</b> On vous prévient à la prochaine commande groupée.</p>' +
          (w ? '<p class="wait-on">' + ic('check') + 'C\'est noté : vous serez prévenu(e) à la prochaine commande.</p><button type="button" class="btn btn-sm btn-quiet" data-wait data-off>Ne plus être prévenu(e)</button>'
            : '<button type="button" class="btn btn-ball btn-block" data-wait>' + ic('megaphone') + 'Prévenez-moi à la prochaine commande</button>') + '</div>';
      }
      var desc = String(p.desc || '').split('\n').filter(Boolean).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
      body = gallery(p) + '<div class="ps-head">' + statusChip(p) + '<h2 class="ps-name">' + esc(p.name) + '</h2><p class="sc-price"><b>' + euro(p.priceMember) + '</b>' + (p.pricePublic ? ' <s>' + euro(p.pricePublic) + '</s>' : '') + ' <small>prix membre</small></p></div>' +
        partnerLink(p) + board(p, pr, true) + (open ? '<div class="rule">' + ic('shield') + '<p><b>Règle d\'or :</b> personne ne paie tant que le minimum n\'est pas atteint.</p></div>' : '') +
        minePanel + (desc ? '<details class="ps-desc"' + (open && !mine.length ? '' : ' open') + '><summary>Description, matière, entretien' + ic('chevron-down') + '</summary>' + desc + '</details>' : '') + action;
    }
    var keep = $('#drawer').hidden ? null : $('.drawer-body').scrollTop;
    openDrawer(PS.rid && PS.step !== 'done' ? 'Modifier ma réservation' : 'Boutique du club', body, function () {
      var h = $('.ps-step'); if (h && PS.step !== 'form') h.focus(); else if (keep == null) $('#drawer .icon-btn').focus();
      var g = $('#ps-gal');
      if (g) g.addEventListener('scroll', function () { var i = Math.round(g.scrollLeft / Math.max(1, g.clientWidth)); $$('[data-gal]').forEach(function (b, k) { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); }, { passive: true });
      if (PS.step === 'form' && keep != null && !PS.resetScroll) $('.drawer-body').scrollTop = keep;
      PS.resetScroll = false;
      var cc = $('.ps-cancel'); if (cc) { cc.scrollIntoView({ block: 'center' }); var nb = $('[data-cancelno]', cc); if (nb) nb.focus(); }
    }, foot);
  }
  function openProduct(pid, edit) {
    var p = product(pid); if (!p) return;
    var r = edit ? mineOf(pid).filter(function (x) { return x.id === edit; })[0] : null;
    var sizes = p.sizes || [], colors = p.colors || [];
    PS = { pid: pid, rid: r ? r.id : null, step: 'form', qty: r ? r.qty : 1, size: r ? r.size : (sizes.length === 1 ? sizes[0] : ''), color: r ? r.color : (colors.length === 1 ? colors[0] : ''),
      mark: !!(r && r.marking), marking: r ? (r.marking || '') : '', err: '', busy: false, cancel: null, resetScroll: true };
    if (!r && maxFor(p) < 1) PS.qty = 1;
    renderProduct();
    if (!edit) track('boutique_vue_produit', { produit: p.name });
  }
  function psValidate(p) {
    if ((p.sizes || []).length > 1 && !PS.size) return 'Choisissez une taille.';
    if ((p.colors || []).length > 1 && !PS.color) return 'Choisissez une couleur.';
    if (PS.mark && !PS.marking.trim()) return 'Indiquez le texte du marquage, ou décochez l\'option.';
    if (PS.qty > maxFor(p)) return 'Maximum ' + p.maxPerMember + ' pièces par membre pour ce produit.';
    return '';
  }
  function psSubmit() {
    var p = product(PS.pid), api = shopApi(); if (!p || !api || PS.busy) return;
    PS.busy = true; renderProduct();
    var before = progress(p).reached;
    var choice = { size: PS.size, color: PS.color, qty: PS.qty, marking: PS.mark ? PS.marking.trim().toUpperCase() : '' };
    var who = { uid: 'me', name: S.me.prenom + ' ' + S.me.nom };
    (PS.rid ? api.update(p, PS.rid, choice, who) : api.reserve(p, choice, who)).then(function () {
      track(PS.rid ? 'boutique_modif_reservation' : 'boutique_reservation', { produit: p.name, quantite: PS.qty });
      return loadShop();
    }).then(function () {
      PS.busy = false; PS.err = ''; PS.step = 'done'; PS.marking = choice.marking; PS.justReached = !before && progress(product(PS.pid)).reached;
      renderProduct(); rerender(); toast(PS.rid ? 'Réservation modifiée' : 'Réservation enregistrée : rien à payer pour l\'instant');
    }).catch(function (e) { PS.busy = false; PS.err = e.message || String(e); PS.step = PS.step === 'confirm' ? 'confirm' : 'form'; renderProduct(); });
  }
  function shopCancel(pid, rid, fromList) {
    var p = product(pid), api = shopApi(); if (!p || !api) return;
    if (PS) PS.busy = true;
    api.cancel(p, rid, { uid: 'me' }).then(function () { track('boutique_annulation', { produit: p.name }); return loadShop(); }).then(function () {
      toast('Réservation annulée'); if (PS) { PS.busy = false; PS.cancel = null; }
      if (!fromList && !$('#drawer').hidden && PS) { PS.step = 'form'; PS.rid = null; PS.qty = 1; renderProduct(); }
      rerender();
    }).catch(function (e) { if (PS) PS.busy = false; toast(e.message || String(e)); if (PS && !$('#drawer').hidden) renderProduct(); });
  }
  function loadShop(force) {
    var st = window.USM && window.USM.store;
    if (!st || !st.shop) { SHOP.ready = true; return Promise.resolve(); }
    return (force ? st.reload() : st.load()).then(function (c) {
      SHOP.products = ((c && c.shopProducts) || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (c && c.sponsors) SPONSORS = withDemo(c.sponsors);
      return st.shop.state(SHOP.products, 'me');
    }).then(function (s) {
      SHOP.counters = s.counters || {}; SHOP.mine = s.mine || {}; SHOP.waiting = s.waiting || {}; SHOP.notes = s.notes || []; SHOP.ready = true; SHOP.error = '';
    }).catch(function (e) { SHOP.ready = true; SHOP.error = (e && e.message) || 'erreur de chargement'; });
  }
  function shopMsgs() { return (SHOP.notes || []).map(function (n) { return { id: 'bn-' + n.id, type: n.type || 'warning', titre: n.title, texte: n.text, createdAt: n.at, shop: true }; }); }
  function allMsgs() { return S.msgs.concat(shopMsgs()); }
  function currentView() { var v = (location.hash || '#accueil').slice(1); return VIEWS.indexOf(v) < 0 || viewOff(v) ? 'accueil' : v; }
  function rerender() { if ($('#app').hidden) return; RENDER[currentView()](); updateBadges(); }
  function shopReminder() {
    if (!SHOP_ON) return '';
    var mine = allMine().filter(function (x) { return x.r.status !== 'annulee' && x.p.status !== 'annulee' && !x.r.pickedUp; });
    if (!mine.length) return '';
    var due = mine.filter(function (x) { return !x.r.paid && x.r.status !== 'reservee'; }).length, ready = mine.filter(function (x) { return x.r.status === 'disponible'; }).length;
    return '<section class="panel-m shop-remind" style="margin-top:16px"><div><h2 class="v-sub" style="margin:0 0 4px">' + ic('bag') + 'Mes commandes boutique</h2><p class="muted">' + mine.length + ' réservation' + (mine.length > 1 ? 's' : '') + ' en cours' +
      (ready ? ' · <b>' + ready + ' à retirer au club</b>' : '') + (due ? ' · ' + due + ' à régler' : '') + '</p></div><button type="button" class="btn btn-sm" data-shopmine>Voir mes réservations' + ic('arrow') + '</button></section>';
  }

  /* ---------- Onglet « Plus » (mobile) ---------- */
  function openMore() { var m = $('#more'); m.hidden = false; $('[data-more]').setAttribute('aria-expanded', 'true'); updateBadges(); var f = $('.more-panel a, .more-panel button', m); if (f) f.focus(); }
  function closeMore(noFocus) { var m = $('#more'); if (!m || m.hidden) return; m.hidden = true; var b = $('[data-more]'); b.setAttribute('aria-expanded', 'false'); if (!noFocus) b.focus(); }

  /* ---------- Tiroir générique ---------- */
  var lastFocus;
  function openDrawer(title, body, onMount, foot) {
    if ($('#drawer').hidden) lastFocus = document.activeElement;
    $('#drawer-title').textContent = title; $('#drawer-body').innerHTML = body;
    var f = $('#drawer-foot'); f.innerHTML = foot || ''; f.hidden = !foot;
    $('#drawer').hidden = false; document.body.style.overflow = 'hidden';
    if (onMount) onMount(); else $('#drawer .icon-btn').focus();
  }
  function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; PS = null; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }

  /* ---------- Classement : mis à jour par le membre (rien à faire côté club) ---------- */
  var RANK_DAY = 5; // le classement mensuel sort en début de mois : on relance à partir du 5
  function rankRef() { var d = new Date(); return new Date(d.getFullYear(), d.getDate() < RANK_DAY ? d.getMonth() - 1 : d.getMonth(), RANK_DAY).getTime(); }
  function rankDue() { return !S.me.classementAt || S.me.classementAt < rankRef(); }
  function setRank(v) {
    var me = S.me, delta = rankIdx(v) - rankIdx(me.classement), from = me.classement;
    if (LIVE) liveRank(from, v);
    me.classement = v; me.classementAt = Date.now(); me.classementHistory = me.classementHistory || {}; me.classementHistory[SEASON] = v; save();
    return delta;
  }
  function openRank() {
    var cur = S.me.classement;
    openDrawer('Mon classement',
      '<p class="muted">Votre classement FFT change chaque mois. Regardez le vôtre sur Ten\'Up, puis reportez-le ici : il apparaît sur votre carte, dans l\'annuaire et pour les annonces à votre niveau.</p>' +
      '<form class="form" id="rk-form"><div class="field"><label for="rk-v">Mon classement actuel</label><select id="rk-v" name="v">' +
        LADDER.map(function (l) { return '<option' + (l === cur ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn btn-ball btn-block" type="submit">' + ic('check') + 'Enregistrer</button>' +
      '<a class="btn btn-block" href="https://tenup.fft.fr/" target="_blank" rel="noopener">' + ic('external') + 'Ouvrir Ten\'Up</a></form>',
      function () {
        $('#rk-v').focus();
        $('#rk-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = $('#rk-v').value, delta = setRank(v);
          closeDrawer();
          toast(delta > 0 ? 'Bravo ! Vous passez ' + v : delta < 0 ? 'Classement mis à jour : ' + v : 'Classement confirmé : ' + v);
          route();
        });
      });
  }
  function openHelp() {
    var h = function (i, t, p) { return '<div>' + ic(i) + '<div><b>' + t + '</b><p>' + p + '</p></div></div>'; };
    openDrawer('Mode d\'emploi', '<div class="help-list">' +
      h('home', 'Accueil', 'Ce qui vous attend : convocations à confirmer, messages importants, prochain match.') +
      h('qr', 'Ma carte', 'Votre carte de membre avec QR code et vos avantages chez nos partenaires.') +
      h('users', 'Jouer', 'Publiez une annonce (« cherche un double samedi ») ou parcourez l\'annuaire des joueurs visibles.') +
      (TEAMS_ON ? h('trophy', 'Équipes', 'Répondez aux convocations, donnez vos disponibilités, discutez avec l\'équipe, inscrivez-vous aux championnats.') : '') +
      h('calendar', 'Agenda', 'Événements du club, inscription en un geste, ajout à votre agenda.') +
      (SHOP_ON ? h('bag', 'Boutique', 'Commandes groupées aux couleurs du club : choisissez votre taille, suivez le compteur, et ne payez qu\'une fois le minimum atteint.') : '') +
      h('user', 'Profil', 'Coordonnées, classement et progression, créneaux et notifications.') +
      '</div><p class="muted" style="font-size:.9rem">Sur téléphone, Agenda' + (SHOP_ON ? ', Boutique' : '') + ' et Profil sont dans l\'onglet « Plus », en bas à droite.</p><p class="login-note" style="margin-top:8px">Une question ? Le club : <a href="tel:' + CLUB.phone.replace(/\s/g, '') + '">' + esc(CLUB.phone) + '</a></p>');
  }

  /* ---------- Actions déléguées ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) return;
    var d = t.dataset;
    /* Onglet « Plus » */
    if (t.hasAttribute('data-more')) { if ($('#more').hidden) openMore(); else closeMore(); return; }
    if (t.closest('#more') && !t.hasAttribute('data-help') && !t.hasAttribute('data-theme-toggle')) closeMore(true);
    if (t.closest('#more') && t.hasAttribute('data-help')) closeMore(true);
    /* Boutique */
    if (d.product) { e.preventDefault(); openProduct(d.product); return; }
    if (d.stab) { shopTab = d.stab; if (t.hasAttribute('data-closeafter')) closeDrawer(); if (currentView() !== 'boutique') location.hash = '#boutique'; else { RENDER.boutique(); window.scrollTo(0, 0); } return; }
    if (d.shopf) { shopFilter = d.shopf; RENDER.boutique(); return; }
    if (t.hasAttribute('data-shopmine')) { shopTab = 'mine'; location.hash = '#boutique'; return; }
    if (d.gal) { var gl = $('#ps-gal'); if (gl) gl.scrollTo({ left: +d.gal * gl.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
    if (d.qty && PS) { PS.qty = Math.max(1, Math.min(maxFor(product(PS.pid)), PS.qty + (+d.qty))); PS.err = ''; psRefresh(); return; }
    if (t.hasAttribute('data-reserve') && PS) {
      PS.err = psValidate(product(PS.pid));
      if (PS.err) { psRefresh(); var fe = $('#ps-err'); if (fe) fe.scrollIntoView({ block: 'center' }); return; }
      PS.step = 'confirm'; PS.resetScroll = true; renderProduct(); return;
    }
    if (t.hasAttribute('data-psback') && PS) { PS.step = 'form'; PS.err = ''; PS.resetScroll = true; renderProduct(); return; }
    if (t.hasAttribute('data-confirm')) { psSubmit(); return; }
    if (t.hasAttribute('data-editcancel') && PS) { openProduct(PS.pid); return; }
    if (d.editres) { openProduct(d.pid, d.editres); return; }
    if (d.cancelres) { if ($('#drawer').hidden || !PS || PS.pid !== d.pid) openProduct(d.pid); PS.cancel = d.cancelres; renderProduct(); return; }
    if (t.hasAttribute('data-cancelno') && PS) { PS.cancel = null; renderProduct(); return; }
    if (d.cancelyes && PS) { shopCancel(PS.pid, d.cancelyes); return; }
    if (t.hasAttribute('data-wait') && PS) {
      var pw = product(PS.pid), on = !t.hasAttribute('data-off');
      shopApi().wait(pw, on, { uid: 'me' }).then(function () { if (on) track('boutique_liste_attente', { produit: pw.name }); return loadShop(); })
        .then(function () { if (PS) renderProduct(); rerender(); toast(on ? 'C\'est noté : vous serez prévenu(e) à la prochaine commande' : 'Vous ne serez plus prévenu(e)'); })
        .catch(function (x) { toast(x.message || String(x)); });
      return;
    }
    if (d.sharech) { track('boutique_partage', { canal: d.sharech, produit: (product(PS && PS.pid) || {}).name || '' }); if (!d.copy) return; }
    if (d.convoc) {
      S.team.convocations[d.convoc].me = d.v; (S.team.dispos[d.convoc] = S.team.dispos[d.convoc] || {}).me = d.v; save();
      toast(d.v === 'y' ? 'Présence confirmée, le capitaine est prévenu' : 'Absence signalée au capitaine'); route(); return;
    }
    if (d.read) { S.readMsgs[d.read] = 1; save(); route(); return; }
    if (t.hasAttribute('data-qr')) { openQR(); return; }
    if (d.perk) { e.preventDefault(); openPerk(+d.perk); return; }
    if (t.hasAttribute('data-qr-from-perk')) { closeDrawer(); openQR(); return; }
    if (t.hasAttribute('data-goto-perks')) { e.preventDefault(); location.hash = '#carte'; if (location.hash === '#carte') go('carte'); setTimeout(function () { var el = $('#avantages'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 180); return; }
    if (t.closest('[data-wa-example]')) { e.preventDefault(); toast('Aperçu : ajoutez le lien d\'invitation dans Admin › Paramètres › Liens'); return; }
    if (t.hasAttribute('data-rank')) { openRank(); return; }
    if (t.hasAttribute('data-rank-same')) { setRank(S.me.classement); toast('Merci, classement confirmé'); route(); return; }
    if (t.hasAttribute('data-print')) { window.print(); return; }
    if (t.hasAttribute('data-chat')) { openChat(); return; }
    if (t.hasAttribute('data-help')) { openHelp(); return; }
    if (t.hasAttribute('data-close')) { closeDrawer(); return; }
    if (d.ptab) { playTab = d.ptab; RENDER.jouer(); updateBadges(); return; }
    if (t.hasAttribute('data-newpost')) { openPostForm(); return; }
    if (d.go) { var p = S.posts.filter(function (x) { return x.id === d.go; })[0], i = p.going.indexOf('me'); if (i >= 0) p.going.splice(i, 1); else { p.going.push('me'); toast('Partant ! Son auteur est prévenu'); } save(); RENDER.jouer(); return; }
    if (d.delpost) { S.posts = S.posts.filter(function (x) { return x.id !== d.delpost; }); save(); RENDER.jouer(); toast('Annonce retirée'); return; }
    if (d.f) {
      if (d.f === 'near') F.near = !F.near; else if (d.f === 'slot') F.slots[d.v] = !F.slots[d.v]; else F.styles[d.v] = !F.styles[d.v];
      RENDER.jouer(); return;
    }
    if (d.contact) { toast('Démo : ouvrirait ' + ({ sms: 'un SMS', tel: 'un appel', mail: 'un email' })[d.contact] + ' vers ' + d.name); return; }
    if (d.dispo) {
      var cur = (S.team.dispos[d.dispo] = S.team.dispos[d.dispo] || {}), nx = cur.me === 'y' ? 'n' : cur.me === 'n' ? '' : 'y';
      cur.me = nx; save(); RENDER.equipes(); var b = $('[data-dispo="' + d.dispo + '"]'); if (b) b.focus(); return;
    }
    if (d.champ) { S.champs.forEach(function (c) { if (c.id === d.champ) c.inscrit = true; }); save(); RENDER.equipes(); toast('Demande envoyée au capitaine'); return; }
    if (d.evin) {
      if (LIVE) { liveEventToggle(d.evin); return; }
      S.eventsIn[d.evin] = !S.eventsIn[d.evin]; save(); route();
      toast(S.eventsIn[d.evin] ? 'Inscription enregistrée' : 'Inscription annulée'); return;
    }
    if (d.ag) { agFilter = d.ag; RENDER.agenda(); return; }
    if (d.share) { S.me.partenaire[d.share] = !S.me.partenaire[d.share]; save(); t.setAttribute('aria-pressed', S.me.partenaire[d.share]); return; }
    if (d.pstyle) { var st = S.me.partenaire.style, k = st.indexOf(d.pstyle); if (k >= 0) st.splice(k, 1); else st.push(d.pstyle); save(); t.setAttribute('aria-pressed', k < 0); return; }
    if (d.cell) {
      var pr = d.cell.split('|'), ds = S.me.partenaire.dispos; ds[pr[0]] = ds[pr[0]] || {}; ds[pr[0]][pr[1]] = !ds[pr[0]][pr[1]]; save();
      t.setAttribute('aria-pressed', !!ds[pr[0]][pr[1]]); t.style.background = ds[pr[0]][pr[1]] ? 'var(--grass)' : 'var(--bg-2)'; return;
    }
    if (d.copy) { try { navigator.clipboard.writeText(d.copy); toast('Copié'); } catch (x) { toast('Copie impossible sur ce navigateur'); } return; }
    if (t.hasAttribute('data-install')) { toast('Sur iPhone : Partager › Sur l\'écran d\'accueil. Sur Android : menu › Installer l\'application.'); return; }
    if (t.hasAttribute('data-pw')) {
      if (LIVE) { sdk().then(function (fb) { var em = fb.auth().currentUser && fb.auth().currentUser.email; return liveResetMail(em).then(function () { toast('Un lien pour changer votre mot de passe a été envoyé à ' + em, 6000); }); }).catch(function (x) { toast('Envoi impossible : ' + authMsg(x), 6000); }); return; }
      toast('Un lien pour changer votre mot de passe a été envoyé à ' + S.me.email); return;
    }
    if (t.hasAttribute('data-logout')) { if (LIVE) { liveLogout(); return; } try { localStorage.removeItem(SESSION); } catch (x) {} showLogin(); return; }
    if (t.hasAttribute('data-reset')) {
      try { localStorage.removeItem(KEY); } catch (x) {}
      var sa = shopApi(); if (sa) sa.resetDemo();
      load(); if (location.hash !== '#accueil') location.hash = '#accueil'; else go('accueil');
      loadShop().then(rerender); toast('Démo réinitialisée'); return;
    }
    if (t.hasAttribute('data-theme-toggle')) {
      var root = document.documentElement, dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      root.setAttribute('data-theme', dark ? 'light' : 'dark'); try { localStorage.setItem('usm_theme', dark ? 'light' : 'dark'); } catch (x) {} return;
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-visible]')) { S.me.partenaire.actif = t.checked; save(); RENDER.jouer(); toast(t.checked ? 'Vous apparaissez dans l\'annuaire' : 'Vous êtes retiré de l\'annuaire'); }
    if (t.matches('[data-notif]')) { S.me.notifs[t.dataset.notif] = t.checked; save(); toast('Préférence enregistrée'); }
    if (t.name === 'ps-size' && PS) { PS.size = t.value; PS.err = ''; psRefresh(); }
    if (t.name === 'ps-color' && PS) {
      PS.color = t.value; PS.err = ''; psRefresh();
      var g = $('#ps-gal'), pc = product(PS.pid);
      if (g && pc) (pc.images || []).some(function (im, i) { if (String(im.alt || '').toLowerCase().indexOf(t.value.toLowerCase()) >= 0) { g.scrollTo({ left: i * g.clientWidth }); return true; } return false; });
    }
    if (t.id === 'ps-markon' && PS) { PS.mark = t.checked; PS.err = ''; psRefresh(); if (t.checked) { var mk = $('#ps-marking'); if (mk) mk.focus(); } }
    if (t.matches('[data-photo]') && t.files[0]) {
      var r = new FileReader(); r.onload = function () {
        var img = new Image(); img.onload = function () {
          var c = document.createElement('canvas'), s = 240, m = Math.min(img.width, img.height); c.width = c.height = s;
          c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
          if (LIVE) {
            toast('Envoi de la photo…');
            livePhoto(c).then(function (url) { S.me.photoURL = url; save(); RENDER.profil(); refreshTop(); toast('Photo mise à jour'); })
              .catch(function (x) { toast('Photo non enregistrée : ' + liveErr(x), 6000); });
            return;
          }
          S.me.photoURL = c.toDataURL('image/jpeg', 0.82); save(); RENDER.profil(); refreshTop(); toast('Photo mise à jour');
        }; img.src = r.result;
      }; r.readAsDataURL(t.files[0]);
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'ps-marking' && PS) { PS.marking = t.value.slice(0, 12).toUpperCase(); PS.err = ''; psRefresh(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('#more').hidden) { closeMore(); return; } if (!$('#drawer').hidden) closeDrawer(); if (!$('#qr-screen').hidden) $('#qr-screen').hidden = true; }
  });

  /* ---------- Connexion ---------- */
  function refreshTop() { $('#top-avatar').innerHTML = avatar(S.me) + '<span class="nm">' + esc(S.me.prenom) + '</span>'; }
  function showApp() {
    $('#login-view').hidden = true; $('#app').hidden = false; refreshTop(); route();
  }
  function showLogin() { $('#app').hidden = true; $('#login-view').hidden = false; location.hash = ''; }

  function init() {
    load();
    initFramedPreview();
    Promise.all([loadSponsors(), LIVE ? null : loadShop(), settingsReady]).then(function () { if (!$('#app').hidden) route(); });
    $('#more').addEventListener('click', function (e) { if (e.target.id === 'more') closeMore(); });
    /* Aperçu : une modification faite dans l'admin (autre onglet) apparaît ici aussitôt */
    window.addEventListener('storage', function (e) { if (e.key === 'usm_boutique_v1' || e.key === 'usm_v2_content_ping') loadShop(e.key === 'usm_v2_content_ping').then(rerender); });
    $('#qr-close').addEventListener('click', function () { $('#qr-screen').hidden = true; });
    $('#drawer').addEventListener('click', function (e) { if (e.target.id === 'drawer') closeDrawer(); });
    $('#pw-eye').addEventListener('click', function () { var i = $('#lg-pw'); i.type = i.type === 'password' ? 'text' : 'password'; this.setAttribute('aria-pressed', i.type === 'text'); });
    if (LIVE) { initLiveLogin(); return; }
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault(); var em = $('#lg-email').value.trim(), pw = $('#lg-pw').value, err = $('#lg-err');
      if (!/^\S+@\S+\.\S+$/.test(em)) { err.textContent = 'Saisissez l\'adresse email donnée au club à l\'inscription.'; err.hidden = false; $('#lg-email').focus(); return; }
      if (pw.length < 4) { err.textContent = 'Mot de passe trop court. Utilisez « Mot de passe oublié » pour en recevoir un nouveau.'; err.hidden = false; $('#lg-pw').focus(); return; }
      err.hidden = true; try { localStorage.setItem(SESSION, '1'); } catch (x) {} showApp();
    });
    $('#demo-btn').addEventListener('click', function () { try { localStorage.setItem(SESSION, '1'); } catch (x) {} showApp(); });
    $('#forgot').addEventListener('click', function (e) {
      e.preventDefault(); var em = $('#lg-email').value.trim(), err = $('#lg-err');
      if (!/^\S+@\S+\.\S+$/.test(em)) { err.textContent = 'Saisissez d\'abord votre email, on vous envoie un lien.'; err.hidden = false; $('#lg-email').focus(); return; }
      err.hidden = true; toast('Lien de réinitialisation envoyé à ' + em);
    });
    window.addEventListener('hashchange', function () { if (!$('#app').hidden) route(); });
    var logged = false; try { logged = localStorage.getItem(SESSION) === '1'; } catch (x) {}
    if (logged) showApp();
  }
  function initLiveLogin() {
    var err = $('#lg-err'), btn = $('#login-form [type="submit"]'), label = btn.innerHTML;
    var showErr = function (m) { err.textContent = m; err.hidden = false; };
    var demo = $('#demo-btn'); if (demo) demo.hidden = true;
    window.addEventListener('hashchange', function () { if (!$('#app').hidden) route(); });
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault(); var em = $('#lg-email').value.trim(), pw = $('#lg-pw').value;
      if (!/^\S+@\S+\.\S+$/.test(em)) { showErr('Saisissez l\'adresse email donnée au club à l\'inscription.'); $('#lg-email').focus(); return; }
      if (!pw) { showErr('Saisissez votre mot de passe.'); $('#lg-pw').focus(); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = 'Connexion…';
      sdk().then(function (fb) { return fb.auth().signInWithEmailAndPassword(em, pw); })
        .then(function (cred) { return liveEnter(cred.user); })
        .catch(function (x) { showErr(x && x.code ? authMsg(x) : (x && x.message) || String(x)); })
        .then(function () { btn.disabled = false; btn.innerHTML = label; });
    });
    $('#forgot').addEventListener('click', function (e) {
      e.preventDefault(); var em = $('#lg-email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(em)) { showErr('Saisissez d\'abord votre email, on vous envoie un lien.'); $('#lg-email').focus(); return; }
      err.hidden = true;
      // Même message que le compte existe ou non (on ne révèle pas qui est inscrit)
      liveResetMail(em).catch(function (x) { if (/network/.test((x && x.code) || '')) throw x; })
        .then(function () { toast('Si un compte existe pour ' + em + ', un lien de réinitialisation vient d\'être envoyé.', 6000); })
        .catch(function (x) { showErr(authMsg(x)); });
    });
    // Session conservée : retour direct dans l'espace
    sdk().then(function (fb) {
      fb.auth().onAuthStateChanged(function (u) { if (u && !UID) liveEnter(u).catch(function (x) { showErr(x.message || String(x)); }); });
    }).catch(function (x) { showErr('Service indisponible : ' + ((x && x.message) || x)); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


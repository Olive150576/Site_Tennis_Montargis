/* =====================================================================
   USM Tennis Montargis — mesure d'audience (Microsoft Clarity)
   ---------------------------------------------------------------------
   • Mêmes noms d'événements que le site actuel pour comparer avant/après :
     appel_telephone, email_club, reserver_tenup, contact_offer,
     modal_gallery, lightbox_open, contact_form_submit, menu_mobile_ouvert,
     modal_all_rates, archives_actus, modal_gallery_key.
   • Nouveaux : barre_mobile, clic_sponsor_<nom>, partenariat_form_submit,
     quiz_formule.
   • Cookies : sans choix ou « Refuser » → mesure sans cookie, page par page
     (fonctionnement prévu par Microsoft en Europe, comme le site actuel) ;
     « Accepter » → cookie Clarity : pages d'une visite reliées et visiteurs
     qui reviennent reconnus. Aucune visite n'est perdue. Choix gardé 6 mois.
   ===================================================================== */
(function () {
  'use strict';
  var USM = (window.USM = window.USM || {});
  var cfg = (window.USM_CONFIG || {}).clarity || {};
  var html = document.documentElement;
  var base = html.getAttribute('data-base') || '';
  var KEY = 'usm_consent', MAX_AGE = 182 * 864e5;

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* navigation privée : on continue sans mémoriser */ }
    return null;
  }
  function choice() {
    try { var c = JSON.parse(ls(KEY) || 'null'); if (c && Date.now() - c.t < MAX_AGE) return c.a; } catch (e) { /* ignore */ }
    return null;
  }

  var isAdmin = html.hasAttribute('data-admin');
  var isProd = (cfg.hosts || []).indexOf(location.hostname) !== -1;
  var optedOut = ls('usm_no_clarity') === '1'; // appareil utilisé pour l'admin (même clé que le site actuel)
  var allowed = !!cfg.id && isProd && !isAdmin && !optedOut;
  var loaded = false;

  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  function load() {
    if (loaded || !allowed) return;
    loaded = true;
    var t = document.createElement('script'); t.async = true; t.src = 'https://www.clarity.ms/tag/' + cfg.id;
    var y = document.getElementsByTagName('script')[0]; y.parentNode.insertBefore(t, y);
  }
  function signal(a) {
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: a === 'granted' ? 'granted' : 'denied' });
  }

  var current = choice();
  if (current === 'granted') { load(); signal('granted'); }
  else if (!cfg.waitForConsent) { load(); if (current === 'denied') signal('denied'); }

  /* ---------- Événements ---------- */
  function track(name, tags) {
    window.clarity('event', name);
    if (tags) Object.keys(tags).forEach(function (k) { if (tags[k] != null && tags[k] !== '') window.clarity('set', k, String(tags[k])); });
    (window.USM_TRACKED = window.USM_TRACKED || []).push(tags ? [name, tags] : [name]); // contrôle en aperçu
  }
  USM.track = track;
  var slug = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30); };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (el.dataset.bar) track('barre_mobile', { bouton: el.dataset.bar });
    if (href.indexOf('tel:') === 0) track('appel_telephone');
    else if (href.indexOf('mailto:') === 0 && el.getAttribute('data-href') === 'email') track('email_club');
    else if (href.indexOf('tenup.fft.fr') !== -1) track('reserver_tenup');
    if (el.hasAttribute('data-sponsor')) track('clic_sponsor_' + slug(el.dataset.sponsor), { sponsor: el.dataset.sponsor });
    if (el.hasAttribute('data-formule')) track('contact_offer', { offer_title: el.dataset.formule });
    if (el.classList.contains('lb-trigger')) { track('modal_gallery', { gallery_section: el.dataset.group || '' }); track('lightbox_open'); }
    if (el.classList.contains('menu-toggle')) track('menu_mobile_ouvert');
  }, true);

  // Pages qui remplacent les fenêtres de l'ancien site
  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'index';
  if (page === 'tarifs') track('modal_all_rates');
  else if (page === 'actualites') track('archives_actus');
  else if (page === 'actualite') track('modal_gallery_key', { gallery_section: 'news' });

  /* ---------- Bandeau de consentement ---------- */
  var banner = null;
  function closeBanner() { if (banner) { banner.remove(); banner = null; } document.body.classList.remove('has-consent'); }
  function decide(a) {
    ls(KEY, JSON.stringify({ a: a, t: Date.now() }));
    if (a === 'granted') { load(); signal('granted'); }
    else if (loaded) signal('denied'); // supprime le cookie, la mesure continue sans cookie
    closeBanner();
  }
  function showBanner() {
    if (banner || !cfg.id || cfg.banner === false || isAdmin || optedOut) return;
    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookies');
    banner.innerHTML = '<p><b>Cookies de mesure d’audience</b> Ils nous aident à voir comment le site est utilisé pour l’améliorer. Aucune publicité. <a href="' + base + 'confidentialite.html#audience">En savoir plus</a></p>' +
      '<div class="consent-btns"><button type="button" data-consent="denied">Refuser</button><button type="button" data-consent="granted">Accepter</button></div>';
    banner.addEventListener('click', function (e) { var b = e.target.closest('[data-consent]'); if (b) decide(b.getAttribute('data-consent')); });
    document.body.appendChild(banner);
    document.body.classList.add('has-consent');
  }

  function ready() {
    // Le contenu des formulaires n'est jamais enregistré
    Array.prototype.forEach.call(document.querySelectorAll('form'), function (f) { f.setAttribute('data-clarity-mask', 'true'); });
    if (!current) showBanner();
    document.addEventListener('click', function (e) { if (e.target.closest('[data-consent-open]')) { e.preventDefault(); showBanner(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();

/* =====================================================================
   Configuration du site USM Tennis Montargis
   ---------------------------------------------------------------------
   mode : 'local'    → aperçu : le contenu vient de data-seed.js et les
                        modifications de l'admin sont gardées dans ce
                        navigateur (aucun impact sur le site en ligne).
          'firebase' → production : lecture / écriture dans la base
                        Firebase ci-dessous (voir README, étape « Mise en ligne »).
   ===================================================================== */
window.USM_CONFIG = {
  mode: 'firebase',

  // Projet Firebase existant du club (clés publiques, identiques au site actuel)
  firebase: {
    apiKey: 'AIzaSyA4GdfEh3M6mEszwRFif049qsmoLq4tn7c',
    authDomain: 'usm-tennis.firebaseapp.com',
    databaseURL: 'https://usm-tennis-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'usm-tennis',
    storageBucket: 'usm-tennis.firebasestorage.app',
    messagingSenderId: '631286589550',
    appId: '1:631286589550:web:7e68afcddfbb8e16d79e7f'
  },

  // Nœud de la base réservé au nouveau site : l'ancien site continue de
  // lire ses propres nœuds (news, rates…) tant que la bascule n'est pas faite.
  dbRoot: 'site_v2',

  siteUrl: 'https://tennismontargis.fr',

  // Mesure d'audience Microsoft Clarity : même projet que le site actuel,
  // pour comparer avant / après. Chargée uniquement sur les adresses de
  // production ci-dessous : jamais dans l'aperçu, l'admin ou l'espace membre.
  clarity: {
    id: 'vfrevzz9j6',
    hosts: ['tennismontargis.fr', 'www.tennismontargis.fr', 'usm-tennis.web.app', 'usm-tennis.firebaseapp.com'],
    banner: true,          // bandeau « Cookies » Accepter / Refuser (false = pas de bandeau : tout le monde mesuré sans cookie)
    waitForConsent: false  // false : sans choix ou refus = mesure sans cookie (comme le site actuel) ; true : rien avant « Accepter »
  },

  // Tests automatiques uniquement : brancher le mode 'firebase' sur les émulateurs locaux.
  // Laisser à null en ligne.
  emulators: null,

  // Mot de passe de l'admin en mode aperçu uniquement (modifiable dans Paramètres)
  localAdminPassword: 'usm2026'
};

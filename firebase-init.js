// Firebase initialization — partagé entre index.html, admin-panel.html, espace-membre.html
// Ce fichier est chargé avec defer après les SDK Firebase
(function () {
    var firebaseConfig = {
        apiKey: "AIzaSyA4GdfEh3M6mEszwRFif049qsmoLq4tn7c",
        authDomain: "usm-tennis.firebaseapp.com",
        databaseURL: "https://usm-tennis-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "usm-tennis",
        storageBucket: "usm-tennis.firebasestorage.app",
        messagingSenderId: "631286589550",
        appId: "1:631286589550:web:7e68afcddfbb8e16d79e7f",
        measurementId: "G-8KG396XEQH"
    };
    firebase.initializeApp(firebaseConfig);
    // Analytics optionnel (disponible uniquement sur index.html)
    if (typeof firebase.analytics === 'function') {
        try { firebase.analytics(); } catch (e) { /* ignoré si non disponible */ }
    }
    window.db_ref  = firebase.database();
    window.auth    = firebase.auth();
    window.storage = firebase.storage();
})();

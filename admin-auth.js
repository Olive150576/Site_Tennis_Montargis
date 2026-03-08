// Auth guard admin — extrait de admin-panel.html pour permettre defer sur les scripts Firebase
window.isCurrentUserAdmin = false;

window.logout = function () {
    window.auth.signOut().then(function () {
        window.location.href = '/';
    });
};

firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
        window.location.href = '/';
        return;
    }
    window.db_ref.ref('admins/' + user.uid).once('value', function (snap) {
        if (!snap.exists()) {
            window.auth.signOut().then(function () { window.location.href = '/'; });
            return;
        }
        window.isCurrentUserAdmin = true;

        // Afficher l'email dans la topbar
        var emailEl = document.getElementById('admin-user-email');
        if (emailEl) emailEl.textContent = user.email || '';

        // Révéler le dashboard
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('admin-page').style.display = 'block';

        // Charger les stats dès que l'auth est confirmée
        setTimeout(function () {
            if (window.updateAdminStats) window.updateAdminStats();
        }, 300);

        // Rafraîchir le custom claim Storage si nécessaire
        firebase.functions().httpsCallable('grantAdminClaim')()
            .then(function () { return user.getIdToken(true); })
            .catch(function (e) { console.warn('Custom claim:', e.message); });

        // Params URL : ?section=news&edit=3 → ouvrir directement l'édition
        var params = new URLSearchParams(window.location.search);
        var pSection = params.get('section');
        var pEdit    = params.get('edit');
        var pDel     = params.get('del');
        if (pSection && window.switchAdmin) {
            window.switchAdmin(pSection);
            if (pEdit !== null && window.editItem) {
                setTimeout(function () { window.editItem(pSection, parseInt(pEdit)); }, 400);
            }
            if (pDel !== null && window.deleteItem) {
                setTimeout(function () { window.deleteItem(pSection, parseInt(pDel)); }, 400);
            }
        }
    });
});

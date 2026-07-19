// Auth guard admin — extrait de admin-panel.html pour permettre defer sur les scripts Firebase
// Deux rôles : admin (accès complet) et coach (section Équipes uniquement, verrouillé aussi par les règles DB)
window.isCurrentUserAdmin = false;
window.isCurrentUserCoach = false;

window.logout = function () {
    window.auth.signOut().then(function () {
        window.location.href = '/';
    });
};

function _revealAdminPage(user) {
    var emailEl = document.getElementById('admin-user-email');
    if (emailEl) emailEl.textContent = (user.email || '') + (window.isCurrentUserCoach ? ' — Accès Coach (Équipes)' : '');
    document.getElementById('auth-loading').style.display = 'none';
    document.getElementById('admin-page').style.display = 'block';
}

// Mode coach : ne laisser visible que la section Équipes
function _applyCoachMode() {
    var stats = document.getElementById('admin-stats');
    if (stats) stats.style.display = 'none';
    var qr = document.getElementById('qr-scans-detail');
    if (qr) qr.style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
        var oc = btn.getAttribute('onclick') || '';
        if (oc.indexOf("'equipes'") === -1) btn.style.display = 'none';
    });
    // Ouvrir directement la section Équipes dès que admin.js est chargé
    var tries = 0;
    var timer = setInterval(function () {
        if (window.switchAdmin) {
            clearInterval(timer);
            window.switchAdmin('equipes');
        } else if (++tries > 50) {
            clearInterval(timer);
        }
    }, 100);
}

firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
        window.location.href = '/';
        return;
    }
    window.db_ref.ref('admins/' + user.uid).once('value', function (snap) {
        if (snap.exists()) {
            window.isCurrentUserAdmin = true;
            _revealAdminPage(user);

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
            return;
        }

        // Pas admin — peut-être coach ? (accès limité à la section Équipes)
        window.db_ref.ref('coaches/' + user.uid).once('value', function (csnap) {
            if (!csnap.exists() || csnap.val() !== true) {
                window.auth.signOut().then(function () { window.location.href = '/'; });
                return;
            }
            window.isCurrentUserCoach = true;
            _revealAdminPage(user);
            _applyCoachMode();
        }, function () {
            window.auth.signOut().then(function () { window.location.href = '/'; });
        });
    });
});

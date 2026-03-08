// Auth guard espace-membre — extrait de espace-membre.html pour permettre defer sur les scripts Firebase
firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
        window.location.href = '/';
        return;
    }
    // Vérifier si admin ou membre actif
    window.db_ref.ref('admins/' + user.uid).once('value', function (adminSnap) {
        var isAdmin   = adminSnap.exists();
        var params    = new URLSearchParams(window.location.search);
        var targetUid = (isAdmin && params.get('uid')) ? params.get('uid') : user.uid;

        window.db_ref.ref('members/' + targetUid).once('value', function (memberSnap) {
            if (memberSnap.exists() && memberSnap.val().actif) {
                document.getElementById('auth-loading').style.display = 'none';
                document.getElementById('member-page').style.display  = 'block';
                if (window.initMemberDashboard) {
                    var memberData      = memberSnap.val();
                    memberData._uid     = targetUid;
                    memberData._isAdmin = isAdmin;
                    window.initMemberDashboard(memberData);
                }
            } else if (isAdmin) {
                // Admin sans profil membre → prévisualisation vide
                document.getElementById('auth-loading').style.display = 'none';
                document.getElementById('member-page').style.display  = 'block';
                if (window.initMemberDashboard) {
                    window.initMemberDashboard({ prenom: 'Admin', nom: '', _uid: targetUid, _isAdmin: true });
                }
            } else {
                firebase.auth().signOut().then(function () { window.location.href = '/'; });
            }
        });
    });
});

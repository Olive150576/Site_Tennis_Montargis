// Auth guard espace-membre — extrait de espace-membre.html pour permettre defer sur les scripts Firebase
firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
        window.location.href = '/';
        return;
    }
    // Vérifier si admin, coach (staff) ou membre actif
    Promise.all([
        window.db_ref.ref('admins/' + user.uid).once('value'),
        window.db_ref.ref('coaches/' + user.uid).once('value')
    ]).then(function (snaps) {
        var isAdmin   = snaps[0].exists();
        var isCoach   = snaps[1].exists() && snaps[1].val() === true;
        var isStaff   = isAdmin || isCoach; // autorisé à prévisualiser le dashboard d'un autre membre
        var params    = new URLSearchParams(window.location.search);
        var targetUid = (isStaff && params.get('uid')) ? params.get('uid') : user.uid;

        window.db_ref.ref('members/' + targetUid).once('value', function (memberSnap) {
            if (memberSnap.exists() && memberSnap.val().actif) {
                document.getElementById('auth-loading').style.display = 'none';
                document.getElementById('member-page').style.display  = 'block';
                if (window.initMemberDashboard) {
                    var memberData      = memberSnap.val();
                    memberData._uid     = targetUid;
                    memberData._isStaff = isStaff;
                    window.initMemberDashboard(memberData);
                }
            } else if (isStaff) {
                // Staff sans profil membre → prévisualisation vide
                document.getElementById('auth-loading').style.display = 'none';
                document.getElementById('member-page').style.display  = 'block';
                if (window.initMemberDashboard) {
                    window.initMemberDashboard({ prenom: isAdmin ? 'Admin' : 'Coach', nom: '', _uid: targetUid, _isStaff: true });
                }
            } else {
                firebase.auth().signOut().then(function () { window.location.href = '/'; });
            }
        });
    });
});

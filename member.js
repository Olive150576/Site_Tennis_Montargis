// ============================================================
// ESPACE MEMBRE — member.js
// Chargé dynamiquement après connexion d'un membre
// ============================================================

// Données mémorisées pour la génération de carte
let _cardMemberData = null;
let _cardSponsors = [];
let _clubInfo = {}; // Téléphone + email du club (chargés depuis /info/)

// Initialisation du dashboard avec les données du membre
// --- Photo de profil ---
var _cropper = null;
var _cropperInitialZoom = 1;

window.setMemberAvatar = function(url) {
    var avatarDiv = document.getElementById('member-avatar-img');
    if (!avatarDiv) return;
    var icon = document.getElementById('member-avatar-icon');
    if (icon) icon.style.display = 'none';
    var existing = avatarDiv.querySelector('img.avatar-photo');
    if (existing) existing.remove();
    var img = document.createElement('img');
    img.className = 'avatar-photo';
    img.src = url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:50%;';
    avatarDiv.insertBefore(img, avatarDiv.querySelector('#avatar-cam-overlay'));
};

window.openPhotoPicker = function() {
    var input = document.getElementById('member-photo-input');
    if (input) input.click();
};

window.initPhotoCropper = function(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var modal = document.getElementById('photo-crop-modal');
        var img = document.getElementById('photo-crop-img');
        modal.style.display = 'flex';
        img.src = e.target.result;
        if (_cropper) { _cropper.destroy(); _cropper = null; }
        img.onload = function() {
            _cropper = new Cropper(img, {
                aspectRatio: 1,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.85,
                cropBoxMovable: false,
                cropBoxResizable: false,
                toggleDragModeOnDblclick: false,
                ready: function() {
                    _cropperInitialZoom = _cropper.getImageData().width / _cropper.getImageData().naturalWidth;
                    document.getElementById('photo-zoom-slider').value = 0.2;
                }
            });
            document.getElementById('photo-zoom-slider').oninput = function() {
                if (!_cropper) return;
                var zoom = _cropperInitialZoom * (1 + parseFloat(this.value) * 3);
                _cropper.zoomTo(zoom);
            };
        };
    };
    reader.readAsDataURL(file);
    input.value = '';
};

window.cancelPhotoCrop = function() {
    document.getElementById('photo-crop-modal').style.display = 'none';
    if (_cropper) { _cropper.destroy(); _cropper = null; }
};

window.savePhoto = function() {
    if (!_cropper) return;
    if (!window.auth.currentUser) return;
    // En mode admin, sauvegarder sur le membre cible (pas sur l'admin)
    var targetUid = (_cardMemberData && _cardMemberData._uid) ? _cardMemberData._uid : window.auth.currentUser.uid;
    var btn = document.getElementById('photo-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload...'; }
    var canvas = _cropper.getCroppedCanvas({ width: 300, height: 300, imageSmoothingQuality: 'high' });
    canvas.toBlob(function(blob) {
        var storageRef = window.storage.ref('members/' + targetUid + '/photo.jpg');
        storageRef.put(blob, { contentType: 'image/jpeg' }).then(function(snapshot) {
            return snapshot.ref.getDownloadURL();
        }).then(function(url) {
            window.db_ref.ref('members/' + targetUid + '/photoURL').set(url);
            window.setMemberAvatar(url);
            window.cancelPhotoCrop();
        }).catch(function(err) {
            window.showErrorMessage && window.showErrorMessage(err, 'photo');
        }).finally(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Valider'; }
        });
    }, 'image/jpeg', 0.92);
};

window.initMemberDashboard = function(memberData) {
    _cardMemberData = memberData;

    // Photo de profil sauvegardée
    if (memberData.photoURL) window.setMemberAvatar(memberData.photoURL);
    // Mode admin : bandeau + photo modifiable pour le membre cible
    if (memberData._isAdmin) {
        var avatarDiv = document.getElementById('member-avatar-img');
        if (avatarDiv) {
            avatarDiv.style.cursor = 'pointer';
            avatarDiv.title = 'Modifier la photo du membre';
            avatarDiv.onclick = window.openPhotoPicker;
        }

        // Bandeau admin visible en haut du dashboard
        var zone = document.getElementById('member-zone');
        if (zone && !document.getElementById('admin-edit-banner')) {
            var banner = document.createElement('div');
            banner.id = 'admin-edit-banner';
            banner.style.cssText = [
                'background:linear-gradient(90deg,rgba(255,215,0,0.12),rgba(255,165,0,0.08));',
                'border:1px solid rgba(255,215,0,0.4);',
                'border-radius:12px;',
                'padding:12px 18px;',
                'margin-bottom:20px;',
                'display:flex;',
                'align-items:center;',
                'gap:12px;',
                'flex-wrap:wrap;'
            ].join('');
            banner.innerHTML = '<i class="fas fa-user-shield" style="color:#ffd700;font-size:1.1rem;flex-shrink:0;"></i>' +
                '<div style="flex:1;">' +
                '<div style="color:#ffd700;font-weight:700;font-size:0.88rem;">Mode administrateur</div>' +
                '<div style="color:rgba(255,215,0,0.65);font-size:0.78rem;margin-top:1px;">Vous éditez le profil de <strong style="color:rgba(255,215,0,0.9);">' +
                (memberData.prenom || '') + ' ' + (memberData.nom || '') +
                '</strong>. Toutes les modifications sont enregistrées directement.</div>' +
                '</div>' +
                '<a href="/admin-panel.html" style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.35);color:#ffd700;padding:7px 14px;border-radius:8px;font-size:0.8rem;text-decoration:none;white-space:nowrap;display:flex;align-items:center;gap:6px;">' +
                '<i class="fas fa-arrow-left"></i> Panel admin' +
                '</a>';
            zone.insertBefore(banner, zone.firstChild);
        }
    }

    // --- En-tête ---
    const prenom = memberData.prenom || '';
    const nom = memberData.nom || '';
    const greet = document.getElementById('member-greeting');
    if (greet) greet.textContent = `Bonjour ${prenom} !`;

    const licenceVal = document.getElementById('member-licence-val');
    const classementVal = document.getElementById('member-classement-val');
    const categorieVal = document.getElementById('member-categorie-val');
    if (licenceVal) licenceVal.textContent = memberData.licence || '—';
    if (classementVal) classementVal.textContent = memberData.classement || '—';
    if (categorieVal) categorieVal.textContent = memberData.categorie || '—';

    // --- Onglet Profil ---
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '—';
    };
    set('mp-prenom', prenom);
    set('mp-nom', nom);
    set('mp-email', memberData.email);
    set('mp-telephone', memberData.telephone);
    set('mp-licence', memberData.licence);
    set('mp-classement', memberData.classement);
    set('mp-categorie', memberData.categorie);

    if (memberData.createdAt) {
        const date = new Date(memberData.createdAt).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
        set('mp-depuis', date);
    }

    // --- Carte VIP ---
    const setVip = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setVip('vip-card-name', `${prenom} ${nom}`.toUpperCase());
    setVip('vip-card-classement', memberData.classement);
    setVip('vip-card-categorie', memberData.categorie);
    setVip('vip-card-licence', memberData.licence);
    // Statut (masqué pour les simples membres)
    const statut = memberData.statut || 'Membre';
    const statutWrap = document.getElementById('vip-card-statut-wrap');
    const statutEl   = document.getElementById('vip-card-statut');
    if (statutEl && statut && statut !== 'Membre') {
        statutEl.innerHTML = `<i class="fas fa-star" style="font-size:0.6rem;"></i> ${escMember(statut)}`;
        if (statutWrap) statutWrap.style.display = 'block';
    }
    const vipYearEl = document.getElementById('vip-card-year');
    if (vipYearEl) vipYearEl.textContent = `Saison ${new Date().getFullYear()}`;

    // QR Code (URL vers page de vérification membre)
    // Généré dans un div hors-écran pour éviter les problèmes de canvas masqué
    const qrEl = document.getElementById('vip-qrcode');
    if (qrEl) {
        const memberUid = memberData._uid || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '');
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${prenom} ${nom}`;
        let qrRetries = 0;
        function renderVipQR() {
            if (typeof QRCode === 'undefined') {
                if (qrRetries < 20) { qrRetries++; setTimeout(renderVipQR, 300); }
                return;
            }
            // Générer dans un div temporaire visible hors écran
            var tmpDiv = document.createElement('div');
            tmpDiv.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(tmpDiv);
            new QRCode(tmpDiv, {
                text: qrContent,
                width: 100,
                height: 100,
                colorDark: '#0d1b2e',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
            // Récupérer le canvas généré et en extraire une image
            var canvas = tmpDiv.querySelector('canvas');
            var dataUrl = canvas ? canvas.toDataURL('image/png') : '';
            document.body.removeChild(tmpDiv);
            qrEl.innerHTML = '';
            if (dataUrl) {
                var img = document.createElement('img');
                img.src = dataUrl;
                img.style.cssText = 'width:100px;height:100px;display:block;border-radius:4px;';
                img.title = 'Afficher en plein écran';
                qrEl.appendChild(img);
            }
        }
        renderVipQR();
    }

    // --- Année en cours dans l'onglet club ---
    const yearEl = document.getElementById('member-tournaments-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // --- Charger infos club (tel/email) et afficher boutons de contact dans le header ---
    window.db_ref.ref('info').once('value', snap => {
        if (snap.exists()) {
            _clubInfo = snap.val() || {};
            var wrap = document.getElementById('club-contact-btns');
            if (wrap) {
                var html = '';
                if (_clubInfo.phone) html += `<a href="tel:${_clubInfo.phone}" style="display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.35); color:#4ade80; padding:7px 13px; border-radius:10px; font-size:0.8rem; font-family:inherit; text-decoration:none; white-space:nowrap;"><i class="fas fa-phone"></i> Téléphone</a>`;
                if (_clubInfo.email) html += `<a href="mailto:${_clubInfo.email}" style="display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.35); color:#4ade80; padding:7px 13px; border-radius:10px; font-size:0.8rem; font-family:inherit; text-decoration:none; white-space:nowrap;"><i class="fas fa-envelope"></i> Email</a>`;
                if (html) { wrap.innerHTML = `<span style="color:#94a3b8; font-size:0.72rem; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; white-space:nowrap;">Contacter le club</span>${html}`; wrap.style.display = 'flex'; }
            }
        }
    });
    loadMemberTournaments();
    loadMemberSponsors();
    loadPartenaireProfile();
    checkClubMessagesBadge();
};

// --- Chargement des tournois depuis /tournaments/ ---
function loadMemberTournaments() {
    const grid = document.getElementById('member-tournaments-grid');
    if (!grid) return;

    grid.innerHTML = Array(3).fill('<div class="member-skeleton-card"><div class="skeleton-img" style="height:140px; border-radius:8px; margin-bottom:12px;"></div><div class="skeleton-line medium"></div><div class="skeleton-line full"></div><div class="skeleton-line short"></div></div>').join('');

    window.db_ref.ref('tournaments').once('value', snap => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-calendar-times"></i><p>Aucun tournoi programmé pour l\'instant.</p></div>';
            return;
        }
        const items = Array.isArray(data) ? data : Object.values(data);
        const visible = items.filter(t => t && !t.draft).reverse();

        if (visible.length === 0) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-calendar-times"></i><p>Aucun tournoi programmé pour l\'instant.</p></div>';
            return;
        }

        grid.innerHTML = visible.map(t => renderTournamentCard(t)).join('');
    });
}

function renderTournamentCard(t) {
    const imgHtml = (t.images && t.images[0])
        ? `<img class="member-tournament-img" src="${escMember(t.images[0])}" alt="${escMember(t.title)}" loading="lazy">`
        : `<div class="member-tournament-img-placeholder"><i class="fas fa-trophy"></i></div>`;

    const prixHtml = t.prix
        ? `<div class="member-tournament-prix"><i class="fas fa-tag"></i>${escMember(t.prix)}</div>`
        : '';

    return `
    <div class="member-tournament-card">
        ${imgHtml}
        <div class="member-tournament-body">
            <div class="member-tournament-date"><i class="fas fa-calendar"></i>${escMember(t.date || '')}</div>
            <div class="member-tournament-title">${escMember(t.title || '')}</div>
            <div class="member-tournament-desc">${escMember(t.desc || '')}</div>
            ${prixHtml}
        </div>
    </div>`;
}

// --- Chargement des sponsors depuis /sponsors/ ---
function loadMemberSponsors() {
    const grid = document.getElementById('member-sponsors-grid');
    if (!grid) return;

    grid.innerHTML = Array(3).fill('<div class="member-skeleton-card"><div class="skeleton-line full" style="height:60px; border-radius:6px; margin-bottom:12px;"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>').join('');

    window.db_ref.ref('sponsors').once('value', snap => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-handshake"></i><p>Aucun partenaire enregistré.</p></div>';
            return;
        }
        const items = Array.isArray(data) ? data : Object.values(data);
        const visible = items.filter(s => s && !s.draft);
        _cardSponsors = visible; // mémoriser pour la carte

        if (visible.length === 0) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-handshake"></i><p>Aucun partenaire enregistré.</p></div>';
            return;
        }

        grid.innerHTML = visible.map(s => renderSponsorCard(s)).join('');
    });
}

function renderSponsorCard(s) {
    const logoHtml = (s.images && s.images[0])
        ? `<img class="member-sponsor-logo" src="${escMember(s.images[0])}" alt="${escMember(s.title)}" loading="lazy">`
        : `<div class="member-sponsor-logo-placeholder"><i class="fas fa-building"></i></div>`;

    const avantageHtml = s.avantage
        ? `<div class="member-sponsor-avantage"><i class="fas fa-gift"></i>${escMember(s.avantage)}</div>`
        : `<p class="member-sponsor-no-avantage">Avantage à venir</p>`;

    const linkHtml = s.url
        ? `<a href="${escMember(s.url)}" target="_blank" rel="noopener noreferrer" class="member-sponsor-link"><i class="fas fa-external-link-alt"></i> Visiter le site</a>`
        : '';

    return `
    <div class="member-sponsor-card">
        ${logoHtml}
        <div class="member-sponsor-info">
            <div class="member-sponsor-name">${escMember(s.title || '')}</div>
            ${avantageHtml}
            ${linkHtml}
        </div>
    </div>`;
}

// --- Annuaire partenaires : toggle opt-in ---
window.togglePartenaireForm = function() {
    var checked = document.getElementById('partenaire-optin').checked;
    var details = document.getElementById('partenaire-details');
    var track   = document.getElementById('partenaire-optin-track');
    var thumb   = document.getElementById('partenaire-optin-thumb');
    if (details) details.style.display = checked ? 'block' : 'none';
    if (track) {
        track.style.background   = checked ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.1)';
        track.style.borderColor  = checked ? 'rgba(255,215,0,0.5)'  : 'rgba(255,255,255,0.2)';
    }
    if (thumb) {
        thumb.style.transform = checked ? 'translateX(20px)' : 'translateX(0)';
        thumb.style.background = checked ? '#ffd700' : '#64748b';
    }
    // Désactivation immédiate : supprimer de l'annuaire sans attendre le bouton sauvegarder
    if (!checked) {
        window.savePartenaireProfile();
    }
};

// --- Annuaire partenaires : chargement depuis Firebase ---
function loadPartenaireProfile() {
    if (!_cardMemberData || !_cardMemberData._uid) return;
    var uid = _cardMemberData._uid;
    window.db_ref.ref('members/' + uid + '/partenaire').once('value', function(snap) {
        var p = snap.val() || {};
        var optin = document.getElementById('partenaire-optin');
        if (optin) {
            optin.checked = !!p.public_profile;
            window.togglePartenaireForm();
        }
        var styleEl = document.getElementById('partenaire-style');
        if (styleEl && p.style_jeu) styleEl.value = p.style_jeu;
        // Disponibilités par jour/créneau
        var _jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
        var _creneaux = ['matin','midi','soir'];
        if (p.dispo) {
            var hasAnyDispo = false;
            _jours.forEach(function(j) {
                _creneaux.forEach(function(c) {
                    var el = document.getElementById('dispo-' + j + '-' + c);
                    if (el && p.dispo[j]) {
                        el.checked = !!p.dispo[j][c];
                        if (p.dispo[j][c]) hasAnyDispo = true;
                    }
                });
            });
            // Ouvrir l'accordéon si des dispos sont déjà cochées
            if (hasAnyDispo && window.toggleDispoForm) window.toggleDispoForm(true);
        }
        // Coordonnées
        var coordFields = { 'partenaire-share-tel': 'partager_telephone', 'partenaire-share-email': 'partager_email' };
        Object.keys(coordFields).forEach(function(id) {
            var el = document.getElementById(id);
            if (el && p[coordFields[id]] !== undefined) el.checked = !!p[coordFields[id]];
        });
        var msgEl = document.getElementById('partenaire-message');
        if (msgEl && p.message) { msgEl.value = p.message; updatePartenaireCount(); }
    });
    var msgEl = document.getElementById('partenaire-message');
    if (msgEl) msgEl.addEventListener('input', updatePartenaireCount);
}

function updatePartenaireCount() {
    var msg = document.getElementById('partenaire-message');
    var cnt = document.getElementById('partenaire-msg-count');
    if (msg && cnt) cnt.textContent = msg.value.length;
}

// --- Annuaire partenaires : sauvegarde ---
window.savePartenaireProfile = function() {
    if (!_cardMemberData || !_cardMemberData._uid) return;
    var uid = _cardMemberData._uid;
    var btn    = document.getElementById('partenaire-save-btn');
    var status = document.getElementById('partenaire-save-status');
    var optin  = document.getElementById('partenaire-optin');
    var checked = optin ? optin.checked : false;

    var data = { public_profile: checked, updatedAt: Date.now() };
    if (checked) {
        var styleEl = document.getElementById('partenaire-style');
        data.style_jeu          = styleEl ? styleEl.value : 'loisir';
        var _jours    = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
        var _creneaux = ['matin','midi','soir'];
        data.dispo = {};
        _jours.forEach(function(j) {
            data.dispo[j] = {};
            _creneaux.forEach(function(c) {
                data.dispo[j][c] = !!(document.getElementById('dispo-' + j + '-' + c) || {}).checked;
            });
        });
        data.partager_telephone = !!(document.getElementById('partenaire-share-tel')  || {}).checked;
        data.partager_email     = !!(document.getElementById('partenaire-share-email') || {}).checked;
        var msgEl = document.getElementById('partenaire-message');
        data.message = msgEl ? msgEl.value.trim().substring(0, 100) : '';
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement…'; }
    if (status) status.innerHTML = '';

    // Index public pour l'annuaire
    var indexData = null;
    if (checked && _cardMemberData) {
        indexData = {
            prenom:   _cardMemberData.prenom  || '',
            nom:      _cardMemberData.nom     || '',
            classement: _cardMemberData.classement || '',
            categorie:  _cardMemberData.categorie  || '',
            photoURL:   _cardMemberData.photoURL   || '',
            style_jeu:          data.style_jeu          || 'loisir',
            dispo:              data.dispo              || {},
            partager_telephone: data.partager_telephone || false,
            partager_email:     data.partager_email     || false,
            telephone: (data.partager_telephone && _cardMemberData.telephone) ? _cardMemberData.telephone : '',
            email:     (data.partager_email     && _cardMemberData.email)     ? _cardMemberData.email     : '',
            message:   data.message || ''
        };
    }

    var writes = [window.db_ref.ref('members/' + uid + '/partenaire').set(data)];
    if (checked && indexData) {
        writes.push(window.db_ref.ref('partenaire_index/' + uid).set(indexData));
    } else {
        writes.push(window.db_ref.ref('partenaire_index/' + uid).remove());
    }

    Promise.all(writes).then(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer mes préférences'; }
        if (status) status.innerHTML = '<span style="color:#22c55e;"><i class="fas fa-check"></i> Préférences enregistrées</span>';
        setTimeout(function() { if (status) status.innerHTML = ''; }, 3000);
        // Rafraîchir l'annuaire immédiatement si déjà ouvert, sinon reset le flag
        if (_annuaireLoaded) {
            _annuaireLoaded = false;
            loadAnnuairePartenaires();
        }
    }).catch(function(err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer mes préférences'; }
        if (status) status.innerHTML = '<span style="color:#ef4444;">Erreur : ' + err.message + '</span>';
    });
};

// --- Navigation onglets ---
var _annuaireLoaded = false;
var _messagesLoaded = false;
window.switchMemberTab = function(tab) {
    ['profil', 'partenaires', 'club', 'infos'].forEach(t => {
        const content = document.getElementById(`mtab-${t}`);
        const btn = document.getElementById(`mtab-btn-${t}`);
        if (content) content.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'partenaires' && !_annuaireLoaded) {
        _annuaireLoaded = true;
        loadAnnuairePartenaires();
    }
    if (tab === 'infos' && !_messagesLoaded) {
        _messagesLoaded = true;
        loadClubMessages();
        // Mémoriser la date de lecture dans localStorage
        localStorage.setItem('usm_infos_seen_at', String(Date.now()));
        var badge = document.getElementById('infos-badge');
        if (badge) badge.style.display = 'none';
    }
};

// --- Annuaire partenaires : chargement et affichage ---
var _partenaireAllData = [];
var _partenaireFilters = { matin: false, midi: false, soir: false };

function loadAnnuairePartenaires() {
    var grid = document.getElementById('partenaire-results');
    if (!grid) return;
    grid.innerHTML = Array(4).fill('<div class="member-skeleton-card" style="display:flex; gap:12px; align-items:flex-start;"><div class="skeleton-avatar"></div><div style="flex:1;"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div><div class="skeleton-line full"></div></div></div>').join('');

    window.db_ref.ref('partenaire_index').once('value', function(snap) {
        var data = snap.val();
        if (!data) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-users-slash"></i><p>Aucun membre disponible pour l\'instant.<br><small style="color:#475569;">Soyez le premier à vous inscrire dans l\'onglet Mon Profil !</small></p></div>';
            return;
        }
        var myUid = _cardMemberData ? _cardMemberData._uid : null;
        var entries = Object.entries(data)
            .filter(function(e) { return e[0] !== myUid && e[1]; });

        if (entries.length === 0) {
            grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-users"></i><p>Aucun autre membre disponible pour l\'instant.</p></div>';
            return;
        }

        // Charger les photos depuis /members/{uid}/photoURL pour ceux qui n'en ont pas dans l'index
        var photoFetches = entries.map(function(e) {
            var uid = e[0];
            var p = e[1];
            if (p.photoURL) return Promise.resolve({ uid: uid, photo: p.photoURL });
            return window.db_ref.ref('members/' + uid + '/photoURL').once('value').then(function(s) {
                return { uid: uid, photo: s.val() || '' };
            });
        });

        Promise.all(photoFetches).then(function(photos) {
            var photoMap = {};
            photos.forEach(function(r) { photoMap[r.uid] = r.photo; });
            _partenaireAllData = entries.map(function(e) {
                return Object.assign({}, e[1], { _uid: e[0], photoURL: photoMap[e[0]] || '' });
            });
            applyAndRenderPartenaires();
        });
    });
}

function applyAndRenderPartenaires() {
    var grid = document.getElementById('partenaire-results');
    var countEl = document.getElementById('partenaire-count');
    if (!grid) return;

    var styleFilter = (document.getElementById('filter-style') || {}).value || '';
    var searchRaw   = ((document.getElementById('partenaire-search') || {}).value || '').trim().toLowerCase();
    var filtered = _partenaireAllData.filter(function(p) {
        if (styleFilter && p.style_jeu !== styleFilter) return false;
        if (searchRaw) {
            var fullName = ((p.prenom || '') + ' ' + (p.nom || '')).toLowerCase();
            if (fullName.indexOf(searchRaw) === -1) return false;
        }
        var creneaux = ['matin', 'midi', 'soir'];
        for (var i = 0; i < creneaux.length; i++) {
            var c = creneaux[i];
            if (_partenaireFilters[c]) {
                var hasSlot = p.dispo && Object.keys(p.dispo).some(function(j) {
                    return p.dispo[j] && p.dispo[j][c];
                });
                if (!hasSlot) return false;
            }
        }
        return true;
    });

    if (countEl) countEl.textContent = filtered.length + ' membre' + (filtered.length !== 1 ? 's' : '');

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-search"></i><p>Aucun membre ne correspond à ces filtres.</p></div>';
        return;
    }
    grid.innerHTML = filtered.map(renderPartenaireCard).join('');
}

function renderPartenaireCard(p) {
    var initiales = ((p.prenom || '').charAt(0) + (p.nom || '').charAt(0)).toUpperCase() || '?';
    var avatarHtml = p.photoURL
        ? `<img src="${escMember(p.photoURL)}" alt="${escMember(p.prenom)}">`
        : initiales;

    var styleLabels = { loisir: 'Loisir', competitif: 'Compétitif', double: 'Double', mixte: 'Mixte', padel: 'Padel' };
    var styleHtml = p.style_jeu
        ? `<span style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:6px; padding:2px 8px;">${escMember(styleLabels[p.style_jeu] || p.style_jeu)}</span>`
        : '';

    var joursShort = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam', dimanche:'Dim' };
    var joursOrder = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    var creneauxLabel = { matin:'Matin', midi:'Midi', soir:'Soir' };
    var dispoLines = [];
    if (p.dispo && typeof p.dispo === 'object') {
        // Nouveau format : dispo.lundi.matin etc.
        ['matin','midi','soir'].forEach(function(c) {
            var jList = joursOrder.filter(function(j) { return p.dispo[j] && p.dispo[j][c]; });
            if (jList.length) dispoLines.push(creneauxLabel[c] + ': ' + jList.map(function(j){ return joursShort[j]; }).join(' · '));
        });
    } else {
        // Ancien format plat (rétrocompatibilité)
        if (p.dispo_matin)   dispoLines.push('Matin: disponible');
        if (p.dispo_soir)    dispoLines.push('Soir: disponible');
        if (p.dispo_weekend) dispoLines.push('Week-end: disponible');
    }
    var dispoHtml = dispoLines.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:8px;">${dispoLines.map(function(d){ return `<span class="partenaire-dispo-tag"><i class="fas fa-clock" style="font-size:0.6rem;"></i> ${escMember(d)}</span>`; }).join('')}</div>`
        : '';

    var msgHtml = p.message
        ? `<div style="color:#94a3b8; font-size:0.8rem; font-style:italic; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">"${escMember(p.message)}"</div>`
        : '';

    var contactBtns = '';
    if (p.partager_telephone && p.telephone) {
        contactBtns += `<a href="sms:${escMember(p.telephone)}" class="partenaire-contact-btn sms"><i class="fas fa-comment-sms"></i> SMS</a>`;
        contactBtns += `<a href="tel:${escMember(p.telephone)}" class="partenaire-contact-btn tel"><i class="fas fa-phone"></i> Appeler</a>`;
    }
    if (p.partager_email && p.email) {
        contactBtns += `<a href="mailto:${escMember(p.email)}" class="partenaire-contact-btn email"><i class="fas fa-envelope"></i> Email</a>`;
    }
    var contactHtml = contactBtns
        ? `<div style="display:flex; gap:8px; margin-top:4px; flex-wrap:wrap;">${contactBtns}</div>`
        : '';

    var badges = '';
    if (p.classement) badges += `<span style="background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);color:rgba(255,215,0,0.85);padding:2px 8px;border-radius:6px;font-size:0.72rem;">${escMember(p.classement)}</span>`;
    if (p.categorie)  badges += `<span style="background:rgba(0,210,255,0.07);border:1px solid rgba(0,210,255,0.2);color:rgba(0,210,255,0.75);padding:2px 8px;border-radius:6px;font-size:0.72rem;">${escMember(p.categorie)}</span>`;

    return `<div class="partenaire-card">
        <div style="display:flex; align-items:center; gap:12px;">
            <div class="partenaire-avatar-circle">${avatarHtml}</div>
            <div style="flex:1; min-width:0;">
                <div style="color:white; font-weight:600; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escMember(p.prenom + ' ' + p.nom)}</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">${badges}</div>
            </div>
            ${styleHtml}
        </div>
        ${dispoHtml}
        ${msgHtml}
        ${contactHtml}
    </div>`;
}

window.togglePartenaireFilter = function(key) {
    _partenaireFilters[key] = !_partenaireFilters[key];
    var btn = document.getElementById('filter-' + key);
    if (btn) btn.classList.toggle('active', _partenaireFilters[key]);
    applyAndRenderPartenaires();
};

window.applyPartenaireFilters = function() {
    applyAndRenderPartenaires();
};

window.resetPartenaireFilters = function() {
    ['matin', 'midi', 'soir'].forEach(function(k) {
        _partenaireFilters[k] = false;
        var btn = document.getElementById('filter-' + k);
        if (btn) btn.classList.remove('active');
    });
    var styleEl = document.getElementById('filter-style');
    if (styleEl) styleEl.value = '';
    var searchEl = document.getElementById('partenaire-search');
    if (searchEl) searchEl.value = '';
    applyAndRenderPartenaires();
};

// --- Réinitialisation mot de passe ---
window.sendPasswordReset = function() {
    var user = window.auth.currentUser;
    if (!user || !user.email) return;
    window.auth.sendPasswordResetEmail(user.email).then(function() {
        window.showSuccessMessage && window.showSuccessMessage('Email envoyé', 'Un email de réinitialisation a été envoyé à ' + user.email + '. Vérifie tes spams si tu ne le reçois pas.');
    }).catch(function(err) {
        window.showErrorMessage && window.showErrorMessage(err, 'password');
    });
};

// --- Déconnexion membre ---
window.memberLogout = function() {
    window.auth.signOut().then(() => {
        window.location.href = '/';
    });
};

// --- Modal plein écran : afficher la carte membre ---
window.showCardModal = function() {
    const modal = document.getElementById('card-modal');
    if (!modal) return;
    const content = document.getElementById('card-modal-content');
    if (content) {
        // Cloner la carte VIP dans le modal
        const card = document.querySelector('.vip-card');
        if (card) {
            content.innerHTML = '';
            const clone = card.cloneNode(true);
            // Retirer le QR cliquable du clone pour éviter boucle
            const qrWrap = clone.querySelector('.vip-card-qr');
            if (qrWrap) qrWrap.style.pointerEvents = 'none';
            content.appendChild(clone);
        }
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

window.hideCardModal = function() {
    const modal = document.getElementById('card-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

// ============================================================
// FOND D'ÉCRAN MOBILE MEMBRE
// ============================================================
window.downloadMemberWallpaper = function() {
    if (!_cardMemberData) return;
    if (typeof html2canvas === 'undefined') return;

    const el = document.getElementById('member-wallpaper-print');
    if (!el) return;

    el.innerHTML = buildWallpaperHtml(_cardMemberData);
    el.style.display = 'block';

    setTimeout(() => {
        html2canvas(el, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false
        }).then(canvas => {
            el.style.display = 'none';
            el.innerHTML = '';
            const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
            const filename = `fond-ecran-usm-${nomFichier}.png`;
            const dataUrl = canvas.toDataURL('image/png');

            const isPWA = window.matchMedia('(display-mode: standalone)').matches
                       || window.navigator.standalone === true;
            if (isPWA) { showDownloadOverlay(dataUrl); return; }

            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = filename;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 2000);
            }, 'image/png');
        }).catch(() => {
            el.style.display = 'none';
            el.innerHTML = '';
        });
    }, 200);
};

function buildWallpaperHtml(m) {
    const prenom = m.prenom || '';
    const nom = m.nom || '';
    const annee = new Date().getFullYear();

    // Lignes décoratives dorées en SVG (motif tennis / raquette stylisé)
    const decorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" style="position:absolute;top:0;left:0;pointer-events:none;">
        <line x1="0" y1="200" x2="390" y2="200" stroke="rgba(255,215,0,0.07)" stroke-width="1"/>
        <line x1="0" y1="644" x2="390" y2="644" stroke="rgba(255,215,0,0.07)" stroke-width="1"/>
        <circle cx="195" cy="422" r="180" stroke="rgba(255,215,0,0.05)" stroke-width="1" fill="none"/>
        <circle cx="195" cy="422" r="140" stroke="rgba(255,215,0,0.04)" stroke-width="1" fill="none"/>
        <line x1="0" y1="422" x2="390" y2="422" stroke="rgba(255,215,0,0.05)" stroke-width="1"/>
        <line x1="195" y1="242" x2="195" y2="602" stroke="rgba(255,215,0,0.05)" stroke-width="1"/>
    </svg>`;

    return `
    <div style="
        width:390px; height:844px;
        background:linear-gradient(175deg, #0a1220 0%, #0d1b2e 30%, #112240 60%, #0a1628 100%);
        position:relative; overflow:hidden; font-family:Arial,sans-serif;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        box-sizing:border-box; padding:40px 30px;
    ">
        ${decorSvg}

        <!-- TOP : initiales membre -->
        <div style="position:absolute;top:52px;left:0;right:0;text-align:center;z-index:2;">
            <div style="color:#ffffff;font-size:38px;font-weight:900;letter-spacing:8px;font-family:Arial,sans-serif;text-shadow:0 0 24px rgba(255,215,0,0.2);">
                ${escMember((prenom.charAt(0) + nom.charAt(0)).toUpperCase())}
            </div>
            <div style="color:rgba(255,215,0,0.5);font-size:9px;letter-spacing:4px;margin-top:4px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
        </div>

        <!-- LOGO CENTRAL (plus grand) -->
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:36px;">
            <div style="
                width:210px;height:210px;border-radius:50%;
                background:radial-gradient(circle,rgba(255,215,0,0.14) 0%,rgba(255,215,0,0.04) 60%,transparent 100%);
                display:flex;align-items:center;justify-content:center;
                margin:0 auto;
                box-shadow:0 0 50px rgba(255,215,0,0.3), 0 0 100px rgba(255,215,0,0.12), 0 0 150px rgba(255,215,0,0.06);
                border:1px solid rgba(255,215,0,0.25);
            ">
                <img src="/logo_usm_new.png" crossorigin="anonymous"
                    style="width:170px;height:170px;object-fit:contain;filter:drop-shadow(0 0 16px rgba(255,215,0,0.9)) drop-shadow(0 0 36px rgba(255,215,0,0.5));"
                    alt="USM">
            </div>
        </div>

        <!-- SÉPARATEUR OR -->
        <div style="position:relative;z-index:2;display:flex;align-items:center;gap:10px;width:220px;margin-bottom:28px;">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.6));"></div>
            <div style="color:#ffd700;font-size:10px;">★</div>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,0,0.6),transparent);"></div>
        </div>

        <!-- LICENCE -->
        ${m.licence ? `
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:14px;">
            <div style="color:rgba(255,215,0,0.5);font-size:9px;letter-spacing:4px;font-family:Arial,sans-serif;margin-bottom:6px;">LICENCE FFT</div>
            <div style="
                color:#ffd700;font-size:22px;font-weight:700;letter-spacing:4px;font-family:Arial,sans-serif;
                text-shadow:0 0 16px rgba(255,215,0,0.6);
            ">${escMember(m.licence)}</div>
        </div>` : ''}

        <!-- SAISON -->
        <div style="position:relative;z-index:2;margin-top:10px;">
            <div style="
                background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);
                color:rgba(255,215,0,0.7);font-size:11px;letter-spacing:3px;
                padding:6px 20px;border-radius:20px;font-family:Arial,sans-serif;
            ">SAISON ${annee}</div>
        </div>

        <!-- BAS : site web -->
        <div style="position:absolute;bottom:40px;left:0;right:0;text-align:center;">
            <div style="color:rgba(255,215,0,0.2);font-size:9px;letter-spacing:2px;font-family:Arial,sans-serif;">tennismontargis.fr</div>
        </div>
    </div>`;
}

// ============================================================
// FOND D'ÉCRAN BUREAU (16:9 — 1280×720px → scale:1.5 → 1920×1080px)
// ============================================================
window.downloadMemberWallpaperDesktop = function() {
    if (!_cardMemberData) return;
    if (typeof html2canvas === 'undefined') return;

    const el = document.getElementById('member-wallpaper-desktop-print');
    if (!el) return;

    el.innerHTML = buildDesktopWallpaperHtml(_cardMemberData);
    el.style.display = 'block';

    setTimeout(() => {
        html2canvas(el, {
            scale: 1.5,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false
        }).then(canvas => {
            el.style.display = 'none';
            el.innerHTML = '';
            const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
            const filename = `fond-ecran-bureau-usm-${nomFichier}.png`;
            const dataUrl = canvas.toDataURL('image/png');

            const isPWA = window.matchMedia('(display-mode: standalone)').matches
                       || window.navigator.standalone === true;
            if (isPWA) { showDownloadOverlay(dataUrl); return; }

            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = filename;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 2000);
            }, 'image/png');
        }).catch(() => {
            el.style.display = 'none';
            el.innerHTML = '';
        });
    }, 200);
};

function buildDesktopWallpaperHtml(m) {
    const prenom = m.prenom || '';
    const nom    = m.nom    || '';
    const annee  = new Date().getFullYear();
    const statut = m.statut && m.statut !== 'Membre' ? m.statut : null;

    const W = 1280, H = 720;
    const cx = W / 2, cy = H / 2;

    const decorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="position:absolute;top:0;left:0;pointer-events:none;">
        <!-- Lignes horizontales de cadre -->
        <line x1="0" y1="80"  x2="${W}" y2="80"  stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <line x1="0" y1="${H-80}" x2="${W}" y2="${H-80}" stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <!-- Cercles concentriques centraux -->
        <circle cx="${cx}" cy="${cy}" r="310" stroke="rgba(255,215,0,0.05)" stroke-width="1" fill="none"/>
        <circle cx="${cx}" cy="${cy}" r="240" stroke="rgba(255,215,0,0.04)" stroke-width="1" fill="none"/>
        <circle cx="${cx}" cy="${cy}" r="170" stroke="rgba(255,215,0,0.03)" stroke-width="1" fill="none"/>
        <!-- Croix centrale -->
        <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="rgba(255,215,0,0.04)" stroke-width="1"/>
        <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="rgba(255,215,0,0.04)" stroke-width="1"/>
        <!-- Coins dorés -->
        <path d="M40,40 L40,90 M40,40 L90,40"   stroke="rgba(255,215,0,0.18)" stroke-width="1.5" fill="none"/>
        <path d="M${W-40},40 L${W-40},90 M${W-40},40 L${W-90},40" stroke="rgba(255,215,0,0.18)" stroke-width="1.5" fill="none"/>
        <path d="M40,${H-40} L40,${H-90} M40,${H-40} L90,${H-40}" stroke="rgba(255,215,0,0.18)" stroke-width="1.5" fill="none"/>
        <path d="M${W-40},${H-40} L${W-40},${H-90} M${W-40},${H-40} L${W-90},${H-40}" stroke="rgba(255,215,0,0.18)" stroke-width="1.5" fill="none"/>
        <!-- Lignes diagonales légères -->
        <line x1="0" y1="0" x2="200" y2="${H}" stroke="rgba(255,215,0,0.02)" stroke-width="1"/>
        <line x1="${W}" y1="0" x2="${W-200}" y2="${H}" stroke="rgba(255,215,0,0.02)" stroke-width="1"/>
    </svg>`;

    const separatorHtml = `
        <div style="display:flex;align-items:center;gap:12px;width:280px;margin:20px auto;">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.6));"></div>
            <div style="color:#ffd700;font-size:12px;">★</div>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,0,0.6),transparent);"></div>
        </div>`;

    return `
    <div style="
        width:${W}px; height:${H}px;
        background:linear-gradient(160deg, #070e1a 0%, #0d1b2e 35%, #112240 65%, #080f1c 100%);
        position:relative; overflow:hidden; font-family:Arial,sans-serif;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        box-sizing:border-box;
    ">
        ${decorSvg}

        <!-- LOGO central avec halo doré -->
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:24px;">
            <div style="
                width:220px; height:220px; border-radius:50%;
                background:radial-gradient(circle, rgba(255,215,0,0.16) 0%, rgba(255,215,0,0.05) 55%, transparent 100%);
                display:flex; align-items:center; justify-content:center;
                margin:0 auto;
                box-shadow:0 0 60px rgba(255,215,0,0.35), 0 0 120px rgba(255,215,0,0.15), 0 0 200px rgba(255,215,0,0.06);
                border:1px solid rgba(255,215,0,0.28);
            ">
                <img src="/logo_usm_new.png" crossorigin="anonymous"
                    style="width:178px;height:178px;object-fit:contain;filter:drop-shadow(0 0 18px rgba(255,215,0,0.95)) drop-shadow(0 0 40px rgba(255,215,0,0.55));"
                    alt="USM">
            </div>
        </div>

        <!-- NOM DU CLUB -->
        <div style="position:relative;z-index:2;text-align:center;">
            <div style="color:rgba(255,215,0,0.45);font-size:11px;letter-spacing:6px;font-family:Arial,sans-serif;margin-bottom:8px;">CLUB DE TENNIS</div>
            <div style="color:#ffd700;font-size:30px;font-weight:900;letter-spacing:4px;font-family:Arial,sans-serif;text-shadow:0 0 30px rgba(255,215,0,0.35);">USM TENNIS MONTARGIS</div>
        </div>

        ${separatorHtml}

        <!-- SAISON -->
        <div style="position:relative;z-index:2;text-align:center;">
            <div style="
                background:rgba(255,215,0,0.07); border:1px solid rgba(255,215,0,0.28);
                color:rgba(255,215,0,0.65); font-size:11px; letter-spacing:4px;
                padding:6px 22px; border-radius:20px; font-family:Arial,sans-serif;
            ">SAISON ${annee}</div>
        </div>

        <!-- BAS GAUCHE : logo FFT -->
        <img src="/Logo_F%C3%A9d%C3%A9ration_Fran%C3%A7aise_de_Tennis.png" crossorigin="anonymous"
            style="position:absolute;bottom:32px;left:48px;width:48px;height:48px;object-fit:contain;opacity:0.45;z-index:2;"
            alt="FFT">

        <!-- BAS : site web -->
        <div style="position:absolute;bottom:36px;left:0;right:0;text-align:center;z-index:2;">
            <div style="color:rgba(255,215,0,0.2);font-size:10px;letter-spacing:3px;font-family:Arial,sans-serif;">tennismontargis.fr</div>
        </div>
    </div>`;
}

// ============================================================
// UTILITAIRE : convertir une URL image en base64 (contourne CORS pour html2canvas)
// ============================================================
function fetchImageAsBase64(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || 100;
                c.height = img.naturalHeight || 100;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function preloadSponsorLogos(sponsors) {
    return Promise.all((sponsors || []).map(async s => {
        if (!s || !s.images || !s.images[0]) return { ...s };
        const b64 = await fetchImageAsBase64(s.images[0]);
        return { ...s, _logoBase64: b64 };
    }));
}

// ============================================================
// TÉLÉCHARGEMENT CARTE MEMBRE EN PNG
// ============================================================
// ── Utilitaire commun : capture html2canvas + téléchargement ──
function _captureAndDownload(el, filename, delay) {
    return new Promise(resolve => {
        setTimeout(() => {
            html2canvas(el, {
                scale: 3,
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                logging: false
            }).then(canvas => {
                el.style.display = 'none';
                el.innerHTML = '';
                const dataUrl = canvas.toDataURL('image/png');
                const isPWA = window.matchMedia('(display-mode: standalone)').matches
                           || window.navigator.standalone === true;
                if (isPWA) { showDownloadOverlay(dataUrl); resolve(); return; }
                canvas.toBlob(blob => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = filename;
                    link.href = url;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                    resolve();
                }, 'image/png');
            }).catch(() => { el.style.display = 'none'; el.innerHTML = ''; resolve(); });
        }, delay);
    });
}

// ── RECTO ──────────────────────────────────────────────────────
window.downloadMemberCardRecto = async function() {
    if (!_cardMemberData || typeof html2canvas === 'undefined') return;
    const el = document.getElementById('member-card-print');
    if (!el) return;
    el.innerHTML = buildRectoHtml(_cardMemberData);
    el.style.left = '-9999px';
    el.style.display = 'block';
    const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
    await _captureAndDownload(el, `carte-membre-recto-usm-${nomFichier}.png`, 200);
};

// ── VERSO ──────────────────────────────────────────────────────
window.downloadMemberCardVerso = async function() {
    if (!_cardMemberData || typeof html2canvas === 'undefined') return;
    const el = document.getElementById('member-card-print');
    if (!el) return;

    // Recharger les sponsors + pré-charger logos en base64
    if (window.db_ref) {
        await new Promise(resolve => {
            window.db_ref.ref('sponsors').once('value', snap => {
                const data = snap.val();
                _cardSponsors = data
                    ? (Array.isArray(data) ? data : Object.values(data)).filter(s => s && !s.draft)
                    : [];
                resolve();
            });
        });
    }
    const sponsorsPreloaded = await preloadSponsorLogos(_cardSponsors);

    el.innerHTML = buildVersoHtml(_cardMemberData, sponsorsPreloaded);
    el.style.left = '-9999px';
    el.style.display = 'block';

    // QR code avec logo USM intégré — niveau H pour tolérance 30% (logo en surimpression)
    const qrContainer = el.querySelector('#card-print-qr-verso');
    if (qrContainer && typeof QRCode !== 'undefined') {
        const memberUid = (_cardMemberData && _cardMemberData._uid)
            || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '');
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${_cardMemberData.prenom || ''} ${_cardMemberData.nom || ''}`;
        new QRCode(qrContainer, {
            text: qrContent,
            width: 116,
            height: 116,
            colorDark: '#0d1b2e',
            colorLight: '#f5e88a',
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
    await _captureAndDownload(el, `carte-membre-verso-usm-${nomFichier}.png`, 500);
};

function showDownloadOverlay(dataUrl) {
    // Overlay plein écran
    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,0.93);z-index:99999;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'padding:20px;box-sizing:border-box;gap:16px;'
    ].join('');

    const hint = document.createElement('p');
    hint.style.cssText = 'color:#ffd700;font-size:13px;text-align:center;margin:0;line-height:1.5;';
    hint.innerHTML = '<strong>Appuyez longuement sur l\'image</strong> pour l\'enregistrer<br><span style="color:rgba(255,215,0,0.55);font-size:11px;">ou faites un clic droit → Enregistrer</span>';

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Carte membre USM';
    img.style.cssText = 'max-width:100%;max-height:65vh;border-radius:14px;border:2px solid rgba(255,215,0,0.45);display:block;';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Fermer';
    closeBtn.style.cssText = [
        'background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.4);',
        'color:#ffd700;padding:10px 30px;border-radius:50px;font-size:14px;',
        'cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;'
    ].join('');
    closeBtn.onclick = () => document.body.removeChild(overlay);

    overlay.appendChild(hint);
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

// ── Styles communs recto/verso ──────────────────────────────
const _CARD_W = 680, _CARD_H = 429;
const _cardBase = `
    width:${_CARD_W}px;height:${_CARD_H}px;box-sizing:border-box;
    background:linear-gradient(145deg,#0d1b2e 0%,#112240 55%,#0a1628 100%);
    border:2px solid rgba(255,215,0,0.6);border-radius:18px;
    overflow:hidden;font-family:Arial,sans-serif;display:flex;flex-direction:column;
`;
function _cardHeader(label, annee) {
    return `<div style="display:flex;align-items:center;padding:11px 18px;
        background:linear-gradient(90deg,rgba(255,215,0,0.13) 0%,rgba(255,215,0,0.04) 100%);
        border-bottom:1px solid rgba(255,215,0,0.35);flex-shrink:0;">
        <img src="/logo_usm_new.png" style="width:62px;height:62px;object-fit:contain;border-radius:50%;border:2px solid rgba(255,215,0,0.5);flex-shrink:0;" crossorigin="anonymous" alt="USM">
        <div style="flex:1;text-align:center;padding:0 10px;">
            <div style="color:#ffd700;font-size:15px;font-weight:900;letter-spacing:2px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
            <div style="color:rgba(255,215,0,0.65);font-size:10px;letter-spacing:3px;margin-top:2px;font-family:Arial,sans-serif;">${label} · SAISON ${annee}</div>
        </div>
        <img src="/Logo_F%C3%A9d%C3%A9ration_Fran%C3%A7aise_de_Tennis.png" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;" crossorigin="anonymous" alt="FFT">
    </div>`;
}
const _cardFooter = `<div style="text-align:center;padding:6px;border-top:1px solid rgba(255,215,0,0.15);
    color:rgba(255,215,0,0.3);font-size:9px;letter-spacing:1px;font-family:Arial,sans-serif;flex-shrink:0;">
    tennismontargis.fr</div>`;

// ── RECTO : logo grand + infos membre, sans QR ─────────────
function buildRectoHtml(m) {
    const prenom = m.prenom || '';
    const nom    = m.nom    || '';
    const annee  = new Date().getFullYear();
    return `<div style="${_cardBase}">
        ${_cardHeader('CARTE MEMBRE', annee)}
        <div style="flex:1;display:flex;align-items:center;gap:22px;padding:16px 24px;">

            <!-- Logo USM grand (140px) -->
            <div style="flex-shrink:0;">
                <img src="/logo_usm_new.png"
                    style="width:140px;height:140px;object-fit:contain;border-radius:50%;border:3px solid rgba(255,215,0,0.65);display:block;
                           box-shadow:0 0 24px rgba(255,215,0,0.3);"
                    crossorigin="anonymous" alt="USM">
            </div>

            <!-- Données membre -->
            <div style="flex:1;text-align:center;overflow:hidden;">
                <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:1px;margin-bottom:12px;
                    font-family:Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escMember(`${prenom} ${nom}`.toUpperCase())}
                </div>
                ${m.statut && m.statut !== 'Membre'
                    ? `<div style="margin-bottom:10px;"><span style="background:rgba(255,215,0,0.14);border:1px solid rgba(255,215,0,0.5);color:#ffd700;padding:4px 14px;border-radius:20px;font-size:11px;letter-spacing:0.5px;font-family:Arial,sans-serif;">★ ${escMember(m.statut)}</span></div>`
                    : ''}
                ${m.classement
                    ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.4);color:#ffd700;padding:4px 14px;border-radius:20px;font-size:13px;font-family:Arial,sans-serif;">Classement : ${escMember(m.classement)}</span></div>`
                    : ''}
                ${m.categorie
                    ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);color:rgba(255,215,0,0.85);padding:4px 14px;border-radius:20px;font-size:13px;font-family:Arial,sans-serif;">Catégorie : ${escMember(m.categorie)}</span></div>`
                    : ''}
                ${m.licence
                    ? `<div style="margin-top:12px;"><div style="color:rgba(255,255,255,0.45);font-size:9px;letter-spacing:2px;font-family:Arial,sans-serif;">LICENCE FFT</div><div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:3px;font-family:Arial,sans-serif;">${escMember(m.licence)}</div></div>`
                    : ''}
            </div>
        </div>
        ${_cardFooter}
    </div>`;
}

// ── VERSO : sponsors + QR code avec logo USM intégré ───────
function buildVersoHtml(m, sponsors) {
    const annee = new Date().getFullYear();
    const sponsorsWithTitle = (sponsors || []).filter(s => s && s.title);

    const sponsorCards = sponsorsWithTitle.map(s => {
        const logoSrc  = s._logoBase64;
        const initiale = (s.title || '?').charAt(0).toUpperCase();
        const logoHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:48px;height:48px;object-fit:contain;border-radius:7px;background:#fff;padding:3px;border:1px solid rgba(255,215,0,0.3);flex-shrink:0;" alt="${escMember(s.title)}">`
            : `<div style="width:48px;height:48px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.35);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffd700;font-size:18px;font-weight:900;font-family:Arial,sans-serif;">${initiale}</div>`;
        const avantageHtml = s.avantage
            ? `<div style="color:rgba(255,255,255,0.8);font-size:10px;font-family:Arial,sans-serif;line-height:1.4;">${escMember(s.avantage)}</div>`
            : '';
        return `<div style="display:flex;align-items:flex-start;gap:9px;padding:9px;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.15);border-radius:9px;">
            ${logoHtml}
            <div style="flex:1;min-width:0;">
                <div style="color:#ffd700;font-size:11px;font-weight:700;font-family:Arial,sans-serif;margin-bottom:3px;">${escMember(s.title)}</div>
                ${avantageHtml}
            </div>
        </div>`;
    }).join('');

    // QR avec logo USM en surimpression (niveau H = 30% tolérance erreur)
    // Conteneur position:relative pour superposer le logo
    const QR_SIZE = 116;
    const LOGO_SIZE = 28;
    const LOGO_OFFSET = Math.round((QR_SIZE - LOGO_SIZE) / 2);
    const qrSection = `
        <div style="flex-shrink:0;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-left:12px;border-left:1px solid rgba(255,215,0,0.12);">
            <div style="position:relative;width:${QR_SIZE}px;height:${QR_SIZE}px;">
                <div id="card-print-qr-verso" style="width:${QR_SIZE}px;height:${QR_SIZE}px;background:#f5e88a;border-radius:10px;border:2px solid rgba(255,215,0,0.5);overflow:hidden;"></div>
                <!-- Logo USM centré sur le QR -->
                <div style="position:absolute;top:${LOGO_OFFSET}px;left:${LOGO_OFFSET}px;width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;background:#f5e88a;border-radius:50%;padding:2px;box-sizing:border-box;">
                    <img src="/logo_usm_new.png" style="width:100%;height:100%;object-fit:contain;display:block;" crossorigin="anonymous" alt="USM">
                </div>
            </div>
            <div style="color:rgba(255,215,0,0.45);font-size:8px;margin-top:6px;letter-spacing:1px;font-family:Arial,sans-serif;text-align:center;">SCANNER POUR<br>VÉRIFIER</div>
        </div>`;

    return `<div style="${_cardBase}">
        ${_cardHeader('NOS PARTENAIRES', annee)}
        <div style="flex:1;display:flex;align-items:stretch;padding:12px 16px;gap:0;overflow:hidden;">
            <!-- Sponsors -->
            <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start;overflow:hidden;padding-right:12px;">
                ${sponsorCards}
            </div>
            <!-- QR avec logo intégré -->
            ${qrSection}
        </div>
        ${_cardFooter}
    </div>`;
}

// ── CARTE MOBILE : portrait 390×844 — toutes infos + QR ────
function buildMobileCardHtml(m) {
    const prenom = m.prenom || '';
    const nom    = m.nom    || '';
    const annee  = new Date().getFullYear();

    const decorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" style="position:absolute;top:0;left:0;pointer-events:none;">
        <line x1="0" y1="210" x2="390" y2="210" stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <line x1="0" y1="634" x2="390" y2="634" stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <circle cx="195" cy="390" r="210" stroke="rgba(255,215,0,0.04)" stroke-width="1" fill="none"/>
        <circle cx="195" cy="390" r="165" stroke="rgba(255,215,0,0.03)" stroke-width="1" fill="none"/>
        <line x1="0" y1="390" x2="390" y2="390" stroke="rgba(255,215,0,0.03)" stroke-width="1"/>
    </svg>`;

    const QR_SIZE = 148;
    const LOGO_SIZE = 36;
    const LOGO_OFFSET = Math.round((QR_SIZE - LOGO_SIZE) / 2);

    return `
    <div style="
        width:390px; height:844px;
        background:linear-gradient(175deg, #0a1220 0%, #0d1b2e 30%, #112240 60%, #0a1628 100%);
        position:relative; overflow:hidden; font-family:Arial,sans-serif;
        display:flex; flex-direction:column; align-items:center;
        box-sizing:border-box; padding:0 28px 28px;
    ">
        ${decorSvg}

        <!-- HEADER -->
        <div style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:32px 0 20px; z-index:2; position:relative; border-bottom:1px solid rgba(255,215,0,0.1); margin-bottom:0;">
            <img src="/logo_usm_new.png" style="width:32px;height:32px;object-fit:contain;" crossorigin="anonymous" alt="USM">
            <div style="text-align:center;">
                <div style="color:rgba(255,215,0,0.75);font-size:9px;letter-spacing:4px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
                <div style="color:rgba(255,255,255,0.3);font-size:8px;letter-spacing:2px;font-family:Arial,sans-serif;margin-top:2px;">CARTE MEMBRE · SAISON ${annee}</div>
            </div>
            <img src="/Logo_F%C3%A9d%C3%A9ration_Fran%C3%A7aise_de_Tennis.png" style="width:32px;height:32px;object-fit:contain;opacity:0.7;" crossorigin="anonymous" alt="FFT">
        </div>

        <!-- LOGO CENTRAL -->
        <div style="position:relative;z-index:2;text-align:center;margin-top:28px;margin-bottom:18px;">
            <div style="
                width:128px;height:128px;border-radius:50%;
                background:radial-gradient(circle,rgba(255,215,0,0.14) 0%,rgba(255,215,0,0.04) 60%,transparent 100%);
                display:flex;align-items:center;justify-content:center;margin:0 auto;
                box-shadow:0 0 40px rgba(255,215,0,0.25), 0 0 80px rgba(255,215,0,0.1);
                border:1px solid rgba(255,215,0,0.28);
            ">
                <img src="/logo_usm_new.png" crossorigin="anonymous"
                    style="width:104px;height:104px;object-fit:contain;filter:drop-shadow(0 0 14px rgba(255,215,0,0.85)) drop-shadow(0 0 28px rgba(255,215,0,0.4));"
                    alt="USM">
            </div>
        </div>

        <!-- SÉPARATEUR OR -->
        <div style="position:relative;z-index:2;display:flex;align-items:center;gap:10px;width:210px;margin-bottom:16px;">
            <div style="flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.55));"></div>
            <div style="color:#ffd700;font-size:10px;">★</div>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,0,0.55),transparent);"></div>
        </div>

        <!-- NOM PRÉNOM -->
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:10px;">
            <div style="color:#ffffff;font-size:21px;font-weight:900;letter-spacing:2px;font-family:Arial,sans-serif;text-shadow:0 0 20px rgba(255,255,255,0.15);">
                ${escMember(`${prenom} ${nom}`.toUpperCase())}
            </div>
        </div>

        <!-- STATUT (si pas Membre simple) -->
        ${m.statut && m.statut !== 'Membre' ? `
        <div style="position:relative;z-index:2;margin-bottom:10px;">
            <span style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.45);color:#ffd700;padding:5px 16px;border-radius:20px;font-size:11px;letter-spacing:0.5px;font-family:Arial,sans-serif;">★ ${escMember(m.statut)}</span>
        </div>` : ''}

        <!-- CLASSEMENT + CATÉGORIE -->
        <div style="position:relative;z-index:2;display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:center;">
            ${m.classement ? `<span style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);color:rgba(255,215,0,0.85);padding:4px 14px;border-radius:20px;font-size:12px;font-family:Arial,sans-serif;">Cl. ${escMember(m.classement)}</span>` : ''}
            ${m.categorie  ? `<span style="background:rgba(0,210,255,0.07);border:1px solid rgba(0,210,255,0.25);color:rgba(0,210,255,0.8);padding:4px 14px;border-radius:20px;font-size:12px;font-family:Arial,sans-serif;">${escMember(m.categorie)}</span>` : ''}
        </div>

        <!-- LICENCE FFT -->
        ${m.licence ? `
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:20px;">
            <div style="color:rgba(255,215,0,0.45);font-size:9px;letter-spacing:3px;font-family:Arial,sans-serif;margin-bottom:4px;">LICENCE FFT</div>
            <div style="color:#ffd700;font-size:20px;font-weight:700;letter-spacing:4px;font-family:Arial,sans-serif;text-shadow:0 0 12px rgba(255,215,0,0.5);">${escMember(m.licence)}</div>
        </div>` : `<div style="margin-bottom:20px;"></div>`}

        <!-- QR CODE avec logo USM intégré -->
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;">
            <div style="position:relative;width:${QR_SIZE}px;height:${QR_SIZE}px;">
                <div id="card-mobile-qr" style="width:${QR_SIZE}px;height:${QR_SIZE}px;background:#f5e88a;border-radius:12px;border:2px solid rgba(255,215,0,0.5);overflow:hidden;"></div>
                <div style="position:absolute;top:${LOGO_OFFSET}px;left:${LOGO_OFFSET}px;width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;background:#f5e88a;border-radius:50%;padding:2px;box-sizing:border-box;">
                    <img src="/logo_usm_new.png" style="width:100%;height:100%;object-fit:contain;display:block;" crossorigin="anonymous" alt="USM">
                </div>
            </div>
            <div style="color:rgba(255,215,0,0.35);font-size:8px;margin-top:7px;letter-spacing:1.5px;font-family:Arial,sans-serif;text-align:center;">SCANNER POUR VÉRIFIER</div>
        </div>

        <!-- BAS : site + saison -->
        <div style="position:absolute;bottom:26px;left:0;right:0;text-align:center;z-index:2;">
            <div style="color:rgba(255,215,0,0.2);font-size:8px;letter-spacing:1.5px;font-family:Arial,sans-serif;">tennismontargis.fr</div>
        </div>
    </div>`;
}

window.downloadMemberCardMobile = async function() {
    if (!_cardMemberData || typeof html2canvas === 'undefined') return;
    const el = document.getElementById('member-card-mobile-print');
    if (!el) return;

    el.innerHTML = buildMobileCardHtml(_cardMemberData);
    el.style.display = 'block';

    // QR code avec logo USM intégré
    const qrContainer = el.querySelector('#card-mobile-qr');
    if (qrContainer && typeof QRCode !== 'undefined') {
        const memberUid = (_cardMemberData && _cardMemberData._uid)
            || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '');
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${_cardMemberData.prenom || ''} ${_cardMemberData.nom || ''}`;
        new QRCode(qrContainer, {
            text: qrContent,
            width: 148,
            height: 148,
            colorDark: '#0d1b2e',
            colorLight: '#f5e88a',
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
    await _captureAndDownload(el, `carte-mobile-usm-${nomFichier}.png`, 400);
};

// --- Utilitaire échappement HTML ---
function escMember(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===== MESSAGES CLUB =====

function loadClubMessages() {
    var list = document.getElementById('member-messages-list');
    if (!list) return;
    list.innerHTML = Array(3).fill('<div class="member-skeleton-card" style="margin-bottom:10px;"><div class="skeleton-line medium" style="margin-bottom:10px;"></div><div class="skeleton-line full"></div><div class="skeleton-line full"></div></div>').join('');

    window.db_ref.ref('club_messages').orderByChild('createdAt').once('value', function(snap) {
        var val = snap.val();
        if (!val) {
            list.innerHTML = '<div class="member-empty-state"><i class="fas fa-comment-slash"></i><p>Aucun message pour l\'instant.</p></div>';
            return;
        }
        // Trier: urgents d'abord, puis par date décroissante
        var msgs = Object.entries(val)
            .map(function(e) { return Object.assign({ _id: e[0] }, e[1]); })
            .filter(function(m) { return m.actif !== false; })
            .sort(function(a, b) {
                if (a.type === 'urgent' && b.type !== 'urgent') return -1;
                if (a.type !== 'urgent' && b.type === 'urgent') return 1;
                return (b.createdAt || 0) - (a.createdAt || 0);
            });

        if (!msgs.length) {
            list.innerHTML = '<div class="member-empty-state"><i class="fas fa-comment-slash"></i><p>Aucun message pour l\'instant.</p></div>';
            return;
        }

        var typeLabels = { info: 'Information', warning: 'Avertissement', urgent: 'Urgent' };
        var typeIcons  = { info: 'fa-info-circle', warning: 'fa-exclamation-triangle', urgent: 'fa-exclamation-circle' };

        list.innerHTML = msgs.map(function(m) {
            var type = m.type || 'info';
            var badgeClass = type === 'info' ? '' : type;
            return '<div class="club-message-card ' + (type !== 'info' ? type : '') + '">' +
                '<div class="club-message-card-header">' +
                    '<span class="club-message-badge ' + badgeClass + '">' +
                        '<i class="fas ' + (typeIcons[type] || 'fa-info-circle') + '"></i> ' +
                        (typeLabels[type] || 'Info') +
                    '</span>' +
                    '<span class="club-message-title">' + escMember(m.titre) + '</span>' +
                    '<span class="club-message-date">' + escMember(m.date || '') + '</span>' +
                '</div>' +
                '<div class="club-message-body">' + escMember(m.contenu) + '</div>' +
            '</div>';
        }).join('');
    });
}

// Affiche le badge rouge si des messages existent (appelé au chargement)
function checkClubMessagesBadge() {
    var seenAt = parseInt(localStorage.getItem('usm_infos_seen_at') || '0', 10);
    window.db_ref.ref('club_messages').orderByChild('createdAt').limitToLast(1).once('value', function(snap) {
        if (!snap.exists()) return;
        // Récupérer le createdAt du message le plus récent
        var latestCreatedAt = 0;
        snap.forEach(function(child) {
            var m = child.val();
            if (m.actif !== false && m.createdAt > latestCreatedAt) {
                latestCreatedAt = m.createdAt;
            }
        });
        // Afficher le badge seulement si le dernier message est plus récent que la dernière lecture
        if (latestCreatedAt > seenAt) {
            var badge = document.getElementById('infos-badge');
            if (badge) badge.style.display = 'block';
        }
    });
}

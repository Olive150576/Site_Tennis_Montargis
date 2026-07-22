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

// --- Édition coordonnées (email / téléphone / classement) ---
window.toggleProfilEdit = function(show) {
    var emailInput = document.getElementById('mp-email-input');
    if (!emailInput) return;
    var editing = show !== undefined ? show : emailInput.style.display === 'none';

    ['email', 'telephone', 'classement'].forEach(function(field) {
        var valueEl = document.getElementById('mp-' + field);
        var inputEl = document.getElementById('mp-' + field + '-input');
        if (!valueEl || !inputEl) return;
        valueEl.style.display = editing ? 'none' : '';
        inputEl.style.display = editing ? 'block' : 'none';
    });

    if (editing && _cardMemberData) {
        document.getElementById('mp-email-input').value = _cardMemberData.email || '';
        document.getElementById('mp-telephone-input').value = _cardMemberData.telephone || '';
        var sel = document.getElementById('mp-classement-input');
        if (sel && !sel.options.length) {
            sel.innerHTML = '<option value="">—</option>' + _CLASSEMENTS_FFT.map(function(c) {
                return '<option value="' + c + '">' + c + '</option>';
            }).join('');
        }
        if (sel) sel.value = _cardMemberData.classement || '';
    }

    var actions = document.getElementById('mp-edit-actions');
    if (actions) actions.style.display = editing ? 'flex' : 'none';
    var btn = document.getElementById('mp-edit-toggle-btn');
    if (btn) btn.style.display = editing ? 'none' : 'inline-flex';
    var status = document.getElementById('mp-save-status');
    if (status) status.textContent = '';
};

window.saveProfilCoordonnees = function() {
    if (!window.auth.currentUser || !_cardMemberData) return;
    var targetUid = _cardMemberData._uid || window.auth.currentUser.uid;
    var status = document.getElementById('mp-save-status');
    var setStatus = function(msg, ok) {
        if (!status) return;
        status.textContent = msg;
        status.style.color = ok ? '#4ade80' : '#f87171';
    };

    var email = (document.getElementById('mp-email-input').value || '').trim();
    var telephone = (document.getElementById('mp-telephone-input').value || '').trim();
    var classement = document.getElementById('mp-classement-input').value || '';

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus('Adresse email invalide.', false);
        return;
    }
    if (telephone && !/^[0-9+ .()-]{6,20}$/.test(telephone)) {
        setStatus('Numéro de téléphone invalide.', false);
        return;
    }

    var classementChanged = classement !== (_cardMemberData.classement || '');
    var previousClassement = _cardMemberData.classement || '';

    // On n'envoie que les champs réellement modifiés : un ancien format
    // (créé côté admin, non filtré par ces nouvelles règles) resoumis sans
    // changement ne doit pas faire échouer la validation des autres champs.
    var updates = {};
    if (email !== (_cardMemberData.email || '')) updates.email = email;
    if (telephone !== (_cardMemberData.telephone || '')) updates.telephone = telephone;
    if (classementChanged) updates.classement = classement;

    if (!Object.keys(updates).length) {
        window.toggleProfilEdit(false);
        return;
    }

    var btn = document.getElementById('mp-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'; }

    window.db_ref.ref('members/' + targetUid).update(updates).then(function() {
        // Trace l'historique quand un membre modifie lui-même son classement
        // (le classement conditionne l'éligibilité aux équipes de championnat)
        if (classementChanged && !_cardMemberData._isStaff) {
            window.db_ref.ref('members/' + targetUid + '/classementHistory').push({
                from: previousClassement,
                to: classement,
                at: firebase.database.ServerValue.TIMESTAMP
            });
        }

        _cardMemberData.email = email;
        _cardMemberData.telephone = telephone;
        _cardMemberData.classement = classement;

        var setTxt = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        setTxt('mp-email', email);
        setTxt('mp-telephone', telephone);
        setTxt('mp-classement', classement);
        setTxt('vip-card-classement', classement);

        window.toggleProfilEdit(false);
        setStatus('Coordonnées mises à jour ✓', true);
    }).catch(function(err) {
        window.showErrorMessage && window.showErrorMessage(err, 'profil');
        setStatus('Erreur lors de l\'enregistrement.', false);
    }).finally(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; }
    });
};

window.initMemberDashboard = function(memberData) {
    _cardMemberData = memberData;

    // Photo de profil sauvegardée
    if (memberData.photoURL) window.setMemberAvatar(memberData.photoURL);
    // Mode gestion (admin ou coach) : bandeau + photo modifiable pour le membre cible
    if (memberData._isStaff) {
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
                '<div style="color:#ffd700;font-weight:700;font-size:0.88rem;">Mode gestion</div>' +
                '<div style="color:rgba(255,215,0,0.65);font-size:0.78rem;margin-top:1px;">Vous éditez le profil de <strong style="color:rgba(255,215,0,0.9);">' +
                (memberData.prenom || '') + ' ' + (memberData.nom || '') +
                '</strong>. Toutes les modifications sont enregistrées directement.</div>' +
                '</div>' +
                '<a href="/admin-panel.html" style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.35);color:#ffd700;padding:7px 14px;border-radius:8px;font-size:0.8rem;text-decoration:none;white-space:nowrap;display:flex;align-items:center;gap:6px;">' +
                '<i class="fas fa-arrow-left"></i> Retour au panneau' +
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
    loadMemberSponsors();
    loadPartenaireProfile();
    checkClubMessagesBadge();
    var _uid = memberData._uid;
    if (_uid) checkEquipesBadge(_uid);
};

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
        _updatePartenaireEtat(!!p.public_profile);
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

// État du panneau « Mon profil partenaire » : replié si déjà visible dans l'annuaire, ouvert sinon
function _updatePartenaireEtat(optinActif) {
    var details = document.getElementById('partenaire-profil-details');
    var badge = document.getElementById('partenaire-etat-badge');
    if (details) details.open = !optinActif;
    if (badge) badge.innerHTML = optinActif
        ? '<span style="color:#22c55e;"><i class="fas fa-check-circle"></i> Visible dans l\'annuaire</span>'
        : '<span style="color:#f59e0b;">Non visible — activez pour accéder à l\'annuaire</span>';
}

window.ouvrirProfilPartenaire = function() {
    var details = document.getElementById('partenaire-profil-details');
    if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// --- Annuaire partenaires : sauvegarde ---
window.savePartenaireProfile = async function() {
    if (!_cardMemberData || !_cardMemberData._uid) return;
    var uid = _cardMemberData._uid;
    var btn    = document.getElementById('partenaire-save-btn');
    var status = document.getElementById('partenaire-save-status');
    var optin  = document.getElementById('partenaire-optin');
    var checked = optin ? optin.checked : false;

    // Garde-fou : visible dans l'annuaire mais aucun moyen de contact coché (oubli fréquent)
    if (checked) {
        var telBox   = document.getElementById('partenaire-share-tel');
        var emailBox = document.getElementById('partenaire-share-email');
        if (!(telBox && telBox.checked) && !(emailBox && emailBox.checked) && window.confirmDialog) {
            var choix = await window.confirmDialog.checklist({
                title: 'Comment vous contacter ?',
                message: "Vous n'avez coché aucun moyen de contact — les autres membres ne pourront pas vous joindre depuis l'annuaire. Cochez au moins une option, ou annulez pour revenir en arrière.",
                type: 'warning',
                confirmText: 'Enregistrer',
                cancelText: 'Annuler',
                items: [
                    { id: 'tel', label: 'Téléphone', checked: false },
                    { id: 'email', label: 'Email', checked: false }
                ]
            });
            if (!choix) return;
            if (telBox) telBox.checked = choix.tel;
            if (emailBox) emailBox.checked = choix.email;
        }
    }

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
        // Mettre à jour le badge d'état (le panneau reste ouvert le temps de lire la confirmation)
        var badge = document.getElementById('partenaire-etat-badge');
        if (badge) badge.innerHTML = checked
            ? '<span style="color:#22c55e;"><i class="fas fa-check-circle"></i> Visible dans l\'annuaire</span>'
            : '<span style="color:#f59e0b;">Non visible — activez pour accéder à l\'annuaire</span>';
        // Rafraîchir l'annuaire (même onglet désormais)
        _annuaireLoaded = false;
        loadAnnuairePartenaires();
    }).catch(function(err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer mes préférences'; }
        if (status) status.innerHTML = '<span style="color:#ef4444;">Erreur : ' + err.message + '</span>';
    });
};

// --- Aide de l'espace membre ---
window.showMemberHelp = function() {
    var m = document.getElementById('member-help-modal');
    if (m) m.style.display = 'block';
};
window.closeMemberHelp = function() {
    var m = document.getElementById('member-help-modal');
    if (m) m.style.display = 'none';
};

// --- Navigation onglets ---
var _annuaireLoaded = false;
var _calendrierLoaded = false;
window.switchMemberTab = function(tab) {
    ['profil', 'partenaires', 'calendrier', 'equipes'].forEach(t => {
        const content = document.getElementById(`mtab-${t}`);
        const btn = document.getElementById(`mtab-btn-${t}`);
        if (content) content.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'partenaires' && !_annuaireLoaded) {
        _annuaireLoaded = true;
        loadAnnuairePartenaires();
    }
    if (tab === 'calendrier' && !_calendrierLoaded) {
        _calendrierLoaded = true;
        loadClubMessages();
        loadCalendrierMember();
        // Mémoriser la date de lecture des messages dans localStorage
        localStorage.setItem('usm_infos_seen_at', String(Date.now()));
        var badge = document.getElementById('infos-badge');
        if (badge) badge.style.display = 'none';
    }
    if (tab === 'equipes' && !_equipesLoaded) {
        _equipesLoaded = true;
        var uid = _cardMemberData ? _cardMemberData._uid : null;
        if (uid) {
            loadEquipesMember(uid);
            if (window.initMemberPushBtn) window.initMemberPushBtn(uid);
        }
        // Masquer le badge
        var badge = document.getElementById('equipes-badge');
        if (badge) badge.style.display = 'none';
        localStorage.setItem('usm_equipes_seen_at', String(Date.now()));
    }
};

// --- Annuaire partenaires : chargement et affichage ---
var _partenaireAllData = [];
var _partenaireFilters = { matin: false, midi: false, soir: false };

function loadAnnuairePartenaires() {
    var grid = document.getElementById('partenaire-results');
    if (!grid) return;
    grid.innerHTML = Array(4).fill('<div class="member-skeleton-card" style="display:flex; gap:12px; align-items:flex-start;"><div class="skeleton-avatar"></div><div style="flex:1;"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div><div class="skeleton-line full"></div></div></div>').join('');

    var myUid = _cardMemberData ? _cardMemberData._uid : null;
    if (!myUid) { grid.innerHTML = ''; return; }

    window.db_ref.ref('members/' + myUid + '/partenaire/public_profile').once('value', function(optinSnap) {
        if (!optinSnap.val()) {
            grid.innerHTML = '<div class="member-empty-state" style="padding:32px 16px; text-align:center;">'
                + '<i class="fas fa-lock" style="font-size:2rem; color:#64748b; margin-bottom:12px; display:block;"></i>'
                + '<p style="color:#e2e8f0; font-weight:600; margin-bottom:8px;">Accès restreint</p>'
                + '<p style="color:#94a3b8; font-size:0.88rem; margin-bottom:20px;">Pour consulter et contacter les partenaires de jeu, activez d\'abord <strong style="color:#e3ff00;">« Apparaître dans l\'annuaire »</strong> dans le bloc « Mon profil partenaire » ci-dessus.</p>'
                + '<button onclick="window.ouvrirProfilPartenaire()" style="background:#e3ff00; color:#020617; border:none; border-radius:8px; padding:10px 20px; font-weight:700; cursor:pointer; font-size:0.9rem;">'
                + '<i class="fas fa-user-edit"></i> Activer mon profil partenaire</button>'
                + '</div>';
            return;
        }
        _loadAnnuaireData(grid);
    });
}

function _loadAnnuaireData(grid) {
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
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isPWA || isIOS) { showDownloadOverlay(dataUrl); return; }

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

// ── Court de tennis filaire — Portrait (mobile 390×844) ──────
function _buildCourtSvgPortrait(W, H) {
    var op = 0.5, sw = 1.5;
    var scale = W / 10.97;
    var cH    = 23.77 * scale;
    var offY  = (H - cH) / 2;
    var L = 0, R = W, T = offY, B = offY + cH;
    var netY  = (T + B) / 2;
    var svcT  = T + 6.4 * scale;
    var svcB  = B - 6.4 * scale;
    var singL = 1.37 * scale;
    var singR = W - 1.37 * scale;
    var midX  = W / 2;
    var f  = function(n) { return n.toFixed(1); };
    var gold = function(a) { return 'rgba(255,215,0,' + Math.min(1, op * a).toFixed(3) + ')'; };
    var cyan = function(a) { return 'rgba(0,210,255,' + Math.min(1, op * a).toFixed(3) + ')'; };
    var rs = 20, arcR = 38, mk = 7;

    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="position:absolute;top:0;left:0;pointer-events:none;">'
        + '<defs>'
        + '<radialGradient id="pg-net" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00d2ff" stop-opacity="0.08"/><stop offset="100%" stop-color="#00d2ff" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="pg-top" cx="50%" cy="0%" r="70%"><stop offset="0%" stop-color="#ffd700" stop-opacity="0.06"/><stop offset="100%" stop-color="#ffd700" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="pg-bot" cx="50%" cy="100%" r="70%"><stop offset="0%" stop-color="#ffd700" stop-opacity="0.06"/><stop offset="100%" stop-color="#ffd700" stop-opacity="0"/></radialGradient>'
        + '</defs>'
        + '<ellipse cx="' + midX + '" cy="' + f(netY) + '" rx="210" ry="210" fill="url(#pg-net)"/>'
        + '<rect width="' + W + '" height="220" fill="url(#pg-top)"/>'
        + '<rect y="' + (H - 220) + '" width="' + W + '" height="220" fill="url(#pg-bot)"/>'
        // Cadre extérieur (doubles)
        + '<rect x="' + L + '" y="' + f(T) + '" width="' + W + '" height="' + f(cH) + '" fill="none" stroke="' + gold(1) + '" stroke-width="' + sw + '"/>'
        // Sidelines simples
        + '<line x1="' + f(singL) + '" y1="' + f(T) + '" x2="' + f(singL) + '" y2="' + f(B) + '" stroke="' + cyan(0.8) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(singR) + '" y1="' + f(T) + '" x2="' + f(singR) + '" y2="' + f(B) + '" stroke="' + cyan(0.8) + '" stroke-width="' + sw + '"/>'
        // Filet
        + '<line x1="' + L + '" y1="' + f(netY) + '" x2="' + R + '" y2="' + f(netY) + '" stroke="' + gold(1.5) + '" stroke-width="' + (sw * 1.5).toFixed(2) + '"/>'
        // Lignes de service
        + '<line x1="' + f(singL) + '" y1="' + f(svcT) + '" x2="' + f(singR) + '" y2="' + f(svcT) + '" stroke="' + cyan(0.85) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(singL) + '" y1="' + f(svcB) + '" x2="' + f(singR) + '" y2="' + f(svcB) + '" stroke="' + cyan(0.85) + '" stroke-width="' + sw + '"/>'
        // Ligne centrale service
        + '<line x1="' + midX + '" y1="' + f(svcT) + '" x2="' + midX + '" y2="' + f(svcB) + '" stroke="' + cyan(0.65) + '" stroke-width="' + sw + '"/>'
        // Marques centrales baselines + filet
        + '<line x1="' + (midX - mk) + '" y1="' + f(T) + '" x2="' + (midX + mk) + '" y2="' + f(T) + '" stroke="' + gold(0.9) + '" stroke-width="' + (sw * 1.1).toFixed(2) + '"/>'
        + '<line x1="' + (midX - mk) + '" y1="' + f(B) + '" x2="' + (midX + mk) + '" y2="' + f(B) + '" stroke="' + gold(0.9) + '" stroke-width="' + (sw * 1.1).toFixed(2) + '"/>'
        + '<line x1="' + (midX - mk) + '" y1="' + f(netY) + '" x2="' + (midX + mk) + '" y2="' + f(netY) + '" stroke="' + gold(0.7) + '" stroke-width="' + sw + '"/>'
        // Poteaux filet
        + '<circle cx="' + L + '" cy="' + f(netY) + '" r="4" fill="none" stroke="' + gold(1.3) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        + '<circle cx="' + R + '" cy="' + f(netY) + '" r="4" fill="none" stroke="' + gold(1.3) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        // Cercles concentriques autour du filet
        + '<circle cx="' + midX + '" cy="' + f(netY) + '" r="75"  fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<circle cx="' + midX + '" cy="' + f(netY) + '" r="135" fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<circle cx="' + midX + '" cy="' + f(netY) + '" r="195" fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        // Réticules aux 4 coins
        + '<line x1="' + L + '" y1="' + f(T + 5) + '" x2="' + L + '" y2="' + f(T + rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(L + 5) + '" y1="' + f(T) + '" x2="' + f(L + rs) + '" y2="' + f(T) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + L + '" cy="' + f(T) + '" r="9" fill="none" stroke="' + gold(0.8) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + R + '" y1="' + f(T + 5) + '" x2="' + R + '" y2="' + f(T + rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(R - 5) + '" y1="' + f(T) + '" x2="' + f(R - rs) + '" y2="' + f(T) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + R + '" cy="' + f(T) + '" r="9" fill="none" stroke="' + gold(0.8) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + L + '" y1="' + f(B - 5) + '" x2="' + L + '" y2="' + f(B - rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(L + 5) + '" y1="' + f(B) + '" x2="' + f(L + rs) + '" y2="' + f(B) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + L + '" cy="' + f(B) + '" r="9" fill="none" stroke="' + gold(0.8) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + R + '" y1="' + f(B - 5) + '" x2="' + R + '" y2="' + f(B - rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(R - 5) + '" y1="' + f(B) + '" x2="' + f(R - rs) + '" y2="' + f(B) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + R + '" cy="' + f(B) + '" r="9" fill="none" stroke="' + gold(0.8) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        // Arcs aux coins du terrain
        + '<path d="M ' + L + ' ' + f(T + arcR) + ' A ' + arcR + ' ' + arcR + ' 0 0 1 ' + arcR + ' ' + f(T) + '" fill="none" stroke="' + gold(0.5) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + f(R - arcR) + ' ' + f(T) + ' A ' + arcR + ' ' + arcR + ' 0 0 1 ' + R + ' ' + f(T + arcR) + '" fill="none" stroke="' + gold(0.5) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + L + ' ' + f(B - arcR) + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + arcR + ' ' + f(B) + '" fill="none" stroke="' + gold(0.5) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + f(R - arcR) + ' ' + f(B) + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + R + ' ' + f(B - arcR) + '" fill="none" stroke="' + gold(0.5) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '</svg>';
    return s;
}

// ── Court de tennis filaire — Paysage (bureau 1280×720) ───────
function _buildCourtSvgLandscape(W, H) {
    var op = 0.5, sw = 1.5;
    var scale = (H * 0.86) / 10.97;
    var cW = 23.77 * scale, cH = 10.97 * scale;
    var offX = (W - cW) / 2, offY = (H - cH) / 2;
    var L = offX, R = offX + cW, T = offY, B = offY + cH;
    var netX  = (L + R) / 2;
    var svcL  = L + 6.4 * scale;
    var svcR  = R - 6.4 * scale;
    var singT = T + 1.37 * scale;
    var singB = B - 1.37 * scale;
    var midY  = (T + B) / 2;
    var f  = function(n) { return n.toFixed(1); };
    var gold = function(a) { return 'rgba(255,215,0,' + Math.min(1, op * a).toFixed(3) + ')'; };
    var cyan = function(a) { return 'rgba(0,210,255,' + Math.min(1, op * a).toFixed(3) + ')'; };
    var rs = 22, arcR = 45, mk = 8, cf = 55;

    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="position:absolute;top:0;left:0;pointer-events:none;">'
        + '<defs>'
        + '<radialGradient id="dg-net" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00d2ff" stop-opacity="0.08"/><stop offset="100%" stop-color="#00d2ff" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="dg-tl" cx="0%" cy="0%" r="50%"><stop offset="0%" stop-color="#ffd700" stop-opacity="0.06"/><stop offset="100%" stop-color="#ffd700" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="dg-br" cx="100%" cy="100%" r="50%"><stop offset="0%" stop-color="#ffd700" stop-opacity="0.06"/><stop offset="100%" stop-color="#ffd700" stop-opacity="0"/></radialGradient>'
        + '</defs>'
        + '<ellipse cx="' + f(netX) + '" cy="' + f(midY) + '" rx="300" ry="300" fill="url(#dg-net)"/>'
        + '<rect width="' + W + '" height="' + H + '" fill="url(#dg-tl)"/>'
        + '<rect width="' + W + '" height="' + H + '" fill="url(#dg-br)"/>'
        // Cadre extérieur
        + '<rect x="' + f(L) + '" y="' + f(T) + '" width="' + f(cW) + '" height="' + f(cH) + '" fill="none" stroke="' + gold(1) + '" stroke-width="' + sw + '"/>'
        // Singles sidelines
        + '<line x1="' + f(L) + '" y1="' + f(singT) + '" x2="' + f(R) + '" y2="' + f(singT) + '" stroke="' + cyan(0.8) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(L) + '" y1="' + f(singB) + '" x2="' + f(R) + '" y2="' + f(singB) + '" stroke="' + cyan(0.8) + '" stroke-width="' + sw + '"/>'
        // Filet
        + '<line x1="' + f(netX) + '" y1="' + f(T) + '" x2="' + f(netX) + '" y2="' + f(B) + '" stroke="' + gold(1.5) + '" stroke-width="' + (sw * 1.5).toFixed(2) + '"/>'
        // Lignes de service
        + '<line x1="' + f(svcL) + '" y1="' + f(singT) + '" x2="' + f(svcL) + '" y2="' + f(singB) + '" stroke="' + cyan(0.85) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(svcR) + '" y1="' + f(singT) + '" x2="' + f(svcR) + '" y2="' + f(singB) + '" stroke="' + cyan(0.85) + '" stroke-width="' + sw + '"/>'
        // Ligne centrale service
        + '<line x1="' + f(svcL) + '" y1="' + f(midY) + '" x2="' + f(svcR) + '" y2="' + f(midY) + '" stroke="' + cyan(0.65) + '" stroke-width="' + sw + '"/>'
        // Marques centrales
        + '<line x1="' + f(L) + '" y1="' + f(midY - mk) + '" x2="' + f(L) + '" y2="' + f(midY + mk) + '" stroke="' + gold(0.9) + '" stroke-width="' + (sw * 1.1).toFixed(2) + '"/>'
        + '<line x1="' + f(R) + '" y1="' + f(midY - mk) + '" x2="' + f(R) + '" y2="' + f(midY + mk) + '" stroke="' + gold(0.9) + '" stroke-width="' + (sw * 1.1).toFixed(2) + '"/>'
        + '<line x1="' + f(netX - mk) + '" y1="' + f(midY) + '" x2="' + f(netX + mk) + '" y2="' + f(midY) + '" stroke="' + gold(0.7) + '" stroke-width="' + sw + '"/>'
        // Poteaux filet
        + '<circle cx="' + f(netX) + '" cy="' + f(T) + '" r="5" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        + '<circle cx="' + f(netX) + '" cy="' + f(B) + '" r="5" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        // Cercles concentriques
        + '<circle cx="' + f(netX) + '" cy="' + f(midY) + '" r="90"  fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<circle cx="' + f(netX) + '" cy="' + f(midY) + '" r="160" fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<circle cx="' + f(netX) + '" cy="' + f(midY) + '" r="235" fill="none" stroke="' + cyan(0.35) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        // Réticules aux 4 coins du terrain
        + '<line x1="' + f(L) + '" y1="' + f(T + 5) + '" x2="' + f(L) + '" y2="' + f(T + rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(L + 5) + '" y1="' + f(T) + '" x2="' + f(L + rs) + '" y2="' + f(T) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + f(L) + '" cy="' + f(T) + '" r="10" fill="none" stroke="' + gold(0.7) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + f(R) + '" y1="' + f(T + 5) + '" x2="' + f(R) + '" y2="' + f(T + rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(R - 5) + '" y1="' + f(T) + '" x2="' + f(R - rs) + '" y2="' + f(T) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + f(R) + '" cy="' + f(T) + '" r="10" fill="none" stroke="' + gold(0.7) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + f(L) + '" y1="' + f(B - 5) + '" x2="' + f(L) + '" y2="' + f(B - rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(L + 5) + '" y1="' + f(B) + '" x2="' + f(L + rs) + '" y2="' + f(B) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + f(L) + '" cy="' + f(B) + '" r="10" fill="none" stroke="' + gold(0.7) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        + '<line x1="' + f(R) + '" y1="' + f(B - 5) + '" x2="' + f(R) + '" y2="' + f(B - rs) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<line x1="' + f(R - 5) + '" y1="' + f(B) + '" x2="' + f(R - rs) + '" y2="' + f(B) + '" stroke="' + gold(1.1) + '" stroke-width="' + sw + '"/>'
        + '<circle cx="' + f(R) + '" cy="' + f(B) + '" r="10" fill="none" stroke="' + gold(0.7) + '" stroke-width="' + (sw * 0.7).toFixed(2) + '"/>'
        // Cadres d'angle aux coins du canvas
        + '<polyline points="' + cf + ',0 0,0 0,' + cf + '" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        + '<polyline points="' + (W - cf) + ',0 ' + W + ',0 ' + W + ',' + cf + '" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        + '<polyline points="' + cf + ',' + H + ' 0,' + H + ' 0,' + (H - cf) + '" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        + '<polyline points="' + (W - cf) + ',' + H + ' ' + W + ',' + H + ' ' + W + ',' + (H - cf) + '" fill="none" stroke="' + gold(1.2) + '" stroke-width="' + (sw * 1.3).toFixed(2) + '"/>'
        // Arcs aux coins du terrain
        + '<path d="M ' + f(L) + ' ' + f(T + arcR) + ' A ' + arcR + ' ' + arcR + ' 0 0 1 ' + f(L + arcR) + ' ' + f(T) + '" fill="none" stroke="' + gold(0.45) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + f(R - arcR) + ' ' + f(T) + ' A ' + arcR + ' ' + arcR + ' 0 0 1 ' + f(R) + ' ' + f(T + arcR) + '" fill="none" stroke="' + gold(0.45) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + f(L) + ' ' + f(B - arcR) + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + f(L + arcR) + ' ' + f(B) + '" fill="none" stroke="' + gold(0.45) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '<path d="M ' + f(R - arcR) + ' ' + f(B) + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + f(R) + ' ' + f(B - arcR) + '" fill="none" stroke="' + gold(0.45) + '" stroke-width="' + (sw * 0.8).toFixed(2) + '"/>'
        + '</svg>';
    return s;
}

function buildWallpaperHtml(m) {
    const prenom = m.prenom || '';
    const nom = m.nom || '';
    const annee = new Date().getFullYear();

    const decorSvg = _buildCourtSvgPortrait(390, 844);

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
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isPWA || isIOS) { showDownloadOverlay(dataUrl); return; }

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

    const decorSvg = _buildCourtSvgLandscape(W, H);

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
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isPWA || isIOS) { showDownloadOverlay(dataUrl); resolve(); return; }
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

// ── PDF : recto + verso au format carte bancaire (85.6×54 mm) ──
window.downloadMemberCardPDF = async function(btnEl) {
    // Feedback visuel sur le bouton
    const btn = btnEl || document.querySelector('[onclick*="downloadMemberCardPDF"]');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération…'; }
    const restore = () => { if (btn) { btn.disabled = false; btn.innerHTML = origHtml; } };

    if (!_cardMemberData) { restore(); alert('Données membre non disponibles. Rechargez la page.'); return; }
    if (typeof html2canvas === 'undefined') { restore(); alert('Composant non chargé. Rechargez la page.'); return; }

    // Chargement dynamique de jsPDF si pas encore disponible
    if (!window.jspdf && !window.jsPDF) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Impossible de charger jsPDF'));
            document.head.appendChild(s);
        }).catch(e => { restore(); alert(e.message); return; });
    }
    const jspdfLib = window.jspdf || window.jsPDF;
    if (!jspdfLib) { restore(); alert('jsPDF non chargé. Rechargez la page et réessayez.'); return; }
    const jsPDFClass = jspdfLib.jsPDF || jspdfLib;

    const el = document.getElementById('member-card-print');
    if (!el) { restore(); return; }

    try {
    // 1. Capture recto
    el.innerHTML = buildRectoHtml(_cardMemberData);
    el.style.left = '-9999px';
    el.style.display = 'block';
    await new Promise(r => setTimeout(r, 200));
    const rectoCanvas = await html2canvas(el, { scale: 3, useCORS: true, allowTaint: false, backgroundColor: null, logging: false });
    el.style.display = 'none';
    el.innerHTML = '';

    // 2. Capture verso (avec sponsors + QR)
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
    const qrContainer = el.querySelector('#card-print-qr-verso');
    if (qrContainer && typeof QRCode !== 'undefined') {
        const memberUid = (_cardMemberData && _cardMemberData._uid)
            || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '');
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${_cardMemberData.prenom || ''} ${_cardMemberData.nom || ''}`;
        new QRCode(qrContainer, { text: qrContent, width: 116, height: 116, colorDark: '#0d1b2e', colorLight: '#f5e88a', correctLevel: QRCode.CorrectLevel.H });
    }
    await new Promise(r => setTimeout(r, 500));
    const versoCanvas = await html2canvas(el, { scale: 3, useCORS: true, allowTaint: false, backgroundColor: null, logging: false });
    el.style.display = 'none';
    el.innerHTML = '';

    // 3. Créer le PDF A4 portrait — fond blanc pour impression
    const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const cw = 85.6, ch = 54; // ISO 7810 ID-1 (carte bancaire)
    const x = (pageW - cw) / 2;
    const rectoY = 65, versoY = rectoY + ch + 30;

    // Fond blanc
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');

    // Titre
    doc.setTextColor(10, 18, 40);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CARTE MEMBRE — USM Tennis Montargis', pageW / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Saison ' + _saison() + ' · Imprimez et découpez le long des traits de coupe', pageW / 2, 29, { align: 'center' });

    // Séparateur
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(20, 33, pageW - 20, 33);

    // ── Fonction traits de coupe (crop marks) ──
    // Petites lignes en L à chaque coin, 3mm de long, 2mm d'écart de la carte
    const gap = 2, len = 5;
    const cropMark = (cx, cy, dx, dy) => {
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.2);
        // Horizontale
        doc.line(cx + dx * gap, cy, cx + dx * (gap + len), cy);
        // Verticale
        doc.line(cx, cy + dy * gap, cx, cy + dy * (gap + len));
    };

    // Labels
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');

    // Recto
    doc.text('RECTO', x, rectoY - 4);
    doc.addImage(rectoCanvas.toDataURL('image/png'), 'PNG', x, rectoY, cw, ch);
    // Traits de coupe recto
    cropMark(x,      rectoY,      -1, -1); // coin haut-gauche
    cropMark(x + cw, rectoY,       1, -1); // coin haut-droit
    cropMark(x,      rectoY + ch, -1,  1); // coin bas-gauche
    cropMark(x + cw, rectoY + ch,  1,  1); // coin bas-droit

    // Verso
    doc.text('VERSO', x, versoY - 4);
    doc.addImage(versoCanvas.toDataURL('image/png'), 'PNG', x, versoY, cw, ch);
    // Traits de coupe verso
    cropMark(x,      versoY,      -1, -1);
    cropMark(x + cw, versoY,       1, -1);
    cropMark(x,      versoY + ch, -1,  1);
    cropMark(x + cw, versoY + ch,  1,  1);

    // Footer
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('tennismontargis.fr · Format carte bancaire ISO 7810 ID-1 (85,6 × 54 mm)', pageW / 2, pageH - 10, { align: 'center' });

    const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
    const filename = `carte-membre-usm-${nomFichier}.pdf`;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isPWA || isIOS) {
        window.open(doc.output('bloburi'), '_blank');
    } else {
        doc.save(filename);
    }
    restore();
    } catch(e) { el.style.display = 'none'; el.innerHTML = ''; restore(); alert('Erreur lors de la génération du PDF : ' + e.message); }
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
function _saison() { const y = new Date().getFullYear(); return `${y}/${String(y+1).slice(-2)}`; }
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
            <div style="color:#ffd700;font-size:25px;font-weight:900;letter-spacing:2px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
            <div style="color:rgba(255,215,0,0.65);font-size:17px;letter-spacing:3px;margin-top:2px;font-family:Arial,sans-serif;">${label} · SAISON ${_saison()}</div>
        </div>
        <img src="/Logo_F%C3%A9d%C3%A9ration_Fran%C3%A7aise_de_Tennis.png" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;" crossorigin="anonymous" alt="FFT">
    </div>`;
}
const _cardFooter = `<div style="text-align:center;padding:6px;border-top:1px solid rgba(255,215,0,0.15);
    color:rgba(255,215,0,0.3);font-size:16px;letter-spacing:1px;font-family:Arial,sans-serif;flex-shrink:0;">
    tennismontargis.fr</div>`;

// ── RECTO : logo grand + infos membre, sans QR ─────────────
function buildRectoHtml(m) {
    const prenom = m.prenom || '';
    const nom    = m.nom    || '';
    return `<div style="${_cardBase}">
        ${_cardHeader('CARTE MEMBRE', '')}
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
                <div style="color:#ffffff;font-size:36px;font-weight:900;letter-spacing:1px;margin-bottom:12px;
                    font-family:Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escMember(`${prenom} ${nom}`.toUpperCase())}
                </div>
                ${m.statut && m.statut !== 'Membre'
                    ? `<div style="margin-bottom:10px;"><span style="background:rgba(255,215,0,0.14);border:1px solid rgba(255,215,0,0.5);color:#ffd700;padding:4px 14px;border-radius:20px;font-size:18px;letter-spacing:0.5px;font-family:Arial,sans-serif;">★ ${escMember(m.statut)}</span></div>`
                    : ''}
                ${m.classement
                    ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.4);color:#ffd700;padding:4px 14px;border-radius:20px;font-size:22px;font-family:Arial,sans-serif;">Classement : ${escMember(m.classement)}</span></div>`
                    : ''}
                ${m.categorie
                    ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);color:rgba(255,215,0,0.85);padding:4px 14px;border-radius:20px;font-size:22px;font-family:Arial,sans-serif;">Catégorie : ${escMember(m.categorie)}</span></div>`
                    : ''}
                ${m.licence
                    ? `<div style="margin-top:12px;"><div style="color:rgba(255,255,255,0.45);font-size:16px;letter-spacing:2px;font-family:Arial,sans-serif;">LICENCE FFT</div><div style="color:#ffffff;font-size:30px;font-weight:700;letter-spacing:3px;font-family:Arial,sans-serif;">${escMember(m.licence)}</div></div>`
                    : ''}
            </div>
        </div>
        ${_cardFooter}
    </div>`;
}

// ── VERSO : sponsors + QR code avec logo USM intégré ───────
function buildVersoHtml(m, sponsors) {
    const sponsorsWithTitle = (sponsors || []).filter(s => s && s.title);

    const sponsorCards = sponsorsWithTitle.map(s => {
        const logoSrc  = s._logoBase64;
        const initiale = (s.title || '?').charAt(0).toUpperCase();
        const logoHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:48px;height:48px;object-fit:contain;border-radius:7px;background:#fff;padding:3px;border:1px solid rgba(255,215,0,0.3);flex-shrink:0;" alt="${escMember(s.title)}">`
            : `<div style="width:48px;height:48px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.35);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffd700;font-size:29px;font-weight:900;font-family:Arial,sans-serif;">${initiale}</div>`;
        const avantageHtml = s.avantage
            ? `<div style="color:rgba(255,255,255,0.8);font-size:17px;font-family:Arial,sans-serif;line-height:1.4;">${escMember(s.avantage)}</div>`
            : '';
        return `<div style="display:flex;align-items:flex-start;gap:9px;padding:9px;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.15);border-radius:9px;">
            ${logoHtml}
            <div style="flex:1;min-width:0;">
                <div style="color:#ffd700;font-size:18px;font-weight:700;font-family:Arial,sans-serif;margin-bottom:3px;">${escMember(s.title)}</div>
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
            <div style="color:rgba(255,215,0,0.45);font-size:14px;margin-top:6px;letter-spacing:1px;font-family:Arial,sans-serif;text-align:center;">SCANNER POUR<br>VÉRIFIER</div>
        </div>`;

    return `<div style="${_cardBase}">
        ${_cardHeader('NOS PARTENAIRES', '')}
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
function buildMobileCardHtml(m, sponsors) {
    const prenom = m.prenom || '';
    const nom    = m.nom    || '';

    const decorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" style="position:absolute;top:0;left:0;pointer-events:none;">
        <line x1="0" y1="210" x2="390" y2="210" stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <line x1="0" y1="634" x2="390" y2="634" stroke="rgba(255,215,0,0.06)" stroke-width="1"/>
        <circle cx="195" cy="390" r="210" stroke="rgba(255,215,0,0.04)" stroke-width="1" fill="none"/>
        <circle cx="195" cy="390" r="165" stroke="rgba(255,215,0,0.03)" stroke-width="1" fill="none"/>
        <line x1="0" y1="390" x2="390" y2="390" stroke="rgba(255,215,0,0.03)" stroke-width="1"/>
    </svg>`;

    const QR_SIZE = 110;
    const LOGO_SIZE = 26;
    const LOGO_OFFSET = Math.round((QR_SIZE - LOGO_SIZE) / 2);

    // Sponsors : logos en grille jusqu'à 8
    const sponsorList = (sponsors || []).filter(s => s && (s._logoBase64 || s.title));
    const sponsorLogosHtml = sponsorList.map(s => {
        if (s._logoBase64) {
            return `<img src="${s._logoBase64}" style="width:40px;height:40px;object-fit:contain;border-radius:6px;background:#fff;padding:2px;border:1px solid rgba(255,215,0,0.2);" alt="${escMember(s.title || '')}">`;
        }
        return `<div style="width:40px;height:40px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#ffd700;font-size:20px;font-weight:900;font-family:Arial,sans-serif;">${(s.title||'?').charAt(0).toUpperCase()}</div>`;
    }).join('');
    const sponsorsSection = sponsorLogosHtml ? `
        <div style="position:relative;z-index:2;width:100%;margin-top:auto;padding-bottom:42px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <div style="flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.2));"></div>
                <div style="color:rgba(255,215,0,0.35);font-size:9px;letter-spacing:3px;font-family:Arial,sans-serif;">PARTENAIRES</div>
                <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,0,0.2),transparent);"></div>
            </div>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:7px;">${sponsorLogosHtml}</div>
        </div>` : '';

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
                <div style="color:rgba(255,215,0,0.75);font-size:12px;letter-spacing:4px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
                <div style="color:rgba(255,255,255,0.3);font-size:10px;letter-spacing:2px;font-family:Arial,sans-serif;margin-top:2px;">CARTE MEMBRE · SAISON ${_saison()}</div>
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
            <div style="color:#ffd700;font-size:13px;">★</div>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,0,0.55),transparent);"></div>
        </div>

        <!-- NOM PRÉNOM -->
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:10px;">
            <div style="color:#ffffff;font-size:27px;font-weight:900;letter-spacing:2px;font-family:Arial,sans-serif;text-shadow:0 0 20px rgba(255,255,255,0.15);">
                ${escMember(`${prenom} ${nom}`.toUpperCase())}
            </div>
        </div>

        <!-- STATUT (si pas Membre simple) -->
        ${m.statut && m.statut !== 'Membre' ? `
        <div style="position:relative;z-index:2;margin-bottom:10px;">
            <span style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.45);color:#ffd700;padding:5px 16px;border-radius:20px;font-size:14px;letter-spacing:0.5px;font-family:Arial,sans-serif;">★ ${escMember(m.statut)}</span>
        </div>` : ''}

        <!-- CLASSEMENT + CATÉGORIE -->
        <div style="position:relative;z-index:2;display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:center;">
            ${m.classement ? `<span style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);color:rgba(255,215,0,0.85);padding:4px 14px;border-radius:20px;font-size:16px;font-family:Arial,sans-serif;">Cl. ${escMember(m.classement)}</span>` : ''}
            ${m.categorie  ? `<span style="background:rgba(0,210,255,0.07);border:1px solid rgba(0,210,255,0.25);color:rgba(0,210,255,0.8);padding:4px 14px;border-radius:20px;font-size:16px;font-family:Arial,sans-serif;">${escMember(m.categorie)}</span>` : ''}
        </div>

        <!-- LICENCE FFT -->
        ${m.licence ? `
        <div style="position:relative;z-index:2;text-align:center;margin-bottom:20px;">
            <div style="color:rgba(255,215,0,0.45);font-size:12px;letter-spacing:3px;font-family:Arial,sans-serif;margin-bottom:4px;">LICENCE FFT</div>
            <div style="color:#ffd700;font-size:26px;font-weight:700;letter-spacing:4px;font-family:Arial,sans-serif;text-shadow:0 0 12px rgba(255,215,0,0.5);">${escMember(m.licence)}</div>
        </div>` : `<div style="margin-bottom:20px;"></div>`}

        <!-- QR CODE avec logo USM intégré -->
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;">
            <div style="position:relative;width:${QR_SIZE}px;height:${QR_SIZE}px;">
                <div id="card-mobile-qr" style="width:${QR_SIZE}px;height:${QR_SIZE}px;background:#f5e88a;border-radius:10px;border:2px solid rgba(255,215,0,0.5);overflow:hidden;"></div>
                <div style="position:absolute;top:${LOGO_OFFSET}px;left:${LOGO_OFFSET}px;width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;background:#f5e88a;border-radius:50%;padding:2px;box-sizing:border-box;">
                    <img src="/logo_usm_new.png" style="width:100%;height:100%;object-fit:contain;display:block;" crossorigin="anonymous" alt="USM">
                </div>
            </div>
            <div style="color:rgba(255,215,0,0.35);font-size:10px;margin-top:6px;letter-spacing:1.5px;font-family:Arial,sans-serif;text-align:center;">SCANNER POUR VÉRIFIER</div>
        </div>

        <!-- SPONSORS -->
        ${sponsorsSection}

        <!-- BAS : site -->
        <div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;z-index:2;">
            <div style="color:rgba(255,215,0,0.2);font-size:10px;letter-spacing:1.5px;font-family:Arial,sans-serif;">tennismontargis.fr</div>
        </div>
    </div>`;
}

window.downloadMemberCardMobile = async function() {
    if (!_cardMemberData || typeof html2canvas === 'undefined') return;
    const el = document.getElementById('member-card-mobile-print');
    if (!el) return;

    // Charger + pré-charger les sponsors (logos en base64 pour html2canvas)
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

    el.innerHTML = buildMobileCardHtml(_cardMemberData, sponsorsPreloaded);
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
            width: 110,
            height: 110,
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

        // Compteur dans le bandeau repliable du Calendrier + ouverture auto si message urgent
        var countEl = document.getElementById('calendrier-messages-count');
        if (countEl) countEl.textContent = '(' + msgs.length + ')';
        if (msgs.some(function(m) { return m.type === 'urgent'; })) window.toggleMessagesBureau && window.toggleMessagesBureau(true);

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

// =====================================================================
// CALENDRIER DU CLUB (côté membre)
// =====================================================================

var _CAL_TYPES_M = {
    tournoi:   { label: 'Tournois',   icon: 'fa-trophy',     color: '#c9a227' },
    sortie:    { label: 'Sorties',    icon: 'fa-bus',        color: '#f97316' },
    evenement: { label: 'Événements', icon: 'fa-star',       color: '#00d2ff' },
    reunion:   { label: 'Réunions',   icon: 'fa-bullhorn',   color: '#8b5cf6' },
    match:     { label: 'Matchs',     icon: 'fa-shield-alt', color: '#e11d48' },
    autre:     { label: 'Autres',     icon: 'fa-calendar',   color: '#64748b' }
};
var _MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
var _calEntries = [];
var _calFiltres = {}; // type -> actif

window.toggleMessagesBureau = function(forceOpen) {
    var bloc = document.getElementById('member-messages-list');
    var chevron = document.getElementById('calendrier-messages-chevron');
    if (!bloc) return;
    var ouvrir = forceOpen === true || bloc.style.display === 'none';
    bloc.style.display = ouvrir ? 'block' : 'none';
    if (chevron) chevron.className = 'fas fa-chevron-' + (ouvrir ? 'up' : 'down');
};

function _calFmtDateM(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function loadCalendrierMember() {
    var listEl = document.getElementById('calendrier-liste');
    if (!listEl) return;
    var uid = _cardMemberData ? _cardMemberData._uid : null;

    Promise.all([
        window.db_ref.ref('calendrier').once('value'),
        window.db_ref.ref('equipes').once('value')
    ]).then(function(snaps) {
        _calEntries = [];

        // Entrées gérées par l'admin
        snaps[0].forEach(function(child) {
            var e = child.val(); if (!e || !e.date) return;
            _calEntries.push({
                date: e.date, dateFin: e.dateFin || '', heure: e.heure || '',
                type: _CAL_TYPES_M[e.type] ? e.type : 'autre',
                titre: e.titre || '', lieu: e.lieu || '', prix: e.prix || '',
                description: e.description || '', image: e.image || '', isMyMatch: false
            });
        });

        // Matchs d'équipes (automatiques)
        snaps[1].forEach(function(eqChild) {
            var eq = eqChild.val(); if (!eq) return;
            var isMyTeam = !!(uid && eq.joueurs && eq.joueurs[uid]);
            Object.values(eq.rencontres || {}).forEach(function(r) {
                if (!r.date) return;
                _calEntries.push({
                    date: r.date, dateFin: '', heure: r.heure || '',
                    type: 'match',
                    titre: (eq.nom || 'Équipe') + (r.adversaire ? ' vs ' + r.adversaire : ''),
                    lieu: r.lieu || '', prix: '', description: '', image: '',
                    isMyMatch: isMyTeam, domicile: !!r.domicile
                });
            });
        });

        _calEntries.sort(function(a, b) { return a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || ''); });

        // Filtres : uniquement les types réellement présents, tous actifs par défaut
        var typesPresents = [];
        _calEntries.forEach(function(e) { if (typesPresents.indexOf(e.type) === -1) typesPresents.push(e.type); });
        var filtresEl = document.getElementById('calendrier-filtres');
        if (filtresEl) {
            if (typesPresents.length > 1) {
                filtresEl.innerHTML = typesPresents.map(function(ty) {
                    var t = _CAL_TYPES_M[ty];
                    if (_calFiltres[ty] === undefined) _calFiltres[ty] = true;
                    return '<button id="cal-filtre-' + ty + '" onclick="window.toggleCalFiltre(\'' + ty + '\')" '
                        + 'style="border-radius:20px; padding:6px 14px; font-size:12px; cursor:pointer; font-family:inherit; transition:all .15s;">'
                        + '<i class="fas ' + t.icon + '" style="margin-right:5px;"></i>' + t.label + '</button>';
                }).join('');
                typesPresents.forEach(_updateCalFiltreBtn);
            } else {
                filtresEl.innerHTML = '';
            }
        }

        _renderCalendrierListe();
    }).catch(function(err) {
        listEl.innerHTML = '<div class="member-empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erreur de chargement : ' + escMember(err.message || String(err)) + '</p></div>';
    });
}

function _updateCalFiltreBtn(ty) {
    var btn = document.getElementById('cal-filtre-' + ty);
    if (!btn) return;
    var t = _CAL_TYPES_M[ty];
    var actif = _calFiltres[ty] !== false;
    btn.style.background = actif ? t.color + '22' : '#0f172a';
    btn.style.color = actif ? t.color : '#475569';
    btn.style.border = '1px solid ' + (actif ? t.color + '55' : '#33415555');
    btn.style.opacity = actif ? '1' : '0.6';
}

window.toggleCalFiltre = function(ty) {
    _calFiltres[ty] = _calFiltres[ty] === false;
    _updateCalFiltreBtn(ty);
    _renderCalendrierListe();
};

function _renderCalEntryCard(e) {
    var t = _CAL_TYPES_M[e.type];
    var jour = e.date.substring(8, 10);
    var moisIdx = parseInt(e.date.substring(5, 7), 10) - 1;
    var moisCourt = (_MOIS_FR[moisIdx] || '').substring(0, 4) + (( _MOIS_FR[moisIdx] || '').length > 4 ? '.' : '');
    var sousTitre = [];
    if (e.dateFin) sousTitre.push('jusqu\'au ' + _calFmtDateM(e.dateFin));
    if (e.heure) sousTitre.push(e.heure);
    if (e.lieu) sousTitre.push(e.lieu);
    if (e.prix) sousTitre.push(e.prix);
    return '<div style="display:flex; gap:14px; background:#1e293b; border:1px solid ' + t.color + '33; border-left:3px solid ' + t.color + '; border-radius:12px; padding:14px 16px;">'
        + '<div style="text-align:center; flex-shrink:0; min-width:44px;">'
        + '<div style="font-size:22px; font-weight:900; color:' + t.color + '; line-height:1;">' + jour + '</div>'
        + '<div style="font-size:10px; color:#64748b; text-transform:uppercase; margin-top:2px;">' + moisCourt + '</div>'
        + '</div>'
        + '<div style="flex:1; min-width:0;">'
        + '<div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-bottom:3px;">'
        + '<span style="background:' + t.color + '22; color:' + t.color + '; border:1px solid ' + t.color + '44; border-radius:10px; padding:1px 8px; font-size:10px; white-space:nowrap;"><i class="fas ' + t.icon + '" style="margin-right:3px;"></i>' + (e.type === 'match' ? (e.domicile ? 'Match 🏠' : 'Match 🚌') : t.label.replace(/s$/, '')) + '</span>'
        + (e.isMyMatch ? '<span style="background:#c9a22722; color:#c9a227; border:1px solid #c9a22755; border-radius:10px; padding:1px 8px; font-size:10px; font-weight:bold; white-space:nowrap;"><i class="fas fa-star" style="margin-right:3px;"></i>Mon match</span>' : '')
        + '</div>'
        + '<div style="color:#e2e8f0; font-size:14px; font-weight:600;">' + escMember(e.titre) + '</div>'
        + (sousTitre.length ? '<div style="color:#94a3b8; font-size:12px; margin-top:3px;">' + escMember(sousTitre.join(' · ')) + '</div>' : '')
        + (e.description ? '<div style="color:#64748b; font-size:12px; margin-top:5px; white-space:pre-wrap;">' + escMember(e.description) + '</div>' : '')
        + (e.image ? '<img src="' + escMember(e.image) + '" alt="" loading="lazy" style="max-height:160px; max-width:100%; border-radius:8px; margin-top:8px;">' : '')
        + '</div></div>';
}

// Mois affiché dans la vue calendrier ('YYYY-MM')
var _calMoisAffiche = new Date().toISOString().substring(0, 7);

window.calMoisPrecedent = function() { _calChangerMois(-1); };
window.calMoisSuivant = function() { _calChangerMois(1); };
window.calAujourdhui = function() {
    _calMoisAffiche = new Date().toISOString().substring(0, 7);
    _renderCalendrierListe();
};

function _calChangerMois(delta) {
    var y = parseInt(_calMoisAffiche.substring(0, 4), 10);
    var m = parseInt(_calMoisAffiche.substring(5, 7), 10) + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    _calMoisAffiche = y + '-' + ('0' + m).slice(-2);
    _renderCalendrierListe();
}

window.calChoisirMois = function(val) {
    if (!val) return;
    _calMoisAffiche = val;
    _renderCalendrierListe();
};

function _calMoisSuivantDe(ym) {
    var y = parseInt(ym.substring(0, 4), 10);
    var m = parseInt(ym.substring(5, 7), 10) + 1;
    if (m > 12) { m = 1; y++; }
    return y + '-' + ('0' + m).slice(-2);
}

// Liste des mois proposés dans le sélecteur : du plus ancien événement (ou aujourd'hui)
// jusqu'au plus lointain événement, avec au minimum 12 mois devant aujourd'hui
function _calListeMois() {
    var moisAuj = new Date().toISOString().substring(0, 7);
    var minM = moisAuj, maxM = moisAuj;
    _calEntries.forEach(function(e) {
        var md = e.date.substring(0, 7);
        var mf = (e.dateFin || e.date).substring(0, 7);
        if (md < minM) minM = md;
        if (mf > maxM) maxM = mf;
    });
    var plancher = new Date();
    plancher.setMonth(plancher.getMonth() + 12);
    var maxMin = plancher.toISOString().substring(0, 7);
    if (maxM < maxMin) maxM = maxMin;
    if (_calMoisAffiche < minM) minM = _calMoisAffiche;
    if (_calMoisAffiche > maxM) maxM = _calMoisAffiche;

    var liste = [];
    var cur = minM;
    var garde = 0;
    while (cur <= maxM && garde++ < 48) {
        liste.push(cur);
        cur = _calMoisSuivantDe(cur);
    }
    return liste;
}

window.calAllerAuJour = function(dayISO) {
    var el = document.getElementById('cal-jour-' + dayISO);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #00d2ff';
        setTimeout(function() { el.style.outline = 'none'; }, 1600);
    }
};

function _renderCalendrierListe() {
    var listEl = document.getElementById('calendrier-liste');
    if (!listEl) return;
    var todayISO = new Date().toISOString().substring(0, 10);
    var visibles = _calEntries.filter(function(e) { return _calFiltres[e.type] !== false; });

    var y = parseInt(_calMoisAffiche.substring(0, 4), 10);
    var m = parseInt(_calMoisAffiche.substring(5, 7), 10); // 1-12
    var moisDebut = _calMoisAffiche + '-01';
    var nbJours = new Date(y, m, 0).getDate();
    var moisFin = _calMoisAffiche + '-' + ('0' + nbJours).slice(-2);

    // Événements visibles ce mois-ci (les événements à cheval sur plusieurs mois sont inclus)
    var duMois = visibles.filter(function(e) {
        return e.date <= moisFin && (e.dateFin || e.date) >= moisDebut;
    });

    // Pastilles de la grille : pour chaque jour, les couleurs des types présents
    var dots = {}; // 'YYYY-MM-DD' -> [couleurs]
    duMois.forEach(function(e) {
        var t = _CAL_TYPES_M[e.type];
        var debut = e.date > moisDebut ? e.date : moisDebut;
        var fin = (e.dateFin || e.date) < moisFin ? (e.dateFin || e.date) : moisFin;
        for (var d = parseInt(debut.substring(8, 10), 10); d <= parseInt(fin.substring(8, 10), 10); d++) {
            var cle = _calMoisAffiche + '-' + ('0' + d).slice(-2);
            dots[cle] = dots[cle] || [];
            if (dots[cle].indexOf(t.color) === -1 && dots[cle].length < 3) dots[cle].push(t.color);
        }
    });

    // --- Barre de navigation ---
    var estMoisCourant = _calMoisAffiche === todayISO.substring(0, 7);
    var optionsMois = _calListeMois().map(function(ym) {
        var my = ym.substring(0, 4);
        var mi = parseInt(ym.substring(5, 7), 10) - 1;
        return '<option value="' + ym + '"' + (ym === _calMoisAffiche ? ' selected' : '') + '>' + _MOIS_FR[mi] + ' ' + my + '</option>';
    }).join('');

    var html = '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px;">'
        + '<button onclick="window.calMoisPrecedent()" style="background:#1e293b; color:#00d2ff; border:1px solid #33415588; border-radius:8px; padding:8px 14px; cursor:pointer; font-size:14px;"><i class="fas fa-chevron-left"></i></button>'
        + '<div style="text-align:center;">'
        + '<select onchange="window.calChoisirMois(this.value)" title="Choisir un mois" '
        + 'style="background:#0f172a; color:#e2e8f0; font-family:\'Orbitron\', sans-serif; font-size:0.95rem; border:1px solid #33415588; border-radius:8px; padding:7px 10px; cursor:pointer; text-align:center; -webkit-appearance:none; appearance:none;">'
        + optionsMois + '</select>'
        + (!estMoisCourant ? '<div><button onclick="window.calAujourdhui()" style="background:none; border:none; color:#00d2ff; font-size:11px; cursor:pointer; text-decoration:underline; padding:2px;">Revenir à aujourd\'hui</button></div>' : '')
        + '</div>'
        + '<button onclick="window.calMoisSuivant()" style="background:#1e293b; color:#00d2ff; border:1px solid #33415588; border-radius:8px; padding:8px 14px; cursor:pointer; font-size:14px;"><i class="fas fa-chevron-right"></i></button>'
        + '</div>';

    // --- Grille du mois (lundi → dimanche) ---
    var joursSem = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    html += '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:20px; background:#0f172a; border:1px solid #1e293b; border-radius:12px; padding:10px;">';
    joursSem.forEach(function(j) {
        html += '<div style="text-align:center; color:#475569; font-size:10px; font-weight:bold; padding:4px 0;">' + j + '</div>';
    });
    var premierJour = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0 = lundi
    for (var v = 0; v < premierJour; v++) html += '<div></div>';
    for (var jour = 1; jour <= nbJours; jour++) {
        var dISO = _calMoisAffiche + '-' + ('0' + jour).slice(-2);
        var estAuj = dISO === todayISO;
        var jDots = dots[dISO] || [];
        var clickable = jDots.length > 0;
        html += '<div ' + (clickable ? 'onclick="window.calAllerAuJour(\'' + dISO + '\')" ' : '')
            + 'style="text-align:center; padding:5px 0 3px; border-radius:8px; ' + (clickable ? 'cursor:pointer; background:#1e293b;' : '')
            + (estAuj ? ' border:1px solid #00d2ff; background:rgba(0,210,255,0.1);' : '') + '">'
            + '<div style="font-size:12px; color:' + (estAuj ? '#00d2ff' : jDots.length ? '#e2e8f0' : '#475569') + '; font-weight:' + (jDots.length ? 'bold' : 'normal') + ';">' + jour + '</div>'
            + '<div style="display:flex; justify-content:center; gap:2px; height:5px; margin-top:2px;">'
            + jDots.map(function(c) { return '<span style="width:5px; height:5px; border-radius:50%; background:' + c + ';"></span>'; }).join('')
            + '</div></div>';
    }
    html += '</div>';

    // --- Agenda du mois ---
    if (!duMois.length) {
        html += '<div class="member-empty-state"><i class="fas fa-calendar-check"></i><p>Rien de prévu en ' + _MOIS_FR[m - 1].toLowerCase() + '.</p></div>';
    } else {
        duMois.forEach(function(e) {
            var estPasse = (e.dateFin || e.date) < todayISO;
            var ancre = e.date >= moisDebut ? e.date : moisDebut;
            html += '<div id="cal-jour-' + ancre + '" style="margin-bottom:8px; border-radius:12px; transition:outline .3s;' + (estPasse ? ' opacity:0.5;' : '') + '">' + _renderCalEntryCard(e) + '</div>';
        });
    }

    listEl.innerHTML = html;
}

// =====================================================================
// GESTION DES ÉQUIPES EN ÉQUIPE (côté membre)
// =====================================================================

var _equipesLoaded = false;
var _equipesChampData = {};
var _equipesInscriptionsData = {};

// Libellé lisible d'une clé de poste (simple2 → « Simple 2 », double3_B → « Double 3 — Joueur B »)
function _posLabelMember(pos) {
    var m = String(pos).match(/^simple(\d+)$/);
    if (m) return 'Simple ' + m[1];
    m = String(pos).match(/^double(\d+)_([AB])$/);
    if (m) return 'Double ' + m[1] + ' — Joueur ' + m[2];
    return pos;
}

function loadEquipesMember(uid) {
    var disposEl = document.getElementById('equipes-champs-dispos');
    var mesChEl = document.getElementById('equipes-mes-champs');
    var convEl = document.getElementById('equipes-mes-convocations');

    if (disposEl) disposEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></p>';

    // Charger championnats + inscriptions + équipes/convocations en parallèle
    window.db_ref.ref('championnats_equipe').once('value', function(snapChamps) {
        window.db_ref.ref('inscriptions_equipe').once('value', function(snapInscrits) {
            window.db_ref.ref('equipes').once('value', function(snapEquipes) {

                var champs = {}; _equipesChampData = {};
                snapChamps.forEach(function(c) { champs[c.key] = Object.assign({}, c.val(), {id: c.key}); _equipesChampData[c.key] = champs[c.key]; });

                // Toutes les équipes (equipeId -> data)
                var allEquipes = {};
                snapEquipes.forEach(function(eqChild) {
                    var eq = eqChild.val();
                    if (eq) allEquipes[eqChild.key] = eq;
                });

                // Inscriptions du membre
                var mesInscriptions = {};
                snapInscrits.forEach(function(champNode) {
                    var champId = champNode.key;
                    champNode.forEach(function(userNode) {
                        if (userNode.key === uid) {
                            mesInscriptions[champId] = userNode.val();
                            _equipesInscriptionsData[champId] = userNode.val();
                        }
                    });
                });

                // Noms de tous les membres inscrits (pour résoudre les UIDs dans les convocations)
                var membresMap = {};
                snapInscrits.forEach(function(champNode) {
                    champNode.forEach(function(userNode) {
                        var d = userNode.val();
                        if (d && !membresMap[userNode.key] && (d.prenom || d.nom)) {
                            membresMap[userNode.key] = { prenom: d.prenom || '', nom: d.nom || '', classement: d.classement || '' };
                        }
                    });
                });

                // ---- Section A : championnats ouverts ----
                var champsOuverts = Object.values(champs).filter(function(c) { return c.statut === 'inscriptions'; });
                if (!champsOuverts.length) {
                    if (disposEl) disposEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">Aucun championnat ouvert aux inscriptions pour l\'instant.</p>';
                } else {
                    var html = '';
                    champsOuverts.forEach(function(c) {
                        var myIns = mesInscriptions[c.id];
                        var inscrit = !!myIns;
                        var refuse = myIns && myIns.statut === 'refuse';
                        var format = (c.nb_simples || 2) + ' Simple' + (c.nb_simples > 1 ? 's' : '');
                        if (c.nb_doubles > 0) format += ' + ' + c.nb_doubles + ' Double' + (c.nb_doubles > 1 ? 's' : '');
                        var borderColor = refuse ? 'rgba(239,68,68,0.4)' : (inscrit ? 'rgba(34,197,94,0.4)' : 'rgba(225,29,72,0.3)');
                        var badge;
                        if (refuse) {
                            badge = '<span style="background:#ef444422; color:#ef4444; border:1px solid #ef444444; border-radius:20px; padding:4px 12px; font-size:12px;"><i class="fas fa-times-circle" style="margin-right:4px;"></i>Refusée</span>';
                        } else if (inscrit) {
                            badge = '<span style="background:#22c55e22; color:#22c55e; border:1px solid #22c55e44; border-radius:20px; padding:4px 12px; font-size:12px;"><i class="fas fa-check-circle" style="margin-right:4px;"></i>Inscrit(e)</span>';
                        } else {
                            badge = '<button onclick="window.inscrireChampionnat(\'' + c.id + '\')" style="background:linear-gradient(135deg,#e11d48,#9f1239); color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;"><i class="fas fa-plus" style="margin-right:5px;"></i>S\'inscrire</button>';
                        }
                        html += '<div style="background:#1e293b; border:1px solid ' + borderColor + '; border-radius:12px; padding:16px;">'
                            + '<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:10px;">'
                            + '<div><div style="font-weight:bold; color:#e2e8f0; font-size:14px;">' + escMember(c.nom) + '</div>'
                            + '<div style="font-size:12px; color:#94a3b8; margin-top:3px;">' + escMember(c.saison) + ' — ' + escMember(format) + '</div>'
                            + (c.description ? '<div style="font-size:12px; color:#64748b; margin-top:4px;">' + escMember(c.description) + '</div>' : '')
                            + '</div>' + badge + '</div>';
                        if (inscrit) {
                            var lbl = refuse ? 'Retirer l\'inscription refusée' : 'Se désinscrire';
                            html += '<button onclick="window.annulerInscription(\'' + c.id + '\',\'' + uid + '\')" style="background:#0f172a; color:#94a3b8; border:1px solid #33415544; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px;"><i class="fas fa-times" style="margin-right:4px;"></i>' + lbl + '</button>';
                        }
                        html += '</div>';
                    });
                    if (disposEl) disposEl.innerHTML = html;
                }

                // Bannière en tête d'onglet : un championnat ouvert auquel le membre n'est pas encore inscrit
                var bannerEl = document.getElementById('equipes-banner-inscriptions');
                if (bannerEl) {
                    var champsNonInscrits = champsOuverts.filter(function(c) { return !mesInscriptions[c.id]; });
                    if (champsNonInscrits.length) {
                        bannerEl.style.display = 'block';
                        bannerEl.innerHTML = '<button onclick="document.getElementById(\'equipes-section-inscrire\').scrollIntoView({behavior:\'smooth\'})" '
                            + 'style="width:100%; background:rgba(225,29,72,0.1); border:1px solid rgba(225,29,72,0.45); border-radius:12px; padding:12px 16px; cursor:pointer; color:#e2e8f0; font-family:inherit; font-size:13px; text-align:left; display:flex; align-items:center; gap:10px;">'
                            + '<i class="fas fa-door-open" style="color:#e11d48; font-size:16px; flex-shrink:0;"></i>'
                            + '<span style="flex:1;"><strong style="color:#e11d48;">Inscriptions ouvertes :</strong> ' + champsNonInscrits.map(function(c) { return escMember(c.nom); }).join(', ') + '</span>'
                            + '<i class="fas fa-arrow-down" style="color:#e11d48; flex-shrink:0;"></i></button>';
                    } else {
                        bannerEl.style.display = 'none';
                        bannerEl.innerHTML = '';
                    }
                }

                // ---- Section B : mes inscriptions ----
                var inscritChampIds = Object.keys(mesInscriptions);
                if (!inscritChampIds.length) {
                    if (mesChEl) mesChEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">Vous n\'êtes inscrit(e) à aucun championnat.</p>';
                } else {
                    var html2 = '';
                    var chatEquipeIds = [];
                    inscritChampIds.forEach(function(champId) {
                        var c = champs[champId]; if (!c) return;
                        var ins = mesInscriptions[champId];
                        var dispos = ins.disponibilites || {};

                        var insRefuse = ins.statut === 'refuse';
                        var insBorder = insRefuse ? 'rgba(239,68,68,0.4)' : 'rgba(201,162,39,0.3)';
                        var statutLigne;
                        if (insRefuse) {
                            statutLigne = ' — <span style="color:#ef4444;"><i class="fas fa-times-circle"></i> Refusée par le coach</span>';
                        } else if (ins.valide) {
                            statutLigne = ' — <span style="color:#22c55e;"><i class="fas fa-check-circle"></i> Validé par le coach</span>';
                        } else {
                            statutLigne = ' — <span style="color:#f59e0b;"><i class="fas fa-clock"></i> En attente de validation</span>';
                        }
                        html2 += '<div style="background:#1e293b; border:1px solid ' + insBorder + '; border-radius:12px; padding:16px; margin-bottom:8px;">'
                            + '<div style="font-weight:bold; color:#c9a227; margin-bottom:4px;">' + escMember(c.nom) + '</div>'
                            + '<div style="font-size:12px; color:#94a3b8; margin-bottom:12px;">' + escMember(c.saison) + statutLigne + '</div>';
                        if (insRefuse) {
                            html2 += '<div style="background:#ef444411; border-left:3px solid #ef4444; border-radius:6px; padding:10px 12px; margin-bottom:12px;">'
                                + '<div style="font-size:11px; color:#ef4444; font-weight:bold; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;"><i class="fas fa-comment-alt" style="margin-right:4px;"></i>Motif du coach</div>'
                                + '<div style="font-size:13px; color:#e2e8f0; white-space:pre-wrap; word-break:break-word;">' + escMember(ins.motifRefus || '(aucun motif renseigné)') + '</div>'
                                + '<button onclick="window.annulerInscription(\'' + champId + '\',\'' + uid + '\')" style="margin-top:10px; background:#ef444422; color:#ef4444; border:1px solid #ef444444; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash" style="margin-right:5px;"></i>Retirer cette inscription</button>'
                                + '</div>';
                        }

                        // Mes équipes (assignées par le coach) pour ce championnat
                        var mesEquipes = Object.entries(allEquipes)
                            .filter(function(e) { return e[1].champId === champId && e[1].joueurs && e[1].joueurs[uid]; })
                            .sort(function(a, b) { return (a[1].nom || '').localeCompare(b[1].nom || ''); });

                        if (insRefuse) {
                            // rien de plus : le motif est déjà affiché au-dessus
                        } else if (!ins.valide) {
                            html2 += '<div style="background:#0f172a; border-radius:8px; padding:12px 14px; font-size:12px; color:#94a3b8;">'
                                + '<i class="fas fa-hourglass-half" style="color:#f59e0b; margin-right:6px;"></i>'
                                + 'Votre inscription est en attente de validation. Le coach vous placera ensuite dans une équipe.</div>';
                        } else if (!mesEquipes.length) {
                            html2 += '<div style="background:#0f172a; border-radius:8px; padding:12px 14px; font-size:12px; color:#94a3b8;">'
                                + '<i class="fas fa-user-clock" style="color:#00d2ff; margin-right:6px;"></i>'
                                + 'Inscription validée ! Le coach va vous placer dans une équipe — vous serez notifié(e).</div>';
                        } else {
                            mesEquipes.forEach(function(eEntry) {
                                var equipeId = eEntry[0]; var eq = eEntry[1];
                                var rencontres = Object.entries(eq.rencontres || {})
                                    .sort(function(a, b) { return (a[1].date || '').localeCompare(b[1].date || ''); });
                                html2 += '<div style="margin-bottom:12px;">';
                                html2 += '<div style="font-size:12px; color:#c9a227; font-weight:bold; margin-bottom:6px;">'
                                    + '<i class="fas fa-shield-alt" style="margin-right:4px;"></i>' + escMember(eq.nom)
                                    + ' <span style="background:#c9a22722; color:#c9a227; border:1px solid #c9a22744; border-radius:10px; padding:1px 7px; font-size:10px; margin-left:5px;">Mon équipe</span>'
                                    + (eq.niveau ? ' <span style="color:#64748b; font-weight:normal; font-size:11px;">' + escMember(eq.niveau) + '</span>' : '')
                                    + '</div>';

                                // Effectif de l'équipe (coéquipiers assignés par le coach)
                                var coequipiers = Object.keys(eq.joueurs || {}).filter(function(jUid) { return jUid !== uid; })
                                    .map(function(jUid) {
                                        var mj = membresMap[jUid] || {};
                                        var nomJ = ((mj.prenom || '') + ' ' + (mj.nom || '')).trim();
                                        return nomJ ? nomJ + (mj.classement ? ' (' + mj.classement + ')' : '') : null;
                                    })
                                    .filter(function(n) { return n; })
                                    .sort(function(a, b) { return a.localeCompare(b, 'fr'); });
                                if (coequipiers.length) {
                                    html2 += '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-bottom:8px;">'
                                        + '<span style="font-size:11px; color:#64748b;"><i class="fas fa-users" style="margin-right:4px;"></i>Avec :</span>'
                                        + coequipiers.map(function(n) {
                                            return '<span style="background:#0f172a; color:#94a3b8; border:1px solid #33415566; border-radius:10px; padding:2px 9px; font-size:11px;">' + escMember(n) + '</span>';
                                          }).join('')
                                        + '</div>';
                                } else {
                                    html2 += '<div style="font-size:11px; color:#64748b; margin-bottom:8px;"><i class="fas fa-users" style="margin-right:4px;"></i>Vous êtes pour l\'instant seul(e) dans cette équipe.</div>';
                                }

                                // Bouton discussion d'équipe (avec pastille non-lu remplie après coup)
                                html2 += '<button onclick="window.ouvrirChatEquipe(\'' + equipeId + '\',\'' + escMember(eq.nom || 'Équipe').replace(/'/g, '\\\'') + '\')" '
                                    + 'style="position:relative; background:rgba(0,210,255,0.1); color:#00d2ff; border:1px solid rgba(0,210,255,0.3); padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold; margin-bottom:10px;">'
                                    + '<i class="fas fa-comments" style="margin-right:6px;"></i>Discussion d\'équipe'
                                    + '<span id="chat-badge-' + equipeId + '" style="display:none; position:absolute; top:-4px; right:-4px; width:10px; height:10px; background:#e11d48; border-radius:50%; border:2px solid #1e293b;"></span>'
                                    + '</button>';
                                chatEquipeIds.push(equipeId);
                                if (!rencontres.length) {
                                    html2 += '<p style="color:#475569; font-size:12px; padding:4px 0 4px 16px;">Aucune rencontre planifiée pour l\'instant.</p>';
                                } else {
                                    html2 += '<div style="font-size:11px; color:#64748b; margin-bottom:6px;">Indiquez vos disponibilités — elles sont enregistrées immédiatement et visibles par le coach :</div>';
                                    html2 += '<div style="display:grid; gap:6px;">';
                                    rencontres.forEach(function(rEntry) {
                                        var rid = rEntry[0]; var r = rEntry[1];
                                        var domLabel = r.domicile ? '🏠' : '🚌';
                                        var dateInfo = '<div style="font-size:12px; color:#e2e8f0;">' + domLabel + ' ' + escMember(r.date) + ' ' + escMember(r.heure || '') + (r.adversaire ? ' — vs ' + escMember(r.adversaire) : '') + '</div>';
                                        var dispoKey = equipeId + '_' + rid;
                                        var isDispo = dispos[dispoKey];
                                        var convRid = eq.convocations && eq.convocations[rid];
                                        var isConvoque = convRid && convRid.validee && (Object.values(convRid.positions || {}).indexOf(uid) !== -1);
                                        html2 += '<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#0f172a; border-radius:8px; flex-wrap:wrap; gap:8px;">'
                                            + dateInfo
                                            + '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">'
                                            + (isConvoque ? '<span style="background:#c9a22722; color:#c9a227; border:1px solid #c9a22766; border-radius:6px; padding:3px 8px; font-size:10px; white-space:nowrap;"><i class="fas fa-shield-alt" style="margin-right:3px;"></i>Convoqué(e)</span>' : '')
                                            + '<button onclick="window.toggleDisponibilite(\'' + champId + '\',\'' + uid + '\',\'' + dispoKey + '\',true)" style="background:' + (isDispo === true ? '#22c55e' : '#1e293b') + '; color:' + (isDispo === true ? 'white' : '#22c55e') + '; border:1px solid #22c55e44; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:11px;"><i class="fas fa-check"></i> Dispo</button>'
                                            + '<button onclick="window.toggleDisponibilite(\'' + champId + '\',\'' + uid + '\',\'' + dispoKey + '\',false)" style="background:' + (isDispo === false ? '#ef4444' : '#1e293b') + '; color:' + (isDispo === false ? 'white' : '#ef4444') + '; border:1px solid #ef444444; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:11px;"><i class="fas fa-times"></i> Indispo</button>'
                                            + '</div></div>';
                                    });
                                    html2 += '</div>';
                                }
                                html2 += '</div>';
                            });
                        }
                        html2 += '</div>';
                    });
                    if (mesChEl) mesChEl.innerHTML = html2;
                    chatEquipeIds.forEach(_checkChatBadge);
                }

                // ---- Section C : mes convocations ----
                var convocations = [];
                snapEquipes.forEach(function(eqChild) {
                    var eq = eqChild.val(); var eqId = eqChild.key;
                    if (!eq || !eq.joueurs || !eq.joueurs[uid]) return;
                    if (!eq.convocations) return;
                    var champId = eq.champId;
                    Object.entries(eq.convocations).forEach(function(entry) {
                        var rencontreId = entry[0]; var conv = entry[1];
                        if (!conv.validee) return;
                        var myPos = null;
                        Object.entries(conv.positions || {}).forEach(function(p) { if (p[1] === uid) myPos = _posLabelMember(p[0]); });
                        if (!myPos) return;
                        var r = (eq.rencontres && eq.rencontres[rencontreId]) || {};
                        var myRep = (conv.reponses && conv.reponses[uid]) ? conv.reponses[uid].statut : null;
                        convocations.push({ equipeNom: eq.nom, champNom: (champs[champId] || {}).nom, champId: champId, equipeId: eqId, rencontreId: rencontreId, r: r, myPos: myPos, positions: conv.positions || {}, myRep: myRep });
                    });
                });

                // Récupérer les données complètes (nom + téléphone) de tous les joueurs convoqués
                var convUids = [];
                convocations.forEach(function(cv) {
                    Object.values(cv.positions).forEach(function(pUid) {
                        if (pUid && convUids.indexOf(pUid) === -1) convUids.push(pUid);
                    });
                });

                function _renderConvocations() {
                if (!convocations.length) {
                    if (convEl) convEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">Aucune convocation pour l\'instant.</p>';
                } else {
                    var html3 = convocations.map(function(cv) {
                        var domBadge = cv.r.domicile
                            ? '<span style="display:inline-flex; align-items:center; gap:5px; background:#22c55e18; color:#22c55e; border:1px solid #22c55e44; border-radius:20px; padding:3px 10px; font-size:12px; font-weight:600;"><span style="font-size:18px; line-height:1;">🏠</span>Domicile</span>'
                            : '<span style="display:inline-flex; align-items:center; gap:5px; background:#f59e0b18; color:#f59e0b; border:1px solid #f59e0b44; border-radius:20px; padding:3px 10px; font-size:12px; font-weight:600;"><span style="font-size:18px; line-height:1;">🚌</span>Extérieur</span>';

                        // --- Composition de l'équipe (ordre dérivé des positions réellement remplies) ---
                        var posOrder = [];
                        Object.keys(cv.positions).forEach(function(pk) {
                            var base = pk.replace(/_B$/, '_A');
                            if (posOrder.indexOf(base) === -1) posOrder.push(base);
                        });
                        posOrder.sort(function(a, b) {
                            var rank = function(p) { return (p.indexOf('double') === 0 ? '2' : '1') + p; };
                            return rank(a).localeCompare(rank(b));
                        });

                        // Partenaire en double (si le membre est en double)
                        var partenaireHtml = '';
                        Object.entries(cv.positions).forEach(function(entry) {
                            var pos = entry[0]; var pUid = entry[1];
                            if (pUid !== uid || !pos.startsWith('double')) return;
                            var partnerKey = pos.endsWith('_A') ? pos.replace('_A','_B') : pos.replace('_B','_A');
                            var partnerUid = cv.positions[partnerKey];
                            if (partnerUid) {
                                var pm = membresMap[partnerUid] || {};
                                var pName = ((pm.prenom || '') + ' ' + (pm.nom || '')).trim() || '?';
                                var pClass = pm.classement ? ' (' + pm.classement + ')' : '';
                                var pTel = pm.telephone || '';
                                partenaireHtml = '<div style="background:#00d2ff11; border:1px solid #00d2ff33; border-radius:7px; padding:8px 10px; margin-top:8px; font-size:12px; color:#00d2ff;">'
                                    + '<div><i class="fas fa-handshake" style="margin-right:5px;"></i>Votre partenaire : <strong>' + escMember(pName + pClass) + '</strong></div>'
                                    + (pTel ? '<div style="display:flex; gap:6px; margin-top:6px;">'
                                        + '<a href="tel:' + escMember(pTel) + '" style="display:inline-flex;align-items:center;gap:4px;background:#22c55e18;color:#22c55e;border:1px solid #22c55e44;border-radius:8px;padding:3px 9px;font-size:10px;text-decoration:none;"><i class="fas fa-phone" style="font-size:9px;"></i>Appeler</a>'
                                        + '<a href="sms:' + escMember(pTel) + '" style="display:inline-flex;align-items:center;gap:4px;background:#3b82f618;color:#60a5fa;border:1px solid #3b82f644;border-radius:8px;padding:3px 9px;font-size:10px;text-decoration:none;"><i class="fas fa-comment-sms" style="font-size:9px;"></i>SMS</a>'
                                        + '</div>' : '')
                                    + '</div>';
                            }
                        });

                        // Lignes de composition
                        var doublesTraites = {};
                        var lignes = [];
                        posOrder.forEach(function(pos) {
                            var posUid = cv.positions[pos];
                            if (!posUid && !cv.positions[pos.replace('_A','_B')]) return;
                            if (pos.startsWith('double')) {
                                var num = pos.match(/double(\d+)/)[1];
                                if (doublesTraites[num]) return;
                                doublesTraites[num] = true;
                                var keyA = 'double' + num + '_A'; var keyB = 'double' + num + '_B';
                                var uidA = cv.positions[keyA]; var uidB = cv.positions[keyB];
                                if (!uidA && !uidB) return;
                                var mA = uidA ? (membresMap[uidA] || {}) : null;
                                var mB = uidB ? (membresMap[uidB] || {}) : null;
                                var nameA = mA ? (((mA.prenom||'') + ' ' + (mA.nom||'')).trim() || '?') + (mA.classement ? ' (' + mA.classement + ')' : '') : '?';
                                var nameB = mB ? (((mB.prenom||'') + ' ' + (mB.nom||'')).trim() || '?') + (mB.classement ? ' (' + mB.classement + ')' : '') : '?';
                                var telA = mA ? (mA.telephone || '') : '';
                                var telB = mB ? (mB.telephone || '') : '';
                                lignes.push({ label: 'D' + num, text: escMember(nameA), tel: telA, isMe: uidA === uid, isDouble: true });
                                if (uidB) lignes.push({ label: '↳', text: escMember(nameB), tel: telB, isMe: uidB === uid, isDouble: true });
                            } else {
                                if (!posUid) return;
                                var m = membresMap[posUid] || {};
                                var name = (((m.prenom||'') + ' ' + (m.nom||'')).trim()) || '?';
                                var cls = m.classement ? ' (' + m.classement + ')' : '';
                                var tel = m.telephone || '';
                                lignes.push({ label: 'S' + (pos.match(/\d+/) || ['?'])[0], text: escMember(name + cls), tel: tel, isMe: posUid === uid, isDouble: false });
                            }
                        });

                        var compositionHtml = '';
                        if (lignes.length) {
                            compositionHtml = '<div style="border-top:1px solid rgba(255,255,255,0.08); margin-top:10px; padding-top:10px;">'
                                + '<div style="font-size:10px; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Composition de l\'équipe</div>'
                                + '<div style="display:grid; gap:4px;">'
                                + lignes.map(function(l) {
                                    var bg = l.isMe ? 'background:#c9a22715; border:1px solid #c9a22740;' : 'background:#0f172a; border:1px solid transparent;';
                                    var labelColor = l.isDouble ? '#60a5fa' : '#c9a227';
                                    var textColor = l.isMe ? '#e2e8f0' : '#94a3b8';
                                    var phoneHtml = (!l.isMe && l.tel)
                                        ? '<div style="display:flex;gap:4px;flex-shrink:0;margin-left:auto;">'
                                            + '<a href="tel:' + escMember(l.tel) + '" style="display:inline-flex;align-items:center;gap:2px;background:#22c55e18;color:#22c55e;border:1px solid #22c55e33;border-radius:7px;padding:2px 7px;font-size:9px;text-decoration:none;" title="Appeler"><i class="fas fa-phone" style="font-size:8px;"></i></a>'
                                            + '<a href="sms:' + escMember(l.tel) + '" style="display:inline-flex;align-items:center;gap:2px;background:#3b82f618;color:#60a5fa;border:1px solid #3b82f633;border-radius:7px;padding:2px 7px;font-size:9px;text-decoration:none;" title="SMS"><i class="fas fa-comment-sms" style="font-size:8px;"></i></a>'
                                            + '</div>'
                                        : '';
                                    return '<div style="display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:6px; ' + bg + '">'
                                        + '<span style="background:' + labelColor + '22; color:' + labelColor + '; border:1px solid ' + labelColor + '44; border-radius:4px; padding:1px 5px; font-size:9px; font-weight:bold; min-width:20px; text-align:center;">' + escMember(l.label) + '</span>'
                                        + '<span style="font-size:12px; color:' + textColor + '; flex:1;">' + l.text + (l.isMe ? ' <span style="color:#c9a227; font-size:10px;">(vous)</span>' : '') + '</span>'
                                        + phoneHtml
                                        + '</div>';
                                }).join('')
                                + '</div>'
                                + partenaireHtml
                                + '</div>';
                        }

                        // --- Réponse à la convocation ---
                        var isConf = cv.myRep === 'confirme';
                        var isDecl = cv.myRep === 'decline';
                        var reponseHtml = '<div style="border-top:1px solid rgba(255,255,255,0.08); margin-top:12px; padding-top:12px;">'
                            + '<div style="font-size:10px; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Votre réponse</div>'
                            + '<div style="display:flex; gap:8px; flex-wrap:wrap;">'
                            + '<button onclick="window.repondreConvocation(\'' + cv.equipeId + '\',\'' + cv.rencontreId + '\',\'confirme\')" '
                            + 'style="flex:1; min-width:140px; background:' + (isConf ? '#22c55e' : '#1e293b') + '; color:' + (isConf ? 'white' : '#22c55e') + '; border:1px solid #22c55e55; padding:10px 14px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">'
                            + '<i class="fas fa-check" style="margin-right:5px;"></i>' + (isConf ? 'Présence confirmée' : 'Je confirme ma présence') + '</button>'
                            + '<button onclick="window.repondreConvocation(\'' + cv.equipeId + '\',\'' + cv.rencontreId + '\',\'decline\')" '
                            + 'style="flex:1; min-width:140px; background:' + (isDecl ? '#ef4444' : '#1e293b') + '; color:' + (isDecl ? 'white' : '#ef4444') + '; border:1px solid #ef444455; padding:10px 14px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">'
                            + '<i class="fas fa-times" style="margin-right:5px;"></i>' + (isDecl ? 'Désistement envoyé' : 'Je ne peux pas') + '</button>'
                            + '</div>'
                            + (!cv.myRep ? '<p style="font-size:11px; color:#64748b; margin:8px 0 0;">Merci de répondre pour que le coach sache sur qui compter.</p>' : '')
                            + (isDecl ? '<p style="font-size:11px; color:#f59e0b; margin:8px 0 0;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Le coach est informé et pourra vous remplacer. Prévenez-le aussi directement si possible.</p>' : '')
                            + '</div>';

                        return '<div style="background:linear-gradient(135deg,rgba(225,29,72,0.1),rgba(0,210,255,0.05)); border:1px solid ' + (isDecl ? 'rgba(239,68,68,0.5)' : isConf ? 'rgba(34,197,94,0.45)' : 'rgba(225,29,72,0.4)') + '; border-radius:12px; padding:16px;">'
                            + '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">'
                            + '<i class="fas fa-bell" style="color:#e11d48; font-size:16px;"></i>'
                            + '<span style="font-weight:bold; color:#e2e8f0;">' + escMember(cv.equipeNom) + '</span>'
                            + '<span style="background:#00d2ff22; color:#00d2ff; border:1px solid #00d2ff44; border-radius:12px; padding:2px 10px; font-size:11px;">' + escMember(cv.myPos) + '</span>'
                            + '</div>'
                            + '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">'
                            + domBadge
                            + (cv.r.date ? '<span style="font-size:13px; color:#94a3b8;"><i class="fas fa-calendar-alt" style="margin-right:4px; color:#64748b;"></i>' + escMember(cv.r.date) + (cv.r.heure ? ' à ' + escMember(cv.r.heure) : '') + '</span>' : '')
                            + '</div>'
                            + (cv.r.adversaire ? '<div style="font-size:13px; color:#e2e8f0; margin-bottom:4px;"><span style="color:#64748b; margin-right:4px;">vs</span><strong>' + escMember(cv.r.adversaire) + '</strong></div>' : '')
                            + (cv.r.lieu ? '<div style="font-size:12px; color:#64748b;"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>' + escMember(cv.r.lieu) + '</div>' : '')
                            + compositionHtml
                            + reponseHtml
                            + '</div>';
                    }).join('');
                    if (convEl) convEl.innerHTML = html3;
                }
                checkEquipesBadge(uid);
                } // fin _renderConvocations

                if (convUids.length) {
                    Promise.all(convUids.map(function(mUid) {
                        return window.db_ref.ref('members/' + mUid).once('value').then(function(s) {
                            var d = s.val() || {};
                            var ex = membresMap[mUid] || {};
                            membresMap[mUid] = {
                                prenom:     d.prenom     || ex.prenom     || '',
                                nom:        d.nom        || ex.nom        || '',
                                classement: d.classement || ex.classement || '',
                                telephone:  d.telephone  || ''
                            };
                        }).catch(function() {});
                    })).then(_renderConvocations);
                } else {
                    _renderConvocations();
                }
            });
        });
    });
}

// --- Classement FFT ---
var _CLASSEMENTS_FFT = ['-15','-4/6','-2/6','0','1/6','2/6','3/6','4/6','5/6','15','15/1','15/2','15/3','15/4','15/5','30','30/1','30/2','30/3','30/4','30/5','40','NC'];

// Inscription en 1 clic : le membre s'inscrit au championnat, le coach compose les équipes
window.inscrireChampionnat = async function(champId) {
    var c = _equipesChampData[champId]; if (!c) return;
    var uid = _cardMemberData ? _cardMemberData._uid : null;
    if (!uid) return;

    var message = 'Vous inscrire au championnat « ' + c.nom + ' » ?\n\nLe coach validera votre inscription et vous placera dans une équipe. Vous pourrez ensuite indiquer vos disponibilités.';
    var ok;
    if (window.confirmDialog && window.confirmDialog.show) {
        ok = await window.confirmDialog.show({ title: 'S\'inscrire au championnat', message: message, type: 'info', confirmText: 'Je m\'inscris', cancelText: 'Annuler' });
    } else {
        ok = confirm(message);
    }
    if (!ok) return;

    var data = {
        prenom: _cardMemberData.prenom || '',
        nom: _cardMemberData.nom || '',
        classement: _cardMemberData.classement || '',
        valide: false,
        createdAt: Date.now()
    };
    window.db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).set(data).then(function() {
        window.showNotification && window.showNotification('Inscription envoyée — le coach va la valider.', 'success');
        _equipesLoaded = false;
        loadEquipesMember(uid);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur lors de l\'inscription : ' + (err.message || err), 'error');
    });
};

window.annulerInscription = async function(champId, uid) {
    var msg = 'Retirer votre inscription à ce championnat ? Vous serez aussi retiré(e) de votre équipe.';
    if (!window.confirmDialog) {
        if (!confirm(msg)) return;
    } else {
        var ok = await window.confirmDialog.show({ title: 'Se désinscrire', message: msg, type: 'danger', confirmText: 'Confirmer', cancelText: 'Annuler' });
        if (!ok) return;
    }
    window.db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).remove().then(function() {
        // Se retirer aussi des effectifs des équipes de ce championnat (autorisé par les règles)
        window.db_ref.ref('equipes').orderByChild('champId').equalTo(champId).once('value', function(snapEq) {
            snapEq.forEach(function(child) {
                var eq = child.val();
                if (eq && eq.joueurs && eq.joueurs[uid]) {
                    window.db_ref.ref('equipes/' + child.key + '/joueurs/' + uid).remove().catch(function() {});
                }
            });
        });
        window.showNotification && window.showNotification('Désinscription effectuée.', 'success');
        _equipesLoaded = false;
        loadEquipesMember(uid);
    });
};

window.toggleDisponibilite = function(champId, uid, rencontreId, valeur) {
    var ref = window.db_ref.ref('inscriptions_equipe/' + champId + '/' + uid + '/disponibilites/' + rencontreId);
    ref.set(valeur).then(function() {
        window.showNotification && window.showNotification(valeur ? 'Disponibilité enregistrée ✓' : 'Indisponibilité enregistrée — le coach le verra.', 'success');
        _equipesLoaded = false;
        loadEquipesMember(uid);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur enregistrement : ' + (err.message || err), 'error');
    });
};

// Réponse du membre à une convocation validée (confirme / decline)
window.repondreConvocation = function(equipeId, rencontreId, statut) {
    var uid = _cardMemberData ? _cardMemberData._uid : null;
    if (!uid) return;
    window.db_ref.ref('equipes/' + equipeId + '/convocations/' + rencontreId + '/reponses/' + uid).set({
        statut: statut, at: Date.now()
    }).then(function() {
        window.showNotification && window.showNotification(
            statut === 'confirme' ? 'Présence confirmée — merci !' : 'Désistement enregistré — le coach en est informé.',
            statut === 'confirme' ? 'success' : 'info'
        );
        _equipesLoaded = false;
        loadEquipesMember(uid);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur : ' + (err.message || err), 'error');
    });
};

// ============================================================
// DISCUSSION D'ÉQUIPE (chat entre coéquipiers + coach)
// ============================================================

var _chatEquipeId = null;
var _chatListenerRef = null;

// Pastille rouge sur le bouton discussion si le dernier message est plus récent que la dernière ouverture
function _checkChatBadge(equipeId) {
    window.db_ref.ref('chats_equipe/' + equipeId).orderByChild('createdAt').limitToLast(1).once('value', function(snap) {
        if (!snap.exists()) return;
        var lastAt = 0; var lastUid = null;
        snap.forEach(function(child) { lastAt = child.val().createdAt || 0; lastUid = child.val().uid; });
        var myUid = _cardMemberData ? _cardMemberData._uid : null;
        var seenAt = parseInt(localStorage.getItem('usm_chat_seen_' + equipeId) || '0', 10);
        var badge = document.getElementById('chat-badge-' + equipeId);
        if (badge && lastAt > seenAt && lastUid !== myUid) badge.style.display = 'block';
    });
}

function _renderChatMessage(msgId, m, myUid) {
    var isMe = m.uid === myUid;
    var isCoach = m.role === 'coach';
    var auteur = isCoach ? ('Coach' + ((m.prenom || m.nom) ? ' ' + ((m.prenom || '') + ' ' + (m.nom || '')).trim() : ''))
                         : (((m.prenom || '') + ' ' + (m.nom || '')).trim() || 'Membre');
    var heure = m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    var bulle = document.createElement('div');
    bulle.id = 'chat-msg-' + msgId;
    bulle.style.cssText = 'max-width:80%; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.4; word-break:break-word; position:relative; '
        + (isMe ? 'align-self:flex-end; background:rgba(0,210,255,0.14); border:1px solid rgba(0,210,255,0.25); color:#e2e8f0; border-bottom-right-radius:4px;'
                : isCoach ? 'align-self:flex-start; background:rgba(201,162,39,0.12); border:1px solid rgba(201,162,39,0.35); color:#e2e8f0; border-bottom-left-radius:4px;'
                          : 'align-self:flex-start; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-bottom-left-radius:4px;');
    bulle.innerHTML = '<div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">'
        + '<span style="font-size:10px; font-weight:bold; color:' + (isCoach ? '#c9a227' : isMe ? '#00d2ff' : '#94a3b8') + ';">'
        + (isCoach ? '<i class="fas fa-user-tie" style="margin-right:3px;"></i>' : '') + escMember(auteur) + (isMe ? ' (vous)' : '') + '</span>'
        + '<span style="font-size:9px; color:#475569;">' + heure + '</span>'
        + (isMe ? '<button onclick="window.supprimerMessageChat(\'' + msgId + '\')" title="Supprimer" style="background:none; border:none; color:#475569; cursor:pointer; font-size:10px; padding:0 2px; margin-left:auto;"><i class="fas fa-trash"></i></button>' : '')
        + '</div>'
        + '<div>' + escMember(m.texte || '') + '</div>';
    return bulle;
}

window.ouvrirChatEquipe = function(equipeId, eqNom) {
    _chatEquipeId = equipeId;
    var myUid = _cardMemberData ? _cardMemberData._uid : null;
    document.getElementById('chat-equipe-nom').textContent = 'Discussion — ' + eqNom;
    var box = document.getElementById('chat-equipe-messages');
    box.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></p>';
    document.getElementById('modal-chat-equipe').style.display = '';

    // Marquer comme lu + masquer la pastille
    localStorage.setItem('usm_chat_seen_' + equipeId, String(Date.now()));
    var badge = document.getElementById('chat-badge-' + equipeId);
    if (badge) badge.style.display = 'none';

    // Écoute temps réel des 100 derniers messages
    _chatListenerRef = window.db_ref.ref('chats_equipe/' + equipeId).orderByChild('createdAt').limitToLast(100);
    var first = true;
    _chatListenerRef.on('child_added', function(child) {
        if (first) { box.innerHTML = ''; first = false; }
        box.appendChild(_renderChatMessage(child.key, child.val() || {}, myUid));
        box.scrollTop = box.scrollHeight;
        localStorage.setItem('usm_chat_seen_' + equipeId, String(Date.now()));
    });
    _chatListenerRef.on('child_removed', function(child) {
        var el = document.getElementById('chat-msg-' + child.key);
        if (el) el.remove();
    });
    // Si aucun message après un court délai, afficher l'invite
    setTimeout(function() {
        if (first && _chatEquipeId === equipeId) {
            box.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center; margin:auto;">Aucun message pour l\'instant.<br>Lancez la discussion : covoiturage, qui apporte quoi… 🎾</p>';
            first = false;
        }
    }, 1200);

    // Envoi avec la touche Entrée
    var input = document.getElementById('chat-equipe-input');
    input.value = '';
    input.onkeydown = function(e) { if (e.key === 'Enter') window.envoyerMessageChat(); };
    setTimeout(function() { input.focus(); }, 200);
};

window.fermerChatEquipe = function() {
    document.getElementById('modal-chat-equipe').style.display = 'none';
    if (_chatListenerRef) { _chatListenerRef.off(); _chatListenerRef = null; }
    if (_chatEquipeId) localStorage.setItem('usm_chat_seen_' + _chatEquipeId, String(Date.now()));
    _chatEquipeId = null;
};

window.envoyerMessageChat = function() {
    var input = document.getElementById('chat-equipe-input');
    var texte = (input.value || '').trim();
    if (!texte || !_chatEquipeId) return;
    var myUid = _cardMemberData ? _cardMemberData._uid : null;
    if (!myUid) return;
    input.value = '';
    window.db_ref.ref('chats_equipe/' + _chatEquipeId).push({
        uid: myUid,
        prenom: _cardMemberData.prenom || '',
        nom: _cardMemberData.nom || '',
        texte: texte,
        createdAt: Date.now()
    }).catch(function(err) {
        input.value = texte;
        window.showNotification && window.showNotification('Message non envoyé : ' + (err.message || err), 'error');
    });
};

window.supprimerMessageChat = function(msgId) {
    if (!_chatEquipeId) return;
    window.db_ref.ref('chats_equipe/' + _chatEquipeId + '/' + msgId).remove().catch(function(err) {
        window.showNotification && window.showNotification('Suppression impossible : ' + (err.message || err), 'error');
    });
};

function checkEquipesBadge(uid) {
    var seenAt = parseInt(localStorage.getItem('usm_equipes_seen_at') || '0', 10);
    window.db_ref.ref('notifications_equipe').orderByChild('uid').equalTo(uid).once('value', function(snap) {
        var hasNew = false;
        snap.forEach(function(child) {
            var n = child.val();
            if (!n.lue && n.createdAt > seenAt) hasNew = true;
        });
        var badge = document.getElementById('equipes-badge');
        if (badge) badge.style.display = hasNew ? 'block' : 'none';
    });
}

// ============================================================
// NOTIFICATIONS PUSH ÉQUIPES — abonnement ciblé par uid
// ============================================================

var VAPID_PUBLIC_KEY_MEMBER = 'BE_V9DmFlRDbPfnWrrtY4xneo1xP9tOtf7-mj7qLFjCM3A-36aiXORjlQDpEynZLdsKEH-P9UsAl48TvrT2dXXQ';

/** Sauvegarde l'endpoint push dans push_subscriptions_membres/{uid}/{tokenHash} */
function saveMemberSubscription(uid, subscription) {
    var data = subscription.toJSON();
    var tokenHash = btoa(data.endpoint).replace(/[^a-zA-Z0-9]/g, '').substring(0, 28);
    return window.db_ref.ref('push_subscriptions_membres/' + uid + '/' + tokenHash).set({
        token: data.endpoint, keys: data.keys, subscribedAt: Date.now()
    });
}

/** Supprime l'endpoint push de push_subscriptions_membres/{uid} */
function removeMemberSubscription(uid, subscription) {
    var tokenHash = btoa(subscription.endpoint).replace(/[^a-zA-Z0-9]/g, '').substring(0, 28);
    return window.db_ref.ref('push_subscriptions_membres/' + uid + '/' + tokenHash).remove();
}

/** S'abonne aux push convocations pour ce membre */
window.subscribeMemberPush = async function(uid) {
    var toUint8 = window.urlBase64ToUint8Array;
    if (!toUint8 || !window.isPushSupported || !window.isPushSupported()) {
        window.showNotification && window.showNotification('Votre navigateur ne supporte pas les notifications push.', 'error');
        return;
    }
    try {
        var permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            window.showNotification && window.showNotification('Permission refusée — vous pouvez l\'activer dans les paramètres du navigateur.', 'warning');
            return;
        }
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toUint8(VAPID_PUBLIC_KEY_MEMBER)
        });
        await saveMemberSubscription(uid, sub);
        window.showNotification && window.showNotification('Notifications convocations activées !', 'success');
        _updateMemberPushBtn(uid);
    } catch (err) {
        console.error('[subscribeMemberPush]', err);
        window.showNotification && window.showNotification('Impossible d\'activer les notifications : ' + (err.message || err), 'error');
    }
};

/** Se désabonne des push convocations */
window.unsubscribeMemberPush = async function(uid) {
    try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
            await removeMemberSubscription(uid, sub);
            await sub.unsubscribe();
        }
        window.showNotification && window.showNotification('Notifications convocations désactivées.', 'info');
        _updateMemberPushBtn(uid);
    } catch (err) {
        console.error('[unsubscribeMemberPush]', err);
    }
};

/** Met à jour l'état du bouton push dans l'onglet équipes */
async function _updateMemberPushBtn(uid) {
    var btn = document.getElementById('member-equipes-push-btn');
    if (!btn) return;
    if (!window.isPushSupported || !window.isPushSupported()) {
        btn.style.display = 'none'; return;
    }
    var perm = Notification.permission;
    if (perm === 'denied') {
        btn.innerHTML = '<i class="fas fa-bell-slash" style="margin-right:6px;"></i>Notifications bloquées';
        btn.style.background = 'rgba(100,116,139,0.2)'; btn.style.color = '#64748b';
        btn.disabled = true; return;
    }
    try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
            btn.innerHTML = '<i class="fas fa-bell" style="margin-right:6px;"></i>Notifications activées';
            btn.style.background = 'rgba(34,197,94,0.15)'; btn.style.color = '#22c55e';
            btn.style.borderColor = 'rgba(34,197,94,0.4)';
            btn.disabled = false;
            btn.onclick = function() { window.unsubscribeMemberPush(uid); };
        } else {
            btn.innerHTML = '<i class="fas fa-bell" style="margin-right:6px;"></i>Activer notifications convocations';
            btn.style.background = 'rgba(0,210,255,0.1)'; btn.style.color = '#00d2ff';
            btn.style.borderColor = 'rgba(0,210,255,0.3)';
            btn.disabled = false;
            btn.onclick = function() { window.subscribeMemberPush(uid); };
        }
    } catch(e) { btn.style.display = 'none'; }
}

/** Insère le bouton push dans l'onglet équipes après chargement */
window.initMemberPushBtn = function(uid) {
    var container = document.getElementById('equipes-push-container');
    if (!container) return;
    if (!window.isPushSupported || !window.isPushSupported()) { container.style.display = 'none'; return; }
    container.innerHTML = '<button id="member-equipes-push-btn" '
        + 'style="border:1px solid rgba(0,210,255,0.3); border-radius:8px; padding:8px 16px; cursor:pointer; '
        + 'font-size:12px; font-family:inherit; transition:all .2s;">'
        + '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Chargement...</button>';
    _updateMemberPushBtn(uid);
};

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

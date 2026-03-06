// ============================================================
// ESPACE MEMBRE — member.js
// Chargé dynamiquement après connexion d'un membre
// ============================================================

// Données mémorisées pour la génération de carte
let _cardMemberData = null;
let _cardSponsors = [];

// Initialisation du dashboard avec les données du membre
window.initMemberDashboard = function(memberData) {
    _cardMemberData = memberData;

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
        statutEl.innerHTML = `<i class="fas fa-star" style="font-size:0.6rem;"></i> ${statut}`;
        if (statutWrap) statutWrap.style.display = 'block';
    }
    const vipYearEl = document.getElementById('vip-card-year');
    if (vipYearEl) vipYearEl.textContent = `Saison ${new Date().getFullYear()}`;

    // QR Code (URL vers page de vérification membre)
    const qrEl = document.getElementById('vip-qrcode');
    if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        const memberUid = memberData._uid || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '');
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${prenom} ${nom}`;
        new QRCode(qrEl, {
            text: qrContent,
            width: 100,
            height: 100,
            colorDark: '#0d1b2e',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });
    }

    // --- Année en cours dans l'onglet club ---
    const yearEl = document.getElementById('member-tournaments-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // --- Charger les tournois et les sponsors ---
    loadMemberTournaments();
    loadMemberSponsors();
};

// --- Chargement des tournois depuis /tournaments/ ---
function loadMemberTournaments() {
    const grid = document.getElementById('member-tournaments-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';

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

    grid.innerHTML = '<div class="member-empty-state"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';

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

// --- Navigation onglets ---
window.switchMemberTab = function(tab) {
    ['profil', 'club', 'partenaires'].forEach(t => {
        const content = document.getElementById(`mtab-${t}`);
        const btn = document.getElementById(`mtab-btn-${t}`);
        if (content) content.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
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
window.downloadMemberCard = async function() {
    if (!_cardMemberData) return;
    if (typeof html2canvas === 'undefined') {
        window.showErrorMessage && window.showErrorMessage({ message: 'Librairie non chargée, réessayez.' }, 'download');
        return;
    }

    const cardEl = document.getElementById('member-card-print');
    if (!cardEl) return;

    // Toujours recharger les sponsors depuis Firebase avant de générer la carte
    // (garantit la fraîcheur des données et évite le verso vide)
    if (window.db_ref) {
        await new Promise(resolve => {
            window.db_ref.ref('sponsors').once('value', snap => {
                const data = snap.val();
                if (data) {
                    const items = Array.isArray(data) ? data : Object.values(data);
                    _cardSponsors = items.filter(s => s && !s.draft);
                } else {
                    _cardSponsors = [];
                }
                resolve();
            });
        });
    }

    // Pré-charger les logos sponsors en base64 pour éviter les carrés blancs CORS
    const sponsorsPreloaded = await preloadSponsorLogos(_cardSponsors);

    // Construire le contenu de la carte avec inline styles (fiable pour html2canvas)
    cardEl.innerHTML = buildCardHtml(_cardMemberData, sponsorsPreloaded);

    // Rendre visible hors écran et capturer
    cardEl.style.left = '-9999px';
    cardEl.style.display = 'block';

    // Générer le QR code dans la carte (URL de vérification)
    const qrContainer = cardEl.querySelector('#card-print-qr');
    if (qrContainer && typeof QRCode !== 'undefined') {
        const memberUid = window.auth && window.auth.currentUser ? window.auth.currentUser.uid : '';
        const qrContent = memberUid
            ? `https://tennismontargis.fr/v/${memberUid}`
            : `USM Tennis Montargis | ${_cardMemberData.prenom || ''} ${_cardMemberData.nom || ''}`;
        new QRCode(qrContainer, {
            text: qrContent,
            width: 110,
            height: 110,
            colorDark: '#0d1b2e',
            colorLight: '#f5e88a',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    // Attendre le rendu QR code avant la capture
    setTimeout(() => {
        html2canvas(cardEl, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false
        }).then(canvas => {
            cardEl.style.display = 'none';
            cardEl.innerHTML = '';
            const nomFichier = (_cardMemberData.nom || 'membre').toLowerCase().replace(/\s+/g, '-');
            const filename = `carte-membre-usm-${nomFichier}.png`;
            const dataUrl = canvas.toDataURL('image/png');

            // Détection PWA installée (standalone)
            const isPWA = window.matchMedia('(display-mode: standalone)').matches
                       || window.navigator.standalone === true;

            if (isPWA) {
                // En PWA : afficher la carte dans une modale — appui long pour enregistrer
                showDownloadOverlay(dataUrl);
                return;
            }

            // Navigateur : téléchargement direct via blob URL
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
            cardEl.style.display = 'none';
            cardEl.innerHTML = '';
        });
    }, 400);
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

function buildCardHtml(m, sponsors) {
    const prenom = m.prenom || '';
    const nom = m.nom || '';
    const annee = new Date().getFullYear();

    const cardStyle = `
        width:680px;
        background:linear-gradient(145deg,#0d1b2e 0%,#112240 50%,#0a1628 100%);
        border:2px solid rgba(255,215,0,0.6);
        border-radius:20px;
        overflow:hidden;
        font-family:Arial,sans-serif;
    `;

    const headerHtml = (label) => `
        <div style="
            display:flex;align-items:center;gap:18px;
            padding:18px 28px;
            background:linear-gradient(90deg,rgba(255,215,0,0.12) 0%,rgba(255,215,0,0.04) 100%);
            border-bottom:1px solid rgba(255,215,0,0.35);
        ">
            <img src="/logo_usm_new.png" style="width:60px;height:60px;object-fit:contain;border-radius:50%;border:2px solid rgba(255,215,0,0.5);" crossorigin="anonymous" alt="USM">
            <div>
                <div style="color:#ffd700;font-size:17px;font-weight:900;letter-spacing:2px;font-family:Arial,sans-serif;">USM TENNIS MONTARGIS</div>
                <div style="color:rgba(255,215,0,0.65);font-size:11px;letter-spacing:3px;margin-top:3px;font-family:Arial,sans-serif;">${label} · SAISON ${annee}</div>
            </div>
        </div>`;

    const footerHtml = `
        <div style="text-align:center;padding:8px;border-top:1px solid rgba(255,215,0,0.15);color:rgba(255,215,0,0.3);font-size:10px;letter-spacing:1px;font-family:Arial,sans-serif;">
            tennismontargis.fr
        </div>`;

    // ── RECTO ──────────────────────────────────────────────
    const recto = `
    <div style="${cardStyle}">
        ${headerHtml('CARTE MEMBRE')}
        <div style="display:flex;align-items:center;gap:28px;padding:24px 28px 20px;">
            <div style="flex:1;">
                <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:1px;margin-bottom:10px;font-family:Arial,sans-serif;">${escMember(`${prenom} ${nom}`.toUpperCase())}</div>
                ${m.statut && m.statut !== 'Membre' ? `<div style="margin-bottom:10px;"><span style="background:rgba(255,215,0,0.14);border:1px solid rgba(255,215,0,0.5);color:#ffd700;padding:3px 14px;border-radius:20px;font-size:11px;letter-spacing:0.5px;font-family:Arial,sans-serif;">★ ${escMember(m.statut)}</span></div>` : ''}
                ${m.classement ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.4);color:#ffd700;padding:4px 14px;border-radius:20px;font-size:12px;font-family:Arial,sans-serif;">Classement : ${escMember(m.classement)}</span></div>` : ''}
                ${m.categorie  ? `<div style="margin-bottom:8px;"><span style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);color:rgba(255,215,0,0.8);padding:4px 14px;border-radius:20px;font-size:12px;font-family:Arial,sans-serif;">Catégorie : ${escMember(m.categorie)}</span></div>` : ''}
                ${m.licence    ? `<div style="margin-top:8px;"><div style="color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:1px;font-family:Arial,sans-serif;">LICENCE FFT</div><div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:2px;font-family:Arial,sans-serif;">${escMember(m.licence)}</div></div>` : ''}
            </div>
            <div style="flex-shrink:0;text-align:center;">
                <div id="card-print-qr" style="width:110px;height:110px;background:#f5e88a;border-radius:10px;padding:6px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,215,0,0.5);"></div>
                <div style="color:rgba(255,215,0,0.45);font-size:9px;margin-top:5px;letter-spacing:1px;font-family:Arial,sans-serif;">SCANNER POUR VÉRIFIER</div>
            </div>
        </div>
        ${footerHtml}
    </div>`;

    // ── VERSO ──────────────────────────────────────────────
    // Inclure tous les sponsors avec un titre (avantage optionnel)
    const sponsorsWithAvantage = (sponsors || []).filter(s => s && s.title);

    const sponsorCards = sponsorsWithAvantage.map(s => {
        // Utiliser UNIQUEMENT le base64 pré-chargé (URL directe = blanc dans html2canvas si CORS absent)
        const logoSrc = s._logoBase64;
        const initiale = (s.title || '?').charAt(0).toUpperCase();
        const logoHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;background:#fff;padding:4px;border:1px solid rgba(255,215,0,0.3);flex-shrink:0;" alt="${escMember(s.title)}">`
            : `<div style="width:56px;height:56px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.35);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffd700;font-size:22px;font-weight:900;font-family:Arial,sans-serif;">${initiale}</div>`;
        const avantageHtml = s.avantage
            ? `<div style="color:rgba(255,255,255,0.8);font-size:11px;font-family:Arial,sans-serif;line-height:1.4;">${escMember(s.avantage)}</div>`
            : '';
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.15);border-radius:10px;">
            ${logoHtml}
            <div style="flex:1;min-width:0;">
                <div style="color:#ffd700;font-size:12px;font-weight:700;font-family:Arial,sans-serif;margin-bottom:4px;">${escMember(s.title)}</div>
                ${avantageHtml}
            </div>
        </div>`;
    }).join('');

    const verso = sponsorsWithAvantage.length > 0 ? `
    <div style="${cardStyle}">
        ${headerHtml('NOS PARTENAIRES')}
        <div style="padding:20px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${sponsorCards}
        </div>
        ${footerHtml}
    </div>` : '';

    // ── WRAPPER vertical recto + verso ─────────────────────
    return `<div style="display:flex;flex-direction:column;gap:20px;width:680px;">${recto}${verso}</div>`;
}

// --- Utilitaire échappement HTML ---
function escMember(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

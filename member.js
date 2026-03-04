// ============================================================
// ESPACE MEMBRE — member.js
// Chargé dynamiquement après connexion d'un membre
// ============================================================

// Initialisation du dashboard avec les données du membre
window.initMemberDashboard = function(memberData) {
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
        const zone = document.getElementById('member-zone');
        if (zone) {
            // Remettre le placeholder pour une éventuelle reconnexion
            const ph = document.createElement('div');
            ph.id = 'member-zone-placeholder';
            zone.replaceWith(ph);
        }
        window.isCurrentUserMember = false;
        // Remettre le bouton header dans son état initial
        const btn = document.getElementById('member-btn-header');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-id-card"></i> Espace Membre';
            btn.onclick = () => document.getElementById('member-login-modal').classList.remove('hidden');
        }
        window.showSuccessMessage && window.showSuccessMessage('Déconnexion', 'À bientôt !');
    });
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

// --- LOGIQUE ADMIN MISE À PART (Chargée uniquement si auth) ---

console.log("Admin module loaded");

// Utilitaire échappement HTML (XSS protection)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(text)));
    return div.innerHTML;
}

const db_ref = firebase.database();
const storage = firebase.storage();
const auth = firebase.auth();

// === FORMATAGE TEXTE (Gras, Italique, Souligné, Lien) ===
window.formatText = function(type) {
    const textarea = document.getElementById('input-desc');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = '';

    switch(type) {
        case 'bold':
            replacement = selectedText ? `<b>${selectedText}</b>` : '<b></b>';
            break;
        case 'italic':
            replacement = selectedText ? `<i>${selectedText}</i>` : '<i></i>';
            break;
        case 'underline':
            replacement = selectedText ? `<u>${selectedText}</u>` : '<u></u>';
            break;
        case 'link':
            const url = prompt('Entrez l\'URL du lien:', 'https://');
            if (url && url !== 'https://') {
                const linkText = selectedText || 'Cliquez ici';
                replacement = `<a href="${url}">${linkText}</a>`;
            } else {
                return;
            }
            break;
    }

    // Insérer le texte formaté
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);

    // Repositionner le curseur
    const cursorPos = start + replacement.length;
    textarea.focus();
    textarea.setSelectionRange(cursorPos, cursorPos);

    // Déclencher l'autosave
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(autoSaveForm, 3000);
};

// === NOTIFICATIONS PUSH - ENVOI ===

// Fonction pour envoyer une notification push aux abonnés
async function sendPushNotification(title, body) {
    try {
        // Vérifier que l'utilisateur est connecté
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.error('Utilisateur non connecté pour envoyer la notification');
            window.toast.warning('Notification non envoyée', 'Vous devez être connecté.');
            return;
        }

        console.log('Envoi notification par:', currentUser.email);

        // Appeler la Cloud Function
        const sendNotification = firebase.functions().httpsCallable('sendNotification');
        const result = await sendNotification({
            title: title,
            body: body,
            url: 'https://tennismontargis.fr/#news-section'
        });

        if (result.data.success) {
            window.toast.info(
                'Notification envoyée',
                result.data.message || `${result.data.sent} abonné(s) notifié(s)`
            );
        }
    } catch (error) {
        console.error('Erreur envoi notification:', error);
        window.toast.warning(
            'Notification non envoyée',
            'La publication est en ligne mais la notification a échoué.'
        );
    }
}

// Afficher le nombre d'abonnés aux notifications
async function updateNotifyCount() {
    const countEl = document.getElementById('notify-count');
    if (!countEl) return;

    try {
        const snapshot = await db_ref.ref('push_subscriptions').once('value');
        const subs = snapshot.val();
        const count = subs ? Object.keys(subs).length : 0;

        if (count > 0) {
            countEl.textContent = `(${count} abonné${count > 1 ? 's' : ''})`;
        } else {
            countEl.textContent = '(Aucun abonné)';
        }
    } catch (error) {
        countEl.textContent = '';
    }
}

// Appeler au chargement de l'admin
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateNotifyCount, 1000);
});

// === SAUVEGARDE AUTOMATIQUE DES FORMULAIRES ===
let autoSaveTimer = null;
const AUTO_SAVE_KEY = 'admin_form_autosave';

function autoSaveForm() {
    const formData = {
        title: document.getElementById('input-title')?.value || '',
        desc: document.getElementById('input-desc')?.value || '',
        price: document.getElementById('input-price')?.value || '',
        email: document.getElementById('input-email')?.value || '',
        url: document.getElementById('input-url')?.value || '',
        featured: document.getElementById('input-featured')?.checked || false,
        section: document.getElementById('form-title')?.innerText.split(': ')[1]?.toLowerCase() || '',
        timestamp: Date.now()
    };

    // Sauvegarder dans localStorage
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(formData));

    // Afficher indicateur visuel temporaire
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        const originalText = submitBtn.innerText;
        submitBtn.innerText = '💾 Brouillon sauvegardé';
        setTimeout(() => {
            submitBtn.innerText = originalText;
        }, 1500);
    }
}

async function restoreAutoSave() {
    const saved = localStorage.getItem(AUTO_SAVE_KEY);
    if (!saved) return false;

    try {
        const data = JSON.parse(saved);

        // Vérifier si la sauvegarde a moins de 24h
        if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(AUTO_SAVE_KEY);
            return false;
        }

        // Demander si on veut restaurer
        const restore = await window.confirmDialog.show({
            title: 'Brouillon trouvé',
            message: 'Un brouillon non sauvegardé a été trouvé. Voulez-vous le restaurer ?',
            confirmText: 'Restaurer',
            cancelText: 'Ignorer'
        });
        if (!restore) {
            localStorage.removeItem(AUTO_SAVE_KEY);
            return false;
        }

        // Restaurer les valeurs
        if (data.title) document.getElementById('input-title').value = data.title;
        if (data.desc) document.getElementById('input-desc').value = data.desc;
        if (data.price) document.getElementById('input-price').value = data.price;
        if (data.email) document.getElementById('input-email').value = data.email;
        if (data.url) document.getElementById('input-url').value = data.url;
        if (data.featured !== undefined) document.getElementById('input-featured').checked = data.featured;

        window.showSuccessMessage('Brouillon restauré', 'Vos modifications non sauvegardées ont été récupérées.');
        return true;
    } catch (e) {
        console.error('Erreur lors de la restauration', e);
        localStorage.removeItem(AUTO_SAVE_KEY);
        return false;
    }
}

function clearAutoSave() {
    localStorage.removeItem(AUTO_SAVE_KEY);
}

// Attacher les listeners pour auto-save
function setupAutoSave() {
    const inputs = ['input-title', 'input-desc', 'input-price', 'input-email', 'input-url', 'input-featured'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                clearTimeout(autoSaveTimer);
                autoSaveTimer = setTimeout(autoSaveForm, 2000); // Sauvegarder 2s après la dernière frappe
            });
        }
    });
}

// --- GESTION DU FORMULAIRE ---
const form = document.getElementById('universal-form');
if (form) {
    // Restaurer auto-save si disponible
    setTimeout(restoreAutoSave, 500);

    // Setup auto-save
    setupAutoSave();

    // Remove old listeners to prevent duplicates if reloaded
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication en cours...';

        try {
            const index = parseInt(document.getElementById('edit-index').value);
            const title = document.getElementById('input-title').value;
            const desc = document.getElementById('input-desc').value;
            const currentSection = document.getElementById('form-title').innerText.split(': ')[1].toLowerCase();

            if (currentSection === 'info') {
                const info = {
                    address: title,
                    phone: desc,
                    email: document.getElementById('input-email').value
                };
                await db_ref.ref('info').set(info);
            } else {
                const price = document.getElementById('input-price').value;
                const fileInput = document.getElementById('input-file');

                // Temp images from window (set during edit)
                let existingImages = window.tempImages || [];
                let newImageUrls = [];

                if (fileInput.files.length > 0) {
                    const files = Array.from(fileInput.files);
                    const totalFiles = files.length;
                    const maxImages = 5;

                    // Vérifier le nombre total d'images (existantes + nouvelles)
                    const totalImages = existingImages.length + totalFiles;
                    if (totalImages > maxImages) {
                        window.showWarningMessage(
                            'Trop d\'images',
                            `Vous ne pouvez pas ajouter plus de ${maxImages} images au total. Vous avez ${existingImages.length} image(s) existante(s) et essayez d'en ajouter ${totalFiles}.`
                        );
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-save"></i> ENREGISTRER ET PUBLIER';
                        return;
                    }

                    // Afficher la barre de progression
                    window.showUploadProgress(true);
                    window.updateUploadProgress(0, `Préparation de ${totalFiles} image(s)...`);

                    // Upload séquentiel avec progression
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const progress = Math.round(((i) / totalFiles) * 100);
                        window.updateUploadProgress(progress, `Upload image ${i + 1}/${totalFiles}...`);

                        const url = await uploadImage(file);
                        newImageUrls.push(url);
                    }

                    window.updateUploadProgress(100, 'Upload terminé !');

                    // Cacher après 1s
                    setTimeout(() => window.showUploadProgress(false), 1000);
                }

                const finalImages = [...existingImages, ...newImageUrls];
                let items = [];
                await db_ref.ref(currentSection).once('value', snapshot => { items = snapshot.val() || []; });

                // Récupérer l'état brouillon
                const isDraft = document.getElementById('input-draft')?.checked || false;

                const newItem = {
                    title,
                    desc,
                    price: (currentSection === 'rates' || currentSection === 'tournaments') ? price : (items[index]?.price || null),
                    url: currentSection === 'sponsors' ? document.getElementById('input-url').value : (items[index]?.url || null),
                    avantage: currentSection === 'sponsors' ? (document.getElementById('input-avantage')?.value || null) : (items[index]?.avantage || null),
                    images: finalImages,
                    date: (index !== -1 && items[index].date) ? items[index].date : new Date().toLocaleDateString('fr-FR'),
                    createdAt: (index !== -1 && items[index].createdAt) ? items[index].createdAt : Date.now(), // Timestamp pour le nettoyage auto
                    featured: document.getElementById('input-featured').checked,
                    draft: isDraft
                };

                if (index === -1) items.push(newItem);
                else items[index] = newItem;

                await db_ref.ref(currentSection).set(items);
            }
            clearAutoSave(); // Effacer la sauvegarde automatique après succès

            // Récupérer les valeurs avant reset
            const shouldNotify = document.getElementById('input-notify')?.checked || false;
            const notifyTitle = title;
            const notifyDesc = desc;
            const draftCheckbox = document.getElementById('input-draft');
            const wasDraft = draftCheckbox?.checked || false;

            window.resetAdminForm();

            // Message différent selon brouillon ou publication
            if (wasDraft) {
                window.showSuccessMessage(
                    'Brouillon sauvegardé !',
                    'L\'élément a été enregistré mais n\'est pas visible sur le site.'
                );
            } else {
                // Proposer le partage Facebook pour news et events
                if (currentSection === 'news' || currentSection === 'event') {
                    const siteUrl = 'https://tennismontargis.fr';
                    const shareText = encodeURIComponent(notifyTitle);
                    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${shareText}`;

                    window.showSuccessMessage(
                        'Publié avec succès !',
                        'Les modifications sont maintenant visibles sur le site.',
                        {
                            showFacebookShare: true,
                            facebookUrl: facebookUrl
                        }
                    );
                } else {
                    window.showSuccessMessage(
                        'Publié avec succès !',
                        'Les modifications sont maintenant visibles sur le site.'
                    );
                }

                // Envoyer notification si demandé et pas en brouillon
                if (shouldNotify && (currentSection === 'news' || currentSection === 'event')) {
                    await sendPushNotification(notifyTitle, notifyDesc);
                }
            }

            // Mettre à jour les stats
            updateAdminStats();
        } catch (error) {
            window.showErrorMessage(error, 'save');
            window.showUploadProgress(false); // Cacher la barre en cas d'erreur
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> ENREGISTRER ET PUBLIER';
        }
    });
}

async function uploadImage(file) {
    // === VALIDATION DE SÉCURITÉ ===

    // 1. Vérifier le type MIME
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Type de fichier non autorisé. Formats acceptés: ${allowedTypes.join(', ')}`);
    }

    // 2. Vérifier la taille (limite: 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB en bytes
    if (file.size > maxSize) {
        throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)}MB). Taille maximale: 5MB`);
    }

    // 3. Vérifier l'extension
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
        throw new Error(`Extension de fichier non autorisée: .${fileExtension}`);
    }

    // 4. Redimensionner et compresser
    const resizedBlob = await resizeImage(file, 1200, 1200, 0.8);

    // 5. Générer un nom de fichier sécurisé (sans utiliser le nom original)
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = fileExtension;
    const safeFileName = `${timestamp}_${randomId}.${extension}`;

    // 6. Upload avec métadonnées
    const uploadRef = storage.ref('images/' + safeFileName);
    await uploadRef.put(resizedBlob, {
        contentType: file.type,
        customMetadata: {
            uploadedBy: auth.currentUser ? auth.currentUser.uid : 'unknown',
            uploadedAt: new Date().toISOString(),
            originalName: file.name.substring(0, 100) // Limiter la longueur
        }
    });

    return await uploadRef.getDownloadURL();
}

function resizeImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/webp', quality);
            };
        };
        reader.onerror = err => reject(err);
    });
}

// --- EXPOSITION DES FONCTIONS ---
window.switchAdmin = (section) => {
    const titleEl = document.getElementById('form-title');
    const universalForm = document.getElementById('universal-form-container');
    const documentsAdmin = document.getElementById('documents-admin');

    const contactsAdmin = document.getElementById('contacts-admin');
    const membersAdmin = document.getElementById('members-admin');
    const sponsorsListAdmin = document.getElementById('sponsors-list-admin');
    const clubMessagesAdmin = document.getElementById('club-messages-admin');
    const equipesAdmin = document.getElementById('equipes-admin');
    const calendrierAdmin = document.getElementById('calendrier-admin');

    // Gérer l'affichage spécial pour les sections documents, contacts, membres et messages
    const hideSpecialSections = () => {
        if (documentsAdmin) documentsAdmin.classList.add('hidden');
        if (contactsAdmin) contactsAdmin.classList.add('hidden');
        if (membersAdmin) membersAdmin.classList.add('hidden');
        if (clubMessagesAdmin) clubMessagesAdmin.classList.add('hidden');
        if (sponsorsListAdmin) sponsorsListAdmin.classList.add('hidden');
        if (equipesAdmin) equipesAdmin.classList.add('hidden');
        if (calendrierAdmin) calendrierAdmin.classList.add('hidden');
    };

    if (section === 'documents') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (documentsAdmin) { documentsAdmin.classList.remove('hidden'); if (window.loadDocumentsAdmin) window.loadDocumentsAdmin(); }
    } else if (section === 'contacts') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (contactsAdmin) { contactsAdmin.classList.remove('hidden'); window.loadContactsAdmin(); }
    } else if (section === 'members') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (membersAdmin) { membersAdmin.classList.remove('hidden'); window.loadMembersAdmin && window.loadMembersAdmin(); }
    } else if (section === 'club_messages') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (clubMessagesAdmin) { clubMessagesAdmin.classList.remove('hidden'); window.loadClubMessagesAdmin(); }
    } else if (section === 'equipes') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (equipesAdmin) { equipesAdmin.classList.remove('hidden'); window.loadChampionnatsAdmin && window.loadChampionnatsAdmin(); }
    } else if (section === 'calendrier') {
        if (universalForm) universalForm.style.display = 'none';
        hideSpecialSections();
        if (calendrierAdmin) { calendrierAdmin.classList.remove('hidden'); window.loadCalendrierAdmin && window.loadCalendrierAdmin(); }
    } else {
        if (universalForm) universalForm.style.display = 'block';
        hideSpecialSections();
        if (sponsorsListAdmin) {
            if (section === 'sponsors') {
                sponsorsListAdmin.classList.remove('hidden');
                loadSponsorsAdminList();
            } else {
                sponsorsListAdmin.classList.add('hidden');
            }
        }
    }

    // Les sections suivantes ont leur propre interface — pas de formulaire universel
    var _specialSections = ['documents','contacts','members','club_messages','equipes','calendrier'];
    if (_specialSections.indexOf(section) !== -1) return;

    const _sectionTitles = { info: 'COORDONNÉES DU CLUB', news: 'ACTUALITÉS', event: 'ÉVÉNEMENTS (site public)', inst: 'INSTALLATIONS', coach: 'COACHS', rates: 'TARIFS', sponsors: 'PARTENAIRES' };
    if (titleEl) titleEl.innerText = `Gérer : ${_sectionTitles[section] || section.toUpperCase()}`;

    // Note d'aide contextuelle sous le titre (évite les confusions, ex: coordonnées ≠ messages aux membres)
    var noteEl = document.getElementById('form-section-note');
    if (!noteEl && titleEl) {
        noteEl = document.createElement('p');
        noteEl.id = 'form-section-note';
        noteEl.style.cssText = 'color:#94a3b8; font-size:12px; margin:-8px 0 18px; padding:10px 14px; background:rgba(0,210,255,0.06); border-left:3px solid #00d2ff; border-radius:6px; display:none;';
        titleEl.parentNode.insertBefore(noteEl, titleEl.nextSibling);
    }
    if (noteEl) {
        if (section === 'info') {
            noteEl.innerHTML = '<i class="fas fa-info-circle" style="margin-right:6px;"></i>Ces champs sont les <strong>coordonnées du club</strong> affichées sur le site public. L\'email est aussi l\'adresse qui reçoit le formulaire de contact. Pour envoyer un message aux membres, utilisez l\'onglet <strong>« Messages Club »</strong> — pour un événement daté, l\'onglet <strong>« Calendrier »</strong>.';
            noteEl.style.display = 'block';
        } else {
            noteEl.style.display = 'none';
        }
    }

    window.resetAdminForm();

    document.getElementById('email-container').classList.toggle('hidden', section !== 'info');
    document.getElementById('image-upload-container').classList.toggle('hidden', section === 'info' || section === 'rates' || section === 'documents' || section === 'contacts' || section === 'members');
    document.getElementById('url-container').classList.toggle('hidden', section !== 'sponsors');
    document.getElementById('avantage-container')?.classList.toggle('hidden', section !== 'sponsors');
    // Prix disponible pour tarifs ET tournois
    document.getElementById('price-container').classList.toggle('hidden', section !== 'rates' && section !== 'tournaments');
    if (section === 'tournaments') {
        const priceLabel = document.querySelector('#price-container label');
        if (priceLabel) priceLabel.textContent = 'Tarif d\'inscription (optionnel)';
    }
    document.getElementById('featured-container').classList.toggle('hidden', section !== 'news' && section !== 'rates');
    // Mode brouillon disponible pour toutes les sections sauf info, documents, contacts, membres
    document.getElementById('draft-container')?.classList.toggle('hidden', section === 'info' || section === 'documents' || section === 'contacts' || section === 'members');
    // Réinitialiser la checkbox brouillon
    const draftCheckbox = document.getElementById('input-draft');
    if (draftCheckbox) draftCheckbox.checked = false;

    const labelFeatured = document.getElementById('label-featured');
    if (labelFeatured) {
        if (section === 'news') labelFeatured.innerText = "Mettre À LA UNE (Actualités)";
        if (section === 'rates') labelFeatured.innerText = "Mettre OFFRE PREMIÈRE (Tarifs)";
    }

    const inputTitle = document.getElementById('input-title');
    const inputDesc = document.getElementById('input-desc');
    const labelTitle = document.getElementById('label-input-title');
    const labelDesc = document.getElementById('label-input-desc');
    if (section === 'info') {
        inputTitle.placeholder = "Ex: 1234 rue du Tennis, 45200 Montargis";
        inputDesc.placeholder = "Ex: 02 38 00 00 00";
        if (labelTitle) labelTitle.textContent = 'Adresse du club';
        if (labelDesc) labelDesc.textContent = 'Numéro de téléphone';
    } else if (section === 'sponsors') {
        inputTitle.placeholder = "Nom du partenaire";
        inputDesc.placeholder = "Informations complémentaires (facultatif)";
        if (labelTitle) labelTitle.textContent = 'Nom du partenaire';
        if (labelDesc) labelDesc.textContent = 'Description / Détails';
    } else {
        inputTitle.placeholder = "Titre";
        inputDesc.placeholder = "Description";
        if (labelTitle) labelTitle.textContent = 'Titre / Nom';
        if (labelDesc) labelDesc.textContent = 'Description / Détails';
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${section}'`));
    });
};

function loadSponsorsAdminList() {
    const body = document.getElementById('sponsors-admin-list-body');
    if (!body) return;
    body.innerHTML = '<p style="color:#64748b;font-size:13px;">Chargement...</p>';

    db_ref.ref('sponsors').once('value', snap => {
        const data = snap.val();
        if (!data) { body.innerHTML = '<p style="color:#64748b;font-size:13px;">Aucun partenaire.</p>'; return; }
        const items = Array.isArray(data) ? data : Object.values(data);
        const valid = items.map((s, i) => ({ ...s, _idx: i })).filter(s => s && s.title);

        if (valid.length === 0) { body.innerHTML = '<p style="color:#64748b;font-size:13px;">Aucun partenaire.</p>'; return; }

        body.innerHTML = valid.map(s => {
            const logoHtml = (s.images && s.images[0])
                ? `<img src="${escapeHtml(s.images[0])}" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#fff;padding:3px;border:1px solid #334155;flex-shrink:0;" alt="">`
                : `<div style="width:48px;height:48px;background:#1e293b;border:1px solid #334155;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#475569;font-size:18px;">★</div>`;
            const avantage = s.avantage
                ? `<span style="color:#94a3b8;font-size:12px;">${escapeHtml(s.avantage)}</span>`
                : `<span style="color:#475569;font-size:12px;font-style:italic;">Aucun avantage renseigné</span>`;
            const draftBadge = s.draft ? `<span style="background:#fb923c;color:#fff;font-size:10px;padding:1px 7px;border-radius:6px;margin-left:6px;">BROUILLON</span>` : '';
            return `
            <div style="display:flex;align-items:center;gap:14px;padding:12px;border-bottom:1px solid #1e293b;">
                ${logoHtml}
                <div style="flex:1;min-width:0;">
                    <div style="color:#e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(s.title)}${draftBadge}</div>
                    <div style="margin-top:3px;">${avantage}</div>
                </div>
                <button onclick="window.editItem('sponsors', ${s._idx})"
                    style="background:rgba(0,210,255,0.1);border:1px solid rgba(0,210,255,0.4);color:#00d2ff;padding:7px 16px;border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;">
                    <i class="fas fa-edit"></i> Modifier
                </button>
                <button onclick="window.deleteItem('sponsors', ${s._idx})"
                    style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px;flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        }).join('');
    });
}
window.loadSponsorsAdminList = loadSponsorsAdminList;

// =====================================================================
// CALENDRIER DU CLUB (onglet admin dédié)
// =====================================================================

var _CAL_TYPES = {
    tournoi:   { label: 'Tournoi',     icon: 'fa-trophy',      color: '#c9a227' },
    sortie:    { label: 'Sortie',      icon: 'fa-bus',         color: '#f97316' },
    evenement: { label: 'Événement',   icon: 'fa-star',        color: '#00d2ff' },
    reunion:   { label: 'Réunion',     icon: 'fa-bullhorn',    color: '#8b5cf6' },
    match:     { label: 'Match équipe',icon: 'fa-shield-alt',  color: '#e11d48' },
    autre:     { label: 'Autre',       icon: 'fa-calendar',    color: '#64748b' }
};
var _calDataCache = {};
var _calImageUrl = ''; // URL de l'image conservée en édition (remplacée si nouveau fichier choisi)

function _calFmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

window.loadCalendrierAdmin = function() {
    var list = document.getElementById('calendrier-admin-list');
    if (!list) return;
    db_ref.ref('calendrier').orderByChild('date').once('value', function(snap) {
        _calDataCache = {};
        if (!snap.exists()) {
            list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucune entrée. Ajoutez le premier événement ci-dessus.</p>';
        } else {
            var todayISO = new Date().toISOString().substring(0, 10);
            var html = '';
            snap.forEach(function(child) {
                var e = child.val(); var id = child.key;
                _calDataCache[id] = Object.assign({}, e, { id: id });
                var t = _CAL_TYPES[e.type] || _CAL_TYPES.autre;
                var estPasse = (e.dateFin || e.date) < todayISO;
                html += '<div style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:rgba(255,255,255,0.03); border:1px solid ' + t.color + '33; border-left:3px solid ' + t.color + '; border-radius:10px;' + (estPasse ? ' opacity:0.5;' : '') + '">'
                    + '<span style="background:' + t.color + '22; color:' + t.color + '; border:1px solid ' + t.color + '44; border-radius:12px; padding:3px 10px; font-size:11px; white-space:nowrap; flex-shrink:0;"><i class="fas ' + t.icon + '" style="margin-right:4px;"></i>' + t.label + '</span>'
                    + '<div style="flex:1; min-width:0;">'
                    + '<div style="color:#e2e8f0; font-size:14px; font-weight:600;">' + escHtml(e.titre || '—') + (estPasse ? ' <span style="color:#64748b; font-size:10px;">(passé)</span>' : '') + '</div>'
                    + '<div style="color:#64748b; font-size:12px; margin-top:2px;"><i class="fas fa-calendar" style="margin-right:4px;"></i>' + _calFmtDate(e.date)
                    + (e.dateFin ? ' → ' + _calFmtDate(e.dateFin) : '') + (e.heure ? ' à ' + escHtml(e.heure) : '')
                    + (e.lieu ? ' · ' + escHtml(e.lieu) : '') + (e.prix ? ' · ' + escHtml(e.prix) : '') + '</div>'
                    + '</div>'
                    + '<div style="display:flex; gap:8px; flex-shrink:0;">'
                    + (_calABoutonInscription(e) ? '<button onclick="window.toggleInscritsEvenement(\'' + id + '\')" title="Voir les inscrits" style="background:#0f172a; color:#22c55e; border:1px solid #22c55e44; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-users"></i></button>' : '')
                    + '<button onclick="window.editCalendrierEntry(\'' + id + '\')" style="background:#0f172a; color:#e2e8f0; border:1px solid #47556944; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-edit"></i></button>'
                    + '<button onclick="window.deleteCalendrierEntry(\'' + id + '\')" style="background:#0f172a; color:#ef4444; border:1px solid #ef444444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i></button>'
                    + '</div></div>'
                    + '<div id="inscrits-evt-' + id + '" style="display:none; background:#0f172a; border:1px solid #22c55e33; border-top:none; border-radius:0 0 10px 10px; padding:12px 16px; margin-top:-4px;"></div>';
            });
            list.innerHTML = html;
        }
    });
    _loadCalendrierMatchsAdmin();
};

function _calABoutonInscription(e) {
    return Array.isArray(e.boutons) && e.boutons.some(function(b) { return b && b.type === 'inscription'; });
}

/** Panneau dépliable listant les inscrits à un événement */
window.toggleInscritsEvenement = function(eventId) {
    var panel = document.getElementById('inscrits-evt-' + eventId);
    if (!panel) return;
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    panel.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement…</p>';

    db_ref.ref('inscriptions_evenement/' + eventId).once('value', function(snap) {
        var e = _calDataCache[eventId] || {};
        var btnIns = (e.boutons || []).filter(function(b) { return b.type === 'inscription'; })[0] || {};
        var inscrits = [];
        snap.forEach(function(c) { inscrits.push(Object.assign({ uid: c.key }, c.val())); });
        inscrits.sort(function(a, b) { return (a.at || 0) - (b.at || 0); });

        var entete = '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px;">'
            + '<span style="color:#22c55e; font-size:12px; font-weight:600;"><i class="fas fa-users" style="margin-right:6px;"></i>'
            + inscrits.length + ' inscrit' + (inscrits.length > 1 ? 's' : '')
            + (btnIns.placesMax ? ' / ' + btnIns.placesMax + ' places' : '') + '</span>'
            + (inscrits.length ? '<button onclick="window.copierInscrits(\'' + eventId + '\')" style="background:#1e293b; color:#94a3b8; border:1px solid #33415566; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:11px;"><i class="fas fa-copy" style="margin-right:5px;"></i>Copier la liste</button>' : '')
            + '</div>';

        if (!inscrits.length) {
            panel.innerHTML = entete + '<p style="color:#64748b; font-size:12px; text-align:center; padding:6px 0;">Personne ne s\'est encore inscrit.</p>';
            return;
        }
        panel.innerHTML = entete + '<div style="display:grid; gap:5px;">'
            + inscrits.map(function(i, n) {
                var quand = i.at ? new Date(i.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
                return '<div style="display:flex; align-items:center; gap:10px; padding:6px 10px; background:#1e293b; border-radius:6px; font-size:12px;">'
                    + '<span style="color:#475569; min-width:18px;">' + (n + 1) + '.</span>'
                    + '<span style="color:#e2e8f0; flex:1;">' + escHtml(((i.prenom || '') + ' ' + (i.nom || '')).trim()) + '</span>'
                    + '<span style="color:#475569; font-size:11px;">' + quand + '</span>'
                    + '<button onclick="window.retirerInscritEvenement(\'' + eventId + '\',\'' + i.uid + '\')" title="Retirer" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:11px;"><i class="fas fa-user-minus"></i></button>'
                    + '</div>';
            }).join('') + '</div>';
    });
};

window.copierInscrits = function(eventId) {
    db_ref.ref('inscriptions_evenement/' + eventId).once('value', function(snap) {
        var noms = [];
        snap.forEach(function(c) {
            var i = c.val();
            noms.push(((i.prenom || '') + ' ' + (i.nom || '')).trim());
        });
        var texte = noms.join('\n');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(texte).then(function() {
                window.showNotification && window.showNotification('Liste copiée (' + noms.length + ' noms).', 'success');
            });
        }
    });
};

window.retirerInscritEvenement = async function(eventId, uid) {
    var ok = await window.confirmDialog.show({
        title: 'Retirer cet inscrit',
        message: 'Retirer ce membre de la liste des participants ?',
        type: 'danger', confirmText: 'Retirer', cancelText: 'Annuler'
    });
    if (!ok) return;
    db_ref.ref('inscriptions_evenement/' + eventId + '/' + uid).remove().then(function() {
        window.showNotification && window.showNotification('Inscription retirée.', 'success');
        var panel = document.getElementById('inscrits-evt-' + eventId);
        if (panel) { panel.style.display = 'none'; window.toggleInscritsEvenement(eventId); }
    });
};

// Matchs d'équipes à venir (lecture seule — gérés depuis l'onglet Équipes)
function _loadCalendrierMatchsAdmin() {
    var el = document.getElementById('calendrier-matchs-list');
    if (!el) return;
    Promise.all([
        db_ref.ref('equipes').once('value'),
        db_ref.ref('championnats_equipe').once('value')
    ]).then(function(snaps) {
        var champs = {};
        snaps[1].forEach(function(c) { champs[c.key] = c.val(); });
        var todayISO = new Date().toISOString().substring(0, 10);
        var matchs = [];
        snaps[0].forEach(function(eqChild) {
            var eq = eqChild.val(); if (!eq) return;
            Object.values(eq.rencontres || {}).forEach(function(r) {
                if (!r.date || r.date < todayISO) return;
                matchs.push({ date: r.date, heure: r.heure || '', eqNom: eq.nom || 'Équipe', adversaire: r.adversaire || '', domicile: !!r.domicile, champNom: (champs[eq.champId] || {}).nom || '' });
            });
        });
        matchs.sort(function(a, b) { return a.date.localeCompare(b.date); });
        if (!matchs.length) {
            el.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center;">Aucun match à venir.</p>';
            return;
        }
        el.innerHTML = matchs.map(function(m) {
            return '<div style="display:flex; align-items:center; gap:10px; padding:9px 12px; background:rgba(225,29,72,0.05); border:1px solid rgba(225,29,72,0.2); border-radius:8px; font-size:12px;">'
                + '<span>' + (m.domicile ? '🏠' : '🚌') + '</span>'
                + '<strong style="color:#e2e8f0;">' + _calFmtDate(m.date) + (m.heure ? ' ' + escHtml(m.heure) : '') + '</strong>'
                + '<span style="color:#94a3b8;">' + escHtml(m.eqNom) + (m.adversaire ? ' vs ' + escHtml(m.adversaire) : '') + '</span>'
                + (m.champNom ? '<span style="color:#475569; margin-left:auto;">' + escHtml(m.champNom) + '</span>' : '')
                + '</div>';
        }).join('');
    });
}

// --- Boutons configurables d'un événement (lien / fichier / inscription) ---
var _calBoutons = []; // [{ type, libelle, url, fichierNom, placesMax, dateLimite }]

var _CAL_BTN_META = {
    lien:        { icon: 'fa-link',            color: '#00d2ff', titre: 'Bouton lien' },
    fichier:     { icon: 'fa-file-arrow-down', color: '#a855f7', titre: 'Bouton fichier' },
    inscription: { icon: 'fa-user-check',      color: '#22c55e', titre: 'Bouton inscription' }
};

window.calAjouterBouton = function(type) {
    if (type === 'inscription' && _calBoutons.some(function(b) { return b.type === 'inscription'; })) {
        window.showNotification && window.showNotification('Un seul bouton d\'inscription par événement.', 'warning');
        return;
    }
    var defauts = {
        lien:        { type: 'lien', libelle: '', url: '' },
        fichier:     { type: 'fichier', libelle: '', url: '', fichierNom: '' },
        inscription: { type: 'inscription', libelle: 'Je participe', placesMax: '', dateLimite: '' }
    };
    _calBoutons.push(defauts[type]);
    _renderCalBoutons();
};

window.calSupprimerBouton = function(idx) {
    _calBoutons.splice(idx, 1);
    _renderCalBoutons();
};

/** Mode test : révèle le champ d'adresse, pré-rempli avec l'adresse de connexion */
window.calToggleTest = function() {
    var actif = !!(document.getElementById('cal-notif-test') || {}).checked;
    var wrap = document.getElementById('cal-notif-test-wrap');
    if (wrap) wrap.style.display = actif ? 'block' : 'none';
    var champ = document.getElementById('cal-notif-test-email');
    if (actif && champ && !champ.value) {
        var user = firebase.auth().currentUser;
        champ.value = (user && user.email) || '';
    }
    // Le test restreint le destinataire mais n'envoie rien par lui-même :
    // si aucun canal n'est coché, on active l'email (cas d'usage courant)
    if (actif) {
        var push  = document.getElementById('cal-notif-push');
        var email = document.getElementById('cal-notif-email');
        if (push && email && !push.checked && !email.checked) email.checked = true;
    }
};

// Mémorise la saisie en cours avant tout re-rendu de la liste
function _calLireBoutonsDepuisDOM() {
    _calBoutons.forEach(function(b, i) {
        var g = function(champ) { var el = document.getElementById('cal-btn-' + champ + '-' + i); return el ? el.value : undefined; };
        var lib = g('libelle'); if (lib !== undefined) b.libelle = lib;
        if (b.type === 'lien')        { var u = g('url');        if (u !== undefined) b.url = u; }
        if (b.type === 'inscription') {
            var p = g('places');  if (p !== undefined) b.placesMax = p;
            var d = g('limite');  if (d !== undefined) b.dateLimite = d;
        }
    });
}

function _renderCalBoutons() {
    var wrap = document.getElementById('cal-boutons-liste');
    if (!wrap) return;
    if (!_calBoutons.length) {
        wrap.innerHTML = '<p style="color:#475569; font-size:11px; margin:0; font-style:italic;">Aucun bouton — l\'événement s\'affichera simplement avec sa description.</p>';
        return;
    }
    wrap.innerHTML = _calBoutons.map(function(b, i) {
        var meta = _CAL_BTN_META[b.type] || _CAL_BTN_META.lien;
        var champs = '';
        if (b.type === 'lien') {
            champs = '<input type="url" id="cal-btn-url-' + i + '" value="' + escHtml(b.url || '') + '" placeholder="https://tenup.fft.fr/…" '
                + 'style="width:100%; padding:8px 10px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px; box-sizing:border-box;">';
        } else if (b.type === 'fichier') {
            champs = '<input type="file" id="cal-btn-fichier-' + i + '" accept=".pdf,image/*" '
                + 'style="width:100%; padding:6px; background:#0f172a; border:1px solid #475569; color:#94a3b8; border-radius:6px; font-size:11px; box-sizing:border-box;">'
                + (b.url ? '<div style="color:#22c55e; font-size:11px; margin-top:4px;"><i class="fas fa-check" style="margin-right:4px;"></i>Fichier actuel : ' + escHtml(b.fichierNom || 'document') + ' <span style="color:#64748b;">(choisissez-en un autre pour le remplacer)</span></div>' : '');
        } else {
            champs = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">'
                + '<div><label style="color:#64748b; font-size:10px; display:block; margin-bottom:3px;">Places max (vide = illimité)</label>'
                + '<input type="number" min="1" id="cal-btn-places-' + i + '" value="' + escHtml(b.placesMax || '') + '" placeholder="ex : 20" '
                + 'style="width:100%; padding:8px 10px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px; box-sizing:border-box;"></div>'
                + '<div><label style="color:#64748b; font-size:10px; display:block; margin-bottom:3px;">Date limite d\'inscription</label>'
                + '<input type="date" id="cal-btn-limite-' + i + '" value="' + escHtml(b.dateLimite || '') + '" '
                + 'style="width:100%; padding:8px 10px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px; box-sizing:border-box;"></div>'
                + '</div>';
        }
        return '<div style="background:#0f172a; border:1px solid ' + meta.color + '33; border-left:3px solid ' + meta.color + '; border-radius:8px; padding:12px;">'
            + '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">'
            + '<span style="color:' + meta.color + '; font-size:12px; font-weight:600;"><i class="fas ' + meta.icon + '" style="margin-right:6px;"></i>' + meta.titre + '</span>'
            + '<button type="button" onclick="window.calSupprimerBouton(' + i + ')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i></button>'
            + '</div>'
            + '<input type="text" id="cal-btn-libelle-' + i + '" value="' + escHtml(b.libelle || '') + '" placeholder="Texte du bouton (ex : S\'inscrire sur TenUp)" '
            + 'style="width:100%; padding:8px 10px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px; box-sizing:border-box; margin-bottom:8px;">'
            + champs
            + '</div>';
    }).join('');
}

/** Téléverse les fichiers choisis pour les boutons de type « fichier » */
async function _calUploaderFichiersBoutons() {
    for (var i = 0; i < _calBoutons.length; i++) {
        var b = _calBoutons[i];
        if (b.type !== 'fichier') continue;
        var input = document.getElementById('cal-btn-fichier-' + i);
        var file = input && input.files ? input.files[0] : null;
        if (!file) continue;
        if (file.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (max 10 Mo) : ' + file.name);
        var safeName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        var ref = storage.ref('documents/' + safeName);
        await ref.put(file, { contentType: file.type || 'application/octet-stream' });
        b.url = await ref.getDownloadURL();
        b.fichierNom = file.name;
    }
}

window.saveCalendrierEntry = function() {
    var titre = (document.getElementById('cal-titre').value || '').trim();
    var type = document.getElementById('cal-type').value;
    var date = document.getElementById('cal-date').value;
    var dateFin = document.getElementById('cal-date-fin').value;
    var heure = document.getElementById('cal-heure').value;
    var lieu = (document.getElementById('cal-lieu').value || '').trim();
    var prix = (document.getElementById('cal-prix').value || '').trim();
    var description = (document.getElementById('cal-description').value || '').trim();
    var editId = document.getElementById('cal-edit-id').value;
    var fileInput = document.getElementById('cal-image-file');
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;

    if (!titre || !date) { window.showNotification && window.showNotification('Le titre et la date sont obligatoires.', 'error'); return; }
    if (dateFin && dateFin < date) { window.showNotification && window.showNotification('La date de fin doit être après la date de début.', 'error'); return; }

    // Récupérer la saisie des boutons et valider
    _calLireBoutonsDepuisDOM();
    for (var bi = 0; bi < _calBoutons.length; bi++) {
        var b = _calBoutons[bi];
        if (!(b.libelle || '').trim()) {
            window.showNotification && window.showNotification('Chaque bouton doit avoir un texte.', 'error'); return;
        }
        if (b.type === 'lien' && !(b.url || '').trim()) {
            window.showNotification && window.showNotification('Le bouton « ' + b.libelle + ' » doit avoir un lien.', 'error'); return;
        }
        if (b.type === 'fichier') {
            var inp = document.getElementById('cal-btn-fichier-' + bi);
            var aUnFichier = (inp && inp.files && inp.files[0]) || b.url;
            if (!aUnFichier) {
                window.showNotification && window.showNotification('Le bouton « ' + b.libelle + ' » doit avoir un fichier.', 'error'); return;
            }
        }
    }

    // Le mode test exige une adresse et au moins un canal (il ne fait que restreindre le destinataire)
    if ((document.getElementById('cal-notif-test') || {}).checked) {
        if (!((document.getElementById('cal-notif-test-email') || {}).value || '').trim()) {
            window.showNotification && window.showNotification('Indiquez l\'adresse email de test, ou décochez le mode test.', 'error');
            return;
        }
        if (!(document.getElementById('cal-notif-push') || {}).checked
            && !(document.getElementById('cal-notif-email') || {}).checked) {
            window.showNotification && window.showNotification('Cochez aussi « Email » (ou « Notification ») : le mode test choisit le destinataire, pas ce qui est envoyé.', 'error');
            return;
        }
    }

    var saveBtn = document.getElementById('cal-save-label');
    if (saveBtn) saveBtn.textContent = 'Enregistrement…';

    var imagePromise = file ? uploadImage(file) : Promise.resolve(_calImageUrl || '');
    imagePromise.then(function(imageUrl) {
        return _calUploaderFichiersBoutons().then(function() { return imageUrl; });
    }).then(function(imageUrl) {
        var boutons = _calBoutons.map(function(b) {
            var o = { type: b.type, libelle: (b.libelle || '').trim() };
            if (b.type === 'lien')    o.url = (b.url || '').trim();
            if (b.type === 'fichier') { o.url = b.url || ''; o.fichierNom = b.fichierNom || ''; }
            if (b.type === 'inscription') {
                o.placesMax  = b.placesMax ? parseInt(b.placesMax, 10) : null;
                o.dateLimite = b.dateLimite || null;
            }
            return o;
        });
        var data = {
            titre: titre, type: type, date: date,
            dateFin: dateFin || null, heure: heure || null,
            lieu: lieu || null, prix: prix || null,
            description: description || null,
            image: imageUrl || null,
            boutons: boutons.length ? boutons : null
        };
        if (!editId) data.createdAt = Date.now();
        var ref = editId ? db_ref.ref('calendrier/' + editId) : db_ref.ref('calendrier').push();
        return ref.update(data).then(function() { return ref.key; });
    }).then(function(eventId) {
        window.showNotification && window.showNotification(editId ? 'Entrée mise à jour.' : 'Ajouté au calendrier !', 'success');

        // Diffusion aux membres si l'admin l'a demandé
        var envoyerPush  = !!(document.getElementById('cal-notif-push')  || {}).checked;
        var envoyerEmail = !!(document.getElementById('cal-notif-email') || {}).checked;
        var modeTest     = !!(document.getElementById('cal-notif-test')  || {}).checked;
        var testEmail    = ((document.getElementById('cal-notif-test-email') || {}).value || '').trim();
        if (envoyerPush || envoyerEmail) {
            window.showNotification && window.showNotification(modeTest ? 'Envoi du test…' : 'Envoi aux membres en cours…', 'info');
            firebase.functions().httpsCallable('notifyCalendarEvent')({
                eventId: eventId, envoyerPush: envoyerPush, envoyerEmail: envoyerEmail,
                testEmail: modeTest ? testEmail : null
            }).then(function(res) {
                var r = res.data || {};
                var parts = [];
                if (envoyerPush)  parts.push(r.push + ' notification(s)');
                if (envoyerEmail) parts.push(r.emails + ' email(s)');
                window.showNotification && window.showNotification(
                    (r.test ? 'Test envoyé : ' : 'Membres prévenus : ') + parts.join(' et ') + '.', 'success');
            }).catch(function(err) {
                window.showNotification && window.showNotification('Événement enregistré, mais l\'envoi a échoué : ' + (err.message || err), 'error');
            });
        }

        window.resetCalendrierForm();
        window.loadCalendrierAdmin();
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur enregistrement : ' + (err.message || err), 'error');
        if (saveBtn) saveBtn.textContent = editId ? 'Enregistrer les modifications' : 'Ajouter au calendrier';
    });
};

window.editCalendrierEntry = function(id) {
    var e = _calDataCache[id]; if (!e) return;
    document.getElementById('cal-edit-id').value = id;
    document.getElementById('cal-titre').value = e.titre || '';
    document.getElementById('cal-type').value = e.type || 'autre';
    document.getElementById('cal-date').value = e.date || '';
    document.getElementById('cal-date-fin').value = e.dateFin || '';
    document.getElementById('cal-heure').value = e.heure || '';
    document.getElementById('cal-lieu').value = e.lieu || '';
    document.getElementById('cal-prix').value = e.prix || '';
    document.getElementById('cal-description').value = e.description || '';
    _calImageUrl = e.image || '';
    var preview = document.getElementById('cal-image-preview');
    if (preview) preview.innerHTML = _calImageUrl ? '<img src="' + escHtml(_calImageUrl) + '" style="max-height:80px; border-radius:8px;"> <button onclick="window.removeCalImage()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:11px; text-decoration:underline;">Retirer l\'image</button>' : '';
    _calBoutons = Array.isArray(e.boutons) ? JSON.parse(JSON.stringify(e.boutons)) : [];
    _renderCalBoutons();
    document.getElementById('cal-form-title').innerHTML = '<i class="fas fa-edit" style="margin-right:8px;"></i>Modifier l\'entrée';
    document.getElementById('cal-save-label').textContent = 'Enregistrer les modifications';
    document.getElementById('cal-cancel-btn').style.display = '';
    document.getElementById('cal-titre').focus();
};

window.removeCalImage = function() {
    _calImageUrl = '';
    var preview = document.getElementById('cal-image-preview');
    if (preview) preview.innerHTML = '';
};

window.resetCalendrierForm = function() {
    ['cal-edit-id','cal-titre','cal-date','cal-date-fin','cal-heure','cal-lieu','cal-prix','cal-description'].forEach(function(f) {
        var el = document.getElementById(f); if (el) el.value = '';
    });
    document.getElementById('cal-type').value = 'tournoi';
    var fileInput = document.getElementById('cal-image-file'); if (fileInput) fileInput.value = '';
    _calImageUrl = '';
    var preview = document.getElementById('cal-image-preview'); if (preview) preview.innerHTML = '';
    _calBoutons = [];
    _renderCalBoutons();
    // Les cases de diffusion repartent décochées : pas de renvoi involontaire à la prochaine modification
    ['cal-notif-push', 'cal-notif-email', 'cal-notif-test'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.checked = false;
    });
    var testWrap = document.getElementById('cal-notif-test-wrap');
    if (testWrap) testWrap.style.display = 'none';
    document.getElementById('cal-form-title').innerHTML = '<i class="fas fa-plus-circle" style="margin-right:8px;"></i>Ajouter au calendrier';
    document.getElementById('cal-save-label').textContent = 'Ajouter au calendrier';
    document.getElementById('cal-cancel-btn').style.display = 'none';
};

window.deleteCalendrierEntry = async function(id) {
    var e = _calDataCache[id] || {};
    var ok = await window.confirmDialog.show({
        title: 'Supprimer du calendrier',
        message: 'Supprimer « ' + (e.titre || 'cette entrée') + ' » du calendrier ?',
        type: 'danger', confirmText: 'Supprimer', cancelText: 'Annuler'
    });
    if (!ok) return;
    db_ref.ref('calendrier/' + id).remove().then(function() {
        db_ref.ref('inscriptions_evenement/' + id).remove(); // cascade : les inscriptions partent avec l'événement
        window.showNotification && window.showNotification('Entrée supprimée.', 'success');
        window.loadCalendrierAdmin();
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur suppression : ' + (err.message || err), 'error');
    });
};

window.editItem = async (section, index) => {
    window.switchAdmin(section);
    let item;
    if (section === 'info') {
        await db_ref.ref('info').once('value', s => { item = s.val(); });
    } else {
        await db_ref.ref(section).once('value', s => { item = s.val()[index]; });
    }

    if (!item) return;

    document.getElementById('edit-index').value = index;
    document.getElementById('input-title').value = item.title || item.address || "";
    document.getElementById('input-desc').value = item.desc || item.phone || "";

    if (section === 'rates' || section === 'tournaments') document.getElementById('input-price').value = item.price || "";
    if (section === 'info') document.getElementById('input-email').value = item.email || "";
    if (section === 'news' || section === 'rates') document.getElementById('input-featured').checked = !!item.featured;
    if (section === 'sponsors') {
        document.getElementById('input-url').value = item.url || "";
        const avInput = document.getElementById('input-avantage');
        if (avInput) avInput.value = item.avantage || "";
    }
    // Restaurer l'état brouillon
    const draftCheckbox = document.getElementById('input-draft');
    if (draftCheckbox) draftCheckbox.checked = !!item.draft;

    window.tempImages = (item.images && section !== 'info' && section !== 'rates') ? [...item.images] : [];
    if (window.renderExistingImages) window.renderExistingImages();

    window.scrollTo(0, document.getElementById('admin-zone').offsetTop);
};

window.deleteItem = async (section, index) => {
    // Demander confirmation avant suppression
    const sectionNames = {
        'news': 'cette actualité',
        'inst': 'cette installation',
        'event': 'cet événement',
        'coach': 'ce coach',
        'rates': 'ce tarif',
        'sponsors': 'ce sponsor'
    };

    const itemName = sectionNames[section] || 'cet élément';

    const confirmed = await window.askConfirmation(
        'Confirmer la suppression',
        `Êtes-vous sûr de vouloir supprimer ${itemName} ? Cette action est irréversible.`,
        'danger'
    );

    if (!confirmed) return;

    try {
        const snap = await db_ref.ref(section).once('value');
        const list = snap.val() || [];
        const item = list[index];

        // Supprimer les images associées
        if (item.images && item.images.length > 0) {
            try {
                await storage.refFromURL(item.images[0]).delete();
            } catch (e) {
                console.warn('Image déjà supprimée ou introuvable', e);
            }
        }

        list.splice(index, 1);
        await db_ref.ref(section).set(list);

        window.showSuccessMessage(
            'Suppression réussie',
            `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} a été supprimé avec succès.`
        );
    } catch (error) {
        window.showErrorMessage(error, 'delete');
    }
};

// === RÉORGANISATION DES ÉLÉMENTS (Monter/Descendre) ===
window.moveItem = async (section, index, direction) => {
    try {
        const snap = await db_ref.ref(section).once('value');
        const list = snap.val() || [];

        // Vérifier que l'index est valide
        if (index < 0 || index >= list.length) {
            console.error('Index invalide pour le déplacement');
            return;
        }

        // Calculer le nouvel index
        let newIndex;
        if (direction === 'up') {
            // Pour news et event (affichés en ordre inverse), "monter" = index + 1 dans le tableau
            if (section === 'news' || section === 'event') {
                newIndex = index + 1;
            } else {
                newIndex = index - 1;
            }
        } else {
            // Pour news et event (affichés en ordre inverse), "descendre" = index - 1 dans le tableau
            if (section === 'news' || section === 'event') {
                newIndex = index - 1;
            } else {
                newIndex = index + 1;
            }
        }

        // Vérifier que le nouvel index est valide
        if (newIndex < 0 || newIndex >= list.length) {
            console.log('Déplacement impossible : limite atteinte');
            return;
        }

        // Échanger les éléments
        const temp = list[index];
        list[index] = list[newIndex];
        list[newIndex] = temp;

        // Sauvegarder dans Firebase
        await db_ref.ref(section).set(list);

        // Message de confirmation discret (toast)
        window.toast?.success('Élément déplacé', 'L\'ordre a été mis à jour.');

    } catch (error) {
        console.error('Erreur lors du déplacement:', error);
        window.showErrorMessage(error, 'move');
    }
};

window.logout = () => {
    auth.signOut().then(() => location.reload()); // Simple reload to clear admin state
};

// --- YOUTUBE HELPERS ---
function getYoutubeId(url) {
    const patterns = [
        /[?&]v=([A-Za-z0-9_-]{11})/,           // watch?v=
        /\/embed\/([A-Za-z0-9_-]{11})/,          // /embed/
        /\/shorts\/([A-Za-z0-9_-]{11})/,          // /shorts/
        /youtu\.be\/([A-Za-z0-9_-]{11})/,         // youtu.be/
        /\/v\/([A-Za-z0-9_-]{11})/                // /v/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}
function isYoutubeEmbed(url) {
    return url && url.includes('youtube.com/embed/');
}
function youtubeThumbnail(url) {
    const id = url.split('/embed/')[1]?.split('?')[0];
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

window.addYoutubeUrl = () => {
    const input = document.getElementById('youtube-url-input');
    const url = (input?.value || '').trim();
    if (!url) return;
    const id = getYoutubeId(url);
    if (!id) { alert('Lien YouTube invalide. Vérifiez l\'URL.'); return; }
    const embedUrl = `https://www.youtube.com/embed/${id}`;
    if (!window.tempImages) window.tempImages = [];
    window.tempImages.push(embedUrl);
    window.renderExistingImages();
    input.value = '';
};

// --- HELPER FUNCTIONS ---
window.resetAdminForm = () => {
    const form = document.getElementById('universal-form');
    if (form) form.reset();
    document.getElementById('edit-index').value = "-1";
    document.getElementById('image-preview-container').innerHTML = "";
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Enregistrer";
    }
    window.tempImages = [];
};

window.renderExistingImages = () => {
    const container = document.getElementById('image-preview-container');
    container.innerHTML = "";
    window.tempImages.forEach((url, i) => {
        const div = document.createElement('div');
        div.style.position = 'relative';
        if (isYoutubeEmbed(url)) {
            const thumb = youtubeThumbnail(url);
            div.innerHTML = `
                <div style="position:relative; width:80px; height:80px; border-radius:5px; overflow:hidden; border:2px solid #ff0000;">
                    <img src="${thumb}" style="width:100%; height:100%; object-fit:cover;">
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);color:#fff;font-size:18px;">▶</div>
                </div>
                <button onclick="removeTempImage(${i})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:12px; cursor:pointer;">&times;</button>
            `;
        } else {
            div.innerHTML = `
                <img src="${url}" style="width:80px; height:80px; object-fit:cover; border-radius:5px; border:1px solid #334155;">
                <button onclick="removeTempImage(${i})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:12px; cursor:pointer;">&times;</button>
            `;
        }
        container.appendChild(div);
    });
};

window.removeTempImage = (index) => {
    window.tempImages.splice(index, 1);
    window.renderExistingImages();
};

// === MODAL D'AIDE ===
// Tuiles de statistiques cliquables → ouvrent l'onglet correspondant
(function() {
    var map = { 'stat-news': 'news', 'stat-events': 'event', 'stat-inst': 'inst', 'stat-coach': 'coach', 'stat-drafts': 'news', 'stat-contacts': 'contacts', 'stat-members': 'members' };
    Object.keys(map).forEach(function(id) {
        var el = document.getElementById(id);
        if (!el || !el.parentElement) return;
        var tile = el.parentElement;
        tile.style.cursor = 'pointer';
        tile.title = 'Ouvrir l\'onglet correspondant';
        tile.addEventListener('click', function() { window.switchAdmin && window.switchAdmin(map[id]); });
    });
})();

window.showAdminHelp = () => {
    // Le coach a son propre guide, centré sur le circuit des équipes
    if (window.isCurrentUserCoach) {
        const coachModal = document.getElementById('help-modal-coach');
        if (coachModal) coachModal.style.display = 'block';
        return;
    }
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.add('show');
    }
};

window.closeHelpModal = () => {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.remove('show');
    }
    const coachModal = document.getElementById('help-modal-coach');
    if (coachModal) coachModal.style.display = 'none';
};

// Fermer le modal aide si clic à l'extérieur
document.getElementById('help-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'help-modal') {
        window.closeHelpModal();
    }
});
document.getElementById('help-modal-coach')?.addEventListener('click', (e) => {
    if (e.target.id === 'help-modal-coach') {
        window.closeHelpModal();
    }
});

// === BARRE DE PROGRESSION UPLOAD ===
window.showUploadProgress = (show = true) => {
    const container = document.getElementById('upload-progress-container');
    if (container) {
        container.style.display = show ? 'block' : 'none';
    }
};

window.updateUploadProgress = (percent, text = '') => {
    const bar = document.getElementById('upload-progress-bar');
    const textEl = document.getElementById('upload-progress-text');

    if (bar) {
        bar.style.width = `${percent}%`;
    }
    if (textEl && text) {
        textEl.innerText = text;
    }
};

// === STATISTIQUES DU TABLEAU DE BORD ===
async function updateAdminStats() {
    try {
        const sections = ['news', 'inst', 'event', 'coach', 'rates', 'sponsors'];
        let totalDrafts = 0;

        // Compter les éléments par section
        for (const section of sections) {
            const snap = await db_ref.ref(section).once('value');
            const data = snap.val();
            const items = Array.isArray(data) ? data : (data ? Object.values(data) : []);
            const count = items.filter(item => item).length;
            const drafts = items.filter(item => item && item.draft === true).length;
            totalDrafts += drafts;

            // Mettre à jour l'affichage selon la section
            const statMap = {
                'news': 'stat-news',
                'event': 'stat-events',
                'inst': 'stat-inst',
                'coach': 'stat-coach'
            };

            if (statMap[section]) {
                const el = document.getElementById(statMap[section]);
                if (el) el.textContent = count;
            }
        }

        // Mettre à jour le compteur de brouillons
        const draftEl = document.getElementById('stat-drafts');
        if (draftEl) draftEl.textContent = totalDrafts;

        // Mettre à jour le compteur de contacts
        const contactSnap = await db_ref.ref('contacts').once('value');
        const contactData = contactSnap.val();
        const contactCount = contactData ? Object.keys(contactData).length : 0;
        const contactEl = document.getElementById('stat-contacts');
        if (contactEl) contactEl.textContent = contactCount;

        // Mettre à jour le compteur de membres
        const memberSnap = await db_ref.ref('members').once('value');
        const memberData = memberSnap.val();
        const memberCount = memberData ? Object.values(memberData).filter(m => m && m.actif).length : 0;
        const memberEl = document.getElementById('stat-members');
        if (memberEl) memberEl.textContent = memberCount;

        // Scans QR accueil (appelé séparément — ne doit pas bloquer les autres stats)
        loadQrScanStats().catch(e => console.warn('QR stats:', e.message));

    } catch (error) {
        console.error('Erreur lors de la mise à jour des stats:', error);
    }
}

// Appeler updateAdminStats au chargement si admin
window.updateAdminStats = updateAdminStats;

// === STATISTIQUES QR CODE ACCUEIL ===
async function loadQrScanStats() {
    try {
        const snap = await db_ref.ref('qr_scans/accueil').once('value');
        // Activer listener temps-réel pour mises à jour auto
        db_ref.ref('qr_scans/accueil/total').on('value', function(s) {
            const v = s.val() || 0;
            const el = document.getElementById('stat-qr-total');
            if (el) el.textContent = v;
            const elBig = document.getElementById('qr-total-big');
            if (elBig) elBig.textContent = v;
        });
        const data = snap.val() || {};
        const total = data.total || 0;
        const parJour = data.par_jour || {};

        // Mise à jour mini-stat dans la grille
        const statEl = document.getElementById('stat-qr-total');
        if (statEl) statEl.textContent = total;

        // Mise à jour du panneau détail
        const totalBig = document.getElementById('qr-total-big');
        if (totalBig) totalBig.textContent = total;

        // Aujourd'hui
        const today = new Date().toISOString().slice(0, 10);
        const todayEl = document.getElementById('qr-today');
        if (todayEl) todayEl.textContent = parJour[today] || 0;

        // Ce mois
        const monthPrefix = today.slice(0, 7); // "2026-03"
        const monthTotal = Object.entries(parJour)
            .filter(([d]) => d.startsWith(monthPrefix))
            .reduce((sum, [, v]) => sum + v, 0);
        const monthEl = document.getElementById('qr-month');
        if (monthEl) monthEl.textContent = monthTotal;

        // Graphique + liste — 30 derniers jours
        const days30 = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days30.push({ key, count: parJour[key] || 0 });
        }
        const maxVal = Math.max(...days30.map(d => d.count), 1);

        const chart = document.getElementById('qr-days-chart');
        if (chart) {
            chart.innerHTML = days30.map(({ key, count }) => {
                const pct = Math.round((count / maxVal) * 100);
                const isToday = key === today;
                const label = key.slice(5); // "MM-DD"
                return `<div title="${key} : ${count} scan${count > 1 ? 's' : ''}"
                    style="flex:1; min-width:4px; height:${Math.max(pct, count > 0 ? 8 : 2)}%;
                    background:${isToday ? '#ffd700' : count > 0 ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.06)'};
                    border-radius:2px 2px 0 0; transition:opacity 0.2s; cursor:default;"
                    onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                </div>`;
            }).join('');
        }

        // Liste des jours avec scans
        const list = document.getElementById('qr-days-list');
        if (list) {
            const withScans = days30.filter(d => d.count > 0).reverse();
            if (withScans.length === 0) {
                list.innerHTML = '<p style="color:#475569; font-size:12px; margin:0;">Aucun scan enregistré sur les 30 derniers jours.</p>';
            } else {
                list.innerHTML = withScans.map(({ key, count }) => {
                    const d = new Date(key + 'T12:00:00');
                    const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                    const isToday = key === today;
                    return `<div style="display:flex; justify-content:space-between; align-items:center;
                        padding:6px 10px; border-radius:6px; margin-bottom:4px;
                        background:${isToday ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)'};
                        border:1px solid ${isToday ? 'rgba(255,215,0,0.2)' : 'transparent'};">
                        <span style="color:${isToday ? '#ffd700' : '#94a3b8'}; font-size:12px;">${label}${isToday ? ' <span style="font-size:10px;opacity:0.6;">aujourd\'hui</span>' : ''}</span>
                        <span style="color:white; font-weight:600; font-size:13px;">${count} scan${count > 1 ? 's' : ''}</span>
                    </div>`;
                }).join('');
            }
        }
    } catch (e) {
        console.warn('QR stats:', e.message);
    }
}
window.loadQrScanStats = loadQrScanStats;

// === AFFICHE A4 — QR ACCUEIL ===
function buildAfficheHtml() {
    const NAVY = '#0d1b2e';
    const GOLD = '#c9a227';
    // A4 à 96dpi : 794×1123px — bordure à 1.5cm = 57px
    const BORDER = 57;
    const INNER_W = 794 - BORDER * 2;   // 680px
    const INNER_H = 1123 - BORDER * 2;  // 1009px
    const FOOTER_H = Math.round(INNER_H * 0.25); // ~252px
    const CONTENT_H = INNER_H - FOOTER_H;        // ~757px

    return `
    <div style="width:794px;height:1123px;background:#ffffff;position:relative;box-sizing:border-box;overflow:hidden;font-family:Arial,sans-serif;">

        <!-- Cadre bleu avec retrait 1.5cm -->
        <div style="position:absolute;top:${BORDER}px;left:${BORDER}px;width:${INNER_W}px;height:${INNER_H}px;
            border:3px solid ${NAVY};box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;">

            <!-- Zone contenu (3/4) -->
            <div style="height:${CONTENT_H}px;flex-shrink:0;display:flex;flex-direction:column;
                align-items:center;justify-content:space-evenly;padding:28px 36px 16px;box-sizing:border-box;">

                <!-- BIENVENUE -->
                <div style="font-size:64px;font-weight:900;color:${NAVY};letter-spacing:8px;
                    font-family:'Orbitron',Arial,sans-serif;text-align:center;line-height:1;">
                    BIENVENUE
                </div>

                <!-- Logo USM -->
                <img src="/logo_usm_new.png" crossorigin="anonymous"
                    style="width:200px;height:200px;object-fit:contain;display:block;" alt="USM Tennis Montargis">

                <!-- INSCRIPTIONS ET INFOS -->
                <div style="font-size:44px;font-weight:900;color:${NAVY};letter-spacing:4px;
                    font-family:'Orbitron',Arial,sans-serif;text-align:center;line-height:1.2;">
                    INSCRIPTIONS &amp; INFOS
                </div>

                <!-- Message -->
                <div style="font-size:20px;color:#111111;text-align:center;font-family:Arial,sans-serif;
                    font-weight:500;max-width:500px;line-height:1.4;">
                    Scannez le QR code pour plus de renseignements
                </div>

                <!-- QR code -->
                <div id="affiche-qr" style="width:260px;height:260px;background:#ffffff;
                    border:3px solid ${NAVY};border-radius:6px;padding:6px;box-sizing:border-box;"></div>
            </div>

            <!-- Footer navy (1/4) -->
            <div style="height:${FOOTER_H}px;flex-shrink:0;background:${NAVY};display:flex;
                flex-direction:column;align-items:center;justify-content:center;gap:10px;">
                <div style="color:${GOLD};font-size:24px;font-weight:900;letter-spacing:4px;
                    font-family:'Orbitron',Arial,sans-serif;">NOUS CONTACTER</div>
                <div style="color:${GOLD};font-size:34px;font-weight:700;
                    font-family:Arial,sans-serif;letter-spacing:2px;">02 38 85 44 30</div>
                <div style="color:rgba(201,162,39,0.8);font-size:20px;
                    font-family:Arial,sans-serif;letter-spacing:1px;">usmmtennis@orange.fr</div>
            </div>
        </div>
    </div>`;
}

window.generateAfficheAccueil = async function() {
    if (typeof html2canvas === 'undefined' || typeof QRCode === 'undefined') {
        window.showWarningMessage && window.showWarningMessage('Chargement...', 'Les bibliothèques ne sont pas encore prêtes, réessaie dans 2 secondes.');
        return;
    }
    const el = document.getElementById('affiche-print');
    if (!el) return;

    el.innerHTML = buildAfficheHtml();
    el.style.display = 'block';

    // Générer le QR code pointant vers /qr-accueil
    const qrEl = el.querySelector('#affiche-qr');
    if (qrEl) {
        new QRCode(qrEl, {
            text: 'https://tennismontargis.fr/qr-accueil',
            width: 248,
            height: 248,
            colorDark: '#0d1b2e',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    // Attendre le rendu du QR + polices
    await new Promise(r => setTimeout(r, 600));

    try {
        const canvas = await html2canvas(el, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false
        });
        el.style.display = 'none';
        el.innerHTML = '';

        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'affiche-accueil-usm-tennis.png';
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 3000);
        }, 'image/png');
    } catch(e) {
        el.style.display = 'none';
        el.innerHTML = '';
        console.error('Erreur génération affiche:', e);
    }
};

// === GESTION DES DOCUMENTS PDF ===

// Upload d'un document PDF
window.uploadDocument = async function() {
    const nameInput = document.getElementById('doc-name');
    const fileInput = document.getElementById('doc-file');
    const uploadBtn = document.getElementById('doc-upload-btn');

    const name = nameInput.value.trim();
    const file = fileInput.files[0];

    if (!name) {
        window.showWarningMessage('Nom requis', 'Veuillez entrer un nom pour le document.');
        return;
    }

    if (!file) {
        window.showWarningMessage('Fichier requis', 'Veuillez sélectionner un fichier PDF.');
        return;
    }

    if (file.type !== 'application/pdf') {
        window.showErrorMessage({ message: 'Type de fichier invalide' }, 'upload');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        window.showErrorMessage({ message: 'Fichier trop volumineux (max 10MB)' }, 'upload');
        return;
    }

    // Afficher le spinner de chargement
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Téléversement en cours...</span>';
    }

    try {
        // Générer un nom de fichier sécurisé
        const timestamp = Date.now();
        const safeFileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        // Upload vers Firebase Storage
        const uploadRef = storage.ref('documents/' + safeFileName);
        await uploadRef.put(file, {
            contentType: 'application/pdf',
            customMetadata: {
                uploadedBy: auth.currentUser ? auth.currentUser.uid : 'unknown',
                originalName: name
            }
        });

        const downloadUrl = await uploadRef.getDownloadURL();

        // Sauvegarder les infos dans la base de données
        const docData = {
            name: name,
            url: downloadUrl,
            fileName: safeFileName,
            uploadedAt: new Date().toISOString(),
            size: file.size
        };

        // Récupérer la liste existante et ajouter le nouveau document
        const snap = await db_ref.ref('documents').once('value');
        const raw = snap.val();
        const docs = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
        docs.push(docData);
        await db_ref.ref('documents').set(docs);

        // Réinitialiser le formulaire
        nameInput.value = '';
        fileInput.value = '';

        window.showSuccessMessage('Document ajouté !', 'Le fichier est maintenant disponible au téléchargement.');

        // Rafraîchir la liste
        loadDocumentsAdmin();

    } catch (error) {
        window.showErrorMessage(error, 'upload');
    } finally {
        // Restaurer le bouton
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-upload"></i><span>Ajouter le document</span>';
        }
    }
};

// Supprimer un document
window.deleteDocument = async function(index) {
    const confirmed = await window.askConfirmation(
        'Supprimer ce document',
        'Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.',
        'danger'
    );

    if (!confirmed) return;

    try {
        const snap = await db_ref.ref('documents').once('value');
        const raw = snap.val();
        const docs = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
        const doc = docs[index];

        // Supprimer le fichier du storage
        if (doc && doc.fileName) {
            try {
                await storage.ref('documents/' + doc.fileName).delete();
            } catch (e) {
                console.warn('Fichier déjà supprimé ou introuvable', e);
            }
        }

        // Supprimer de la liste
        docs.splice(index, 1);
        await db_ref.ref('documents').set(docs);

        window.showSuccessMessage('Document supprimé', 'Le document a été retiré de la liste.');
        loadDocumentsAdmin();

    } catch (error) {
        window.showErrorMessage(error, 'delete');
    }
};

// Charger la liste des documents dans l'admin
function loadDocumentsAdmin() {
    db_ref.ref('documents').once('value', snap => {
        const raw = snap.val();
        const docs = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
        const container = document.getElementById('documents-admin-list');

        if (!container) return;

        if (docs.length === 0) {
            container.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun document pour le moment. Ajoutez-en un ci-dessus.</p>';
            return;
        }

        container.innerHTML = docs.map((doc, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:15px; background:rgba(30,41,59,0.5); border-radius:10px; border:1px solid #334155;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <i class="fas fa-file-pdf" style="font-size:28px; color:#ef4444;"></i>
                    <div>
                        <div style="color:#e2e8f0; font-weight:500;">${doc.name}</div>
                        <div style="color:#64748b; font-size:12px;">${(doc.size / 1024).toFixed(1)} Ko</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <a href="${doc.url}" target="_blank" style="background:#3b82f6; color:white; border:none; padding:8px 15px; border-radius:8px; text-decoration:none; font-size:14px;">
                        <i class="fas fa-eye"></i> Voir
                    </a>
                    <button onclick="deleteDocument(${i})" style="background:#ef4444; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:14px;">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>
        `).join('');
    });
}

// Exposer la fonction
window.loadDocumentsAdmin = loadDocumentsAdmin;

// === GESTION DES CONTACTS CRM ===
let allContacts = [];

window.loadContactsAdmin = async function() {
    const container = document.getElementById('contacts-admin-list');
    if (!container) return;
    container.innerHTML = '<p style="color:#64748b; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';

    try {
        const snap = await db_ref.ref('contacts').once('value');
        const data = snap.val();
        if (!data) {
            container.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun contact pour le moment.</p>';
            allContacts = [];
            return;
        }

        allContacts = Object.entries(data).map(([key, val]) => ({ key, ...val }));

        // Tri
        const sort = document.getElementById('contacts-sort')?.value || 'recent';
        if (sort === 'recent') allContacts.sort((a, b) => new Date(b.date) - new Date(a.date));
        else if (sort === 'oldest') allContacts.sort((a, b) => new Date(a.date) - new Date(b.date));
        else if (sort === 'name') allContacts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        window.renderContactsList(allContacts);
    } catch (err) {
        container.innerHTML = '<p style="color:#ef4444; text-align:center;">Erreur de chargement des contacts.</p>';
        console.error(err);
    }
};

window.renderContactsList = function(contacts) {
    const container = document.getElementById('contacts-admin-list');
    if (!contacts.length) {
        container.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun contact trouvé.</p>';
        return;
    }

    container.innerHTML = contacts.map(c => {
        const d = c.date ? new Date(c.date) : null;
        const dateStr = d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date inconnue';
        const msgPreview = (c.message || '').length > 120 ? c.message.substring(0, 120) + '...' : (c.message || '');

        return `
            <div style="display:flex; flex-direction:column; gap:10px; padding:15px; background:rgba(30,41,59,0.5); border-radius:10px; border:1px solid #334155;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                    <div>
                        <div style="color:#f59e0b; font-weight:bold; font-size:1rem;"><i class="fas fa-user" style="margin-right:8px;"></i>${c.name || 'Anonyme'}</div>
                        <a href="mailto:${c.email || ''}" style="color:#00d2ff; font-size:0.9rem; text-decoration:none;">${c.email || 'Pas d\'email'}</a>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="color:#64748b; font-size:0.8rem;"><i class="fas fa-clock" style="margin-right:5px;"></i>${dateStr}</span>
                        <button onclick="deleteContact('${c.key}')" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div style="color:#cbd5e1; font-size:0.9rem; background:rgba(2,6,23,0.5); padding:10px; border-radius:8px; white-space:pre-wrap;">${msgPreview}</div>
            </div>`;
    }).join('');
};

window.filterContacts = function() {
    const search = (document.getElementById('contacts-search')?.value || '').toLowerCase();
    if (!search) {
        window.renderContactsList(allContacts);
        return;
    }
    const filtered = allContacts.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.email || '').toLowerCase().includes(search)
    );
    window.renderContactsList(filtered);
};

window.deleteContact = async function(key) {
    const confirmed = await window.askConfirmation(
        'Supprimer ce contact',
        'Êtes-vous sûr de vouloir supprimer ce contact ? Cette action est irréversible.',
        'danger'
    );
    if (!confirmed) return;

    try {
        await db_ref.ref('contacts/' + key).remove();
        window.loadContactsAdmin();
        updateAdminStats();
    } catch (err) {
        console.error('Erreur suppression contact:', err);
    }
};

window.exportContacts = function() {
    if (!allContacts.length) {
        window.toast && window.toast.info('Export', 'Aucun contact à exporter.');
        return;
    }

    const headers = ['Nom', 'Email', 'Message', 'Date'];
    const csvRows = [headers.join(';')];

    allContacts.forEach(c => {
        const d = c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '';
        const msg = (c.message || '').replace(/[\r\n]+/g, ' ').replace(/;/g, ',');
        csvRows.push([c.name || '', c.email || '', msg, d].join(';'));
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_usm_tennis_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ============================================================
// GESTION DES MEMBRES
// ============================================================

window.createMemberAccount = async () => {
    const btn = document.getElementById('create-member-btn');
    const prenom = document.getElementById('new-member-prenom').value.trim();
    const nom = document.getElementById('new-member-nom').value.trim();
    const email = document.getElementById('new-member-email').value.trim();
    const password = document.getElementById('new-member-password').value.trim();
    const telephone = document.getElementById('new-member-telephone').value.trim();
    const licence = document.getElementById('new-member-licence').value.trim();
    const classement = document.getElementById('new-member-classement').value.trim();
    const categorie = document.getElementById('new-member-categorie').value;
    const statut = document.getElementById('new-member-statut').value;

    if (!prenom || !nom || !email || !password) {
        window.showWarningMessage('Champs requis', 'Prénom, nom, email et mot de passe sont obligatoires.');
        return;
    }
    if (password.length < 6) {
        window.showWarningMessage('Mot de passe trop court', 'Le mot de passe doit contenir au moins 6 caractères.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Création en cours...</span>';

    try {
        const createMember = firebase.functions().httpsCallable('createMember');
        await createMember({ prenom, nom, email, password, telephone, licence, classement, categorie, statut });
        window.showSuccessMessage('Membre créé !', `Le compte de ${prenom} ${nom} a été créé. Partagez les identifiants au membre.`);
        // Vider le formulaire
        ['prenom','nom','email','password','telephone','licence','classement'].forEach(f => {
            const el = document.getElementById(`new-member-${f}`);
            if (el) el.value = '';
        });
        window.loadMembersAdmin();
    } catch (err) {
        window.showErrorMessage(err, 'save');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i><span>Créer le compte membre</span>';
    }
};

// Convertit un classement FFT en valeur numérique (plus bas = meilleur)
function rankToNumber(rank) {
    if (!rank || rank.trim().toUpperCase() === 'NC') return 9999;
    const map = {
        '40':100,'30/5':90,'30/4':80,'30/3':70,'30/2':60,'30/1':50,'30':40,
        '15/5':30,'15/4':25,'15/3':20,'15/2':15,'15/1':10,'15':5,
        '5/6':-10,'4/6':-20,'3/6':-30,'2/6':-40,'1/6':-50,'0':-100
    };
    return map[rank.trim()] ?? 9999;
}

window.filterMembers = () => {
    const all = window._allMembersAdmin || [];
    const search = (document.getElementById('members-search')?.value || '').toLowerCase();
    const sort   = document.getElementById('members-sort')?.value || 'alpha-asc';
    const statut = document.getElementById('members-filter-statut')?.value || '';
    const actif  = document.getElementById('members-filter-actif')?.value || '';

    let filtered = all.filter(m => {
        if (statut && (m.statut || 'Membre') !== statut) return false;
        if (actif === 'actif' && !m.actif) return false;
        if (actif === 'inactif' && m.actif) return false;
        if (search) {
            const haystack = [m.prenom, m.nom, m.email, m.licence, m.classement].join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    if (sort === 'alpha-asc')   filtered.sort((a,b) => (a.nom||'').localeCompare(b.nom||''));
    else if (sort === 'alpha-desc') filtered.sort((a,b) => (b.nom||'').localeCompare(a.nom||''));
    else if (sort === 'rank-best')  filtered.sort((a,b) => rankToNumber(a.classement) - rankToNumber(b.classement));
    else if (sort === 'rank-worst') filtered.sort((a,b) => rankToNumber(b.classement) - rankToNumber(a.classement));

    const countEl = document.getElementById('members-count');
    if (countEl) countEl.textContent = `${filtered.length} / ${all.length} membre${all.length > 1 ? 's' : ''}`;

    renderMembersList(filtered);
};

function renderMembersList(members) {
    const list = document.getElementById('members-admin-list');
    if (!list) return;
    if (!members.length) {
        list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun membre trouvé.</p>';
        return;
    }
    const statutOptions = ['Membre','Membre Bureau','Coach','Secrétaire Général','Trésorier Général Adjoint','Trésorier Général','Vice-Président','Président'];
    list.innerHTML = members.map(m => memberRowHTML(m, statutOptions)).join('');
}

window.loadMembersAdmin = () => {
    const list = document.getElementById('members-admin-list');
    if (!list) return;
    list.innerHTML = '<p style="color:#64748b; text-align:center;">Chargement...</p>';

    Promise.all([
        db_ref.ref('members').once('value'),
        db_ref.ref('coaches').once('value')
    ]).then(([snap, csnap]) => {
        const data = snap.val();
        if (!data) {
            list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun membre enregistré.</p>';
            return;
        }
        const coaches = csnap.val() || {};
        window._allMembersAdmin = Object.entries(data).map(([uid, m]) => ({ uid, ...m, isCoach: !!coaches[uid] }));
        window.filterMembers();
    });
};

// Donner / retirer l'accès coach (panneau admin limité à la section Équipes)
window.toggleCoachAccess = async function(uid, grant, nom) {
    var msg = grant
        ? nom + ' pourra se connecter au panneau d\'administration avec ses identifiants membre, mais n\'aura accès qu\'à la gestion des Équipes (championnats, convocations, discussions). Aucun accès aux actualités, membres, documents…'
        : 'Retirer l\'accès coach de ' + nom + ' ? Le panneau Équipes lui sera fermé (son compte membre reste intact).';
    var ok = await window.confirmDialog.show({
        title: grant ? 'Donner l\'accès coach' : 'Retirer l\'accès coach',
        message: msg,
        type: grant ? 'info' : 'danger',
        confirmText: 'Confirmer', cancelText: 'Annuler'
    });
    if (!ok) return;
    var op = grant ? db_ref.ref('coaches/' + uid).set(true) : db_ref.ref('coaches/' + uid).remove();
    op.then(function() {
        window.showNotification && window.showNotification(grant ? 'Accès coach activé — ' + nom + ' peut ouvrir le panneau Équipes.' : 'Accès coach retiré.', 'success');
        window.loadMembersAdmin();
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur : ' + (err.message || err), 'error');
    });
};

// Catégories proposées à la création d'un membre — mêmes valeurs à l'édition
var _CATEGORIES_MEMBRE = [
    { val: 'Adulte H',  lib: 'Adulte Homme' },
    { val: 'Adulte F',  lib: 'Adulte Femme' },
    { val: 'Jeune G',   lib: 'Jeune Garçon' },
    { val: 'Jeune F',   lib: 'Jeune Fille' },
    { val: 'Vétéran H', lib: 'Vétéran Homme' },
    { val: 'Vétéran F', lib: 'Vétéran Femme' }
];

function memberRowHTML(m, statutOptions) {
    statutOptions = statutOptions || ['Membre','Membre Bureau','Coach','Secrétaire Général','Trésorier Général Adjoint','Trésorier Général','Vice-Président','Président'];
    return `
        <div style="background:rgba(34,197,94,0.05); border:1px solid rgba(34,197,94,0.15); border-radius:12px; overflow:hidden;">
            <div style="display:flex; align-items:center; gap:16px; padding:14px 18px; flex-wrap:wrap;">
                <div style="width:42px; height:42px; border-radius:50%; background:rgba(34,197,94,0.15); border:1px solid #22c55e; display:flex; align-items:center; justify-content:center; color:#22c55e; font-weight:bold; flex-shrink:0;">
                    ${(m.prenom || '?')[0]}${(m.nom || '?')[0]}
                </div>
                <div style="flex:1; min-width:150px;">
                    <div style="color:white; font-weight:600;">${escapeHtml(m.prenom || '')} ${escapeHtml(m.nom || '')}
                        ${m.statut && m.statut !== 'Membre' ? `<span style="margin-left:8px; background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.35); color:#ffd700; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:normal;">${escapeHtml(m.statut)}</span>` : ''}
                    </div>
                    <div style="color:#64748b; font-size:12px;">${escapeHtml(m.email || '')} · Licence: ${escapeHtml(m.licence || '—')} · ${escapeHtml(m.classement || '—')}</div>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <span style="padding:3px 10px; border-radius:50px; font-size:11px; font-weight:bold; background:${m.actif ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color:${m.actif ? '#22c55e' : '#ef4444'}; border:1px solid ${m.actif ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                        ${m.actif ? 'Actif' : 'Inactif'}
                    </span>
                    <button onclick="window.open('/espace-membre.html?uid=${m.uid}', '_blank')"
                        style="background:rgba(0,210,255,0.08); border:1px solid rgba(0,210,255,0.35); color:#00d2ff; padding:5px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                        <i class="fas fa-id-card"></i> Dashboard
                    </button>
                    <button onclick="window.toggleMemberEdit('${m.uid}')"
                        style="background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.35); color:#ffd700; padding:5px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    ${window.isCurrentUserAdmin ? `
                    <button onclick="window.toggleCoachAccess('${m.uid}', ${m.isCoach ? 'false' : 'true'}, '${escapeHtml(m.prenom || '')} ${escapeHtml(m.nom || '')}')"
                        title="${m.isCoach ? 'Accès coach actif — cliquer pour retirer' : 'Donner l’accès au panneau Équipes'}"
                        style="background:${m.isCoach ? 'rgba(201,162,39,0.18)' : 'rgba(100,116,139,0.08)'}; border:1px solid ${m.isCoach ? 'rgba(201,162,39,0.55)' : 'rgba(100,116,139,0.3)'}; color:${m.isCoach ? '#c9a227' : '#94a3b8'}; padding:5px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                        <i class="fas fa-user-tie"></i> ${m.isCoach ? 'Coach ✓' : 'Accès coach'}
                    </button>
                    ` : (m.isCoach ? `
                    <span title="Accès coach actif — réservé à l'administrateur pour le modifier"
                        style="background:rgba(201,162,39,0.18); border:1px solid rgba(201,162,39,0.55); color:#c9a227; padding:5px 12px; border-radius:8px; font-size:12px;">
                        <i class="fas fa-user-tie"></i> Coach ✓
                    </span>
                    ` : '')}
                    <button onclick="window.toggleMemberActive('${m.uid}', ${!m.actif})"
                        style="background:${m.actif ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'}; border:1px solid ${m.actif ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}; color:${m.actif ? '#ef4444' : '#22c55e'}; padding:5px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                        ${m.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <button onclick="window.deleteMemberAdmin('${m.uid}', '${escapeHtml(m.prenom || '')} ${escapeHtml(m.nom || '')}')"
                        style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); color:#ef4444; padding:5px 10px; border-radius:8px; cursor:pointer; font-size:11px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <!-- Formulaire d'édition inline (masqué par défaut) -->
            <div id="edit-member-${m.uid}" style="display:none; padding:16px 18px; border-top:1px solid rgba(255,215,0,0.15); background:rgba(255,215,0,0.03);">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px;">
                    <div>
                        <label style="color:#94a3b8; font-size:11px; display:block; margin-bottom:4px;">Classement</label>
                        <input id="edit-classement-${m.uid}" value="${escapeHtml(m.classement || '')}" placeholder="15/4 ou NC"
                            style="width:100%; padding:8px 10px; background:#1e293b; border:1px solid #475569; color:white; border-radius:6px; font-size:13px; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="color:#94a3b8; font-size:11px; display:block; margin-bottom:4px;">N° Licence FFT</label>
                        <input id="edit-licence-${m.uid}" value="${escapeHtml(m.licence || '')}" placeholder="1234567"
                            style="width:100%; padding:8px 10px; background:#1e293b; border:1px solid #475569; color:white; border-radius:6px; font-size:13px; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="color:#94a3b8; font-size:11px; display:block; margin-bottom:4px;">Catégorie</label>
                        <select id="edit-categorie-${m.uid}"
                            style="width:100%; padding:8px 10px; background:#1e293b; border:1px solid #475569; color:white; border-radius:6px; font-size:13px; box-sizing:border-box;">
                            ${_CATEGORIES_MEMBRE.map(c => `<option value="${c.val}" ${(m.categorie||'Adulte H')===c.val?'selected':''}>${c.lib}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="color:#94a3b8; font-size:11px; display:block; margin-bottom:4px;">Statut</label>
                        <select id="edit-statut-${m.uid}"
                            style="width:100%; padding:8px 10px; background:#1e293b; border:1px solid rgba(255,215,0,0.35); color:white; border-radius:6px; font-size:13px; box-sizing:border-box;">
                            ${statutOptions.map(s => `<option value="${s}" ${(m.statut||'Membre')===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="window.saveMemberEdit('${m.uid}')"
                        style="background:linear-gradient(135deg,#ffd700,#f59e0b); color:#0d1b2e; border:none; padding:8px 20px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px;">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                    <button onclick="window.toggleMemberEdit('${m.uid}')"
                        style="background:rgba(100,116,139,0.15); border:1px solid rgba(100,116,139,0.3); color:#94a3b8; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">
                        Annuler
                    </button>
                </div>
            </div>
        </div>
    `;
}

window.loadScanStats = () => {
    const el = document.getElementById('scan-stats-list');
    if (!el) return;
    el.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';

    Promise.all([
        db_ref.ref('scans').once('value'),
        db_ref.ref('members').once('value')
    ]).then(([scansSnap, membersSnap]) => {
        const scansData  = scansSnap.val()  || {};
        const membersData = membersSnap.val() || {};

        // Compter les scans par UID
        const counts = {};
        Object.entries(scansData).forEach(([uid, entries]) => {
            counts[uid] = Object.keys(entries || {}).length;
        });

        const totalScans = Object.values(counts).reduce((a, b) => a + b, 0);

        if (totalScans === 0) {
            el.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">Aucun scan enregistré pour l\'instant.</p>';
            return;
        }

        // Trier par nombre de scans décroissant
        const rows = Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .map(([uid, count]) => {
                const m = membersData[uid] || {};
                const name = m.prenom && m.nom ? `${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}` : `<span style="color:#64748b;">${uid.substring(0,8)}…</span>`;
                const pct  = Math.round(count / totalScans * 100);
                return `
                <div style="display:flex; align-items:center; gap:14px; background:rgba(255,215,0,0.04); border:1px solid rgba(255,215,0,0.12); border-radius:10px; padding:12px 16px;">
                    <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.3); display:flex; align-items:center; justify-content:center; color:#ffd700; font-size:11px; font-weight:700; flex-shrink:0;">
                        <i class="fas fa-qrcode"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#e2e8f0; font-size:13px; font-weight:600;">${name}</div>
                        <div style="margin-top:5px; height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
                            <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,rgba(255,215,0,0.7),rgba(255,215,0,0.4)); border-radius:2px;"></div>
                        </div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="color:#ffd700; font-size:18px; font-weight:700;">${count}</div>
                        <div style="color:#64748b; font-size:10px; letter-spacing:1px;">SCAN${count > 1 ? 'S' : ''}</div>
                    </div>
                </div>`;
            }).join('');

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,215,0,0.06); border:1px solid rgba(255,215,0,0.2); border-radius:10px; padding:12px 18px; margin-bottom:4px;">
                <span style="color:rgba(255,215,0,0.7); font-size:12px; letter-spacing:1px;"><i class="fas fa-chart-bar" style="margin-right:6px;"></i>TOTAL</span>
                <span style="color:#ffd700; font-weight:700; font-size:18px;">${totalScans} scan${totalScans > 1 ? 's' : ''}</span>
            </div>
            ${rows}`;
    }).catch(() => {
        el.innerHTML = '<p style="color:#ef4444; font-size:13px; text-align:center;">Erreur lors du chargement.</p>';
    });
};

window.toggleMemberEdit = (uid) => {
    const el = document.getElementById(`edit-member-${uid}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.saveMemberEdit = async (uid) => {
    const classement = document.getElementById(`edit-classement-${uid}`)?.value.trim() || '';
    const licence    = document.getElementById(`edit-licence-${uid}`)?.value.trim() || '';
    const statut     = document.getElementById(`edit-statut-${uid}`)?.value || 'Membre';
    const categorie  = document.getElementById(`edit-categorie-${uid}`)?.value || 'Adulte H';
    try {
        await db_ref.ref(`members/${uid}`).update({ classement, licence, statut, categorie });
        window.showSuccessMessage('Modifications enregistrées', '');
        window.loadMembersAdmin();
    } catch (err) {
        window.showErrorMessage(err, 'save');
    }
};

window.toggleMemberActive = async (uid, newStatus) => {
    try {
        const toggleFn = firebase.functions().httpsCallable('toggleMemberStatus');
        await toggleFn({ uid, actif: newStatus });
        window.showSuccessMessage(newStatus ? 'Membre réactivé' : 'Membre désactivé', '');
        window.loadMembersAdmin();
    } catch (err) {
        window.showErrorMessage(err, 'save');
    }
};

window.deleteMemberAdmin = async (uid, name) => {
    // Garde-fou : refuser de supprimer un compte qui porte un rôle admin ou coach
    // (supprimer la fiche membre détruit aussi le compte de connexion partagé)
    const [adminSnap, coachSnap] = await Promise.all([
        db_ref.ref('admins/' + uid).once('value').catch(() => null),
        db_ref.ref('coaches/' + uid).once('value').catch(() => null)
    ]);
    if (adminSnap && adminSnap.exists()) {
        window.showNotification && window.showNotification(
            'Suppression bloquée : ce compte est un ADMINISTRATEUR. Supprimer sa fiche membre détruirait aussi son accès admin. Retirez d\'abord son rôle admin si c\'est vraiment voulu.',
            'error'
        );
        return;
    }
    if (coachSnap && coachSnap.exists()) {
        window.showNotification && window.showNotification(
            'Suppression bloquée : ce compte a l\'accès COACH. Retirez d\'abord son accès coach (bouton « Coach ✓ » sur sa fiche), puis supprimez-le.',
            'error'
        );
        return;
    }

    const confirmed = await window.askConfirmation(
        'Supprimer le membre',
        `Êtes-vous sûr de vouloir supprimer le compte de ${name} ? Son compte de connexion sera aussi détruit. Cette action est irréversible.`,
        'danger'
    );
    if (!confirmed) return;

    try {
        const deleteFn = firebase.functions().httpsCallable('deleteMember');
        await deleteFn({ uid });
        window.showSuccessMessage('Membre supprimé', `Le compte de ${name} a été supprimé.`);
        window.loadMembersAdmin();
    } catch (err) {
        window.showErrorMessage(err, 'delete');
    }
};

// Initialisation au chargement (Déplacé à la fin pour éviter les erreurs de référence)
window.switchAdmin('news');

// Charger les stats après un court délai pour laisser le temps à Firebase de se connecter
setTimeout(() => {
    if (window.isCurrentUserAdmin) {
        updateAdminStats();
    }
}, 1000);

// ===== MESSAGES CLUB — CRUD =====

window.loadClubMessagesAdmin = function() {
    var list = document.getElementById('club-messages-admin-list');
    if (!list) return;
    list.innerHTML = '<p style="color:#64748b; text-align:center;">Chargement...</p>';

    db_ref.ref('club_messages').orderByChild('createdAt').once('value', function(snap) {
        var val = snap.val();
        if (!val) {
            list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun message publié.</p>';
            return;
        }
        var msgs = Object.entries(val)
            .map(function(e) { return Object.assign({ _id: e[0] }, e[1]); })
            .sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

        var typeLabels = { info: '🔵 Info', warning: '🟡 Avertissement', urgent: '🔴 Urgent' };
        var borderColors = { info: '#3b82f6', warning: '#f59e0b', urgent: '#ef4444' };

        list.innerHTML = msgs.map(function(m) {
            var color = borderColors[m.type] || '#3b82f6';
            var actifLabel = m.actif === false
                ? '<span style="color:#ef4444; font-size:0.72rem; font-weight:600;">● Désactivé</span>'
                : '<span style="color:#22c55e; font-size:0.72rem; font-weight:600;">● Actif</span>';
            return '<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-left:4px solid ' + color + '; border-radius:10px; padding:14px 16px;">' +
                '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">' +
                    '<span style="font-weight:600; color:#e2e8f0; flex:1; min-width:0;">' + escHtml(m.titre) + '</span>' +
                    '<span style="color:#94a3b8; font-size:0.78rem;">' + (typeLabels[m.type] || 'Info') + '</span>' +
                    '<span style="color:#64748b; font-size:0.75rem;">' + (m.date || '') + '</span>' +
                    actifLabel +
                '</div>' +
                '<p style="color:#94a3b8; font-size:0.83rem; margin:0 0 12px; line-height:1.5; white-space:pre-wrap;">' + escHtml(m.contenu) + '</p>' +
                '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                    '<button onclick="window.editClubMessage(\'' + m._id + '\')" style="padding:5px 14px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); border-radius:8px; color:#60a5fa; font-family:inherit; font-size:0.8rem; cursor:pointer;">' +
                        '<i class="fas fa-edit"></i> Modifier' +
                    '</button>' +
                    '<button onclick="window.toggleClubMessage(\'' + m._id + '\',' + (m.actif !== false) + ')" style="padding:5px 14px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.25); border-radius:8px; color:#fbbf24; font-family:inherit; font-size:0.8rem; cursor:pointer;">' +
                        '<i class="fas fa-' + (m.actif === false ? 'eye' : 'eye-slash') + '"></i> ' + (m.actif === false ? 'Activer' : 'Désactiver') +
                    '</button>' +
                    '<button onclick="window.deleteClubMessage(\'' + m._id + '\')" style="padding:5px 14px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:8px; color:#f87171; font-family:inherit; font-size:0.8rem; cursor:pointer;">' +
                        '<i class="fas fa-trash"></i> Supprimer' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    });
};

window.saveClubMessage = function() {
    var titre = (document.getElementById('msg-titre')?.value || '').trim();
    var contenu = (document.getElementById('msg-contenu')?.value || '').trim();
    var type = document.getElementById('msg-type')?.value || 'info';
    var date = (document.getElementById('msg-date')?.value || '').trim();
    var editId = document.getElementById('msg-edit-id')?.value || '';

    if (!titre || !contenu) {
        window.toast && window.toast.warning('Champs manquants', 'Le titre et le contenu sont obligatoires.');
        return;
    }

    var data = { titre: titre, contenu: contenu, type: type, date: date, actif: true };

    var ref;
    if (editId) {
        ref = db_ref.ref('club_messages/' + editId);
        // Conserver le createdAt d'origine
        ref.update(data).then(function() {
            window.showSuccessMessage && window.showSuccessMessage('Message mis à jour !', '');
            window.cancelEditMessage();
            window.loadClubMessagesAdmin();
        });
    } else {
        data.createdAt = Date.now();
        ref = db_ref.ref('club_messages').push();
        ref.set(data).then(function() {
            window.showSuccessMessage && window.showSuccessMessage('Message publié !', '');
            window.cancelEditMessage();
            window.loadClubMessagesAdmin();
        });
    }
};

window.editClubMessage = function(id) {
    db_ref.ref('club_messages/' + id).once('value', function(snap) {
        var m = snap.val();
        if (!m) return;
        document.getElementById('msg-edit-id').value = id;
        document.getElementById('msg-titre').value = m.titre || '';
        document.getElementById('msg-contenu').value = m.contenu || '';
        document.getElementById('msg-type').value = m.type || 'info';
        document.getElementById('msg-date').value = m.date || '';
        var title = document.getElementById('msg-form-title');
        if (title) title.innerHTML = '<i class="fas fa-edit"></i> Modifier le message';
        var cancelBtn = document.getElementById('msg-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        document.getElementById('msg-titre')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
};

window.cancelEditMessage = function() {
    document.getElementById('msg-edit-id').value = '';
    document.getElementById('msg-titre').value = '';
    document.getElementById('msg-contenu').value = '';
    document.getElementById('msg-type').value = 'info';
    document.getElementById('msg-date').value = '';
    var title = document.getElementById('msg-form-title');
    if (title) title.innerHTML = '<i class="fas fa-plus-circle"></i> Nouveau message';
    var cancelBtn = document.getElementById('msg-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
};

window.toggleClubMessage = function(id, currentActif) {
    db_ref.ref('club_messages/' + id).update({ actif: !currentActif }).then(function() {
        window.loadClubMessagesAdmin();
    });
};

window.deleteClubMessage = async function(id) {
    const ok = await window.confirmDialog.show({
        title: 'Supprimer le message',
        message: 'Supprimer définitivement ce message ?',
        type: 'danger',
        confirmText: 'Supprimer',
        cancelText: 'Annuler'
    });
    if (!ok) return;
    db_ref.ref('club_messages/' + id).remove().then(function() {
        window.showSuccessMessage && window.showSuccessMessage('Message supprimé.', '');
        window.loadClubMessagesAdmin();
    });
};

// =====================================================================
// GESTION DES CHAMPIONNATS EN ÉQUIPE
// =====================================================================

var _champListenerEq = null;
var _champDataCache = {};
var _equipeListenerEq = null;
var _inscritsMembersCache = null;

// --- Sous-onglets ---
window.switchEquipesSubTab = function(tab) {
    ['championnats','equipes'].forEach(function(t) {
        var el = document.getElementById('eq-subtab-' + t);
        var btn = document.getElementById('eq-subtab-btn-' + t);
        if (el) el.style.display = (t === tab) ? '' : 'none';
        if (btn) {
            btn.style.background = (t === tab) ? '#e11d48' : '#334155';
            btn.style.color = (t === tab) ? 'white' : '#94a3b8';
        }
    });
    if (tab === 'equipes') _refreshEquipesSelect();
};


function _refreshEquipesSelect() {
    var sel = document.getElementById('equipes-champ-select');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '<option value="">-- Choisir --</option>';
    Object.keys(_champDataCache).forEach(function(id) {
        var c = _champDataCache[id];
        var opt = document.createElement('option');
        opt.value = id; opt.textContent = escHtml(c.nom);
        if (id === prev) opt.selected = true;
        sel.appendChild(opt);
    });
}

// --- Chargement principal ---
window.loadChampionnatsAdmin = function() {
    if (_champListenerEq) return;
    _champListenerEq = true;
    db_ref.ref('championnats_equipe').on('value', function(snap) {
        _champDataCache = {};
        var list = document.getElementById('championnats-admin-list');
        if (!snap.exists()) {
            if (list) list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun championnat. Créez-en un ci-dessus.</p>';
            return;
        }
        var html = '';
        snap.forEach(function(child) {
            var c = child.val(); var id = child.key;
            _champDataCache[id] = Object.assign({}, c, {id: id});
            // Statut simplifié : ouvert aux inscriptions ou fermé (les anciens statuts equipes/en_cours/termine comptent comme fermé)
            var isOpen = c.statut === 'inscriptions';
            var statutColor = isOpen ? '#22c55e' : '#64748b';
            var statutLabel = isOpen ? 'Inscriptions ouvertes' : 'Inscriptions fermées';
            var format = (c.nb_simples || 2) + ' Simple' + ((c.nb_simples > 1) ? 's' : '');
            if (c.nb_doubles > 0) format += ' + ' + c.nb_doubles + ' Double' + (c.nb_doubles > 1 ? 's' : '');
            html += '<div id="champ-container-' + id + '" style="margin-bottom:8px;">'
                + '<div style="background:#1e293b; border:1px solid #334155; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">'
                + '<div style="flex:1; min-width:180px;">'
                + '<div style="font-weight:bold; color:#e2e8f0; margin-bottom:4px;">' + escHtml(c.nom) + '</div>'
                + '<div style="font-size:12px; color:#94a3b8;">' + escHtml(c.saison) + ' — ' + escHtml(format) + '</div>'
                + '</div>'
                + '<span style="background:' + statutColor + '22; color:' + statutColor + '; border:1px solid ' + statutColor + '55; border-radius:20px; padding:4px 12px; font-size:12px; white-space:nowrap;">' + escHtml(statutLabel) + '</span>'
                + '<div style="display:flex; gap:8px; flex-wrap:wrap;">'
                + '<button onclick="window.toggleInscritsChamp(\'' + id + '\')" style="background:#0f172a; color:#00d2ff; border:1px solid #00d2ff44; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-users" style="margin-right:5px;"></i>Inscrits</button>'
                + '<button onclick="toggleInscriptionsChamp(\'' + id + '\',' + (isOpen ? 'true' : 'false') + ')" style="background:#0f172a; color:#f59e0b; border:1px solid #f59e0b44; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-' + (isOpen ? 'lock' : 'lock-open') + '" style="margin-right:5px;"></i>' + (isOpen ? 'Fermer' : 'Ouvrir') + ' les inscriptions</button>'
                + '<button onclick="editChampionnat(\'' + id + '\')" style="background:#0f172a; color:#e2e8f0; border:1px solid #47556944; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-edit"></i></button>'
                + '<button onclick="deleteChampionnat(\'' + id + '\')" style="background:#0f172a; color:#ef4444; border:1px solid #ef444444; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i></button>'
                + '</div></div>'
                + '<div id="inscrits-panel-' + id + '" style="display:none; background:#0f172a; border:1px solid #334155; border-top:none; border-radius:0 0 10px 10px; padding:12px 16px;"></div>'
                + '</div>';
        });
        if (list) list.innerHTML = html || '<p style="color:#64748b; text-align:center;">Aucun championnat.</p>';
        _refreshEquipesSelect();
    });
};

// --- CRUD Championnats ---
window.saveChampionnat = function() {
    var nom = (document.getElementById('champ-nom').value || '').trim();
    var saison = (document.getElementById('champ-saison').value || '').trim();
    var categorie = document.getElementById('champ-categorie').value;
    var nbSimples = parseInt(document.getElementById('champ-nb-simples').value) || 2;
    var nbDoubles = parseInt(document.getElementById('champ-nb-doubles').value) || 0;
    var desc = (document.getElementById('champ-description').value || '').trim();
    var nbEquipes = parseInt(document.getElementById('champ-nb-equipes').value) || 0;
    var editId = document.getElementById('champ-edit-id').value;
    if (!nom || !saison) { window.showNotification && window.showNotification('Remplissez au moins le nom et la saison.', 'error'); return; }
    var data = { nom: nom, saison: saison, categorie: categorie, nb_simples: nbSimples, nb_doubles: nbDoubles, description: desc };
    var ref = editId ? db_ref.ref('championnats_equipe/' + editId) : db_ref.ref('championnats_equipe').push();
    if (!editId) data.statut = 'inscriptions';
    if (!editId) data.createdAt = Date.now();
    ref.update(data).then(function() {
        var champId = ref.key;
        // Création automatique des équipes (nouveau championnat uniquement)
        if (!editId && nbEquipes > 0) {
            var promises = [];
            for (var i = 1; i <= nbEquipes; i++) {
                var cminEl = document.getElementById('champ-eq-cmin-' + i);
                var cmaxEl = document.getElementById('champ-eq-cmax-' + i);
                promises.push(db_ref.ref('equipes').push({
                    champId: champId,
                    nom: 'Équipe ' + i,
                    classement_min: cminEl ? (cminEl.value || '') : '',
                    classement_max: cmaxEl ? (cmaxEl.value || '') : '',
                    niveau: '',
                    createdAt: Date.now()
                }));
            }
            Promise.all(promises).then(function() {
                window.showNotification && window.showNotification('Championnat créé avec ' + nbEquipes + ' équipe' + (nbEquipes > 1 ? 's' : '') + ' !', 'success');
            });
        } else {
            window.showNotification && window.showNotification(editId ? 'Championnat mis à jour.' : 'Championnat créé !', 'success');
        }
        resetChampionnatForm();
    });
};

window.editChampionnat = function(id) {
    var c = _champDataCache[id]; if (!c) return;
    document.getElementById('champ-nom').value = c.nom || '';
    document.getElementById('champ-saison').value = c.saison || '';
    document.getElementById('champ-categorie').value = c.categorie || 'homme';
    document.getElementById('champ-nb-simples').value = c.nb_simples || 2;
    document.getElementById('champ-nb-doubles').value = c.nb_doubles || 0;
    document.getElementById('champ-description').value = c.description || '';
    document.getElementById('champ-nb-equipes').value = 0;
    // Masquer le champ nb équipes en mode édition (inutile de recréer)
    var nbEqEl = document.getElementById('champ-nb-equipes');
    if (nbEqEl) nbEqEl.closest('div').style.display = 'none';
    document.getElementById('champ-edit-id').value = id;
    document.getElementById('champ-save-label').textContent = 'Enregistrer les modifications';
    document.getElementById('champ-cancel-btn').style.display = '';
    document.getElementById('champ-nom').focus();
};

window.resetChampionnatForm = function() {
    ['champ-nom','champ-saison','champ-description'].forEach(function(f) { var el = document.getElementById(f); if (el) el.value = ''; });
    document.getElementById('champ-edit-id').value = '';
    document.getElementById('champ-nb-equipes').value = 0;
    var nbEqEl = document.getElementById('champ-nb-equipes');
    if (nbEqEl) nbEqEl.closest('div').style.display = '';
    window.updateEquipesClassementRows(0);
    document.getElementById('champ-save-label').textContent = 'Créer le championnat';
    document.getElementById('champ-cancel-btn').style.display = 'none';
};

window.deleteChampionnat = async function(id) {
    var ok = await window.confirmDialog.show({
        title: 'Supprimer le championnat',
        message: 'Cette action supprimera définitivement le championnat, toutes ses rencontres, les inscriptions des membres, les équipes et les convocations associées.',
        type: 'danger', confirmText: 'Tout supprimer', cancelText: 'Annuler'
    });
    if (!ok) return;

    try {
        // 1. Supprimer le championnat + ses rencontres
        await db_ref.ref('championnats_equipe/' + id).remove();

        // 2. Supprimer toutes les inscriptions des membres pour ce championnat
        await db_ref.ref('inscriptions_equipe/' + id).remove();

        // 3. Supprimer toutes les équipes liées à ce championnat (et leurs discussions)
        var snapEquipes = await db_ref.ref('equipes').orderByChild('champId').equalTo(id).once('value');
        var suppEquipes = [];
        snapEquipes.forEach(function(child) {
            suppEquipes.push(db_ref.ref('equipes/' + child.key).remove());
            suppEquipes.push(db_ref.ref('chats_equipe/' + child.key).remove());
        });
        await Promise.all(suppEquipes);

        // 4. Supprimer toutes les notifications liées à ce championnat
        var snapNotifs = await db_ref.ref('notifications_equipe').orderByChild('champId').equalTo(id).once('value');
        var suppNotifs = [];
        snapNotifs.forEach(function(child) { suppNotifs.push(db_ref.ref('notifications_equipe/' + child.key).remove()); });
        await Promise.all(suppNotifs);

        window.showNotification && window.showNotification('Championnat et toutes les données associées supprimés.', 'success');
    } catch(err) {
        console.error('Erreur deleteChampionnat :', err);
        window.showNotification && window.showNotification('Suppression incomplète : ' + (err.message || err) + ' — réessayez ou contactez le support.', 'error');
    }
};

window.toggleInscriptionsChamp = async function(id, isOpen) {
    var msg = isOpen
        ? 'Fermer les inscriptions ? Les membres ne pourront plus s\'inscrire à ce championnat (les inscriptions existantes sont conservées).'
        : 'Rouvrir les inscriptions ? Le championnat redeviendra visible dans l\'espace membre pour s\'inscrire.';
    var ok = await window.confirmDialog.show({ title: isOpen ? 'Fermer les inscriptions' : 'Ouvrir les inscriptions', message: msg, type: 'info', confirmText: 'Confirmer', cancelText: 'Annuler' });
    if (!ok) return;
    db_ref.ref('championnats_equipe/' + id).update({ statut: isOpen ? 'ferme' : 'inscriptions' }).then(function() {
        window.showNotification && window.showNotification(isOpen ? 'Inscriptions fermées.' : 'Inscriptions ouvertes.', 'success');
    });
};

// --- Rencontres (par équipe) ---
var _rencontresModalChampId = null; // utilisé pour rafraîchir le Kanban

window.openRencontresModal = function(equipeId) {
    db_ref.ref('equipes/' + equipeId).once('value', function(snap) {
        var eq = snap.val() || {};
        _rencontresModalChampId = eq.champId || null;
        document.getElementById('modal-rencontres-equipe-id').value = equipeId;
        document.getElementById('modal-rencontres-equipe-nom').textContent = (eq.nom || 'Équipe') + (eq.niveau ? ' — ' + eq.niveau : '');
        document.getElementById('rencontre-edit-id').value = '';
        document.getElementById('rencontre-save-label').textContent = 'Ajouter';
        ['rencontre-date','rencontre-heure','rencontre-adversaire','rencontre-lieu','rencontre-note'].forEach(function(f) { var el = document.getElementById(f); if (el) el.value = ''; });
        document.getElementById('rencontre-domicile').checked = false;
        document.getElementById('modal-rencontres').style.display = '';
        _loadRencontresModal(equipeId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur chargement calendrier : ' + (err.message || err), 'error');
    });
};

window.closeRencontresModal = function() {
    document.getElementById('modal-rencontres').style.display = 'none';
    if (_rencontresModalChampId) window.loadEquipesAdmin(_rencontresModalChampId);
};

function _loadRencontresModal(equipeId) {
    db_ref.ref('equipes/' + equipeId + '/rencontres').orderByChild('date').once('value', function(snap) {
        var list = document.getElementById('rencontres-list-modal');
        if (!snap.exists()) { list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucune rencontre.</p>'; return; }
        var html = '';
        snap.forEach(function(child) {
            var r = child.val(); var rid = child.key;
            var domicile = r.domicile ? '<span style="color:#22c55e; font-size:11px;"><i class="fas fa-home" style="margin-right:3px;"></i>Domicile</span>' : '<span style="color:#f59e0b; font-size:11px;"><i class="fas fa-bus" style="margin-right:3px;"></i>Extérieur</span>';
            html += '<div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">'
                + '<div style="flex:1; min-width:160px;">'
                + '<div style="font-weight:bold; color:#e2e8f0; font-size:14px;">' + escHtml(r.date) + ' à ' + escHtml(r.heure) + ' ' + domicile + '</div>'
                + '<div style="font-size:12px; color:#94a3b8; margin-top:3px;">' + (r.adversaire ? 'vs ' + escHtml(r.adversaire) : '<em>Adversaire TBD</em>') + (r.lieu ? ' — ' + escHtml(r.lieu) : '') + (r.note ? ' · ' + escHtml(r.note) : '') + '</div>'
                + '</div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="editRencontre(\'' + equipeId + '\',\'' + rid + '\')" style="background:#0f172a; color:#e2e8f0; border:1px solid #47556944; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-edit"></i></button>'
                + '<button onclick="deleteRencontre(\'' + equipeId + '\',\'' + rid + '\')" style="background:#0f172a; color:#ef4444; border:1px solid #ef444444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i></button>'
                + '</div></div>';
        });
        list.innerHTML = html;
    });
}

window.saveRencontre = function() {
    var equipeId = document.getElementById('modal-rencontres-equipe-id').value;
    var date = document.getElementById('rencontre-date').value;
    var heure = document.getElementById('rencontre-heure').value;
    var adversaire = (document.getElementById('rencontre-adversaire').value || '').trim();
    var lieu = (document.getElementById('rencontre-lieu').value || '').trim();
    var domicile = document.getElementById('rencontre-domicile').checked;
    var note = (document.getElementById('rencontre-note').value || '').trim();
    var editId = document.getElementById('rencontre-edit-id').value;
    if (!equipeId) { window.showNotification && window.showNotification('Erreur : identifiant d\'équipe manquant.', 'error'); return; }
    if (!date || !heure) { window.showNotification && window.showNotification('Date et heure obligatoires.', 'error'); return; }
    var data = { date: date, heure: heure, adversaire: adversaire, lieu: lieu, domicile: domicile, note: note };
    var ref = editId ? db_ref.ref('equipes/' + equipeId + '/rencontres/' + editId) : db_ref.ref('equipes/' + equipeId + '/rencontres').push();
    ref.set(data).then(function() {
        window.showNotification && window.showNotification('Rencontre enregistrée.', 'success');
        ['rencontre-date','rencontre-heure','rencontre-adversaire','rencontre-lieu','rencontre-note'].forEach(function(f) { var el = document.getElementById(f); if (el) el.value = ''; });
        document.getElementById('rencontre-domicile').checked = false;
        document.getElementById('rencontre-edit-id').value = '';
        document.getElementById('rencontre-save-label').textContent = 'Ajouter';
        _loadRencontresModal(equipeId);
        if (_rencontresModalChampId) window.loadEquipesAdmin(_rencontresModalChampId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur enregistrement rencontre : ' + (err.message || err), 'error');
    });
};

window.editRencontre = function(equipeId, rid) {
    db_ref.ref('equipes/' + equipeId + '/rencontres/' + rid).once('value', function(snap) {
        if (!snap.exists()) return;
        var r = snap.val();
        document.getElementById('rencontre-date').value = r.date || '';
        document.getElementById('rencontre-heure').value = r.heure || '';
        document.getElementById('rencontre-adversaire').value = r.adversaire || '';
        document.getElementById('rencontre-lieu').value = r.lieu || '';
        document.getElementById('rencontre-domicile').checked = !!r.domicile;
        document.getElementById('rencontre-note').value = r.note || '';
        document.getElementById('rencontre-edit-id').value = rid;
        document.getElementById('rencontre-save-label').textContent = 'Modifier';
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur chargement rencontre : ' + (err.message || err), 'error');
    });
};

window.deleteRencontre = async function(equipeId, rid) {
    var ok = await window.confirmDialog.show({ title: 'Supprimer la rencontre', message: 'Supprimer cette rencontre ?', type: 'danger', confirmText: 'Supprimer', cancelText: 'Annuler' });
    if (!ok) return;
    db_ref.ref('equipes/' + equipeId + '/rencontres/' + rid).remove().then(function() {
        window.showNotification && window.showNotification('Rencontre supprimée.', 'success');
        _loadRencontresModal(equipeId);
        if (_rencontresModalChampId) window.loadEquipesAdmin(_rencontresModalChampId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur suppression rencontre : ' + (err.message || err), 'error');
    });
};


// --- Équipes & Convocations ---
// Couleurs distinctes pour chaque équipe dans le Kanban
var _EQUIPE_COLORS = ['#e11d48','#00d2ff','#f59e0b','#22c55e','#8b5cf6','#f97316','#06b6d4','#ec4899'];

window.loadEquipesAdmin = function(champId) {
    var container = document.getElementById('equipes-admin-container');
    if (!champId) { if (container) container.innerHTML = '<p style="color:#64748b; text-align:center;">Sélectionnez un championnat.</p>'; return; }
    if (container) container.innerHTML = '<p style="color:#64748b; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';

    Promise.all([
        db_ref.ref('equipes').orderByChild('champId').equalTo(champId).once('value'),
        db_ref.ref('inscriptions_equipe/' + champId).once('value'),
        db_ref.ref('members').once('value')
    ]).then(function(snapsAdmin) {
        var snapEquipes = snapsAdmin[0]; var snapInscrits = snapsAdmin[1]; var snapMembers = snapsAdmin[2];

                    var members = {};
                    snapMembers.forEach(function(m) { members[m.key] = m.val(); });

                    // Inscriptions du championnat (pour la synthèse des disponibilités)
                    var inscritsChamp = {};
                    snapInscrits.forEach(function(child) { inscritsChamp[child.key] = child.val(); });

                    // Liste des inscriptions (la plus récente en premier) — toujours visible en bas de page
                    var inscritsUids = Object.keys(inscritsChamp).sort(function(a, b) {
                        return (inscritsChamp[b].createdAt || 0) - (inscritsChamp[a].createdAt || 0);
                    });
                    var inscriptionsRows = inscritsUids.map(function(uid) {
                        return _inscriptionRowHtml(champId, uid, inscritsChamp[uid], members[uid]);
                    }).join('');
                    var inscriptionsHtml = '<div style="margin-top:24px; background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px 18px;">'
                        + '<div style="font-size:12px; color:#94a3b8; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">'
                        + '<i class="fas fa-user-clock" style="margin-right:6px; color:#00d2ff;"></i>Inscriptions au championnat (' + inscritsUids.length + ')'
                        + '</div>'
                        + (inscriptionsRows || '<p style="color:#64748b; font-size:12px; text-align:center; padding:8px 0;">Aucune inscription pour l\'instant.</p>')
                        + '</div>';

                    // Trier les équipes
                    var equipesTriees = [];
                    snapEquipes.forEach(function(child) { equipesTriees.push({ key: child.key, val: child.val() }); });
                    equipesTriees.sort(function(a, b) {
                        return (a.val.nom || '').localeCompare(b.val.nom || '', 'fr', { numeric: true });
                    });

                    // Stats globales
                    var totalJoueurs = 0;
                    var totalRencontres = 0;
                    equipesTriees.forEach(function(item) {
                        totalJoueurs += Object.keys(item.val.joueurs || {}).length;
                        totalRencontres += Object.keys(item.val.rencontres || {}).length;
                    });

                    // Barre d'outils + stats
                    var statsHtml = '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px; padding:14px 18px; background:#1e293b; border-radius:12px; border:1px solid #334155;">'
                        + '<div style="display:flex; gap:20px; flex-wrap:wrap;">'
                        + '<span style="color:#e2e8f0; font-size:13px;"><i class="fas fa-shield-alt" style="color:#e11d48; margin-right:6px;"></i><strong>' + equipesTriees.length + '</strong> équipe' + (equipesTriees.length > 1 ? 's' : '') + '</span>'
                        + '<span style="color:#e2e8f0; font-size:13px;"><i class="fas fa-users" style="color:#00d2ff; margin-right:6px;"></i><strong>' + totalJoueurs + '</strong> joueur' + (totalJoueurs > 1 ? 's' : '') + ' assigné' + (totalJoueurs > 1 ? 's' : '') + '</span>'
                        + '<span style="color:#e2e8f0; font-size:13px;"><i class="fas fa-calendar-alt" style="color:#f59e0b; margin-right:6px;"></i><strong>' + totalRencontres + '</strong> rencontre' + (totalRencontres > 1 ? 's' : '') + ' au total</span>'
                        + '</div>'
                        + '<button onclick="openEquipeForm(\'' + champId + '\',null)" style="background:linear-gradient(135deg,#e11d48,#9f1239); color:white; border:none; padding:9px 20px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px; white-space:nowrap;">'
                        + '<i class="fas fa-plus" style="margin-right:6px;"></i>Ajouter une équipe</button>'
                        + '</div>';

                    if (!equipesTriees.length) {
                        container.innerHTML = statsHtml + '<p style="color:#64748b; text-align:center; padding:30px;">Aucune équipe pour ce championnat.<br><small>Cliquez sur "Ajouter une équipe" ou recréez le championnat avec un nombre d\'équipes défini.</small></p>'
                            + inscriptionsHtml;

                        window._membersCache = members;
                        return;
                    }

                    // Kanban : grille horizontale
                    var kanban = '<div style="display:grid; grid-template-columns: repeat(' + equipesTriees.length + ', minmax(260px, 320px)); gap:14px; overflow-x:auto; padding-bottom:10px;">';

                    equipesTriees.forEach(function(item, idx) {
                        var eq = item.val; var eqId = item.key;
                        var color = _EQUIPE_COLORS[idx % _EQUIPE_COLORS.length];
                        var joueurs = eq.joueurs || {};
                        var nbJoueurs = Object.keys(joueurs).length;

                        // Joueurs triés par nom
                        var joueursList = Object.keys(joueurs).map(function(uid) {
                            var m = members[uid] || {};
                            return { uid: uid, prenom: m.prenom || '', nom: m.nom || '', classement: m.classement || '' };
                        }).sort(function(a,b) { return a.nom.localeCompare(b.nom, 'fr'); });

                        var joueursHtml = joueursList.length
                            ? joueursList.map(function(j) {
                                return '<div style="display:flex; align-items:center; justify-content:space-between; padding:7px 10px; background:#0f172a; border-radius:6px;">'
                                    + '<span style="color:#e2e8f0; font-size:12px;">' + escHtml(j.prenom) + ' ' + escHtml(j.nom) + '</span>'
                                    + (j.classement ? '<span style="background:' + color + '22; color:' + color + '; border:1px solid ' + color + '44; border-radius:10px; padding:1px 8px; font-size:10px;">' + escHtml(j.classement) + '</span>' : '')
                                    + '</div>';
                              }).join('')
                            : '<p style="color:#64748b; font-size:11px; text-align:center; padding:10px 0; margin:0;">Aucun joueur assigné</p>';

                        // Rencontres de cette équipe (depuis eq.rencontres)
                        var convocations = eq.convocations || {};
                        var eqRencontres = eq.rencontres || {};
                        var eqRencontreIds = Object.keys(eqRencontres).sort(function(a, b) {
                            return (eqRencontres[a].date || '').localeCompare(eqRencontres[b].date || '');
                        });

                        var rencontresHtml = eqRencontreIds.length
                            ? eqRencontreIds.map(function(rid) {
                                var r = eqRencontres[rid];
                                var conv = convocations[rid];
                                var isValidee = conv && conv.validee;
                                var convPositions = (conv && conv.positions) || {};
                                var nbConvoques = Object.keys(convPositions).length;

                                // Construire les chips joueurs : simples individuels, doubles regroupés par paire
                                var isBrouillon = conv && !conv.validee && nbConvoques > 0;
                                var joueursConvoquesHtml = '';
                                if (nbConvoques > 0) {
                                    var chips = [];

                                    // Numéros de simples et doubles présents (dynamique, quel que soit le format)
                                    var simplesNums = []; var doublesNums = [];
                                    Object.keys(convPositions).forEach(function(pos) {
                                        var ms = pos.match(/^simple(\d+)$/);
                                        var md = pos.match(/^double(\d+)_[AB]$/);
                                        if (ms && simplesNums.indexOf(ms[1]) === -1) simplesNums.push(ms[1]);
                                        if (md && doublesNums.indexOf(md[1]) === -1) doublesNums.push(md[1]);
                                    });
                                    simplesNums.sort(); doublesNums.sort();

                                    simplesNums.forEach(function(n) {
                                        var m = members[convPositions['simple' + n]] || {};
                                        chips.push({ label: 'S' + n, noms: [m.prenom || m.nom || '?'], isDouble: false });
                                    });
                                    doublesNums.forEach(function(n) {
                                        var uidA = convPositions['double' + n + '_A']; var uidB = convPositions['double' + n + '_B'];
                                        var noms = [];
                                        if (uidA) { var mA = members[uidA] || {}; noms.push(mA.prenom || mA.nom || '?'); }
                                        if (uidB) { var mB = members[uidB] || {}; noms.push(mB.prenom || mB.nom || '?'); }
                                        chips.push({ label: 'D' + n, noms: noms, isDouble: true });
                                    });

                                    if (chips.length) {
                                        // Couleurs selon état : vert si validé, orange si brouillon
                                        var chipBase = isValidee ? { s:'#22c55e', d:'#60a5fa' } : { s:'#f59e0b', d:'#f59e0b' };
                                        joueursConvoquesHtml = '<div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:5px;">';
                                        chips.forEach(function(chip) {
                                            var col = chip.isDouble ? chipBase.d : chipBase.s;
                                            joueursConvoquesHtml += '<span style="background:' + col + '18; color:' + col + '; border:1px solid ' + col + '33; border-radius:10px; padding:1px 6px; font-size:9px; white-space:nowrap;">'
                                                + escHtml(chip.label) + ' · ' + escHtml(chip.noms.join(' / ')) + '</span>';
                                        });
                                        joueursConvoquesHtml += '</div>';
                                    }
                                }

                                // Synthèse des disponibilités des joueurs de l'équipe pour cette rencontre (avec prénoms)
                                var dispoSummaryHtml = '';
                                if (nbJoueurs > 0 && !isValidee) {
                                    var dKey = eqId + '_' + rid;
                                    var nomsDispo = [], nomsIndispo = [], nomsSansRep = [];
                                    Object.keys(joueurs).forEach(function(jUid) {
                                        var insJ = inscritsChamp[jUid];
                                        var dv = insJ && insJ.disponibilites && insJ.disponibilites[dKey];
                                        var mJ = members[jUid] || {};
                                        var pnom = mJ.prenom || mJ.nom || '?';
                                        if (dv === true) nomsDispo.push(pnom);
                                        else if (dv === false) nomsIndispo.push(pnom);
                                        else nomsSansRep.push(pnom);
                                    });
                                    // Liste compacte : 3 prénoms max puis « +n »
                                    var _liste = function(noms) {
                                        if (!noms.length) return '';
                                        var aff = noms.slice(0, 3).join(', ');
                                        if (noms.length > 3) aff += ' +' + (noms.length - 3);
                                        return ' (' + escHtml(aff) + ')';
                                    };
                                    dispoSummaryHtml = '<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px; font-size:9px;">'
                                        + '<span style="color:#22c55e;" title="' + escHtml(nomsDispo.join(', ')) + '"><i class="fas fa-check"></i> ' + nomsDispo.length + ' dispo' + (nomsDispo.length > 1 ? 's' : '') + _liste(nomsDispo) + '</span>'
                                        + '<span style="color:#ef4444;" title="' + escHtml(nomsIndispo.join(', ')) + '"><i class="fas fa-times"></i> ' + nomsIndispo.length + _liste(nomsIndispo) + '</span>'
                                        + '<span style="color:#64748b;" title="' + escHtml(nomsSansRep.join(', ')) + '"><i class="fas fa-question"></i> ' + nomsSansRep.length + ' sans réponse' + _liste(nomsSansRep) + '</span>'
                                        + '</div>';
                                }

                                // Suivi des réponses à la convocation (après validation)
                                var reponsesHtml = '';
                                if (isValidee) {
                                    var reponses = (conv && conv.reponses) || {};
                                    var convoquesUids = [];
                                    Object.values(convPositions).forEach(function(cUid) {
                                        if (cUid && convoquesUids.indexOf(cUid) === -1) convoquesUids.push(cUid);
                                    });
                                    var confNoms = [], declNoms = [], sansRepNoms = [];
                                    convoquesUids.forEach(function(cUid) {
                                        var rep = reponses[cUid];
                                        var cm = members[cUid] || {};
                                        var pnom = cm.prenom || cm.nom || '?';
                                        if (rep && rep.statut === 'confirme') confNoms.push(pnom);
                                        else if (rep && rep.statut === 'decline') declNoms.push(pnom);
                                        else sansRepNoms.push(pnom);
                                    });
                                    var nbConf = confNoms.length;
                                    reponsesHtml = '<div style="margin-top:5px; font-size:9px;">'
                                        + '<span style="color:' + (nbConf === convoquesUids.length ? '#22c55e' : '#94a3b8') + ';" title="' + escHtml(confNoms.join(', ')) + '"><i class="fas fa-user-check"></i> ' + nbConf + '/' + convoquesUids.length + ' confirmé' + (nbConf > 1 ? 's' : '') + (confNoms.length ? ' : ' + escHtml(confNoms.join(', ')) : '') + '</span>'
                                        + (declNoms.length ? '<div style="color:#ef4444; margin-top:2px;"><i class="fas fa-user-times"></i> Désistement : ' + escHtml(declNoms.join(', ')) + '</div>' : '')
                                        + (sansRepNoms.length ? '<div style="color:#64748b; margin-top:2px;"><i class="fas fa-hourglass-half"></i> Sans réponse : ' + escHtml(sansRepNoms.join(', ')) + '</div>' : '')
                                        + '</div>';
                                }

                                var statusBadge = isValidee
                                    ? '<span style="background:#22c55e22; color:#22c55e; border:1px solid #22c55e44; border-radius:10px; padding:2px 7px; font-size:10px; white-space:nowrap;"><i class="fas fa-check-circle" style="margin-right:3px;"></i>Validée</span>'
                                    : isBrouillon
                                        ? '<span style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; border-radius:10px; padding:2px 7px; font-size:10px; white-space:nowrap;"><i class="fas fa-pencil-alt" style="margin-right:3px;"></i>Brouillon</span>'
                                        : '<span style="background:#47556922; color:#64748b; border:1px solid #47556944; border-radius:10px; padding:2px 7px; font-size:10px; white-space:nowrap;"><i class="far fa-circle" style="margin-right:3px;"></i>À faire</span>';

                                var borderLeft = isValidee ? (typeof reponsesHtml === 'string' && reponsesHtml.indexOf('Désistement') !== -1 ? '3px solid #ef4444' : '3px solid #22c55e') : isBrouillon ? '3px solid #f59e0b' : '3px solid #334155';
                                return '<div style="padding:8px 10px; background:#0f172a; border-radius:6px; border-left:' + borderLeft + ';">'
                                    + '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:6px;">'
                                    + '<div style="font-size:11px; color:#94a3b8; flex:1; min-width:0;">'
                                    + (r.domicile ? '🏠 ' : '🚌 ') + '<strong style="color:#e2e8f0;">' + escHtml(r.date) + '</strong>'
                                    + (r.heure ? ' ' + escHtml(r.heure) : '')
                                    + (r.adversaire ? '<br><span style="color:#64748b; font-size:10px;">vs ' + escHtml(r.adversaire) + '</span>' : '')
                                    + joueursConvoquesHtml
                                    + dispoSummaryHtml
                                    + reponsesHtml
                                    + '</div>'
                                    + '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">'
                                    + statusBadge
                                    + '<button onclick="openConvocationModal(\'' + eqId + '\',\'' + rid + '\',\'' + champId + '\')" style="background:' + color + '22; color:' + color + '; border:1px solid ' + color + '44; padding:3px 8px; border-radius:5px; cursor:pointer; font-size:10px; white-space:nowrap;">'
                                    + '<i class="fas fa-clipboard-list" style="margin-right:3px;"></i>' + (isValidee ? 'Modifier' : isBrouillon ? 'Modifier' : 'Composer') + '</button>'
                                    + '</div></div></div>';
                              }).join('')
                            : '<p style="color:#64748b; font-size:11px; text-align:center; padding:8px 0; margin:0;">Aucune rencontre — importez le fichier FFT</p>';

                        kanban += '<div style="background:#1e293b; border:1px solid ' + color + '44; border-top:3px solid ' + color + '; border-radius:12px; display:flex; flex-direction:column; overflow:hidden;">'
                            // En-tête équipe
                            + '<div style="padding:14px 14px 10px; border-bottom:1px solid #334155;">'
                            + '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">'
                            + '<div style="font-weight:bold; color:' + color + '; font-size:14px;">' + escHtml(eq.nom) + '</div>'
                            + '<div style="display:flex; gap:6px;">'
                            + '<button onclick="window.ouvrirChatAdmin(\'' + eqId + '\',\'' + escHtml(eq.nom || 'Équipe').replace(/'/g, '\\\'') + '\')" title="Discussion d\'équipe" style="background:#0f172a; color:#00d2ff; border:1px solid #00d2ff44; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;"><i class="fas fa-comments"></i></button>'
                            + '<button onclick="window.openEditEquipeModal(\'' + eqId + '\',\'' + champId + '\')" title="Modifier" style="background:#0f172a; color:#94a3b8; border:1px solid #33415544; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;"><i class="fas fa-pen"></i></button>'
                            + '<button onclick="deleteEquipeAdmin(\'' + eqId + '\')" title="Supprimer" style="background:#0f172a; color:#ef4444; border:1px solid #ef444444; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;"><i class="fas fa-trash"></i></button>'
                            + '</div></div>'
                            + (eq.niveau ? '<div style="font-size:11px; color:#64748b;">' + escHtml(eq.niveau) + '</div>' : '')
                            + '<div style="font-size:11px; color:#94a3b8; margin-top:4px;"><i class="fas fa-users" style="margin-right:4px;"></i>' + nbJoueurs + ' joueur' + (nbJoueurs > 1 ? 's' : '') + ' · ' + eqRencontreIds.length + ' rencontre' + (eqRencontreIds.length > 1 ? 's' : '') + '</div>'
                            + ((eq.classement_min || eq.classement_max) ? '<div style="font-size:11px; color:#c9a227; margin-top:3px;"><i class="fas fa-trophy" style="margin-right:4px;"></i>' + escHtml(eq.classement_min || '…') + ' → ' + escHtml(eq.classement_max || '…') + '</div>' : '')
                            + '</div>'
                            // Section joueurs
                            + '<div style="padding:10px 14px; border-bottom:1px solid #334155; flex:1;">'
                            + '<div style="font-size:11px; color:#94a3b8; font-weight:bold; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Joueurs</div>'
                            + '<div style="display:grid; gap:5px; margin-bottom:10px;">' + joueursHtml + '</div>'
                            + '<button onclick="openJoueursEquipeModal(\'' + eqId + '\',\'' + champId + '\')" style="width:100%; background:#0f172a; color:' + color + '; border:1px solid ' + color + '44; padding:7px; border-radius:7px; cursor:pointer; font-size:11px; font-weight:bold;">'
                            + '<i class="fas fa-user-plus" style="margin-right:5px;"></i>Gérer les joueurs</button>'
                            + '</div>'
                            // Section rencontres
                            + '<div style="padding:10px 14px;">'
                            + '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">'
                            + '<span style="font-size:11px; color:#94a3b8; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">Rencontres</span>'
                            + '<button onclick="openRencontresModal(\'' + eqId + '\')" style="background:' + color + '22; color:' + color + '; border:1px solid ' + color + '44; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:10px; font-weight:bold;">'
                            + '<i class="fas fa-calendar-alt" style="margin-right:4px;"></i>Calendrier</button>'
                            + '</div>'
                            + '<div style="display:grid; gap:5px;">' + rencontresHtml + '</div>'
                            + '</div>'
                            + '</div>';
                    });

                    kanban += '</div>';
                    container.innerHTML = statsHtml + kanban + inscriptionsHtml;
                    window._membersCache = members;
    }).catch(function(err) {
        if (container) container.innerHTML = '<p style="color:#ef4444; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Erreur de chargement : ' + escHtml(err.message || String(err)) + '</p>';
    });
};

window.openEquipeForm = async function(champId, equipeId) {
    var nom = window.prompt('Nom de l\'équipe :', '');
    if (nom === null || !nom.trim()) return;
    var niveau = window.prompt('Niveau (optionnel, ex: National, Régional) :', '');
    var data = { champId: champId, nom: nom.trim(), niveau: (niveau || '').trim(), createdAt: Date.now() };
    var ref = equipeId ? db_ref.ref('equipes/' + equipeId) : db_ref.ref('equipes').push();
    ref.set(data).then(function() {
        window.showNotification && window.showNotification('Équipe enregistrée !', 'success');
        window.loadEquipesAdmin(champId);
    });
};

window.openEditEquipeModal = function(equipeId, champId) {
    db_ref.ref('equipes/' + equipeId).once('value', function(snap) {
        var eq = snap.val() || {};
        document.getElementById('edit-equipe-id').value = equipeId;
        document.getElementById('edit-equipe-champ-id').value = champId;
        document.getElementById('edit-equipe-nom').value = eq.nom || '';
        var optsMin = '<option value="">De (meilleur)</option>' + _CLASSEMENTS_FFT.map(function(c) {
            return '<option value="' + c + '"' + (c === eq.classement_min ? ' selected' : '') + '>' + c + '</option>';
        }).join('');
        var optsMax = '<option value="">À (moins bon)</option>' + _CLASSEMENTS_FFT.map(function(c) {
            return '<option value="' + c + '"' + (c === eq.classement_max ? ' selected' : '') + '>' + c + '</option>';
        }).join('');
        document.getElementById('edit-equipe-cmin').innerHTML = optsMin;
        document.getElementById('edit-equipe-cmax').innerHTML = optsMax;
        document.getElementById('modal-edit-equipe').style.display = 'flex';
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur chargement équipe : ' + (err.message || err), 'error');
    });
};

window.saveEditEquipe = function() {
    var equipeId = document.getElementById('edit-equipe-id').value;
    var champId = document.getElementById('edit-equipe-champ-id').value;
    var nom = (document.getElementById('edit-equipe-nom').value || '').trim();
    var cmin = document.getElementById('edit-equipe-cmin').value;
    var cmax = document.getElementById('edit-equipe-cmax').value;
    if (!nom) { window.showNotification && window.showNotification('Le nom de l\'équipe est requis.', 'error'); return; }
    db_ref.ref('equipes/' + equipeId).update({ nom: nom, classement_min: cmin, classement_max: cmax }).then(function() {
        window.showNotification && window.showNotification('Équipe mise à jour.', 'success');
        document.getElementById('modal-edit-equipe').style.display = 'none';
        window.loadEquipesAdmin(champId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur mise à jour équipe : ' + (err.message || err), 'error');
    });
};

window.deleteEquipeAdmin = async function(equipeId) {
    var ok = await window.confirmDialog.show({ title: 'Supprimer l\'équipe', message: 'Supprimer cette équipe, ses convocations et sa discussion ?', type: 'danger', confirmText: 'Supprimer', cancelText: 'Annuler' });
    if (!ok) return;
    var champIdToRefresh = null;
    try {
        var snapDel = await db_ref.ref('equipes/' + equipeId + '/champId').once('value');
        champIdToRefresh = snapDel.val();
    } catch(_) {}
    db_ref.ref('equipes/' + equipeId).remove().then(function() {
        db_ref.ref('chats_equipe/' + equipeId).remove();
        window.showNotification && window.showNotification('Équipe supprimée.', 'success');
        if (champIdToRefresh) window.loadEquipesAdmin(champIdToRefresh);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur suppression équipe : ' + (err.message || err), 'error');
    });
};

// Données en cache pour le modal joueurs (pour le toggle sans re-fetch)
var _joueursModalData = { tous: [], inscrits: {}, joueurActuels: {}, showAll: false };

function _renderJoueursListe(showAll) {
    _joueursModalData.showAll = showAll;
    var listeEl = document.getElementById('modal-joueurs-liste');
    var toggleBtn = document.getElementById('joueurs-toggle-btn');
    var tous = _joueursModalData.tous;
    var inscrits = _joueursModalData.inscrits; // uid → { valide, prenom, nom, classement, ... }
    var joueurActuels = _joueursModalData.joueurActuels;

    var inscritsUids = Object.keys(inscrits);
    var membresInscrits = tous.filter(function(m) { return inscrits[m.uid]; });
    var membresNonInscrits = tous.filter(function(m) { return !inscrits[m.uid]; });

    // Mettre à jour le bouton toggle
    if (toggleBtn) {
        if (showAll) {
            toggleBtn.innerHTML = '<i class="fas fa-filter" style="margin-right:5px;"></i>Voir seulement les inscrits (' + inscritsUids.length + ')';
            toggleBtn.style.background = 'rgba(34,197,94,0.15)';
            toggleBtn.style.color = '#22c55e';
            toggleBtn.style.borderColor = 'rgba(34,197,94,0.4)';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-users" style="margin-right:5px;"></i>Voir tous les membres (' + tous.length + ')';
            toggleBtn.style.background = 'rgba(0,210,255,0.1)';
            toggleBtn.style.color = '#00d2ff';
            toggleBtn.style.borderColor = 'rgba(0,210,255,0.3)';
        }
        toggleBtn.onclick = function() { _renderJoueursListe(!showAll); };
    }

    var listeAAfficher = showAll ? membresInscrits.concat(membresNonInscrits) : membresInscrits;

    if (!listeAAfficher.length) {
        listeEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;">'
            + (showAll ? 'Aucun membre actif.' : 'Aucun membre inscrit à ce championnat.<br><small style="color:#475569;">Utilisez le bouton ci-dessus pour voir tous les membres.</small>')
            + '</p>';
        return;
    }

    var html = '';
    if (!showAll && membresNonInscrits.length > 0) {
        html += '<p style="color:#94a3b8; font-size:11px; margin-bottom:6px; padding:8px 10px; background:#0f172a; border-radius:6px;">'
            + '<i class="fas fa-info-circle" style="color:#00d2ff; margin-right:4px;"></i>'
            + membresNonInscrits.length + ' autre' + (membresNonInscrits.length > 1 ? 's membres' : ' membre') + ' actif' + (membresNonInscrits.length > 1 ? 's' : '') + ' non inscrit' + (membresNonInscrits.length > 1 ? 's' : '')
            + ' — utilisez le bouton ci-dessus pour les afficher.</p>';
    }

    listeAAfficher.forEach(function(m, idx) {
        var checked = joueurActuels[m.uid] ? 'checked' : '';
        var estInscrit = !!inscrits[m.uid];
        var estValide = estInscrit && inscrits[m.uid].valide;

        // Séparateur si mode "tous" et passage aux non-inscrits
        if (showAll && idx === membresInscrits.length && membresNonInscrits.length > 0) {
            html += '<div style="padding:6px 0; display:flex; align-items:center; gap:8px;">'
                + '<div style="flex:1; height:1px; background:#334155;"></div>'
                + '<span style="color:#475569; font-size:10px; white-space:nowrap; text-transform:uppercase; letter-spacing:0.5px;">Autres membres actifs</span>'
                + '<div style="flex:1; height:1px; background:#334155;"></div></div>';
        }

        // Badge statut inscription (cocher un membre « En attente » validera automatiquement son inscription)
        var statutHtml = '';
        if (estInscrit) {
            if (estValide) {
                statutHtml = '<span style="background:#22c55e22; color:#22c55e; border:1px solid #22c55e44; border-radius:10px; padding:1px 7px; font-size:10px; margin-left:6px;"><i class="fas fa-check-circle" style="margin-right:2px;"></i>Inscrit · validé</span>';
            } else {
                statutHtml = '<span style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; border-radius:10px; padding:1px 7px; font-size:10px; margin-left:6px;" title="Sera validé automatiquement à l\'enregistrement si coché"><i class="fas fa-clock" style="margin-right:2px;"></i>En attente</span>';
            }
        } else {
            statutHtml = '<span style="background:#47556922; color:#64748b; border:1px solid #47556944; border-radius:10px; padding:1px 7px; font-size:10px; margin-left:6px;">Non inscrit</span>';
        }

        var disabledAttr = estInscrit ? '' : 'disabled';
        var cursorStyle = estInscrit ? 'pointer' : 'not-allowed';
        var opacity = estInscrit ? '1' : '0.6';
        var titleAttr = estInscrit ? '' : ' title="Le membre doit d\'abord s\'inscrire au championnat depuis son espace"';
        html += '<label' + titleAttr + ' style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:' + (estInscrit ? '#1e293b' : '#0f172a') + '; border-radius:8px; cursor:' + cursorStyle + '; border:1px solid ' + (estValide ? '#22c55e33' : estInscrit ? '#f59e0b33' : '#1e293b') + '; opacity:' + opacity + ';">'
            + '<input type="checkbox" value="' + m.uid + '" ' + checked + ' ' + disabledAttr + ' style="width:18px; height:18px; accent-color:#e11d48; flex-shrink:0;">'
            + '<div style="flex:1; min-width:0;">'
            + '<div style="color:' + (estInscrit ? '#e2e8f0' : '#94a3b8') + '; font-size:13px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">'
            + escHtml(m.prenom) + ' ' + escHtml(m.nom) + statutHtml
            + '</div>'
            + '<div style="color:#64748b; font-size:11px; margin-top:2px;">' + escHtml(m.classement || '—') + '</div>'
            + '</div></label>';
    });
    listeEl.innerHTML = html;
}

// Helper : crée une notification in-app pour un membre (non bloquant)
function _notifierMembre(uid, champId, type, message) {
    return db_ref.ref('notifications_equipe').push({
        uid: uid, champId: champId || null, type: type, message: message,
        lue: false, createdAt: Date.now()
    }).catch(function(err) { console.warn('Notif in-app non envoyée :', err); });
}

// Helper : envoie une push Web ciblée à un membre (non bloquant)
function _pushMembre(uid, title, body, url) {
    try {
        var sendPush = firebase.functions().httpsCallable('sendMemberPush');
        sendPush({ uid: uid, title: title, body: body, url: url || 'https://tennismontargis.fr/espace-membre.html' })
            .then(function(res) {
                if (res.data && res.data.sent > 0) console.log('[push] envoyé à', uid, ':', res.data.sent, 'appareil(s)');
            })
            .catch(function(err) { console.warn('[push] échec pour', uid, ':', err.message || err); });
    } catch(e) { console.warn('[push] firebase.functions indisponible :', e); }
}

// Helper : notif in-app + push Web (non bloquant)
function _notifierEtPusher(uid, champId, type, message, pushTitle) {
    _notifierMembre(uid, champId, type, message);
    _pushMembre(uid, pushTitle || 'USM Tennis Montargis', message);
}

// Helper : récupère le nom du championnat (ou renvoie '' en cas d'erreur)
function _getChampNom(champId) {
    return db_ref.ref('championnats_equipe/' + champId + '/nom').once('value')
        .then(function(s) { return s.val() || ''; })
        .catch(function() { return ''; });
}

window.openJoueursEquipeModal = function(equipeId, champId) {
    document.getElementById('modal-joueurs-equipe-id').value = equipeId;
    document.getElementById('modal-joueurs-champ-id').value = champId;
    var listeEl = document.getElementById('modal-joueurs-liste');
    listeEl.innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></p>';
    document.getElementById('modal-joueurs-equipe').style.display = '';

    Promise.all([
        db_ref.ref('equipes/' + equipeId).once('value'),
        db_ref.ref('inscriptions_equipe/' + champId).once('value'),
        db_ref.ref('members').once('value')
    ]).then(function(snapsJ) {
        var joueurActuels = (snapsJ[0].val() && snapsJ[0].val().joueurs) || {};
        var inscrits = {};
        snapsJ[1].forEach(function(child) { inscrits[child.key] = child.val(); });
        var tous = [];
        snapsJ[2].forEach(function(child) {
            var m = child.val();
            if (m && m.actif && m.prenom && m.nom) {
                tous.push({ uid: child.key, prenom: m.prenom, nom: m.nom, classement: m.classement || '' });
            }
        });
        tous.sort(function(a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
        _joueursModalData = { tous: tous, inscrits: inscrits, joueurActuels: joueurActuels, showAll: false };
        _renderJoueursListe(false);
    }).catch(function(err) {
        document.getElementById('modal-joueurs-liste').innerHTML = '<p style="color:#ef4444; font-size:13px; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Erreur chargement : ' + escHtml(err.message || String(err)) + '</p>';
    });
};

window.saveJoueursEquipe = function() {
    var equipeId = document.getElementById('modal-joueurs-equipe-id').value;
    var champId = document.getElementById('modal-joueurs-champ-id').value;
    var checkboxes = document.querySelectorAll('#modal-joueurs-liste input[type=checkbox]');
    var joueurs = {};
    var inscrits = _joueursModalData.inscrits || {};
    checkboxes.forEach(function(cb) {
        if (cb.checked && !cb.disabled) joueurs[cb.value] = true;
    });

    var anciensJoueurs = _joueursModalData.joueurActuels || {};
    var nouveaux = Object.keys(joueurs).filter(function(uid) { return !anciensJoueurs[uid]; });
    // Cocher un joueur « En attente » vaut validation de son inscription
    var aValider = Object.keys(joueurs).filter(function(uid) {
        var i = inscrits[uid]; return i && !i.valide;
    });

    db_ref.ref('equipes/' + equipeId + '/joueurs').set(joueurs).then(function() {
        aValider.forEach(function(uid) {
            db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).update({
                valide: true, statut: 'validee', validatedAt: Date.now(),
                motifRefus: null, refusedAt: null
            });
        });
        if (nouveaux.length) {
            Promise.all([
                _getChampNom(champId),
                db_ref.ref('equipes/' + equipeId + '/nom').once('value').then(function(s) { return s.val() || 'votre équipe'; })
            ]).then(function(res) {
                var champNom = res[0]; var eqNom = res[1];
                var msg = 'Le coach vous a placé(e) dans l\'équipe « ' + eqNom + ' »' + (champNom ? ' (' + champNom + ')' : '') + '. Renseignez vos disponibilités dans l\'onglet Équipes de votre espace membre.';
                nouveaux.forEach(function(uid) {
                    _notifierEtPusher(uid, champId, 'equipe_assignee', msg, '🎾 ' + eqNom + ' — vous êtes dans l\'équipe !');
                });
            });
        }
        window.showNotification && window.showNotification(
            'Composition enregistrée' + (aValider.length ? ' (' + aValider.length + ' inscription(s) validée(s))' : '') + (nouveaux.length ? ' — ' + nouveaux.length + ' joueur(s) notifié(s)' : '') + '.',
            'success'
        );
        document.getElementById('modal-joueurs-equipe').style.display = 'none';
        window.loadEquipesAdmin(champId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur enregistrement joueurs : ' + (err.message || err), 'error');
    });
};

// --- Convocations ---
window.openConvocationModal = function(equipeId, rencontreId, champId) {
    document.getElementById('modal-convocation-equipe-id').value = equipeId;
    document.getElementById('modal-convocation-rencontre-id').value = rencontreId;
    document.getElementById('modal-convocation-champ-id').value = champId;
    document.getElementById('modal-convocation-positions').innerHTML = '<p style="color:#64748b; font-size:13px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    document.getElementById('modal-convocation').style.display = '';

    // Lecture parallèle de toutes les données nécessaires
    Promise.all([
        db_ref.ref('championnats_equipe/' + champId).once('value'),
        db_ref.ref('equipes/' + equipeId).once('value'),
        db_ref.ref('equipes/' + equipeId + '/rencontres/' + rencontreId).once('value'),
        db_ref.ref('equipes/' + equipeId + '/convocations/' + rencontreId).once('value'),
        db_ref.ref('inscriptions_equipe/' + champId).once('value')
    ]).then(function(snaps) {
        var champ   = snaps[0].val() || {};
        var eq      = snaps[1].val() || {};

        var r       = snaps[2].val() || {};
        var conv    = snaps[3].val() || {};
        var positions = conv.positions || {};
        var inscrits = {};
        snaps[4].forEach(function(i) { inscrits[i.key] = i.val(); });

        var joueurs = eq.joueurs || {};
        var joueurUids = Object.keys(joueurs);

        if (!joueurUids.length) {
            document.getElementById('modal-convocation-positions').innerHTML =
                '<p style="color:#f59e0b; font-size:13px; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Aucun joueur assigné à cette équipe. Utilisez "Gérer les joueurs" d\'abord.</p>';
            var infoR0 = (r.date || '?') + (r.heure ? ' à ' + r.heure : '') + (r.adversaire ? ' — vs ' + r.adversaire : '') + (r.domicile ? ' 🏠' : ' 🚌');
            document.getElementById('modal-convocation-info').textContent = (eq.nom || '') + ' | ' + infoR0;
            return;
        }

        // Lire les données membres directement depuis Firebase pour les joueurs de l'équipe
        Promise.all(joueurUids.map(function(uid) {
            return db_ref.ref('members/' + uid).once('value').then(function(s) {
                return { uid: uid, data: s.val() || {} };
            });
        })).then(function(memberResults) {
            var membersMap = {};
            memberResults.forEach(function(mr) { membersMap[mr.uid] = mr.data; });

            var joueurOptions = '<option value="">— Non assigné —</option>'
                + joueurUids.map(function(uid) {
                    var m = membersMap[uid] || {};
                    var ins = inscrits[uid] || {};
                    var prenom = m.prenom || ins.prenom || '';
                    var nom = m.nom || ins.nom || '';
                    var classement = m.classement || ins.classement || '—';
                    // La dispo est stockée avec la clé composée equipeId_rencontreId
                    var dispoKey = equipeId + '_' + rencontreId;
                    var dispo = ins.disponibilites && ins.disponibilites[dispoKey];
                    var label = prenom + ' ' + nom + ' (' + classement + ')';
                    if (dispo === true) label += ' ✓ Dispo';
                    else if (dispo === false) label += ' ✗ Indispo';
                    // Réponse à la convocation déjà envoyée (le cas échéant)
                    var repConv = conv.reponses && conv.reponses[uid];
                    if (repConv && repConv.statut === 'confirme') label += ' · a confirmé';
                    else if (repConv && repConv.statut === 'decline') label += ' · s\'est désisté';
                    // Bloquer la sélection si indispo, sauf si déjà assigné (pour permettre de le retirer)
                    var isCurrentlyAssigned = Object.values(positions).indexOf(uid) !== -1;
                    var disabled = (dispo === false && !isCurrentlyAssigned) ? ' disabled' : '';
                    return '<option value="' + uid + '"' + disabled + '>' + escHtml(label.trim() || uid) + '</option>';
                }).join('');

            var infoR = (r.date || '?') + (r.heure ? ' à ' + r.heure : '') + (r.adversaire ? ' — vs ' + r.adversaire : '') + (r.domicile ? ' 🏠' : ' 🚌');
            document.getElementById('modal-convocation-info').textContent = (eq.nom || '') + ' | ' + infoR;

            var positionsHtml = '';
            var nbS = champ.nb_simples || 2; var nbD = champ.nb_doubles || 0;
            for (var i = 1; i <= nbS; i++) {
                var key = 'simple' + i; var cur = positions[key] || '';
                positionsHtml += _positionRow('Simple ' + i, key, joueurOptions, cur);
            }
            for (var d = 1; d <= nbD; d++) {
                ['A','B'].forEach(function(p) {
                    var key = 'double' + d + '_' + p; var cur = positions[key] || '';
                    positionsHtml += _positionRow('Double ' + d + ' — Joueur ' + p, key, joueurOptions, cur);
                });
            }
            document.getElementById('modal-convocation-positions').innerHTML = positionsHtml;
        }).catch(function(err) {
            document.getElementById('modal-convocation-positions').innerHTML = '<p style="color:#ef4444; font-size:13px; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Erreur chargement membres : ' + escHtml(err.message || String(err)) + '</p>';
        });
    }).catch(function(err) {
        document.getElementById('modal-convocation-positions').innerHTML = '<p style="color:#ef4444; font-size:13px; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Erreur chargement convocation : ' + escHtml(err.message || String(err)) + '</p>';
    });
};

// Libellé lisible d'une clé de poste (simple2 → « Simple 2 », double3_B → « Double 3 — Joueur B »)
function _posLabel(pos) {
    var m = String(pos).match(/^simple(\d+)$/);
    if (m) return 'Simple ' + m[1];
    m = String(pos).match(/^double(\d+)_([AB])$/);
    if (m) return 'Double ' + m[1] + ' — Joueur ' + m[2];
    return pos;
}

function _positionRow(label, key, options, selected) {
    return '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">'
        + '<label style="color:#e2e8f0; font-size:13px; min-width:160px;">' + escHtml(label) + '</label>'
        + '<select data-pos="' + key + '" style="flex:1; padding:10px; background:#1e293b; border:1px solid #475569; color:white; border-radius:8px; font-size:13px;">'
        + options.replace('value="' + selected + '"', 'value="' + selected + '" selected')
        + '</select></div>';
}

window.saveConvocation = function() {
    var equipeId = document.getElementById('modal-convocation-equipe-id').value;
    var rencontreId = document.getElementById('modal-convocation-rencontre-id').value;
    var champId = document.getElementById('modal-convocation-champ-id').value;
    var positions = {};
    document.querySelectorAll('#modal-convocation-positions select').forEach(function(sel) {
        if (sel.value) positions[sel.dataset.pos] = sel.value;
    });
    db_ref.ref('equipes/' + equipeId + '/convocations/' + rencontreId).set({
        positions: positions, validee: false, notifie: false, updatedAt: Date.now()
    }).then(function() {
        window.showNotification && window.showNotification('Brouillon enregistré.', 'success');
        document.getElementById('modal-convocation').style.display = 'none';
        if (champId) window.loadEquipesAdmin(champId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur enregistrement brouillon : ' + (err.message || err), 'error');
    });
};

window.reinitialiserConvocation = function() {
    document.querySelectorAll('#modal-convocation-positions select').forEach(function(sel) {
        sel.value = '';
    });
};

window.validerEtNotifierConvocation = function() {
    var equipeId = document.getElementById('modal-convocation-equipe-id').value;
    var rencontreId = document.getElementById('modal-convocation-rencontre-id').value;
    var champId = document.getElementById('modal-convocation-champ-id').value;
    var positions = {};
    document.querySelectorAll('#modal-convocation-positions select').forEach(function(sel) {
        if (sel.value) positions[sel.dataset.pos] = sel.value;
    });
    if (!Object.keys(positions).length) {
        window.showNotification && window.showNotification('Assignez au moins un joueur avant de valider.', 'error');
        return;
    }

    Promise.all([
        db_ref.ref('equipes/' + equipeId).once('value'),
        db_ref.ref('equipes/' + equipeId + '/rencontres/' + rencontreId).once('value')
    ]).then(function(snaps) {
        var eq = snaps[0].val() || {};
        var r  = snaps[1].val() || {};
        var dateLabel = (r.date || '?') + (r.heure ? ' à ' + r.heure : '') + (r.adversaire ? ' vs ' + r.adversaire : '');

        // 1. Sauvegarder la convocation (les réponses éventuelles repartent de zéro)
        return db_ref.ref('equipes/' + equipeId + '/convocations/' + rencontreId).set({
            positions: positions, validee: true, notifie: true, updatedAt: Date.now()
        }).then(function() {
            // 2. Notif in-app + push Web pour chaque joueur convoqué (non bloquant)
            Object.keys(positions).forEach(function(pos) {
                var uid = positions[pos]; if (!uid) return;
                var msg = 'Vous êtes convoqué(e) pour ' + (eq.nom || 'l\'équipe') + ' — ' + dateLabel + ' — Poste : ' + _posLabel(pos) + '. Confirmez votre présence dans votre espace membre.';
                _notifierEtPusher(uid, champId, 'convoque', msg, '🎾 Convocation ' + (eq.nom || 'équipe'));
            });
        });
    }).then(function() {
        window.showNotification && window.showNotification('Convocation validée et joueurs notifiés !', 'success');
        document.getElementById('modal-convocation').style.display = 'none';
        if (champId) window.loadEquipesAdmin(champId);
    }).catch(function(err) {
        console.error('Erreur validerEtNotifierConvocation :', err);
        window.showNotification && window.showNotification('Erreur lors de la validation : ' + (err.message || err), 'error');
    });
};

// --- Discussion d'équipe (vue coach) ---
var _chatAdminEquipeId = null;
var _chatAdminListenerRef = null;

function _renderChatMsgAdmin(msgId, m) {
    var isCoach = m.role === 'coach';
    var auteur = isCoach ? ('Coach' + ((m.prenom || m.nom) ? ' ' + ((m.prenom || '') + ' ' + (m.nom || '')).trim() : ''))
                         : (((m.prenom || '') + ' ' + (m.nom || '')).trim() || 'Membre');
    var heure = m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    var bulle = document.createElement('div');
    bulle.id = 'chat-admin-msg-' + msgId;
    bulle.style.cssText = 'max-width:80%; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.4; word-break:break-word; '
        + (isCoach ? 'align-self:flex-end; background:rgba(201,162,39,0.12); border:1px solid rgba(201,162,39,0.35); color:#e2e8f0; border-bottom-right-radius:4px;'
                   : 'align-self:flex-start; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-bottom-left-radius:4px;');
    bulle.innerHTML = '<div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">'
        + '<span style="font-size:10px; font-weight:bold; color:' + (isCoach ? '#c9a227' : '#94a3b8') + ';">'
        + (isCoach ? '<i class="fas fa-user-tie" style="margin-right:3px;"></i>' : '') + escHtml(auteur) + '</span>'
        + '<span style="font-size:9px; color:#475569;">' + heure + '</span>'
        + '<button onclick="window.supprimerMessageChatAdmin(\'' + msgId + '\')" title="Supprimer ce message" style="background:none; border:none; color:#475569; cursor:pointer; font-size:10px; padding:0 2px; margin-left:auto;"><i class="fas fa-trash"></i></button>'
        + '</div>'
        + '<div>' + escHtml(m.texte || '') + '</div>';
    return bulle;
}

window.ouvrirChatAdmin = function(equipeId, eqNom) {
    _chatAdminEquipeId = equipeId;
    document.getElementById('chat-admin-nom').textContent = 'Discussion — ' + eqNom;
    var box = document.getElementById('chat-admin-messages');
    box.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></p>';
    document.getElementById('modal-chat-admin').style.display = '';

    _chatAdminListenerRef = db_ref.ref('chats_equipe/' + equipeId).orderByChild('createdAt').limitToLast(100);
    var first = true;
    _chatAdminListenerRef.on('child_added', function(child) {
        if (first) { box.innerHTML = ''; first = false; }
        box.appendChild(_renderChatMsgAdmin(child.key, child.val() || {}));
        box.scrollTop = box.scrollHeight;
    });
    _chatAdminListenerRef.on('child_removed', function(child) {
        var el = document.getElementById('chat-admin-msg-' + child.key);
        if (el) el.remove();
    });
    setTimeout(function() {
        if (first && _chatAdminEquipeId === equipeId) {
            box.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center; margin:auto;">Aucun message pour l\'instant.</p>';
            first = false;
        }
    }, 1200);

    var input = document.getElementById('chat-admin-input');
    input.value = '';
    input.onkeydown = function(e) { if (e.key === 'Enter') window.envoyerMessageChatAdmin(); };
};

window.fermerChatAdmin = function() {
    document.getElementById('modal-chat-admin').style.display = 'none';
    if (_chatAdminListenerRef) { _chatAdminListenerRef.off(); _chatAdminListenerRef = null; }
    _chatAdminEquipeId = null;
};

window.envoyerMessageChatAdmin = function() {
    var input = document.getElementById('chat-admin-input');
    var texte = (input.value || '').trim();
    if (!texte || !_chatAdminEquipeId) return;
    var user = firebase.auth().currentUser;
    if (!user) return;
    input.value = '';
    // Récupérer prénom/nom de l'admin s'il a une fiche membre (sinon « Coach » seul)
    db_ref.ref('members/' + user.uid).once('value').then(function(s) {
        var me = s.val() || {};
        return db_ref.ref('chats_equipe/' + _chatAdminEquipeId).push({
            uid: user.uid,
            prenom: me.prenom || '',
            nom: me.nom || '',
            role: 'coach',
            texte: texte,
            createdAt: Date.now()
        });
    }).catch(function(err) {
        input.value = texte;
        window.showNotification && window.showNotification('Message non envoyé : ' + (err.message || err), 'error');
    });
};

window.supprimerMessageChatAdmin = function(msgId) {
    if (!_chatAdminEquipeId) return;
    db_ref.ref('chats_equipe/' + _chatAdminEquipeId + '/' + msgId).remove().catch(function(err) {
        window.showNotification && window.showNotification('Suppression impossible : ' + (err.message || err), 'error');
    });
};

// --- Import calendrier FFT (Excel) ---
window.importRencontresExcel = function() {
    var equipeId = document.getElementById('modal-rencontres-equipe-id').value;
    var fileInput = document.getElementById('import-excel-file');
    var statusEl = document.getElementById('import-excel-status');
    var file = fileInput.files[0];

    if (!equipeId) { window.showNotification && window.showNotification('Ouvrez d\'abord le calendrier d\'une équipe.', 'error'); return; }
    if (!file) { window.showNotification && window.showNotification('Sélectionnez un fichier Excel.', 'error'); return; }

    statusEl.style.display = 'block';
    statusEl.style.color = '#64748b';
    statusEl.textContent = 'Lecture du fichier...';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var workbook = XLSX.read(e.target.result, { type: 'array' });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 4 });

            var rencontres = [];
            for (var i = 1; i < rows.length; i++) {
                var row = rows[i];
                if (!row || !row[1]) continue;
                var dateRaw = String(row[1] || '').trim();
                var domCol = String(row[2] || '').trim();
                var extCol = String(row[3] || '').trim();
                if (!dateRaw.match(/^\d{2}\/\d{2}\/\d{4}$/)) continue;

                var domMontargis = domCol.toUpperCase().indexOf('MONTARGIS') !== -1;
                var extMontargis = extCol.toUpperCase().indexOf('MONTARGIS') !== -1;
                if (!domMontargis && !extMontargis) continue;

                var parts = dateRaw.split('/');
                var dateISO = parts[2] + '-' + parts[1] + '-' + parts[0];

                rencontres.push({
                    date: dateISO,
                    heure: '14:00',
                    domicile: domMontargis,
                    adversaire: domMontargis ? extCol : domCol,
                    lieu: domMontargis ? 'Courts USM Montargis' : '',
                    note: 'Journée ' + String(row[0] || '')
                });
            }

            if (!rencontres.length) {
                statusEl.style.color = '#f59e0b';
                statusEl.textContent = '⚠️ Aucune rencontre de Montargis trouvée dans ce fichier.';
                return;
            }

            statusEl.textContent = 'Enregistrement de ' + rencontres.length + ' rencontre(s)...';
            var promises = rencontres.map(function(r) {
                return db_ref.ref('equipes/' + equipeId + '/rencontres').push(r);
            });
            Promise.all(promises).then(function() {
                statusEl.style.color = '#22c55e';
                statusEl.textContent = '✅ ' + rencontres.length + ' rencontre(s) importée(s) avec succès !';
                fileInput.value = '';
                _loadRencontresModal(equipeId);
                if (_rencontresModalChampId) window.loadEquipesAdmin(_rencontresModalChampId);
                window.showNotification && window.showNotification(rencontres.length + ' rencontres importées !', 'success');
            }).catch(function(err) {
                statusEl.style.color = '#ef4444';
                statusEl.textContent = '❌ Erreur lors de l\'enregistrement.';
            });

        } catch(err) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = '❌ Erreur de lecture du fichier Excel.';
        }
    };
    reader.readAsArrayBuffer(file);
};

// --- Nettoyage des données orphelines ---
window.nettoyerDonneesOrphelines = async function() {
    var ok = await window.confirmDialog.show({
        title: 'Nettoyer les résidus',
        message: 'Cette opération supprime les assignations d\'équipes et convocations validées pour tout membre qui n\'est plus inscrit au championnat correspondant. Continuer ?',
        type: 'danger', confirmText: 'Nettoyer', cancelText: 'Annuler'
    });
    if (!ok) return;

    var snaps = await Promise.all([
        db_ref.ref('equipes').once('value'),
        db_ref.ref('inscriptions_equipe').once('value')
    ]);
    var snapEquipes = snaps[0]; var snapInscrits = snaps[1];

    // Map : champId → { uid: true }
    var inscrits = {};
    snapInscrits.forEach(function(champNode) {
        inscrits[champNode.key] = {};
        champNode.forEach(function(userNode) { inscrits[champNode.key][userNode.key] = true; });
    });

    var ops = []; var removed = 0;
    snapEquipes.forEach(function(eqSnap) {
        var eq = eqSnap.val(); var equipeId = eqSnap.key;
        var champId = eq.champId;
        var champInscrits = inscrits[champId] || {};

        // Retirer les joueurs non inscrits du roster
        Object.keys(eq.joueurs || {}).forEach(function(uid) {
            if (!champInscrits[uid]) {
                ops.push(db_ref.ref('equipes/' + equipeId + '/joueurs/' + uid).remove());
                removed++;
            }
        });

        // Invalider les convocations validées contenant des membres non inscrits
        Object.entries(eq.convocations || {}).forEach(function(entry) {
            var rid = entry[0]; var conv = entry[1];
            if (!conv || !conv.validee) return;
            var hasOrphan = Object.values(conv.positions || {}).some(function(uid) {
                return uid && !champInscrits[uid];
            });
            if (hasOrphan) {
                ops.push(db_ref.ref('equipes/' + equipeId + '/convocations/' + rid + '/validee').set(false));
                removed++;
            }
        });
    });

    if (!ops.length) {
        window.showNotification && window.showNotification('Aucun résidu trouvé — les données sont propres.', 'success');
        return;
    }
    try {
        await Promise.all(ops);
        window.showNotification && window.showNotification(removed + ' entrée(s) résiduelle(s) supprimée(s).', 'success');
    } catch(err) {
        window.showNotification && window.showNotification('Erreur nettoyage : ' + (err.message || err), 'error');
    }
};

// --- Classement FFT par équipe ---
var _CLASSEMENTS_FFT = ['-15','-4/6','-2/6','0','1/6','2/6','3/6','4/6','5/6','15','15/1','15/2','15/3','15/4','15/5','30','30/1','30/2','30/3','30/4','30/5','40','NC'];

function _classementOptionsHtml() {
    return _CLASSEMENTS_FFT.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
}

window.updateEquipesClassementRows = function(n) {
    n = parseInt(n) || 0;
    var container = document.getElementById('champ-equipes-classement');
    var rows = document.getElementById('champ-equipes-classement-rows');
    if (!container || !rows) return;
    if (n === 0) { container.style.display = 'none'; rows.innerHTML = ''; return; }
    container.style.display = 'block';
    var opts = _classementOptionsHtml();
    var html = '';
    for (var i = 1; i <= n; i++) {
        html += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">'
            + '<span style="color:#c9a227; font-size:12px; font-weight:bold; min-width:68px;">Équipe ' + i + '</span>'
            + '<select id="champ-eq-cmin-' + i + '" style="flex:1; padding:8px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px;">'
            + '<option value="">De (meilleur)</option>' + opts + '</select>'
            + '<span style="color:#64748b; font-size:11px;">→</span>'
            + '<select id="champ-eq-cmax-' + i + '" style="flex:1; padding:8px; background:#0f172a; border:1px solid #475569; color:white; border-radius:6px; font-size:12px;">'
            + '<option value="">À (moins bon)</option>' + opts + '</select>'
            + '</div>';
    }
    rows.innerHTML = html;
};

// --- Gestion des inscriptions (panneau admin par championnat) ---
window.toggleInscritsChamp = function(champId) {
    var panel = document.getElementById('inscrits-panel-' + champId);
    if (!panel) return;
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    _loadInscritsPanel(champId);
};

// Formate un timestamp d'inscription en « 22/07/2026 à 14:35 »
function _formatInscritAt(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Ligne HTML pour une inscription (réutilisée dans le panneau "Inscrits" et la liste en bas de l'onglet Équipes)
function _inscriptionRowHtml(champId, uid, data, m) {
    m = m || {};
    var nom = ((m.prenom || '') + ' ' + (m.nom || '')).trim() || uid;
    var valide = data && data.valide;
    var refuse = data && data.statut === 'refuse';
    var motif = data && data.motifRefus;
    var nbDispoRens = Object.keys((data && data.disponibilites) || {}).length;
    var quand = _formatInscritAt(data && data.createdAt);

    var borderColor = refuse ? '#ef4444' : valide ? '#22c55e' : '#f59e0b';
    var statutHtml;
    if (refuse) {
        statutHtml = '<span style="font-size:11px; color:#ef4444; white-space:nowrap;"><i class="fas fa-times-circle"></i> Refusée</span>';
    } else if (valide) {
        statutHtml = '<span style="font-size:11px; color:#22c55e; white-space:nowrap;"><i class="fas fa-check-circle"></i> Inscr. validée</span>';
    } else {
        statutHtml = '<span style="font-size:11px; color:#f59e0b; white-space:nowrap;"><i class="fas fa-clock"></i> En attente</span>';
    }

    // Carte à 2 lignes bien séparées (nom+date, puis statut/dispo/actions) : plus lisible
    // qu'un unique bloc flex à 3 éléments qui se chevauchaient de façon imprévisible.
    return '<div style="background:#0f172a; border-left:3px solid ' + borderColor + '; border-radius:6px; padding:9px 12px; margin-bottom:6px;">'
        + '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;">'
        + '<span style="font-size:13px; color:#e2e8f0; font-weight:600;">' + escHtml(nom) + '</span>'
        + (quand ? '<span style="font-size:10px; color:#64748b; white-space:nowrap;"><i class="fas fa-clock" style="margin-right:3px;"></i>Inscrit le ' + quand + '</span>' : '')
        + '</div>'
        + '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:7px;">'
        + '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">'
        + statutHtml
        + '<span style="font-size:10px; color:' + (nbDispoRens > 0 ? '#22c55e' : '#64748b') + '; white-space:nowrap;">' + (nbDispoRens > 0 ? '<i class="fas fa-calendar-check"></i> ' + nbDispoRens + ' dispo(s) renseignée(s)' : '<i class="fas fa-hourglass-half"></i> Aucune dispo renseignée') + '</span>'
        + '</div>'
        + '<div style="display:flex; gap:5px; flex-shrink:0;">'
        + (!valide && !refuse ? '<button onclick="window.validerInscriptionAdmin(\'' + champId + '\',\'' + uid + '\')" style="background:#22c55e22; color:#22c55e; border:1px solid #22c55e44; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:11px;" title="Valider inscription"><i class="fas fa-check"></i></button>' : '')
        + (!refuse ? '<button onclick="window.refuserInscription(\'' + champId + '\',\'' + uid + '\')" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:11px;" title="Refuser avec motif"><i class="fas fa-ban"></i></button>' : '')
        + '<button onclick="window.supprimerInscription(\'' + champId + '\',\'' + uid + '\')" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:11px;" title="Supprimer définitivement"><i class="fas fa-trash"></i></button>'
        + '</div>'
        + '</div>'
        + (refuse && motif ? '<div style="font-size:11px; color:#94a3b8; padding:6px 8px; background:#ef444411; border-left:2px solid #ef4444; border-radius:4px; margin-top:7px;"><i class="fas fa-comment-alt" style="margin-right:4px; color:#ef4444;"></i><strong style="color:#ef4444;">Motif :</strong> ' + escHtml(motif) + '</div>' : '')
        + '</div>';
}

function _loadInscritsPanel(champId) {
    var panel = document.getElementById('inscrits-panel-' + champId);
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = '<p style="color:#64748b; font-size:12px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    Promise.all([
        db_ref.ref('inscriptions_equipe/' + champId).once('value'),
        db_ref.ref('members').once('value')
    ]).then(function(snaps) {
        var snapIns = snaps[0]; var snapMem = snaps[1];

        var members = {}; snapMem.forEach(function(m) { members[m.key] = m.val(); });
        var rows = '';
        if (snapIns.exists()) {
            snapIns.forEach(function(insNode) {
                rows += _inscriptionRowHtml(champId, insNode.key, insNode.val(), members[insNode.key]);
            });
        }
        panel.innerHTML = '<div style="font-size:11px; color:#64748b; margin-bottom:8px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center;">'
            + '<span><i class="fas fa-users" style="margin-right:5px;"></i>Membres inscrits</span>'
            + '<button onclick="document.getElementById(\'inscrits-panel-' + champId + '\').style.display=\'none\'" style="background:none; border:none; color:#64748b; cursor:pointer; font-size:14px;"><i class="fas fa-times"></i></button>'
            + '</div>'
            + (rows || '<p style="color:#64748b; font-size:12px; text-align:center; padding:8px 0;">Aucun membre inscrit.</p>');
    }).catch(function(err) {
        panel.innerHTML = '<p style="color:#ef4444; font-size:12px; text-align:center;"><i class="fas fa-exclamation-triangle" style="margin-right:5px;"></i>Erreur chargement : ' + escHtml(err.message || String(err)) + '</p>';
    });
}

window.validerInscriptionAdmin = function(champId, uid) {
    db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).update({
        valide: true, statut: 'validee', validatedAt: Date.now(),
        motifRefus: null, refusedAt: null
    }).then(function() {
        _getChampNom(champId).then(function(nom) {
            var msg = 'Votre inscription' + (nom ? ' au championnat « ' + nom + ' »' : '') + ' a été validée par le coach.';
            _notifierEtPusher(uid, champId, 'inscription_validee', msg, '✅ Inscription validée');
        });
        window.showNotification && window.showNotification('Inscription validée (membre notifié).', 'success');
        _loadInscritsPanel(champId);
    }).catch(function(err) {
        window.showNotification && window.showNotification('Erreur validation inscription : ' + (err.message || err), 'error');
    });
};

// Refuser une inscription AVEC motif (garde l'entrée, le membre voit la raison)
window.refuserInscription = async function(champId, uid) {
    var motif = await window.confirmDialog.prompt({
        title: 'Refuser l\'inscription',
        message: 'Indiquez au membre la raison du refus. Ce texte lui sera visible dans son espace.',
        placeholder: 'Ex : classement hors limites de l\'équipe, équipe déjà complète, etc.',
        confirmText: 'Refuser', cancelText: 'Annuler',
        type: 'danger', required: true, maxLength: 500
    });
    if (motif === null) return;
    try {
        await db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).update({
            valide: false, statut: 'refuse', motifRefus: motif, refusedAt: Date.now()
        });
        // Retirer le joueur des équipes et des convocations où il figurait
        await _retirerJoueurDuChamp(champId, uid);
        _getChampNom(champId).then(function(nom) {
            var msg = 'Votre inscription' + (nom ? ' au championnat « ' + nom + ' »' : '') + ' a été refusée par le coach. Motif : ' + motif;
            _notifierEtPusher(uid, champId, 'inscription_refusee', msg, '❌ Inscription refusée');
        });
        window.showNotification && window.showNotification('Inscription refusée (membre notifié).', 'success');
        _loadInscritsPanel(champId);
    } catch(err) {
        window.showNotification && window.showNotification('Erreur refus inscription : ' + (err.message || err), 'error');
    }
};

window.supprimerInscription = async function(champId, uid) {
    var ok = await window.confirmDialog.show({
        title: 'Supprimer l\'inscription',
        message: 'Supprimer définitivement l\'inscription de ce membre (sans motif) ? Il sera aussi retiré des équipes et des convocations de ce championnat. Utilisez plutôt « Refuser » si vous voulez laisser un message au membre.',
        type: 'danger', confirmText: 'Supprimer', cancelText: 'Annuler'
    });
    if (!ok) return;
    try {
        await db_ref.ref('inscriptions_equipe/' + champId + '/' + uid).remove();
        await _retirerJoueurDuChamp(champId, uid);
        window.showNotification && window.showNotification('Inscription supprimée (équipes et convocations nettoyées).', 'success');
        _loadInscritsPanel(champId);
    } catch(err) {
        window.showNotification && window.showNotification('Erreur suppression inscription : ' + (err.message || err), 'error');
    }
};

// Retire un joueur de toutes les équipes d'un championnat : effectif, positions de convocation et réponses
async function _retirerJoueurDuChamp(champId, uid) {
    var snapEq = await db_ref.ref('equipes').orderByChild('champId').equalTo(champId).once('value');
    var ops = [];
    snapEq.forEach(function(child) {
        var eq = child.val(); if (!eq) return;
        if (eq.joueurs && eq.joueurs[uid]) {
            ops.push(db_ref.ref('equipes/' + child.key + '/joueurs/' + uid).remove());
        }
        Object.entries(eq.convocations || {}).forEach(function(entry) {
            var rid = entry[0]; var conv = entry[1] || {};
            Object.entries(conv.positions || {}).forEach(function(p) {
                if (p[1] === uid) ops.push(db_ref.ref('equipes/' + child.key + '/convocations/' + rid + '/positions/' + p[0]).remove());
            });
            if (conv.reponses && conv.reponses[uid]) {
                ops.push(db_ref.ref('equipes/' + child.key + '/convocations/' + rid + '/reponses/' + uid).remove());
            }
        });
    });
    await Promise.all(ops);
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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
    const universalForm = document.getElementById('universal-form')?.closest('div[style*="background:rgba(2,6,23"]');
    const documentsAdmin = document.getElementById('documents-admin');

    const contactsAdmin = document.getElementById('contacts-admin');
    const membersAdmin = document.getElementById('members-admin');
    const sponsorsListAdmin = document.getElementById('sponsors-list-admin');
    const tournamentsListAdmin = document.getElementById('tournaments-list-admin');
    const clubMessagesAdmin = document.getElementById('club-messages-admin');

    // Gérer l'affichage spécial pour les sections documents, contacts, membres et messages
    const hideSpecialSections = () => {
        if (documentsAdmin) documentsAdmin.classList.add('hidden');
        if (contactsAdmin) contactsAdmin.classList.add('hidden');
        if (membersAdmin) membersAdmin.classList.add('hidden');
        if (clubMessagesAdmin) clubMessagesAdmin.classList.add('hidden');
        if (sponsorsListAdmin) sponsorsListAdmin.classList.add('hidden');
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
        if (tournamentsListAdmin) {
            if (section === 'tournaments') {
                tournamentsListAdmin.classList.remove('hidden');
                loadTournamentsAdminList();
            } else {
                tournamentsListAdmin.classList.add('hidden');
            }
        }
    }

    if (titleEl) titleEl.innerText = `Gérer : ${section.toUpperCase()}`;

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
    if (section === 'info') {
        inputTitle.placeholder = "Adresse du club";
        inputDesc.placeholder = "Numéro de téléphone";
    } else if (section === 'sponsors') {
        inputTitle.placeholder = "Nom du partenaire";
        inputDesc.placeholder = "Informations complémentaires (facultatif)";
    } else {
        inputTitle.placeholder = "Titre";
        inputDesc.placeholder = "Description";
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

// === LISTE DES TOURNOIS POUR L'ADMIN ===
async function loadTournamentsAdminList() {
    const body = document.getElementById('tournaments-admin-list-body');
    if (!body) return;
    body.innerHTML = '<p style="color:#64748b; font-size:13px;">Chargement...</p>';

    const snap = await db_ref.ref('tournaments').once('value');
    const data = snap.val();
    if (!data) {
        body.innerHTML = '<p style="color:#64748b; font-size:13px;">Aucun tournoi enregistré.</p>';
        return;
    }

    const items = Array.isArray(data) ? data : Object.values(data);
    body.innerHTML = items.map((t, i) => {
        if (!t) return '';
        const isDraft = t.draft ? ' <span style="background:#fb923c;color:white;padding:2px 8px;border-radius:8px;font-size:10px;margin-left:6px;">BROUILLON</span>' : '';
        return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px;
            background:rgba(255,255,255,0.03); border:1px solid rgba(0,210,255,0.12); border-radius:10px; margin-bottom:8px; gap:12px;">
            <div style="flex:1; min-width:0;">
                <div style="color:#e2e8f0; font-size:14px; font-weight:600;">${escapeHtml(t.title || '—')}${isDraft}</div>
                ${t.date ? `<div style="color:#64748b; font-size:12px; margin-top:3px;"><i class="fas fa-calendar" style="margin-right:4px;"></i>${escapeHtml(t.date)}</div>` : ''}
                ${t.desc ? `<div style="color:#94a3b8; font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px;">${escapeHtml(t.desc.substring(0, 80))}${t.desc.length > 80 ? '…' : ''}</div>` : ''}
            </div>
            <button onclick="window.editItem('tournaments', ${i})"
                style="background:rgba(0,210,255,0.1);border:1px solid rgba(0,210,255,0.4);color:#00d2ff;padding:7px 16px;border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;">
                <i class="fas fa-edit"></i> Modifier
            </button>
        </div>`;
    }).join('');
}
window.loadTournamentsAdminList = loadTournamentsAdminList;

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
        div.innerHTML = `
            <img src="${url}" style="width:80px; height:80px; object-fit:cover; border-radius:5px; border:1px solid #334155;">
            <button onclick="removeTempImage(${i})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:12px; cursor:pointer;">&times;</button>
        `;
        container.appendChild(div);
    });
};

window.removeTempImage = (index) => {
    window.tempImages.splice(index, 1);
    window.renderExistingImages();
};

// === MODAL D'AIDE ===
window.showAdminHelp = () => {
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
};

// Fermer le modal aide si clic à l'extérieur
document.getElementById('help-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'help-modal') {
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

    db_ref.ref('members').once('value', snap => {
        const data = snap.val();
        if (!data) {
            list.innerHTML = '<p style="color:#64748b; text-align:center;">Aucun membre enregistré.</p>';
            return;
        }
        window._allMembersAdmin = Object.entries(data).map(([uid, m]) => ({ uid, ...m }));
        window.filterMembers();
    });
};

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
    try {
        await db_ref.ref(`members/${uid}`).update({ classement, licence, statut });
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
    const confirmed = await window.askConfirmation(
        'Supprimer le membre',
        `Êtes-vous sûr de vouloir supprimer le compte de ${name} ? Cette action est irréversible.`,
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

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

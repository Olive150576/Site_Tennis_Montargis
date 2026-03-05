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

function restoreAutoSave() {
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
        const restore = confirm('Un brouillon non sauvegardé a été trouvé. Voulez-vous le restaurer ?');
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

    // Gérer l'affichage spécial pour les sections documents, contacts et membres
    if (section === 'documents') {
        if (universalForm) universalForm.style.display = 'none';
        if (documentsAdmin) { documentsAdmin.classList.remove('hidden'); if (window.loadDocumentsAdmin) window.loadDocumentsAdmin(); }
        if (contactsAdmin) contactsAdmin.classList.add('hidden');
        if (membersAdmin) membersAdmin.classList.add('hidden');
        if (sponsorsListAdmin) sponsorsListAdmin.classList.add('hidden');
    } else if (section === 'contacts') {
        if (universalForm) universalForm.style.display = 'none';
        if (documentsAdmin) documentsAdmin.classList.add('hidden');
        if (contactsAdmin) { contactsAdmin.classList.remove('hidden'); window.loadContactsAdmin(); }
        if (membersAdmin) membersAdmin.classList.add('hidden');
        if (sponsorsListAdmin) sponsorsListAdmin.classList.add('hidden');
    } else if (section === 'members') {
        if (universalForm) universalForm.style.display = 'none';
        if (documentsAdmin) documentsAdmin.classList.add('hidden');
        if (contactsAdmin) contactsAdmin.classList.add('hidden');
        if (membersAdmin) { membersAdmin.classList.remove('hidden'); window.loadMembersAdmin && window.loadMembersAdmin(); }
        if (sponsorsListAdmin) sponsorsListAdmin.classList.add('hidden');
    } else {
        if (universalForm) universalForm.style.display = 'block';
        if (documentsAdmin) documentsAdmin.classList.add('hidden');
        if (contactsAdmin) contactsAdmin.classList.add('hidden');
        if (membersAdmin) membersAdmin.classList.add('hidden');
        if (sponsorsListAdmin) {
            if (section === 'sponsors') {
                sponsorsListAdmin.classList.remove('hidden');
                loadSponsorsAdminList();
            } else {
                sponsorsListAdmin.classList.add('hidden');
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

    } catch (error) {
        console.error('Erreur lors de la mise à jour des stats:', error);
    }
}

// Appeler updateAdminStats au chargement si admin
window.updateAdminStats = updateAdminStats;

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
        const docs = snap.val() || [];
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
        const docs = snap.val() || [];
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
        const docs = snap.val() || [];
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
        alert('Aucun contact à exporter.');
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
        await createMember({ prenom, nom, email, password, telephone, licence, classement, categorie });
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
        const members = Object.entries(data).map(([uid, m]) => ({ uid, ...m }));
        members.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

        list.innerHTML = members.map(m => `
            <div style="display:flex; align-items:center; gap:16px; background:rgba(34,197,94,0.05); border:1px solid rgba(34,197,94,0.15); border-radius:12px; padding:14px 18px; flex-wrap:wrap;">
                <div style="width:42px; height:42px; border-radius:50%; background:rgba(34,197,94,0.15); border:1px solid #22c55e; display:flex; align-items:center; justify-content:center; color:#22c55e; font-weight:bold; flex-shrink:0;">
                    ${(m.prenom || '?')[0]}${(m.nom || '?')[0]}
                </div>
                <div style="flex:1; min-width:150px;">
                    <div style="color:white; font-weight:600;">${escapeHtml(m.prenom || '')} ${escapeHtml(m.nom || '')}</div>
                    <div style="color:#64748b; font-size:12px;">${escapeHtml(m.email || '')} · Licence: ${escapeHtml(m.licence || '—')} · ${escapeHtml(m.classement || '—')}</div>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <span style="padding:3px 10px; border-radius:50px; font-size:11px; font-weight:bold; background:${m.actif ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color:${m.actif ? '#22c55e' : '#ef4444'}; border:1px solid ${m.actif ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                        ${m.actif ? 'Actif' : 'Inactif'}
                    </span>
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
        `).join('');
    });
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

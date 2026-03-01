
document.addEventListener('DOMContentLoaded', () => {
    let db = {};
    window.isCurrentUserAdmin = false; // Variable globale pour stocker l'état admin
    window.firebaseListeners = []; // Stocker les listeners pour cleanup

    // --- CLARITY TRACKING HELPER ---
    function clarityEvent(name, data) {
        if (typeof window.clarity === 'function') {
            window.clarity('event', name);
            if (data) Object.entries(data).forEach(([k, v]) => window.clarity('set', k, v));
        }
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            // Vérifier si l'utilisateur est dans la liste des admins
            db_ref.ref('admins/' + user.uid).once('value', snapshot => {
                window.isCurrentUserAdmin = snapshot.exists();
                toggleAdminUI(window.isCurrentUserAdmin);

                if (window.isCurrentUserAdmin) {
                    // Chargement dynamique du script admin si admin
                    const adminScript = document.getElementById('admin-script-placeholder');
                    if (adminScript && !adminScript.src) {
                        adminScript.src = 'admin.js';
                    }
                    // Définir le custom claim admin (pour les règles Storage)
                    firebase.functions().httpsCallable('grantAdminClaim')()
                        .then(() => user.getIdToken(true))
                        .catch(e => console.warn('Custom claim Storage:', e.message));
                }

                // Re-render pour afficher/cacher les boutons admin
                renderAll();
            });
        } else {
            window.isCurrentUserAdmin = false;
            toggleAdminUI(false);
            renderAll();
        }
    });

    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(reg => {
                    console.log('SW Registered with scope:', reg.scope);
                    // On force la mise à jour si un nouveau SW est en attente
                    reg.update();
                })
                .catch(err => console.log('SW Registration Error:', err));
        });
    }

    // --- THEME TOGGLE ---
    const themeBtn = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.remove('clubhouse-mode');
    }
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('clubhouse-mode');
            localStorage.setItem('theme', document.body.classList.contains('clubhouse-mode') ? 'clubhouse' : 'dark');
        });
    }

    // --- GESTION DU BOUTON RETOUR POUR LES MODALES (MOBILE) ---
    // Variable pour tracker la modale ouverte
    window.currentOpenModal = null;

    // Fonction pour ouvrir une modale avec gestion de l'historique
    window.openModalWithHistory = (modalId) => {
        window.currentOpenModal = modalId;
        history.pushState({ modal: modalId }, '', window.location.pathname);
    };

    // Fonction pour fermer la modale courante
    window.closeCurrentModal = () => {
        if (window.currentOpenModal) {
            const modal = document.getElementById(window.currentOpenModal);
            if (modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
            window.currentOpenModal = null;
        }
    };

    // Écouter le bouton retour du navigateur
    window.addEventListener('popstate', (event) => {
        // Si une modale est ouverte, la fermer
        if (window.currentOpenModal) {
            const modal = document.getElementById(window.currentOpenModal);
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
                window.currentOpenModal = null;
            }
        }
    });

    // --- ANIMATIONS AU SCROLL ---
    // Utilisation de l'Intersection Observer pour déclencher les animations
    const observerOptions = {
        root: null, // viewport
        rootMargin: '0px 0px -200px 0px', // Déclenche quand la section est bien visible (200px du bas)
        threshold: 0.15 // 15% de la section doit être visible
    };

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                // Une fois animé, on arrête d'observer pour économiser les ressources
                sectionObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observer toutes les sections avec l'attribut id finissant par -section
    document.querySelectorAll('section[id$="-section"]').forEach(section => {
        sectionObserver.observe(section);
    });

    // --- SKELETON & CHARGEMENT ---
    renderSkeletons();

    // Stocker toutes les actualités pour la page archives
    window.allNews = {};
    // Stocker tous les tarifs pour la page "Tous nos tarifs"
    window.allRates = {};

    // Flag pour éviter d'ouvrir plusieurs fois via URL
    let urlParamHandled = false;

    // Fonction pour gérer les paramètres URL (liens directs vers actualités/événements)
    function handleUrlParams() {
        if (urlParamHandled) return;

        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = urlParams.get('view');

        if (viewParam) {
            // Format: section_key (ex: news_5 ou event_abc123)
            const [section, key] = viewParam.split('_');

            if (section && key !== undefined) {
                // Petit délai pour s'assurer que le DOM est prêt
                setTimeout(() => {
                    if (section === 'news') {
                        // Pour les news, utiliser allNews
                        if (window.allNews && window.allNews[key]) {
                            window.openGalleryByKey('news', key);
                            urlParamHandled = true;
                            // Nettoyer l'URL sans recharger
                            history.replaceState({}, '', window.location.pathname);
                        }
                    } else if (section === 'event') {
                        // Pour les événements
                        window.openGallery('event', parseInt(key));
                        urlParamHandled = true;
                        history.replaceState({}, '', window.location.pathname);
                    }
                }, 500);
            }
        }
    }

    const sections = ['news', 'inst', 'event', 'coach', 'rates', 'sponsors'];
    sections.forEach(sec => {
        // Pour les news, on charge TOUT pour les archives, mais on affiche que 6 sur l'accueil
        const ref = db_ref.ref(sec);
        const callback = (snap) => {
            db[sec] = snap.val();

            // Pour les actualités : stocker tout
            // Admin voit tout, visiteur voit seulement 6
            if (sec === 'news') {
                window.allNews = snap.val() || {};
                // Nettoyer les actualités de plus de 13 mois (en arrière-plan)
                cleanupOldNews();
                // Admin : afficher tout pour réorganisation / Visiteur : 6 dernières
                if (window.isCurrentUserAdmin) {
                    renderGrid(`${sec}-grid`, getAllItemsWithKeys(db[sec]), sec);
                } else {
                    renderGrid(`${sec}-grid`, getLatestItemsWithKeys(db[sec], 6), sec);
                }
                // Vérifier si un lien direct vers une actualité a été partagé
                handleUrlParams();
            }
            // Pour les tarifs : stocker tout
            // Admin voit tout, visiteur voit seulement 3
            else if (sec === 'rates') {
                window.allRates = snap.val() || {};
                // Admin : afficher tout pour réorganisation / Visiteur : 3 premiers
                if (window.isCurrentUserAdmin) {
                    renderGrid(`${sec}-grid`, getAllItemsWithKeys(db[sec]), sec);
                } else {
                    renderGrid(`${sec}-grid`, getFirstItemsWithKeys(db[sec], 3), sec);
                }
            }
            // Pour les événements : Admin voit tout, visiteur voit tout (pas de limite actuellement)
            else if (sec === 'event') {
                if (window.isCurrentUserAdmin) {
                    renderGrid(`${sec}-grid`, getAllItemsWithKeys(db[sec]), sec);
                } else {
                    renderGrid(`${sec}-grid`, db[sec], sec);
                }
            } else {
                renderGrid(`${sec}-grid`, db[sec], sec);
            }
        };
        ref.on('value', callback);
        // Stocker pour cleanup
        window.firebaseListeners.push({ ref, callback, event: 'value' });
    });

    // Fonction pour récupérer les N derniers éléments (conserve les clés Firebase)
    function getLatestItemsWithKeys(data, count) {
        if (!data) return null;

        if (Array.isArray(data)) {
            // Si c'est un array, prendre les derniers éléments avec leurs index comme clés
            const items = data.map((item, index) => ({ _key: index, ...item }));
            return items.filter(item => item !== null).slice(-count);
        } else {
            // Si c'est un objet, convertir en array avec les clés, trier par date et prendre les derniers
            const items = Object.entries(data)
                .filter(([key, item]) => item !== null)
                .map(([key, item]) => ({ _key: key, ...item }))
                .sort((a, b) => {
                    const dateA = a.createdAt || new Date(a.date || 0).getTime();
                    const dateB = b.createdAt || new Date(b.date || 0).getTime();
                    return dateA - dateB;
                });
            return items.slice(-count);
        }
    }

    // Fonction pour récupérer les N premiers éléments (conserve les clés Firebase)
    function getFirstItemsWithKeys(data, count) {
        if (!data) return null;

        if (Array.isArray(data)) {
            // Si c'est un array, prendre les premiers éléments avec leurs index comme clés
            const items = data.map((item, index) => ({ _key: index, ...item }));
            return items.filter(item => item !== null).slice(0, count);
        } else {
            // Si c'est un objet, convertir en array avec les clés et prendre les premiers
            const items = Object.entries(data)
                .filter(([key, item]) => item !== null)
                .map(([key, item]) => ({ _key: key, ...item }));
            return items.slice(0, count);
        }
    }

    // Fonction pour récupérer TOUS les éléments avec leurs clés (pour admin)
    function getAllItemsWithKeys(data) {
        if (!data) return null;

        if (Array.isArray(data)) {
            // Si c'est un array, retourner tous les éléments avec leurs index comme clés
            const items = data.map((item, index) => ({ _key: index, ...item }));
            return items.filter(item => item !== null);
        } else {
            // Si c'est un objet, convertir en array avec les clés
            const items = Object.entries(data)
                .filter(([key, item]) => item !== null)
                .map(([key, item]) => ({ _key: key, ...item }));
            return items;
        }
    }

    // Fonction pour récupérer les N derniers éléments (ancienne version pour compatibilité)
    function getLatestItems(data, count) {
        if (!data) return null;
        const items = Array.isArray(data) ? [...data] : Object.entries(data);
        if (Array.isArray(data)) {
            // Si c'est un array, prendre les derniers éléments
            return items.slice(-count);
        } else {
            // Si c'est un objet, convertir en array avec les clés, trier par date et prendre les derniers
            const sorted = items
                .filter(([key, item]) => item !== null)
                .sort((a, b) => {
                    const dateA = a[1].createdAt || new Date(a[1].date || 0).getTime();
                    const dateB = b[1].createdAt || new Date(b[1].date || 0).getTime();
                    return dateA - dateB;
                });
            // Reconstruire un objet avec seulement les N derniers
            const result = {};
            sorted.slice(-count).forEach(([key, item]) => {
                result[key] = item;
            });
            return result;
        }
    }

    // Fonction de nettoyage des actualités de plus de 13 mois
    async function cleanupOldNews() {
        if (!window.isCurrentUserAdmin) return; // Seul un admin peut déclencher le nettoyage

        const thirteenMonthsAgo = Date.now() - (13 * 30 * 24 * 60 * 60 * 1000); // 13 mois en ms
        const newsRef = db_ref.ref('news');

        try {
            const snapshot = await newsRef.once('value');
            const allNews = snapshot.val();
            if (!allNews) return;

            const keysToDelete = [];
            const imagesToDelete = [];

            Object.entries(allNews).forEach(([key, item]) => {
                if (!item) return;

                // Déterminer la date de création
                let itemDate;
                if (item.createdAt) {
                    itemDate = item.createdAt;
                } else if (item.date) {
                    // Parser la date au format "JJ/MM/AAAA" ou autre
                    const parts = item.date.split('/');
                    if (parts.length === 3) {
                        itemDate = new Date(parts[2], parts[1] - 1, parts[0]).getTime();
                    } else {
                        itemDate = new Date(item.date).getTime();
                    }
                } else {
                    return; // Pas de date, on ne supprime pas
                }

                if (itemDate < thirteenMonthsAgo) {
                    keysToDelete.push(key);
                    // Collecter les images à supprimer
                    if (item.images && Array.isArray(item.images)) {
                        imagesToDelete.push(...item.images);
                    }
                }
            });

            if (keysToDelete.length > 0) {
                console.log(`[Cleanup] Suppression de ${keysToDelete.length} actualité(s) de plus de 13 mois`);

                // Supprimer les entrées de la base de données
                const updates = {};
                keysToDelete.forEach(key => {
                    updates[key] = null;
                });
                await newsRef.update(updates);

                // Supprimer les images du Storage
                for (const imageUrl of imagesToDelete) {
                    try {
                        // Extraire le chemin depuis l'URL Firebase Storage
                        if (imageUrl.includes('firebasestorage.googleapis.com')) {
                            const pathMatch = imageUrl.match(/o\/(.+?)\?/);
                            if (pathMatch) {
                                const path = decodeURIComponent(pathMatch[1]);
                                await storage.ref(path).delete();
                            }
                        }
                    } catch (imgErr) {
                        console.log('[Cleanup] Image déjà supprimée ou inaccessible');
                    }
                }

                console.log(`[Cleanup] Nettoyage terminé : ${keysToDelete.length} actualité(s) supprimée(s)`);
            }
        } catch (error) {
            console.log('[Cleanup] Erreur lors du nettoyage:', error);
        }
    }

    const infoRef = db_ref.ref('info');
    const infoCallback = (snap) => {
        db.info = snap.val();
        if (db.info) {
            if (document.getElementById('display-address')) document.getElementById('display-address').innerText = db.info.address || "";
            if (document.getElementById('display-phone')) document.getElementById('display-phone').innerText = db.info.phone || "";
            if (document.getElementById('display-email')) document.getElementById('display-email').innerText = db.info.email || "";
        }
    };
    infoRef.on('value', infoCallback);
    window.firebaseListeners.push({ ref: infoRef, callback: infoCallback, event: 'value' });

    // Charger les documents téléchargeables
    const documentsRef = db_ref.ref('documents');
    const documentsCallback = (snap) => {
        const docs = snap.val() || [];
        renderDocuments(docs);
    };
    documentsRef.on('value', documentsCallback);
    window.firebaseListeners.push({ ref: documentsRef, callback: documentsCallback, event: 'value' });

    function renderDocuments(docs) {
        const container = document.getElementById('documents-grid');
        if (!container) return;

        if (!docs || docs.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; grid-column:1/-1;">Aucun document disponible pour le moment.</p>';
            return;
        }

        container.innerHTML = docs.map(doc => `
            <a href="${escapeHtml(doc.url)}" target="_blank" download
               style="display:flex; align-items:center; gap:15px; padding:20px; background:rgba(30,41,59,0.6); border-radius:12px; border:1px solid rgba(0,210,255,0.2); text-decoration:none; transition:all 0.3s; cursor:pointer;"
               onmouseover="this.style.background='rgba(0,210,255,0.15)'; this.style.borderColor='rgba(0,210,255,0.5)'; this.style.transform='translateY(-2px)';"
               onmouseout="this.style.background='rgba(30,41,59,0.6)'; this.style.borderColor='rgba(0,210,255,0.2)'; this.style.transform='translateY(0)';">
                <div style="width:50px; height:50px; background:rgba(239,68,68,0.2); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="fas fa-file-pdf" style="font-size:24px; color:#ef4444;"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="color:#e2e8f0; font-weight:600; margin-bottom:4px; line-height:1.3; word-break:break-word;">${escapeHtml(doc.name)}</div>
                    <div style="color:#64748b; font-size:12px;">PDF • ${(doc.size / 1024).toFixed(0)} Ko</div>
                </div>
                <div style="background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; padding:8px 16px; border-radius:8px; font-weight:bold; font-size:13px; white-space:nowrap;">
                    <i class="fas fa-download" style="margin-right:6px;"></i>Télécharger
                </div>
            </a>
        `).join('');
    }

    function renderSkeletons() {
        const skeletonHTML = `<article class="news-card skeleton"><div class="skeleton-img"></div><div class="skeleton-title"></div><div class="skeleton-text"></div></article>`.repeat(3);
        ['news-grid', 'inst-grid', 'event-grid', 'coach-grid', 'rates-grid', 'sponsors-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = skeletonHTML;
        });
    }

    function renderAll() {
        ['news', 'inst', 'event', 'coach', 'rates', 'sponsors'].forEach(sec => renderGrid(`${sec}-grid`, db[sec], sec));
    }

    // --- SÉCURITÉ : Échappement HTML pour prévenir XSS ---
    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- SYSTÈME DE PARTAGE ---
    window.shareContent = async (title, text, url) => {
        const shareData = {
            title: title || 'USM Tennis Montargis',
            text: text || 'Découvrez le club de tennis USM Montargis',
            url: url || window.location.href
        };

        // Sur mobile, utiliser l'API Web Share native
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.log('Erreur de partage:', err);
                }
            }
        } else {
            // Sur desktop, afficher le menu de partage personnalisé
            showShareMenu(shareData);
        }
    };

    // Menu de partage pour desktop
    function showShareMenu(data) {
        // Supprimer un menu existant
        const existingMenu = document.getElementById('share-menu');
        if (existingMenu) existingMenu.remove();

        const encodedUrl = encodeURIComponent(data.url);
        const encodedText = encodeURIComponent(data.text);
        const encodedTitle = encodeURIComponent(data.title);

        const menu = document.createElement('div');
        menu.id = 'share-menu';
        menu.innerHTML = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;" onclick="this.remove()">
                <div style="background:#1e293b; border-radius:16px; padding:25px; max-width:320px; width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
                    <h3 style="color:#e2e8f0; font-family:'Orbitron'; margin:0 0 20px 0; text-align:center; font-size:1.1rem;">
                        <i class="fas fa-share-alt" style="margin-right:10px; color:#00d2ff;"></i>Partager
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:20px;">
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank"
                           style="display:flex; flex-direction:column; align-items:center; gap:6px; text-decoration:none; color:#e2e8f0; padding:15px 10px; border-radius:12px; background:rgba(255,255,255,0.05); transition:all 0.2s;"
                           onmouseover="this.style.background='#1877F2'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <i class="fab fa-facebook-f" style="font-size:22px;"></i>
                            <span style="font-size:12px;">Facebook</span>
                        </a>
                        <a href="https://wa.me/?text=${encodedText}%20${encodedUrl}" target="_blank"
                           style="display:flex; flex-direction:column; align-items:center; gap:6px; text-decoration:none; color:#e2e8f0; padding:15px 10px; border-radius:12px; background:rgba(255,255,255,0.05); transition:all 0.2s;"
                           onmouseover="this.style.background='#25D366'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <i class="fab fa-whatsapp" style="font-size:22px;"></i>
                            <span style="font-size:12px;">WhatsApp</span>
                        </a>
                        <a href="mailto:?subject=${encodedTitle}&body=${encodedText}%0A%0A${encodedUrl}"
                           style="display:flex; flex-direction:column; align-items:center; gap:6px; text-decoration:none; color:#e2e8f0; padding:15px 10px; border-radius:12px; background:rgba(255,255,255,0.05); transition:all 0.2s;"
                           onmouseover="this.style.background='#EA4335'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <i class="fas fa-envelope" style="font-size:22px;"></i>
                            <span style="font-size:12px;">Email</span>
                        </a>
                        <button onclick="copyToClipboard('${data.url}'); this.closest('#share-menu').remove();"
                           style="display:flex; flex-direction:column; align-items:center; gap:6px; color:#e2e8f0; padding:15px 10px; border-radius:12px; background:rgba(255,255,255,0.05); border:none; cursor:pointer; transition:all 0.2s;"
                           onmouseover="this.style.background='#00d2ff'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <i class="fas fa-link" style="font-size:22px;"></i>
                            <span style="font-size:12px;">Copier</span>
                        </button>
                    </div>
                    <button onclick="this.closest('#share-menu').remove()"
                            style="width:100%; padding:12px; background:rgba(255,255,255,0.1); border:none; border-radius:10px; color:#94a3b8; cursor:pointer; font-size:14px;">
                        Annuler
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(menu);
    }

    // Copier dans le presse-papier
    window.copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            window.showSuccessMessage('Lien copié !', 'Le lien a été copié dans le presse-papier.');
        } catch (err) {
            // Fallback pour les anciens navigateurs
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            window.showSuccessMessage('Lien copié !', 'Le lien a été copié dans le presse-papier.');
        }
    };

    // Partager le site
    window.shareSite = () => {
        window.shareContent(
            'USM Tennis Montargis',
            'Découvrez le club de tennis USM Montargis - Cours, compétitions et événements pour tous les niveaux !',
            'https://tennismontargis.fr'
        );
    };

    // Variable pour stocker l'élément actuellement affiché dans la galerie
    window.currentGalleryItem = { section: null, key: null };

    // Partager le contenu de la galerie ouverte
    window.shareGalleryContent = () => {
        const title = document.getElementById('gallery-title')?.textContent || 'USM Tennis Montargis';
        const desc = document.getElementById('gallery-desc')?.textContent?.substring(0, 100) || '';

        // Construire l'URL avec le lien direct si on a les infos
        let shareUrl = 'https://tennismontargis.fr';
        if (window.currentGalleryItem.section && window.currentGalleryItem.key !== null) {
            shareUrl = `https://tennismontargis.fr?view=${window.currentGalleryItem.section}_${window.currentGalleryItem.key}`;
        }

        window.shareContent(title, desc + '...', shareUrl);
    };

    // Fonction pour sécuriser le HTML tout en gardant les balises autorisées (b, i, u, a)
    function sanitizeHtml(text) {
        if (!text) return "";

        // Liste des balises autorisées
        const allowedTags = ['b', 'i', 'u', 'a'];

        // Sauvegarder les balises autorisées avec des placeholders
        let result = text;
        const placeholders = [];

        // Extraire et sauvegarder les balises <a> avec leurs attributs href
        result = result.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (match, href, content) => {
            // Valider que l'URL commence par http ou https
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                const placeholder = `__LINK_${placeholders.length}__`;
                placeholders.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:var(--electric-cyan); text-decoration:underline;">${escapeHtml(content)}</a>`);
                return placeholder;
            }
            return escapeHtml(content);
        });

        // Extraire et sauvegarder les balises b, i, u
        allowedTags.forEach(tag => {
            if (tag === 'a') return; // Déjà traité
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
            result = result.replace(regex, (match, content) => {
                const placeholder = `__TAG_${placeholders.length}__`;
                placeholders.push(`<${tag}>${escapeHtml(content)}</${tag}>`);
                return placeholder;
            });
        });

        // Échapper tout le reste
        result = escapeHtml(result);

        // Restaurer les placeholders
        placeholders.forEach((replacement, index) => {
            result = result.replace(`__LINK_${index}__`, replacement);
            result = result.replace(`__TAG_${index}__`, replacement);
        });

        return result;
    }

    function linkify(text) {
        if (!text) return "";
        // Sécuriser le HTML en gardant les balises autorisées
        let result = sanitizeHtml(text);
        // Convertir les retours à la ligne
        result = result.replace(/\n/g, '<br>');
        // Convertir les URLs non encore liées en liens cliquables
        result = result.replace(/(?<!href="|>)(https?:\/\/[^\s<]+)/g, (url) =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--electric-cyan); text-decoration:underline;">${url}</a>`
        );
        return result;
    }

    // Fonction pour formater le texte avec retours à la ligne (pour les cartes)
    function formatText(text) {
        if (!text) return "";
        return sanitizeHtml(text).replace(/\n/g, '<br>');
    }

    function renderGrid(containerId, data, section) {
        const grid = document.getElementById(containerId);
        if (!grid || !data) { if (grid && !data) grid.innerHTML = '<p>Aucun élément.</p>'; return; }
        let items = Array.isArray(data) ? [...data] : Object.values(data);

        // Filtrer les brouillons pour les visiteurs (non-admin)
        // Les admins voient tous les éléments avec une indication visuelle
        if (!window.isCurrentUserAdmin) {
            items = items.filter(item => item && item.draft !== true);
        }

        if (section === 'news' || section === 'event') items.reverse();

        // Rendu spécifique pour les SPONSORS (carousel défilant)
        if (section === 'sponsors') {
            const makeCard = (item, i, isClone) => {
                const isDraft = !!item.draft;
                return `
                <div class="sponsor-card${isDraft ? ' sponsor-draft' : ''}">
                    ${isDraft && window.isCurrentUserAdmin && !isClone ? `<div style="position:absolute; top:-8px; left:8px; background:#fb923c; color:white; padding:2px 8px; border-radius:8px; font-size:0.65rem; z-index:5; font-weight:bold;"><i class="fas fa-eye-slash"></i> BROUILLON</div>` : ''}
                    <a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
                        <img src="${escapeHtml(item.images?.[0] || '')}" alt="${escapeHtml(item.title || '')}" loading="lazy">
                    </a>
                    ${!isClone ? `<div class="admin-only hidden" style="position:absolute; top:5px; right:5px; display:flex; gap:5px; z-index:10;">
                        <button onclick="event.stopPropagation(); editItem('${section}', ${i})" style="background:rgba(0,210,255,0.9); border:none; color:white; width:28px; height:28px; border-radius:50%; cursor:pointer;"><i class="fas fa-edit"></i></button>
                        <button onclick="event.stopPropagation(); deleteItem('${section}', ${i})" style="background:rgba(239,68,68,0.9); border:none; color:white; width:28px; height:28px; border-radius:50%; cursor:pointer;"><i class="fas fa-trash"></i></button>
                    </div>` : ''}
                </div>`;
            };
            const originals = items.map((item, i) => makeCard(item, i, false)).join('');
            const clones = items.map((item, i) => makeCard(item, i, true)).join('');
            grid.innerHTML = `<div class="sponsors-track">${originals}${clones}</div>`;
        }
        // Rendu STANDARD (News, Events, Coach, Rates...)
        else {
            // Calculer le nombre total d'items pour désactiver les flèches aux extrémités
            const totalItems = items.length;

            grid.innerHTML = items.map((item, i) => {
                if (!item) return '';
                // Pour les news, utiliser _key si disponible (clé Firebase), sinon utiliser l'index
                const itemKey = item._key !== undefined ? item._key : ((section === 'news' || section === 'event') ? (items.length - 1 - i) : i);
                const isClickable = ['news', 'inst', 'coach', 'event', 'rates'].includes(section);
                const isFeatured = !!item.featured;
                const isDraft = !!item.draft;
                const cardClass = (section === 'coach' || section === 'rates') ? 'card-long' : 'card-standard';

                // Pour les news avec _key, utiliser openGalleryByKey, sinon openGallery classique
                const clickHandler = isClickable ? (item._key !== undefined && section === 'news' ? `openGalleryByKey('${section}', '${itemKey}')` : `openGallery('${section}', ${itemKey})`) : '';

                // Sections avec réorganisation possible
                const canReorder = ['news', 'event', 'rates'].includes(section);
                const isFirst = i === 0;
                const isLast = i === totalItems - 1;

                // Bouton de partage pour news et events (pas les brouillons)
                // URL avec paramètre pour lien direct vers l'item
                const shareUrl = `https://tennismontargis.fr?view=${section}_${itemKey}`;
                const shareBtn = (section === 'news' || section === 'event') && !isDraft ? `
                    <button onclick="event.stopPropagation(); shareContent('${escapeHtml(item.title || 'USM Tennis')}', '${escapeHtml((item.desc || '').substring(0, 100).replace(/'/g, ""))}...', '${shareUrl}')"
                            style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.6); border:none; color:white; width:36px; height:36px; border-radius:50%; cursor:pointer; backdrop-filter:blur(5px); border:1px solid rgba(255,255,255,0.2); z-index:6; display:flex; align-items:center; justify-content:center; transition:all 0.2s;"
                            onmouseover="this.style.background='rgba(0,210,255,0.8)'"
                            onmouseout="this.style.background='rgba(0,0,0,0.6)'"
                            title="Partager">
                        <i class="fas fa-share-alt" style="font-size:14px;"></i>
                    </button>
                ` : '';

                return `
                <article class="news-card ${cardClass} ${isFeatured ? 'featured-card' : ''} ${isDraft ? 'draft-card' : ''}" onclick="${clickHandler}" style="${isClickable ? 'cursor:pointer;' : ''}${isDraft ? 'opacity:0.7; border:2px dashed #fb923c;' : ''}">
                    ${isDraft && window.isCurrentUserAdmin ? `<div class="draft-badge" style="position:absolute; top:10px; right:10px; background:#fb923c; color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; z-index:5; font-weight:bold;"><i class="fas fa-eye-slash"></i> BROUILLON</div>` : ''}
                    ${!isDraft ? shareBtn : ''}
                    ${isFeatured ? `<div class="featured-badge">${section === 'news' ? 'À la une' : 'L\'offre première'}</div>` : ''}
                    <div class="news-card-inner">
                        ${(section === 'news' && item.date) ? `<div style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.6); color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; backdrop-filter:blur(5px); border:1px solid rgba(255,255,255,0.1); z-index:5;">${escapeHtml(item.date)}</div>` : ''}
                        ${item.images && item.images[0] ? `
                            <div class="news-img-wrapper" style="position:relative;">
                                <img src="${escapeHtml(item.images[0])}" alt="${escapeHtml(item.title || '')}" loading="lazy">
                                ${item.images.length > 1 ? `<div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); color:white; padding:5px 10px; border-radius:15px; font-size:0.8rem;"><i class="fas fa-images"></i> +${item.images.length - 1}</div>` : ''}
                            </div>
                        ` : ''}
                        <div class="news-content" style="padding:20px; flex-grow:1; display:flex; flex-direction:column;">
                            <h3 style="font-family:'Orbitron'; font-size:1.1rem; margin-bottom:10px; color:white; line-height:1.4;">${escapeHtml(item.title || '')}</h3>
                            <p style="font-size:0.9rem; color:#94a3b8; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:15px; flex-grow:1;">${formatText(item.desc || '')}</p>
                            ${section === 'rates' ? `<div style="margin-top:auto;"><div style="color:var(--tennis-yellow); font-weight:bold; font-size:1.2rem;">${escapeHtml(item.price || '')}</div><button onclick="event.stopPropagation(); contactForOffer('${escapeHtml(item.title || '').replace(/'/g, "\\'")}')" style="margin-top:12px; background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; border:none; padding:10px 20px; border-radius:25px; font-weight:bold; cursor:pointer; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px; transition:all 0.3s;"><i class="fas fa-envelope"></i> Nous contacter</button></div>` : ''}
                            ${item.url && section === 'sponsors' ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-cta" style="margin-top:auto; text-align:center; padding:8px;">Visiter</a>` : ''}
                        </div>

                        <!-- ADMIN BUTTONS OVERLAY -->
                        <div class="admin-only hidden" style="position:absolute; bottom:10px; right:10px; display:flex; gap:5px; z-index:10;">
                            ${canReorder ? `
                            <button onclick="event.stopPropagation(); moveItem('${section}', ${itemKey}, 'up')" style="background:${isFirst ? 'rgba(100,116,139,0.5)' : 'rgba(34,197,94,0.9)'}; border:none; color:white; width:35px; height:35px; border-radius:8px; cursor:${isFirst ? 'not-allowed' : 'pointer'};" title="Monter" ${isFirst ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                            <button onclick="event.stopPropagation(); moveItem('${section}', ${itemKey}, 'down')" style="background:${isLast ? 'rgba(100,116,139,0.5)' : 'rgba(34,197,94,0.9)'}; border:none; color:white; width:35px; height:35px; border-radius:8px; cursor:${isLast ? 'not-allowed' : 'pointer'};" title="Descendre" ${isLast ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                            ` : ''}
                            <button onclick="event.stopPropagation(); editItem('${section}', ${itemKey})" style="background:rgba(0,210,255,0.9); border:none; color:white; width:35px; height:35px; border-radius:8px; cursor:pointer;" title="Modifier"><i class="fas fa-edit"></i></button>
                            <button onclick="event.stopPropagation(); deleteItem('${section}', ${itemKey})" style="background:rgba(239,68,68,0.9); border:none; color:white; width:35px; height:35px; border-radius:8px; cursor:pointer;" title="Supprimer"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </article>
                `;
            }).join('');
        }

        // Apply admin visibility
        grid.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !window.isCurrentUserAdmin));
    }

    // --- UTILS ---
    function toggleAdminUI(isAdmin) {
        document.getElementById('admin-zone')?.classList.toggle('hidden', !isAdmin);
        const btnD = document.getElementById('admin-btn-desktop');
        if (btnD) {
            btnD.style.borderColor = isAdmin ? "#ff4444" : "#00d2ff";
            btnD.innerHTML = isAdmin ? '<i class="fas fa-lock-open"></i> Mode Admin' : '<i class="fas fa-user-shield"></i> Espace Club';
            btnD.onclick = isAdmin ? () => window.scrollTo(0, document.getElementById('admin-zone').offsetTop) : () => document.getElementById('login-modal').classList.remove('hidden');
        }
        document.querySelectorAll('.admin-actions').forEach(el => el.classList.toggle('hidden', !isAdmin));
    }

    window.openGallery = (section, index) => {
        const item = db[section][index];
        if (!item) return;

        // Stocker l'élément actuel pour le partage
        window.currentGalleryItem = { section: section, key: index };

        // Utiliser textContent pour le titre (pas innerHTML)
        document.getElementById('gallery-title').textContent = item.title || '';
        // Utiliser linkify qui échappe déjà le HTML
        document.getElementById('gallery-desc').innerHTML = linkify(item.desc || '');

        // Afficher prix + bouton contact si tarif
        const galleryRateInfo = document.getElementById('gallery-rate-info');
        if (galleryRateInfo) {
            if (section === 'rates' && item.price) {
                const safeTitle = escapeHtml(item.title || '');
                const safePrice = escapeHtml(item.price);
                galleryRateInfo.innerHTML = `
                    <div style="color:var(--tennis-yellow); font-weight:bold; font-size:1.8rem; font-family:'Orbitron'; margin-bottom:20px;">${safePrice}</div>
                    <button onclick="contactForOffer('${safeTitle.replace(/'/g, "\\'")}')"
                        style="background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; border:none; padding:15px 35px; border-radius:50px; font-weight:bold; cursor:pointer; font-size:1rem; display:inline-flex; align-items:center; gap:10px; transition:all 0.3s; box-shadow:0 4px 15px rgba(0,210,255,0.3);"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,210,255,0.4)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,210,255,0.3)';">
                        <i class="fas fa-envelope"></i> Nous contacter pour cette offre
                    </button>
                `;
                galleryRateInfo.style.display = 'block';
            } else {
                galleryRateInfo.innerHTML = '';
                galleryRateInfo.style.display = 'none';
            }
        }

        const galleryContent = document.getElementById('gallery-content');
        const imageCount = item.images?.length || 0;

        // Réinitialiser les classes
        galleryContent.classList.remove('single-image', 'two-images');

        // Ajouter la classe selon le nombre d'images
        if (imageCount === 1) {
            galleryContent.classList.add('single-image');
        } else if (imageCount === 2) {
            galleryContent.classList.add('two-images');
        }

        // Échapper les URLs des images
        galleryContent.innerHTML = item.images?.map((url, idx) => {
            const safeUrl = escapeHtml(url);
            return `<div class="gallery-item"><img src="${safeUrl}" onclick="openLightbox(${idx})" alt="Image"></div>`;
        }).join('') || '';

        document.getElementById('gallery-modal').classList.remove('hidden');
        window.openModalWithHistory('gallery-modal');
        clarityEvent('modal_gallery', { gallery_section: section });
    };

    // Ouvrir la galerie par clé Firebase (pour les news filtrées sur l'accueil)
    window.openGalleryByKey = (section, key) => {
        // Pour les news, on utilise allNews qui contient toutes les actualités avec leurs clés
        const item = section === 'news' ? window.allNews[key] : db[section][key];
        if (!item) return;

        // Stocker l'élément actuel pour le partage
        window.currentGalleryItem = { section: section, key: key };

        document.getElementById('gallery-title').textContent = item.title || '';
        document.getElementById('gallery-desc').innerHTML = linkify(item.desc || '');

        // Afficher prix + bouton contact si tarif
        const galleryRateInfo = document.getElementById('gallery-rate-info');
        if (galleryRateInfo) {
            if (section === 'rates' && item.price) {
                const safeTitle = escapeHtml(item.title || '');
                const safePrice = escapeHtml(item.price);
                galleryRateInfo.innerHTML = `
                    <div style="color:var(--tennis-yellow); font-weight:bold; font-size:1.8rem; font-family:'Orbitron'; margin-bottom:20px;">${safePrice}</div>
                    <button onclick="contactForOffer('${safeTitle.replace(/'/g, "\\'")}')"
                        style="background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; border:none; padding:15px 35px; border-radius:50px; font-weight:bold; cursor:pointer; font-size:1rem; display:inline-flex; align-items:center; gap:10px; transition:all 0.3s; box-shadow:0 4px 15px rgba(0,210,255,0.3);"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,210,255,0.4)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,210,255,0.3)';">
                        <i class="fas fa-envelope"></i> Nous contacter pour cette offre
                    </button>
                `;
                galleryRateInfo.style.display = 'block';
            } else {
                galleryRateInfo.innerHTML = '';
                galleryRateInfo.style.display = 'none';
            }
        }

        const galleryContent = document.getElementById('gallery-content');
        const imageCount = item.images?.length || 0;

        galleryContent.classList.remove('single-image', 'two-images');

        if (imageCount === 1) {
            galleryContent.classList.add('single-image');
        } else if (imageCount === 2) {
            galleryContent.classList.add('two-images');
        }

        galleryContent.innerHTML = item.images?.map((url, idx) => {
            const safeUrl = escapeHtml(url);
            return `<div class="gallery-item"><img src="${safeUrl}" onclick="openLightbox(${idx})" alt="Image"></div>`;
        }).join('') || '';

        document.getElementById('gallery-modal').classList.remove('hidden');
        window.openModalWithHistory('gallery-modal');
        clarityEvent('modal_gallery_key', { gallery_section: section });
    };

    // Contacter le club pour une offre tarif
    window.contactForOffer = (offerTitle) => {
        clarityEvent('contact_offer', { offer_title: offerTitle });
        // Fermer tous les modals ouverts (galerie, tous les tarifs)
        const galleryModal = document.getElementById('gallery-modal');
        const ratesModal = document.getElementById('all-rates-modal');
        if (galleryModal && !galleryModal.classList.contains('hidden')) {
            galleryModal.classList.add('hidden');
        }
        if (ratesModal && !ratesModal.classList.contains('hidden')) {
            ratesModal.classList.add('hidden');
        }
        document.body.style.overflow = '';
        window.currentOpenModal = null;

        // Petit délai pour laisser les modals se fermer
        setTimeout(() => {
            // Scroll vers le formulaire de contact
            const contactSection = document.getElementById('contact-section');
            if (contactSection) {
                contactSection.scrollIntoView({ behavior: 'smooth' });
            }

            // Pré-remplir le message
            setTimeout(() => {
                const messageField = document.getElementById('contact-message');
                if (messageField) {
                    messageField.value = `Bonjour,\n\nJe suis intéressé(e) par l'offre "${offerTitle}" et souhaiterais obtenir plus d'informations.\n\nCordialement,`;
                    messageField.focus();
                }
            }, 600);
        }, 300);
    };

    // Fermer la galerie
    window.closeGallery = () => {
        if (window.currentOpenModal === 'gallery-modal') {
            history.back(); // Utiliser le bouton retour pour fermer
        } else {
            document.getElementById('gallery-modal').classList.add('hidden');
        }
    };

    // --- LIGHTBOX (navigation images plein écran) ---
    let lightboxImages = [];
    let lightboxIndex = 0;

    window.openLightbox = (index) => {
        // Récupérer toutes les images de la galerie en cours
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        lightboxImages = Array.from(galleryContent.querySelectorAll('.gallery-item img')).map(img => img.src);
        if (lightboxImages.length === 0) return;

        lightboxIndex = index;
        const lightbox = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        img.src = lightboxImages[lightboxIndex];
        lightbox.classList.remove('hidden');
        updateLightboxNav();
        clarityEvent('lightbox_open');
    };

    window.closeLightbox = () => {
        document.getElementById('lightbox').classList.add('hidden');
    };

    window.lightboxNav = (dir) => {
        lightboxIndex += dir;
        if (lightboxIndex < 0) lightboxIndex = lightboxImages.length - 1;
        if (lightboxIndex >= lightboxImages.length) lightboxIndex = 0;
        const img = document.getElementById('lightbox-img');
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = lightboxImages[lightboxIndex];
            img.style.opacity = '1';
        }, 150);
        updateLightboxNav();
    };

    function updateLightboxNav() {
        const counter = document.getElementById('lightbox-counter');
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');
        if (counter) counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
        if (prevBtn) prevBtn.style.display = lightboxImages.length > 1 ? '' : 'none';
        if (nextBtn) nextBtn.style.display = lightboxImages.length > 1 ? '' : 'none';
        if (counter) counter.style.display = lightboxImages.length > 1 ? '' : 'none';
    }

    // Clavier : flèches + Escape
    document.addEventListener('keydown', (e) => {
        const lb = document.getElementById('lightbox');
        if (!lb || lb.classList.contains('hidden')) return;
        if (e.key === 'Escape') window.closeLightbox();
        if (e.key === 'ArrowLeft') window.lightboxNav(-1);
        if (e.key === 'ArrowRight') window.lightboxNav(1);
    });

    // Swipe tactile sur le lightbox
    (() => {
        const lb = document.getElementById('lightbox');
        if (!lb) return;
        let touchStartX = 0;
        let touchStartY = 0;
        lb.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        lb.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].screenX - touchStartX;
            const dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx > 0) window.lightboxNav(-1);
                else window.lightboxNav(1);
            }
        }, { passive: true });
    })();

    // --- CONTACT FORM ---
    emailjs.init("s6g88S5JA8ppy1GKg");
    document.getElementById('contact-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('contact-submit-btn');
        btn.disabled = true;
        try {
            const name = document.getElementById('contact-name').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const message = document.getElementById('contact-message').value.trim();

            // Envoi email via EmailJS
            await emailjs.sendForm('service_79xjawi', 'template_fcd7xgn', e.target);

            // Sauvegarde dans Firebase Database
            try {
                const db = firebase.database();
                await db.ref('contacts').push({
                    name,
                    email,
                    message,
                    date: new Date().toISOString(),
                    timestamp: Date.now(),
                    source: window.location.href
                });
            } catch (dbErr) {
                console.warn('Contact sauvegardé par email uniquement:', dbErr);
            }

            window.showSuccessMessage(
                'Message envoyé !',
                'Nous vous répondrons dans les plus brefs délais.'
            );
            clarityEvent('contact_form_submit');
            e.target.reset();
        } catch (error) {
            window.showErrorMessage(error, 'contact');
        } finally {
            btn.disabled = false;
        }
    });

    // --- MÉTÉO & SCROLL ---
    async function updateWeather() {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=47.9972&longitude=2.7333&current_weather=true`);
            const data = await res.json();
            document.getElementById('weather-temp').innerText = `${Math.round(data.current_weather.temperature)}°C`;
        } catch (e) { document.getElementById('weather-widget').style.display = 'none'; }
    }
    updateWeather();

    const btt = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => btt?.classList.toggle('show', window.scrollY > 500));
    btt?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // --- LEGAL MODAL ---
    window.openLegalModal = (type) => {
        const info = db.info || { address: "43 Avenue Louis Maurice Chautemps, 45200 Montargis", phone: "02 38 85 44 30", email: "usmmtennis@orange.fr" };
        const area = document.getElementById('legal-content-area');

        const contents = {
            'mentions': `
                <h2>Mentions Légales</h2>
                <h3>1. Présentation de l'association</h3>
                <p><strong>Nom :</strong> USM Tennis Montargis</p>
                <p><strong>Siège social :</strong> ${info.address}</p>
                <p><strong>Email :</strong> ${info.email}</p>
                <p><strong>Téléphone :</strong> ${info.phone}</p>
                <p><strong>Type :</strong> Association Loi 1901 affiliée à la FFT</p>
                <p><strong>Numéro d'affiliation FFT :</strong> [Votre Numéro d'Affiliation]</p>

                <h3>2. Hébergement</h3>
                <p><strong>Hébergeur :</strong> Google Cloud Platform (Firebase Hosting)</p>
                <p><strong>Adresse :</strong> 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA</p>

                <h3>3. Propriété intellectuelle</h3>
                <p>Le contenu du site (textes, images, logos) est la propriété exclusive de l'USM Tennis Montargis, sauf mention contraire. Toute reproduction, même partielle, est interdite sans autorisation préalable.</p>

                <h3>4. Médiation de la consommation</h3>
                <p>Conformément à l'article L.612-1 du Code de la consommation, en cas de litige, vous pouvez recourir gratuitement à un médiateur de la consommation. [Veuillez préciser ici les coordonnées de votre médiateur, ex: CM2C].</p>

                <h3>5. Accessibilité</h3>
                <p><strong>Accessibilité :</strong> Non conforme. Nous nous efforçons toutefois d'améliorer l'expérience utilisateur pour tous les publics.</p>

                <h3>6. Crédits</h3>
                <p><strong>Conception :</strong> USM Tennis Montargis</p>
                <p><strong>Photos :</strong> USM Tennis Montargis / FFT</p>
            `,
            'privacy': `
                <h2>Politique de Confidentialité (RGPD)</h2>
                <p>L'USM Tennis Montargis s'engage à ce que la collecte et le traitement de vos données soient conformes au Règlement Général sur la Protection des Données (RGPD).</p>

                <h3>1. Collecte des données</h3>
                <p>Via le formulaire de contact, nous collectons votre nom et votre adresse email. Ces informations sont transmises directement au secrétariat du club par email (via EmailJS) et ne sont pas stockées sur une base de données publique.</p>

                <h3>2. Finalité du traitement</h3>
                <p>Les données collectées servent exclusivement à traiter vos demandes de renseignements, inscriptions ou réservations. Elles ne sont jamais cédées ou vendues à des tiers.</p>

                <h3>3. Cookies</h3>
                <p>Ce site utilise des cookies techniques strictement nécessaires au fonctionnement de l'espace club (authentification). Aucun cookie de traçage publicitaire n'est utilisé.</p>

                <h3>4. Vos droits</h3>
                <p>Conformément à la loi "Informatique et Libertés", vous disposez d'un droit d'accès, de rectification et d'opposition aux données vous concernant. Pour l'exercer, contactez-nous à : <strong>${info.email}</strong>.</p>
            `
        };

        if (area) {
            area.innerHTML = contents[type] || "";
        }
        document.getElementById('legal-modal').classList.remove('hidden');
    };

    // --- MOBILE MENU LOGIC ---
    const mobileToggle = document.querySelector('.mobile-toggle');
    const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
    const mobileClose = document.querySelector('.mobile-close');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            mobileNavOverlay.classList.add('active');
        });
    }

    if (mobileClose) {
        mobileClose.addEventListener('click', () => {
            mobileNavOverlay.classList.remove('active');
        });
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileNavOverlay.classList.remove('active');
        });
    });

    // --- SCROLL REVEAL LOGIC ---
    setTimeout(() => {
        const revealElements = document.querySelectorAll('section, h2, .news-card, .btn-cta');
        revealElements.forEach(el => el.classList.add('reveal'));

        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1 });

        revealElements.forEach(el => revealObserver.observe(el));
    }, 500);

    // --- TEN'UP SMART DEEP LINKING ---
    const handleTenUpClick = (e) => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const url = "https://tenup.fft.fr";

        if (isMobile) {
            e.preventDefault();
            if (/Android/i.test(navigator.userAgent)) {
                const intentUrl = `intent://tenup.fft.fr#Intent;scheme=https;package=com.fft.tenup;S.browser_fallback_url=${encodeURIComponent(url)};end`;
                window.location.href = intentUrl;
            } else {
                window.location.assign(url);
            }
        }
    };

    const resBtnHeader = document.getElementById('btn-reserver-header');
    const resBtnMobile = document.getElementById('btn-reserver-mobile');
    if (resBtnHeader) resBtnHeader.addEventListener('click', handleTenUpClick);
    if (resBtnMobile) resBtnMobile.addEventListener('click', handleTenUpClick);

    // --- SHARING LOGIC ---
    const btnShare = document.getElementById('btn-share-app');
    if (btnShare) {
        btnShare.addEventListener('click', async () => {
            const shareData = {
                title: 'USM Tennis Montargis',
                text: 'Rejoins le club USM Tennis Montargis ! Infos, réservations et actus sur notre application officielle :',
                url: window.location.href
            };
            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.log('Share canceled');
                }
            } else {
                // Fallback pour desktop
                navigator.clipboard.writeText(window.location.href);
                window.showSuccessMessage('Lien copié !', 'Le lien a été copié dans le presse-papier.');
            }
        });
    }

    // --- QR CODE LOGIC ---
    const btnShowQr = document.getElementById('btn-show-qr');
    const qrModal = document.getElementById('qr-modal');
    const closeQr = document.getElementById('close-qr');
    let qrCodeObj = null;

    if (btnShowQr && qrModal) {
        btnShowQr.addEventListener('click', () => {
            qrModal.classList.remove('hidden');
            if (!qrCodeObj) {
                // Generate QR only once
                qrCodeObj = new QRCode(document.getElementById("qrcode"), {
                    text: window.location.href,
                    width: 200,
                    height: 200,
                    colorDark: "#020617",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        });

        closeQr.addEventListener('click', () => {
            qrModal.classList.add('hidden');
        });

        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) qrModal.classList.add('hidden');
        });
    }

    window.loginWithEmail = (email, password) => {
        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                window.showSuccessMessage('Connexion réussie !', 'Bienvenue dans l\'espace admin.');
                document.getElementById('login-modal').classList.add('hidden');
            })
            .catch(err => {
                window.showErrorMessage(err, 'login');
            });
    }

    // === CLEANUP LISTENERS (Prévention Memory Leaks) ===
    window.addEventListener('beforeunload', () => {
        if (window.firebaseListeners) {
            window.firebaseListeners.forEach(({ ref, callback, event }) => {
                ref.off(event, callback);
            });
            console.log('Firebase listeners cleaned up');
        }
    });

    // =============================================
    // SYSTÈME D'ARCHIVES DES ACTUALITÉS
    // =============================================

    // Variable pour stocker le filtre actuel
    window.currentMonthFilter = 'all';

    // Ouvrir le modal des archives
    window.openNewsArchives = () => {
        const modal = document.getElementById('news-archives-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Empêcher le scroll du body
            window.openModalWithHistory('news-archives-modal');
            window.currentMonthFilter = 'all';
            renderArchivesNews('all');

            // Reset le bouton actif
            document.querySelectorAll('.month-filter-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#e2e8f0';
            });
            const allBtn = document.querySelector('.month-filter-btn[data-month="all"]');
            if (allBtn) {
                allBtn.classList.add('active');
                allBtn.style.background = 'linear-gradient(135deg, #00d2ff, #00a8cc)';
                allBtn.style.color = '#020617';
            }
        }
    };

    // Fermer le modal des archives
    window.closeNewsArchives = () => {
        if (window.currentOpenModal === 'news-archives-modal') {
            history.back(); // Utiliser le bouton retour pour fermer
        } else {
            const modal = document.getElementById('news-archives-modal');
            if (modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }
    };

    // Filtrer les actualités par mois
    window.filterNewsByMonth = (month) => {
        window.currentMonthFilter = month;

        // Mettre à jour les boutons actifs
        document.querySelectorAll('.month-filter-btn').forEach(btn => {
            const btnMonth = btn.getAttribute('data-month');
            const isActive = (month === 'all' && btnMonth === 'all') || (btnMonth === String(month));

            if (isActive) {
                btn.classList.add('active');
                btn.style.background = 'linear-gradient(135deg, #00d2ff, #00a8cc)';
                btn.style.color = '#020617';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#e2e8f0';
            }
        });

        renderArchivesNews(month);
    };

    // Fonction pour parser la date d'une actualité
    function parseNewsDate(item) {
        if (item.createdAt) {
            return new Date(item.createdAt);
        } else if (item.date) {
            // Parser la date au format "JJ/MM/AAAA"
            const parts = item.date.split('/');
            if (parts.length === 3) {
                return new Date(parts[2], parts[1] - 1, parts[0]);
            }
            return new Date(item.date);
        }
        return null;
    }

    // Rendre la grille des archives
    function renderArchivesNews(monthFilter) {
        const grid = document.getElementById('archives-news-grid');
        const countEl = document.getElementById('archives-count');
        if (!grid) return;

        const allNews = window.allNews || {};
        let items = Object.entries(allNews)
            .filter(([key, item]) => item !== null)
            .map(([key, item]) => ({ ...item, _key: key }));

        // Filtrer les brouillons pour les non-admins
        if (!window.isCurrentUserAdmin) {
            items = items.filter(item => item.draft !== true);
        }

        // Filtrer par mois si nécessaire
        if (monthFilter !== 'all') {
            items = items.filter(item => {
                const date = parseNewsDate(item);
                if (!date) return false;
                return date.getMonth() === monthFilter;
            });
        }

        // Trier par date décroissante (plus récent en premier)
        items.sort((a, b) => {
            const dateA = parseNewsDate(a);
            const dateB = parseNewsDate(b);
            if (!dateA || !dateB) return 0;
            return dateB.getTime() - dateA.getTime();
        });

        // Mettre à jour le compteur
        if (countEl) {
            const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            if (monthFilter === 'all') {
                countEl.textContent = `${items.length} actualité${items.length > 1 ? 's' : ''} au total`;
            } else {
                countEl.textContent = `${items.length} actualité${items.length > 1 ? 's' : ''} en ${monthNames[monthFilter]}`;
            }
        }

        // Afficher un message si aucune actualité
        if (items.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px;">
                    <i class="fas fa-inbox" style="font-size:60px; color:#475569; margin-bottom:20px; display:block;"></i>
                    <p style="color:#94a3b8; font-size:1.1rem;">Aucune actualité pour cette période</p>
                </div>
            `;
            return;
        }

        // Générer les cartes
        grid.innerHTML = items.map((item, i) => {
            const isFeatured = !!item.featured;
            const isDraft = !!item.draft;
            const dateObj = parseNewsDate(item);
            const formattedDate = dateObj ? dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : (item.date || '');

            return `
            <article class="news-card card-standard ${isFeatured ? 'featured-card' : ''} ${isDraft ? 'draft-card' : ''}" onclick="openGalleryFromArchives('${item._key}')" style="cursor:pointer;${isDraft ? 'opacity:0.7; border:2px dashed #fb923c;' : ''}">
                ${isDraft && window.isCurrentUserAdmin ? `<div class="draft-badge" style="position:absolute; top:10px; right:10px; background:#fb923c; color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; z-index:5; font-weight:bold;"><i class="fas fa-eye-slash"></i> BROUILLON</div>` : ''}
                ${isFeatured ? `<div class="featured-badge">À la une</div>` : ''}
                <div class="news-card-inner">
                    ${formattedDate ? `<div style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.6); color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; backdrop-filter:blur(5px); border:1px solid rgba(255,255,255,0.1); z-index:5;">${escapeHtml(formattedDate)}</div>` : ''}
                    ${item.images && item.images[0] ? `
                        <div class="news-img-wrapper" style="position:relative;">
                            <img src="${escapeHtml(item.images[0])}" alt="${escapeHtml(item.title || '')}" loading="lazy">
                            ${item.images.length > 1 ? `<div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); color:white; padding:5px 10px; border-radius:15px; font-size:0.8rem;"><i class="fas fa-images"></i> +${item.images.length - 1}</div>` : ''}
                        </div>
                    ` : ''}
                    <div class="news-content" style="padding:20px; flex-grow:1; display:flex; flex-direction:column;">
                        <h3 style="font-family:'Orbitron'; font-size:1.1rem; margin-bottom:10px; color:white; line-height:1.4;">${escapeHtml(item.title || '')}</h3>
                        <p style="font-size:0.9rem; color:#94a3b8; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:15px; flex-grow:1;">${formatText(item.desc || '')}</p>
                    </div>
                </div>
            </article>
            `;
        }).join('');
    }

    // Ouvrir la galerie depuis les archives
    window.openGalleryFromArchives = (key) => {
        const item = window.allNews[key];
        if (!item) return;

        // Stocker l'élément actuel pour le partage
        window.currentGalleryItem = { section: 'news', key: key };

        // Utiliser textContent pour le titre (pas innerHTML)
        document.getElementById('gallery-title').textContent = item.title || '';
        // Utiliser linkify qui échappe déjà le HTML
        document.getElementById('gallery-desc').innerHTML = linkify(item.desc || '');

        const galleryContent = document.getElementById('gallery-content');
        const imageCount = item.images?.length || 0;

        // Réinitialiser les classes
        galleryContent.classList.remove('single-image', 'two-images');

        // Ajouter la classe selon le nombre d'images
        if (imageCount === 1) {
            galleryContent.classList.add('single-image');
        } else if (imageCount === 2) {
            galleryContent.classList.add('two-images');
        }

        // Échapper les URLs des images
        galleryContent.innerHTML = item.images?.map(url => {
            const safeUrl = escapeHtml(url);
            return `<div class="gallery-item"><img src="${safeUrl}" onclick="window.open('${safeUrl}', '_blank')" alt="Image"></div>`;
        }).join('') || '';

        document.getElementById('gallery-modal').classList.remove('hidden');
        window.openModalWithHistory('gallery-modal');
    };

    // Fermer les modales avec ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Fermer la galerie
            const galleryModal = document.getElementById('gallery-modal');
            if (galleryModal && !galleryModal.classList.contains('hidden')) {
                window.closeGallery();
                return;
            }
            // Fermer les archives
            const archivesModal = document.getElementById('news-archives-modal');
            if (archivesModal && !archivesModal.classList.contains('hidden')) {
                window.closeNewsArchives();
                return;
            }
            // Fermer les tarifs
            const ratesModal = document.getElementById('all-rates-modal');
            if (ratesModal && !ratesModal.classList.contains('hidden')) {
                window.closeAllRates();
                return;
            }
        }
    });

    // =============================================
    // SYSTÈME D'AFFICHAGE DE TOUS LES TARIFS
    // =============================================

    // Ouvrir le modal des tarifs
    window.openAllRates = () => {
        const modal = document.getElementById('all-rates-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            window.openModalWithHistory('all-rates-modal');
            renderAllRates();
            clarityEvent('modal_all_rates');
        }
    };

    // Fermer le modal des tarifs
    window.closeAllRates = () => {
        if (window.currentOpenModal === 'all-rates-modal') {
            history.back(); // Utiliser le bouton retour pour fermer
        } else {
            const modal = document.getElementById('all-rates-modal');
            if (modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }
    };

    // Rendre la grille de tous les tarifs
    function renderAllRates() {
        const grid = document.getElementById('all-rates-grid');
        const countEl = document.getElementById('rates-count');
        if (!grid) return;

        const allRates = window.allRates || {};
        let items = Array.isArray(allRates)
            ? allRates.map((item, index) => ({ ...item, _key: index }))
            : Object.entries(allRates)
                .filter(([key, item]) => item !== null)
                .map(([key, item]) => ({ ...item, _key: key }));

        // Filtrer les brouillons pour les non-admins
        if (!window.isCurrentUserAdmin) {
            items = items.filter(item => item && item.draft !== true);
        }

        // Mettre à jour le compteur
        if (countEl) {
            countEl.textContent = `${items.length} formule${items.length > 1 ? 's' : ''} disponible${items.length > 1 ? 's' : ''}`;
        }

        // Afficher un message si aucun tarif
        if (items.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px;">
                    <i class="fas fa-tags" style="font-size:60px; color:#475569; margin-bottom:20px; display:block;"></i>
                    <p style="color:#94a3b8; font-size:1.1rem;">Aucun tarif disponible pour le moment</p>
                </div>
            `;
            return;
        }

        // Stocker les items pour la navigation plein écran
        window._rateItems = items;

        // Générer les cartes
        grid.innerHTML = items.map((item, i) => {
            if (!item) return '';
            const isFeatured = !!item.featured;
            const isDraft = !!item.draft;

            return `
            <article class="news-card card-long ${isFeatured ? 'featured-card' : ''} ${isDraft ? 'draft-card' : ''}" onclick="openRateViewer(${i})" style="cursor:pointer;${isDraft ? 'opacity:0.7; border:2px dashed #fb923c;' : ''}">
                ${isDraft && window.isCurrentUserAdmin ? `<div class="draft-badge" style="position:absolute; top:10px; right:10px; background:#fb923c; color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; z-index:5; font-weight:bold;"><i class="fas fa-eye-slash"></i> BROUILLON</div>` : ''}
                ${isFeatured ? `<div class="featured-badge">L'offre première</div>` : ''}
                <div class="news-card-inner">
                    <div class="news-content" style="padding:20px; flex-grow:1; display:flex; flex-direction:column;">
                        <h3 style="font-family:'Orbitron'; font-size:1.1rem; margin-bottom:10px; color:white; line-height:1.4;">${escapeHtml(item.title || '')}</h3>
                        <p style="font-size:0.9rem; color:#94a3b8; display:-webkit-box; -webkit-line-clamp:10; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:15px; flex-grow:1;">${formatText(item.desc || '')}</p>
                        ${item.price ? `<div style="margin-top:auto;"><div style="color:var(--tennis-yellow); font-weight:bold; font-size:1.2rem;">${escapeHtml(item.price)}</div><button onclick="event.stopPropagation(); contactForOffer('${escapeHtml(item.title || '').replace(/'/g, "\\'")}')" style="margin-top:12px; background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; border:none; padding:10px 20px; border-radius:25px; font-weight:bold; cursor:pointer; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px; transition:all 0.3s;"><i class="fas fa-envelope"></i> Nous contacter pour cette offre</button></div>` : ''}
                    </div>
                </div>
            </article>
            `;
        }).join('');
    }

    // =============================================
    // RATE VIEWER - Navigation plein écran des tarifs
    // =============================================
    let rateViewerIndex = 0;

    window.openRateViewer = (index) => {
        const items = window._rateItems;
        if (!items || items.length === 0) return;
        rateViewerIndex = index;
        renderRateViewer();
        document.getElementById('rate-viewer').classList.remove('hidden');
        clarityEvent('rate_viewer_open');
    };

    window.closeRateViewer = () => {
        document.getElementById('rate-viewer').classList.add('hidden');
    };

    window.rateViewerNav = (dir) => {
        const items = window._rateItems;
        if (!items) return;
        rateViewerIndex += dir;
        if (rateViewerIndex < 0) rateViewerIndex = items.length - 1;
        if (rateViewerIndex >= items.length) rateViewerIndex = 0;
        renderRateViewer();
    };

    function renderRateViewer() {
        const items = window._rateItems;
        if (!items || !items[rateViewerIndex]) return;
        const item = items[rateViewerIndex];
        const container = document.getElementById('rate-viewer-content');
        const counter = document.getElementById('rate-viewer-counter');
        const prevBtn = document.getElementById('rate-viewer-prev');
        const nextBtn = document.getElementById('rate-viewer-next');

        if (counter) {
            counter.textContent = `${rateViewerIndex + 1} / ${items.length}`;
            counter.style.display = items.length > 1 ? '' : 'none';
        }
        if (prevBtn) prevBtn.style.display = items.length > 1 ? '' : 'none';
        if (nextBtn) nextBtn.style.display = items.length > 1 ? '' : 'none';

        const isFeatured = !!item.featured;
        const safeTitle = escapeHtml(item.title || '');
        const safePrice = escapeHtml(item.price || '');

        container.style.opacity = '0';
        setTimeout(() => {
            container.innerHTML = `
                ${isFeatured ? `<div style="text-align:center; margin-bottom:15px;"><span style="background:linear-gradient(135deg, #e3ff00, #c2db00); color:#020617; padding:6px 20px; border-radius:20px; font-weight:bold; font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;"><i class="fas fa-star" style="margin-right:6px;"></i>L'offre première</span></div>` : ''}
                ${item.images && item.images[0] ? `<div style="margin-bottom:20px; border-radius:15px; overflow:hidden; max-height:300px;"><img src="${escapeHtml(item.images[0])}" alt="${safeTitle}" style="width:100%; height:auto; object-fit:cover; display:block;"></div>` : ''}
                <h3 style="font-family:'Orbitron'; font-size:1.4rem; color:white; margin-bottom:15px; line-height:1.5; text-align:center;">${safeTitle}</h3>
                <div style="font-size:1rem; color:#cbd5e1; line-height:1.8; margin-bottom:25px;">${formatText(item.desc || '')}</div>
                ${safePrice ? `<div style="text-align:center; color:var(--tennis-yellow); font-weight:bold; font-size:2rem; font-family:'Orbitron'; margin-bottom:25px;">${safePrice}</div>` : ''}
                <div style="text-align:center;">
                    <button onclick="event.stopPropagation(); closeRateViewer(); contactForOffer('${safeTitle.replace(/'/g, "\\'")}')"
                        style="background:linear-gradient(135deg, #00d2ff, #00a8cc); color:#020617; border:none; padding:15px 35px; border-radius:50px; font-weight:bold; cursor:pointer; font-size:1rem; display:inline-flex; align-items:center; gap:10px; transition:all 0.3s; box-shadow:0 4px 15px rgba(0,210,255,0.3);"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,210,255,0.4)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,210,255,0.3)';">
                        <i class="fas fa-envelope"></i> Nous contacter pour cette offre
                    </button>
                </div>
            `;
            container.style.opacity = '1';
        }, 150);
    }

    // Clavier pour le rate viewer
    document.addEventListener('keydown', (e) => {
        const rv = document.getElementById('rate-viewer');
        if (!rv || rv.classList.contains('hidden')) return;
        if (e.key === 'Escape') { window.closeRateViewer(); e.stopImmediatePropagation(); }
        if (e.key === 'ArrowLeft') window.rateViewerNav(-1);
        if (e.key === 'ArrowRight') window.rateViewerNav(1);
    });

    // Swipe tactile pour le rate viewer
    (() => {
        const rv = document.getElementById('rate-viewer');
        if (!rv) return;
        let touchStartX = 0;
        let touchStartY = 0;
        rv.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        rv.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].screenX - touchStartX;
            const dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx > 0) window.rateViewerNav(-1);
                else window.rateViewerNav(1);
            }
        }, { passive: true });
    })();
});

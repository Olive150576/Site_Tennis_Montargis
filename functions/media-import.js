/* =====================================================================
   Import d'image par adresse (URL) pour l'admin du nouveau site.

   Le navigateur ne peut pas lire une image d'un autre site (CORS) pour la
   redimensionner : cette fonction la télécharge côté serveur et la renvoie
   à l'admin, qui la passe ensuite dans le circuit habituel (redimension
   1600/640 px en webp, envoi dans Storage). Rien n'est stocké ici.

   Garde-fous :
     • réservé aux administrateurs (admins/{uid}) ;
     • http(s) uniquement, ports 80/443, pas d'identifiants dans l'adresse ;
     • adresses internes refusées (localhost, réseaux privés, métadonnées
       Google Cloud…), y compris après chaque redirection (3 au maximum) ;
     • type image vérifié (en-tête ET premiers octets), 6 Mo au maximum
       (la réponse d'une fonction appelable est limitée à 10 Mo en base64) ;
     • 12 secondes au maximum.
   ===================================================================== */
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 3;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/* Adresse IP interdite : boucle locale, réseaux privés, lien local (dont 169.254.169.254, métadonnées), etc. */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||        // CGNAT
      (a === 169 && b === 254) ||                  // lien local / métadonnées
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff');
}

async function checkUrl(raw, HttpsError) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { throw new HttpsError('invalid-argument', 'Adresse invalide.'); }
  if (!/^https?:$/.test(u.protocol)) throw new HttpsError('invalid-argument', 'Seules les adresses http(s) sont acceptées.');
  if (u.username || u.password) throw new HttpsError('invalid-argument', 'Adresse refusée (identifiants intégrés).');
  if (u.port && !['80', '443'].includes(u.port)) throw new HttpsError('invalid-argument', 'Adresse refusée (port non standard).');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|metadata(\.google\.internal)?)$/i.test(host) || /\.(local|internal|localhost)$/i.test(host)) {
    throw new HttpsError('invalid-argument', 'Adresse interne refusée.');
  }
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); } catch (e) {
    throw new HttpsError('not-found', 'Site introuvable : vérifiez l\'adresse.');
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpsError('invalid-argument', 'Adresse interne refusée.');
  return u;
}

/* Signature des premiers octets (on ne se fie pas qu'à l'en-tête Content-Type) */
function sniff(buf) {
  if (buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(4, 12).toString('ascii') === 'ftypavif' || buf.slice(4, 12).toString('ascii') === 'ftypavis') return 'image/avif';
  return '';
}

module.exports = ({ functions, admin }) => {
  const { HttpsError } = functions.https;

  const fetchRemoteImage = functions.runWith({ timeoutSeconds: 30, memory: '256MB' }).https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const isAdmin = (await admin.database().ref(`admins/${context.auth.uid}`).once('value')).exists();
    if (!isAdmin) throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');

    let u = await checkUrl(data && data.url, HttpsError);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      let res;
      for (let i = 0; ; i++) {
        res = await fetch(u.href, {
          redirect: 'manual', signal: ctrl.signal,
          headers: { 'User-Agent': 'USM-Tennis-Montargis-admin/1.0 (import image)', Accept: 'image/*' }
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          if (i >= MAX_REDIRECTS) throw new HttpsError('failed-precondition', 'Trop de redirections.');
          u = await checkUrl(new URL(res.headers.get('location'), u).href, HttpsError);
          continue;
        }
        break;
      }
      if (!res.ok) throw new HttpsError('not-found', `Le site a répondu ${res.status} : image introuvable ou protégée.`);
      const declared = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (declared && !declared.startsWith('image/')) {
        throw new HttpsError('failed-precondition', 'Cette adresse n\'est pas une image (c\'est sans doute une page web). Faites un clic droit sur l\'image › « Copier l\'adresse de l\'image ».');
      }
      if (+res.headers.get('content-length') > MAX_BYTES) throw new HttpsError('failed-precondition', 'Image trop lourde (6 Mo au maximum).');

      const reader = res.body.getReader();
      const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { ctrl.abort(); throw new HttpsError('failed-precondition', 'Image trop lourde (6 Mo au maximum).'); }
        chunks.push(Buffer.from(value));
      }
      const buf = Buffer.concat(chunks);
      const type = sniff(buf);
      if (!TYPES.includes(type)) throw new HttpsError('failed-precondition', 'Format non reconnu : JPG, PNG, WebP, GIF ou AVIF uniquement.');
      const name = decodeURIComponent((u.pathname.split('/').pop() || 'image')).slice(0, 80);
      return { contentType: type, name, size: buf.length, data: buf.toString('base64') };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e.name === 'AbortError') throw new HttpsError('deadline-exceeded', 'Le site met trop de temps à répondre.');
      console.error('fetchRemoteImage', e);
      throw new HttpsError('unavailable', 'Impossible de récupérer cette image.');
    } finally {
      clearTimeout(timer);
    }
  });

  return { fetchRemoteImage, _test: { isPrivateIp, sniff } };
};

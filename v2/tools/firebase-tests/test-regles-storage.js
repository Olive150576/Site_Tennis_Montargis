const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-usm', storage: { rules: fs.readFileSync(__dirname + '/../../firebase/storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 } });
  const R = []; const t = async (n, p, ok) => { try { await (ok ? assertSucceeds(p) : assertFails(p)); R.push(1); console.log('✅ ' + n); } catch (e) { R.push(0); console.log('❌ ' + n + ' — ' + e.message.split('\n')[0]); } };
  const img = Buffer.from('RIFF0000WEBPVP8 ');
  const adm = env.authenticatedContext('a1', { admin: true }).storage(), usr = env.authenticatedContext('u1').storage(), anon = env.unauthenticatedContext().storage();
  await t('Admin (claim admin) : envoie une image site_v2', adm.ref('site_v2/images/x/lg.webp').put(img, { contentType: 'image/webp' }), true);
  await t('Admin : envoie un PDF site_v2', adm.ref('site_v2/documents/f.pdf').put(Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' }), true);
  await t('Admin : fichier d\'un autre type refusé', adm.ref('site_v2/documents/x.exe').put(Buffer.from('MZ'), { contentType: 'application/x-msdownload' }), false);
  await t('Membre sans claim admin : refusé', usr.ref('site_v2/images/y.webp').put(img, { contentType: 'image/webp' }), false);
  await t('Visiteur : lit une image site_v2', anon.ref('site_v2/images/x/lg.webp').getDownloadURL(), true);
  await t('Dossier images/ du site actuel inchangé (visiteur ne peut pas écrire)', anon.ref('images/z.jpg').put(img, { contentType: 'image/jpeg' }), false);
  await env.cleanup(); console.log(`${R.filter(Boolean).length}/${R.length} règles Storage`); process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

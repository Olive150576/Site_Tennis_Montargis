import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { ref, get, set, update, remove, push, increment } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-usm', database: { rules: readFileSync(new URL('../../../database.rules.json', import.meta.url),'utf8'), host:'127.0.0.1', port:9000 } });
await env.clearDatabase();
await env.withSecurityRulesDisabled(async c => { const db=c.database(); await set(ref(db,'/'),{
  admins:{ADM:true}, coaches:{COA:true},
  members:{ M1:{prenom:'A',nom:'B',email:'a@b.fr',telephone:'0601020304',classement:'30',actif:true,classementHistory:{h:{from:'40',to:'30',at:1}}},
            M2:{prenom:'C',nom:'D',email:'c@d.fr',telephone:'0605060708',classement:'15',actif:true} },
  contacts:{c1:{name:'x',email:'x@y.fr',message:'m',date:'d',timestamp:1}},
  scans:{M1:{s1:{t:1}}}, qr_scans:{accueil:{total:10,par_jour:{'2026-10-30':3}}} }); });
const anon=env.unauthenticatedContext().database(), m2=env.authenticatedContext('M2').database(), m1=env.authenticatedContext('M1').database(),
      adm=env.authenticatedContext('ADM').database(), coa=env.authenticatedContext('COA').database(), rnd=env.authenticatedContext('RANDOM').database();
let passed=0;
const T=[
 ['anon efface tous les contacts', ()=>remove(ref(anon,'contacts'))],
 ['anon écrase un contact', ()=>set(ref(anon,'contacts/c1'),{name:'h',email:'h@h.fr',message:'x',date:'d',timestamp:Date.now()})],
 ['anon efface les scans de M1', ()=>remove(ref(anon,'scans/M1'))],
 ['anon remet compteur QR à 0', ()=>set(ref(anon,'qr_scans/accueil/total'),0)],
 ['membre M2 lit fiche complète de M1', ()=>get(ref(m2,'members/M1'))],
 ['membre M2 lit email de M1', ()=>get(ref(m2,'members/M1/email'))],
 ['membre M2 lit historique de M1', ()=>get(ref(m2,'members/M1/classementHistory'))],
 ['compte non-membre lit téléphone M1', ()=>get(ref(rnd,'members/M1/telephone'))],
];
const OK=[
 ['admin lit contacts', ()=>get(ref(adm,'contacts'))],
 ['admin supprime un contact', ()=>remove(ref(adm,'contacts/c1'))],
 ['anon ajoute un scan (verify)', ()=>push(ref(anon,'scans/M1'),{t:Date.now()})],
 ['anon incrémente QR (qr-accueil)', ()=>update(ref(anon,'qr_scans/accueil'),{total:increment(1),['par_jour/2026-10-30']:increment(1)})],
 ['anon incrémente QR nouveau jour', ()=>update(ref(anon,'qr_scans/accueil'),{total:increment(1),['par_jour/2026-10-31']:increment(1)})],
 ['membre M2 lit prénom/nom/classement de M1', ()=>Promise.all(['prenom','nom','classement'].map(f=>get(ref(m2,'members/M1/'+f))))],
 ['membre M2 lit téléphone de M1 (convocations)', ()=>get(ref(m2,'members/M1/telephone'))],
 ['membre M1 lit sa fiche complète', ()=>get(ref(m1,'members/M1'))],
 ['coach lit fiche complète M1', ()=>get(ref(coa,'members/M1'))],
 ['admin lit tous les membres', ()=>get(ref(adm,'members'))],
 ['anon lit prénom public (verify)', ()=>get(ref(anon,'members/M1/prenom'))],
 ['M1 modifie son téléphone', ()=>set(ref(m1,'members/M1/telephone'),'0611111111')],
];
for (const [n,f] of T){ try{await f(); console.log('❌ AUTORISÉ :',n);}catch(e){passed++;console.log('✅ bloqué  :',n);} }
for (const [n,f] of OK){ try{await f(); passed++; console.log('✅ marche  :',n);}catch(e){console.log('❌ CASSÉ   :',n, e.message.slice(0,80));} }
await env.cleanup();
const ko=[...T,...OK].length-passed; console.log(`${passed}/${T.length+OK.length} contrôles d'audit`); if(ko) process.exit(1);

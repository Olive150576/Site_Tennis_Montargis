// Audit des débordements de texte en largeur téléphone (pages publiques, contenu réel en lecture)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const V2 = process.argv[2] || require('path').resolve(__dirname, '../..'); const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const pages = ['index.html', 'le-club.html', 'ecole-de-tennis.html', 'competition.html', 'tarifs.html', 'agenda.html', 'actualites.html', 'partenaires.html', 'contact.html', 'mentions-legales.html', 'confidentialite.html', '404.html', 'espace-membre.html'];
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(V2, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8080, '127.0.0.1');
  const b = await chromium.launch(); let total = 0;
  for (const w of [320, 360, 390, 430]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } }); const p = await ctx.newPage();
    for (const pg of pages) {
      await p.goto('http://127.0.0.1:8080/' + pg); await p.waitForTimeout(2500);
      const res = await p.evaluate(() => {
        const out = []; const W = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > W + 1) out.push('PAGE scrollWidth ' + document.documentElement.scrollWidth + ' > ' + W);
        const sel = '.event, .event-detail, .card, .rate, .player, .panel, .page-hero, .hero, .path, .coach, .sponsor, .pack, .faq-item, .news-card, article';
        document.querySelectorAll('h1,h2,h3,p,span,a,b,strong,li,button,small,div.meta').forEach((el) => {
          if (!el.offsetParent || el.closest('[aria-hidden="true"]')) return;
          const card = el.parentElement && el.parentElement.closest(sel); if (!card) return;
          const r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
          const cs = getComputedStyle(card); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
          if (r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1)) out.push((card.className.split(' ')[0] || card.tagName) + ' > ' + el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] + ' « ' + (el.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ') + ' » +' + Math.round(Math.max(r.right - c.right, c.left - r.left)) + 'px');
        });
        // texte coupé dans son propre bloc (mot trop long)
        document.querySelectorAll('h1,h2,h3').forEach((el) => { if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) out.push('TITRE coupé ' + el.tagName + ' « ' + el.innerText.trim().slice(0, 40).replace(/\s+/g, ' ') + ' » ' + el.scrollWidth + '>' + el.clientWidth); });
        return [...new Set(out)];
      });
      res.forEach((x) => { total++; console.log(w + 'px ' + pg + ' : ' + x); });
    }
    await ctx.close();
  }
  console.log('TOTAL ' + total); await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });

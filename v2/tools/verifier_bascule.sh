#!/usr/bin/env bash
# Vérifie les adresses clés du site assemblé (répétition ou jour J).
#   bash v2/tools/verifier_bascule.sh https://usm-tennis--bascule-xxxx.web.app
#   bash v2/tools/verifier_bascule.sh https://tennismontargis.fr
B="${1:-http://127.0.0.1:5000}"; B="${B%/}"; KO=0
t() { local path="$1" exp="$2" pat="$3" code
  code=$(curl -sL -o /tmp/usm_b -w '%{http_code}' "$B$path")
  if [ "$code" = "$exp" ] && { [ -z "$pat" ] || grep -q -- "$pat" /tmp/usm_b; }; then echo "✅ $path → $code ${pat:+(« $pat »)}"; else echo "❌ $path → $code (attendu $exp ${pat:+/ « $pat »})"; KO=1; fi; }
echo "== Nouveau site"
t / 200 "Club de tennis à Montargis"
t /tarifs 200 "Tarifs et inscription"
t /le-club 200 "Le club et ses installations"
t /actualites 200 "Actualités"
t /agenda 200 "Agenda"
t /contact 200 "Contact"
t /page-inexistante 404 "Page introuvable"
t /espace-membre.html 200 "USM_MEMBER_DEMO_MODE"
t /espace-membre.html 200 "manifest-membre.json"
t /admin/ 200 "Administration"
t /sw.js 200 "usm-v2-1"
echo "== Gardé de l'ancien site"
t /admin-panel.html 200 ""
t /v/TEST 200 "verify"
t /qr-accueil 200 "qr_scans"
t /manifest-membre.json 200 "espace-membre"
t /admin.min.js 200 ""
r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/inscription"); echo "$r" | grep -q "^302 https://firebasestorage" && echo "✅ /inscription → formulaire PDF" || { echo "❌ /inscription → $r"; KO=1; }
echo "== Ne doit PAS être publié"
for p in /functions/index.js /v2/index.html /database.rules.json /storage.rules /package.json /admin.js /member.js /GIT_WORKFLOW.md; do
  c=$(curl -s -o /tmp/usm_b -w '%{http_code}' "$B$p"); if [ "$c" = 404 ] || grep -qi "<!doctype html" /tmp/usm_b; then echo "✅ $p non publié"; else echo "❌ $p PUBLIÉ ($c)"; KO=1; fi; done
case "$B" in *tennismontargis.fr*|*usm-tennis.web.app*) curl -sI "$B/" | grep -qi "x-robots-tag" && { echo "❌ noindex présent sur le site principal"; KO=1; } || echo "✅ site indexable (pas de noindex)";; esac
[ $KO = 0 ] && echo "TOUT EST BON" || echo "PROBLÈME(S) CI-DESSUS"; exit $KO

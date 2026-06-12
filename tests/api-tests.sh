#!/usr/bin/env bash
# Usage: BASE_URL=https://<preview>.vercel.app bash tests/api-tests.sh
set -u
BASE_URL="${BASE_URL:?BASE_URL requis}"
pass=0; failed=0
check() { # check <desc> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1";
  else failed=$((failed+1)); echo "FAIL  $1 (attendu $2, obtenu $3)"; fi
}

# 1. Login mauvais mot de passe -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}')
check "login mauvais mdp -> 401" 401 "$code"

# 2. Rate limit login: 5 essais de plus -> 429
for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}'; done
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/admin?action=login" \
  -H 'Content-Type: application/json' -d '{"password":"mauvais"}')
check "rate limit login -> 429" 429 "$code"

# 3. Action admin sans token -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/admin?action=get-content")
check "admin sans token -> 401" 401 "$code"

# 4. Ancien exploit: mot de passe utilisé comme token -> 401
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/admin?action=get-content" \
  -H "Authorization: Bearer ${ADMIN_PASSWORD:-placeholder}")
check "password-comme-token -> 401" 401 "$code"

# 5. Checkout supprimé -> 404
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/checkout")
check "checkout supprimé -> 404" 404 "$code"

# 6. Témoignage trop long -> 400
long=$(python3 -c "print('x'*2001)")
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/testimonial" \
  -H 'Content-Type: application/json' -d "{\"name\":\"t\",\"textFr\":\"$long\"}")
check "témoignage 2001 chars -> 400" 400 "$code"

# 7. Headers de sécurité présents sur l'accueil
hdrs=$(curl -sI "$BASE_URL/")
echo "$hdrs" | grep -qi 'x-frame-options: DENY';        check "X-Frame-Options" 0 $?
echo "$hdrs" | grep -qi 'x-content-type-options';       check "X-Content-Type-Options" 0 $?
echo "$hdrs" | grep -qiE 'content-security-policy:'; check "CSP bloquante" 0 $?

# 8. Contenu public toujours accessible
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/content")
check "GET /api/content -> 200" 200 "$code"

echo; echo "$pass pass, $failed fail"
exit $failed

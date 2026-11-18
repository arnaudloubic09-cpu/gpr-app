#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Déploiement sur le serveur (lancé par GitHub Actions, workflow « Déployer la préproduction »).
# Idempotent : peut être relancé autant de fois que nécessaire.
#
#   Code de l'application : /opt/gpr/app    (remplacé à chaque déploiement)
#   État du serveur      : /opt/gpr/state  (secrets générés ici, jamais transmis ailleurs)
#
# Variables attendues (fournies par le workflow) :
#   GPR_ENV            preproduction | production
#   BASE_DOMAIN        ex. gpr-padel.fr
#   ACME_EMAIL         email pour les certificats HTTPS
#   WEBAPP             true pour publier la version web de l'app joueur
#   SEED_DEMO          true pour charger les clubs et joueurs de démonstration (si base vide)
#   ADMIN_EMAIL        (facultatif) crée ce compte super admin s'il n'existe pas
#   Fichier /opt/gpr/state/smtp.env : SMTP_USER / SMTP_PASS (envoyé par le workflow)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP=/opt/gpr/app
STATE=/opt/gpr/state
GPR_ENV=${GPR_ENV:-preproduction}
BASE_DOMAIN=${BASE_DOMAIN:?BASE_DOMAIN requis}
PREFIX=$([ "$GPR_ENV" = production ] && echo "" || echo "preprod.")
API_DOMAIN="api.${PREFIX}${BASE_DOMAIN}"
ADMIN_DOMAIN="admin.${PREFIX}${BASE_DOMAIN}"
APP_DOMAIN="app.${PREFIX}${BASE_DOMAIN}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# 1. Docker (premier déploiement uniquement)
if ! command -v docker >/dev/null 2>&1; then
  log "Installation de Docker"
  # Script officiel Docker ; si la version d'Ubuntu n'est pas encore prise en charge (ex. toute nouvelle
  # version), repli sur les paquets Docker fournis par Ubuntu.
  if ! curl -fsSL https://get.docker.com | sudo sh; then
    log "Repli : paquets Docker d'Ubuntu"
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose-v2 || sudo apt-get install -y docker.io docker-compose-plugin
    sudo systemctl enable --now docker
  fi
fi
sudo docker compose version >/dev/null 2>&1 || { echo "Docker Compose introuvable après installation"; exit 1; }
DOCKER="sudo docker"

# 2. Pare-feu du système : ouvre 80/443 si des règles les bloquent (ex. images Ubuntu d'Oracle Cloud ; sans effet chez OVH)
if command -v iptables >/dev/null 2>&1; then
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi
fi

# 3. Mémoire d'échange si le serveur a peu de RAM (les builds en ont besoin)
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 6000 ] && ! sudo swapon --show | grep -q /swapfile; then
  log "Ajout de 4 Go de mémoire d'échange"
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 4. Secrets générés UNE FOIS sur le serveur (ne quittent jamais le serveur)
sudo mkdir -p "$STATE/sites" && sudo chown -R "$USER" "$STATE" && chmod 700 "$STATE"
if [ ! -f "$STATE/secrets.env" ]; then
  log "Génération des secrets de l'application"
  rand() { openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'; }
  umask 077
  cat > "$STATE/secrets.env" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(rand)
OTP_PEPPER=$(rand)
CONNECTOR_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
EOF
fi
[ -f "$STATE/smtp.env" ] || { echo "smtp.env manquant (secrets PREPROD_SMTP_* dans GitHub)"; exit 1; }
# shellcheck disable=SC1091
set -a; . "$STATE/secrets.env"; . "$STATE/smtp.env"; set +a

# 5. Configuration de l'environnement
CORS="https://${ADMIN_DOMAIN}"
[ "${WEBAPP:-false}" = true ] && CORS="${CORS},https://${APP_DOMAIN}"
umask 077
cat > "$STATE/.env" <<EOF
GPR_ENV=${GPR_ENV}
GPR_ENV_FILE=${STATE}/.env
GPR_STATE_DIR=${STATE}
API_DOMAIN=${API_DOMAIN}
ADMIN_DOMAIN=${ADMIN_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://gpr:${POSTGRES_PASSWORD}@postgres:5432/gpr?schema=public
CORS_ORIGINS=${CORS}
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
OTP_PEPPER=${OTP_PEPPER}
CONNECTOR_ENCRYPTION_KEY=${CONNECTOR_ENCRYPTION_KEY}
SMTP_HOST=${SMTP_HOST:-smtp-relay.brevo.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM="GPR <no-reply@${BASE_DOMAIN}>"
JOBS_ENABLED=true
SYNC_LOOKBACK_DAYS=7
PUSH_PROVIDER=log
API_PORT=3000
EOF

# Version web de l'app joueur (préproduction)
PROFILES=()
if [ "${WEBAPP:-false}" = true ]; then
  PROFILES=(--profile webapp)
  cat > "$STATE/sites/app.caddy" <<EOF
${APP_DOMAIN} {
	encode gzip
	reverse_proxy webapp:80
}
EOF
else
  rm -f "$STATE/sites/app.caddy"
fi

COMPOSE=($DOCKER compose -f "$APP/deploy/docker-compose.yml" --env-file "$STATE/.env" "${PROFILES[@]}")

# 6. Construction et démarrage
log "Construction et démarrage des services (${GPR_ENV})"
"${COMPOSE[@]}" up -d --build --remove-orphans

log "Migrations de la base de données"
for i in $(seq 1 20); do
  "${COMPOSE[@]}" exec -T postgres pg_isready -U gpr >/dev/null 2>&1 && break
  sleep 3
done
"${COMPOSE[@]}" run --rm api npx prisma migrate deploy

# 7. Données de démonstration (préproduction, base vide uniquement)
if [ "${SEED_DEMO:-false}" = true ] && [ "$GPR_ENV" != production ]; then
  clubs=$("${COMPOSE[@]}" exec -T postgres psql -U gpr -d gpr -tAc 'SELECT count(*) FROM "Club"' | tr -d '[:space:]')
  if [ "$clubs" = "0" ]; then
    log "Chargement des clubs et joueurs de démonstration"
    "${COMPOSE[@]}" run --rm api node dist/cli/seed.js
  fi
fi

# 8. Compte super admin
if [ -n "${ADMIN_EMAIL:-}" ]; then
  log "Compte super admin"
  "${COMPOSE[@]}" run --rm api node dist/cli/create-admin.js "$ADMIN_EMAIL" || true
fi

# 9. Vérification
log "Vérification de l'API"
"${COMPOSE[@]}" restart caddy >/dev/null
for i in $(seq 1 30); do
  if curl -fsS "https://${API_DOMAIN}/health" >/dev/null 2>&1; then
    echo "✓ https://${API_DOMAIN}/health répond"
    break
  fi
  [ "$i" = 30 ] && echo "⚠ L'API ne répond pas encore en HTTPS (DNS ou certificat en cours ?). Vérifier : https://${API_DOMAIN}/health"
  sleep 5
done

# Nettoyage des anciennes images et du cache de construction (le disque ne se remplit pas avec le temps)
$DOCKER image prune -f >/dev/null 2>&1 || true
$DOCKER builder prune -f --filter until=168h >/dev/null 2>&1 || true

"${COMPOSE[@]}" ps
cat <<EOF

────────────────────────────────────────────────
 Back-office : https://${ADMIN_DOMAIN}
$( [ "${WEBAPP:-false}" = true ] && echo " App joueur  : https://${APP_DOMAIN}" )
 API         : https://${API_DOMAIN}/health
────────────────────────────────────────────────
EOF

#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (si la base n'est PAS managée).
# À planifier sur le serveur : 0 2 * * * /opt/gpr/deploy/backup.sh
# Conserve 30 jours. Copier ensuite les fichiers hors du serveur (stockage objet UE).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
file="backups/gpr-$(date +%Y%m%d-%H%M).sql.gz"
docker compose -f docker-compose.yml --env-file .env exec -T postgres pg_dump -U gpr gpr | gzip > "$file"
find backups -name 'gpr-*.sql.gz' -mtime +30 -delete
echo "Sauvegarde : $file"

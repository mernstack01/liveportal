#!/usr/bin/env sh
# PostgreSQL zaxira nusxasi: deploy/backups/liveportal-YYYY-MM-DD_HHMM.sql.gz, 14 kundan eskisi o'chiriladi.
# Serverda cron (har kuni 03:00):
#   0 3 * * * cd /opt/liveportal/deploy && ./backup.sh >> backups/backup.log 2>&1
# Tiklash:
#   gunzip -c backups/<fayl>.sql.gz | docker compose -f compose.prod.yml exec -T postgres psql -U liveportal -d liveportal
set -eu
cd "$(dirname "$0")"
mkdir -p backups
file="backups/liveportal-$(date +%Y-%m-%d_%H%M).sql.gz"
docker compose -f compose.prod.yml exec -T postgres pg_dump -U liveportal --clean --if-exists liveportal | gzip > "$file"
# Chat fayllari (volume) ham arxivlanadi.
docker compose -f compose.prod.yml exec -T api tar -czf - -C /data uploads > "backups/uploads-$(date +%Y-%m-%d_%H%M).tar.gz"
find backups \( -name 'liveportal-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete
echo "$(date '+%F %T') zaxira: $file ($(du -h "$file" | cut -f1))"

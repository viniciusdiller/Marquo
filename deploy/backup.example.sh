#!/usr/bin/env bash
# Backup do Marquo: banco (pg_dump) + imagens enviadas pelos negócios (apps/backend/uploads).
# Copie para /usr/local/bin/marquo-backup.sh, ajuste as variáveis, `chmod 700` e agende no cron (veja deploy/README.md).
#
# Senha do banco: NÃO coloque aqui. Use ~/.pgpass (chmod 600) com a linha  host:porta:banco:usuario:senha
# Cópia FORA do servidor: um backup que mora na mesma máquina some junto com ela. Configure OFFSITE_REMOTE (rclone).
set -euo pipefail
umask 077

DB_NAME="${DB_NAME:-marquo_app}"            # TROQUE se o nome for outro
DB_USER="${DB_USER:-app_user}"              # TROQUE
DB_HOST="${DB_HOST:-localhost}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/www/marquo/apps/backend/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/marquo}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"        # ex.: meubucket:marquo-backups  (remoto configurado com `rclone config`)

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] iniciando backup $STAMP"

# Formato custom: compacto e permite restaurar tabelas isoladas com pg_restore.
pg_dump --format=custom --no-owner --host="$DB_HOST" --username="$DB_USER" --dbname="$DB_NAME" \
  --file="$BACKUP_DIR/db-$STAMP.dump"

if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
else
  echo "aviso: $UPLOADS_DIR não existe; backup de uploads ignorado" >&2
fi

# Descarta cópias locais antigas.
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

if [ -n "$OFFSITE_REMOTE" ]; then
  rclone copy "$BACKUP_DIR" "$OFFSITE_REMOTE" --max-age 2d
  echo "cópia externa enviada para $OFFSITE_REMOTE"
else
  echo "aviso: OFFSITE_REMOTE não definido; backup só existe neste servidor" >&2
fi

echo "[$(date -Is)] backup concluído: db-$STAMP.dump"

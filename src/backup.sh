#!/bin/sh

BACKUP_DIR="/backup"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

# delete old backups
find "$BACKUP_DIR" -type f -name "backup_*.sql.gz" -mtime +7 -delete

# dump + compression
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER \
--exclude-table=network_devices \
$DB_DATABASE | gzip -9 > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup completed: $BACKUP_FILE"
    echo "$BACKUP_FILE"
    exit 0
else
    echo "Backup failed"
    exit 1
fi
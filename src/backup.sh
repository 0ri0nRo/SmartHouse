#!/bin/sh

BACKUP_DIR="/backup"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup.sql"

# Crea la directory di backup se non esiste
mkdir -p $BACKUP_DIR

# Cancella i backup più vecchi di 7 giorni prima di crearne uno nuovo
find $BACKUP_DIR -type f -name "backup_*.sql" -mtime +7 -exec rm {} \;

# Esegui il backup escludendo la tabella "network_devices"
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER --exclude-table=network_devices $DB_DATABASE > $BACKUP_FILE

# Verifica se il backup è andato a buon fine
if [ $? -eq 0 ]; then
    echo "Backup completato con successo. File salvato in: $BACKUP_FILE"
    exit 0
else
    echo "Errore durante il backup!"
    exit 1
fi
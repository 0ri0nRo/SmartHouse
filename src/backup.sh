#!/bin/sh

# Variabili
BACKUP_DIR="/backup"      # Montato nel container, percorso assoluto
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql"

# Crea la directory di backup se non esiste
mkdir -p "$BACKUP_DIR"

# Cancella tutto il contenuto della directory di backup
rm -f "$BACKUP_DIR"/*

# Esegui il backup escludendo la tabella "network_devices"
PGPASSWORD=1234 pg_dump -h db -U postgres --exclude-table=network_devices sensor_data > "$BACKUP_FILE"

# Rimuovi i backup più vecchi di 7 giorni
find "$BACKUP_DIR" -type f -name "*.sql" -mtime +7 -exec rm {} \;

echo "Backup completato. File salvato in: $BACKUP_FILE"

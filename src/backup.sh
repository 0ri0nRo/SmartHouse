#!/bin/bash

# Nome dell'immagine del container PostgreSQL
IMAGE_NAME="postgres:latest"

# Ottieni l'ID del container
CONTAINER_ID=$(docker ps -q --filter "ancestor=$IMAGE_NAME")

# Variabili
BACKUP_DIR="backup"   # Sostituisci con il percorso in cui desideri salvare i backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup.sql"

# Crea la directory di backup se non esiste
mkdir -p $BACKUP_DIR

# Cancella tutto il contenuto della directory di backup
rm -f $BACKUP_DIR/*

# Esegui il backup escludendo la tabella "network_devices"
docker exec $CONTAINER_ID pg_dump -U postgres --exclude-table=network_devices sensor_data > $BACKUP_FILE

# Rimuovi i backup più vecchi di 7 giorni
find $BACKUP_DIR -type f -name "*.sql" -mtime +7 -exec rm {} \;

echo "Backup completato. File salvato in: $BACKUP_FILE"

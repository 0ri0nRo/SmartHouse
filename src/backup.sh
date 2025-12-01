#!/bin/sh

BACKUP_DIR="/backup"
BACKUP_FILE="$BACKUP_DIR/backup.sql"
BACKUP_FILE_GZ="$BACKUP_FILE.gz"

# Create the backup directory if it does not exist
mkdir -p "$BACKUP_DIR"

# Delete backups older than 7 days
find "$BACKUP_DIR" -type f -name "backup_*.sql*" -mtime +7 -exec rm {} \;

# Perform the backup, excluding the "network_devices" table
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER --exclude-table=network_devices $DB_DATABASE > "$BACKUP_FILE"

# Check if the backup was successful
if [ $? -eq 0 ]; then
    # Compress the backup
    gzip -c "$BACKUP_FILE" > "$BACKUP_FILE_GZ"
    
    # Optional: delete the original uncompressed SQL file
    rm "$BACKUP_FILE"

    # Log message
    echo "Backup completed and successfully compressed. File saved at: $BACKUP_FILE_GZ"

    # Print only the path of the compressed backup for the API
    echo "$BACKUP_FILE_GZ"
    exit 0
else
    echo "Error during backup!"
    exit 1
fi

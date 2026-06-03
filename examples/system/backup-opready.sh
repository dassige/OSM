#!/bin/bash
# backup-opready.sh — downloads a full SQL backup from OpReady
# Copy this file to your backup machine, fill in the variables below,
# make it executable (chmod +x backup-opready.sh), then schedule with cron.
#
# Recommended cron entry (daily at 2 AM):
#   0 2 * * * /home/pi/backup-opready.sh >> /home/pi/opready-backups/backup.log 2>&1

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------

API_KEY="osm_your64hexkeyhere"                     # superadmin API key from System Tools → API Key Management
BASE_URL="https://your-cloud-run-url.run.app"       # OpReady base URL (no trailing slash)
BACKUP_DIR="/home/pi/opready-backups"               # local directory to store backup files

# Retention policy — set either or both; set to 0 to disable
KEEP_DAYS=30    # delete backups older than this many days (0 = disabled)
KEEP_COUNT=10   # keep only the N most recent files        (0 = disabled)

# -------------------------------------------------------------------
# Backup
# -------------------------------------------------------------------

DATE=$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"

HTTP_STATUS=$(curl -s -w "%{http_code}" \
  -H "X-API-Key: $API_KEY" \
  -o "$BACKUP_DIR/fenz_backup_${DATE}.sql" \
  "${BASE_URL}/api/system/backup")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "[$(date)] Backup saved: fenz_backup_${DATE}.sql"
else
  echo "[$(date)] Backup FAILED — HTTP $HTTP_STATUS" >&2
  rm -f "$BACKUP_DIR/fenz_backup_${DATE}.sql"
  exit 1
fi

# -------------------------------------------------------------------
# Retention
# -------------------------------------------------------------------

# Remove files older than KEEP_DAYS days
if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -name "fenz_backup_*.sql" -mtime +"$KEEP_DAYS" -delete
fi

# Keep only the KEEP_COUNT most recent files
if [ "$KEEP_COUNT" -gt 0 ]; then
  ls -1t "$BACKUP_DIR"/fenz_backup_*.sql 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | xargs -r rm --
fi

#!/bin/bash
# backup-opready.sh — downloads a backup from OpReady via the API
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

# Backup type:
#   db   — database only (.sql) — use for cloud/S3/GCS deployments
#   full — database + Knowledge Base documents (.zip) — use for local/Docker deployments
BACKUP_TYPE="db"

# Retention policy — set either or both; set to 0 to disable
KEEP_DAYS=30    # delete backups older than this many days (0 = disabled)
KEEP_COUNT=10   # keep only the N most recent files        (0 = disabled)

# -------------------------------------------------------------------
# Backup
# -------------------------------------------------------------------

DATE=$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"

if [ "$BACKUP_TYPE" = "full" ]; then
  OUTFILE="$BACKUP_DIR/opready-full-backup-${DATE}.zip"
  PATTERN="opready-full-backup-*.zip"
else
  OUTFILE="$BACKUP_DIR/opready-db-backup-${DATE}.sql"
  PATTERN="opready-db-backup-*.sql"
fi

HTTP_STATUS=$(curl -s -w "%{http_code}" \
  -H "X-API-Key: $API_KEY" \
  -o "$OUTFILE" \
  "${BASE_URL}/api/system/backup?type=${BACKUP_TYPE}")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "[$(date)] Backup saved: $(basename "$OUTFILE")"
else
  echo "[$(date)] Backup FAILED — HTTP $HTTP_STATUS" >&2
  rm -f "$OUTFILE"
  exit 1
fi

# -------------------------------------------------------------------
# Retention
# -------------------------------------------------------------------

# Remove files older than KEEP_DAYS days
if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -name "$PATTERN" -mtime +"$KEEP_DAYS" -delete
fi

# Keep only the KEEP_COUNT most recent files
if [ "$KEEP_COUNT" -gt 0 ]; then
  ls -1t "$BACKUP_DIR"/$PATTERN 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | xargs -r rm --
fi

#!/bin/sh
set -e

# --- NEW: Auto-fix Chrome Lock Files ---
# Removes the "SingletonLock" files that prevent Chrome from starting after a crash
echo "Cleaning up Chrome session locks..."
rm -f /app/.wwebjs_auth/session-opready-client/Singleton*

# 1. Customization: Download assets if URLs are provided
if [ ! -z "$UI_LOGO_URL" ]; then
    echo "Found custom logo URL. Downloading..."
    wget -O /app/public/resources/logo.png "$UI_LOGO_URL"
fi

if [ ! -z "$UI_BACKGROUND_URL" ]; then
    echo "Found custom background URL. Downloading..."
    wget -O /app/public/resources/background.png "$UI_BACKGROUND_URL"
fi

# 2. Decision: Run Litestream (Prod) or Standard (Local)
if [ ! -z "$GCS_BUCKET_NAME" ]; then
    echo "GCS_BUCKET_NAME found. Starting in PRODUCTION mode (Litestream enabled)..."
    
# Attempt restore, but don't exit the script if it fails (using || true)
    if ! litestream restore -if-replica-exists /app/fenz.db; then
        echo "WARNING: Litestream restore failed (possibly malformed replica). Starting with a fresh DB."
        rm -f /app/fenz.db /app/fenz.db-wal /app/fenz.db-shm
    fi

    if ! litestream restore -if-replica-exists /app/sessions.db; then
        echo "WARNING: Sessions restore failed. Starting with fresh sessions."
        rm -f /app/sessions.db /app/sessions.db-wal /app/sessions.db-shm
    fi

    # 2. Execute Litestream, which wraps the node process
    exec litestream replicate -exec "node server.js"
else
    echo "No GCS_BUCKET_NAME found. Starting in LOCAL mode..."
    # Run Node directly
    exec node server.js
fi
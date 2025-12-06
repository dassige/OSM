#!/bin/sh
set -e

# --- NEW: Auto-fix Chrome Lock Files ---
# Removes the "SingletonLock" files that prevent Chrome from starting after a crash
echo "Cleaning up Chrome session locks..."
rm -f /app/.wwebjs_auth/session-fenz-osm-client/Singleton*

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
    
    # 1. Restore the database from the bucket (if it exists)
    litestream restore -if-replica-exists /app/fenz.db

    # 2. Execute Litestream, which wraps the node process
    exec litestream replicate -exec "node server.js"
else
    echo "No GCS_BUCKET_NAME found. Starting in LOCAL mode..."
    # Run Node directly
    exec node server.js
fi
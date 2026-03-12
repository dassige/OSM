#!/bin/sh
set -e

# --- 1. Clean up Chrome session locks (Required for WhatsApp) ---
#
echo "Cleaning up Chrome session locks..."
rm -f /app/.wwebjs_auth/session-fenz-osm-client/Singleton*

# --- 2. Dynamic Asset Customization ---
#
if [ ! -z "$UI_LOGO_URL" ]; then
    echo "Downloading custom logo..."
    wget -O /app/public/resources/logo.png "$UI_LOGO_URL"
fi

if [ ! -z "$UI_BACKGROUND_URL" ]; then
    echo "Downloading custom background..."
    wget -O /app/public/resources/background.png "$UI_BACKGROUND_URL"
fi

# --- 3. Determine Persistence Provider ---
#
if [ ! -z "$REPLICA_URL" ]; then
    echo "Litestream enabled. Target: $REPLICA_URL"
    
    # Restore the database from the replica (if it exists)
    litestream restore -if-replica-exists /app/fenz.db

    # Start Litestream replication wrapping the Node.js process
    exec litestream replicate -exec "node server.js"
else
    echo "No REPLICA_URL found. Starting in LOCAL mode..."
    exec node server.js
fi
#!/bin/sh
set -e

# 1. Customize Logo if URL provided
if [ ! -z "$UI_LOGO_URL" ]; then
    echo "Found custom logo URL. Downloading..."
    # We download to the default path so the frontend finds it easily
    wget -O /app/public/resources/logo.png "$UI_LOGO_URL"
fi

# 2. Customize Background if URL provided
if [ ! -z "$UI_BACKGROUND_URL" ]; then
    echo "Found custom background URL. Downloading..."
    wget -O /app/public/resources/background.png "$UI_BACKGROUND_URL"
fi

# 3. Start the Application
echo "Starting Node.js server..."
node server.js
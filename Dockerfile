# Use a lightweight Node.js image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# 1. Install build dependencies, Litestream tools, AND Chromium
# We add 'chromium' and its dependencies (nss, freetype, etc)
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    wget \
    unzip \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 2. Configure Puppeteer to use the installed Chromium
# This prevents it from trying (and failing) to run the bundled version
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# --- LITESTREAM SETUP ---
# Download Litestream
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
# Unzip and move to bin
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install
# If you prefer using npm ci for a clean install, uncomment the following line and comment out the npm install line above
# it may fix any package-lock related issues.
#RUN npm ci  
# Copy application code
COPY . .

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Copy Litestream configuration
COPY litestream.yml /etc/litestream.yml

EXPOSE 3000

# CHANGED: Point to the smart script
CMD ["/app/start.sh"]
# ─── Stage 1: builder ──────────────────────────────────────────────────────
# Install native build tools and compile npm dependencies that need them
# (e.g. better-sqlite3). These tools are not needed at runtime.
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Runtime-only packages: Chromium (Puppeteer PDF export) + wget (HEALTHCHECK / asset download)
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
    wget \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install Litestream (GCS continuous backup / restore)
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz

# Pull pre-built node_modules from the builder stage (no python3/make/g++ in runtime)
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY . .

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

COPY litestream.yml /etc/litestream.yml

# Transfer ownership to the built-in non-root node user so the server process
# cannot write outside /app even if the Node.js process is compromised.
RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["/app/start.sh"]

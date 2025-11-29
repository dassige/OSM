# Use a lightweight Node.js image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Install build dependencies AND wget/unzip for Litestream
RUN apk add --no-cache python3 make g++ wget unzip

# --- LITESTREAM SETUP ---
# Download Litestream
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
# Unzip and move to bin
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Copy Litestream configuration
COPY litestream.yml /etc/litestream.yml

EXPOSE 3000

# CHANGED: Point to the smart script
CMD ["/app/start.sh"]
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

# Copy Litestream configuration file (We will create this next)
COPY litestream.yml /etc/litestream.yml

# Expose the port
EXPOSE 3000

# Run Litestream, which wraps your Node command
# This tells Litestream to: restore DB -> run app -> replicate changes back to bucket
CMD ["litestream", "replicate", "-exec", "node server.js"]
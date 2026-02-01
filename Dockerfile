# Stage 1: Build the application
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Stage 2: Serve with Caddy
FROM caddy:alpine

# Copy custom Caddy configuration
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/caddy

EXPOSE 80

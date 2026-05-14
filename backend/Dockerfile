# ── Stage 1: Build native modules (better-sqlite3, ssh2) ─────────────────────
FROM node:20-alpine AS builder

# Build tools required for native N-API bindings
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including devDeps) so native modules compile correctly
RUN npm ci

# ── Stage 2: Lean runtime image ───────────────────────────────────────────────
FROM node:20-alpine

# openssh-client is NOT needed (ssh2 uses its own pure-JS/native SSH stack)
# wget is used by the healthcheck
RUN apk add --no-cache wget tini

# Run as non-root for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy compiled node_modules from builder
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app . .

# SQLite data directory (mounted as volume by compose)
RUN mkdir -p /data && chown app:app /data

USER app

EXPOSE 3001

# tini as PID 1 → proper signal forwarding and zombie reaping
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

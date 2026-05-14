# ── Stage 1: Vite build ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL is intentionally left empty so the browser uses relative URLs
# (e.g. /api/deploy), which nginx then proxies to the backend container.
# Pass a full URL here only if backend is on a different domain.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build
# Output: /app/dist

# ── Stage 2: Nginx static file server + reverse proxy ────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx runs as root by default inside the container; for hardening we could
# drop to www-data, but that requires extra volume permission work — kept
# simple for single-user self-hosted use.

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

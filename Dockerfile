# ── Multi-stage Dockerfile for ZPL Printer Emulator ────────────────────
# Supports both web app and desktop app (headless server mode)
# Usage:
#   Web app: docker build --build-arg APP_MODE=web .
#   Desktop server: docker build --build-arg APP_MODE=desktop .

ARG APP_MODE=web

# ── Stage 1: Build React frontend (for web app) ────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/web/client
COPY web/client/package.json web/client/package-lock.json* ./
RUN npm install
COPY web/client/ ./
RUN npm run build

# ── Stage 2: Desktop app dependencies ──────────────────────────────────
FROM node:20-alpine AS desktop-deps

WORKDIR /app
COPY package.json package-lock.json* ./
# Install only runtime dependencies (skip Electron and dev tools)
RUN npm install --production --ignore-scripts || true

# ── Stage 3: Web app production image ──────────────────────────────────
FROM node:20-alpine AS web-app

LABEL maintainer="ZPL Printer Emulator"
LABEL description="ZPL Printer Emulator - Web Application"

WORKDIR /app

# Install server dependencies
COPY web/server/package.json web/server/package-lock.json* ./server/
RUN cd server && npm install --production

# Copy server source
COPY web/server/ ./server/

# Copy built frontend
COPY --from=frontend-build /app/web/client/dist ./client/dist

# Create directory for saved labels
RUN mkdir -p /app/labels

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Expose web port and ZPL TCP port
EXPOSE 4000
EXPOSE 9100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/config || exit 1

WORKDIR /app/server
CMD ["node", "index.js"]

# ── Stage 4: Desktop app server mode (headless) ────────────────────────
FROM node:20-alpine AS desktop-app

LABEL maintainer="ZPL Printer Emulator"
LABEL description="ZPL Printer Emulator - Desktop App Server Mode"

WORKDIR /app

# Install dependencies (without Electron)
COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts || true

# Copy desktop app files
COPY ZPLPrinter/ ./ZPLPrinter/

# Copy headless server entry point
COPY desktop-server.js ./server.js

# Create directory for saved labels
RUN mkdir -p /app/labels

# Environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=9100
ENV IS_ON=true
ENV KEEP_TCP_SOCKET=true

# Expose ZPL TCP port
EXPOSE 9100

WORKDIR /app
CMD ["node", "server.js"]

# ── Final stage: Select based on APP_MODE ──────────────────────────────
FROM ${APP_MODE}-app AS final


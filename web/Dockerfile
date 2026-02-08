# ── Stage 1: Build the React frontend ────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────
FROM node:20-alpine

LABEL maintainer="EN Systems - ZPL Printer Emulator"
LABEL description="ZPL Printer Emulator Web Application"

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production

# Copy server source
COPY server/ ./server/

# Copy built frontend
COPY --from=frontend-build /app/client/dist ./client/dist

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

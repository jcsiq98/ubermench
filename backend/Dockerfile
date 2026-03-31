# ─── Handy API — Production Dockerfile ───────────────────
# Multi-stage build for minimal image size

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma + SSL connections to Neon
RUN apk add --no-cache openssl

# Install only production dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Generate Prisma client in production
RUN npx prisma generate

# Copy built files
COPY --from=builder /app/dist ./dist

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start (NestJS outputs to dist/src/main.js)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]

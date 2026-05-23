# Dockerfile for Frontal CLI

# Build stage
FROM oven/bun:1.3.8-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build the project
RUN bun run build

# Production stage
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontal -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=frontal:nodejs /app/dist ./dist
COPY --from=builder --chown=frontal:nodejs /app/package.json ./
COPY --from=builder --chown=frontal:nodejs /app/node_modules ./node_modules

# Create directories for CLI usage
RUN mkdir -p /home/frontal/.frontal && \
    chown -R frontal:nodejs /home/frontal/.frontal

# Switch to non-root user
USER frontal

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/app/dist/bin:${PATH}"
ENV HOME=/home/frontal

# Expose volume for configuration
VOLUME ["/home/frontal/.frontal"]

# Set entrypoint
ENTRYPOINT ["dumb-init", "--"]
CMD ["frontal"]

# Labels
LABEL maintainer="Frontal Labs <team@frontal.dev>"
LABEL version="0.1.0"
LABEL description="Frontal CLI - Official command-line interface for Frontal platform"
LABEL org.opencontainers.image.source="https://github.com/frontal-labs/frontal-cli"
LABEL org.opencontainers.image.licenses="MIT"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD frontal --version || exit 1

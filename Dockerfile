FROM node:20-alpine

# Install git for repository cloning and curl for health checks
RUN apk add --no-cache git curl

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create directories
RUN mkdir -p /app/logs /app/.cache /app/docs-repo

# Create startup script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Note: Periodic updates are now handled by Node.js scheduler, no cron needed

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["/app/start.sh"]
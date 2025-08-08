FROM node:20-alpine

# Install git for repository cloning, cron for periodic updates, and curl for health checks
RUN apk add --no-cache git dcron curl

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

# Create cron job for periodic updates (every 6 hours)
RUN echo "0 */6 * * * cd /app && npm run update-docs >> /app/logs/cron.log 2>&1" > /etc/crontabs/root

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["/app/start.sh"]
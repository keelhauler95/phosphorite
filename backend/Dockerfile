# Backend Dockerfile - Multi-stage build
FROM node:20.13-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20.13-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose backend port (will be overridden by PORT env var)
EXPOSE 3000
EXPOSE 3100

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3100

# Start the server
CMD ["node", "dist/server.js"]

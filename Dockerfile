# Build stage
FROM node:22 AS builder

# Cài đặt nano
RUN apt update && apt install -y nano

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:22 AS runner

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy built application from builder stage
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy file .env vào container
COPY --from=builder /app/.env .env

# Expose port
EXPOSE 8000

# Chạy ứng dụng
CMD ["node", "dist/src/main.js"]
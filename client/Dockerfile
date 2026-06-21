# Build stage
# Node 20 — Vite 7 requires Node 20.19+ (node:18 fails the build)
FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Give Vite enough heap so `vite build` doesn't OOM on small build hosts
# (the default cap on a 1–2 GB instance is too low for this app).
ENV NODE_OPTIONS=--max-old-space-size=2048

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

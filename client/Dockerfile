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

# Cap Vite's heap BELOW the build host's physical RAM. The production EC2 box has
# ~1.9 GB total, so a 2048 MB cap was never reached: Node just kept growing into
# swap and the build took ~5 min. With source maps off (see vite.config.js) the
# build fits comfortably in 1536 MB; raise this only if the build OOMs.
ENV NODE_OPTIONS=--max-old-space-size=1536

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

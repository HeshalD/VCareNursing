# Docker Deployment Guide for VCareNursing

## Prerequisites
- Docker and Docker Compose installed on your system
- Git repository cloned locally

## Quick Start

### 1. Environment Setup
```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your actual credentials
# You'll need to configure:
# - JWT_SECRET (generate a random string)
# - Cloudinary credentials (for image uploads)
# - Email credentials (for notifications)
# - Twilio credentials (for SMS)
```

### 2. Build and Run
```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up --build -d
```

### 3. Access Your Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Database: localhost:5432

## Services Overview

### 1. PostgreSQL Database
- Container: `vcarenursing-db`
- Port: 5432
- Database: `vcarenursing`
- User: `vcareuser`
- Password: `vcarepass123`

### 2. Backend API
- Container: `vcarenursing-backend`
- Port: 5000
- Includes Puppeteer with Chrome for PDF generation
- Health checks enabled

### 3. Frontend
- Container: `vcarenursing-frontend`
- Port: 3000
- Served by Nginx with production optimizations

## Common Commands

### View Logs
```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes database data)
docker-compose down -v
```

### Restart Services
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Access Containers
```bash
# Access backend container
docker-compose exec backend sh

# Access database container
docker-compose exec postgres psql -U vcareuser -d vcarenursing
```

## Production Deployment

### For Free Hosting Services

#### 1. Railway
- Connect your GitHub repository
- Railway will automatically detect the Docker setup
- Set environment variables in Railway dashboard
- Deploy automatically on push to main branch

#### 2. Render
- Create a new Web Service
- Connect your GitHub repository
- Choose "Docker" as the runtime
- Set environment variables
- Deploy automatically on push to main branch

#### 3. Heroku
- Install Heroku CLI
- Create a new app: `heroku create your-app-name`
- Set environment variables: `heroku config:set VAR_NAME=value`
- Deploy: `git push heroku main`

#### 4. DigitalOcean App Platform
- Create a new app
- Connect your GitHub repository
- Choose "Docker" as the source
- Configure environment variables
- Deploy

## Environment Variables Required

### Required for Basic Functionality
- `JWT_SECRET`: Secret key for JWT tokens
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Database connection

### Required for Features
- `CLOUDINARY_*`: Image uploads (Cloudinary account needed)
- `EMAIL_*`: Email notifications (SMTP server needed)
- `TWILIO_*`: SMS notifications (Twilio account needed)

## Troubleshooting

### Common Issues

1. **Puppeteer Chrome Issues**
   - The Dockerfile includes Chrome installation
   - Uses `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
   - Chrome path: `/usr/bin/google-chrome-stable`

2. **Database Connection**
   - Ensure PostgreSQL container is running
   - Check database credentials in .env file
   - Database is created automatically on first run

3. **Port Conflicts**
   - Ensure ports 3000, 5000, and 5432 are available
   - Modify ports in docker-compose.yml if needed

4. **Build Issues**
   - Clear Docker cache: `docker system prune -a`
   - Rebuild: `docker-compose build --no-cache`

### Health Checks
- Backend health check: `GET /api/auth`
- Frontend: Nginx serves static files
- Database: PostgreSQL service status

## Development vs Production

### Development Mode
```bash
# Use development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Production Mode
```bash
# Use production environment (default)
docker-compose up --build
```

## Security Considerations

1. **Environment Variables**: Never commit .env files to version control
2. **Database**: Use strong passwords in production
3. **JWT Secret**: Use a long, random string
4. **HTTPS**: Configure SSL certificates in production
5. **Firewall**: Restrict database access to application only

## Monitoring

### Container Monitoring
```bash
# Check container status
docker-compose ps

# Check resource usage
docker stats
```

### Log Monitoring
```bash
# Follow logs in real-time
docker-compose logs -f

# Check specific service logs
docker-compose logs -f backend
```

## Backup and Recovery

### Database Backup
```bash
# Create backup
docker-compose exec postgres pg_dump -U vcareuser vcarenursing > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U vcareuser vcarenursing < backup.sql
```

### Volume Backup
```bash
# Backup volumes
docker run --rm -v vcarenursing_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

## Scaling

### Horizontal Scaling
```bash
# Scale backend services
docker-compose up --scale backend=3

# Add load balancer configuration in nginx.conf
```

### Vertical Scaling
```bash
# Modify resource limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '0.5'
```

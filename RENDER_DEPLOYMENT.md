# Render Deployment Guide for VCareNursing Backend

## Prerequisites
- GitHub repository with your code
- Render account (free tier available)
- PostgreSQL database already created on Render

## Step 1: Prepare Your Repository

### 1.1 Push Latest Changes
```bash
# Ensure all changes are committed and pushed
git add .
git commit -m "Add Render deployment configuration with database migration"
git push origin main
```

### 1.2 Verify Files
Make sure these files exist in your repository:
- `render.yaml` - Render service configuration
- `backend/Dockerfile` - Backend container configuration
- `backend/migrate.js` - Database migration script
- `backend/package.json` - Dependencies (includes migrate script)
- `backend/server.js` - Application entry point

## Step 2: Deploy to Render

### 2.1 Connect Your Repository
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select the `VCareNursing` repository
5. Choose the `main` branch

### 2.2 Configure the Web Service
1. **Name**: `vcarenursing-backend`
2. **Environment**: `Docker`
3. **Root Directory**: `backend`
4. **Dockerfile Path**: `./Dockerfile`
5. **Region**: Choose closest to your users
6. **Plan**: Free (or paid for more resources)

### 2.3 Environment Variables
Add these environment variables in Render Dashboard:

#### Database Connection (from your existing PostgreSQL):
```
DB_HOST=your-db-host.render.com
DB_PORT=5432
DB_NAME=vcarenursing
DB_USER=your-db-user
DB_PASSWORD=your-db-password
```

#### Application Configuration:
```
NODE_ENV=production
PORT=10000
JWT_SECRET=your-super-secret-jwt-key
```

#### Optional Services (configure as needed):
```
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number
```

### 2.4 Advanced Settings
1. **Health Check Path**: `/api/auth`
2. **Auto-Deploy**: Yes (for automatic updates on push)
3. **Instance Type**: Free (or upgrade as needed)

## Step 3: Alternative - Use render.yaml

### 3.1 Automatic Deployment with render.yaml
If you want to use the `render.yaml` file for automatic setup:

1. Push the `render.yaml` file to your repository
2. In Render Dashboard, click "New +" → "Blueprint"
3. Connect your repository
4. Render will automatically create the services defined in the YAML

### 3.2 Benefits of render.yaml
- Infrastructure as code
- Reproducible deployments
- Automatic database creation
- Environment variable management

## Step 4: Database Setup

### 4.1 Using Existing PostgreSQL Database
If you already have a PostgreSQL database on Render:

1. Go to your database in Render Dashboard
2. Copy the connection details
3. Add them as environment variables to your web service

### 4.2 Database Migration
Your application needs database tables. The migration script is already created based on your existing schema:

```javascript
// backend/migrate.js (already created)
const db = require('./config/db');

async function migrate() {
  try {
    // Creates all enums, tables, indexes, and constraints
    // Based on your vcare_schema.sql backup
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}
```

Add to your `package.json` (already added):
```json
{
  "scripts": {
    "migrate": "node migrate.js"
  }
}
```

### 4.3 Run Migration on Render
After deployment, run the migration:

1. **Option 1: Render Dashboard**
   - Go to your web service → "Shell" tab
   - Run: `npm run migrate`

2. **Option 2: Add to Dockerfile**
   Add this to your Dockerfile before CMD:
   ```dockerfile
   RUN npm run migrate
   ```

3. **Option 3: Automatic Migration**
   Update your server.js to run migration on startup:
   ```javascript
   // Add to server.js top
   if (process.env.NODE_ENV === 'production') {
     const migrate = require('./migrate');
     migrate().catch(console.error);
   }
   ```

### 4.4 Schema Overview
The migration creates these tables based on your backup:

**Core Tables:**
- `users` - User accounts with roles
- `client_profiles` - Client information
- `staff_profiles` - Staff information
- `patient_profiles` - Patient details

**Service Tables:**
- `service_requests` - Service requests
- `quotations` - Price quotes
- `bookings` - Active bookings
- `service_terminations` - Service terminations

**Support Tables:**
- `categories` - Product categories
- `products` - Products inventory
- `transactions` - Financial transactions
- `payment_slips` - Payment verification
- `otp_verifications` - OTP codes
- `staff_applications` - Staff applications

**Enums Created:**
- `user_role_enum` - User roles (CLIENT, STAFF, SUPER_ADMIN, etc.)
- `client_type_enum` - Client types (INDIVIDUAL, FAMILY, CORPORATE_PROXY)
- `gender_enum` - Gender options
- `service_model_enum` - Service models (LIVE_IN, SHIFT_BASED, VISITING)
- `payment_method` - Payment methods
- `transaction_category` - Transaction types
- `transaction_type_enum` - Credit/Debit types

## Step 5: Test Your Deployment

### 5.1 Check Deployment Status
1. Monitor the build log in Render Dashboard
2. Wait for deployment to complete
3. Check the "Logs" tab for any errors

### 5.2 Test API Endpoints
```bash
# Test health endpoint
curl https://vcarenursing-backend.onrender.com/api/auth

# Test other endpoints
curl https://vcarenursing-backend.onrender.com/api/clients
```

### 5.3 Common Issues and Solutions

#### Issue: Database Connection Failed
**Solution**: Verify database credentials and ensure the database is running

#### Issue: Puppeteer Chrome Issues
**Solution**: The Dockerfile includes Chrome installation. Check logs for Chrome-related errors

#### Issue: Port Issues
**Solution**: Render uses port 10000 by default. Ensure your app listens on `process.env.PORT`

#### Issue: Timeouts
**Solution**: Free tier has 15-second timeout. Optimize your startup time

## Step 6: Frontend Configuration

### 6.1 Update Frontend API URL
In your frontend code, update the API base URL:

```javascript
// For development
const API_BASE = 'http://localhost:5000';

// For production (Render)
const API_BASE = 'https://vcarenursing-backend.onrender.com';
```

Or use environment detection:
```javascript
const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://vcarenursing-backend.onrender.com' 
  : 'http://localhost:5000';
```

### 6.2 Deploy Frontend
You can deploy the frontend separately on Render, Vercel, or Netlify.

## Step 7: Maintenance

### 7.1 Monitoring
- Check Render Dashboard logs regularly
- Monitor database usage
- Set up alerts for errors

### 7.2 Updates
- Push changes to main branch for auto-deployment
- Test in development first
- Monitor after deployment

### 7.3 Scaling
- Upgrade plan if needed
- Add more instances for high traffic
- Consider CDN for static assets

## Environment Variables Reference

### Required Variables
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET`
- `NODE_ENV`, `PORT`

### Optional Variables
- `CLOUDINARY_*` (for image uploads)
- `EMAIL_*` (for notifications)
- `TWILIO_*` (for SMS)

## Troubleshooting

### Common Errors

#### "Cannot connect to database"
- Check database is running
- Verify credentials
- Check network access

#### "Chrome not found"
- Puppeteer needs Chrome
- Dockerfile includes Chrome installation
- Check `PUPPETEER_EXECUTABLE_PATH`

#### "Port already in use"
- Render uses port 10000
- Ensure app listens on `process.env.PORT`

#### "Timeout during deployment"
- Free tier has 15-second timeout
- Optimize startup time
- Consider paid plan for longer timeout

### Debug Tips
1. Check Render logs
2. Test locally with same environment variables
3. Use health checks to monitor service
4. Monitor database connections

## Security Considerations

1. **Environment Variables**: Never commit secrets to Git
2. **Database**: Use strong passwords
3. **JWT**: Use long, random secrets
4. **HTTPS**: Render provides SSL automatically
5. **CORS**: Configure properly for your frontend domain

## Next Steps

1. Deploy the backend service
2. Test all API endpoints
3. Deploy the frontend
4. Set up monitoring
5. Configure custom domain (optional)

Your VCareNursing backend is now ready for deployment on Render!

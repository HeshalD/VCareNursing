# VCareNursing — Deployment Guide

**For:** Developer  
**Estimated time:** 3–5 hours (first time)

---

## Architecture Overview

Understanding this before you start will save a lot of confusion.

```
User's Browser
      │
      ▼ (port 443 HTTPS)
Host Nginx on EC2  ←── Certbot manages SSL certificate
      │
      ▼ (proxies to port 3000)
Frontend Docker Container (Nginx inside)
      │  serves React app (static files)
      │  proxies /api/* requests to ──────────────────────┐
      ▼                                                    ▼
  [React SPA]                              Backend Docker Container
                                                 Node.js on port 5000
                                                      │
                                         ┌────────────┴─────────────┐
                                         ▼                           ▼
                                  AWS RDS (PostgreSQL)           AWS S3
                                    (database)               (file storage)
```

**Key point:** The frontend container already has Nginx configured inside it (see `client/nginx.conf`). It serves the React app AND proxies all `/api/` requests to the backend container internally over Docker's network. The host Nginx only handles SSL and passes everything to port 3000.

---

## Prerequisites Checklist

Complete these before starting any AWS work.

- [ ] AWS account created (debit/credit card with international payments enabled)
- [ ] GitHub account with the project code pushed to a repository
- [ ] Gmail account set up for system emails, with an **App Password** generated (not your regular Gmail password — go to Google Account → Security → 2-Step Verification → App passwords)
- [ ] All third-party credentials gathered (Twilio, Meta WhatsApp — same values currently in your `.env`)

---

## Environment Variables Reference

You will need to create a `.env` file on the server. Collect these values before starting — some will be filled in as you complete steps below.

```env
# Application
NODE_ENV=production
PORT=5000
JWT_SECRET=<generate a long random string — at least 64 characters>
CLIENT_URL=https://yourdomain.lk

# Database — fill in after Step 3 (RDS setup)
DB_HOST=<RDS endpoint — looks like xxxxx.rds.amazonaws.com>
DB_PORT=5432
DB_NAME=vcarenursing
DB_USER=vcareuser
DB_PASSWORD=<the password you set when creating RDS>

# AWS S3 — fill in after Step 2 (S3 setup)
AWS_ACCESS_KEY_ID=<from IAM user creation>
AWS_SECRET_ACCESS_KEY=<from IAM user creation>
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=<your bucket name>

# WhatsApp / Twilio — same as your current values
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Meta WhatsApp — same as your current values
META_WHATSAPP_TOKEN=
META_PHONE_NUMBER_ID=

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<your gmail address>
EMAIL_PASS=<Gmail App Password — NOT your regular gmail password>
```

---

## Step 1 — Migrate Cloudinary to S3 (Code Change)

Do this first, on your local machine, before touching any AWS setup. The app will not work correctly in production with Cloudinary still in the code.

### 1.1 Install S3 packages, remove Cloudinary packages

```bash
cd backend
npm install @aws-sdk/client-s3 multer-s3
npm uninstall cloudinary multer-storage-cloudinary
```

### 1.2 Create a shared S3 config file

Create `backend/config/s3Config.js`:

```js
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = s3;
```

### 1.3 Replace cloudinaryConfig.js

Replace the entire contents of `backend/config/cloudinaryConfig.js`:

```js
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('./s3Config');

const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const upload = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    key: (req, file, cb) => {
      cb(null, `vcare_documents/${Date.now()}_${file.originalname}`);
    },
  }),
});

const uploadProfilePicture = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    key: (req, file, cb) => {
      cb(null, `vcare_profile_pictures/${Date.now()}_${file.originalname}`);
    },
  }),
});

const uploadDocuments = upload.array('documents', 5);
const uploadProfilePictureSingle = uploadProfilePicture.single('profile_picture');

module.exports = { upload, uploadProfilePicture, uploadDocuments, uploadProfilePictureSingle };
```

### 1.4 Replace uploadMiddleware.js

Replace the entire contents of `backend/middleware/uploadMiddleware.js`:

```js
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3Config');

const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const folderMap = {
  profile_picture: 'vcare_profile_pictures',
  nic_front: 'vcare_nic_cards',
  nic_back: 'vcare_nic_cards',
  documents: 'vcare_documents',
};

const uploadApplicationFiles = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    key: (req, file, cb) => {
      const folder = folderMap[file.fieldname] || 'vcare_documents';
      cb(null, `${folder}/${Date.now()}_${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (folderMap[file.fieldname] !== undefined) {
      cb(null, true);
    } else {
      cb(new Error('Unexpected field: ' + file.fieldname));
    }
  },
}).fields([
  { name: 'documents', maxCount: 5 },
  { name: 'profile_picture', maxCount: 1 },
  { name: 'nic_front', maxCount: 1 },
  { name: 'nic_back', maxCount: 1 },
]);

module.exports = { uploadApplicationFiles };
```

### 1.5 Replace the 4 programmatic PDF uploads

Each of the following files uses `cloudinary.uploader.upload(base64...)`. Replace the upload call with the S3 equivalent. The pattern is the same in all four files.

**Replace this pattern (Cloudinary):**
```js
const cloudinary = require('cloudinary').v2;
cloudinary.config({ ... });

// ...inside a function:
cloudinary.uploader.upload(
  `data:application/pdf;base64,${buffer.toString('base64')}`,
  { resource_type: 'raw', folder: 'statements', public_id: `MyFile_${Date.now()}` },
  (error, result) => {
    if (error) return reject(error);
    resolve(result.secure_url);
  }
);
```

**With this pattern (S3):**
```js
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3Config'); // adjust path as needed

// ...inside a function:
const key = `statements/MyFile_${Date.now()}.pdf`;
await s3.send(new PutObjectCommand({
  Bucket: process.env.AWS_S3_BUCKET_NAME,
  Key: key,
  Body: buffer,
  ContentType: 'application/pdf',
}));
const pdfUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
```

**Files to update:**

| File | Folder to use in Key | Variable that held `secure_url` |
|---|---|---|
| `backend/utils/salaryPdf.js` | `salary_sheets/` | returned URL |
| `backend/controllers/statementController.js` (line ~446) | `statements/` | `pdfUrl` |
| `backend/controllers/statementController.js` (line ~519) | `statements/` | `pdfUrl` |
| `backend/controllers/quoteController.js` (line ~215) | `estimates/` | `pdfUrl` |

Also remove the `cloudinary.config({ ... })` block at the top of each of these files.

### 1.6 Commit and push

```bash
git add .
git commit -m "feat: migrate file storage from Cloudinary to AWS S3"
git push origin main
```

---

## Step 2 — Create the AWS S3 Bucket

1. Log in to AWS Console → search for **S3** → **Create bucket**
2. **Bucket name:** `vcarenursing-files` (must be globally unique — add a suffix if taken, e.g. `vcarenursing-files-lk`)
3. **Region:** `ap-south-1` (Asia Pacific — Mumbai)
4. **Block Public Access:** Uncheck "Block all public access" and confirm — uploaded files (PDFs, photos) need to be publicly accessible via URL for WhatsApp links to work
5. Click **Create bucket**

### Create an IAM User for S3 Access

Never use your root AWS account credentials in the app. Create a dedicated user:

1. AWS Console → search **IAM** → **Users** → **Create user**
2. **Username:** `vcarenursing-app`
3. **Permissions:** Attach policies directly → search and select **AmazonS3FullAccess**
4. Create user → click the user → **Security credentials** tab → **Create access key**
5. Use case: **Application running outside AWS**
6. **Copy and save the Access Key ID and Secret Access Key immediately** — the secret is only shown once

Fill these into your `.env` file:
```
AWS_ACCESS_KEY_ID=<paste here>
AWS_SECRET_ACCESS_KEY=<paste here>
AWS_S3_BUCKET_NAME=vcarenursing-files
AWS_REGION=ap-south-1
```

---

## Step 3 — Create the RDS Database

1. AWS Console → search **RDS** → **Create database**
2. **Creation method:** Standard create
3. **Engine:** PostgreSQL
4. **Version:** PostgreSQL 15 (or latest available)
5. **Template:**
   - Free Tier phase → select **Free tier**
   - Paid phase → select **Production**, then choose db.t3.micro manually
6. **DB instance identifier:** `vcarenursing-db`
7. **Master username:** `vcareuser`
8. **Master password:** Create a strong password — save it, you cannot recover it
9. **Instance configuration:** db.t2.micro (free) or db.t3.micro (paid)
10. **Storage:** 20 GB, gp2
11. **Connectivity:**
    - Public access: **No**
    - VPC security group: **Create new** — name it `vcarenursing-db-sg`
12. Click **Create database** — this takes about 5 minutes

### Get the RDS Endpoint

Once the database status shows **Available**:  
RDS → your database → **Connectivity & security** tab → copy the **Endpoint**

It will look like: `vcarenursing-db.xxxxxxxxxx.ap-south-1.rds.amazonaws.com`

Fill this into your `.env` file as `DB_HOST`.

---

## Step 4 — Launch the EC2 Server

1. AWS Console → search **EC2** → **Launch instance**
2. **Name:** `vcarenursing-server`
3. **AMI:** Ubuntu Server 24.04 LTS (marked as "Free tier eligible")
4. **Instance type:**
   - Free tier: **t2.micro**
   - Paid: **t3.small**
5. **Key pair:** Click **Create new key pair** → name it `vcarenursing-key` → RSA → .pem → Download
   - **Keep this .pem file safe.** You cannot recover it. Without it you cannot SSH into the server.
6. **Network settings:** Create security group with these rules:

   | Type | Port | Source |
   |---|---|---|
   | SSH | 22 | My IP (select from dropdown) |
   | HTTP | 80 | Anywhere (0.0.0.0/0) |
   | HTTPS | 443 | Anywhere (0.0.0.0/0) |

7. **Storage:** 20 GB gp3
8. **Launch instance**

### Allocate a Static IP (Elastic IP)

Without this, your server gets a new IP address every time it restarts and your domain will stop working.

1. EC2 → left sidebar → **Elastic IPs** → **Allocate Elastic IP address** → Allocate
2. Select the new IP → **Actions** → **Associate Elastic IP address** → select your instance → Associate
3. **Save this IP address** — this is what you'll point your domain to in CPanel

### Allow EC2 to Connect to RDS

The database is private — only the application server should be able to reach it.

1. AWS Console → **EC2** → **Security Groups**
2. Find `vcarenursing-db-sg` (the one created with RDS)
3. **Inbound rules** → **Edit inbound rules** → **Add rule**:
   - Type: **PostgreSQL** (port 5432)
   - Source: **Custom** → start typing `vcarenursing` → select the **EC2 security group** (not the DB one)
4. Save rules

---

## Step 5 — Connect to the Server and Install Docker

### SSH In

On Windows, use Git Bash or Windows Terminal:

```bash
# Move your key file somewhere permanent first (e.g. C:/Users/HESHAL/.ssh/)
# Then fix permissions (Git Bash):
chmod 400 ~/.ssh/vcarenursing-key.pem

# Connect:
ssh -i ~/.ssh/vcarenursing-key.pem ubuntu@<your-elastic-ip>
```

You should see a Ubuntu welcome message. You're now inside the server.

### Install Docker

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker using the official script
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to the docker group so you don't need sudo every time
sudo usermod -aG docker ubuntu

# Apply the group change (log out and back in)
exit
```

SSH back in:
```bash
ssh -i ~/.ssh/vcarenursing-key.pem ubuntu@<your-elastic-ip>
```

```bash
# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify both are working
docker --version
docker compose version
```

---

## Step 6 — Clone the Repository and Configure

```bash
# Clone your repo (replace with your actual GitHub URL)
git clone https://github.com/<your-username>/VCareNursing.git
cd VCareNursing
```

### Create the Production .env File

```bash
nano backend/.env
```

Paste in your complete `.env` file from the reference above, with all values filled in. Save with **Ctrl+X → Y → Enter**.

---

## Step 7 — Modify docker-compose for Production

The `docker-compose.yml` includes a PostgreSQL container for local development. In production you're using RDS, so remove it.

Open the file:
```bash
nano docker-compose.yml
```

Make these changes:

1. **Delete the entire `postgres:` service block** (the first service, roughly lines 4–17)
2. **In the `backend:` service block**, remove the hardcoded database environment variables (`DB_HOST: postgres`, etc.) — the backend will read these from your `.env` file instead. Keep only:
   ```yaml
   environment:
     NODE_ENV: production
     PORT: 5000
   ```
3. **In the `backend:` service block**, remove `depends_on: - postgres`
4. **Add `env_file` to the backend service** so it reads your `.env`:
   ```yaml
   env_file:
     - ./backend/.env
   ```
5. **Remove the `volumes:` block** at the bottom that references `postgres_data:`
6. **Remove the `volumes:` from the backend service** (`- ./backend:/app` and `- /app/node_modules`) — in production you don't mount the source code, the Docker image contains it

Your final `docker-compose.yml` should look roughly like this:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: vcarenursing-backend
    env_file:
      - ./backend/.env
    environment:
      NODE_ENV: production
      PORT: 5000
    ports:
      - "5000:5000"
    networks:
      - vcarenursing-network

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
    container_name: vcarenursing-frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    networks:
      - vcarenursing-network

networks:
  vcarenursing-network:
    driver: bridge
```

Save and exit.

---

## Step 8 — Run the Application

```bash
# Build the images and start everything in the background
# This will take 5–10 minutes the first time (backend downloads Chrome for PDF generation)
docker compose up --build -d

# Check that both containers are running (status should be "Up")
docker compose ps

# Watch the logs to make sure there are no errors
docker compose logs -f
# Press Ctrl+C to stop watching logs (containers keep running)
```

At this point the app is running on **port 3000** (HTTP only). Test it:
```bash
curl http://localhost:3000
# Should return HTML content
```

---

## Step 9 — Run the Database Migration

The database on RDS is empty. You need to run the schema setup:

```bash
# Connect to the backend container and run the migration
docker compose exec backend node migrate.js
```

If there's no `migrate.js` or it doesn't work, you can run the SQL directly:
```bash
# Get a psql session to RDS (from inside the EC2 server)
sudo apt install postgresql-client -y
psql -h <your-rds-endpoint> -U vcareuser -d vcarenursing -f backend/init.sql
```

---

## Step 10 — Install Nginx on the Host and Configure

The frontend Docker container runs its own Nginx internally, but it does not handle HTTPS. You need a host-level Nginx to:
- Accept HTTPS traffic (port 443)
- Terminate SSL
- Forward all requests to the frontend container on port 3000

```bash
sudo apt install nginx -y
```

Create the site configuration:
```bash
sudo nano /etc/nginx/sites-available/vcarenursing
```

Paste this configuration (replace `yourdomain.lk` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.lk www.yourdomain.lk;

    # Certbot will modify this block after Step 11
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/vcarenursing /etc/nginx/sites-enabled/
sudo nginx -t    # Should say "syntax is ok" and "test is successful"
sudo systemctl restart nginx
```

---

## Step 11 — Point Your Domain to the Server (CPanel)

1. Log in to CPanel
2. Go to **Zone Editor** (sometimes called DNS Zone Editor)
3. Find the **A record** for your domain (e.g. `yourdomain.lk`)
4. Change the IP address to your **EC2 Elastic IP**
5. Also update the `www` A record if there is one
6. Save

DNS changes typically take 5–30 minutes to propagate. You can check progress at [dnschecker.org](https://dnschecker.org) — search for your domain and look for the A record showing your EC2 IP.

**Do not proceed to Step 12 until the domain is pointing to your server.**

---

## Step 12 — Set Up HTTPS with Certbot (SSL)

Once your domain resolves to the EC2 server:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get the SSL certificate (replace with your actual domain)
sudo certbot --nginx -d yourdomain.lk -d www.yourdomain.lk
```

Certbot will:
- Verify you own the domain (by checking that the domain points to this server)
- Issue a free SSL certificate from Let's Encrypt
- Automatically modify your Nginx config to enable HTTPS and redirect HTTP to HTTPS

When prompted, enter your email address and agree to the terms. Choose option **2** (redirect all HTTP to HTTPS) when asked.

After Certbot finishes, test that HTTPS works:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

Open `https://yourdomain.lk` in a browser — you should see the VCareNursing login page with a padlock.

**Certbot auto-renews** the certificate every 90 days automatically. Nothing else needed.

---

## Go-Live Checklist

- [ ] `https://yourdomain.lk` loads the login page
- [ ] Login works and reaches the dashboard
- [ ] File uploads (staff profile picture, documents) go to S3
- [ ] PDF generation works (generate a salary sheet or statement)
- [ ] WhatsApp sending works (send a test statement)
- [ ] Email notifications work (check Gmail sent folder)

---

## Useful Commands (Day-to-Day)

```bash
# SSH into server
ssh -i ~/.ssh/vcarenursing-key.pem ubuntu@<elastic-ip>

# View running containers
docker compose ps

# View live logs
docker compose logs -f

# View backend logs only
docker compose logs -f backend

# Restart after a code update
git pull
docker compose up --build -d

# Stop everything
docker compose down

# Restart without rebuilding
docker compose restart

# Check disk usage
df -h

# Check memory usage
free -h
```

## Updating the App After Code Changes

```bash
# On your local machine
git add .
git commit -m "your message"
git push origin main

# On the EC2 server
ssh -i ~/.ssh/vcarenursing-key.pem ubuntu@<elastic-ip>
cd VCareNursing
git pull
docker compose up --build -d
```

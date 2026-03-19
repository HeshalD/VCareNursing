# VCareNursing Backend API Documentation

## Overview

VCareNursing is a comprehensive healthcare service management platform that connects clients with nursing and caregiving professionals. The backend API provides robust functionality for managing users, service requests, bookings, payments, and administrative operations.

## Technology Stack

- **Runtime**: Node.js with Express.js
- **Database**: PostgreSQL with UUID primary keys
- **Authentication**: JWT-based authentication
- **File Storage**: Cloudinary for image uploads
- **Email**: Nodemailer with SMTP support
- **SMS**: Twilio integration
- **PDF Generation**: Puppeteer and html-pdf-node
- **Scheduling**: Node-cron for automated tasks
- **Password Hashing**: bcrypt

## Database Schema

### Core Tables

#### Users Table
- `user_id` (UUID, Primary Key)
- `mobile_number` (VARCHAR, Unique)
- `password_hash` (VARCHAR)
- `roles` (user_role_enum)
- `is_verified` (BOOLEAN)
- `is_active` (BOOLEAN)
- `created_at`, `updated_at`

#### Client Profiles
- `client_profile_id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `full_name`, `email`, `mobile_number`
- `client_type` (INDIVIDUAL, FAMILY, CORPORATE_PROXY)
- `address`, `city`, `state`

#### Staff Profiles
- `staff_profile_id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `full_name`, `email`, `mobile_number`
- `gender`, `date_of_birth`
- `address`, `city`, `state`
- `current_status`, `availability_status`
- `willing_to_live_in` (BOOLEAN)
- `profile_picture_url`

#### Service Requests
- `request_id` (UUID, Primary Key)
- `client_id` (UUID, Foreign Key)
- `service_type`, `service_category`
- `start_date`, `end_date`
- `location_details`
- `status` (NEW, QUOTE_SENT, CONVERTED, CLOSED)

#### Quotations
- `quote_id` (UUID, Primary Key)
- `estimate_number` (VARCHAR, Unique)
- `request_id` (UUID, Foreign Key)
- `total_amount`, `advance_amount`
- `status`, `valid_until`

#### Bookings
- `booking_id` (UUID, Primary Key)
- `client_id`, `staff_profile_id`, `patient_id`
- `start_date`, `end_date`
- `total_amount`, `monthly_payment`
- `status` (ACTIVE, COMPLETED, TERMINATED)

#### Patient Profiles
- `patient_id` (UUID, Primary Key)
- `client_id` (UUID, Foreign Key)
- `full_name`, `age`, `gender`
- `medical_condition`, `special_requirements`

#### Transactions
- `transaction_id` (UUID, Primary Key)
- `client_id`, `staff_profile_id`
- `booking_id` (UUID, Foreign Key)
- `amount`, `transaction_type`
- `payment_method`, `status`

#### Products
- `product_id` (UUID, Primary Key)
- `category_id` (Integer, Foreign Key)
- `name`, `description`, `price`
- `image_url`, `stock_quantity`

### Enums

#### User Roles
- CLIENT, STAFF, SUPER_ADMIN, ACCOUNTS, COORDINATOR, SALES, STORE_MANAGER, NURSE, CARETAKER, NANNY

#### Client Types
- INDIVIDUAL, FAMILY, CORPORATE_PROXY

#### Genders
- MALE, FEMALE, OTHER

## API Endpoints

### Authentication (`/api/auth`)

#### POST `/register`
Register a new client account
```javascript
{
  mobile_number: "string",
  password: "string",
  full_name: "string",
  email: "string",
  client_type: "INDIVIDUAL|FAMILY|CORPORATE_PROXY"
}
```

#### POST `/login`
User login (supports mobile number or email)
```javascript
{
  identifier: "string", // mobile number or email
  password: "string"
}
```

#### POST `/verify-otp`
Verify OTP for registration
```javascript
{
  user_id: "string",
  otp_code: "string"
}
```

#### POST `/resend-otp`
Resend OTP verification

#### GET `/unified-overview`
Get unified dashboard overview (admin only)

#### GET `/users`
Get all users (admin only)

### Client Management (`/api/client`)

#### PATCH `/update-me`
Update authenticated client profile

#### DELETE `/delete-me`
Delete authenticated client account

#### GET `/`
Get all clients (admin only)

### Staff Management (`/api/staff`)

#### POST `/apply`
Submit staff application with documents
```javascript
// FormData with:
// - application details
// - documents[] (files)
// - profile_picture (file)
```

#### GET `/applications`
Get all staff applications (admin only)

#### POST `/accept`
Accept staff application (admin only)
```javascript
{
  application_id: "string"
}
```

#### POST `/reject`
Reject staff application (admin only)
```javascript
{
  application_id: "string",
  reason: "string"
}
```

#### POST `/login`
Staff login with email

#### POST `/change-password`
Change staff password (first-time login)

#### GET `/available`
Get available staff by role

#### GET `/`
Get all staff with optional filters

#### GET `/:staffId`
Get staff by ID

#### PUT `/:staffId/status`
Update staff availability status

#### GET `/role/:role`
Get staff by specific role

#### GET `/gender/:gender`
Get staff by gender

#### GET `/willing-to-live-in`
Get staff willing to live in

### Service Requests (`/api/service-requests`)

#### POST `/submit-request`
Submit new service request
```javascript
{
  service_type: "string",
  service_category: "string",
  start_date: "date",
  end_date: "date",
  location_details: "object",
  special_requirements: "string"
}
```

#### GET `/all-leads`
Get all service requests (admin only)

#### GET `/new_leads`
Get new unprocessed leads (admin only)

#### GET `/:requestId`
Get service request by ID

#### PUT `/:requestId/status`
Update service request status

### Quotations (`/api/quotes`)

#### POST `/create`
Create new quotation
```javascript
{
  request_id: "string",
  items: [
    {
      description: "string",
      quantity: "number",
      unit_price: "number",
      total: "number"
    }
  ],
  total_amount: "number",
  advance_amount: "number"
}
```

#### GET `/request/:requestId`
Get quotations for a service request

#### POST `/send-pdf/:quoteId`
Send quotation PDF via email

### Bookings (`/api/bookings`)

#### POST `/`
Create new booking

#### POST `/convert`
Convert quotation to booking with payment slip
```javascript
// FormData with:
// - booking details
// - payment_slip (file)
```

#### GET `/my-bookings`
Get authenticated user's bookings

#### GET `/active-bookings`
Get all active bookings (admin only)

#### GET `/`
Get all bookings (admin only)

#### GET `/:bookingId`
Get booking by ID

#### PUT `/:bookingId/status`
Update booking status

#### POST `/terminate/:bookingId`
Request booking termination

#### GET `/terminations/pending`
Get pending termination requests

#### POST `/terminations/approve/:terminationId`
Approve termination request

### Patients (`/api/patients`)

#### POST `/`
Create patient profile

#### GET `/:patientId`
Get patient by ID

#### PUT `/:patientId`
Update patient profile

### Products (`/api/products`)

#### GET `/`
Get all products

#### POST `/`
Create new product with image

#### GET `/:productId`
Get product by ID

#### PUT `/:productId`
Update product

#### DELETE `/:productId`
Delete product

### Statements (`/api/statement`)

#### POST `/:clientId`
Get client statement for date range

#### POST `/download/:clientId`
Download client statement as PDF

### Payments (`/api/payment`)

#### POST `/process`
Process payment

#### GET `/history/:clientId`
Get payment history for client

## Middleware & Security

### Authentication Middleware
- JWT token verification
- Role-based access control
- Token expiration handling

### CORS Configuration
- Environment-based origin whitelist
- Credentials support
- Development fallback origins

### File Upload Handling
- Multer for multipart/form-data
- Cloudinary integration for image storage
- File size and type validation

### Error Handling
- Global error handler
- Structured error responses
- Logging for debugging

## Automated Tasks

### Daily Invoicing Cron Job
- Runs automatically at specified intervals
- Generates monthly invoices for active bookings
- Creates transaction records
- Sends notifications to clients

## Database Migration

### Auto-Migration
- Automatic migration in production environment
- Table creation with proper constraints
- Enum type definitions
- Foreign key relationships

### Manual Migration
```bash
npm run migrate
```

## Environment Variables

### Required Environment Variables
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vcarenursing
DB_USER=vcareuser
DB_PASSWORD=vcarepass123

# Server
PORT=5000
NODE_ENV=production

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=your-number

# Frontend
CLIENT_URL=http://localhost:3000
```

## Deployment

### Docker Deployment
```bash
docker-compose up --build
```

### Render Deployment
- Automatic deployment from GitHub
- PostgreSQL database integration
- Environment variable configuration
- Health check endpoint: `/health`

## Development

### Local Development Setup
1. Install dependencies: `npm install`
2. Set up PostgreSQL database
3. Configure environment variables
4. Run migrations: `npm run migrate`
5. Start development server: `npm run dev`

### Available Scripts
- `npm start` - Production server
- `npm run dev` - Development with nodemon
- `npm run migrate` - Database migration
- `npm test` - Test suite (placeholder)

## API Response Format

### Success Response
```javascript
{
  status: "success",
  data: {...},
  message: "Operation completed successfully"
}
```

### Error Response
```javascript
{
  status: "error",
  message: "Error description",
  error: "Detailed error information"
}
```

## Features Implemented

### User Management
- Client registration with OTP verification
- Staff application and approval workflow
- Role-based authentication system
- Password management with secure hashing

### Service Management
- Service request submission and tracking
- Quotation generation and PDF export
- Booking creation and management
- Service termination workflow

### Staff Management
- Staff application with document upload
- Availability status tracking
- Role and gender-based filtering
- Live-in preference management

### Financial Management
- Transaction recording and tracking
- Automated daily invoicing
- Statement generation and PDF export
- Payment slip processing

### Administrative Features
- Unified dashboard overview
- User management interface
- Service request monitoring
- Financial reporting
- Staff verification system

### Communication
- Email notifications for quotations
- SMS integration via Twilio
- OTP verification system
- Automated invoice notifications

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Input validation and sanitization
- Role-based access control
- Secure file upload handling

## Performance Features

- Database connection pooling
- Efficient query optimization
- File compression for uploads
- Caching strategies
- Health check endpoints

This backend API provides a comprehensive foundation for the VCareNursing healthcare service management platform, supporting all core business operations with robust security and scalability features.

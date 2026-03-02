const db = require('./config/db');

async function migrate() {
  try {
    console.log('Starting database migration...');

    // Create Enums
    await db.query(`
      DO $$ BEGIN
        CREATE TYPE user_role_enum AS ENUM (
          'CLIENT', 'STAFF', 'SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR', 
          'SALES', 'STORE_MANAGER', 'NURSE', 'CARETAKER', 'NANNY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE client_type_enum AS ENUM (
          'INDIVIDUAL', 'FAMILY', 'CORPORATE_PROXY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE gender_enum AS ENUM (
          'MALE', 'FEMALE', 'OTHER'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE gender_preference_enum AS ENUM (
          'MALE', 'FEMALE', 'ANY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE service_model_enum AS ENUM (
          'LIVE_IN', 'SHIFT_BASED', 'VISITING'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE payment_method AS ENUM (
          'BANK_TRANSFER', 'CASH', 'WALLET', 'ONLINE_GATEWAY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE transaction_category AS ENUM (
          'CLIENT_PAYMENT', 'WALLET_REFUND', 'STAFF_SALARY', 
          'AGENCY_FEE', 'SERVICE_INVOICE'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.query(`
      DO $$ BEGIN
        CREATE TYPE transaction_type_enum AS ENUM (
          'CREDIT', 'DEBIT'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create Tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        mobile_number VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        email VARCHAR(255) UNIQUE,
        is_email_verified BOOLEAN DEFAULT false,
        role user_role_enum[] DEFAULT ARRAY['CLIENT']
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS categories (
        category_id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS client_profiles (
        client_profile_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        full_name VARCHAR(100) NOT NULL,
        client_type client_type_enum DEFAULT 'INDIVIDUAL',
        is_registration_fee_paid BOOLEAN DEFAULT false,
        wallet_balance NUMERIC(12,2) DEFAULT 0.00,
        primary_address TEXT,
        gps_coordinates POINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        gender gender_enum
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS staff_profiles (
        staff_profile_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        full_name VARCHAR(100) NOT NULL,
        designation VARCHAR(50),
        current_earnings NUMERIC(12,2) DEFAULT 0.00,
        advance_threshold_amount NUMERIC(12,2) DEFAULT 15000.00,
        verification_status VARCHAR(20) DEFAULT 'PENDING',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        qualifications TEXT,
        document_urls TEXT[],
        home_address TEXT,
        location VARCHAR(100),
        gps_coordinates POINT,
        current_status VARCHAR(20) DEFAULT 'AVAILABLE',
        profile_picture_url TEXT,
        gender gender_enum,
        willing_to_live_in BOOLEAN DEFAULT false,
        date_of_birth DATE
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS staff_applications (
        application_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        mobile_number VARCHAR(20) NOT NULL,
        applied_roles user_role_enum[] NOT NULL,
        qualifications TEXT,
        document_urls TEXT[],
        status VARCHAR(20) DEFAULT 'PENDING',
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        home_address TEXT NOT NULL,
        gps_coordinates POINT,
        location VARCHAR(100),
        rejection_reason TEXT,
        profile_picture_url TEXT,
        gender gender_enum,
        date_of_birth DATE,
        willing_to_live_in BOOLEAN DEFAULT false
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        request_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        client_id UUID REFERENCES client_profiles(client_profile_id),
        payer_name VARCHAR(255),
        payer_mobile VARCHAR(20),
        patient_name VARCHAR(255),
        patient_age INTEGER,
        patient_condition TEXT,
        service_type VARCHAR(50),
        location_address TEXT,
        gps_coordinates POINT,
        start_date DATE,
        status VARCHAR(20) DEFAULT 'NEW_LEAD',
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        relationship_to_client VARCHAR(100),
        service_model service_model_enum DEFAULT 'SHIFT_BASED',
        preferred_gender gender_preference_enum DEFAULT 'ANY',
        preferred_staff_id UUID REFERENCES staff_profiles(staff_profile_id),
        active_quote_id UUID
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        quote_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        estimate_number VARCHAR(20) UNIQUE,
        request_id UUID NOT NULL REFERENCES service_requests(request_id),
        registration_fee NUMERIC(12,2) DEFAULT 10000.00,
        daily_rate NUMERIC(12,2) NOT NULL,
        qty_days INTEGER DEFAULT 7 NOT NULL,
        transport_fee NUMERIC(12,2) DEFAULT 0.00,
        sub_total NUMERIC(12,2) NOT NULL,
        total_amount NUMERIC(12,2) NOT NULL,
        estimate_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'SENT',
        terms_conditions TEXT DEFAULT 'The initial estimated amount is non-refundable.',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_slips (
        slip_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        quote_id UUID REFERENCES quotations(quote_id),
        slip_url TEXT NOT NULL,
        verified_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        booking_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id),
        patient_id UUID NOT NULL,
        service_type VARCHAR(50),
        start_date DATE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assigned_staff_id UUID REFERENCES staff_profiles(staff_profile_id),
        service_model service_model_enum DEFAULT 'SHIFT_BASED',
        preferred_gender gender_preference_enum DEFAULT 'ANY',
        request_id UUID REFERENCES service_requests(request_id)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS patient_profiles (
        patient_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id),
        full_name VARCHAR(255) NOT NULL,
        age INTEGER NOT NULL,
        relationship_to_client VARCHAR(50),
        medical_condition TEXT,
        special_remarks TEXT,
        is_registration_fee_paid BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        residential_address TEXT,
        emergency_contact_name VARCHAR(100),
        emergency_contact_number VARCHAR(20),
        gender gender_enum
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_terminations (
        termination_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        booking_id UUID NOT NULL REFERENCES bookings(booking_id),
        requested_by VARCHAR(20) NOT NULL,
        urgency VARCHAR(20) NOT NULL,
        requested_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_date DATE
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        client_id UUID REFERENCES client_profiles(client_profile_id),
        staff_profile_id UUID REFERENCES staff_profiles(staff_profile_id),
        booking_id UUID REFERENCES bookings(booking_id),
        quote_id UUID REFERENCES quotations(quote_id),
        category transaction_category NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_method payment_method,
        receipt_url TEXT,
        reference_number VARCHAR(100),
        verified_by UUID REFERENCES users(user_id),
        status VARCHAR(20) DEFAULT 'COMPLETED',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        transaction_type transaction_type_enum
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        product_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        category_id INTEGER REFERENCES categories(category_id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(12,2) NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        image_url TEXT,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        otp_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        otp_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_request_preferred_staff 
      ON service_requests(preferred_staff_id);
    `);

    // Add foreign key for quotations active_quote_id
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE service_requests 
        ADD CONSTRAINT service_requests_active_quote_id_fkey 
        FOREIGN KEY (active_quote_id) REFERENCES quotations(quote_id);
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Database migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrate;

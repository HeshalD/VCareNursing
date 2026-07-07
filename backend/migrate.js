const db = require('./config/db');
const bcrypt = require('bcrypt');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrate(retries = 5, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Migration attempt ${attempt}/${retries}...`);
      await runMigration();
      console.log('Database migration completed successfully');
      return;
    } catch (error) {
      console.error(`Migration attempt ${attempt} failed:`, error.message);

      if (attempt === retries) {
        console.error('All migration attempts exhausted. Giving up.');
        throw error;
      }

      console.log(`Retrying in ${delay / 1000}s...`);
      await wait(delay);
    }
  }
}

async function runMigration() {
  console.log('Starting database migration...');

  // Keep running idempotent schema reconciliation even on existing databases.
  // This ensures older deployments receive enum updates and new columns.
  const tableCheck = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    );
  `);

  if (tableCheck.rows[0].exists) {
    console.log('Database already contains users table. Running reconciliation steps...');
  }

  // =========================================================
  // ENUMS
  // =========================================================

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE user_role_enum AS ENUM (
        'CLIENT', 'STAFF', 'SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR',
        'SALES', 'STORE_MANAGER', 'NURSE', 'CARETAKER', 'NANNY',
        'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Service-team roles added alongside NURSE/CARETAKER/NANNY for existing databases
  await db.query(`
    DO $$ BEGIN
      ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'NURSING_ASSISTANT';
      ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'PHYSIOTHERAPIST';
      ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'COUNSELLOR';
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
        'BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE', 'WALLET', 'ONLINE_GATEWAY'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'CASH_DEPOSIT';
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'CASH';
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'CHEQUE';
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'WALLET';
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'ONLINE_GATEWAY';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE transaction_category AS ENUM (
        'CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_REFUND', 'STAFF_SALARY', 
        'AGENCY_FEE', 'SERVICE_INVOICE', 'REGISTRATION_FEE', 'BOOKING_SETTLEMENT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'REGISTRATION_FEE';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Ensure STAFF_SALARY_PAID exists for payout/debit transactions
  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'STAFF_SALARY_PAID';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'WALLET_TOPUP';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'WALLET_DEBIT';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Categories for manually recorded (off-platform) transactions
  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'OTHER_INCOME';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'OTHER_EXPENSE';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Salary advances recorded in the main ledger (money out)
  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'STAFF_ADVANCE';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Manual deductions applied to staff earnings
  await db.query(`
    DO $$ BEGIN
      ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'STAFF_DEDUCTION';
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

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE wallet_transaction_type AS ENUM (
        'CREDIT', 'DEBIT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE advance_status AS ENUM (
        'PENDING', 'APPROVED', 'REJECTED'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // =========================================================
  // CORE TABLES
  // =========================================================

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
      role user_role_enum[] DEFAULT ARRAY['CLIENT'::user_role_enum]
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
    CREATE TABLE IF NOT EXISTS bank_accounts (
      account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      account_nickname VARCHAR(100) NOT NULL,
      account_number VARCHAR(50) NOT NULL UNIQUE,
      account_holder_name VARCHAR(255) NOT NULL,
      bank_name VARCHAR(100) NOT NULL,
      branch_name VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      currency VARCHAR(5) DEFAULT 'LKR',
      opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      opening_balance_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_by UUID REFERENCES users(user_id)

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
      nic_number VARCHAR(30),
      nic_front_url TEXT,
      nic_back_url TEXT,
      gender gender_enum,
      willing_to_live_in BOOLEAN DEFAULT false,
      date_of_birth DATE,
      average_rating DECIMAL(3,2) DEFAULT 0.00,
      total_reviews INTEGER DEFAULT 0
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
      nic_number VARCHAR(30),
      nic_front_url TEXT,
      nic_back_url TEXT,
      gender gender_enum,
      date_of_birth DATE,
      willing_to_live_in BOOLEAN DEFAULT false,
      agreement_sent_at TIMESTAMP WITH TIME ZONE
    );
  `);

  // ALTER TABLE: track when the contractor agreement (terms & conditions) was sent to the applicant
  await db.query(`
    ALTER TABLE staff_applications
    ADD COLUMN IF NOT EXISTS agreement_sent_at TIMESTAMP WITH TIME ZONE;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_app_otps (
      id SERIAL PRIMARY KEY,
      application_id UUID REFERENCES staff_applications(application_id) ON DELETE CASCADE,
      otp_code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
      active_quote_id UUID,
      gender gender_enum
    );
  `);

  // Tracks which staff profiles have been sent to a client as candidates for a service request.
  // The UNIQUE constraint enforces "send a given staff profile only once per service request".
  await db.query(`
    CREATE TABLE IF NOT EXISTS service_request_sent_candidates (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      sent_by UUID REFERENCES users(user_id),
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (request_id, staff_profile_id)
    );
  `);

  // bookings must exist before quotations / booking_payment_tracking reference it
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
      request_id UUID REFERENCES service_requests(request_id),
      service_mode VARCHAR(20),
      scheduled_end_time TIMESTAMP,
      actual_end_time TIMESTAMP,
      ot_rate DECIMAL(10,2) DEFAULT 500.00,
      daily_rate DECIMAL(10,2),
      amount_quotated DECIMAL(12,2),
      amount_paid DECIMAL(12,2) DEFAULT 0.00
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
      booking_id UUID REFERENCES bookings(booking_id),
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
    CREATE TABLE IF NOT EXISTS payment_tracking (
      payment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      quote_id UUID NOT NULL REFERENCES quotations(quote_id),
      client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id),
      amount_received DECIMAL(12, 2) NOT NULL,
      payment_method VARCHAR(50),
      slip_url TEXT,
      payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP WITH TIME ZONE,
      verified_by UUID REFERENCES users(user_id),
      status VARCHAR(20) DEFAULT 'PENDING',
      notes TEXT
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_payment_tracking (
      booking_payment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      payment_tracking_id UUID REFERENCES payment_tracking(payment_id),
      booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
      quote_id UUID REFERENCES quotations(quote_id),
      client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id),
      amount_received DECIMAL(12, 2) NOT NULL,
      payment_method VARCHAR(50),
      bank_account_id UUID REFERENCES bank_accounts(account_id),
      cheque_number VARCHAR(50),
      cheque_date DATE,
      reference_number VARCHAR(100),
      slip_url TEXT,
      payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP WITH TIME ZONE,
      verified_by UUID REFERENCES users(user_id),
      status VARCHAR(20) DEFAULT 'VERIFIED',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS booking_staff_assignments (
      assignment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id),
      assigned_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      assigned_by UUID REFERENCES users(user_id),
      daily_rate DECIMAL(12, 2) NOT NULL,
      service_start_date DATE NOT NULL,
      service_end_date DATE,
      quote_id UUID REFERENCES quotations(quote_id),
      amount_allocated DECIMAL(12, 2),
      status VARCHAR(20) DEFAULT 'ACTIVE',
      notes TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      payment_tracking_id UUID REFERENCES payment_tracking(payment_id),
      client_id UUID REFERENCES client_profiles(client_profile_id),
      staff_profile_id UUID REFERENCES staff_profiles(staff_profile_id),
      booking_id UUID REFERENCES bookings(booking_id),
      quote_id UUID REFERENCES quotations(quote_id),
      category transaction_category NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      payment_method VARCHAR(50),
      bank_account_id UUID REFERENCES bank_accounts(account_id),
      cheque_number VARCHAR(50),
      cheque_date DATE,
      receipt_url TEXT,
      reference_number VARCHAR(100),
      verified_by UUID REFERENCES users(user_id),
      status VARCHAR(20) DEFAULT 'COMPLETED',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      transaction_type transaction_type_enum
    );
  `);

    // =========================================================
    // STAFF PAYMENTS / BANK ACCOUNTS
    // =========================================================

    await db.query(`
      CREATE TABLE IF NOT EXISTS staff_bank_accounts (
        staff_bank_account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
        account_holder_name VARCHAR(255) NOT NULL,
        bank_name VARCHAR(100) NOT NULL,
        branch_name VARCHAR(100),
        account_number VARCHAR(50) NOT NULL,
        currency VARCHAR(5) DEFAULT 'LKR',
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_bank_accounts_staff_profile_id
      ON staff_bank_accounts(staff_profile_id);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS staff_payments_tracking (
        staff_payment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
        company_bank_account_id UUID REFERENCES bank_accounts(account_id),
        staff_bank_account_id UUID REFERENCES staff_bank_accounts(staff_bank_account_id),
        transaction_id UUID REFERENCES transactions(transaction_id),
        amount_paid NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(50),
        reference_number VARCHAR(100),
        notes TEXT,
        paid_by UUID REFERENCES users(user_id),
        paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'COMPLETED',
        salary_sheet_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      ALTER TABLE staff_payments_tracking
      ADD COLUMN IF NOT EXISTS salary_sheet_url TEXT;
    `);

    await db.query(`
      ALTER TABLE staff_payments_tracking
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_payments_staff_profile_id
      ON staff_payments_tracking(staff_profile_id);
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_wallet (
      wallet_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID NOT NULL UNIQUE REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_wallet_transactions (
      transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      type wallet_transaction_type NOT NULL,
      amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
      reason VARCHAR(100) NOT NULL,
      reference_id UUID,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_advances (
      advance_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      amount_requested DECIMAL(12, 2) NOT NULL CHECK (amount_requested > 0),
      status advance_status NOT NULL DEFAULT 'PENDING',
      requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMP WITH TIME ZONE,
      rejected_reason VARCHAR(255)
    );
  `);

  // Staff leave requests — staff request time off, admin approves/rejects.
  // Approved leaves are purely calendar markers (no pay/wallet impact).
  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_leave_requests (
      leave_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMP WITH TIME ZONE,
      reviewed_by_user_id UUID REFERENCES users(user_id),
      reviewed_by_name TEXT,
      rejected_reason TEXT,
      CHECK (end_date >= start_date)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff_status
    ON staff_leave_requests(staff_profile_id, status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_status_start
    ON staff_leave_requests(status, start_date);
  `);

  // =========================================================
  // SPRINT 2 TABLES
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_swaps (
      swap_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID REFERENCES bookings(booking_id),
      old_staff_id UUID REFERENCES staff_profiles(staff_profile_id),
      new_staff_id UUID REFERENCES staff_profiles(staff_profile_id),
      swap_reason TEXT,
      swapped_at TIMESTAMP DEFAULT NOW(),
      swapped_by UUID REFERENCES users(user_id),
      arrival_time TIMESTAMP,
      billing_gap BOOLEAN DEFAULT FALSE
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_alerts (
      alert_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID REFERENCES bookings(booking_id),
      client_id UUID REFERENCES client_profiles(client_profile_id),
      alert_type VARCHAR(50),
      message TEXT,
      sent_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Queue of admin actions that must take effect on a future date (executed by
  // the daily enforcer in cron/scheduledActions.js). The booking stays in its
  // normal status until execution, so existing 'ACTIVE' queries keep working.
  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduled_actions (
      action_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
      action_type VARCHAR(30) NOT NULL,        -- TERMINATION | COMPLETION | STAFF_SWAP | ASSIGNMENT_START | SHIFT_PATTERN_CHANGE | SHIFT_REASSIGNMENT
      effective_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'SCHEDULED',   -- SCHEDULED | EXECUTED | CANCELLED | FAILED
      payload JSONB NOT NULL DEFAULT '{}',      -- action-specific args
      reason TEXT,
      termination_id UUID REFERENCES service_terminations(termination_id),
      created_by UUID REFERENCES users(user_id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      executed_at TIMESTAMP WITH TIME ZONE,
      error_text TEXT
    );
  `);

  // At most one open (SCHEDULED) action per booking + type.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_scheduled_action
      ON scheduled_actions (booking_id, action_type)
      WHERE status = 'SCHEDULED'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      otp_code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_reviews (
      review_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID REFERENCES staff_profiles(staff_profile_id),
      client_profile_id UUID REFERENCES client_profiles(client_profile_id),
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT,
      is_visible BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // =========================================================
  // INTERNAL STAFF TABLES
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS internal_staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20),
      base_salary DECIMAL(10,2) DEFAULT 0.00,
      joined_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) DEFAULT 'Active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS internal_staff_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID REFERENCES internal_staff(id) ON DELETE CASCADE,
      task_type VARCHAR(100) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'Pending',
      assigned_date DATE DEFAULT CURRENT_DATE,
      completed_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS internal_staff_payroll (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID REFERENCES internal_staff(id) ON DELETE CASCADE,
      amount DECIMAL(10,2) NOT NULL,
      payment_month VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'Pending',
      paid_on TIMESTAMP WITH TIME ZONE,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // SALESPERSON CREDITING
  // Salespersons are internal_staff. The amount paid to a booking (at the time
  // staff assignment is completed) is credited once to the salesperson who
  // brought the booking in, along with a +1 to their booking count. These two
  // aggregates are PERMANENT and never move. The "current" salesperson is a
  // mutable pointer that can be switched anytime without affecting either metric.
  // booking_salesperson_assignments keeps the full audit trail.
  // =========================================================

  await db.query(`
    ALTER TABLE internal_staff
    ADD COLUMN IF NOT EXISTS total_sales_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bookings_brought_count INTEGER NOT NULL DEFAULT 0
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_salesperson_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
      salesperson_id UUID NOT NULL REFERENCES internal_staff(id),
      credited_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      is_current BOOLEAN NOT NULL DEFAULT TRUE,
      is_origin BOOLEAN NOT NULL DEFAULT FALSE,
      action VARCHAR(20) NOT NULL DEFAULT 'CREDITED',
      switch_reason TEXT,
      assigned_by UUID REFERENCES users(user_id),
      assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // At most one current salesperson and one origin salesperson per booking.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_sales_one_current
    ON booking_salesperson_assignments(booking_id) WHERE is_current
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_sales_one_origin
    ON booking_salesperson_assignments(booking_id) WHERE is_origin
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_book_sales_salesperson
    ON booking_salesperson_assignments(salesperson_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_book_sales_booking
    ON booking_salesperson_assignments(booking_id)
  `);

  // =========================================================
  // STAFF CHANGE REQUESTS
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_change_requests (
      request_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
      request_type VARCHAR(50) NOT NULL,
      requested_changes JSONB NOT NULL,
      target_bank_account_id UUID REFERENCES staff_bank_accounts(staff_bank_account_id),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      reviewer_user_id UUID REFERENCES users(user_id),
      reviewer_name VARCHAR(255),
      reviewed_at TIMESTAMP WITH TIME ZONE,
      review_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_change_request_logs (
      log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      request_id UUID NOT NULL REFERENCES staff_change_requests(request_id) ON DELETE CASCADE,
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id),
      action VARCHAR(50) NOT NULL,
      performed_by_user_id UUID REFERENCES users(user_id),
      performed_by_name VARCHAR(255) NOT NULL,
      changes_snapshot JSONB,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // ACTIVITY LOG
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      actor_user_id UUID REFERENCES users(user_id),
      actor_name VARCHAR(255) NOT NULL,
      actor_role VARCHAR(50) NOT NULL,
      action_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id UUID,
      details JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // RBAC: Per-user permission grants
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_permissions (
      user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      permission_key VARCHAR(100) NOT NULL,
      granted_by UUID REFERENCES users(user_id),
      granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, permission_key)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_permissions_user
    ON staff_permissions (user_id);
  `);

  // =========================================================
  // ALTER TABLE: Add payment tracking columns
  // =========================================================

  await db.query(`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(account_id),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cheque_date DATE,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE payment_tracking
    ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(account_id),
    ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cheque_date DATE,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE booking_payment_tracking
    ADD COLUMN IF NOT EXISTS payment_tracking_id UUID REFERENCES payment_tracking(payment_id),
    ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(account_id),
    ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cheque_date DATE,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS payment_tracking_id UUID REFERENCES payment_tracking(payment_id)
  `);

  // Manual (off-platform) transaction support
  await db.query(`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS external_party VARCHAR(255),
    ADD COLUMN IF NOT EXISTS transaction_date DATE
  `);

  await db.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_quotated DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE
  `);

  await db.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS admin_notes TEXT
  `);

  // Time of day the assigned staff begins the service (e.g. 09:00). Optional.
  await db.query(`
    ALTER TABLE booking_staff_assignments
    ADD COLUMN IF NOT EXISTS service_start_time TIME
  `);

  // Care profile (patient) gender captured on the lead/service request
  await db.query(`
    ALTER TABLE service_requests
    ADD COLUMN IF NOT EXISTS gender gender_enum
  `);

  // =========================================================
  // MODULAR QUOTATION TABLES
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS quote_preset_items (
      preset_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      item_type VARCHAR(50) NOT NULL,
      description VARCHAR(255),
      default_quantity NUMERIC(12,2) DEFAULT 1,
      default_unit_price NUMERIC(12,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS quote_line_items (
      line_item_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      quote_id UUID NOT NULL REFERENCES quotations(quote_id) ON DELETE CASCADE,
      item_type VARCHAR(50) NOT NULL,
      description VARCHAR(255) NOT NULL,
      quantity NUMERIC(12,2) DEFAULT 1,
      unit_price NUMERIC(12,2) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_preset_item BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // CLIENT NOTES
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_notes (
      note_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id) ON DELETE CASCADE,
      booking_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,
      note_text TEXT NOT NULL,
      note_type VARCHAR(50) DEFAULT 'GENERAL',
      created_by_user_id UUID REFERENCES users(user_id),
      created_by_name VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // CLIENT PAYMENT RECORDING (independent admin payment system)
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_payment_records (
      record_id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id           UUID NOT NULL REFERENCES client_profiles(client_profile_id) ON DELETE RESTRICT,
      total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
      payment_method      VARCHAR(50) NOT NULL,
      bank_account_id     UUID REFERENCES bank_accounts(account_id),
      cheque_number       VARCHAR(50),
      cheque_date         DATE,
      reference_number    VARCHAR(100),
      slip_url            TEXT,
      notes               TEXT,
      recorded_by         UUID NOT NULL REFERENCES users(user_id),
      recorded_by_name    VARCHAR(255) NOT NULL,
      created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_payment_allocations (
      allocation_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      record_id           UUID NOT NULL REFERENCES client_payment_records(record_id) ON DELETE CASCADE,
      allocation_type     VARCHAR(20) NOT NULL CHECK (allocation_type IN ('BOOKING', 'NEW_BOOKING', 'WALLET')),
      amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      booking_id          UUID REFERENCES bookings(booking_id),
      transaction_id      UUID REFERENCES transactions(transaction_id),
      booking_payment_id  UUID REFERENCES booking_payment_tracking(booking_payment_id),
      created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // INDEXES
  // =========================================================

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_request_preferred_staff 
    ON service_requests(preferred_staff_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_user 
    ON password_reset_otps(user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote_id 
    ON quote_line_items(quote_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_payment_tracking_booking_id
    ON booking_payment_tracking(booking_id);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_payment_tracking_payment_tracking_id
    ON booking_payment_tracking(payment_tracking_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_payment_tracking_status
    ON booking_payment_tracking(status);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_tracking_id
    ON transactions(payment_tracking_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_category
    ON transactions(category);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_quote_preset_items_active
    ON quote_preset_items(is_active);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_change_requests_staff
    ON staff_change_requests(staff_profile_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_change_requests_status
    ON staff_change_requests(status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_change_request_logs_request
    ON staff_change_request_logs(request_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_actor
    ON activity_log(actor_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_entity
    ON activity_log(entity_type, entity_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_created
    ON activity_log(created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_notes_client_id
    ON client_notes(client_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_notes_booking_id
    ON client_notes(booking_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_notes_created_at
    ON client_notes(created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_payment_records_client_id
    ON client_payment_records(client_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_payment_records_created_at
    ON client_payment_records(created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_payment_allocations_record_id
    ON client_payment_allocations(record_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_payment_allocations_booking_id
    ON client_payment_allocations(booking_id);
  `);

  // =========================================================
  // DEFERRED FOREIGN KEYS
  // =========================================================

  await db.query(`
    DO $$ BEGIN
      ALTER TABLE service_requests 
      ADD CONSTRAINT service_requests_active_quote_id_fkey 
      FOREIGN KEY (active_quote_id) REFERENCES quotations(quote_id);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // =========================================================
  // COLUMN ADDITIONS (safe to re-run)
  // =========================================================

  // Self-reported/admin-set years of experience. Stored as a fixed code
  // (1_YEAR .. 5_YEARS, MORE_THAN_5_YEARS) rather than a free-text/number so
  // it stays consistent with the selectable options on the worker dashboard
  // and admin staff detail page.
  await db.query(`ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20)`);
  await db.query(`ALTER TABLE staff_applications ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20)`);
  await db.query(`ALTER TABLE staff_profiles ALTER COLUMN designation TYPE VARCHAR(200)`);

  // Compliance documents — Grama Niladhari Report and Police Report uploaded by staff post-acceptance.
  // doc_upload_token is a stable UUID used as the public upload portal key (no login required).
  await db.query(`ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS doc_upload_token UUID UNIQUE DEFAULT gen_random_uuid()`);
  await db.query(`ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS grama_niladhari_url TEXT`);
  await db.query(`ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS police_report_url TEXT`);
  await db.query(`ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS doc_request_sent_at TIMESTAMP WITH TIME ZONE`);
  // Backfill token for profiles created before this migration
  await db.query(`UPDATE staff_profiles SET doc_upload_token = gen_random_uuid() WHERE doc_upload_token IS NULL`);

  await db.query(`
    DO $$ BEGIN
      ALTER TABLE staff_profiles ADD COLUMN admin_remarks TEXT;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;
  `);

  await db.query(`
    DO $$ BEGIN
      ALTER TABLE staff_profiles ADD COLUMN staff_code VARCHAR(50) UNIQUE;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;
  `);

  // Multiple admin notes per staff profile (carousel on the staff detail page).
  // On first creation, seed from the legacy single `admin_remarks` field so existing notes aren't lost.
  await db.query(`
    DO $$ BEGIN
      IF to_regclass('public.staff_admin_notes') IS NULL THEN
        CREATE TABLE staff_admin_notes (
          note_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id) ON DELETE CASCADE,
          note TEXT NOT NULL,
          created_by UUID REFERENCES users(user_id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_staff_admin_notes_profile ON staff_admin_notes(staff_profile_id);
        INSERT INTO staff_admin_notes (staff_profile_id, note)
        SELECT staff_profile_id, admin_remarks
        FROM staff_profiles
        WHERE admin_remarks IS NOT NULL AND TRIM(admin_remarks) <> '';
      END IF;
    END $$;
  `);

  await db.query(`
    ALTER TABLE internal_staff ADD COLUMN IF NOT EXISTS address TEXT;
  `);

  await db.query(`
    ALTER TABLE staff_advances
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(user_id),
      ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(255);
  `);

  // =========================================================
  // SAVED STATEMENTS
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS saved_statements (
      statement_id   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id      UUID NOT NULL REFERENCES client_profiles(client_profile_id),
      period_start   DATE NOT NULL,
      period_end     DATE NOT NULL,
      opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_invoiced  DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_paid      DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_due     DECIMAL(12,2) NOT NULL DEFAULT 0,
      pdf_url         TEXT,
      delivery_method VARCHAR(20) NOT NULL DEFAULT 'DOWNLOAD',
      generated_by    UUID REFERENCES users(user_id),
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // =========================================================
  // HUMAN-READABLE CODES
  // =========================================================

  await db.query(`CREATE SEQUENCE IF NOT EXISTS termination_code_seq START 1`);
  await db.query(`ALTER TABLE service_terminations ADD COLUMN IF NOT EXISTS termination_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE service_terminations
    SET termination_code = 'TER-' || LPAD(nextval('termination_code_seq')::text, 5, '0')
    WHERE termination_code IS NULL
  `);
  await db.query(`
    ALTER TABLE service_terminations
    ALTER COLUMN termination_code SET DEFAULT 'TER-' || LPAD(nextval('termination_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS client_code_seq START 1`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS client_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE client_profiles
    SET client_code = 'CL-' || LPAD(nextval('client_code_seq')::text, 5, '0')
    WHERE client_code IS NULL
  `);
  await db.query(`
    ALTER TABLE client_profiles
    ALTER COLUMN client_code SET DEFAULT 'CL-' || LPAD(nextval('client_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1`);
  await db.query(`ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS patient_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE patient_profiles
    SET patient_code = 'CP-' || LPAD(nextval('patient_code_seq')::text, 5, '0')
    WHERE patient_code IS NULL
  `);
  await db.query(`
    ALTER TABLE patient_profiles
    ALTER COLUMN patient_code SET DEFAULT 'CP-' || LPAD(nextval('patient_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS advance_code_seq START 1`);
  await db.query(`ALTER TABLE staff_advances ADD COLUMN IF NOT EXISTS advance_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE staff_advances
    SET advance_code = 'AR-' || LPAD(nextval('advance_code_seq')::text, 5, '0')
    WHERE advance_code IS NULL
  `);
  await db.query(`
    ALTER TABLE staff_advances
    ALTER COLUMN advance_code SET DEFAULT 'AR-' || LPAD(nextval('advance_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS service_request_code_seq START 1`);
  await db.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS service_request_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE service_requests
    SET service_request_code = 'SR-' || LPAD(nextval('service_request_code_seq')::text, 5, '0')
    WHERE service_request_code IS NULL
  `);
  await db.query(`
    ALTER TABLE service_requests
    ALTER COLUMN service_request_code SET DEFAULT 'SR-' || LPAD(nextval('service_request_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS booking_code_seq START 1`);
  await db.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE bookings
    SET booking_code = 'BK-' || LPAD(nextval('booking_code_seq')::text, 5, '0')
    WHERE booking_code IS NULL
  `);
  await db.query(`
    ALTER TABLE bookings
    ALTER COLUMN booking_code SET DEFAULT 'BK-' || LPAD(nextval('booking_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS transaction_code_seq START 1`);
  await db.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE transactions
    SET transaction_code = 'TR-' || LPAD(nextval('transaction_code_seq')::text, 7, '0')
    WHERE transaction_code IS NULL
  `);
  await db.query(`
    ALTER TABLE transactions
    ALTER COLUMN transaction_code SET DEFAULT 'TR-' || LPAD(nextval('transaction_code_seq')::text, 7, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS change_request_code_seq START 1`);
  await db.query(`ALTER TABLE staff_change_requests ADD COLUMN IF NOT EXISTS change_request_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE staff_change_requests
    SET change_request_code = 'CHR-' || LPAD(nextval('change_request_code_seq')::text, 5, '0')
    WHERE change_request_code IS NULL
  `);
  await db.query(`
    ALTER TABLE staff_change_requests
    ALTER COLUMN change_request_code SET DEFAULT 'CHR-' || LPAD(nextval('change_request_code_seq')::text, 5, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS staff_application_code_seq START 1`);
  await db.query(`ALTER TABLE staff_applications ADD COLUMN IF NOT EXISTS application_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE staff_applications
    SET application_code = 'SA-' || LPAD(nextval('staff_application_code_seq')::text, 5, '0')
    WHERE application_code IS NULL
  `);
  await db.query(`
    ALTER TABLE staff_applications
    ALTER COLUMN application_code SET DEFAULT 'SA-' || LPAD(nextval('staff_application_code_seq')::text, 5, '0')
  `);

  await db.query(`ALTER TABLE saved_statements ADD COLUMN IF NOT EXISTS statement_source VARCHAR(10) DEFAULT 'BOOKING'`);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS statement_code_seq START 1`);
  await db.query(`ALTER TABLE saved_statements ADD COLUMN IF NOT EXISTS statement_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE saved_statements
    SET statement_code = 'STM-' || LPAD(nextval('statement_code_seq')::text, 7, '0')
    WHERE statement_code IS NULL
  `);
  await db.query(`
    ALTER TABLE saved_statements
    ALTER COLUMN statement_code SET DEFAULT 'STM-' || LPAD(nextval('statement_code_seq')::text, 7, '0')
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS review_code_seq START 1`);
  await db.query(`ALTER TABLE staff_reviews ADD COLUMN IF NOT EXISTS review_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE staff_reviews
    SET review_code = 'RV-' || LPAD(nextval('review_code_seq')::text, 7, '0')
    WHERE review_code IS NULL
  `);
  await db.query(`
    ALTER TABLE staff_reviews
    ALTER COLUMN review_code SET DEFAULT 'RV-' || LPAD(nextval('review_code_seq')::text, 7, '0')
  `);

  // Link reviews to a specific booking (one review per booking per client)
  await db.query(`ALTER TABLE staff_reviews ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_review_per_booking
    ON staff_reviews(booking_id, client_profile_id)
    WHERE booking_id IS NOT NULL
  `);

  // Link internal_staff to a users login account (only for COORDINATOR/ACCOUNTS roles)
  await db.query(`
    ALTER TABLE internal_staff
    ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE SET NULL
  `);

  // =========================================================
  // DAILY ATTENDANCE & MANUAL DAILY INVOICING
  // =========================================================

  await db.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS invoicing_mode VARCHAR(10) NOT NULL DEFAULT 'AUTO'
  `);

  // Non-LIVE_IN bookings are always treated as manual by the app regardless of
  // this value, but backfill it explicitly so the column reflects real behavior.
  await db.query(`
    UPDATE bookings SET invoicing_mode = 'MANUAL' WHERE service_model != 'LIVE_IN'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_daily_attendance (
      attendance_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID NOT NULL REFERENCES bookings(booking_id),
      assignment_id UUID NOT NULL REFERENCES booking_staff_assignments(assignment_id),
      staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id),
      service_date DATE NOT NULL,
      in_time TIMESTAMP WITH TIME ZONE,
      out_time TIMESTAMP WITH TIME ZONE,
      hours_served NUMERIC(5,2),
      entry_mode VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
      salary_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      salary_amount NUMERIC(12,2),
      salary_transaction_id UUID REFERENCES transactions(transaction_id),
      decided_by_user_id UUID REFERENCES users(user_id),
      decided_by_name VARCHAR(255),
      decided_at TIMESTAMP WITH TIME ZONE,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (assignment_id, service_date)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_daily_invoices (
      daily_invoice_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID NOT NULL REFERENCES bookings(booking_id),
      service_date DATE NOT NULL,
      entry_mode VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      amount NUMERIC(12,2),
      transaction_id UUID REFERENCES transactions(transaction_id),
      decided_by_user_id UUID REFERENCES users(user_id),
      decided_by_name VARCHAR(255),
      decided_at TIMESTAMP WITH TIME ZONE,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (booking_id, service_date)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_daily_attendance_booking_id
    ON staff_daily_attendance(booking_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_daily_attendance_service_date
    ON staff_daily_attendance(service_date);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_daily_attendance_salary_status
    ON staff_daily_attendance(salary_status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_daily_invoices_booking_id
    ON booking_daily_invoices(booking_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_daily_invoices_status
    ON booking_daily_invoices(status);
  `);

  // =========================================================
  // PAYMENT RECEIPTS
  // One receipt per recorded client payment (unified client payment,
  // direct booking payment, or quote payment). The PDF is stored on
  // Cloudinary and delivery over WhatsApp is tracked per receipt.
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS payment_receipts (
      receipt_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id         UUID NOT NULL REFERENCES client_profiles(client_profile_id),
      source_type       VARCHAR(20) NOT NULL,          -- CLIENT_PAYMENT | BOOKING_PAYMENT | QUOTE_PAYMENT
      source_id         UUID,                          -- record_id / booking_payment_id / payment_id of the originating payment
      total_amount      NUMERIC(12,2) NOT NULL,
      payment_method    VARCHAR(20),
      payment_date      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      reference_number  VARCHAR(100),
      cheque_number     VARCHAR(100),
      bank_account_id   UUID REFERENCES bank_accounts(account_id),
      received_from     VARCHAR(255),                  -- client name snapshot
      line_items        JSONB NOT NULL DEFAULT '[]',   -- [{ label, description, amount }]
      pdf_url           TEXT,
      whatsapp_sent     BOOLEAN NOT NULL DEFAULT FALSE,
      whatsapp_sent_at  TIMESTAMP WITH TIME ZONE,
      whatsapp_message_id TEXT,
      send_error        TEXT,
      generated_by      UUID REFERENCES users(user_id),
      created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`CREATE SEQUENCE IF NOT EXISTS receipt_code_seq START 1`);
  await db.query(`ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS receipt_code VARCHAR(15) UNIQUE`);
  await db.query(`
    UPDATE payment_receipts
    SET receipt_code = 'RCP-' || LPAD(nextval('receipt_code_seq')::text, 7, '0')
    WHERE receipt_code IS NULL
  `);
  await db.query(`
    ALTER TABLE payment_receipts
    ALTER COLUMN receipt_code SET DEFAULT 'RCP-' || LPAD(nextval('receipt_code_seq')::text, 7, '0')
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_receipts_client_id
    ON payment_receipts(client_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_receipts_whatsapp_sent
    ON payment_receipts(whatsapp_sent);
  `);

  // =========================================================
  // STAFF DEVICE BINDING (admin dashboard login restriction)
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_devices (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      device_id         TEXT UNIQUE,
      activation_code   VARCHAR(20) UNIQUE,
      label             VARCHAR(255) NOT NULL,
      status            VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
      assigned_by       UUID REFERENCES users(user_id),
      assigned_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      activated_at      TIMESTAMP WITH TIME ZONE,
      revoked_at        TIMESTAMP WITH TIME ZONE
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_devices_user
    ON staff_devices (user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      device_id     TEXT,
      jti           TEXT NOT NULL UNIQUE,
      ip_address    VARCHAR(64),
      user_agent    TEXT,
      login_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_seen_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      logout_at     TIMESTAMP WITH TIME ZONE,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_sessions_user
    ON staff_sessions (user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_sessions_device
    ON staff_sessions (device_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_sessions_active
    ON staff_sessions (is_active);
  `);

  // =========================================================
  // BANK ACCOUNT OPENING BALANCE
  // =========================================================

  await db.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await db.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance_date DATE`);

  // =========================================================
  // SHIFT-BASED BOOKING SCHEDULING
  // A SHIFT_BASED booking can have multiple shifts per day (e.g. 2x12h or
  // 3x8h), each independently staffed. The shift pattern (count + each
  // shift's time window) is versioned/effective-dated rather than mutated
  // in place, so changing the pattern mid-booking never rewrites the
  // pattern a past day's attendance/invoices were actually recorded under.
  // LIVE_IN and VISITING bookings never create rows here.
  // =========================================================

  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_shift_patterns (
      pattern_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
      shift_count INTEGER NOT NULL CHECK (shift_count > 0),
      effective_from_date DATE NOT NULL,
      effective_to_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      created_by UUID REFERENCES users(user_id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_shift_patterns_booking_id
    ON booking_shift_patterns(booking_id);
  `);

  // At most one ACTIVE pattern per booking, and separately at most one SCHEDULED
  // (future-dated, not yet applied) pattern — the two statuses coexist while a
  // pending pattern change waits for its effective date.
  await db.query(`DROP INDEX IF EXISTS uniq_open_shift_pattern`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_shift_pattern
      ON booking_shift_patterns (booking_id)
      WHERE status = 'ACTIVE'
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_scheduled_shift_pattern
      ON booking_shift_patterns (booking_id)
      WHERE status = 'SCHEDULED'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS booking_shift_slots (
      shift_slot_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      pattern_id UUID NOT NULL REFERENCES booking_shift_patterns(pattern_id) ON DELETE CASCADE,
      shift_number INTEGER NOT NULL CHECK (shift_number > 0),
      start_time TIME NOT NULL,
      duration_hours NUMERIC(4, 2) NOT NULL CHECK (duration_hours > 0),
      label VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (pattern_id, shift_number)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_shift_slots_pattern_id
    ON booking_shift_slots(pattern_id);
  `);

  // Which shift slot (if any) a staff assignment covers. NULL for LIVE_IN/VISITING,
  // where one assignment row already represents the whole booking.
  await db.query(`
    ALTER TABLE booking_staff_assignments
    ADD COLUMN IF NOT EXISTS shift_slot_id UUID REFERENCES booking_shift_slots(shift_slot_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_staff_assignments_shift_slot_id
    ON booking_staff_assignments(shift_slot_id);
  `);

  // At most one ACTIVE assignment can hold a given shift slot at a time.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot_assignment
      ON booking_staff_assignments (shift_slot_id)
      WHERE status = 'ACTIVE' AND shift_slot_id IS NOT NULL
  `);

  // Which shift slot (if any) an attendance/invoice row belongs to. NULL for
  // LIVE_IN/VISITING, preserving today's one-row-per-day behavior exactly.
  await db.query(`
    ALTER TABLE staff_daily_attendance
    ADD COLUMN IF NOT EXISTS shift_slot_id UUID REFERENCES booking_shift_slots(shift_slot_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_daily_attendance_shift_slot_id
    ON staff_daily_attendance(shift_slot_id);
  `);

  // Replace the old single UNIQUE(assignment_id, service_date) with two partial
  // indexes so SHIFT_BASED bookings can have multiple attendance rows per day
  // (one per shift slot) while LIVE_IN/VISITING keep their original one-per-day guarantee.
  await db.query(`
    ALTER TABLE staff_daily_attendance
    DROP CONSTRAINT IF EXISTS staff_daily_attendance_assignment_id_service_date_key
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_no_slot
      ON staff_daily_attendance (assignment_id, service_date)
      WHERE shift_slot_id IS NULL
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_with_slot
      ON staff_daily_attendance (assignment_id, service_date, shift_slot_id)
      WHERE shift_slot_id IS NOT NULL
  `);

  await db.query(`
    ALTER TABLE booking_daily_invoices
    ADD COLUMN IF NOT EXISTS shift_slot_id UUID REFERENCES booking_shift_slots(shift_slot_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_booking_daily_invoices_shift_slot_id
    ON booking_daily_invoices(shift_slot_id);
  `);

  // Same treatment as staff_daily_attendance above: allow one invoice row per
  // shift slot per day for SHIFT_BASED, keep the old one-per-day guarantee otherwise.
  await db.query(`
    ALTER TABLE booking_daily_invoices
    DROP CONSTRAINT IF EXISTS booking_daily_invoices_booking_id_service_date_key
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_invoice_no_slot
      ON booking_daily_invoices (booking_id, service_date)
      WHERE shift_slot_id IS NULL
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_invoice_with_slot
      ON booking_daily_invoices (booking_id, service_date, shift_slot_id)
      WHERE shift_slot_id IS NOT NULL
  `);

  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS company_name VARCHAR(150)`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS honorific VARCHAR(10)`);

  // Registration fee invoicing — standalone fee sent directly without a booking.
  // reg_fee_receipt_token is the public upload portal key (like doc_upload_token for staff).
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 10000.00`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_invoiced_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_receipt_token VARCHAR(64)`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_receipt_token_expires_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reg_fee_receipt_url TEXT`);

  // Temporary staging table for registrations awaiting OTP verification.
  // Rows are promoted to users + client_profiles on successful OTP verify, then deleted.
  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_registrations (
      pending_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mobile_number VARCHAR(20)  NOT NULL UNIQUE,
      password_hash TEXT         NOT NULL,
      email         VARCHAR(255),
      full_name     VARCHAR(100) NOT NULL,
      client_type   VARCHAR(30)  NOT NULL DEFAULT 'INDIVIDUAL',
      gender        VARCHAR(20),
      primary_address TEXT,
      company_name  VARCHAR(150),
      honorific     VARCHAR(10),
      otp_code      VARCHAR(10)  NOT NULL,
      expires_at    TIMESTAMPTZ  NOT NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // Widen emergency contact columns to support pipe-separated multiple contacts
  await db.query(`ALTER TABLE patient_profiles ALTER COLUMN emergency_contact_name TYPE TEXT`);
  await db.query(`ALTER TABLE patient_profiles ALTER COLUMN emergency_contact_number TYPE TEXT`);

  // =========================================================
  // SEED DEFAULT PRESET ITEMS
  // =========================================================

  await seedQuotePresetItems();

  // =========================================================
  // SEED DEFAULT SUPER ADMIN USER
  // =========================================================

  await seedDefaultAdminUser();

  console.log('Migration completed successfully!');
}

async function seedDefaultAdminUser() {
  try {
    const mobileNumber = '0000000000';

    const existing = await db.query('SELECT user_id FROM users WHERE mobile_number = $1', [mobileNumber]);
    if (existing.rows.length > 0) {
      console.log('Default admin user already seeded. Skipping...');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin@vcare', salt);

    await db.query(
      `INSERT INTO users (mobile_number, password_hash, is_active, role)
       VALUES ($1, $2, true, ARRAY['SUPER_ADMIN'::user_role_enum])`,
      [mobileNumber, passwordHash]
    );

    console.log('Seeded default SUPER_ADMIN user (mobile_number: 0000000000)');
  } catch (error) {
    console.error('Error seeding default admin user:', error.message);
    // Don't fail migration if seeding fails
  }
}

async function seedQuotePresetItems() {
  try {
    // Check if presets already exist
    const existingPresets = await db.query('SELECT COUNT(*) FROM quote_preset_items');
    if (parseInt(existingPresets.rows[0].count) > 0) {
      console.log('Quote preset items already seeded. Skipping...');
      return;
    }

    const presets = [
      {
        name: 'Registration Fee',
        item_type: 'CHARGE',
        description: 'One-time registration fee for new clients',
        default_quantity: 1,
        default_unit_price: 10000.00,
        sort_order: 1
      },
      {
        name: 'Daily Care Rate',
        item_type: 'CHARGE',
        description: 'Daily nursing/caretaker service rate',
        default_quantity: 7,
        default_unit_price: 0,
        sort_order: 2
      },
      {
        name: 'Transport Fee',
        item_type: 'CHARGE',
        description: 'Daily transport allowance for staff',
        default_quantity: 1,
        default_unit_price: 1000.00,
        sort_order: 3
      }
    ];

    for (const preset of presets) {
      await db.query(`
        INSERT INTO quote_preset_items 
        (name, item_type, description, default_quantity, default_unit_price, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
      `, [preset.name, preset.item_type, preset.description, preset.default_quantity, preset.default_unit_price, preset.sort_order]);
    }

    console.log(`Seeded ${presets.length} default quote preset items`);
  } catch (error) {
    console.error('Error seeding quote preset items:', error.message);
    // Don't fail migration if seeding fails
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}


module.exports = migrate;
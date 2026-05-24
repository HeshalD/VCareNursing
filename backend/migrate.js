const db = require('./config/db');

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

  // Check if migration is needed by checking if users table exists
  const tableCheck = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    );
  `);

  if (tableCheck.rows[0].exists) {
    console.log('Database already migrated. Skipping...');
    return;
  }

  // =========================================================
  // ENUMS
  // =========================================================

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
        'BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE', 'WALLET', 'ONLINE_GATEWAY'
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
      daily_rate DECIMAL(10,2)
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
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_quotated DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE
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
    CREATE INDEX IF NOT EXISTS idx_quote_preset_items_active 
    ON quote_preset_items(is_active);
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
  // SEED DEFAULT PRESET ITEMS
  // =========================================================

  await seedQuotePresetItems();

  console.log('Migration completed successfully!');
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
-- Initialize database with basic schema
-- This file will be executed when the PostgreSQL container starts for the first time

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- You can add your initial table creation here
-- Example:
-- CREATE TABLE IF NOT EXISTS users (
--     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--     email VARCHAR(255) UNIQUE NOT NULL,
--     password_hash VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Add any initial data if needed
-- INSERT INTO users (email, password_hash) VALUES ('admin@example.com', '$2b$10$...');

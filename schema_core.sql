-- Core User and System Schema for Zweepee

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users: Central identity table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    preferred_name TEXT,
    onboarding_step TEXT, -- 'awaiting_name', 'completed'
    referral_code TEXT UNIQUE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Chat History: Persistent memory of all interactions
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Orders: Successful conversions
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    items JSONB,
    total DECIMAL(10,2),
    status TEXT DEFAULT 'pending', -- pending, paid, processing, shipped, delivered, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Carts: Temporary shopping state
CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    item_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. System Alerts: Error logging and monitoring
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    severity TEXT NOT NULL, -- 'info', 'warning', 'error', 'critical'
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. System Config: Dynamic feature flags and settings
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initial Config
INSERT INTO system_config (key, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (key) DO NOTHING;

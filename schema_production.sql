-- MR EVERYTHING — FINAL PRODUCTION SCHEMA (REVAMPED + TRADESAFE)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Infrastructure Tables
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forensic_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_phone TEXT,
  intent TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Core Tables
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT CHECK (vehicle_type IN ('compact', 'sedan', 'mpv', 'bakkie', 'truck', 'moto')) NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  license_plate TEXT UNIQUE,
  capacity INTEGER,
  color TEXT,
  registration_url TEXT,
  insurance_url TEXT,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT CHECK (role IN ('passenger', 'driver', 'admin')) DEFAULT 'passenger',
  driver_status TEXT CHECK (driver_status IN ('active', 'offline', 'suspended')) DEFAULT 'active',
  driver_id_number TEXT,
  driver_bank_account JSONB, -- For TradeSafe payouts
  bank_verified BOOLEAN DEFAULT false,
  driver_license_url TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  rating FLOAT DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Service Tables
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat FLOAT8,
  lng FLOAT8,
  phone TEXT,
  commission_rate FLOAT8 DEFAULT 0.15,
  menu JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES profiles(id),
  trip_type TEXT CHECK (trip_type IN ('shared', 'solo', 'moto', 'food', 'courier')) NOT NULL,
  total_fare INTEGER,
  platform_fee INTEGER,
  driver_earnings INTEGER,
  passenger_count INTEGER DEFAULT 0,
  route JSONB,
  total_distance_km FLOAT8,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  booking_type TEXT CHECK (booking_type IN ('shared_sedan', 'solo_sedan', 'moto_ride', 'moto_courier', 'food')) NOT NULL,
  pickup_lat FLOAT8,
  pickup_lng FLOAT8,
  pickup_address TEXT,
  dropoff_lat FLOAT8,
  dropoff_lng FLOAT8,
  dropoff_address TEXT,
  distance_km FLOAT8,
  fare INTEGER,
  platform_fee INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'searching', 'grouped', 'active', 'completed', 'cancelled')),
  trip_id UUID REFERENCES trips(id),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  restaurant_id UUID REFERENCES restaurants(id),
  food_items JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  stop_type TEXT CHECK (stop_type IN ('pickup', 'dropoff', 'restaurant')) NOT NULL,
  sequence_order INTEGER NOT NULL,
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  address TEXT,
  name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ
);

-- 4. Payment & Escrow (TradeSafe Focused)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  trip_id UUID REFERENCES trips(id),
  tradesafe_transaction_id TEXT UNIQUE,
  escrow_status TEXT CHECK (escrow_status IN ('pending', 'held', 'released', 'disputed', 'refunded')),
  release_method TEXT, -- 'passenger_confirmed' or 'no_show'
  amount INTEGER NOT NULL,
  platform_fee INTEGER,
  driver_earnings INTEGER,
  status TEXT CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tradesafe_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT false
);

-- 5. Fleet Tracking
CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES profiles(id),
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  heading FLOAT8,
  speed FLOAT8,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_stops_trip ON stops(trip_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver ON driver_locations(driver_id);

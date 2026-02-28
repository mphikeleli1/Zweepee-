-- MR EVERYTHING — REVAMPED SCHEMA
-- 5.1 Core Tables

-- Vehicles table (MUST BE CREATED FIRST DUE TO FOREIGN KEYS)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT CHECK (vehicle_type IN ('compact', 'sedan', 'mpv', 'bakkie', 'truck', 'moto')) NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  license_plate TEXT UNIQUE,
  capacity INTEGER, -- Max passengers
  color TEXT,
  registration_url TEXT,
  insurance_url TEXT,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles table (Replaces users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT CHECK (role IN ('passenger', 'driver', 'admin')) DEFAULT 'passenger',
  driver_status TEXT CHECK (driver_status IN ('active', 'offline', 'suspended')) DEFAULT 'active',
  driver_id_number TEXT,
  driver_bank_account TEXT,
  driver_license_url TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  rating FLOAT DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat FLOAT8,
  lng FLOAT8,
  phone TEXT,
  commission_rate FLOAT8 DEFAULT 0.15, -- 15%
  menu JSONB, -- Full menu with prices
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trips table (grouped bookings assigned to driver)
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES profiles(id),
  trip_type TEXT CHECK (trip_type IN ('shared', 'solo', 'moto', 'food', 'courier')) NOT NULL,

  -- Earnings
  total_fare INTEGER, -- Sum of all passenger fares
  platform_fee INTEGER, -- R5 × passenger_count
  driver_earnings INTEGER, -- total_fare - platform_fee

  -- Route
  passenger_count INTEGER DEFAULT 0,
  route JSONB, -- Ordered waypoints
  total_distance_km FLOAT8,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'active', 'completed', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Bookings table (all types: ride, food, courier)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  booking_type TEXT CHECK (booking_type IN ('shared_sedan', 'solo_sedan', 'moto_ride', 'moto_courier', 'food')) NOT NULL,
  ride_type TEXT CHECK (ride_type IN ('shared', 'solo')),

  -- Location data
  pickup_lat FLOAT8,
  pickup_lng FLOAT8,
  pickup_address TEXT,
  dropoff_lat FLOAT8,
  dropoff_lng FLOAT8,
  dropoff_address TEXT,

  -- Pricing
  distance_km FLOAT8,
  fare INTEGER, -- Passenger pays this
  platform_fee INTEGER, -- We keep this

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'searching', 'grouped', 'active', 'completed', 'cancelled')),
  trip_id UUID REFERENCES trips(id),

  -- Payment
  payfast_payment_id TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),

  -- Food-specific
  restaurant_id UUID REFERENCES restaurants(id),
  food_items JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Stops table (pickup/dropoff sequence)
CREATE TABLE IF NOT EXISTS stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  stop_type TEXT CHECK (stop_type IN ('pickup', 'dropoff', 'restaurant')) NOT NULL,
  sequence_order INTEGER NOT NULL,

  -- Location
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  address TEXT,

  -- Passenger/Order info
  name TEXT,
  phone TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,

  -- PIN verification
  pin_code TEXT,
  pin_verified BOOLEAN DEFAULT FALSE
);

-- Driver locations (real-time tracking)
CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES profiles(id),
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  heading FLOAT8, -- Direction in degrees
  speed FLOAT8, -- km/h
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id),
  from_user_id UUID REFERENCES profiles(id), -- Who gave rating
  to_user_id UUID REFERENCES profiles(id), -- Who received rating
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment records
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  trip_id UUID REFERENCES trips(id),
  payfast_payment_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  platform_fee INTEGER,
  driver_earnings INTEGER,
  status TEXT CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 5.2 Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_stops_trip ON stops(trip_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_updated ON driver_locations(updated_at);

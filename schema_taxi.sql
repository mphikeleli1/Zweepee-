-- TAXI MIRAGE SCHEMA
-- Add to existing Supabase database

-- CORRIDORS TABLE (Taxi Routes)
CREATE TABLE IF NOT EXISTS corridors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_lat FLOAT8 NOT NULL,
    start_lng FLOAT8 NOT NULL,
    end_lat FLOAT8 NOT NULL,
    end_lng FLOAT8 NOT NULL,
    radius_km FLOAT8 NOT NULL DEFAULT 2.0,
    min_group_size INT NOT NULL DEFAULT 6,
    max_group_size INT NOT NULL DEFAULT 12,
    base_fare NUMERIC(10,2) NOT NULL DEFAULT 35.00,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sample corridors
INSERT INTO corridors (name, description, start_lat, start_lng, end_lat, end_lng, radius_km, min_group_size, base_fare) VALUES
('Soweto-Sandton', 'Soweto via N1 to Sandton', -26.2500, 27.8500, -26.1076, 28.0567, 2.0, 6, 35.00),
('Joburg-Midrand', 'Johannesburg CBD to Midrand', -26.2041, 28.0473, -25.9953, 28.1280, 2.5, 6, 50.00),
('Sandton-Pretoria', 'Sandton to Pretoria CBD', -26.1076, 28.0567, -25.7479, 28.2293, 3.0, 6, 75.00)
ON CONFLICT DO NOTHING;

-- TAXI_BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS taxi_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pickup_lat FLOAT8 NOT NULL,
    pickup_lng FLOAT8 NOT NULL,
    pickup_address TEXT,
    dropoff_lat FLOAT8 NOT NULL,
    dropoff_lng FLOAT8 NOT NULL,
    dropoff_address TEXT,
    corridor_id UUID REFERENCES corridors(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'grouped', 'in_progress', 'completed', 'cancelled')),
    fare NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taxi_bookings_user_idx ON taxi_bookings(user_id);
CREATE INDEX IF NOT EXISTS taxi_bookings_corridor_idx ON taxi_bookings(corridor_id);
CREATE INDEX IF NOT EXISTS taxi_bookings_status_idx ON taxi_bookings(status);

-- TAXI_TRIPS TABLE
CREATE TABLE IF NOT EXISTS taxi_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corridor_id UUID REFERENCES corridors(id),
    driver_id UUID,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
    total_revenue NUMERIC(10,2),
    platform_earnings NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TAXI_STOPS TABLE (Pickup/Dropoff Sequence)
CREATE TABLE IF NOT EXISTS taxi_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES taxi_trips(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES taxi_bookings(id),
    stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup', 'dropoff')),
    sequence_order INT NOT NULL,
    lat FLOAT8 NOT NULL,
    lng FLOAT8 NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taxi_stops_trip_idx ON taxi_stops(trip_id, sequence_order);

-- Enable RLS
ALTER TABLE corridors ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxi_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxi_trips ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "View active corridors" ON corridors FOR SELECT USING (active = true);
CREATE POLICY "Users view own taxi bookings" ON taxi_bookings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own taxi bookings" ON taxi_bookings FOR INSERT WITH CHECK (user_id = auth.uid());

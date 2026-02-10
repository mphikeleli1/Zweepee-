-- MR LIFT CLUB SCHEMA
-- Focus: 24/7 Auto-created minibus taxi groups (e.g., JHB CBD <-> Soweto)

-- 1. Lift Requests: Capture user intent to travel
CREATE TABLE lift_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    pickup_address TEXT NOT NULL,
    pickup_lat DECIMAL(9,6),
    pickup_lng DECIMAL(9,6),
    dropoff_address TEXT NOT NULL,
    dropoff_lat DECIMAL(9,6),
    dropoff_lng DECIMAL(9,6),
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, matched, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Lift Clubs: Active groups matched by route and time
CREATE TABLE lift_clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_name TEXT NOT NULL, -- e.g., 'SOWETO_TO_CBD'
    driver_id UUID REFERENCES users(id), -- Driver must be SANTACO-registered
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    whatsapp_group_id TEXT, -- For coordination
    status TEXT DEFAULT 'forming', -- forming, ready, started, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Lift Memberships: Association of riders to clubs with escrow tracking
CREATE TABLE lift_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES lift_clubs(id),
    user_id UUID REFERENCES users(id),
    fare_amount DECIMAL(10,2) NOT NULL,
    payment_status TEXT DEFAULT 'pending', -- pending, escrowed, released, refunded
    payment_id TEXT, -- PayFast transaction reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

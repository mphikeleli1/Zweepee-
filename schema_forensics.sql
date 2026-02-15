-- FORENSIC LOGGING SCHEMA
-- Focus: Granular execution traces for "Black Box" debugging

CREATE TABLE IF NOT EXISTS forensic_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    user_phone TEXT,
    intent TEXT,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

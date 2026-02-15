-- GROUP CART SCHEMA
-- Focus: Aggregated bulk ordering and split payments

-- 1. Group Carts: Shared shopping sessions
CREATE TABLE group_carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL, -- 'private' or 'public'
    invite_code TEXT UNIQUE,
    creator_id UUID REFERENCES users(id), -- 'SYSTEM' for public
    status TEXT DEFAULT 'open', -- open, closed, ordered
    discount_tier DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Group Members: Users participating in a group
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES group_carts(id),
    user_id UUID REFERENCES users(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- 3. Group Cart Items: Individual contributions to the group
CREATE TABLE group_cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES group_carts(id),
    user_id UUID REFERENCES users(id),
    item_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    payment_status TEXT DEFAULT 'pending', -- pending, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

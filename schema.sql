-- myAI(TM) v25 D1 Database Schema

CREATE TABLE IF NOT EXISTS pricing_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  personal_agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  buyer_agent_id TEXT NOT NULL,
  seller_agent_id TEXT,
  intent_type TEXT NOT NULL,
  query_text TEXT NOT NULL,
  score REAL NOT NULL,
  status TEXT NOT NULL,
  outcome TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  buyer_agent_id TEXT NOT NULL,
  seller_agent_id TEXT,
  intent_type TEXT NOT NULL,
  status TEXT NOT NULL,
  human_approval_buyer INTEGER DEFAULT 0,
  human_approval_seller INTEGER DEFAULT 0,
  goods_amount_cents INTEGER DEFAULT 0,
  transport_amount_cents INTEGER DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  payment_fee_cents INTEGER DEFAULT 0,
  total_amount_cents INTEGER DEFAULT 0,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  account_debit TEXT NOT NULL,
  account_credit TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  vehicle_class TEXT NOT NULL,
  raw_quote_cents INTEGER NOT NULL,
  margin_cents INTEGER NOT NULL,
  final_transport_cents INTEGER NOT NULL,
  eta_minutes INTEGER,
  created_at INTEGER NOT NULL
);

-- Seed pricing parameters
INSERT OR REPLACE INTO pricing_config (key, value, description, updated_at) VALUES
('STORE_GOODS_MARKUP_PERCENT', '0', 'Markup on goods for all stores (0%)', 1700000000000),
('STORE_TRANSPORT_MARGIN_LOW_PERCENT', '10', 'Transport margin percentage when cart < threshold (10%)', 1700000000000),
('STORE_TRANSPORT_MARGIN_HIGH_PERCENT', '20', 'Transport margin percentage when cart >= threshold (20%)', 1700000000000),
('STORE_CART_THRESHOLD_CENTS', '10000', 'Cart threshold in minor units / cents (R100.00)', 1700000000000),
('P2P_GOODS_COMMISSION_PERCENT', '5', 'Commission percentage on goods value for P2P/A2A sales (5%)', 1700000000000),
('P2P_TRANSPORT_MARGIN_PERCENT', '20', 'Transport margin percentage for P2P/A2A sales (20%)', 1700000000000),
('TRANSPORT_ONLY_MARGIN_PERCENT', '20', 'Transport margin percentage for transport-only mode (20%)', 1700000000000),
('PAYMENT_PROCESSING_FEE_CENTS', '250', 'Flat payment processing fee in minor units (R2.50)', 1700000000000);

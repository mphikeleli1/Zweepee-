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

CREATE TABLE IF NOT EXISTS legal_contracts (
  contract_id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  sha256_sig TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flight_bookings (
  id TEXT PRIMARY KEY,
  pnr TEXT UNIQUE NOT NULL,
  e_ticket_url TEXT NOT NULL,
  aeronology_ref TEXT NOT NULL,
  onecheckin_ref TEXT,
  checkin_status TEXT NOT NULL,
  boarding_pass_url TEXT,
  created_at INTEGER NOT NULL
);

-- Platform Storage Tables
CREATE TABLE IF NOT EXISTS passport_index (
  user_id TEXT PRIMARY KEY,
  passport_do_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  granted INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_ledger (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  parent_hash TEXT,
  child_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_index (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trail_index (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS compiler_cards (
  id TEXT PRIMARY KEY,
  complaint TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  card_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_registry (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  boundary TEXT NOT NULL,
  registry_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fetcher_cache (
  id TEXT PRIMARY KEY,
  fetcher_name TEXT NOT NULL,
  url TEXT NOT NULL,
  response_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pulse_lines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  line_text TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gaps (
  id TEXT PRIMARY KEY,
  request_text TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_chains (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS regulator_routes (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  regulator_name TEXT NOT NULL,
  route_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS life_stage_handoffs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stage_from TEXT NOT NULL,
  stage_to TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS human_handoff_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS observability_targets (
  id TEXT PRIMARY KEY,
  target_name TEXT NOT NULL,
  config_json TEXT NOT NULL
);

-- Seed pricing parameters for ALL intent modes
INSERT OR REPLACE INTO pricing_config (key, value, description, updated_at) VALUES
('STORE_GOODS_MARKUP_PERCENT', '0', 'Markup on goods for all stores (0%)', 1700000000000),
('STORE_TRANSPORT_MARGIN_LOW_PERCENT', '10', 'Transport margin percentage when cart < threshold (10%)', 1700000000000),
('STORE_TRANSPORT_MARGIN_HIGH_PERCENT', '20', 'Transport margin percentage when cart >= threshold (20%)', 1700000000000),
('STORE_CART_THRESHOLD_CENTS', '10000', 'Cart threshold in minor units / cents (R100.00)', 1700000000000),
('P2P_GOODS_COMMISSION_PERCENT', '5', 'Commission percentage on goods value for P2P/A2A sales (5%)', 1700000000000),
('P2P_TRANSPORT_MARGIN_PERCENT', '20', 'Transport margin percentage for P2P/A2A sales (20%)', 1700000000000),
('TRANSPORT_ONLY_MARGIN_PERCENT', '20', 'Transport margin percentage for transport-only mode (20%)', 1700000000000),
('JOB_MATCHING_FLAT_FEE_CENTS', '50000', 'Configurable flat fee for job matching placement (R500.00)', 1700000000000),
('SERVICE_REFERRAL_COMMISSION_PERCENT', '5', 'Affiliate referral commission for medical, financial, legal service referrals (5%)', 1700000000000),
('PAYMENT_PROCESSING_FEE_CENTS', '250', 'Flat payment processing fee in minor units (R2.50)', 1700000000000);

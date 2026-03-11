# Deploying Mr Everything (Node.js + WAHA Core)

We have transitioned from Baileys to **WAHA Core** (WhatsApp HTTP API) for more stable connectivity and easier device linking.

## 1. Prerequisites
- A persistent server (VPS, Railway.app, or local server).
- **Docker** (Required to run WAHA).
- Node.js 18 or higher.
- A Supabase project.

## 2. Step 1: Run WAHA (Docker)
The easiest way to run WAHA is via Docker:
```bash
docker run -d --name waha -p 3000:3000 devlikeapro/waha
```
WAHA will now be running on port `3000`.

## 3. Environment Variables
Set these in your Node.js server environment:
- `WAHA_URL`: `http://localhost:3000` (or the IP of your WAHA server).
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_ANON_KEY`: Your Supabase Anon Key.
- `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key.
- `OPENAI_API_KEY`: Your OpenAI API Key.
- `TRADESAFE_API_KEY`: Your TradeSafe API Key.
- `ADMIN_PHONE`: Your WhatsApp number (e.g., `27123456789`).
- `PORT`: Usually `8080`.

## 4. Step 2: Run the Concierge Server
1. **Database:** Run `schema_production.sql` in Supabase.
2. **Start:** `npm install && npm start`.
3. **Link Device:** Go to `https://your-domain.com/qr` in your browser. Scan the QR code with WhatsApp.

## 5. Step 3: Webhook Configuration
1. Open WAHA Dashboard (usually `http://localhost:3000/dashboard`).
2. Set the Webhook URL to: `https://your-domain.com/webhooks/waha`.
3. Ensure the event `message` is enabled.

## 6. TradeSafe Webhooks
Set your TradeSafe webhook URL to: `https://your-domain.com/webhooks/tradesafe`

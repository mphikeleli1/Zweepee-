# Deploying Mr Everything (Node.js + Baileys)

Since we've migrated from Cloudflare Workers to a persistent Node.js server (required for the Baileys WhatsApp library), the deployment process is different.

## 1. Requirements
- A persistent server (VPS, Railway.app, Heroku, or an always-on PC).
- Node.js 18 or higher.
- A Supabase project.

## 2. Environment Variables
Ensure these are set in your hosting provider's dashboard:
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_ANON_KEY`: Your Supabase Anon Key.
- `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key.
- `OPENAI_API_KEY`: Your OpenAI API Key.
- `TRADESAFE_API_KEY`: Your TradeSafe API Key.
- `ADMIN_PHONE`: Your WhatsApp number (e.g., `27123456789`) to receive alerts and use admin commands.
- `PORT`: Usually `8080`.

## 3. Initial Setup
1. **Database:** Run the contents of `schema_production.sql` in your Supabase SQL Editor.
2. **Auth:** When you first run `npm start`, a **QR Code** will appear in the terminal. Scan this with your WhatsApp "Linked Devices" to log in.
3. **Session:** The session info is saved in the `auth_info_baileys/` folder. **Do not delete this folder** or you will have to re-scan the QR code.

## 4. Deploying to Railway (Recommended)
1. Link your GitHub repo to Railway.app.
2. Add all environment variables.
3. Railway will automatically detect `package.json` and run `npm start`.
4. Check the Railway "Deployment Logs" to see and scan the QR code.

## 5. Webhooks
Set your TradeSafe webhook URL to: `https://your-domain.com/webhooks/tradesafe`

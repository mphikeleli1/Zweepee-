const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const app = express();
app.use(bodyParser.json());

// Helper to call Supabase functions
async function callFn(fnName, args) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase error: ${res.status} ${txt}`);
  }
  return res.json();
}

// WhatsApp inbound webhook
app.post('/whatsapp/inbound', async (req, res) => {
  try {
    const text = (req.body?.text || '').trim().toUpperCase();
    const phone = (req.body?.phone || '').trim();

    if (!phone) return res.json({ reply: 'Missing phone.' });

    // Register
    if (text === 'HI' || text === 'HELLO' || text === 'START') {
      await callFn('register_user', { p_phone: phone });
      const otp = await callFn('send_otp', { p_phone: phone });
      return res.json({ reply: `Welcome to Zweepee. OTP: ${otp.code}` });
    }

    // Verify
    if (text.startsWith('VERIFY')) {
      const code = text.split(' ')[1];
      const vrf = await callFn('verify_otp', { p_phone: phone, p_code: code });
      return res.json({ reply: JSON.stringify(vrf) });
    }

    // Balance
    if (text === 'BALANCE' || text === '1') {
      const b = await callFn('get_balance', { p_phone: phone });
      return res.json({ reply: `Balance: R${b.balance}` });
    }

    // Deposit
    if (text.startsWith('DEPOSIT')) {
      const parts = text.split(' ');
      const method = parts[1].toLowerCase();
      const amount = parseFloat(parts[2]);
      const intent = await callFn('create_payment_intent', {
        p_phone: phone, p_method: method, p_amount: amount
      });
      return res.json({ reply: `Deposit intent created: ${JSON.stringify(intent)}` });
    }

    // Voucher
    if (text.startsWith('VOUCHER')) {
      const parts = text.split(' ');
      const pin = parts[1];
      const amount = parseFloat(parts[2]);
      const r = await callFn('redeem_voucher', {
        p_phone: phone, p_voucher_pin: pin, p_amount: amount
      });
      return res.json({ reply: `Voucher result: ${JSON.stringify(r)}` });
    }

    // Play
    if (text.startsWith('PLAY')) {
      const parts = text.split(' ');
      const side = parts[1];
      const stake = parseFloat(parts[2]);
      const p = await callFn('play_coin', {
        p_phone: phone, p_side: side, p_stake: stake
      });
      return res.json({ reply: `Play result: ${JSON.stringify(p)}` });
    }

    // Withdraw
    if (text.startsWith('WITHDRAW')) {
      const parts = text.split(' ');
      const method = parts[1];
      const amount = parseFloat(parts[2]);
      const w = await callFn('withdraw', {
        p_phone: phone, p_amount: amount, p_method: method, p_destination: 'demo'
      });
      return res.json({ reply: `Withdraw result: ${JSON.stringify(w)}` });
    }

    // Help
    if (text === 'HELP' || text === '6') {
      await callFn('log_support', { p_phone: phone, p_message: 'HELP' });
      return res.json({ reply: 'Support logged.' });
    }

    return res.json({ reply: 'Menu: HI, VERIFY, BALANCE, DEPOSIT, VOUCHER, PLAY, WITHDRAW, HELP' });
  } catch (e) {
    return res.json({ reply: `Error: ${e.message}` });
  }
});app.get('/webhook', (req, res) => {
  const verifyToken = "zweepee123"; // must match Meta dashboard
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => res.send('Zweepee bot running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot listening on ${PORT}`));
// Webhook verification
app.get('/webhook', (req, res) => {
  const verifyToken = "zweepee123";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

// Webhook receiver
app.post('/webhook', (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));
  return res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => res.send('Zweepee bot is running'));

// Correct port binding for Render (this overrides any earlier app.listen line)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot listening on port ${PORT}`));

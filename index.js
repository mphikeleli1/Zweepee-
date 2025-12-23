const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// WhatsApp webhook verification
app.get('/api/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'zweepee2025') {
    console.log('✅ WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  
  // This is what you see in browser
  return res.send('Verification failed');
});

// Handle incoming messages
app.post('/api/webhook', (req, res) => {
  console.log('📨 WhatsApp message received');
  return res.status(200).send('OK');
});

// Keep your other routes if needed
app.get('/verify', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (token === process.env.WA_VERIFY_TOKEN) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  console.log('Incoming webhook body:', req.body);
  res.status(200).send('OK');
});

// Export for Vercel
module.exports = app;

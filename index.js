const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Debug lines
  console.log('Token from URL:', token);
  console.log('Token from ENV:', process.env.WA_VERIFY_TOKEN);

  if (token === process.env.WA_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Invalid token');
  }
});

// Webhook events (POST)
app.post('/webhook', (req, res) => {
  console.log('Incoming webhook body:', req.body);
  res.status(200).send('OK');
});

// Export the app for Vercel serverless
module.exports = app;

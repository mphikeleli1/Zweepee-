// server.js
'use strict';

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Zweepee bare server is running ✅');
});

// WhatsApp webhook endpoint (Jules will extend this)
app.post('/webhook', (req, res) => {
  console.log('Incoming WhatsApp webhook:', req.body);
  res.sendStatus(200); // acknowledge receipt
});

// WhatsApp webhook verification (Jules will handle token check)
app.get('/webhook', (req, res) => {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Render provides PORT automatically
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

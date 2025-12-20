const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

  if (token === VERIFY_TOKEN) {
    res.status(200).send(challenge); // plain text response
  } else {
    res.sendStatus(403);
  }
});

// Webhook events (POST)
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // acknowledge receipt
});

// Export for Vercel serverless
module.exports = app;

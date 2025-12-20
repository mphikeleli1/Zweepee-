const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge); // plain text response
  } else {
    res.status(403).send("Forbidden");
  }
});

// Webhook events (POST)
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // acknowledge receipt quickly
});

// Export for Vercel serverless
module.exports = app;

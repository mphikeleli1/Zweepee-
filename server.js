const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Configuration from environment variables
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFICATION_TOKEN || "zweepee2025";
const WHATSAPP_TOKEN = process.env.CLOUD_API_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const API_VERSION = process.env.CLOUD_API_VERSION || "v17.0";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Health check
app.get("/", (req, res) => {
  res.send("Zweepee webhook live");
});

// Meta Webhook Verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.status(200).send("Zweepee Webhook Endpoint (GET)");
  }
});

// Helper to get Gemini response
async function getGeminiReply(message) {
  if (!GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    return "AI service is not configured.";
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message || "" }] }]
        })
      }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No reply from AI";
  } catch (err) {
    console.error("Gemini error:", err);
    return "Error processing message with AI";
  }
}

// Helper to send WhatsApp message
async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("Missing WhatsApp configuration (TOKEN or PHONE_NUMBER_ID)");
    return;
  }

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error("WhatsApp API error:", JSON.stringify(data.error));
    } else {
      console.log(`WhatsApp message sent successfully to ${to}`);
    }
  } catch (err) {
    console.error("Error sending WhatsApp message:", err);
  }
}

// Webhook for both Chakra Chat and Meta WhatsApp
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // 1. Detect if it's a Meta WhatsApp Webhook
  if (body.object === "whatsapp_business_account") {
    // Acknowledge receipt immediately
    res.status(200).send("OK");

    const entries = body.entry;
    if (entries && entries.length > 0) {
      for (const entry of entries) {
        const changes = entry.changes;
        if (changes && changes.length > 0) {
          for (const change of changes) {
            const value = change.value;
            if (value && value.messages && value.messages.length > 0) {
              for (const msg of value.messages) {
                if (msg.type === "text") {
                  const from = msg.from;
                  const text = msg.text.body;

                  console.log(`Received WhatsApp message from ${from}: ${text}`);

                  // Get AI reply and send back to WhatsApp
                  const reply = await getGeminiReply(text);
                  await sendWhatsAppMessage(from, reply);
                }
              }
            }
          }
        }
      }
    }
    return;
  }

  // 2. Detect if it's a Chakra Chat Webhook (format: { message: "..." })
  if (body.message) {
    const { message } = body;
    console.log(`Received Chakra Chat message: ${message}`);

    const reply = await getGeminiReply(message);

    // IMPORTANT: Chakra expects { text: ... }
    return res.json({ text: reply });
  }

  // Unknown format
  console.log("Unknown webhook format received:", JSON.stringify(body));
  res.status(200).send("Acknowledged unknown format");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

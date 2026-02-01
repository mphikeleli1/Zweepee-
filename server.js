const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("Zweepee webhook live");
});

// Webhook for Chakra Chat
app.post("/webhook", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message || "" }] }]
        })
      }
    );

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No reply";

    // IMPORTANT: Chakra expects { text: ... }
    res.json({ text: reply });
  } catch (err) {
    console.error("Gemini error:", err);
    res.json({ text: "Error processing message" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook running on port ${PORT}`));

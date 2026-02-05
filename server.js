import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ✅ Verify Token must match what you set in Meta console
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "zweepee123";

// ✅ Meta verification handshake
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WEBHOOK_VERIFIED");
      res.status(200).send(challenge); // critical line
    } else {
      res.sendStatus(403); // token mismatch
    }
  } else {
    res.sendStatus(400); // missing parameters
  }
});

// Webhook endpoint for WhatsApp → Gemini
app.post("/webhook", async (req, res) => {
  try {
    // 👇 This line ensures you see the payload in Render logs
    console.log("Incoming webhook payload:", JSON.stringify(req.body, null, 2));

    const userMessage =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || "";

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }]}]
        })
      }
    );

    const data = await geminiResponse.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "…";

    res.json({ text: reply });
  } catch (err) {
    console.error("Webhook error:", err);
    res.json({ text: "Sorry, something went wrong." });
  }
});

app.get("/", (req, res) => {
  res.send("Zweepee webhook is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

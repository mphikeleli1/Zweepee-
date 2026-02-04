import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Webhook endpoint for WhatsApp → Chakra → Gemini
app.post("/webhook", async (req, res) => {
  try {
    const userMessage = req.body.message || "";

    // Call Gemini (replace with your actual Gemini API call)
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }]}]
      })
    });

    const data = await geminiResponse.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "…";

    // IMPORTANT: return { text: reply } for Chakra
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

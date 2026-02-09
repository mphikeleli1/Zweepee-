
function fallbackIntentParser(messageText) {
  const text = messageText.toLowerCase();
  const intents = [];

  const patterns = {
    shopping: ['buy', 'search', 'find', 'iphone', 'nike', 'dischem', 'pill', 'panado'],
    food: ['eat', 'hungry', 'kfc', 'mcdonald', 'burger', 'pizza', 'streetwise'],
    accommodation: ['hotel', 'airbnb', 'stay', 'cpt', 'cape town', 'durban', 'dbn'],
    flights: ['flight', 'fly', 'plane', 'travel'],
    car_rental: ['car', 'rent', 'polo'],
    airtime: ['airtime', 'data', 'vodacom', 'mtn'],
    electricity: ['electricity', 'meter', 'power'],
    cart_action: ['cart', 'checkout', 'pay', 'clear']
  };

  for (const [intent, keywords] of Object.entries(patterns)) {
    if (keywords.some(k => text.includes(k))) {
      intents.push({
        intent,
        confidence: 0.8,
        extracted_data: { product: messageText } // Best effort
      });
    }
  }

  return intents.length > 0 ? intents : [{ intent: 'help', confidence: 0.5 }];
}

function testExtractJson(text) {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\[[\s\S]*\]/);
    return jsonMatch ? jsonMatch[1] || jsonMatch[0] : null;
}

// Test Cases
const queries = [
    "I need KFC and a hotel in CPT",
    "Where can I buy Panado?",
    "Book a flight to JNB",
    "How are you?"
];

console.log("--- FALLBACK PARSER TEST ---");
queries.forEach(q => {
    console.log(`Query: "${q}" -> Intents:`, fallbackIntentParser(q).map(i => i.intent));
});

console.log("\n--- JSON EXTRACTION TEST ---");
const aiOutput = "Here is the result:\n```json\n[{\"intent\": \"food\"}]\n```\nHope that helps!";
console.log("AI Output with Markdown -> Extracted:", testExtractJson(aiOutput));

const rawOutput = "[{\"intent\": \"shopping\"}]";
console.log("Raw Output -> Extracted:", testExtractJson(rawOutput));

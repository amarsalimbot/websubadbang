const { GoogleGenAI } = require("@google/genai");
const config = require("./../config");

let client = null;
function getClient() {
    if (!config.ai.geminiKey) return null;
    if (!client) client = new GoogleGenAI({ apiKey: config.ai.geminiKey });
    return client;
}

async function generateText(instructions, prompt) {
    const gemini = getClient();
    if (!gemini) throw new Error("GEMINI_API_KEY belum diisi");

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Gemini timeout")), config.ai.timeoutMs);
    });
    try {
        const response = await Promise.race([
            gemini.models.generateContent({
                model: config.ai.geminiModel,
                contents: `${instructions}\n\n${prompt}`
            }),
            timeoutPromise
        ]);
        const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!text) throw new Error("Gemini mengembalikan jawaban kosong");
        return text;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { generateText };

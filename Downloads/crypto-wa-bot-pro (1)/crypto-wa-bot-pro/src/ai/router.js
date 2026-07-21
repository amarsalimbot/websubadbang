const config = require("./../config");
const state = require("./../state");
const { pendekkanError } = require("./../utils");
const openaiProvider = require("./openai");
const geminiProvider = require("./gemini");

const PROVIDERS = {
    openai: { name: "ChatGPT / OpenAI", configured: () => Boolean(config.ai.openaiKey), generate: openaiProvider.generateText },
    gemini: { name: "Gemini", configured: () => Boolean(config.ai.geminiKey), generate: geminiProvider.generateText }
};

const cooldowns = {}; // providerKey -> until timestamp

function trimResponse(text) {
    const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
    if (clean.length <= config.ai.maxOutputChars) return clean;
    return `${clean.slice(0, config.ai.maxOutputChars - 80).trim()}\n\n[Jawaban dipotong agar muat di WhatsApp]`;
}

function hasAnyProvider() {
    return config.ai.providerOrder.some(key => PROVIDERS[key]?.configured());
}

function cooldownText(until) {
    if (!until || Date.now() > until) return "tidak ada";
    return new Date(until).toLocaleTimeString("id-ID");
}

function statusSnapshot() {
    return config.ai.providerOrder
        .filter(key => PROVIDERS[key])
        .map(key => ({
            key,
            name: PROVIDERS[key].name,
            configured: PROVIDERS[key].configured(),
            available: Date.now() > (cooldowns[key] || 0),
            cooldownUntil: cooldowns[key] || 0
        }));
}

function resetCooldowns() {
    for (const key of Object.keys(cooldowns)) cooldowns[key] = 0;
}

/** Coba setiap provider sesuai urutan config; provider gagal masuk cooldown sebentar. */
async function generateAiText({ instructions, prompt, purpose = "chat" }) {
    if (!hasAnyProvider()) {
        throw new Error("AI belum dikonfigurasi. Isi OPENAI_API_KEY dan/atau GEMINI_API_KEY.");
    }

    const errors = [];
    for (const key of config.ai.providerOrder) {
        const provider = PROVIDERS[key];
        if (!provider || !provider.configured()) continue;
        if (Date.now() < (cooldowns[key] || 0)) {
            errors.push(`${provider.name} cooldown sampai ${cooldownText(cooldowns[key])}`);
            continue;
        }
        try {
            const text = trimResponse(await provider.generate(instructions, prompt));
            if (!text) throw new Error("jawaban kosong");
            return { provider: provider.name, providerKey: key, text };
        } catch (err) {
            cooldowns[key] = Date.now() + config.ai.providerCooldownMs;
            errors.push(`${provider.name}: ${pendekkanError(err.message || err)}`);
        }
    }
    throw new Error(`Semua provider AI gagal untuk ${purpose}. ${errors.join(" | ")}`);
}

function formatHistory(jid) {
    const turns = state.getAiHistory(jid);
    if (!turns.length) return "";
    return turns.map(t => `User: ${t.question}\nAsisten: ${t.answer}`).join("\n\n");
}

async function transcribeVoice(buffer, filename, mimeType) {
    return openaiProvider.transcribeAudio(buffer, filename, mimeType);
}

module.exports = {
    generateAiText,
    statusSnapshot,
    resetCooldowns,
    formatHistory,
    transcribeVoice,
    hasAnyProvider,
    trimResponse
};

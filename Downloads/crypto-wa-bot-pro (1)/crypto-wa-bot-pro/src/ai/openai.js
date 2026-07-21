const config = require("./../config");
const { pendekkanError } = require("./../utils");

function extractOpenAiText(data) {
    if (typeof data?.output_text === "string") return data.output_text;
    return (data?.output || [])
        .flatMap(item => item?.content || [])
        .filter(part => part?.type === "output_text" && part?.text)
        .map(part => part.text)
        .join("\n");
}

async function generateText(instructions, prompt) {
    if (!config.ai.openaiKey) throw new Error("OPENAI_API_KEY belum diisi");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    try {
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${config.ai.openaiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.ai.openaiModel,
                instructions,
                input: prompt,
                max_output_tokens: config.ai.maxOutputTokens,
                store: false
            })
        });
        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${pendekkanError(data?.error?.message || raw)}`);
        const text = extractOpenAiText(data);
        if (!text) throw new Error("OpenAI mengembalikan jawaban kosong");
        return text;
    } finally {
        clearTimeout(timer);
    }
}

/** Transkripsi voice note (buffer audio) memakai Whisper. */
async function transcribeAudio(buffer, filename = "voice.ogg", mimeType = "audio/ogg") {
    if (!config.ai.openaiKey) throw new Error("OPENAI_API_KEY belum diisi, transkripsi suara tidak tersedia");
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    form.append("model", config.ai.openaiWhisperModel);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    try {
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            signal: controller.signal,
            headers: { Authorization: `Bearer ${config.ai.openaiKey}` },
            body: form
        });
        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
        if (!response.ok) throw new Error(`Whisper HTTP ${response.status}: ${pendekkanError(data?.error?.message || raw)}`);
        if (!data.text) throw new Error("Whisper tidak mengembalikan teks");
        return data.text.trim();
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { generateText, transcribeAudio };

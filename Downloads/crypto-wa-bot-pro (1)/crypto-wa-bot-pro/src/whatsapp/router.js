const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const config = require("./../config");
const logger = require("./../logger");
const { extractMessageText } = require("./extractMessage");
const handlers = require("./handlers");
const messages = require("./../messages");
const aiRouter = require("./../ai/router");
const waClient = require("./client");

async function transcribeVoiceNote(sock, msg, audioMessage) {
    const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
    const mimeType = audioMessage.mimetype || "audio/ogg";
    return aiRouter.transcribeVoice(buffer, "voice.ogg", mimeType);
}

async function handleMessage(sock, msg, upsertType = "notify") {
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    if (!from || from === "status@broadcast" || String(from).endsWith("@newsletter")) return;

    const extracted = extractMessageText(msg.message);
    let text = extracted.text;

    if (msg.key.fromMe) {
        if (upsertType !== "notify") return;
        if (waClient.wasSentByBot(msg, text)) return;
        if (!waClient.isOwnerSelfChat(msg)) {
            if (config.messageDebug) logger.debug(`Pesan fromMe non-self diabaikan: ${from}`);
            return;
        }
    }

    if (!text && extracted.content.audioMessage) {
        if (!config.ai.voiceNotesEnabled) {
            return sock.sendMessage(from, { text: "Voice note belum diaktifkan. Tolong ketik perintah dalam bentuk teks, atau set AI_VOICE_NOTES_ENABLED=true." });
        }
        try {
            await sock.sendMessage(from, { text: "Mendengarkan voice note..." });
            const transcript = await transcribeVoiceNote(sock, msg, extracted.content.audioMessage);
            if (!transcript) return sock.sendMessage(from, { text: "Tidak terdengar apa-apa di voice note itu, coba lagi." });
            await sock.sendMessage(from, { text: `Transkrip: "${transcript}"` });
            text = transcript;
        } catch (err) {
            return sock.sendMessage(from, { text: `Gagal transkrip voice note: ${err.message || err}` });
        }
    }

    if (!text) return;

    const pesan = text.trim();
    const lower = pesan.toLowerCase();
    if (config.messageDebug) logger.debug(`Pesan dari ${from}: ${pesan.slice(0, 80)}`);

    try {
        if (/^(menu|help|bantuan|fitur|panduan|cara pakai)$/i.test(lower)) {
            return sock.sendMessage(from, { text: messages.menuText() });
        }

        if (/^(ai|chatgpt|chat|tanya)\s+status$/i.test(lower)) return handlers.handleAiStatus(sock, from);
        if (/^(ai|chatgpt|chat|tanya)\s+(reset|hapus memori|lupa)$/i.test(lower)) return handlers.handleAiReset(sock, from);
        if (/^(ai|chatgpt|chat|tanya)\s+(retry|coba lagi|reset provider)$/i.test(lower)) return handlers.handleAiRetry(sock, from);
        if (/^(ai|chatgpt|chat|tanya)\s+deep\s+/i.test(lower)) return handlers.handleAiDeep(sock, from, pesan);

        if (/^(ai|chatgpt|chat|tanya)(\s|$)/i.test(pesan)) {
            const question = pesan.replace(/^(ai|chatgpt|chat|tanya)\s*/i, "").trim();
            if (!question) return sock.sendMessage(from, { text: "Tulis pertanyaan setelah perintah AI.\nContoh: ai jelaskan DCA Bitcoin dengan sederhana" });
            return handlers.sendAiAnswer(sock, from, question);
        }

        if (/^(alert|sinyal|monitor)\s+(on|off)$/i.test(lower)) return handlers.handleAlert(sock, from, lower);
        if (/^mode\s+(trader|investor)$/i.test(lower)) return handlers.handleMode(sock, from, lower);
        if (/^(refresh|refresh data|update data|muat ulang)$/i.test(lower)) return handlers.handleRefresh(sock, from);
        if (/^(status|cek status)$/i.test(lower)) {
            return handlers.handleStatus(sock, from, {
                connection: waClient.getConnectionState(),
                reconnectCount: waClient.getReconnectCount()
            });
        }
        if (/^dashboard$/i.test(lower)) return handlers.handleDashboard(sock, from);

        if (/^watchlist/i.test(lower)) return handlers.handleWatchlist(sock, from, pesan, lower);

        if (/^paper\b/i.test(lower)) return handlers.handlePaper(sock, from, pesan, lower);

        if (/^backtest\b/i.test(lower)) return handlers.handleBacktest(sock, from, pesan);

        if (/^set\s+(sl|tp1|tp2|tp)\b/i.test(lower)) return handlers.handleSetLevel(sock, from, pesan, lower);

        if (/^(beli|buy)\b/i.test(lower)) return handlers.handleBeli(sock, from, pesan);
        if (/^(jual|sell)\b/i.test(lower)) return handlers.handleJual(sock, from, pesan);
        if (/^(posisi|position)\b/i.test(lower)) return handlers.handlePosisi(sock, from, pesan);
        if (/^(jurnal|riwayat posisi|history)$/i.test(lower)) return handlers.handleJurnal(sock, from);
        if (/^risk\b/i.test(lower)) return handlers.handleRisk(sock, from, pesan);

        if (/^chart\b/i.test(lower)) return handlers.handleChart(sock, from, pesan);
        if (/^analisa\b|^analisis\b/i.test(lower)) return handlers.handleAnalisa(sock, from, pesan);
        if (/^(harga|price)\b/i.test(lower)) return handlers.handleHarga(sock, from, pesan);

        if (/^berita\b|^news\b/i.test(lower)) return handlers.handleBerita(sock, from, pesan);
        if (/^laporan$/i.test(lower)) return handlers.handleHarga(sock, from, "");

        if (config.ai.autoChat) return handlers.sendAiAnswer(sock, from, pesan);

        return sock.sendMessage(from, { text: "Perintah tidak dikenali. Ketik 'menu' untuk daftar perintah." });
    } catch (err) {
        logger.error(`Error handle pesan dari ${from}:`, err.message || err);
        return sock.sendMessage(from, { text: `Terjadi error: ${err.message || err}` }).catch(() => {});
    }
}

module.exports = { handleMessage };

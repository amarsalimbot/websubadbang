const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const config = require("./../config");
const logger = require("./../logger");
const { sleep, errorMessage } = require("./../utils");

let sockGlobal = null;
let sedangStart = false;
let reconnectTimer = null;
let jumlahReconnect = 0;
let whatsappConnectionState = "starting";
let lastIncomingMessageAt = 0;
let lastOutgoingMessageAt = 0;

const botMessageIds = new Map();
const botMessageFingerprints = new Map();

function isClosedSignalSessionError(err) {
    const message = errorMessage(err).toLowerCase();
    return message.includes("decrypted message with closed session") || message.includes("message with closed session");
}

function messageFingerprint(jid, content) {
    const text = String(content?.text || content?.caption || "").trim();
    if (!jid || !text) return "";
    return `${jid}:${text.slice(0, 500)}`;
}

function pruneBotMessageTracking() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, at] of botMessageIds) if (at < cutoff) botMessageIds.delete(key);
    for (const [key, at] of botMessageFingerprints) if (at < cutoff) botMessageFingerprints.delete(key);
}

function markBotOutgoingMessage(jid, content, result) {
    pruneBotMessageTracking();
    const id = result?.key?.id;
    const fingerprint = messageFingerprint(jid, content);
    if (id) botMessageIds.set(id, Date.now());
    if (fingerprint) botMessageFingerprints.set(fingerprint, Date.now());
    lastOutgoingMessageAt = Date.now();
}

function wasSentByBot(msg, text) {
    pruneBotMessageTracking();
    const id = msg?.key?.id;
    const fingerprint = messageFingerprint(msg?.key?.remoteJid, { text });
    return Boolean((id && botMessageIds.has(id)) || (fingerprint && botMessageFingerprints.has(fingerprint)));
}

function isOwnerSelfChat(msg) {
    if (!config.allowSelfChat || !msg?.key?.fromMe) return false;
    const candidates = [msg.key.remoteJid, msg.key.remoteJidAlt, msg.key.participant, msg.key.participantAlt].filter(Boolean);
    return candidates.includes(config.ownerJid) || candidates.some(jid => {
        const phone = String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
        return phone && phone === config.whatsappPhoneNumber;
    });
}

function cleanupSocket(expectedSocket = sockGlobal) {
    if (!expectedSocket) return;
    try {
        if (expectedSocket?.ev?.removeAllListeners) {
            expectedSocket.ev.removeAllListeners("connection.update");
            expectedSocket.ev.removeAllListeners("messages.upsert");
            expectedSocket.ev.removeAllListeners("creds.update");
        }
        if (expectedSocket?.ws?.close) expectedSocket.ws.close();
    } catch (err) {
        logger.warn("Cleanup socket dilewati:", err.message || err);
    }
    if (sockGlobal === expectedSocket) sockGlobal = null;
}

function jadwalkanReconnect(alasan = "koneksi terputus", jedaKhusus = null) {
    if (reconnectTimer) return;
    jumlahReconnect++;
    const jeda = jedaKhusus || Math.min(5000 + jumlahReconnect * 3000, 60000);
    logger.info(`Reconnect karena ${alasan}. Coba lagi dalam ${jeda / 1000} detik.`);
    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        sedangStart = false;
        cleanupSocket();
        await startBot();
    }, jeda);
}

async function ambilNomorWhatsApp() {
    if (!config.whatsappPhoneNumber || config.whatsappPhoneNumber.length < 10) {
        throw new Error("WHATSAPP_PHONE_NUMBER belum diisi. Contoh: 6281234567890");
    }
    return config.whatsappPhoneNumber;
}

async function sendSafe(jid, content) {
    if (!sockGlobal || !jid || !content) return null;
    try {
        return await sockGlobal.sendMessage(jid, typeof content === "string" ? { text: content } : content);
    } catch (err) {
        logger.warn(`Gagal kirim ke ${jid}:`, err.message || err);
        return null;
    }
}

let onMessageHandler = async () => {};
function setMessageHandler(fn) {
    onMessageHandler = fn;
}

let onReadyHandler = async () => {};
function setReadyHandler(fn) {
    onReadyHandler = fn;
}

async function startBot() {
    if (sedangStart) {
        logger.info("Bot sedang start, proses dobel dilewati.");
        return;
    }
    sedangStart = true;

    try {
        logger.info("Memulai Bot Crypto Pro...");
        logger.info("Metode login WhatsApp: pairing code.");
        logger.info(`Folder session WhatsApp: ${config.whatsappAuthDir}`);

        cleanupSocket();
        if (!fs.existsSync(config.whatsappAuthDir)) fs.mkdirSync(config.whatsappAuthDir, { recursive: true });
        const { state: authState, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: authState,
            logger: pino({ level: config.waLogLevel }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            connectTimeoutMs: 90_000,
            keepAliveIntervalMs: 30_000,
            retryRequestDelayMs: 5_000,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes("@broadcast")
        });

        const rawSendMessage = sock.sendMessage.bind(sock);
        sock.sendMessage = async (jid, content, options) => {
            markBotOutgoingMessage(jid, content);
            const result = await rawSendMessage(jid, content, options);
            markBotOutgoingMessage(jid, content, result);
            return result;
        };

        sockGlobal = sock;
        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
            if (sock !== sockGlobal) return;
            if (qr) logger.info("QR diterima tapi diabaikan. Script ini memakai pairing code.");
            if (connection) whatsappConnectionState = connection;
            if (connection === "connecting") logger.info("Menghubungkan ke WhatsApp...");

            if (connection === "open") {
                logger.info("Bot Crypto Pro terhubung dan online.");
                sedangStart = false;
                jumlahReconnect = 0;
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
                await onReadyHandler(sock);
            }

            if (connection === "close") {
                sedangStart = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const alasan = lastDisconnect?.error?.message || "unknown";
                const alasanLower = String(alasan).toLowerCase();

                logger.info(`Koneksi terputus. Status: ${statusCode || "unknown"}`);
                logger.info(`Alasan: ${alasan}`);
                cleanupSocket(sock);

                if (statusCode === DisconnectReason.loggedOut) {
                    logger.info("WhatsApp logout. Hapus folder session lalu deploy ulang untuk login lagi.");
                    return;
                }
                if (statusCode === 440 || alasanLower.includes("conflict")) return jadwalkanReconnect("conflict session WhatsApp", 60000);
                if (statusCode === 408 || alasanLower.includes("timed out")) return jadwalkanReconnect("timeout koneksi", 20000);
                if (statusCode === 515) return jadwalkanReconnect("restart required", 15000);
                jadwalkanReconnect("WhatsApp close", 20000);
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (sock !== sockGlobal) return;
            lastIncomingMessageAt = Date.now();
            for (const msg of messages || []) {
                try {
                    await onMessageHandler(sock, msg, type, { wasSentByBot, isOwnerSelfChat, isClosedSignalSessionError });
                } catch (err) {
                    if (isClosedSignalSessionError(err)) {
                        logger.info("Pesan lama dari sesi Signal tertutup diabaikan; koneksi bot tetap dipertahankan.");
                        continue;
                    }
                    logger.error(`Error memproses pesan ${msg?.key?.id || "-"}:`, err.message || err);
                }
            }
        });

        if (!sock.authState.creds.registered) {
            const nomorWhatsApp = await ambilNomorWhatsApp();
            logger.info("Menunggu koneksi siap sebelum meminta kode...");
            await sleep(5000);
            logger.info("Meminta kode masuk WhatsApp...");
            logger.info(`Nomor WhatsApp: ${nomorWhatsApp}`);
            try {
                const kodeLogin = await sock.requestPairingCode(nomorWhatsApp);
                const kodeRapi = String(kodeLogin).match(/.{1,4}/g)?.join("-") || kodeLogin;
                logger.info("========================================");
                logger.info(`KODE MASUK WHATSAPP: ${kodeRapi}`);
                logger.info("========================================");
                logger.info("Cara pakai: WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon > masukkan kode di atas.");
            } catch (err) {
                logger.info("Gagal meminta kode masuk:", err.message || err);
                sedangStart = false;
                cleanupSocket();
                jadwalkanReconnect("gagal meminta pairing code", 30000);
                return;
            }
        } else {
            logger.info("Session WhatsApp sudah terdaftar. Tidak perlu kode masuk lagi.");
        }

        sedangStart = false;
    } catch (err) {
        sedangStart = false;
        cleanupSocket();
        logger.error("Gagal start bot:", err.message || err);
        jadwalkanReconnect("gagal start bot", 30000);
    }
}

process.on("uncaughtException", err => {
    if (isClosedSignalSessionError(err)) {
        logger.info("Peringatan Signal: pesan dari sesi tertutup diabaikan tanpa reconnect.");
        return;
    }
    logger.error("uncaughtException:", err.message || err);
    jadwalkanReconnect("uncaughtException", 15000);
});

process.on("unhandledRejection", err => {
    if (isClosedSignalSessionError(err)) {
        logger.info("Peringatan Signal: pesan dari sesi tertutup diabaikan tanpa reconnect.");
        return;
    }
    logger.error("unhandledRejection:", err?.message || err);
    jadwalkanReconnect("unhandledRejection", 15000);
});

process.on("SIGINT", () => { cleanupSocket(); process.exit(0); });
process.on("SIGTERM", () => { cleanupSocket(); process.exit(0); });

module.exports = {
    startBot,
    sendSafe,
    setMessageHandler,
    setReadyHandler,
    getSocket: () => sockGlobal,
    getConnectionState: () => whatsappConnectionState,
    getReconnectCount: () => jumlahReconnect,
    getLastIncomingMessageAt: () => lastIncomingMessageAt,
    getLastOutgoingMessageAt: () => lastOutgoingMessageAt,
    wasSentByBot,
    isOwnerSelfChat,
    isClosedSignalSessionError
};

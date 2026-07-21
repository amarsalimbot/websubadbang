const config = require("./config");
const state = require("./state");
const market = require("./market");
const messages = require("./messages");
const { analyzeAsset, analyzeMany, timeframeLabel, candleMinutesForMode } = require("./analysis");
const positionMonitor = require("./trading/positionMonitor");
const paperBroker = require("./trading/paperBroker");
const news = require("./news");
const { sleep, nowText, pendekkanError, formatUsd, formatPct } = require("./utils");
const waClient = require("./whatsapp/client");

let monitorTimer = null;
let monitorCursor = 0;
let monitorRunning = false;
let autoReportTimer = null;
let autoReportStartupTimer = null;
const candleReportTimers = { trader: null, investor: null };
let autoReportBusy = false;

// ---------------- Market monitor: sinyal watchlist + cek posisi journal & paper ----------------

async function runMarketMonitor() {
    if (monitorRunning) return;
    if (!waClient.getSocket()) return;

    const allAssets = config.assetCatalog;
    if (!allAssets.length) return;

    monitorRunning = true;
    try {
        const asset = allAssets[monitorCursor % allAssets.length];
        monitorCursor++;

        let defaultResult;
        try {
            defaultResult = await analyzeAsset(asset, config.risk.defaultMode, { force: false });
        } catch (err) {
            console.log(`Monitor gagal ${asset.asset}: ${pendekkanError(err.message)}`);
            return;
        }

        // Cek posisi jurnal manual & paper trading untuk aset ini.
        const journalNotifs = positionMonitor.checkJournalPositions(asset.asset, defaultResult.ticker.price, defaultResult.consensus);
        for (const n of journalNotifs) {
            await waClient.sendSafe(n.jid, n.text);
            await sleep(300);
        }

        const paperTriggers = paperBroker.checkPositionsForAsset(asset.asset, defaultResult.ticker.price);
        for (const t of paperTriggers) {
            await waClient.sendSafe(t.jid, `PAPER TRADING AUTO-CLOSE — ${asset.asset} [${t.action}]\nEntry: ${formatUsd(t.position.entryPrice)} -> Exit: ${formatUsd(defaultResult.ticker.price)}\nPnL: ${formatUsd(t.netPnl, 2)} (${formatPct(t.pnlPercent)})`);
            await sleep(300);
        }

        if (!["ENTRY", "SELL"].includes(defaultResult.consensus.action)) return;

        const resultByMode = { [config.risk.defaultMode]: defaultResult };
        const subscribers = state.getAllActiveSubscribers();
        for (const [jid, user] of subscribers) {
            if (!resultByMode[user.mode]) {
                try {
                    resultByMode[user.mode] = await analyzeAsset(asset, user.mode, { force: false });
                } catch (_) { continue; }
                await sleep(400);
            }
            const result = resultByMode[user.mode];
            if (!["ENTRY", "SELL"].includes(result.consensus.action)) continue;
            if (!state.canSendSignalAlert(asset.asset, result.consensus.action)) continue;

            const title = result.consensus.action === "ENTRY" ? "ALERT ENTRY" : "ALERT SELL";
            await waClient.sendSafe(jid, `${title}\n\n${messages.buildAnalysisMessage(result)}`);
            await sleep(300);
        }
        state.markSignalAlertSent(asset.asset, defaultResult.consensus.action);
    } finally {
        monitorRunning = false;
    }
}

function startMarketMonitor() {
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = setInterval(() => {
        runMarketMonitor().catch(err => console.log("Monitor error:", err.message || err));
    }, config.monitor.intervalMs);
    setTimeout(() => {
        runMarketMonitor().catch(err => console.log("Monitor awal error:", err.message || err));
    }, 10_000);
}

// ---------------- Auto report (candle close & interval) ----------------

async function buildAutoMarketReport(mode) {
    const analyses = await analyzeMany(config.defaultWatchlist, mode, { force: true });
    const tfLabel = timeframeLabel(mode);
    const lines = [
        `AUTO REPORT ${tfLabel} — Mode ${mode.toUpperCase()}`,
        `Waktu: ${nowText()} | Provider: ${market.marketProviderLabel()}`,
        ""
    ];

    for (const row of analyses) {
        if (row.error) { lines.push(`${row.asset}: data belum siap (${row.error})`); continue; }
        lines.push(
            `${messages.signalEmoji(row.consensus.action)} ${row.asset} ${formatUsd(row.ticker.price)} (${formatPct(row.ticker.changePct)}) — ${row.consensus.action} ${row.consensus.confidence}%`
        );
    }

    try {
        const items = (await news.getCryptoNews()).slice(0, 3);
        if (items.length) lines.push("", "Berita terbaru:", ...items.map((i, idx) => `${idx + 1}. ${i.title}`));
    } catch (_) { /* lewati jika gagal */ }

    lines.push("", "Gunakan stop loss, atur ukuran posisi, dan jangan entry hanya karena satu sinyal. Bukan saran keuangan.");
    return lines.join("\n");
}

async function sendCandleReport(mode, alasan = "candle close") {
    if (autoReportBusy) {
        setTimeout(() => sendCandleReport(mode, "retry").catch(() => {}), 60_000);
        return;
    }
    if (!config.autoReport.enabled || !waClient.getSocket()) return;
    const recipients = state.getSubscribersForMode(mode);
    if (!recipients.length) return;

    autoReportBusy = true;
    try {
        console.log(`Mengirim candle report ${mode} (${alasan}) ke ${recipients.length} penerima.`);
        const report = await buildAutoMarketReport(mode);
        for (const jid of recipients) {
            await waClient.sendSafe(jid, report);
            await sleep(1000);
        }
    } catch (err) {
        console.log(`Candle report ${mode} gagal: ${pendekkanError(err.message)}`);
    } finally {
        autoReportBusy = false;
    }
}

async function sendIntervalReport(alasan = "jadwal interval") {
    if (autoReportBusy || !config.autoReport.enabled || !waClient.getSocket()) return;
    const subscribers = state.getAllActiveSubscribers();
    if (!subscribers.length) return;

    autoReportBusy = true;
    try {
        console.log(`Mengirim auto report interval (${alasan}) ke ${subscribers.length} penerima.`);
        const cache = {};
        for (const [jid, user] of subscribers) {
            if (!cache[user.mode]) cache[user.mode] = await buildAutoMarketReport(user.mode);
            await waClient.sendSafe(jid, cache[user.mode]);
            await sleep(1000);
        }
    } catch (err) {
        console.log(`Auto report interval gagal: ${pendekkanError(err.message)}`);
    } finally {
        autoReportBusy = false;
    }
}

function msUntilNextCandle(minutes) {
    const now = Date.now();
    const periodMs = minutes * 60_000;
    const next = Math.ceil(now / periodMs) * periodMs + config.autoReport.candleReportDelayMs;
    return Math.max(5000, next - now);
}

function scheduleNextCandleReport(mode) {
    if (!config.autoReport.enabled || !["candle", "both"].includes(config.autoReport.mode)) return;
    if (candleReportTimers[mode]) clearTimeout(candleReportTimers[mode]);

    const minutes = candleMinutesForMode(mode);
    const delay = msUntilNextCandle(minutes);
    candleReportTimers[mode] = setTimeout(async () => {
        await sendCandleReport(mode, "candle close");
        scheduleNextCandleReport(mode);
    }, delay);
    console.log(`Candle report ${mode} aktif. Berikutnya sekitar ${(delay / 60000).toFixed(1)} menit lagi.`);
}

function startAutomaticReports() {
    if (!config.autoReport.enabled) {
        console.log("Auto market report nonaktif via AUTO_REPORT_ENABLED=false.");
        return;
    }
    if (autoReportTimer) clearInterval(autoReportTimer);
    if (autoReportStartupTimer) clearTimeout(autoReportStartupTimer);
    for (const mode of ["trader", "investor"]) {
        if (candleReportTimers[mode]) clearTimeout(candleReportTimers[mode]);
        candleReportTimers[mode] = null;
    }

    autoReportStartupTimer = setTimeout(() => {
        sendIntervalReport("startup").catch(err => console.log("Auto report startup error:", err.message || err));
    }, config.autoReport.startDelayMs);

    if (["interval", "both"].includes(config.autoReport.mode)) {
        autoReportTimer = setInterval(() => {
            sendIntervalReport("jadwal interval").catch(err => console.log("Auto report interval error:", err.message || err));
        }, config.autoReport.intervalMinutes * 60_000);
    }

    if (["candle", "both"].includes(config.autoReport.mode)) {
        scheduleNextCandleReport("trader");
        scheduleNextCandleReport("investor");
    }

    console.log(`Auto report aktif. Mode jadwal: ${config.autoReport.mode}.`);
}

module.exports = { startMarketMonitor, startAutomaticReports, runMarketMonitor, buildAutoMarketReport };

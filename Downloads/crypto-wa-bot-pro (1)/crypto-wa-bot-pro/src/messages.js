const config = require("./config");
const { formatUsd, formatPct, formatUnits, timeText, nowText } = require("./utils");
const { calculateTradeLevels } = require("./analysis");
const market = require("./market");

function marketPulseBar(changePct) {
    const n = Number(changePct) || 0;
    const clamped = Math.max(-10, Math.min(10, n));
    const filled = Math.round(((clamped + 10) / 20) * 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

function signalEmoji(action) {
    return action === "ENTRY" ? "🟢" : action === "SELL" ? "🔴" : "🟡";
}

function buildPriceMessage(results) {
    const lines = [`HARGA REALTIME (${nowText()})`, ""];
    for (const r of results) {
        if (r.error) {
            lines.push(`${r.asset}: gagal ambil data (${r.error})`);
            continue;
        }
        const t = r.ticker;
        lines.push(
            `${r.asset} (${r.name}): ${formatUsd(t.price)} ${formatPct(t.changePct)} [${marketPulseBar(t.changePct)}] — ${t.source}${t.stale ? " (cache)" : ""}`
        );
    }
    return lines.join("\n");
}

function compactReasons(reasons, max = 4) {
    return reasons.slice(0, max).map(r => `• ${r}`).join("\n");
}

function buildAnalysisMessage(result) {
    const { ticker, ind, consensus, asset, name, mode, timeframe } = result;
    const levels = calculateTradeLevels(result);
    const lines = [
        `ANALISA ${asset} (${name}) — Mode ${mode.toUpperCase()} [${timeframe}]`,
        `Harga: ${formatUsd(ticker.price)} ${formatPct(ticker.changePct)} (${ticker.source}${ticker.stale ? ", cache" : ""})`,
        `Sinyal: ${signalEmoji(consensus.action)} ${consensus.action} — keyakinan ${consensus.confidence}%`,
        "",
        `RSI14: ${ind.rsi14 ? ind.rsi14.toFixed(1) : "-"} | MACD hist: ${ind.macd ? ind.macd.histogram.toFixed(4) : "-"}`,
        `EMA9/21/50: ${ind.ema9 ? ind.ema9.toFixed(2) : "-"} / ${ind.ema21 ? ind.ema21.toFixed(2) : "-"} / ${ind.ema50 ? ind.ema50.toFixed(2) : "-"}`,
        `Support/Resistance: ${formatUsd(ind.sr.support)} / ${formatUsd(ind.sr.resistance)}`,
        `Volatilitas: ${ind.volatilityPct.toFixed(2)}%`,
        "",
        "Strategi yang setuju:",
        consensus.agreeing.length
            ? consensus.agreeing.map(a => `• ${a.name} (${a.direction > 0 ? "naik" : "turun"}, ${a.confidence}%)`).join("\n")
            : "• Tidak ada strategi dengan sinyal kuat saat ini",
        "",
        "Alasan utama:",
        compactReasons(consensus.reasons) || "• Tidak ada sinyal dominan, kondisi netral",
        "",
        "Rencana trade (jika entry):",
        `Entry: ${formatUsd(levels.entryPrice)} | SL: ${formatUsd(levels.sl)} | TP1: ${formatUsd(levels.tp1)} | TP2: ${formatUsd(levels.tp2)}`,
        "",
        "Ini bukan saran keuangan. Selalu gunakan manajemen risiko sendiri."
    ];
    return lines.join("\n");
}

function buildBacktestMessage(result) {
    const lines = [
        `BACKTEST ${result.asset} — Mode ${result.mode.toUpperCase()} (${result.strategy})`,
        `Periode: ~${result.actualDays} hari (${result.candleCount} candle, timeframe ${result.interval})`,
        "",
        `Modal awal: ${formatUsd(result.startingCapital, 2)}`,
        `Equity akhir: ${formatUsd(result.finalEquity, 2)}`,
        `Return total: ${formatPct(result.totalReturnPct)}`,
        `Max drawdown: -${result.maxDrawdownPct.toFixed(2)}%`,
        "",
        `Total trade: ${result.totalTrades} | Win: ${result.wins} | Loss: ${result.losses}`,
        `Win rate: ${result.winRatePct.toFixed(1)}%`,
        `Profit factor: ${Number.isFinite(result.profitFactor) ? result.profitFactor.toFixed(2) : "∞"}`,
        `Rata-rata R per trade: ${result.avgR.toFixed(2)}R`,
        "",
        "Catatan: hasil historis tidak menjamin hasil ke depan. Backtest ini menyederhanakan eksekusi (tanpa slippage/funding rate)."
    ];
    return lines.join("\n");
}

function positionPnl(position, currentPrice) {
    const diff = currentPrice - position.entryPrice;
    const pnlPercent = (diff / position.entryPrice) * 100;
    const pnlAmount = position.quantity ? diff * position.quantity : null;
    return { pnlPercent, pnlAmount };
}

function buildPositionSnapshot(position, currentPrice) {
    const { pnlPercent, pnlAmount } = positionPnl(position, currentPrice);
    const lines = [
        `${position.asset} [${position.status === "open" ? "OPEN" : "CLOSED"}]`,
        `Entry: ${formatUsd(position.entryPrice)}${position.quantity ? ` | Qty: ${formatUnits(position.quantity)}` : ""}`,
        `Harga sekarang: ${formatUsd(currentPrice)} | PnL: ${formatPct(pnlPercent)}${pnlAmount !== null ? ` (${formatUsd(pnlAmount, 2)})` : ""}`
    ];
    if (position.sl) lines.push(`SL: ${formatUsd(position.sl)}`);
    if (position.tp1) lines.push(`TP1: ${formatUsd(position.tp1)}`);
    if (position.tp2) lines.push(`TP2: ${formatUsd(position.tp2)}`);
    lines.push(`Dibuka: ${timeText(new Date(position.openedAt).getTime())}`);
    return lines.join("\n");
}

function aiStatusText(aiStatusSnapshot) {
    const lines = ["STATUS AI", `Urutan provider: ${config.ai.providerOrder.join(" -> ") || "(tidak ada)"}`];
    for (const p of aiStatusSnapshot) {
        lines.push(`- ${p.name}: ${p.configured ? (p.available ? "siap" : `cooldown sampai ${timeText(p.cooldownUntil)}`) : "API key belum diisi"}`);
    }
    lines.push(`Auto-chat pribadi: ${config.ai.autoChat ? "AKTIF" : "OFF"}`);
    lines.push(`Voice note: ${config.ai.voiceNotesEnabled ? "AKTIF" : "OFF"}`);
    lines.push(`Chart image: ${config.ai.chartImagesEnabled ? "AKTIF" : "OFF"}`);
    return lines.join("\n");
}

function menuText() {
    return `BOT CRYPTO PRO — MENU

== Harga & Analisa ==
harga
harga BTC
chart BTC
analisa BTC [trader|investor] [trend|meanreversion|breakout|momentum]
dashboard

== Watchlist ==
watchlist
watchlist add SOL
watchlist remove SOL

== Posisi (jurnal manual) ==
beli BTC sekarang
beli BTC 65000 0.01
posisi
posisi BTC
set sl BTC 62000
set tp BTC 70000
jual BTC sekarang
jurnal
risk BTC 1000 2

== Paper Trading (saldo virtual) ==
paper saldo
paper buy BTC 50%
paper buy BTC 0.01
paper sell BTC
paper posisi
paper riwayat
paper reset

== Backtest ==
backtest BTC 30d trader
backtest BTC 90d investor trend

== Berita & Laporan ==
berita
berita BTC
laporan

== AI ==
ai <pertanyaan>
ai deep BTC
ai status
ai reset
ai retry
(kirim voice note untuk tanya AI lewat suara)

== Pengaturan ==
mode trader
mode investor
alert on
alert off
status`;
}

module.exports = {
    marketPulseBar,
    signalEmoji,
    buildPriceMessage,
    buildAnalysisMessage,
    buildBacktestMessage,
    buildPositionSnapshot,
    positionPnl,
    aiStatusText,
    menuText
};

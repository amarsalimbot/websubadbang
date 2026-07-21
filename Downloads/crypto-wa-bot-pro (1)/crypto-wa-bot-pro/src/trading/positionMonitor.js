const config = require("../config");
const state = require("../state");
const { formatUsd, formatPct } = require("../utils");

function positionPnlPercent(position, currentPrice) {
    return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
}

/**
 * Cek seluruh user yang punya posisi journal terbuka untuk `asset`, lalu
 * kembalikan daftar notifikasi (TP/SL/trailing/sinyal melemah) yang perlu dikirim.
 */
function checkJournalPositions(asset, currentPrice, signal) {
    const notifications = [];
    for (const jid of state.getAllPositionHolders()) {
        const position = state.getOpenPosition(jid, asset);
        if (!position) continue;

        state.updatePosition(jid, asset, p => ({
            ...p,
            highestPrice: Math.max(p.highestPrice || p.entryPrice, currentPrice)
        }));
        const refreshed = state.getOpenPosition(jid, asset);
        const pnlPercent = positionPnlPercent(refreshed, currentPrice);

        let trailingStop = null;
        if (pnlPercent > config.monitor.trailingPercent * 2) {
            trailingStop = refreshed.highestPrice * (1 - config.monitor.trailingPercent / 100);
        }

        let action = null;
        let text = null;

        if (refreshed.sl && currentPrice <= refreshed.sl) {
            action = "SL";
            text = `STOP LOSS TERSENTUH — ${asset}\nHarga: ${formatUsd(currentPrice)} <= SL ${formatUsd(refreshed.sl)}\nPnL: ${formatPct(pnlPercent)}\nPertimbangkan tutup posisi atau evaluasi ulang.`;
        } else if (trailingStop && currentPrice <= trailingStop) {
            action = "TRAILING";
            text = `TRAILING PROTECTION — ${asset}\nHarga turun ke trailing stop ${formatUsd(trailingStop)} dari puncak ${formatUsd(refreshed.highestPrice)}.\nPnL saat ini: ${formatPct(pnlPercent)}\nPertimbangkan amankan profit.`;
        } else if (refreshed.tp2 && currentPrice >= refreshed.tp2) {
            action = "TP2";
            text = `TARGET 2 TERCAPAI — ${asset}\nHarga: ${formatUsd(currentPrice)} >= TP2 ${formatUsd(refreshed.tp2)}\nPnL: ${formatPct(pnlPercent)}\nPertimbangkan ambil profit penuh.`;
        } else if (refreshed.tp1 && currentPrice >= refreshed.tp1) {
            action = "TP1";
            text = `TARGET 1 TERCAPAI — ${asset}\nHarga: ${formatUsd(currentPrice)} >= TP1 ${formatUsd(refreshed.tp1)}\nPnL: ${formatPct(pnlPercent)}\nPertimbangkan ambil profit sebagian / pindahkan SL ke entry.`;
        } else if (signal && signal.action === "SELL" && refreshed.signalAtEntry !== "SELL") {
            action = "SIGNAL_FLIP";
            text = `SINYAL BERUBAH JADI SELL — ${asset}\nHarga: ${formatUsd(currentPrice)} | PnL: ${formatPct(pnlPercent)}\nIndikator kini mengarah ke jual, evaluasi posisi Anda.`;
        }

        if (action && state.canSendPositionAlert(jid, asset, action)) {
            state.markPositionAlertSent(jid, asset, action);
            notifications.push({ jid, asset, action, text });
        }
    }
    return notifications;
}

module.exports = { checkJournalPositions, positionPnlPercent };

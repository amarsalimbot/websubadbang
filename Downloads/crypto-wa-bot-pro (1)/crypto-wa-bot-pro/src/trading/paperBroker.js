const config = require("../config");
const state = require("../state");
const { formatUsd, formatPct, formatUnits, timeText } = require("../utils");

const FEE_PCT = config.paperTrading.feePercent / 100;

function computeUnrealizedPnl(position, currentPrice) {
    const diff = position.side === "long" ? currentPrice - position.entryPrice : position.entryPrice - currentPrice;
    const pnlAmount = diff * position.quantity;
    const pnlPercent = (diff / position.entryPrice) * 100 * (position.leverage || 1);
    return { pnlAmount, pnlPercent };
}

function recordEquity(account) {
    const openValue = account.positions.reduce((sum, p) => sum + p.entryPrice * p.quantity, 0);
    account.equityHistory.push({ at: Date.now(), equity: account.balance + openValue });
    if (account.equityHistory.length > 500) account.equityHistory = account.equityHistory.slice(-500);
}

/**
 * Buka posisi paper trading. `sizing` bisa berupa { percent } (persen dari balance)
 * atau { quantity } (jumlah koin langsung).
 */
function openPosition(jid, asset, entryPrice, sizing, levels = {}) {
    const account = state.getPaperAccount(jid);
    if (account.positions.find(p => p.asset === asset)) {
        return { error: `Sudah ada posisi paper terbuka untuk ${asset}. Tutup dulu dengan "paper sell ${asset}".` };
    }

    let notional;
    let quantity;
    if (sizing.quantity) {
        quantity = sizing.quantity;
        notional = quantity * entryPrice;
    } else {
        const percent = Math.min(100, Math.max(1, sizing.percent || 100));
        notional = account.balance * (percent / 100);
        quantity = notional / entryPrice;
    }

    const fee = notional * FEE_PCT;
    if (notional + fee > account.balance) {
        return { error: `Saldo tidak cukup. Saldo: ${formatUsd(account.balance, 2)}, butuh: ${formatUsd(notional + fee, 2)} (termasuk fee).` };
    }

    account.balance -= (notional + fee);
    const position = {
        asset,
        side: "long",
        entryPrice,
        quantity,
        sl: levels.sl || null,
        tp1: levels.tp1 || null,
        tp2: levels.tp2 || null,
        highestPrice: entryPrice,
        openedAt: new Date().toISOString(),
        feePaid: fee
    };
    account.positions.push(position);
    recordEquity(account);
    state.savePaperAccount(jid, account);
    return { position, account, feePaid: fee };
}

function closePosition(jid, asset, exitPrice, reason = "manual") {
    const account = state.getPaperAccount(jid);
    const idx = account.positions.findIndex(p => p.asset === asset);
    if (idx < 0) return { error: `Tidak ada posisi paper terbuka untuk ${asset}.` };

    const position = account.positions[idx];
    const notional = position.quantity * exitPrice;
    const fee = notional * FEE_PCT;
    const { pnlAmount, pnlPercent } = computeUnrealizedPnl(position, exitPrice);
    const netPnl = pnlAmount - fee - (position.feePaid || 0);

    account.balance += (notional - fee);
    account.positions.splice(idx, 1);
    account.trades.push({
        asset,
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        pnlAmount: netPnl,
        pnlPercent,
        reason,
        openedAt: position.openedAt,
        closedAt: new Date().toISOString()
    });
    if (account.trades.length > 200) account.trades = account.trades.slice(-200);
    recordEquity(account);
    state.savePaperAccount(jid, account);
    return { position, netPnl, pnlPercent, account };
}

function getPosition(jid, asset) {
    return state.getPaperAccount(jid).positions.find(p => p.asset === asset) || null;
}

function buildAccountMessage(jid, livePrices = {}) {
    const account = state.getPaperAccount(jid);
    const lines = [
        "PAPER TRADING (simulasi, bukan uang asli)",
        `Saldo cash: ${formatUsd(account.balance, 2)}`
    ];

    let totalUnrealized = 0;
    if (account.positions.length) {
        lines.push("", "Posisi terbuka:");
        for (const p of account.positions) {
            const price = livePrices[p.asset] || p.entryPrice;
            const { pnlAmount, pnlPercent } = computeUnrealizedPnl(p, price);
            totalUnrealized += pnlAmount;
            lines.push(
                `- ${p.asset}: qty ${formatUnits(p.quantity)} @ ${formatUsd(p.entryPrice)} | now ${formatUsd(price)} | PnL ${formatUsd(pnlAmount, 2)} (${formatPct(pnlPercent)})`
            );
        }
    } else {
        lines.push("", "Tidak ada posisi paper terbuka.");
    }

    const equity = account.balance + account.positions.reduce((sum, p) => {
        const price = livePrices[p.asset] || p.entryPrice;
        return sum + p.quantity * price;
    }, 0);
    const totalReturnPct = ((equity - account.startingBalance) / account.startingBalance) * 100;

    lines.push(
        "",
        `Total equity: ${formatUsd(equity, 2)}`,
        `Return sejak mulai: ${formatPct(totalReturnPct)} (modal awal ${formatUsd(account.startingBalance, 2)})`
    );
    return lines.join("\n");
}

function buildHistoryMessage(jid) {
    const account = state.getPaperAccount(jid);
    if (!account.trades.length) return "Belum ada riwayat trade paper trading.";
    const recent = account.trades.slice(-10).reverse();
    const lines = ["RIWAYAT PAPER TRADING (10 terakhir):"];
    for (const t of recent) {
        lines.push(`- ${t.asset}: ${formatUsd(t.entryPrice)} -> ${formatUsd(t.exitPrice)} | PnL ${formatUsd(t.pnlAmount, 2)} (${formatPct(t.pnlPercent)}) | ${timeText(new Date(t.closedAt).getTime())} [${t.reason}]`);
    }
    const wins = account.trades.filter(t => t.pnlAmount > 0).length;
    const winRate = (wins / account.trades.length) * 100;
    lines.push("", `Total trade: ${account.trades.length} | Win rate: ${winRate.toFixed(1)}%`);
    return lines.join("\n");
}

/** Dipanggil dari monitor: cek TP/SL/trailing untuk semua posisi paper sebuah aset. */
function checkPositionsForAsset(asset, currentPrice) {
    const triggers = [];
    for (const jid of state.getAllPaperHolders()) {
        const account = state.getPaperAccount(jid);
        const position = account.positions.find(p => p.asset === asset);
        if (!position) continue;

        if (currentPrice > position.highestPrice) position.highestPrice = currentPrice;
        let trailingStop = null;
        const gainFromEntry = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        if (gainFromEntry > config.monitor.trailingPercent * 2) {
            trailingStop = position.highestPrice * (1 - config.monitor.trailingPercent / 100);
        }

        let action = null;
        if (position.sl && currentPrice <= position.sl) action = "SL";
        else if (trailingStop && currentPrice <= trailingStop) action = "TRAILING";
        else if (position.tp2 && currentPrice >= position.tp2) action = "TP2";
        else if (position.tp1 && currentPrice >= position.tp1) action = "TP1";

        state.savePaperAccount(jid, account); // simpan update highestPrice

        if (action) {
            const result = closePosition(jid, asset, currentPrice, action);
            if (!result.error) triggers.push({ jid, asset, action, ...result });
        }
    }
    return triggers;
}

module.exports = {
    openPosition,
    closePosition,
    getPosition,
    buildAccountMessage,
    buildHistoryMessage,
    checkPositionsForAsset,
    computeUnrealizedPnl
};

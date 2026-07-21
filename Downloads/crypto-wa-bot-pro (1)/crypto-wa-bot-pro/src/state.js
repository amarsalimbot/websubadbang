const db = require("./db");
const config = require("./config");

const usersCol = db.collection("users", {});
const positionsCol = db.collection("positions", {});
const paperCol = db.collection("paper", {});
const aiHistoryCol = db.collection("ai_history", {});
const alertsCol = db.collection("alerts", { signal: {}, position: {} });
const backtestCol = db.collection("backtests", {});

// ---------- Users / profil per nomor WhatsApp ----------

function defaultUser() {
    return {
        active: true,
        mode: config.risk.defaultMode,
        strategy: null, // null = konsensus semua strategi
        riskPercent: config.risk.defaultRiskPercent,
        watchlist: config.defaultWatchlist.map(a => a.asset),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function getUser(jid) {
    return usersCol.get(jid) || defaultUser();
}

function updateUser(jid, patch) {
    return usersCol.update(jid, current => ({
        ...defaultUser(),
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
    }), defaultUser());
}

function getUserWatchlistAssets(jid) {
    const user = getUser(jid);
    const list = user.watchlist?.length ? user.watchlist : config.defaultWatchlist.map(a => a.asset);
    return config.assetCatalog.filter(a => list.includes(a.asset));
}

function addToWatchlist(jid, assetCode) {
    const user = getUser(jid);
    const set = new Set(user.watchlist || []);
    set.add(assetCode);
    return updateUser(jid, { watchlist: Array.from(set) });
}

function removeFromWatchlist(jid, assetCode) {
    const user = getUser(jid);
    const set = new Set(user.watchlist || []);
    set.delete(assetCode);
    return updateUser(jid, { watchlist: Array.from(set) });
}

function getAllActiveSubscribers() {
    return usersCol.entries().filter(([, u]) => u.active);
}

function getSubscribersForMode(mode) {
    return usersCol.entries().filter(([, u]) => u.active && u.mode === mode).map(([jid]) => jid);
}

// ---------- Position journal (manual, bukan saldo virtual) ----------

function getUserPositions(jid, activeOnly = true) {
    const list = positionsCol.get(jid, []);
    return activeOnly ? list.filter(p => p.status === "open") : list;
}

function getOpenPosition(jid, asset) {
    return getUserPositions(jid, true).find(p => p.asset === asset) || null;
}

function recordPosition(jid, position) {
    return positionsCol.update(jid, list => {
        const arr = list || [];
        arr.push(position);
        return arr;
    }, []);
}

function updatePosition(jid, asset, mutator) {
    return positionsCol.update(jid, list => {
        const arr = list || [];
        const idx = arr.findIndex(p => p.asset === asset && p.status === "open");
        if (idx >= 0) arr[idx] = mutator(arr[idx]) || arr[idx];
        return arr;
    }, []);
}

function closePosition(jid, asset, exitPrice, note = "") {
    let closed = null;
    positionsCol.update(jid, list => {
        const arr = list || [];
        const idx = arr.findIndex(p => p.asset === asset && p.status === "open");
        if (idx >= 0) {
            arr[idx] = {
                ...arr[idx],
                status: "closed",
                exitPrice,
                closedAt: new Date().toISOString(),
                note
            };
            closed = arr[idx];
        }
        return arr;
    }, []);
    return closed;
}

function getAllPositionHolders() {
    return positionsCol.keys();
}

// ---------- Paper trading (saldo virtual) ----------

function defaultPaperAccount() {
    return {
        balance: config.paperTrading.startingBalance,
        startingBalance: config.paperTrading.startingBalance,
        positions: [],
        trades: [],
        equityHistory: [{ at: Date.now(), equity: config.paperTrading.startingBalance }],
        createdAt: new Date().toISOString()
    };
}

function getPaperAccount(jid) {
    return paperCol.get(jid) || defaultPaperAccount();
}

function savePaperAccount(jid, account) {
    paperCol.set(jid, account);
    return account;
}

function resetPaperAccount(jid) {
    const fresh = defaultPaperAccount();
    paperCol.set(jid, fresh);
    return fresh;
}

function getAllPaperHolders() {
    return paperCol.keys();
}

// ---------- AI history per nomor ----------

function getAiHistory(jid) {
    const entry = aiHistoryCol.get(jid);
    if (!entry) return [];
    if (Date.now() - entry.updatedAt > config.ai.historyTtlMs) {
        aiHistoryCol.delete(jid);
        return [];
    }
    return entry.turns || [];
}

function rememberAiExchange(jid, question, answer) {
    const turns = getAiHistory(jid);
    turns.push({ question, answer, at: Date.now() });
    while (turns.length > config.ai.historyTurns) turns.shift();
    aiHistoryCol.set(jid, { turns, updatedAt: Date.now() });
}

function clearAiHistory(jid) {
    aiHistoryCol.delete(jid);
}

// ---------- Cooldown alert (sinyal watchlist & posisi) ----------

function canSendSignalAlert(asset, action) {
    const key = `${asset}-${action}`;
    const map = alertsCol.get("signal", {});
    const until = map[key] || 0;
    return Date.now() > until;
}

function markSignalAlertSent(asset, action) {
    alertsCol.update("signal", map => {
        map[asset + "-" + action] = Date.now() + config.monitor.signalCooldownMs;
        return map;
    }, {});
}

function canSendPositionAlert(jid, asset, action) {
    const key = `${jid}-${asset}-${action}`;
    const map = alertsCol.get("position", {});
    const until = map[key] || 0;
    return Date.now() > until;
}

function markPositionAlertSent(jid, asset, action) {
    alertsCol.update("position", map => {
        map[`${jid}-${asset}-${action}`] = Date.now() + config.monitor.positionAlertCooldownMs;
        return map;
    }, {});
}

// ---------- Backtest cache (untuk ditampilkan di dashboard web) ----------

function saveBacktestResult(jid, asset, mode, strategy, result) {
    backtestCol.update(jid, list => {
        const arr = list || [];
        arr.unshift({ asset, mode, strategy: strategy || "konsensus", result, at: Date.now() });
        return arr.slice(0, 20);
    }, []);
}

function getBacktestHistory(jid) {
    return backtestCol.get(jid, []);
}

module.exports = {
    getUser, updateUser, getUserWatchlistAssets, addToWatchlist, removeFromWatchlist,
    getAllActiveSubscribers, getSubscribersForMode,
    getUserPositions, getOpenPosition, recordPosition, updatePosition, closePosition, getAllPositionHolders,
    getPaperAccount, savePaperAccount, resetPaperAccount, getAllPaperHolders,
    getAiHistory, rememberAiExchange, clearAiHistory,
    canSendSignalAlert, markSignalAlertSent, canSendPositionAlert, markPositionAlertSent,
    saveBacktestResult, getBacktestHistory
};

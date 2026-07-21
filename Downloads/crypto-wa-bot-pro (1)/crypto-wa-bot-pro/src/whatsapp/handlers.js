const config = require("./../config");
const state = require("./../state");
const market = require("./../market");
const { normalizeAsset, findAssetByCode } = require("./../assets");
const { analyzeAsset, analyzeMany, calculateTradeLevels } = require("./../analysis");
const messages = require("./../messages");
const { runBacktest } = require("./../backtest");
const paperBroker = require("./../trading/paperBroker");
const riskEngine = require("./../trading/riskEngine");
const chart = require("./../ai/chart");
const news = require("./../news");
const aiChat = require("./../ai/chat");
const aiRouter = require("./../ai/router");
const { formatUsd, formatPct, parseNumber, nowText, pendekkanError } = require("./../utils");
const { listStrategies } = require("./../strategies");

function parseModeToken(text) {
    const lower = text.toLowerCase();
    if (/\binvestor\b/.test(lower)) return "investor";
    if (/\btrader\b/.test(lower)) return "trader";
    return null;
}

function parseStrategyToken(text) {
    const lower = text.toLowerCase();
    for (const key of listStrategies()) {
        if (lower.includes(key)) return key;
    }
    return null;
}

// ---------------- Harga & Analisa ----------------

async function handleHarga(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (asset) {
        const results = await analyzeMany([asset], state.getUser(from).mode, { force: config.market.forceRefreshOnRequest });
        return sock.sendMessage(from, { text: messages.buildPriceMessage(results) });
    }
    const assets = state.getUserWatchlistAssets(from);
    const results = await analyzeMany(assets, state.getUser(from).mode, { force: false });
    return sock.sendMessage(from, { text: messages.buildPriceMessage(results) });
}

async function handleAnalisa(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) {
        return sock.sendMessage(from, { text: "Sebutkan asetnya, contoh: analisa BTC trader" });
    }
    const mode = parseModeToken(pesan) || state.getUser(from).mode;
    const strategy = parseStrategyToken(pesan);
    try {
        const result = await analyzeAsset(asset, mode, { force: true, strategy });
        return sock.sendMessage(from, { text: messages.buildAnalysisMessage(result) });
    } catch (err) {
        return sock.sendMessage(from, { text: `Gagal analisa ${asset.asset}: ${pendekkanError(err.message)}` });
    }
}

async function handleChart(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Sebutkan asetnya, contoh: chart BTC" });
    if (!config.ai.chartImagesEnabled) return sock.sendMessage(from, { text: "Fitur chart image sedang dimatikan (AI_CHART_IMAGES_ENABLED=false)." });

    const mode = state.getUser(from).mode;
    try {
        const result = await analyzeAsset(asset, mode, { force: true });
        const image = await chart.renderPriceChart(asset.asset, result.candles, { timeframe: result.timeframe, mode });
        return sock.sendMessage(from, {
            image,
            caption: `${asset.asset} — ${formatUsd(result.ticker.price)} (${formatPct(result.ticker.changePct)})\nSinyal: ${result.consensus.action} (${result.consensus.confidence}%)`
        });
    } catch (err) {
        return sock.sendMessage(from, { text: `Gagal membuat chart ${asset.asset}: ${pendekkanError(err.message)}` });
    }
}

// ---------------- Watchlist ----------------

async function handleWatchlist(sock, from, pesan, lower) {
    const addMatch = lower.match(/^watchlist\s+add\s+(\w+)/i);
    const removeMatch = lower.match(/^watchlist\s+(remove|hapus)\s+(\w+)/i);

    if (addMatch) {
        const code = addMatch[1].toUpperCase();
        if (!findAssetByCode(code)) {
            return sock.sendMessage(from, { text: `${code} tidak ada di katalog aset. Aset yang didukung: ${config.assetCatalog.map(a => a.asset).join(", ")}` });
        }
        state.addToWatchlist(from, code);
        return sock.sendMessage(from, { text: `${code} ditambahkan ke watchlist Anda.` });
    }
    if (removeMatch) {
        const code = removeMatch[2].toUpperCase();
        state.removeFromWatchlist(from, code);
        return sock.sendMessage(from, { text: `${code} dihapus dari watchlist Anda.` });
    }

    const assets = state.getUserWatchlistAssets(from);
    return sock.sendMessage(from, {
        text: `WATCHLIST ANDA\n${assets.map(a => `- ${a.asset} (${a.name})`).join("\n")}\n\nKatalog lengkap: ${config.assetCatalog.map(a => a.asset).join(", ")}\nTambah: watchlist add SOL\nHapus: watchlist remove SOL`
    });
}

// ---------------- Posisi jurnal manual ----------------

async function handleBeli(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Sebutkan asetnya, contoh: beli BTC sekarang" });
    if (state.getOpenPosition(from, asset.asset)) {
        return sock.sendMessage(from, { text: `Anda sudah punya posisi terbuka untuk ${asset.asset}. Tutup dulu dengan "jual ${asset.asset} sekarang".` });
    }

    const mode = state.getUser(from).mode;
    const numbers = pesan.match(/[\d.,]+/g)?.map(parseNumber).filter(n => n !== null) || [];
    let entryPrice, quantity = null;

    const result = await analyzeAsset(asset, mode, { force: true });
    if (/sekarang/i.test(pesan) || !numbers.length) {
        entryPrice = result.ticker.price;
    } else {
        entryPrice = numbers[0];
        quantity = numbers[1] || null;
    }

    const levels = calculateTradeLevels(result, entryPrice);
    const position = {
        asset: asset.asset,
        status: "open",
        entryPrice,
        quantity,
        sl: levels.sl,
        tp1: levels.tp1,
        tp2: levels.tp2,
        highestPrice: entryPrice,
        mode,
        signalAtEntry: result.consensus.action,
        openedAt: new Date().toISOString()
    };
    state.recordPosition(from, position);

    return sock.sendMessage(from, {
        text: `POSISI DICATAT — ${asset.asset}\nEntry: ${formatUsd(entryPrice)}${quantity ? ` | Qty: ${quantity}` : ""}\nSL: ${formatUsd(levels.sl)} | TP1: ${formatUsd(levels.tp1)} | TP2: ${formatUsd(levels.tp2)}\nIni jurnal manual (tidak memengaruhi saldo paper trading). Gunakan "paper buy" untuk simulasi saldo.`
    });
}

async function handleJual(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Sebutkan asetnya, contoh: jual BTC sekarang" });
    const position = state.getOpenPosition(from, asset.asset);
    if (!position) return sock.sendMessage(from, { text: `Tidak ada posisi terbuka untuk ${asset.asset}.` });

    const ticker = await market.getTicker(asset, { force: true });
    const closed = state.closePosition(from, asset.asset, ticker.price, "manual");
    const pnlPercent = ((ticker.price - closed.entryPrice) / closed.entryPrice) * 100;
    return sock.sendMessage(from, {
        text: `POSISI DITUTUP — ${asset.asset}\nEntry: ${formatUsd(closed.entryPrice)} -> Exit: ${formatUsd(ticker.price)}\nPnL: ${formatPct(pnlPercent)}`
    });
}

async function handleSetLevel(sock, from, pesan, lower) {
    const match = lower.match(/^set\s+(sl|tp1|tp2|tp)\s+(\w+)\s+([\d.,]+)/i);
    if (!match) return sock.sendMessage(from, { text: "Format: set sl BTC 62000 / set tp1 BTC 70000 / set tp2 BTC 75000" });
    const level = match[1] === "tp" ? "tp1" : match[1];
    const code = match[2].toUpperCase();
    const value = parseNumber(match[3]);
    const position = state.getOpenPosition(from, code);
    if (!position) return sock.sendMessage(from, { text: `Tidak ada posisi terbuka untuk ${code}.` });
    state.updatePosition(from, code, p => ({ ...p, [level]: value }));
    return sock.sendMessage(from, { text: `${level.toUpperCase()} untuk ${code} diatur ke ${formatUsd(value)}.` });
}

async function handlePosisi(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    const positions = state.getUserPositions(from, true).filter(p => !asset || p.asset === asset.asset);
    if (!positions.length) return sock.sendMessage(from, { text: "Tidak ada posisi terbuka." });

    const lines = [];
    for (const p of positions) {
        try {
            const a = findAssetByCode(p.asset);
            const ticker = await market.getTicker(a, { force: false });
            lines.push(messages.buildPositionSnapshot(p, ticker.price));
        } catch (err) {
            lines.push(`${p.asset}: gagal ambil harga (${pendekkanError(err.message)})`);
        }
    }
    return sock.sendMessage(from, { text: lines.join("\n\n") });
}

async function handleJurnal(sock, from) {
    const closed = state.getUserPositions(from, false).filter(p => p.status === "closed").slice(-10).reverse();
    if (!closed.length) return sock.sendMessage(from, { text: "Belum ada riwayat posisi yang ditutup." });
    const lines = closed.map(p => {
        const pnlPercent = ((p.exitPrice - p.entryPrice) / p.entryPrice) * 100;
        return `${p.asset}: ${formatUsd(p.entryPrice)} -> ${formatUsd(p.exitPrice)} | PnL ${formatPct(pnlPercent)} [${p.note || "manual"}]`;
    });
    return sock.sendMessage(from, { text: `JURNAL POSISI (10 terakhir)\n${lines.join("\n")}` });
}

async function handleRisk(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Format: risk BTC 1000 2  (modal 1000 USDT, risiko 2%)" });
    const numbers = pesan.match(/[\d.,]+/g)?.map(parseNumber).filter(n => n !== null) || [];
    const capital = numbers[0] || 1000;
    const riskPercent = numbers[1] || state.getUser(from).riskPercent;
    const mode = state.getUser(from).mode;
    try {
        const result = await analyzeAsset(asset, mode, { force: true });
        const levels = calculateTradeLevels(result);
        return sock.sendMessage(from, { text: riskEngine.buildRiskMessage(asset.asset, result, capital, riskPercent, levels) });
    } catch (err) {
        return sock.sendMessage(from, { text: `Gagal hitung risk ${asset.asset}: ${pendekkanError(err.message)}` });
    }
}

// ---------------- Paper trading ----------------

async function handlePaper(sock, from, pesan, lower) {
    if (/^paper\s+saldo$/i.test(lower) || /^paper$/i.test(lower)) {
        const live = await collectLivePrices(from);
        return sock.sendMessage(from, { text: paperBroker.buildAccountMessage(from, live) });
    }
    if (/^paper\s+posisi$/i.test(lower)) {
        const live = await collectLivePrices(from);
        return sock.sendMessage(from, { text: paperBroker.buildAccountMessage(from, live) });
    }
    if (/^paper\s+riwayat$/i.test(lower)) {
        return sock.sendMessage(from, { text: paperBroker.buildHistoryMessage(from) });
    }
    if (/^paper\s+reset$/i.test(lower)) {
        state.resetPaperAccount(from);
        return sock.sendMessage(from, { text: "Akun paper trading direset ke saldo awal." });
    }

    const buyMatch = lower.match(/^paper\s+buy\s+(\w+)\s+([\d.,]+%?)/i);
    if (buyMatch) {
        const code = buyMatch[1].toUpperCase();
        const asset = findAssetByCode(code);
        if (!asset) return sock.sendMessage(from, { text: `${code} tidak dikenal.` });
        const mode = state.getUser(from).mode;
        const result = await analyzeAsset(asset, mode, { force: true });
        const levels = calculateTradeLevels(result);
        const sizingToken = buyMatch[2];
        const sizing = sizingToken.includes("%")
            ? { percent: parseNumber(sizingToken.replace("%", "")) }
            : { quantity: parseNumber(sizingToken) };
        const opened = paperBroker.openPosition(from, code, result.ticker.price, sizing, levels);
        if (opened.error) return sock.sendMessage(from, { text: opened.error });
        return sock.sendMessage(from, {
            text: `PAPER BUY — ${code}\nEntry: ${formatUsd(opened.position.entryPrice)} | Qty: ${opened.position.quantity.toFixed(6)}\nSL: ${formatUsd(opened.position.sl)} | TP1: ${formatUsd(opened.position.tp1)} | TP2: ${formatUsd(opened.position.tp2)}\nSisa saldo: ${formatUsd(opened.account.balance, 2)}`
        });
    }

    const sellMatch = lower.match(/^paper\s+sell\s+(\w+)/i);
    if (sellMatch) {
        const code = sellMatch[1].toUpperCase();
        const asset = findAssetByCode(code);
        if (!asset) return sock.sendMessage(from, { text: `${code} tidak dikenal.` });
        const ticker = await market.getTicker(asset, { force: true });
        const closed = paperBroker.closePosition(from, code, ticker.price, "manual");
        if (closed.error) return sock.sendMessage(from, { text: closed.error });
        return sock.sendMessage(from, {
            text: `PAPER SELL — ${code}\nEntry: ${formatUsd(closed.position.entryPrice)} -> Exit: ${formatUsd(ticker.price)}\nPnL: ${formatUsd(closed.netPnl, 2)} (${formatPct(closed.pnlPercent)})\nSaldo sekarang: ${formatUsd(closed.account.balance, 2)}`
        });
    }

    return sock.sendMessage(from, {
        text: "Perintah paper trading: paper saldo | paper buy BTC 50% | paper buy BTC 0.01 | paper sell BTC | paper posisi | paper riwayat | paper reset"
    });
}

async function collectLivePrices(jid) {
    const account = state.getPaperAccount(jid);
    const prices = {};
    for (const position of account.positions) {
        const asset = findAssetByCode(position.asset);
        if (!asset) continue;
        try {
            const ticker = await market.getTicker(asset, { force: false });
            prices[position.asset] = ticker.price;
        } catch (_) { /* pakai entry price sebagai fallback di buildAccountMessage */ }
    }
    return prices;
}

// ---------------- Backtest ----------------

async function handleBacktest(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Format: backtest BTC 30d trader [strategi]" });

    const daysMatch = pesan.match(/(\d+)\s*d(?:ay|ays|hari)?/i);
    const days = Math.min(180, Math.max(3, daysMatch ? Number(daysMatch[1]) : config.backtest.defaultDays));
    const mode = parseModeToken(pesan) || state.getUser(from).mode;
    const strategy = parseStrategyToken(pesan);

    await sock.sendMessage(from, { text: `Menjalankan backtest ${asset.asset} (${days} hari, mode ${mode}${strategy ? `, strategi ${strategy}` : ""})... ini bisa beberapa detik.` });
    try {
        const result = await runBacktest(asset, mode, days, strategy);
        state.saveBacktestResult(from, asset.asset, mode, strategy, result);
        return sock.sendMessage(from, { text: messages.buildBacktestMessage(result) });
    } catch (err) {
        return sock.sendMessage(from, { text: `Backtest gagal: ${pendekkanError(err.message)}` });
    }
}

// ---------------- Berita & Laporan ----------------

async function handleBerita(sock, from, pesan) {
    const text = await news.summarizeNews(pesan.replace(/^berita\s*/i, ""));
    return sock.sendMessage(from, { text });
}

// ---------------- Pengaturan & status ----------------

async function handleMode(sock, from, lower) {
    const mode = lower.includes("investor") ? "investor" : "trader";
    state.updateUser(from, { mode, active: true });
    return sock.sendMessage(from, { text: `Mode diubah ke ${mode.toUpperCase()}. Alert otomatis juga aktif untuk nomor ini.` });
}

async function handleAlert(sock, from, lower) {
    const on = /\bon\b/i.test(lower);
    state.updateUser(from, { active: on });
    return sock.sendMessage(from, { text: on ? `Alert otomatis aktif. Mode: ${state.getUser(from).mode.toUpperCase()}.` : "Alert otomatis dimatikan untuk nomor ini." });
}

async function handleRefresh(sock, from) {
    market.clearAllCache();
    return sock.sendMessage(from, { text: "Cache market sudah dikosongkan. Data harga berikutnya akan diambil ulang dari provider realtime." });
}

async function handleStatus(sock, from, waState) {
    const user = state.getUser(from);
    const openPositions = state.getUserPositions(from, true).length;
    const marketStatus = market.statusSnapshot();
    return sock.sendMessage(from, {
        text: `STATUS BOT
Koneksi WhatsApp: ${waState.connection}
Alert nomor ini: ${user.active ? "AKTIF" : "OFF"}
Mode: ${user.mode.toUpperCase()}
Posisi terbuka (jurnal): ${openPositions}
Provider market: ${marketStatus.provider}
Reconnect terjadi: ${waState.reconnectCount}
Waktu server: ${nowText()}`
    });
}

async function handleDashboard(sock, from) {
    if (!config.web.enabled) return sock.sendMessage(from, { text: "Dashboard web sedang dimatikan (WEB_DASHBOARD_ENABLED=false)." });
    const url = `http://<host-deploy-anda>:${config.port}/`;
    return sock.sendMessage(from, {
        text: `DASHBOARD WEB\nBuka di browser: ${url}\n(host akan berbeda sesuai tempat Anda deploy, mis. Railway/VPS — gunakan domain publiknya, port ${config.port})${config.web.token ? "\nDashboard ini butuh token akses, lihat DASHBOARD_TOKEN di env." : ""}`
    });
}

// ---------------- AI ----------------

async function handleAiStatus(sock, from) {
    return sock.sendMessage(from, { text: messages.aiStatusText(aiRouter.statusSnapshot()) });
}

async function handleAiReset(sock, from) {
    state.clearAiHistory(from);
    return sock.sendMessage(from, { text: "Memori percakapan AI untuk chat ini sudah dihapus." });
}

async function handleAiRetry(sock, from) {
    aiRouter.resetCooldowns();
    return sock.sendMessage(from, { text: "Cooldown semua provider AI sudah dihapus." });
}

async function handleAiDeep(sock, from, pesan) {
    const asset = normalizeAsset(pesan);
    if (!asset) return sock.sendMessage(from, { text: "Format: ai deep BTC" });
    const mode = parseModeToken(pesan) || state.getUser(from).mode;
    if (typeof sock.sendPresenceUpdate === "function") await sock.sendPresenceUpdate("composing", from).catch(() => {});
    try {
        const text = await aiChat.answerDeepAnalysis(from, asset, mode);
        return sock.sendMessage(from, { text });
    } catch (err) {
        return sock.sendMessage(from, { text: `Deep analysis gagal: ${pendekkanError(err.message)}` });
    } finally {
        if (typeof sock.sendPresenceUpdate === "function") await sock.sendPresenceUpdate("paused", from).catch(() => {});
    }
}

async function sendAiAnswer(sock, from, question) {
    if (typeof sock.sendPresenceUpdate === "function") await sock.sendPresenceUpdate("composing", from).catch(() => {});
    try {
        const text = await aiChat.answerChat(from, question);
        return sock.sendMessage(from, { text });
    } catch (err) {
        return sock.sendMessage(from, { text: `AI gagal menjawab: ${pendekkanError(err.message)}` });
    } finally {
        if (typeof sock.sendPresenceUpdate === "function") await sock.sendPresenceUpdate("paused", from).catch(() => {});
    }
}

module.exports = {
    handleHarga, handleAnalisa, handleChart,
    handleWatchlist,
    handleBeli, handleJual, handleSetLevel, handlePosisi, handleJurnal, handleRisk,
    handlePaper,
    handleBacktest,
    handleBerita,
    handleMode, handleAlert, handleRefresh, handleStatus, handleDashboard,
    handleAiStatus, handleAiReset, handleAiRetry, handleAiDeep, sendAiAnswer
};

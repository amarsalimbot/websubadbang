const { normalizeAsset } = require("./../assets");
const { analyzeAsset, calculateTradeLevels } = require("./../analysis");
const state = require("./../state");
const market = require("./../market");
const news = require("./../news");
const config = require("./../config");
const { timeText, pendekkanError, formatUsd, formatPct } = require("./../utils");

function formatPositionsContext(jid) {
    const positions = state.getUserPositions(jid, false);
    if (!positions.length) return "";
    return `POSISI PENGGUNA YANG DIPANTAU\n${positions.map(p =>
        `${p.asset} [${p.status}]: entry ${p.entryPrice}, SL ${p.sl || "-"}, TP1 ${p.tp1 || "-"}, TP2 ${p.tp2 || "-"}`
    ).join("\n")}`;
}

function formatAssetContext(result) {
    const { asset, name, ticker, mode, consensus, ind } = result;
    const levels = calculateTradeLevels(result);
    return `DATA MARKET REALTIME ${asset} (${name})
Mode: ${mode}
Harga: ${formatUsd(ticker.price)} | Perubahan 24 jam: ${formatPct(ticker.changePct)}
High/Low 24 jam: ${formatUsd(ticker.high24h)} / ${formatUsd(ticker.low24h)}
Sumber: ${ticker.source}${ticker.stale ? " (cache)" : ""}
Waktu data: ${timeText(ticker.at)}
Sinyal sistem (konsensus multi-strategi): ${consensus.action}, keyakinan ${consensus.confidence}%
Strategi yang setuju: ${consensus.agreeing.map(a => a.name).join(", ") || "tidak ada yang dominan"}
RSI14: ${ind.rsi14 ? ind.rsi14.toFixed(1) : "-"}
Support/Resistance: ${formatUsd(ind.sr.support)} / ${formatUsd(ind.sr.resistance)}
Volatilitas: ${ind.volatilityPct.toFixed(2)}%
Alasan utama: ${consensus.reasons.slice(0, 5).join("; ") || "tidak ada sinyal dominan"}
Rencana jika entry: harga ${formatUsd(levels.entryPrice)}, SL ${formatUsd(levels.sl)}, TP1 ${formatUsd(levels.tp1)}, TP2 ${formatUsd(levels.tp2)}`;
}

async function buildMarketContext(question, mode, jid = "") {
    const parts = [];
    const asset = normalizeAsset(question);
    const lower = String(question || "").toLowerCase();
    const hasCryptoSubject = Boolean(asset) || /\b(crypto|kripto|coin|koin|altcoin|bitcoin|ethereum|bnb|binance|paxg|xaut|usdt|market|pasar)\b/i.test(lower);
    const asksMarket = hasCryptoSubject && /\b(harga|sekarang|hari ini|terbaru|market|pasar|trading|trader|entry|sell|jual|buy|beli|dibeli|sinyal|analisa|analisis|risiko|portofolio|backtest|paper)\b/i.test(lower);
    const asksNews = hasCryptoSubject && /\b(berita|news|kabar|fundamental|sentimen|isu|update|terbaru|hari ini)\b/i.test(lower);

    if (asset && asksMarket) {
        try {
            parts.push(formatAssetContext(await analyzeAsset(asset, mode, { force: config.market.forceRefreshOnRequest })));
        } catch (err) {
            parts.push(`Data market ${asset.asset} gagal diambil: ${pendekkanError(err.message)}`);
        }
    } else if (asksMarket) {
        try {
            const assets = jid ? state.getUserWatchlistAssets(jid) : config.defaultWatchlist;
            const lines = [];
            for (const a of assets) {
                try {
                    const t = await market.getTicker(a, { force: false });
                    lines.push(`${a.asset}: ${t.price} USDT (${t.changePct}% 24j), sumber ${t.source}`);
                } catch (_) { /* lewati aset yang gagal */ }
            }
            if (lines.length) parts.push(`RINGKASAN WATCHLIST REALTIME\n${lines.join("\n")}`);
        } catch (err) {
            parts.push(`Ringkasan harga gagal diambil: ${pendekkanError(err.message)}`);
        }
    }

    if (asksNews) {
        try {
            const items = (await news.getCryptoNews()).slice(0, 5);
            if (items.length) parts.push(`BERITA TERBARU DARI RSS\n${items.map((item, i) => `${i + 1}. ${item.title} (${item.source})`).join("\n")}`);
        } catch (err) {
            parts.push(`Berita terbaru gagal diambil: ${pendekkanError(err.message)}`);
        }
    }

    const positionContext = jid ? formatPositionsContext(jid) : "";
    if (positionContext && /\b(posisi|entry|beli|dibeli|jual|sell|tp|take profit|sl|stop loss|risiko|portofolio)\b/i.test(lower)) {
        parts.push(positionContext);
    }

    return parts.join("\n\n");
}

module.exports = { buildMarketContext, formatAssetContext };

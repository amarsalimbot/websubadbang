const market = require("./market");
const { computeIndicatorSet } = require("./indicators");
const { evaluateConsensus } = require("./strategies");
const config = require("./config");

function candleMinutesForMode(mode) {
    return mode === "investor" ? config.autoReport.investorCandleMinutes : config.autoReport.traderCandleMinutes;
}

function timeframeLabel(mode) {
    return mode === "investor" ? "1H" : "15M";
}

function intervalForMode(mode) {
    return mode === "investor" ? "1h" : "15m";
}

/**
 * Analisa lengkap satu aset: ambil ticker + candle utama + candle konfirmasi
 * timeframe lebih besar, hitung indikator, lalu jalankan strategy engine.
 */
async function analyzeAsset(asset, mode = config.risk.defaultMode, options = {}) {
    const ticker = await market.getTicker(asset, { force: options.force });
    const mainInterval = intervalForMode(mode);
    const confirmInterval = mode === "investor" ? "1d" : "1h";

    let mainCandles = await market.getKlines(asset, mainInterval, 150, { force: options.force });
    mainCandles = market.mergeLiveIntoCandles(mainCandles, ticker);

    let confirmCandles = null;
    try {
        confirmCandles = await market.getKlines(asset, confirmInterval, 100, { force: options.force });
        confirmCandles = market.mergeLiveIntoCandles(confirmCandles, ticker);
    } catch (_) {
        confirmCandles = null;
    }

    const ind = computeIndicatorSet(mainCandles);
    const confirmInd = confirmCandles ? computeIndicatorSet(confirmCandles) : null;

    const consensus = evaluateConsensus(ind, mode, options.strategy || null);

    // Konfirmasi multi-timeframe: kalau timeframe besar berlawanan arah, turunkan confidence.
    if (confirmInd) {
        const confirmConsensus = evaluateConsensus(confirmInd, mode === "investor" ? "investor" : "trader");
        const sameDirection = Math.sign(confirmConsensus.score) === Math.sign(consensus.score) || consensus.score === 0;
        if (!sameDirection && Math.abs(confirmConsensus.score) > 0.15) {
            consensus.confidence = Math.max(0, Math.round(consensus.confidence * 0.6));
            consensus.reasons.push(`Timeframe lebih besar (${confirmInterval}) berlawanan arah, sinyal didiskon`);
        } else if (sameDirection && Math.abs(confirmConsensus.score) > 0.15) {
            consensus.confidence = Math.min(100, Math.round(consensus.confidence * 1.1));
            consensus.reasons.push(`Searah dengan timeframe ${confirmInterval}`);
        }
    }

    return {
        asset: asset.asset,
        name: asset.name,
        symbol: asset.symbol,
        mode,
        timeframe: timeframeLabel(mode),
        ticker,
        candles: mainCandles,
        ind,
        confirmInd,
        consensus,
        at: Date.now()
    };
}

async function analyzeMany(assets, mode, options = {}) {
    const results = [];
    for (const asset of assets) {
        try {
            results.push(await analyzeAsset(asset, mode, options));
        } catch (err) {
            results.push({ asset: asset.asset, error: err.message || String(err) });
        }
    }
    return results;
}

/** Hitung level TP/SL berbasis ATR dan support/resistance. */
function calculateTradeLevels(result, entryPriceOverride = null) {
    const price = result.ticker.price;
    const entryPrice = entryPriceOverride || price;
    const atrValue = result.ind.atr14 || price * 0.01;
    const long = result.consensus.score >= 0;

    let sl, tp1, tp2;
    if (long) {
        sl = Math.min(entryPrice - atrValue * 1.5, result.ind.sr.support * 0.998);
        tp1 = entryPrice + atrValue * 1.5;
        tp2 = entryPrice + atrValue * 3;
    } else {
        sl = Math.max(entryPrice + atrValue * 1.5, result.ind.sr.resistance * 1.002);
        tp1 = entryPrice - atrValue * 1.5;
        tp2 = entryPrice - atrValue * 3;
    }

    return { entryPrice, sl, tp1, tp2, long, atr: atrValue };
}

module.exports = {
    analyzeAsset,
    analyzeMany,
    calculateTradeLevels,
    candleMinutesForMode,
    timeframeLabel,
    intervalForMode
};

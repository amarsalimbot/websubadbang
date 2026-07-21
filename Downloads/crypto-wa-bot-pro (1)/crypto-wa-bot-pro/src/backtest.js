const config = require("./config");
const market = require("./market");
const { computeIndicatorSet } = require("./indicators");
const { evaluateConsensus } = require("./strategies");
const { calculatePositionSize } = require("./trading/riskEngine");
const { intervalForMode } = require("./analysis");

const WINDOW = 150;
const WARMUP = 60;

/**
 * Jalankan simulasi walk-forward: di setiap candle, hitung indikator dari jendela
 * candle sebelumnya saja (tidak mengintip masa depan), lalu jalankan strategy engine.
 * Posisi dibuka saat ENTRY (jika belum ada posisi), ditutup saat SL/TP/sinyal SELL.
 */
function simulate(candles, mode, strategy, options = {}) {
    const startingCapital = options.startingCapital || 1000;
    const riskPercent = options.riskPercent || config.risk.defaultRiskPercent;

    let equity = startingCapital;
    let peakEquity = startingCapital;
    let maxDrawdownPct = 0;
    const equityCurve = [{ time: candles[WARMUP]?.time || 0, equity }];
    const trades = [];
    let openTrade = null;

    for (let i = WARMUP; i < candles.length; i++) {
        const windowStart = Math.max(0, i - WINDOW + 1);
        const windowCandles = candles.slice(windowStart, i + 1);
        const ind = computeIndicatorSet(windowCandles);
        const consensus = evaluateConsensus(ind, mode, strategy);
        const bar = candles[i];
        const price = bar.close;

        if (openTrade) {
            let exitPrice = null;
            let reason = null;
            if (bar.low <= openTrade.sl) { exitPrice = openTrade.sl; reason = "SL"; }
            else if (bar.high >= openTrade.tp2) { exitPrice = openTrade.tp2; reason = "TP2"; }
            else if (bar.high >= openTrade.tp1 && !openTrade.tp1Hit) { openTrade.tp1Hit = true; }
            if (!exitPrice && consensus.action === "SELL") { exitPrice = price; reason = "SIGNAL_FLIP"; }

            if (exitPrice) {
                const pnlAmount = (exitPrice - openTrade.entryPrice) * openTrade.quantity;
                equity += pnlAmount;
                const rMultiple = openTrade.riskAmount ? pnlAmount / openTrade.riskAmount : 0;
                trades.push({
                    entryTime: openTrade.time, exitTime: bar.time,
                    entryPrice: openTrade.entryPrice, exitPrice,
                    pnlAmount, pnlPercent: (pnlAmount / (openTrade.entryPrice * openTrade.quantity)) * 100,
                    rMultiple, reason
                });
                openTrade = null;
            }
        } else if (consensus.action === "ENTRY") {
            const atrValue = ind.atr14 || price * 0.01;
            const sl = price - atrValue * 1.5;
            const tp1 = price + atrValue * 1.5;
            const tp2 = price + atrValue * 3;
            const sizing = calculatePositionSize({ capital: equity, riskPercent, entryPrice: price, slPrice: sl });
            if (sizing.quantity > 0) {
                openTrade = { time: bar.time, entryPrice: price, quantity: sizing.quantity, sl, tp1, tp2, riskAmount: sizing.riskAmount };
            }
        }

        peakEquity = Math.max(peakEquity, equity);
        const drawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
        equityCurve.push({ time: bar.time, equity });
    }

    // Tutup posisi yang masih terbuka di akhir periode pada harga terakhir (mark-to-market).
    if (openTrade) {
        const lastPrice = candles[candles.length - 1].close;
        const pnlAmount = (lastPrice - openTrade.entryPrice) * openTrade.quantity;
        equity += pnlAmount;
        trades.push({
            entryTime: openTrade.time, exitTime: candles[candles.length - 1].time,
            entryPrice: openTrade.entryPrice, exitPrice: lastPrice,
            pnlAmount, pnlPercent: (pnlAmount / (openTrade.entryPrice * openTrade.quantity)) * 100,
            rMultiple: openTrade.riskAmount ? pnlAmount / openTrade.riskAmount : 0, reason: "END_OF_PERIOD"
        });
    }

    const wins = trades.filter(t => t.pnlAmount > 0);
    const losses = trades.filter(t => t.pnlAmount <= 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnlAmount, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlAmount, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const totalReturnPct = ((equity - startingCapital) / startingCapital) * 100;
    const avgR = trades.length ? trades.reduce((s, t) => s + (t.rMultiple || 0), 0) / trades.length : 0;

    return {
        startingCapital,
        finalEquity: equity,
        totalReturnPct,
        maxDrawdownPct,
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
        profitFactor,
        avgR,
        trades: trades.slice(-30),
        equityCurve
    };
}

/** Ambil candle historis sebanyak mungkin sesuai jumlah hari yang diminta, lalu jalankan simulasi. */
async function runBacktest(asset, mode, days, strategy = null, options = {}) {
    const interval = intervalForMode(mode);
    const intervalMs = market.intervalToMs(interval);
    const wantedCandles = Math.ceil((days * 86_400_000) / intervalMs) + WARMUP + 5;
    const limit = Math.min(config.backtest.maxCandles, wantedCandles);

    const candles = await market.getKlines(asset, interval, limit, { force: true });
    if (candles.length < WARMUP + 10) {
        throw new Error("Data candle historis tidak cukup untuk backtest ini.");
    }

    const result = simulate(candles, mode, strategy, options);
    const actualDays = ((candles[candles.length - 1].time - candles[0].time) / 86_400_000).toFixed(1);
    return { ...result, asset: asset.asset, mode, strategy: strategy || "konsensus", interval, actualDays, candleCount: candles.length };
}

module.exports = { runBacktest, simulate };

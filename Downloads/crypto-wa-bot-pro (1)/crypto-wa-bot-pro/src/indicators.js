function sma(values, length) {
    if (values.length < length) return null;
    const slice = values.slice(-length);
    return slice.reduce((a, b) => a + b, 0) / length;
}

function emaSeries(values, length) {
    if (values.length < length) return [];
    const k = 2 / (length + 1);
    const out = [];
    let prev = values.slice(0, length).reduce((a, b) => a + b, 0) / length;
    out[length - 1] = prev;
    for (let i = length; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

function ema(values, length) {
    const series = emaSeries(values, length);
    return series.length ? series[series.length - 1] : null;
}

function rsi(values, length = 14) {
    if (values.length < length + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = values.length - length; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / length;
    const avgLoss = losses / length;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function macd(values, fast = 12, slow = 26, signalLength = 9) {
    if (values.length < slow + signalLength) return null;
    const fastSeries = emaSeries(values, fast);
    const slowSeries = emaSeries(values, slow);
    const macdLine = [];
    for (let i = 0; i < values.length; i++) {
        if (fastSeries[i] !== undefined && slowSeries[i] !== undefined) {
            macdLine[i] = fastSeries[i] - slowSeries[i];
        }
    }
    const compact = macdLine.filter(v => v !== undefined);
    const signalSeries = emaSeries(compact, signalLength);
    const histogram = compact[compact.length - 1] - signalSeries[signalSeries.length - 1];
    return {
        macd: compact[compact.length - 1],
        signal: signalSeries[signalSeries.length - 1],
        histogram,
        prevHistogram: compact.length > 1 && signalSeries.length > 1
            ? compact[compact.length - 2] - signalSeries[signalSeries.length - 2]
            : null
    };
}

function bollingerBands(values, length = 20, mult = 2) {
    if (values.length < length) return null;
    const middle = sma(values, length);
    const slice = values.slice(-length);
    const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / length;
    const sd = Math.sqrt(variance);
    return { middle, upper: middle + mult * sd, lower: middle - mult * sd, width: (mult * sd * 2) / middle };
}

function atr(candles, length = 14) {
    if (candles.length < length + 1) return null;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const prevClose = candles[i - 1].close;
        trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    }
    return sma(trs, length);
}

function supportResistance(candles, lookback = 50) {
    const slice = candles.slice(-lookback);
    const support = Math.min(...slice.map(c => c.low));
    const resistance = Math.max(...slice.map(c => c.high));
    return { support, resistance };
}

function volatility(candles, lookback = 20) {
    const closes = candles.slice(-lookback).map(c => c.close);
    if (closes.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance) * 100;
}

function stochastic(candles, length = 14, smooth = 3) {
    if (candles.length < length + smooth) return null;
    const ks = [];
    for (let i = length - 1; i < candles.length; i++) {
        const slice = candles.slice(i - length + 1, i + 1);
        const high = Math.max(...slice.map(c => c.high));
        const low = Math.min(...slice.map(c => c.low));
        const close = candles[i].close;
        ks.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
    }
    const k = ks[ks.length - 1];
    const d = sma(ks, smooth);
    return { k, d };
}

function highestHigh(candles, lookback) {
    return Math.max(...candles.slice(-lookback).map(c => c.high));
}

function lowestLow(candles, lookback) {
    return Math.min(...candles.slice(-lookback).map(c => c.low));
}

function averageVolume(candles, lookback) {
    const slice = candles.slice(-lookback);
    return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
}

/** Hitung seluruh indikator sekaligus untuk satu seri candle. */
function computeIndicatorSet(candles) {
    const closes = candles.map(c => c.close);
    return {
        closes,
        last: candles[candles.length - 1],
        ema9: ema(closes, 9),
        ema21: ema(closes, 21),
        ema50: ema(closes, 50),
        ema200: ema(closes.length >= 200 ? closes : closes, Math.min(200, closes.length - 1 || 1)),
        rsi14: rsi(closes, 14),
        macd: macd(closes),
        bollinger: bollingerBands(closes, 20),
        atr14: atr(candles, 14),
        stoch: stochastic(candles, 14, 3),
        sr: supportResistance(candles, 50),
        volatilityPct: volatility(candles, 20),
        avgVolume20: averageVolume(candles, 20),
        highestHigh20: highestHigh(candles, 20),
        lowestLow20: lowestLow(candles, 20)
    };
}

module.exports = {
    sma, ema, emaSeries, rsi, macd, bollingerBands, atr, stochastic,
    supportResistance, volatility, highestHigh, lowestLow, averageVolume,
    computeIndicatorSet
};

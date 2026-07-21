/**
 * Setiap strategi menerima { ind, mode } (ind = hasil computeIndicatorSet)
 * dan mengeluarkan { direction: -1..1, confidence: 0..100, reasons: string[] }.
 * direction positif = bias naik/entry, negatif = bias turun/jual, 0 = netral.
 * signalEngine menggabungkan semua strategi memakai bobot per mode menjadi
 * satu sinyal akhir ENTRY/SELL/WAIT plus daftar strategi yang setuju.
 */

function trendFollowing({ ind }) {
    const reasons = [];
    let direction = 0;
    let confidence = 0;

    if (ind.ema9 && ind.ema21 && ind.ema50) {
        if (ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
            direction += 0.5; confidence += 35; reasons.push("EMA9>EMA21>EMA50 (tren naik)");
        } else if (ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50) {
            direction -= 0.5; confidence += 35; reasons.push("EMA9<EMA21<EMA50 (tren turun)");
        }
    }

    if (ind.macd) {
        if (ind.macd.histogram > 0 && (ind.macd.prevHistogram === null || ind.macd.histogram > ind.macd.prevHistogram)) {
            direction += 0.3; confidence += 25; reasons.push("MACD histogram menguat positif");
        } else if (ind.macd.histogram < 0 && (ind.macd.prevHistogram === null || ind.macd.histogram < ind.macd.prevHistogram)) {
            direction -= 0.3; confidence += 25; reasons.push("MACD histogram melemah negatif");
        }
    }

    if (ind.rsi14 !== null) {
        if (ind.rsi14 > 80) { direction -= 0.2; confidence += 10; reasons.push("RSI overbought, hati-hati lanjut tren"); }
        else if (ind.rsi14 < 20) { direction += 0.2; confidence += 10; reasons.push("RSI oversold, potensi rebound tren"); }
        else if (ind.rsi14 > 50) { confidence += 10; }
        else if (ind.rsi14 < 50) { confidence += 10; }
    }

    return { name: "Trend Following", direction: clampDirection(direction), confidence: Math.min(100, confidence), reasons };
}

function meanReversion({ ind }) {
    const reasons = [];
    let direction = 0;
    let confidence = 0;

    if (ind.rsi14 !== null) {
        if (ind.rsi14 < 30) { direction += 0.5; confidence += 30; reasons.push(`RSI ${ind.rsi14.toFixed(0)} oversold`); }
        else if (ind.rsi14 > 70) { direction -= 0.5; confidence += 30; reasons.push(`RSI ${ind.rsi14.toFixed(0)} overbought`); }
    }

    if (ind.bollinger && ind.last) {
        const price = ind.last.close;
        if (price <= ind.bollinger.lower) { direction += 0.4; confidence += 30; reasons.push("Harga di/bawah band bawah Bollinger"); }
        else if (price >= ind.bollinger.upper) { direction -= 0.4; confidence += 30; reasons.push("Harga di/atas band atas Bollinger"); }
    }

    if (ind.stoch) {
        if (ind.stoch.k < 20 && ind.stoch.k > ind.stoch.d) { direction += 0.2; confidence += 15; reasons.push("Stochastic oversold mulai naik"); }
        else if (ind.stoch.k > 80 && ind.stoch.k < ind.stoch.d) { direction -= 0.2; confidence += 15; reasons.push("Stochastic overbought mulai turun"); }
    }

    return { name: "Mean Reversion", direction: clampDirection(direction), confidence: Math.min(100, confidence), reasons };
}

function breakout({ ind }) {
    const reasons = [];
    let direction = 0;
    let confidence = 0;
    if (!ind.last) return { name: "Breakout", direction: 0, confidence: 0, reasons };

    const price = ind.last.close;
    const volumeSpike = ind.avgVolume20 ? ind.last.volume > ind.avgVolume20 * 1.3 : false;

    if (price >= ind.highestHigh20 * 0.999) {
        direction += volumeSpike ? 0.7 : 0.4;
        confidence += volumeSpike ? 45 : 25;
        reasons.push(volumeSpike ? "Breakout high 20 candle + volume tinggi" : "Mendekati high 20 candle");
    } else if (price <= ind.lowestLow20 * 1.001) {
        direction -= volumeSpike ? 0.7 : 0.4;
        confidence += volumeSpike ? 45 : 25;
        reasons.push(volumeSpike ? "Breakdown low 20 candle + volume tinggi" : "Mendekati low 20 candle");
    }

    if (ind.volatilityPct > 0 && ind.volatilityPct < 0.4) {
        confidence = Math.max(0, confidence - 10);
        reasons.push("Volatilitas rendah, breakout kurang yakin");
    }

    return { name: "Breakout", direction: clampDirection(direction), confidence: Math.min(100, confidence), reasons };
}

function momentum({ ind }) {
    const reasons = [];
    let direction = 0;
    let confidence = 0;

    if (ind.stoch) {
        if (ind.stoch.k > ind.stoch.d && ind.stoch.k < 80) { direction += 0.3; confidence += 20; reasons.push("Stochastic %K memotong naik"); }
        else if (ind.stoch.k < ind.stoch.d && ind.stoch.k > 20) { direction -= 0.3; confidence += 20; reasons.push("Stochastic %K memotong turun"); }
    }
    if (ind.macd) {
        if (ind.macd.histogram > 0) { direction += 0.3; confidence += 20; reasons.push("Momentum MACD positif"); }
        else if (ind.macd.histogram < 0) { direction -= 0.3; confidence += 20; reasons.push("Momentum MACD negatif"); }
    }
    if (ind.ema9 && ind.last && ind.last.close > ind.ema9) { direction += 0.2; confidence += 15; }
    else if (ind.ema9 && ind.last && ind.last.close < ind.ema9) { direction -= 0.2; confidence += 15; }

    return { name: "Momentum Scalper", direction: clampDirection(direction), confidence: Math.min(100, confidence), reasons };
}

function clampDirection(d) {
    return Math.max(-1, Math.min(1, d));
}

const STRATEGIES = {
    trend: trendFollowing,
    meanreversion: meanReversion,
    breakout: breakout,
    momentum: momentum
};

const MODE_WEIGHTS = {
    trader: { trend: 0.9, meanreversion: 0.8, breakout: 1.2, momentum: 1.3 },
    investor: { trend: 1.3, meanreversion: 1.1, breakout: 0.6, momentum: 0.5 }
};

const MODE_THRESHOLD = {
    trader: { entry: 0.32, sell: -0.32 },
    investor: { entry: 0.42, sell: -0.42 }
};

function runStrategy(key, ind, mode) {
    const fn = STRATEGIES[key];
    if (!fn) return null;
    return fn({ ind, mode });
}

function listStrategies() {
    return Object.keys(STRATEGIES);
}

/**
 * Gabungkan seluruh strategi menjadi satu sinyal konsensus, atau jalankan satu
 * strategi spesifik saja jika `onlyStrategy` diisi.
 */
function evaluateConsensus(ind, mode = "trader", onlyStrategy = null) {
    const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.trader;
    const threshold = MODE_THRESHOLD[mode] || MODE_THRESHOLD.trader;
    const keys = onlyStrategy && STRATEGIES[onlyStrategy] ? [onlyStrategy] : Object.keys(STRATEGIES);

    const results = keys.map(key => ({ key, ...runStrategy(key, ind, mode) }));

    let weightedSum = 0;
    let weightTotal = 0;
    const agreeing = [];
    const allReasons = [];

    for (const r of results) {
        const w = (weights[r.key] || 1) * (r.confidence / 100);
        weightedSum += r.direction * w;
        weightTotal += w;
        if (Math.abs(r.direction) >= 0.2) {
            agreeing.push({ name: r.name, direction: r.direction, confidence: r.confidence });
        }
        for (const reason of r.reasons) allReasons.push(`${r.name}: ${reason}`);
    }

    const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
    let action = "WAIT";
    if (score >= threshold.entry) action = "ENTRY";
    else if (score <= threshold.sell) action = "SELL";

    const confidence = Math.round(Math.min(100, Math.abs(score) * 100 + (agreeing.length * 5)));

    return {
        action,
        score: Number(score.toFixed(3)),
        confidence,
        contributing: results,
        agreeing,
        reasons: allReasons
    };
}

module.exports = {
    STRATEGIES,
    listStrategies,
    runStrategy,
    evaluateConsensus
};

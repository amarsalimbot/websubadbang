const { formatUsd, formatUnits, formatPct } = require("../utils");

/**
 * Hitung ukuran posisi berdasarkan modal, persentase risiko, harga entry, dan SL.
 * riskAmount = capital * riskPercent/100
 * quantity = riskAmount / |entry - sl|
 */
function calculatePositionSize({ capital, riskPercent, entryPrice, slPrice }) {
    const riskAmount = capital * (riskPercent / 100);
    const distance = Math.abs(entryPrice - slPrice);
    if (!distance) return { riskAmount, quantity: 0, positionValue: 0, distance: 0 };
    const quantity = riskAmount / distance;
    const positionValue = quantity * entryPrice;
    return { riskAmount, quantity, positionValue, distance };
}

function buildRiskMessage(asset, result, capital, riskPercent, levels) {
    const sizing = calculatePositionSize({ capital, riskPercent, entryPrice: levels.entryPrice, slPrice: levels.sl });
    const leverageNote = sizing.positionValue > capital
        ? `\nCatatan: nilai posisi (${formatUsd(sizing.positionValue)}) lebih besar dari modal (${formatUsd(capital)}). Ini berarti perlu margin/leverage, atau perbesar jarak SL / perkecil risiko.`
        : "";
    return `KALKULATOR RISK — ${asset}
Modal: ${formatUsd(capital, 2)}
Risiko: ${riskPercent}% (${formatUsd(sizing.riskAmount, 2)})
Entry: ${formatUsd(levels.entryPrice)}
SL: ${formatUsd(levels.sl)} (jarak ${formatPct(((levels.sl - levels.entryPrice) / levels.entryPrice) * 100)})
Ukuran posisi: ${formatUnits(sizing.quantity)} ${asset} (~${formatUsd(sizing.positionValue, 2)})${leverageNote}

Ini bukan saran keuangan. Selalu sesuaikan dengan toleransi risiko Anda sendiri.`;
}

module.exports = { calculatePositionSize, buildRiskMessage };

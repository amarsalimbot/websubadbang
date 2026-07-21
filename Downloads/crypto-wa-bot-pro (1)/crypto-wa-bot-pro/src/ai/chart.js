const { emaSeries } = require("./../indicators");

function thinValues(values, maxPoints = 120) {
    if (values.length <= maxPoints) return values;
    const step = Math.ceil(values.length / maxPoints);
    return values.filter((_, i) => i % step === 0);
}

function buildEmaDataset(closes, length, color) {
    const series = emaSeries(closes, length);
    const aligned = closes.map((_, i) => (series[i] !== undefined ? series[i] : null));
    return { label: `EMA${length}`, data: thinValues(aligned), borderColor: color, borderWidth: 1.5, pointRadius: 0, fill: false };
}

/**
 * Bangun konfigurasi Chart.js sederhana (harga close + EMA9/EMA21) dan render
 * lewat QuickChart.io, lalu kembalikan Buffer PNG untuk dikirim sebagai gambar WA.
 * Tidak butuh dependency native (canvas dll) sehingga ringan untuk dijalankan di container.
 */
async function renderPriceChart(asset, candles, options = {}) {
    const closes = candles.map(c => c.close);
    const labels = candles.map(c => new Date(c.time).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }));

    const chartConfig = {
        type: "line",
        data: {
            labels: thinValues(labels),
            datasets: [
                { label: `${asset} Close`, data: thinValues(closes), borderColor: "#1f6feb", borderWidth: 2, pointRadius: 0, fill: false },
                buildEmaDataset(closes, 9, "#f5a623"),
                buildEmaDataset(closes, 21, "#e5484d")
            ]
        },
        options: {
            plugins: {
                title: { display: true, text: `${asset} — ${options.timeframe || ""} (${options.mode || ""})` },
                legend: { display: true, position: "bottom" }
            },
            scales: { x: { display: false } }
        }
    };

    const url = `https://quickchart.io/chart?width=900&height=480&backgroundColor=white&format=png&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QuickChart gagal: HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

module.exports = { renderPriceChart };

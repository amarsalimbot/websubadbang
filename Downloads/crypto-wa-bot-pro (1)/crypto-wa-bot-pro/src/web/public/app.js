const qs = new URLSearchParams(location.search);
const token = qs.get("token") || "";

async function api(path) {
    const url = new URL(path, location.origin);
    if (token) url.searchParams.set("token", token);
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
}

function fmtUsd(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
}

function pulseBar(score) {
    const clamped = Math.max(-1, Math.min(1, score || 0));
    const filled = Math.round(((clamped + 1) / 2) * 10);
    const cls = clamped >= 0 ? "fill-up" : "fill-down";
    let html = "";
    for (let i = 0; i < 10; i++) html += `<i class="${i < filled ? cls : ""}"></i>`;
    return `<div class="pulse-bar">${html}</div>`;
}

function tickClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString("id-ID");
}
setInterval(tickClock, 1000);
tickClock();

let currentMode = "trader";

async function refreshStatus() {
    try {
        const status = await api("/api/status");
        const pill = document.getElementById("waStatus");
        const online = status.whatsapp_connection === "open";
        pill.classList.toggle("online", online);
        pill.classList.toggle("offline", !online);
        pill.querySelector("span:last-child").textContent = `WhatsApp: ${status.whatsapp_connection}`;

        const select = document.getElementById("btAsset");
        if (!select.options.length) {
            select.innerHTML = status.asset_catalog.map(a => `<option value="${a}">${a}</option>`).join("");
        }
    } catch (err) {
        console.error("status error", err);
    }
}

async function refreshPrices() {
    try {
        const rows = await api(`/api/prices?mode=${currentMode}`);
        const tbody = document.getElementById("signalsBody");
        const track = document.getElementById("tickerTrack");

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty">Tidak ada data.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            if (r.error) return `<tr><td>${r.asset}</td><td colspan="5" class="empty">gagal ambil data</td></tr>`;
            return `<tr>
                <td><b>${r.asset}</b></td>
                <td>${fmtUsd(r.price)}</td>
                <td class="${r.changePct >= 0 ? "up" : "down"}">${fmtPct(r.changePct)}</td>
                <td><span class="sig-badge sig-${r.action}">${r.action} ${r.confidence}%</span></td>
                <td>${pulseBar(r.score)}</td>
                <td>${r.rsi ? r.rsi.toFixed(1) : "-"}</td>
            </tr>`;
        }).join("");

        const tickerItems = rows.filter(r => !r.error).map(r =>
            `<span><b>${r.asset}</b> ${fmtUsd(r.price)} <span class="${r.changePct >= 0 ? "up" : "down"}">${fmtPct(r.changePct)}</span></span>`
        ).join("");
        track.innerHTML = tickerItems + tickerItems;
    } catch (err) {
        console.error("prices error", err);
    }
}

async function refreshLeaderboard() {
    try {
        const rows = await api("/api/paper/leaderboard");
        const tbody = document.getElementById("leaderboardBody");
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty">Belum ada akun paper trading.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => `<tr>
            <td>${r.user}</td>
            <td>${fmtUsd(r.equity)}</td>
            <td class="${r.returnPct >= 0 ? "up" : "down"}">${fmtPct(r.returnPct)}</td>
            <td>${r.openPositions}</td>
        </tr>`).join("");
    } catch (err) {
        console.error("leaderboard error", err);
    }
}

document.getElementById("modeToggle").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    currentMode = btn.dataset.mode;
    document.querySelectorAll("#modeToggle button").forEach(b => b.classList.toggle("active", b === btn));
    refreshPrices();
});

document.getElementById("backtestForm").addEventListener("submit", async e => {
    e.preventDefault();
    const asset = document.getElementById("btAsset").value;
    const mode = document.getElementById("btMode").value;
    const days = document.getElementById("btDays").value;
    const strategy = document.getElementById("btStrategy").value;
    const resultBox = document.getElementById("backtestResult");
    resultBox.textContent = "Menjalankan backtest...";
    try {
        const r = await api(`/api/backtest/${asset}?mode=${mode}&days=${days}&strategy=${strategy}`);
        resultBox.innerHTML = [
            `Return: <span class="${r.totalReturnPct >= 0 ? "bt-up" : "bt-down"}">${fmtPct(r.totalReturnPct)}</span>`,
            `Win rate: ${r.winRatePct.toFixed(1)}% (${r.wins}/${r.totalTrades})`,
            `Max drawdown: -${r.maxDrawdownPct.toFixed(2)}%`,
            `Profit factor: ${Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : "∞"}`,
            `Periode: ~${r.actualDays} hari, ${r.candleCount} candle`
        ].join("\n");
    } catch (err) {
        resultBox.textContent = `Gagal: ${err.message}`;
    }
});

function loop() {
    refreshStatus();
    refreshPrices();
    refreshLeaderboard();
}
loop();
setInterval(loop, 20000);

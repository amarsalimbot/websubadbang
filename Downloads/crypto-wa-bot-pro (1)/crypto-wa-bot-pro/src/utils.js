const config = require("./config");

function nowText() {
    return new Date().toLocaleString("id-ID", {
        timeZone: config.timezone,
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function timeText(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("id-ID", {
        timeZone: config.timezone,
        dateStyle: "short",
        timeStyle: "short"
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function priceDigits(price) {
    const p = Number(price) || 0;
    if (p >= 1000) return 2;
    if (p >= 1) return 4;
    if (p >= 0.01) return 6;
    return 8;
}

function formatUsd(value, digits = null) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const d = digits === null ? priceDigits(n) : digits;
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

function formatPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
}

function formatUnits(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function parseNumber(input) {
    if (input === undefined || input === null) return null;
    const cleaned = String(input).replace(/[, ]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function pendekkanError(message) {
    const text = String(message || "Error tidak diketahui");
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function errorMessage(err) {
    return pendekkanError(err?.response?.data?.msg || err?.message || err);
}

module.exports = {
    nowText,
    timeText,
    sleep,
    priceDigits,
    formatUsd,
    formatPct,
    formatUnits,
    parseNumber,
    escapeRegExp,
    clamp,
    pendekkanError,
    errorMessage
};

const config = require("./config");
const { escapeRegExp } = require("./utils");

function containsAssetTerm(text, term) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    return pattern.test(text);
}

/** Cari aset dari teks bebas, mis. "analisa BTC trader" -> asset BTC. */
function normalizeAsset(input) {
    const text = String(input || "").toUpperCase();
    for (const asset of config.assetCatalog) {
        if (containsAssetTerm(text, asset.asset) || containsAssetTerm(text, asset.symbol.replace("USDT", ""))) {
            return asset;
        }
    }
    return null;
}

function findAssetByCode(code) {
    return config.assetCatalog.find(a => a.asset === String(code || "").toUpperCase()) || null;
}

module.exports = { normalizeAsset, findAssetByCode, containsAssetTerm };

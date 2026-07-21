const path = require("path");
const express = require("express");
const config = require("./../config");
const state = require("./../state");
const market = require("./../market");
const { analyzeMany } = require("./../analysis");
const { findAssetByCode } = require("./../assets");
const { runBacktest } = require("./../backtest");
const waClient = require("./../whatsapp/client");
const aiRouter = require("./../ai/router");
const { nowText, pendekkanError } = require("./../utils");

function maskJid(jid) {
    const phone = String(jid || "").split("@")[0];
    if (phone.length <= 4) return "****";
    return `${phone.slice(0, 4)}${"*".repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}`;
}

function requireToken(req, res, next) {
    if (!config.web.token) return next();
    const supplied = req.query.token || req.headers["x-dashboard-token"];
    if (supplied === config.web.token) return next();
    return res.status(401).json({ error: "Token dashboard tidak valid. Tambahkan ?token=... atau header X-Dashboard-Token." });
}

function startWebServer() {
    if (!config.web.enabled) {
        console.log("Web dashboard nonaktif (WEB_DASHBOARD_ENABLED=false).");
        return null;
    }

    const app = express();
    app.use(express.json());
    app.use("/api", requireToken);

    app.get("/health", (req, res) => res.json({ status: "online", time: nowText() }));

    app.get("/api/status", (req, res) => {
        const marketStatus = market.statusSnapshot();
        res.json({
            time: nowText(),
            whatsapp_connection: waClient.getConnectionState(),
            reconnect_count: waClient.getReconnectCount(),
            market_provider: marketStatus.provider,
            ai_providers: aiRouter.statusSnapshot(),
            subscribers_active: state.getAllActiveSubscribers().length,
            watchlist: config.defaultWatchlist.map(a => a.asset),
            asset_catalog: config.assetCatalog.map(a => a.asset),
            paper_trading_starting_balance: config.paperTrading.startingBalance
        });
    });

    app.get("/api/prices", async (req, res) => {
        try {
            const mode = req.query.mode === "investor" ? "investor" : "trader";
            const results = await analyzeMany(config.defaultWatchlist, mode, { force: false });
            res.json(results.map(r => r.error ? { asset: r.asset, error: r.error } : {
                asset: r.asset,
                name: r.name,
                price: r.ticker.price,
                changePct: r.ticker.changePct,
                source: r.ticker.source,
                action: r.consensus.action,
                confidence: r.consensus.confidence,
                score: r.consensus.score,
                rsi: r.ind.rsi14,
                support: r.ind.sr.support,
                resistance: r.ind.sr.resistance
            }));
        } catch (err) {
            res.status(500).json({ error: pendekkanError(err.message) });
        }
    });

    app.get("/api/paper/leaderboard", (req, res) => {
        const holders = state.getAllPaperHolders();
        const rows = holders.map(jid => {
            const account = state.getPaperAccount(jid);
            const openValue = account.positions.reduce((sum, p) => sum + p.entryPrice * p.quantity, 0);
            const equity = account.balance + openValue;
            return {
                user: maskJid(jid),
                equity,
                returnPct: ((equity - account.startingBalance) / account.startingBalance) * 100,
                openPositions: account.positions.length,
                totalTrades: account.trades.length
            };
        }).sort((a, b) => b.returnPct - a.returnPct);
        res.json(rows);
    });

    app.get("/api/backtest/:asset", async (req, res) => {
        try {
            const asset = findAssetByCode(req.params.asset);
            if (!asset) return res.status(404).json({ error: "Aset tidak dikenal" });
            const mode = req.query.mode === "investor" ? "investor" : "trader";
            const days = Math.min(180, Math.max(3, Number(req.query.days) || config.backtest.defaultDays));
            const strategy = ["trend", "meanreversion", "breakout", "momentum"].includes(req.query.strategy) ? req.query.strategy : null;
            const result = await runBacktest(asset, mode, days, strategy);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: pendekkanError(err.message) });
        }
    });

    app.use(express.static(path.join(__dirname, "public")));

    const server = app.listen(config.port, () => {
        console.log(`Web dashboard aktif di port ${config.port}${config.web.token ? " (butuh token)" : ""}.`);
    });
    return server;
}

module.exports = { startWebServer };

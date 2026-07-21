const config = require("./config");
const logger = require("./logger");
const waClient = require("./whatsapp/client");
const router = require("./whatsapp/router");
const scheduler = require("./scheduler");
const webServer = require("./web/server");

logger.info("====================================================");
logger.info(" CRYPTO BOT PRO — multi-strategi, backtest, paper trading, AI");
logger.info("====================================================");
logger.info(`Watchlist default: ${config.defaultWatchlist.map(a => a.asset).join(", ")}`);
logger.info(`Mode default: ${config.risk.defaultMode}`);

waClient.setMessageHandler(async (sock, msg, upsertType) => {
    await router.handleMessage(sock, msg, upsertType);
});

waClient.setReadyHandler(async (sock) => {
    scheduler.startMarketMonitor();
    scheduler.startAutomaticReports();
    if (config.ownerJid) {
        await waClient.sendSafe(config.ownerJid, "Bot Crypto Pro online.\nKetik 'menu' untuk melihat fitur.\nDashboard web aktif jika WEB_DASHBOARD_ENABLED=true.");
    }
});

webServer.startWebServer();
waClient.startBot();

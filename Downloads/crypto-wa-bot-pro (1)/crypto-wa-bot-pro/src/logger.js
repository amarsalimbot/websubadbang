function ts() {
    return new Date().toISOString();
}

module.exports = {
    info: (...args) => console.log(`[${ts()}]`, ...args),
    warn: (...args) => console.warn(`[${ts()}]`, ...args),
    error: (...args) => console.error(`[${ts()}]`, ...args),
    debug: (...args) => {
        if (String(process.env.WA_MESSAGE_DEBUG || "false").toLowerCase() === "true") {
            console.log(`[${ts()}][debug]`, ...args);
        }
    }
};

const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");

if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });

/**
 * Collection ringan berbasis JSON file, satu file per koleksi (mis. users.json,
 * positions.json, paper.json). Lebih tertata dibanding satu file state.json besar:
 * - autosave di-debounce supaya tidak menulis disk terlalu sering
 * - penulisan atomic (tmp file lalu rename) supaya tidak korup saat proses mati
 * - data tetap berupa objek JS biasa di memori, jadi cepat dibaca/diubah
 */
class JsonCollection {
    constructor(name, defaultValue = {}) {
        this.name = name;
        this.file = path.join(config.dataDir, `${name}.json`);
        this.defaultValue = defaultValue;
        this.data = this._load();
        this._saveTimer = null;
    }

    _load() {
        try {
            if (fs.existsSync(this.file)) {
                const raw = fs.readFileSync(this.file, "utf8");
                if (raw.trim()) return JSON.parse(raw);
            }
        } catch (err) {
            logger.error(`Gagal membaca koleksi ${this.name}, memakai default. Error:`, err.message || err);
            try {
                const backup = `${this.file}.corrupt-${Date.now()}`;
                if (fs.existsSync(this.file)) fs.copyFileSync(this.file, backup);
            } catch (_) { /* abaikan */ }
        }
        return JSON.parse(JSON.stringify(this.defaultValue));
    }

    _writeNow() {
        try {
            const tmp = `${this.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
            fs.renameSync(tmp, this.file);
        } catch (err) {
            logger.error(`Gagal menyimpan koleksi ${this.name}:`, err.message || err);
        }
    }

    save(immediate = false) {
        if (immediate) {
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
            }
            this._writeNow();
            return;
        }
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._writeNow();
        }, 500);
    }

    get(key, fallback = undefined) {
        if (key === undefined) return this.data;
        return this.data[key] !== undefined ? this.data[key] : fallback;
    }

    set(key, value) {
        this.data[key] = value;
        this.save();
        return value;
    }

    delete(key) {
        delete this.data[key];
        this.save();
    }

    update(key, mutator, fallback = {}) {
        const current = this.data[key] !== undefined ? this.data[key] : JSON.parse(JSON.stringify(fallback));
        const next = mutator(current) || current;
        this.data[key] = next;
        this.save();
        return next;
    }

    keys() {
        return Object.keys(this.data);
    }

    values() {
        return Object.values(this.data);
    }

    entries() {
        return Object.entries(this.data);
    }
}

const registry = new Map();

function collection(name, defaultValue = {}) {
    if (!registry.has(name)) registry.set(name, new JsonCollection(name, defaultValue));
    return registry.get(name);
}

function flushAll() {
    for (const col of registry.values()) col.save(true);
}

process.on("SIGINT", flushAll);
process.on("SIGTERM", flushAll);

module.exports = { collection, flushAll };

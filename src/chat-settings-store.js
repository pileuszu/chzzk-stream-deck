const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS, validateSettings, migrateSettings } = require('../shared/chat-config');

class ChatSettingsStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.initialized = Boolean(filePath && fs.existsSync(filePath));
        this.settings = this.initialized
            ? migrateSettings(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')))
            : { ...DEFAULT_SETTINGS };
    }
    get() { return { ...this.settings }; }
    update(patch, { initialize = false } = {}) {
        if (initialize && this.initialized) return this.get();
        const next = validateSettings(patch, this.settings);
        if (this.filePath) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            const temp = `${this.filePath}.${process.pid}.tmp`;
            try {
                fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n');
                fs.renameSync(temp, this.filePath);
            } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
        }
        this.settings = next;
        this.initialized = true;
        return this.get();
    }
}
module.exports = ChatSettingsStore;

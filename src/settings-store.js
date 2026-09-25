const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS, validateSettings, migrateSettings } = require("../shared/chat-config");

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = { ...DEFAULT_SETTINGS };
    this.initialized = Boolean(filePath && fs.existsSync(filePath));
    if (this.initialized) {
      try {
        this.settings = migrateSettings(
          JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, '')),
        );
      } catch (error) {
        throw new Error(
          `저장된 설정을 읽지 못했습니다 (${filePath}): ${error.message}`,
        );
      }
    }
  }
  get() {
    return { ...this.settings };
  }
  update(patch, { initialize = false } = {}) {
    if (initialize && this.initialized) return this.get();
    const next = validateSettings(patch, this.settings);
    if (this.filePath) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", {
        mode: 0o600,
      });
      fs.renameSync(temporary, this.filePath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    }
    this.settings = next;
    this.initialized = true;
    return this.get();
  }
}
module.exports = SettingsStore;

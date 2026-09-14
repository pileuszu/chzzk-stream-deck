const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS, validateSettings } = require("../shared/chat-config");

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = { ...DEFAULT_SETTINGS };
    if (fs.existsSync(filePath)) {
      try {
        this.settings = validateSettings(
          JSON.parse(fs.readFileSync(filePath, "utf8")),
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
  update(patch) {
    const next = validateSettings(patch, this.settings);
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
    this.settings = next;
    return this.get();
  }
}
module.exports = SettingsStore;

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const SettingsStore = require("../src/settings-store");
const {
  normalizeChannelId,
  validateSettings,
} = require("../shared/chat-config");
const id = "a".repeat(32);
test("channel accepts a bare ID or CHZZK channel/live URL", () => {
  for (const input of [
    id,
    `https://chzzk.naver.com/${id}`,
    `https://chzzk.naver.com/live/${id}?from=home`,
  ])
    assert.equal(normalizeChannelId(input), id);
  for (const input of [
    "abc",
    `https://example.com/${id}`,
    `https://chzzk.naver.com.evil.test/${id}`,
  ])
    assert.throws(() => normalizeChannelId(input));
});
test("invalid settings cannot overwrite the persisted file", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chzzk-settings-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "settings.json");
  const store = new SettingsStore(file);
  store.update({ theme: "maplestory", channelId: id, maxMessages: 8 });
  for (const patch of [
    { fontSize: 0 },
    { opacity: 101 },
    { fadeMask: "false" },
    { theme: "bad" },
    { maxMessages: null },
  ])
    assert.throws(() => store.update(patch));
  const restored = new SettingsStore(file).get();
  assert.equal(restored.theme, "maplestory");
  assert.equal(restored.maxMessages, 8);
  assert.equal(restored.channelId, id);
  assert.equal(validateSettings({ alignment: "default" }).alignment, "left");
});
test("corrupt settings are reported and preserved for recovery", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chzzk-corrupt-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "settings.json");
  fs.writeFileSync(file, "{broken");
  assert.throws(() => new SettingsStore(file));
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

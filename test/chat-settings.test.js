const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { THEMES, migrateSettings, validateSettings } = require('../shared/chat-config');
const Store = require('../src/settings-store');

test('only the three original themes are selectable; legacy v3 choices migrate safely', async () => {
    assert.deepEqual(THEMES.map(theme => theme.id), ['simple-purple', 'unicorn-overlord', 'maplestory']);
    const catalog = await import('../js/chat/themes.mjs');
    assert.deepEqual(catalog.CHAT_THEMES, THEMES);
    for (const theme of THEMES) assert.equal(migrateSettings({ theme: theme.id }).theme, theme.id);
    for (const theme of ['clean', 'neon-green']) {
        assert.equal(migrateSettings({ theme }).theme, 'simple-purple');
        assert.throws(() => validateSettings({ theme }), /지원하지/);
    }
});

test('saved settings survive restart; bootstrap and failed updates cannot overwrite them', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-chat-settings-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'settings.json');
    const store = new Store(file);
    const saved = store.update({ theme: 'unicorn-overlord', maxMessages: 8, alignment: 'right' });
    assert.deepEqual(new Store(file).get(), saved);
    store.update({ theme: 'simple-purple' }, { initialize: true });
    assert.deepEqual(store.get(), saved);
    assert.throws(() => store.update({ maxMessages: 0 }));
    assert.deepEqual(new Store(file).get(), saved);
    store.filePath = dir; // Atomic replacement fails; committed state stays unchanged.
    assert.throws(() => store.update({ theme: 'maplestory' }));
    assert.deepEqual(store.get(), saved);
});

test('independent overlays receive settings immediately and on every SSE reconnect', { timeout: 12000 }, async t => {
    const Server = require('../server');
    const server = new Server({ settingsPath: null });
    server.serverInstance = server.app.listen(0, '127.0.0.1');
    await once(server.serverInstance, 'listening');
    t.after(() => server.shutdown());
    const base = 'http://127.0.0.1:' + server.serverInstance.address().port;
    const controller = new AbortController();
    t.after(() => controller.abort());
    async function stream() {
        const response = await fetch(base + '/api/chat/stream', { signal: controller.signal });
        const reader = response.body.getReader();
        const decoder = new TextDecoder(); let pending = '';
        return async () => {
            while (!pending.includes('\n\n')) {
                const { done, value } = await reader.read();
                if (done) throw new Error('SSE closed');
                pending += decoder.decode(value, { stream: true });
            }
            const end = pending.indexOf('\n\n');
            const event = pending.slice(0, end); pending = pending.slice(end + 2);
            const payload = JSON.parse(event.slice(6));
            assert.ok(['snapshot', 'settings'].includes(payload.type));
            return payload.settings;
        };
    }
    const first = await stream(), second = await stream();
    assert.equal((await first()).theme, 'simple-purple');
    assert.equal((await second()).theme, 'simple-purple');
    for (const theme of ['unicorn-overlord', 'maplestory', 'simple-purple']) {
        const response = await fetch(base + '/api/chat/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }) });
        assert.equal(response.status, 200);
        assert.equal((await first()).theme, theme);
        assert.equal((await second()).theme, theme);
    }
    const third = await stream(); assert.equal((await third()).theme, 'simple-purple');
    const bad = await fetch(base + '/api/chat/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'neon-green' }) });
    assert.equal(bad.status, 400);
    const crossOrigin = await fetch(base + '/api/chat/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.org' }, body: JSON.stringify({ theme: 'maplestory' }) });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await (await fetch(base + '/api/chat/settings')).json()).settings.theme, 'simple-purple');
    assert.equal(server.getStatus().chat.active, false);
    controller.abort();
});

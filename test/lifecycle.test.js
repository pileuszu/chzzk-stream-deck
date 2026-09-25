const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const { TrayLifecycle } = require('../src/tray-lifecycle');
const { stopChild } = require('../src/stop-child');

function fixture() {
    const app = new EventEmitter();
    app.quitCount = 0; app.quit = () => { app.quitCount++; app.emit('before-quit', { preventDefault() { throw new Error('Finished quit was blocked'); } }); };
    const window = new EventEmitter();
    window.visible = true; window.minimized = false;
    window.hide = () => { window.visible = false; };
    window.show = () => { window.visible = true; };
    window.focus = () => { window.focused = true; };
    window.restore = () => { window.minimized = false; };
    window.isMinimized = () => window.minimized;
    window.isDestroyed = () => false;
    class Tray extends EventEmitter {
        setToolTip() {} setContextMenu(menu) { this.menu = menu; }
        destroy() { this.destroyed = true; }
    }
    const Menu = { buildFromTemplate: items => ({ items, getMenuItemById: id => items.find(item => item.id === id) }) };
    const errors = [];
    const lifecycle = new TrayLifecycle({ app, Tray, Menu, icon: 'fixture', getWindow: () => window,
        createWindow: () => assert.fail('Unexpected new window'), dialog: { showMessageBox: async value => errors.push(value) } });
    lifecycle.attach(window);
    return { app, window, lifecycle, errors };
}
test('window close hides without stopping modules; tray restores the same window', async () => {
    const f = fixture(); let stopped = 0, prevented = false;
    f.lifecycle.register('capture', async () => stopped++);
    f.window.emit('close', { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true); assert.equal(f.window.visible, false); assert.equal(stopped, 0);
    f.window.minimized = true; f.lifecycle.tray.emit('double-click');
    assert.equal(f.window.visible, true); assert.equal(f.window.minimized, false); assert.equal(f.app.quitCount, 0);
    await f.lifecycle.menu.getMenuItemById('quit').click();
    assert.equal(stopped, 1); assert.equal(f.app.quitCount, 1); assert.equal(f.lifecycle.tray.destroyed, true);
});
test('repeated quit drains each resource once and waits before exiting', async () => {
    const f = fixture(); const order = []; let finish;
    f.lifecycle.register('native', () => new Promise(resolve => { order.push('native'); finish = resolve; }));
    f.lifecycle.register('chat', async () => order.push('chat'));
    const first = f.lifecycle.requestQuit();
    const second = f.lifecycle.requestQuit();
    assert.equal(first, second); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.app.quitCount, 0); assert.equal(f.lifecycle.menu.getMenuItemById('quit').enabled, false);
    finish(); assert.equal(await first, true);
    assert.deepEqual(order, ['native', 'chat']); assert.equal(f.app.quitCount, 1);
});
test('failed cleanup still stops other modules and permits a retry', async () => {
    const f = fixture(); let fail = true, chatStops = 0;
    f.lifecycle.register('NDI', async () => { if (fail) throw new Error('No stop acknowledgment'); });
    f.lifecycle.register('chat', async () => chatStops++);
    assert.equal(await f.lifecycle.requestQuit(), false);
    assert.equal(chatStops, 1); assert.equal(f.app.quitCount, 0); assert.equal(f.errors.length, 1);
    assert.equal(f.lifecycle.menu.getMenuItemById('quit').enabled, true);
    fail = false; assert.equal(await f.lifecycle.requestQuit(), true); assert.equal(f.app.quitCount, 1);
});
test('owned IPC child exits cleanly before stop resolves', async t => {
    const child = fork(path.join(__dirname, 'fixtures/managed-child.cjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill(); });
    await once(child, 'message');
    await stopChild(child);
    assert.equal(child.exitCode, 0);
    await stopChild(child);
});
test('fallback termination targets only the supplied child and waits for exit', async t => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
    t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill(); });
    await once(child, 'spawn');
    await stopChild(child);
    assert.ok(child.exitCode != null || child.signalCode != null);
});
test('server shutdown disconnects chat, ends SSE and releases the HTTP listener', async t => {
    const Server = require('../server');
    const server = new Server({ settingsPath: null });
    let disconnected = false, ended = false;
    const client = new EventEmitter(); client.disconnect = () => { disconnected = true; };
    server.client = client;
    server.connections.add({ end() { ended = true; }, write() {} });
    server.serverInstance = server.app.listen(0, '127.0.0.1'); await once(server.serverInstance, 'listening');
    const address = server.serverInstance.address();
    await server.shutdown();
    assert.equal(disconnected, true); assert.equal(ended, true);
    assert.equal(server.serverInstance, null); assert.equal(server.client, null);
    await assert.rejects(fetch('http://127.0.0.1:' + address.port));
    assert.equal(server.stopping, true);
});

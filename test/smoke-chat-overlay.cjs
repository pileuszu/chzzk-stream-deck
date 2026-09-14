const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
app.setPath('userData', path.resolve('test-results/chat-overlay-profile'));
process.env.PORT = '17114';
const Server = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
    const server = new Server();
    server.serverInstance = server.app.listen(server.port, server.host);
    await once(server.serverInstance, 'listening');
    const window = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    const evaluate = value => window.webContents.executeJavaScript(value);
    const wait = async condition => {
        const deadline = Date.now() + 6000;
        while (!await evaluate(condition)) { if (Date.now() > deadline) throw new Error(condition); await delay(50); }
    };
    try {
        await window.loadURL('http://localhost:17114/chat-overlay.html');
        await wait('Boolean(window.chatOverlay)');
        const deadline = Date.now() + 6000;
        while (!server.sseConnections.size) { if (Date.now() > deadline) throw new Error('SSE did not connect'); await delay(50); }
        await evaluate(`localStorage.setItem('chat-theme','clean'); localStorage.setItem('chat-alignment','right'); localStorage.setItem('chat-max-messages','2'); localStorage.setItem('chat-max-nickname-length','3'); localStorage.setItem('chat-fade-time','0'); window.chatOverlay.loadSettings();`);
        for (let i = 0; i < 3; i++) server.broadcastMessage({ username: '긴닉네임시청자', message: '수신 확인 ' + i });
        await wait('window.chatOverlay.messages.length === 2');
        assert.equal(await evaluate("window.chatOverlay.preview"), false);
        assert.equal(await evaluate("document.querySelector('.message').textContent"), '수신 확인 1');
        assert.equal(await evaluate("document.querySelector('.username').textContent"), '긴닉네...');
        await evaluate("localStorage.setItem('chat-theme','neon-green'); window.chatOverlay.loadSettings();");
        assert.equal(await evaluate("document.getElementById('chatContainer').className"), 'chat-container theme-neon-green align-right');
        server.broadcastMessage({ username: '<script>', message: '<img src=x onerror=alert(1)>' });
        await wait('window.chatOverlay.messages.at(-1).originalUsername === "<script>"');
        assert.equal(await evaluate("document.querySelector('.chat-message-container:last-child .message').textContent"), '<img src=x onerror=alert(1)>');
        assert.equal(await evaluate("document.querySelectorAll('.chat-message-container script, .chat-message-container img').length"), 0);
        console.log('LIVE_OVERLAY_OK: SSE reception, saved settings, theme changes, alignment, count and escaping.');
    } finally { window.destroy(); await server.shutdown(); }
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => app.exit(1), 20000).unref();

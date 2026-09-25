const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const ChzzkStreamDeckServer = require('./server');
const { TrayLifecycle } = require('./src/tray-lifecycle');
const { OutputModules, isTrustedSender } = require('./src/output-modules');
const { prepareRuntime } = require('./src/output-runtime');

let mainWindow = null, server = null, outputModules = null, lifecycle = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 640, height: 440, minWidth: 600, minHeight: 420, frame: false,
        backgroundColor: '#f4f4f3', show: false, title: 'CHZZK Stream Deck',
        icon: path.join(__dirname, 'assets/icons/icon.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
            webSecurity: true, preload: path.join(__dirname, 'preload.js') }
    });
    lifecycle.attach(mainWindow);
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    const sendWindowState = () => mainWindow?.webContents.send('window-controls:state', {
        maximized: mainWindow.isMaximized(), pinned: mainWindow.isAlwaysOnTop()
    });
    for (const event of ['maximize', 'unmaximize', 'always-on-top-changed']) mainWindow.on(event, sendWindowState);
    mainWindow.webContents.on('before-input-event', (_, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) mainWindow.webContents.toggleDevTools();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, target) => {
        const url = new URL(target);
        if (url.origin !== server.baseUrl || !['/', '/index.html'].includes(url.pathname)) event.preventDefault();
    });
    mainWindow.loadURL(server.baseUrl);
    mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => lifecycle?.show());
    app.whenReady().then(async () => {
        app.setAppUserModelId('com.chzzk.streamdeck');
        const externalConfig = path.join(path.dirname(app.getPath('exe')), 'config.json');
        server = new ChzzkStreamDeckServer({
            configPath: app.isPackaged && fs.existsSync(externalConfig) ? externalConfig : undefined,
            settingsPath: path.join(app.getPath('userData'), 'settings.json')
        });
        await server.start();
        outputModules = new OutputModules({ root: prepareRuntime(app), openPath: file => shell.openPath(file) });
        lifecycle = new TrayLifecycle({
            app, Tray, Menu, dialog, icon: nativeImage.createFromPath(path.join(__dirname, 'assets/icons/icon.ico')),
            getWindow: () => mainWindow, createWindow,
            beforeStop: () => { server.stopping = true; }, afterStop: () => server.shutdown(),
            onFailure: () => { server.stopping = false; outputModules.closing = false; }
        });
        lifecycle.register('화면·오디오 모듈', () => outputModules.shutdown());
        lifecycle.register('채팅 모듈', () => server.stopChat());
        for (const kind of ['status', 'action', 'configure', 'configureNdi']) {
            ipcMain.handle('output-modules:' + kind, async (event, payload) => {
                if (!isTrustedSender(event, mainWindow, server.baseUrl)) throw new Error('출력 모듈은 데스크톱 대시보드에서만 제어할 수 있습니다.');
                if (kind !== 'status' && lifecycle.quitting) return { ok: false, error: '앱을 종료하는 중입니다.' };
                try { return { ok: true, data: await outputModules[kind](payload) }; }
                catch (error) { return { ok: false, error: error.message }; }
            });
        }
        ipcMain.handle('window-controls:action', (event, action) => {
            if (!isTrustedSender(event, mainWindow, server.baseUrl)) throw new Error('창 제어는 이 앱의 대시보드에서만 가능합니다.');
            switch (action) {
                case 'state': break;
                case 'minimize': mainWindow.minimize(); break;
                case 'toggle-maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break;
                case 'toggle-pin': mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop()); break;
                case 'close': setImmediate(() => mainWindow?.close()); break;
                default: throw new Error('지원하지 않는 창 제어입니다.');
            }
            return { maximized: mainWindow.isMaximized(), pinned: mainWindow.isAlwaysOnTop() };
        });
        createWindow();
        app.on('activate', () => lifecycle?.show());
    }).catch(async error => {
        dialog.showErrorBox('Stream Deck를 시작하지 못했습니다', error.code === 'EADDRINUSE'
            ? server.port + ' 포트가 사용 중입니다. 다른 Stream Deck나 웹 서버를 확인하세요.' : error.message);
        await server?.shutdown(); app.exit(1);
    });
    app.on('window-all-closed', () => {});
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        if (lifecycle) void lifecycle.requestQuit(); else app.quit();
    });
}
module.exports = { getLifecycle: () => lifecycle, getServer: () => server, getWindow: () => mainWindow };

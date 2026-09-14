/**
 * Electron 메인 프로세스
 * 서버를 시작하고 애플리케이션 창을 생성합니다.
 */

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const { TrayLifecycle } = require('./src/tray-lifecycle');
const path = require('path');
const ChzzkStreamDeckServer = require('./server');
const { OutputModules, isTrustedSender } = require('./src/output-modules');
const { prepareRuntime } = require('./src/output-runtime');

let mainWindow = null;
let server = null;
let loadMainWindowFunc = null;
let outputModules = null;
let lifecycle = null;

// 서버 인스턴스 생성
function createServer() {
    try {
        console.log('서버 인스턴스 생성 중...');
        server = new ChzzkStreamDeckServer();
        
        // 서버 시작 시 에러 처리
        server.serverInstance = server.app.listen(server.port, server.host, () => {
            console.log(`✓ 서버 시작 완료: http://${server.host}:${server.port}`);
            server.printStartupInfo();
            
            // 서버 준비 완료 플래그 설정
            server.isReady = true;
            
            // 창이 대기 중이면 로드
            if (mainWindow && !mainWindow.loaded && loadMainWindowFunc) {
                loadMainWindowFunc();
            }
        });
        
        server.serverInstance.on('error', (error) => {
            console.error('서버 시작 오류:', error);
            if (error.code === 'EADDRINUSE') {
                console.error(`포트 ${server.port}가 이미 사용 중입니다.`);
            }
        });
    } catch (error) {
        console.error('서버 생성 오류:', error);
    }
}

// 애플리케이션 창 생성
function createWindow() {
    // 서버가 이미 시작된 경우 서버의 실제 포트와 호스트 사용
    let url;
    if (server && server.isReady) {
        url = `http://${server.host}:${server.port}`;
        console.log(`서버 포트 사용: ${url}`);
    } else {
        // 서버가 아직 시작되지 않은 경우 기본값 사용 (서버가 시작되면 자동으로 업데이트됨)
        url = 'http://localhost:7112';
        console.log(`기본 URL 사용: ${url} (서버 시작 대기 중)`);
    }
    
    mainWindow = new BrowserWindow({
        width: 640,
        height: 440,
        minWidth: 600,
        minHeight: 420,
        frame: false,
        backgroundColor: '#f4f4f3',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'CHZZK Stream Deck',
        // 개발 모드가 아닐 때도 DevTools 단축키 허용 (F12)
        icon: path.join(__dirname, 'assets/icons/icon.ico')
    });
    
    lifecycle.attach(mainWindow);
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    const sendWindowState = () => mainWindow?.webContents.send('window-controls:state', {
        maximized: mainWindow.isMaximized(), pinned: mainWindow.isAlwaysOnTop()
    });
    mainWindow.on('maximize', sendWindowState);
    mainWindow.on('unmaximize', sendWindowState);
    mainWindow.on('always-on-top-changed', sendWindowState);

    // F12 키로 DevTools 열기 (빌드 모드에서도 가능)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
            mainWindow.webContents.toggleDevTools();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, target) => {
        const url = new URL(target);
        if (url.origin !== `http://${server.host}:${server.port}` || !['/', '/index.html'].includes(url.pathname)) {
            event.preventDefault();
        }
    });

    // 서버 준비 확인 후 로드
    mainWindow.loaded = false;
    
    // 로드 함수 정의
    loadMainWindowFunc = () => {
        if (server && server.isReady && mainWindow && !mainWindow.loaded) {
            // 서버가 준비되면 실제 서버 URL 사용
            const serverUrl = `http://${server.host}:${server.port}`;
            console.log(`창 로드: ${serverUrl}`);
            mainWindow.loadURL(serverUrl);
            mainWindow.loaded = true;
            
            // 페이지 로드 에러 처리
            mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                console.error('페이지 로드 실패:', errorCode, errorDescription);
                console.error('URL:', validatedURL);
                console.error('서버 상태:', server ? { ready: server.isReady, host: server.host, port: server.port } : '서버 없음');
            });
            
            // 개발 모드에서 DevTools 자동 열기
            if (!app.isPackaged) {
                // 개발 모드에서만 자동 열기 (원하면 주석 해제)
                // mainWindow.webContents.openDevTools();
            }
        } else if (server && !server.isReady) {
            // 서버가 아직 준비되지 않음, 100ms 후 다시 시도
            setTimeout(loadMainWindowFunc, 100);
        }
    };
    
    // 서버가 이미 준비되어 있으면 즉시 로드, 아니면 대기
    if (server && server.isReady) {
        loadMainWindowFunc();
    } else {
        setTimeout(loadMainWindowFunc, 100);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => lifecycle?.show());
    app.whenReady().then(() => {
        app.setAppUserModelId('com.chzzk.streamdeck');
        outputModules = new OutputModules({
            root: prepareRuntime(app), openPath: file => shell.openPath(file)
        });
        createServer();
        lifecycle = new TrayLifecycle({
            app, Tray, Menu, dialog, icon: nativeImage.createFromPath(path.join(__dirname, 'assets/icons/icon.ico')),
            getWindow: () => mainWindow, createWindow,
            beforeStop: () => { server.stopping = true; },
            afterStop: () => server.shutdown(),
            onFailure: () => { server.stopping = false; outputModules.closing = false; }
        });
        lifecycle.register('화면·오디오 모듈', () => outputModules.shutdown());
        lifecycle.register('채팅 모듈', () => server.stopChatModule());
        for (const kind of ['status', 'action', 'configure']) {
            ipcMain.handle('output-modules:' + kind, async (event, action) => {
                if (!isTrustedSender(event, mainWindow, 'http://' + server.host + ':' + server.port)) {
                    throw new Error('출력 모듈은 데스크톱 대시보드에서만 제어할 수 있습니다.');
                }
                if (kind !== 'status' && lifecycle.quitting) return { ok: false, error: '앱을 종료하는 중입니다.' };
                try { return { ok: true, data: await outputModules[kind](action) }; }
                catch (error) { return { ok: false, error: error.message }; }
            });
        }
        ipcMain.handle('window-controls:action', (event, action) => {
            if (!isTrustedSender(event, mainWindow, 'http://' + server.host + ':' + server.port)) {
                throw new Error('창 제어는 이 앱의 대시보드에서만 가능합니다.');
            }
            switch (action) {
                case 'state': break;
                case 'minimize': mainWindow.minimize(); break;
                case 'toggle-maximize':
                    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
                    break;
                case 'toggle-pin': mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop()); break;
                case 'close': setImmediate(() => mainWindow?.close()); break;
                default: throw new Error('지원하지 않는 창 제어입니다.');
            }
            return { maximized: mainWindow.isMaximized(), pinned: mainWindow.isAlwaysOnTop() };
        });
        createWindow();
        app.on('activate', () => lifecycle.show());
    }).catch(error => { console.error(error); app.exit(1); });
    // Native tray ownership keeps the app running after the window is hidden/destroyed.
    app.on('window-all-closed', () => {});
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        if (lifecycle) void lifecycle.requestQuit(); else app.quit();
    });
}

module.exports = { getLifecycle: () => lifecycle, getServer: () => server, getWindow: () => mainWindow };

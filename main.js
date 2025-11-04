/**
 * Electron 메인 프로세스
 * 서버를 시작하고 애플리케이션 창을 생성합니다.
 */

// Windows에서 콘솔 인코딩 설정 (한글 출력 깨짐 방지)
if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
        execSync('chcp 65001 >nul 2>&1', { stdio: 'ignore', shell: true }); // UTF-8 설정
        // stdout/stderr 인코딩 설정
        if (process.stdout.setDefaultEncoding) {
            process.stdout.setDefaultEncoding('utf8');
        }
        if (process.stderr.setDefaultEncoding) {
            process.stderr.setDefaultEncoding('utf8');
        }
    } catch (e) {
        // 설정 실패 시 무시
    }
}

const { app, BrowserWindow } = require('electron');
const path = require('path');
const ChzzkStreamDeckServer = require('./server');

let mainWindow = null;
let server = null;
let loadMainWindowFunc = null;

// 서버 인스턴스 생성
function createServer() {
    try {
        console.log('서버 인스턴스 생성 중...');
        server = new ChzzkStreamDeckServer();
        
        // 서버 시작 시 에러 처리
        server.serverInstance = server.app.listen(server.port, server.host, () => {
            console.log(`✓ 서버 시작 완료: http://${server.host}:${server.port}`);
            server.printStartupInfo();
            
            // 서버 준비 완료 플래그 설정 (약간의 지연을 두어 서버가 완전히 준비되도록)
            setTimeout(() => {
                server.isReady = true;
                console.log('서버 준비 완료 플래그 설정');
                
                // 창이 대기 중이면 로드
                if (mainWindow && !mainWindow.loaded && loadMainWindowFunc) {
                    loadMainWindowFunc();
                }
            }, 500); // 500ms 지연으로 서버가 완전히 준비되도록
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
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'CHZZK Stream Deck',
        // 개발 모드가 아닐 때도 DevTools 단축키 허용 (F12)
        icon: undefined
    });
    
    // F12 키로 DevTools 열기 (빌드 모드에서도 가능)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
            mainWindow.webContents.toggleDevTools();
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

// 애플리케이션 준비 완료
app.whenReady().then(() => {
    createServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 모든 창이 닫힐 때
app.on('window-all-closed', () => {
    if (server) {
        server.shutdown();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 애플리케이션 종료 전
app.on('before-quit', () => {
    if (server) {
        server.shutdown();
    }
});

// IPC 핸들러 (렌더러 프로세스에서 호출)
const { ipcMain } = require('electron');
ipcMain.on('app-quit', () => {
    if (server) {
        server.shutdown();
    }
    app.quit();
});


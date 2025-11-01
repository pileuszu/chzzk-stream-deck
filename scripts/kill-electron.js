/**
 * Electron 프로세스 종료 스크립트
 */
const { exec } = require('child_process');
const os = require('os');

const platform = os.platform();

function killProcess(pattern) {
    return new Promise((resolve) => {
        if (platform === 'win32') {
            // Windows: taskkill 명령 사용
            exec(`taskkill /F /IM "${pattern}" /T 2>nul || echo`, (error) => {
                resolve(); // 에러는 무시
            });
        } else {
            // Linux/Mac: pkill 사용
            exec(`pkill -f "${pattern}" || true`, (error) => {
                resolve();
            });
        }
    });
}

async function killElectron() {
    console.log('Terminating Electron processes...');
    
    // 여러 패턴으로 프로세스 종료 시도
    await killProcess('CHZZK Stream Deck.exe');
    await killProcess('electron.exe');
    
    // 충분한 대기 시간 (파일 잠금 해제 대기)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Electron processes terminated (if any)');
}

killElectron().then(() => {
    process.exit(0);
}).catch(() => {
    process.exit(0);
});


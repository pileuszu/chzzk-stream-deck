/**
 * electron-builder winCodeSign 캐시 삭제 스크립트
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function clearCache() {
    const platform = os.platform();
    let cachePath;

    if (platform === 'win32') {
        // Windows: %LOCALAPPDATA%\electron-builder\Cache\winCodeSign
        cachePath = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
    } else if (platform === 'darwin') {
        // macOS: ~/Library/Caches/electron-builder/winCodeSign
        cachePath = path.join(os.homedir(), 'Library', 'Caches', 'electron-builder', 'winCodeSign');
    } else {
        // Linux: ~/.cache/electron-builder/winCodeSign
        cachePath = path.join(os.homedir(), '.cache', 'electron-builder', 'winCodeSign');
    }

    if (fs.existsSync(cachePath)) {
        try {
            fs.rmSync(cachePath, { recursive: true, force: true });
            console.log(`캐시 삭제 완료: ${cachePath}`);
        } catch (error) {
            console.warn(`캐시 삭제 실패 (무시됨): ${error.message}`);
        }
    } else {
        console.log('삭제할 winCodeSign 캐시가 없습니다.');
    }
}

clearCache();


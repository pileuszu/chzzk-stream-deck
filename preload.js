/**
 * Preload 스크립트
 * Electron의 보안 컨텍스트에서 렌더러 프로세스에 API 노출
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    quitApp: () => ipcRenderer.send('app-quit')
});


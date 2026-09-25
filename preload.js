const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('outputModules', {
    status: () => ipcRenderer.invoke('output-modules:status'),
    action: action => ipcRenderer.invoke('output-modules:action', action),
    configure: payload => ipcRenderer.invoke('output-modules:configure', payload),
    configureNdi: payload => ipcRenderer.invoke('output-modules:configureNdi', payload)
});

contextBridge.exposeInMainWorld('deckWindow', {
    action: action => ipcRenderer.invoke('window-controls:action', action),
    onState: callback => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('window-controls:state', listener);
        return () => ipcRenderer.removeListener('window-controls:state', listener);
    }
});

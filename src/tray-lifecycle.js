// The close button hides the window. An explicit quit drains registered resources.
class TrayLifecycle {
    constructor({ app, Tray, Menu, dialog, icon, getWindow, createWindow, beforeStop = () => {}, afterStop = async () => {}, onFailure = () => {} }) {
        Object.assign(this, { app, dialog, getWindow, createWindow, beforeStop, afterStop, onFailure });
        this.resources = new Map();
        this.quitting = false;
        this.finished = false;
        this.pending = null;
        this.tray = new Tray(icon);
        this.tray.setToolTip('CHZZK Stream Deck');
        this.menu = Menu.buildFromTemplate([
            { id: 'show', label: '스트림덱 열기', click: () => this.show() },
            { type: 'separator' },
            { id: 'quit', label: '종료', click: () => this.requestQuit() }
        ]);
        this.tray.setContextMenu(this.menu);
        this.tray.on('click', () => this.show());
        this.tray.on('double-click', () => this.show());
        this.beforeQuit = event => {
            if (this.finished) return;
            event.preventDefault();
            void this.requestQuit();
        };
        app.on('before-quit', this.beforeQuit);
    }
    register(id, stop) {
        if (this.resources.has(id)) throw new Error('Duplicate lifecycle resource: ' + id);
        this.resources.set(id, stop);
    }
    attach(window) {
        window.on('close', event => {
            if (this.finished) return;
            event.preventDefault();
            window.hide();
        });
    }
    show() {
        let window = this.getWindow();
        if (!window || window.isDestroyed()) { this.createWindow(); return; }
        if (window.isMinimized()) window.restore();
        window.show(); window.focus();
    }
    requestQuit() {
        if (this.finished) return Promise.resolve(true);
        if (this.pending) return this.pending;
        this.quitting = true;
        this.menu.getMenuItemById('quit').enabled = false;
        this.menu.getMenuItemById('quit').label = '모듈 종료 중…';
        this.tray.setContextMenu(this.menu);
        this.pending = this.drain().finally(() => { this.pending = null; });
        return this.pending;
    }
    async drain() {
        try {
            await this.beforeStop();
            const errors = [];
            for (const [id, stop] of this.resources) {
                try { await stop(); } catch (error) { errors.push(id + ': ' + error.message); }
            }
            if (errors.length) throw new Error(errors.join('\n'));
            await this.afterStop();
            this.finished = true;
            this.tray.destroy();
            this.app.quit();
            return true;
        } catch (error) {
            this.quitting = false;
            this.onFailure();
            this.menu.getMenuItemById('quit').enabled = true;
            this.menu.getMenuItemById('quit').label = '종료';
            this.tray.setContextMenu(this.menu);
            this.show();
            await this.dialog.showMessageBox({ type: 'error', title: '모듈 종료 확인',
                message: '일부 모듈의 종료를 확인하지 못했습니다.',
                detail: error.message + '\n모듈 상태를 확인한 뒤 트레이에서 종료를 다시 누르세요.', buttons: ['확인'] });
            return false;
        }
    }
}
module.exports = { TrayLifecycle };

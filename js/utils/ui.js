// Chat settings use the shared deck screen and keep their existing module hooks.
class UIManager {
    constructor(app) {
        this.app = app;
        this.currentModule = null;
    }
    updateModuleCard() { window.deck?.update(); }
    openSettings(moduleName) {
        if (moduleName !== 'chat') return;
        return window.deck.run(moduleName);
    }
    closeSettings() { window.deck.goHome(); }
    async saveSettings() {
        if (!this.currentModule || !document.getElementById('chat-settings-form').reportValidity()) return;
        if (this.app.chatBusy) return;
        const previousChannel = this.app.settingsManager.getModuleSettings('chat').channelId;
        this.app.chatBusy = true;
        window.deck.update();
        try {
            await this.app.settingsManager.saveModalSettings(this.currentModule);
            const restart = this.app.chatModule.isActive && previousChannel !== this.app.settingsManager.getModuleSettings('chat').channelId;
            this.showSuccess('채팅 설정을 저장하고 OBS에 반영했습니다.');
            if (restart) await this.app.chatModule.restart();
        } finally { this.app.chatBusy = false; window.deck.update(); }
    }
    getModule(name) { return name === 'chat' ? this.app.chatModule : null; }
    applyTheme() { /* The OBS chat overlay reads its own saved theme. */ }
    applyChatTheme() { window.deck?.registry.get('chat')?.preview.sync(); }
    copyToClipboard() { return window.deck.copyChatUrl(); }
    showError(message) { window.deck?.notify(message, true); }
    showSuccess(message) { window.deck?.notify(message); }
    showInfo(message) { window.deck?.notify(message); }
}

/** Saved chat state is shared through the server; localStorage is migration/cache only. */
class SettingsManager {
    constructor() {
        this.settings = { chat: { ...StreamDeckConfig.DEFAULT_SETTINGS } };
    }
    async request(method, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
            const response = await fetch('/api/chat/settings', { method, cache: 'no-store', signal: controller.signal,
                ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || '채팅 설정을 저장하지 못했습니다.');
            return result;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('채팅 설정 서버가 응답하지 않습니다. 다시 시도해 주세요.');
            throw error;
        } finally { clearTimeout(timer); }
    }
    async loadSettings() {
        let legacy;
        try { legacy = JSON.parse(localStorage.getItem('moduleSettings') || '{}').chat; } catch {}
        if (!legacy) {
            legacy = {};
            for (const [key, storage] of Object.entries(this.storageKeys())) {
                const value = localStorage.getItem(storage);
                if (value !== null) legacy[key] = value;
            }
        }
        this.settings.chat = StreamDeckConfig.migrateSettings(legacy);
        const result = await this.request('GET');
        const saved = result.initialized ? result : await this.request('POST',
            { initialize: true, settings: this.settings.chat });
        this.adopt(saved.settings);
    }
    adopt(settings) {
        this.settings.chat = StreamDeckConfig.validateSettings(settings);
        this.saveSettings();
        this.updateUI();
    }
    saveSettings() {
        localStorage.setItem('moduleSettings', JSON.stringify(this.settings));
        this.saveToLocalStorage(this.settings.chat);
    }
    getModuleSettings(moduleName) { return this.settings[moduleName] || {}; }
    updateModuleSettings(moduleName, newSettings) {
        this.settings[moduleName] = { ...this.settings[moduleName], ...newSettings };
        this.saveSettings();
    }
    updateUI() {
        const element = document.getElementById('chat-url');
        if (element) element.value = window.location.origin + '/chat-overlay.html';
    }
    loadModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        const settings = this.settings.chat;
        const fields = { 'chat-channel-id': settings.channelId, 'chat-max-messages': settings.maxMessages,
            'chat-alignment': settings.alignment, 'chat-fade-time': settings.fadeTime,
            'chat-theme-select': settings.theme, 'chat-max-nickname-length': settings.maxNicknameLength,
            'chat-font-size': settings.fontSize, 'chat-opacity': settings.opacity };
        for (const [id, value] of Object.entries(fields)) {
            const element = document.getElementById(id);
            if (element) element.value = value;
        }
        document.getElementById('chat-fade-mask').checked = settings.fadeMask;
    }
    async saveModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        const value = id => document.getElementById('chat-' + id).value;
        const settings = StreamDeckConfig.validateSettings({ theme: value('theme-select'), channelId: value('channel-id'),
            maxMessages: value('max-messages'), alignment: value('alignment'), fadeTime: value('fade-time'),
            maxNicknameLength: value('max-nickname-length'), fontSize: value('font-size'), opacity: value('opacity'),
            fadeMask: document.getElementById('chat-fade-mask').checked }, this.settings.chat);
        const result = await this.request('POST', settings);
        this.adopt(result.settings);
        return result.settings;
    }
    storageKeys() {
        return { theme: 'chat-theme', channelId: 'chat-channel-id', maxMessages: 'chat-max-messages',
            alignment: 'chat-alignment', fadeTime: 'chat-fade-time', maxNicknameLength: 'chat-max-nickname-length' };
    }
    saveToLocalStorage(settings) {
        for (const [key, storage] of Object.entries(this.storageKeys())) localStorage.setItem(storage, String(settings[key]));
        window.dispatchEvent(new Event('chatSettingsChanged'));
    }
}

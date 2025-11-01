/**
 * 설정 관리자
 */
class SettingsManager {
    constructor() {
        this.settings = {
            chat: {
                theme: 'simple-purple',
                channelId: '',
                platform: 'chzzk',
                maxMessages: 50,
                alignment: 'default',
                fadeTime: 0
            }
        };
    }
    
    loadSettings() {
        const saved = localStorage.getItem('moduleSettings');
        if (!saved) return;
        
        try {
            const savedSettings = JSON.parse(saved);
            this.settings = { ...this.settings, ...savedSettings };
            this.updateUI();
        } catch (error) {
            console.error('설정 로드 실패:', error);
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('moduleSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('설정 저장 실패:', error);
        }
    }
    
    getModuleSettings(moduleName) {
        return this.settings[moduleName] || {};
    }
    
    updateModuleSettings(moduleName, newSettings) {
        if (!this.settings[moduleName]) {
            this.settings[moduleName] = {};
        }
        this.settings[moduleName] = { ...this.settings[moduleName], ...newSettings };
        this.saveSettings();
    }
    
    updateUI() {
        const chatUrlElement = document.getElementById('chat-url');
        if (chatUrlElement) {
            chatUrlElement.value = 'http://localhost:7112/chat-overlay.html';
        }
    }
    
    loadModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        
        const settings = this.settings[moduleName];
        if (!settings) return;
        
        const elements = {
            'chat-channel-id': settings.channelId,
            'chat-platform': settings.platform,
            'chat-max-messages': settings.maxMessages,
            'chat-alignment': settings.alignment,
            'chat-fade-time': settings.fadeTime,
            'chat-theme-select': settings.theme
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });
    }
    
    saveModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        
        const newSettings = {
            theme: this.getElementValue('chat-theme-select'),
            channelId: this.getElementValue('chat-channel-id'),
            platform: this.getElementValue('chat-platform'),
            maxMessages: parseInt(this.getElementValue('chat-max-messages')) || 50,
            alignment: this.getElementValue('chat-alignment'),
            fadeTime: parseInt(this.getElementValue('chat-fade-time')) || 0
        };
        
        this.updateModuleSettings('chat', newSettings);
        this.saveToLocalStorage(newSettings);
        this.updateUI();
    }
    
    getElementValue(id) {
        const element = document.getElementById(id);
        return element ? element.value : '';
    }
    
    saveToLocalStorage(settings) {
        // 채팅 오버레이에서 사용할 수 있도록 개별 localStorage 항목으로 저장
        Object.entries(settings).forEach(([key, value]) => {
            localStorage.setItem(`chat-${key}`, value);
        });
    }
}

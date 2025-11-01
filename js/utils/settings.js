/**
 * 설정 관리자
 */
class SettingsManager {
    constructor() {
        const defaultSettings = window.APP_CONFIG?.DEFAULT_SETTINGS || {
            chat: {
                theme: 'simple-purple',
                channelId: '',
                maxMessages: 50,
                alignment: 'default',
                fadeTime: 0,
                maxNicknameLength: 20
            }
        };
        this.settings = defaultSettings;
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
            // 동적으로 현재 페이지의 origin 사용
            const baseUrl = window.location.origin;
            chatUrlElement.value = `${baseUrl}/chat-overlay.html`;
        }
    }
    
    loadModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        
        const settings = this.settings[moduleName];
        if (!settings) return;
        
        const elements = {
            'chat-channel-id': settings.channelId,
            'chat-max-messages': settings.maxMessages,
            'chat-alignment': settings.alignment,
            'chat-fade-time': settings.fadeTime,
            'chat-theme-select': settings.theme,
            'chat-max-nickname-length': settings.maxNicknameLength || 20
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
        
        const defaultMaxMessages = window.APP_CONFIG?.CHAT?.DEFAULT_MAX_MESSAGES || 50;
        const defaultFadeTime = window.APP_CONFIG?.CHAT?.DEFAULT_FADE_TIME || 0;
        
        const newSettings = {
            theme: this.getElementValue('chat-theme-select'),
            channelId: this.getElementValue('chat-channel-id'),
            maxMessages: parseInt(this.getElementValue('chat-max-messages')) || defaultMaxMessages,
            alignment: this.getElementValue('chat-alignment'),
            fadeTime: parseInt(this.getElementValue('chat-fade-time')) || defaultFadeTime,
            maxNicknameLength: parseInt(this.getElementValue('chat-max-nickname-length')) || 20
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
        // 키 매핑 정의 (정확한 키 이름 보장)
        const keyMapping = {
            'theme': 'chat-theme',
            'channelId': 'chat-channel-id',
            'maxMessages': 'chat-max-messages',
            'alignment': 'chat-alignment',
            'fadeTime': 'chat-fade-time',
            'maxNicknameLength': 'chat-max-nickname-length'
        };
        
        Object.entries(settings).forEach(([key, value]) => {
            // 키 매핑이 있으면 매핑된 키 사용, 없으면 camelCase를 kebab-case로 변환
            const storageKey = keyMapping[key] || `chat-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            localStorage.setItem(storageKey, String(value));
            console.log(`설정 저장: ${storageKey} = ${value}`);
        });
        
        // 설정 변경 이벤트 발생 (다른 탭/창에서도 반영되도록)
        window.dispatchEvent(new Event('chatSettingsChanged'));
        console.log('설정 저장 완료 및 이벤트 발생');
    }
}

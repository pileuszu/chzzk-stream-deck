/**
 * 설정 관리자
 */
class SettingsManager {
    constructor() {
        const defaultSettings = window.APP_CONFIG?.DEFAULT_SETTINGS || {
            chat: {
                theme: 'simple-purple',
                channelId: '',
                maxMessages: 5,
                alignment: 'left',
                fadeTime: 0,
                maxNicknameLength: 5
            }
        };
        this.settings = defaultSettings;
    }
    
    loadSettings() {
        const STORAGE_KEYS = window.APP_CONFIG?.STORAGE_KEYS || {};
        const saved = localStorage.getItem(STORAGE_KEYS.MODULE_SETTINGS || 'moduleSettings');
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
            const STORAGE_KEYS = window.APP_CONFIG?.STORAGE_KEYS || {};
            localStorage.setItem(STORAGE_KEYS.MODULE_SETTINGS || 'moduleSettings', JSON.stringify(this.settings));
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
    
    async loadModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        
        // 서버에서 설정 가져오기 (우선순위 1)
        let serverSettings = null;
        try {
            const response = await fetch('/api/chat/settings');
            const data = await response.json();
            if (data.success && data.settings) {
                serverSettings = data.settings;
                console.log('모달 설정 로드 - 서버에서 설정 로드:', serverSettings);
            }
        } catch (error) {
            console.warn('서버 설정 로드 실패, localStorage 사용:', error);
        }
        
        // localStorage에서 직접 읽기 (폴백)
        // 통일된 키 이름 사용
        const STORAGE_KEYS = window.APP_CONFIG?.STORAGE_KEYS || {};
        const storedSettings = {
            channelId: serverSettings?.channelId || localStorage.getItem(STORAGE_KEYS.CHAT_CHANNEL_ID || 'chat-channel-id') || '',
            maxMessages: serverSettings?.maxMessages != null ? String(serverSettings.maxMessages) : localStorage.getItem(STORAGE_KEYS.CHAT_MAX_MESSAGES || 'chat-max-messages') || '5',
            // 'default'를 'left'로 변환 (하위 호환성)
            alignment: (() => {
                let alignment = serverSettings?.alignment || localStorage.getItem(STORAGE_KEYS.CHAT_ALIGNMENT || 'chat-alignment') || 'left';
                return alignment === 'default' ? 'left' : alignment;
            })(),
            fadeTime: serverSettings?.fadeTime != null ? String(serverSettings.fadeTime) : localStorage.getItem(STORAGE_KEYS.CHAT_FADE_TIME || 'chat-fade-time') || '0',
            theme: serverSettings?.theme || localStorage.getItem(STORAGE_KEYS.CHAT_THEME || 'chat-theme') || 'simple-purple',
            maxNicknameLength: serverSettings?.maxNicknameLength != null ? String(serverSettings.maxNicknameLength) : localStorage.getItem(STORAGE_KEYS.CHAT_MAX_NICKNAME_LENGTH || 'chat-max-nickname-length') || '5'
        };
        
        // 메모리 설정도 업데이트 (동기화)
        if (!this.settings[moduleName]) {
            this.settings[moduleName] = {};
        }
        this.settings[moduleName] = {
            ...this.settings[moduleName],
            channelId: storedSettings.channelId,
            maxMessages: parseInt(storedSettings.maxMessages) || 5,
            alignment: storedSettings.alignment,
            fadeTime: parseInt(storedSettings.fadeTime) || 0,
            theme: storedSettings.theme,
            maxNicknameLength: parseInt(storedSettings.maxNicknameLength) || 5
        };
        
        const elements = {
            'chat-channel-id': storedSettings.channelId,
            'chat-max-messages': storedSettings.maxMessages,
            'chat-alignment': storedSettings.alignment,
            'chat-fade-time': storedSettings.fadeTime,
            'chat-theme-select': storedSettings.theme,
            'chat-max-nickname-length': storedSettings.maxNicknameLength
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });
    }
    
    async saveModalSettings(moduleName) {
        if (moduleName !== 'chat') return;
        
        const defaultMaxMessages = window.APP_CONFIG?.CHAT?.DEFAULT_MAX_MESSAGES || 5;
        const defaultFadeTime = window.APP_CONFIG?.CHAT?.DEFAULT_FADE_TIME || 0;
        const defaultMaxNicknameLength = window.APP_CONFIG?.CHAT?.DEFAULT_MAX_NICKNAME_LENGTH || 5;
        
        // 입력값 가져오기 (직접 DOM 요소에서 읽어서 확인)
        const maxMessagesEl = document.getElementById('chat-max-messages');
        const fadeTimeEl = document.getElementById('chat-fade-time');
        const maxNicknameLengthEl = document.getElementById('chat-max-nickname-length');
        
        const maxMessagesInput = maxMessagesEl ? maxMessagesEl.value : '';
        const fadeTimeInput = fadeTimeEl ? fadeTimeEl.value : '';
        const maxNicknameLengthInput = maxNicknameLengthEl ? maxNicknameLengthEl.value : '';
        
        // 값 파싱 (빈 문자열, null 처리)
        const parseNumber = (value, defaultValue) => {
            if (value === null || value === undefined || value === '') return defaultValue;
            const trimmed = String(value).trim();
            if (trimmed === '') return defaultValue;
            const parsed = parseInt(trimmed, 10);
            return isNaN(parsed) ? defaultValue : parsed;
        };
        
        const parsedMaxMessages = parseNumber(maxMessagesInput, defaultMaxMessages);
        const parsedFadeTime = parseNumber(fadeTimeInput, defaultFadeTime);
        const parsedMaxNicknameLength = parseNumber(maxNicknameLengthInput, defaultMaxNicknameLength);
        
        const newSettings = {
            theme: this.getElementValue('chat-theme-select') || 'simple-purple',
            channelId: this.getElementValue('chat-channel-id') || '',
            maxMessages: parsedMaxMessages,
            // 'default'를 'left'로 변환 (하위 호환성)
            alignment: (() => {
                let alignment = this.getElementValue('chat-alignment') || 'left';
                return alignment === 'default' ? 'left' : alignment;
            })(),
            fadeTime: parsedFadeTime,
            maxNicknameLength: parsedMaxNicknameLength
        };
        
        this.updateModuleSettings('chat', newSettings);
        this.saveToLocalStorage(newSettings);
        
        // 서버에 설정 저장 (오버레이와 공유하기 위해)
        await this.saveToServer(newSettings);
        
        this.updateUI();
    }
    
    getElementValue(id) {
        const element = document.getElementById(id);
        return element ? element.value : '';
    }
    
    saveToLocalStorage(settings) {
        // 채팅 오버레이에서 사용할 수 있도록 개별 localStorage 항목으로 저장
        // 통일된 키 이름 사용 (APP_CONFIG.STORAGE_KEYS)
        const STORAGE_KEYS = window.APP_CONFIG?.STORAGE_KEYS || {};
        const keyMapping = {
            'theme': STORAGE_KEYS.CHAT_THEME || 'chat-theme',
            'channelId': STORAGE_KEYS.CHAT_CHANNEL_ID || 'chat-channel-id',
            'maxMessages': STORAGE_KEYS.CHAT_MAX_MESSAGES || 'chat-max-messages',
            'alignment': STORAGE_KEYS.CHAT_ALIGNMENT || 'chat-alignment',
            'fadeTime': STORAGE_KEYS.CHAT_FADE_TIME || 'chat-fade-time',
            'maxNicknameLength': STORAGE_KEYS.CHAT_MAX_NICKNAME_LENGTH || 'chat-max-nickname-length'
        };
        
        // 각 설정값을 localStorage에 저장
        const savedKeys = [];
        const savedValues = {};
        
        Object.entries(settings).forEach(([key, value]) => {
            // 키 매핑이 있으면 매핑된 키 사용, 없으면 camelCase를 kebab-case로 변환
            const storageKey = keyMapping[key] || `chat-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            // 모든 값을 문자열로 변환 (null, undefined 처리)
            const stringValue = value != null ? String(value) : '';
            
            // localStorage에 저장
            localStorage.setItem(storageKey, stringValue);
            savedKeys.push(storageKey);
            savedValues[storageKey] = stringValue;
        });
        
        // 설정 변경 이벤트 발생 (같은 탭/컨텍스트에서 감지)
        window.dispatchEvent(new Event('chatSettingsChanged'));
        
        // 브로드캐스트 채널을 통한 설정 변경 알림 (다른 창/탭에서 감지)
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                const channel = new BroadcastChannel('chat-settings');
                channel.postMessage({ type: 'settings-changed', settings: savedValues });
                channel.close();
            } catch (e) {
                // BroadcastChannel 미지원 시 무시
            }
        }
    }
    
    /**
     * 서버에 설정 저장 (오버레이와 공유)
     */
    async saveToServer(settings) {
        try {
            const response = await fetch('/api/chat/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.success) {
                console.error('서버 설정 저장 실패:', data.error);
            }
        } catch (error) {
            console.error('서버 설정 저장 오류:', error);
            throw error; // 상위로 에러 전파
        }
    }
}

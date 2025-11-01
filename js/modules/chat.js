/**
 * CHZZK 채팅 모듈
 * 채팅 처리는 백엔드 서버에서 담당
 */
class ChatModule {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        this.isActive = false;
        this.channelId = null;
        this.statusInterval = null;
        
        this.checkInitialStatus();
    }
    
    async checkInitialStatus() {
        try {
            const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
            const statusEndpoint = window.APP_CONFIG?.API?.STATUS || '/api/status';
            const response = await fetch(`${baseUrl}${statusEndpoint}`);
            const result = await response.json();
            
            if (result.success && result.status.chat?.active) {
                this.isActive = true;
                this.updateToggleState(true);
                this.updateUIState(true);
                this.startStatusMonitoring();
                console.log('채팅 모듈이 이미 실행 중입니다.');
            }
        } catch (error) {
            // 서버가 실행되지 않은 경우 무시
        }
    }
    
    async start() {
        const settings = this.settingsManager.getModuleSettings('chat');
        
        if (!settings.channelId) {
            this.showError('CHZZK 채널 ID를 먼저 설정해주세요.');
            return false;
        }
        
        this.channelId = settings.channelId;
        
        try {
            const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
            const startEndpoint = window.APP_CONFIG?.API?.CHAT_START || '/api/chat/start';
            const contentType = window.APP_CONFIG?.HTTP_HEADERS?.CONTENT_TYPE_JSON || 'application/json';
            const response = await fetch(`${baseUrl}${startEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ channelId: this.channelId })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.isActive = true;
                this.startStatusMonitoring();
                console.log('채팅 연결');
                this.showSuccess('채팅 모듈이 터미널에서 시작되었습니다.');
                return true;
            } else {
                throw new Error(result.error || '백엔드 서버 연결 실패');
            }
        } catch (error) {
            console.error('CHZZK 채팅 모듈 시작 실패:', error);
            
            const errorMsg = error.message.includes('fetch')
                ? '백엔드 서버가 실행되지 않았습니다. npm start로 서버를 먼저 시작해주세요.'
                : error.message;
            
            this.showError(`채팅 모듈 시작 실패: ${errorMsg}`);
            return false;
        }
    }
    
    async stop() {
        try {
            const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
            const stopEndpoint = window.APP_CONFIG?.API?.CHAT_STOP || '/api/chat/stop';
            const contentType = window.APP_CONFIG?.HTTP_HEADERS?.CONTENT_TYPE_JSON || 'application/json';
            const response = await fetch(`${baseUrl}${stopEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': contentType }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.isActive = false;
                this.stopStatusMonitoring();
                console.log('채팅 종료');
                this.showSuccess('채팅 모듈이 중지되었습니다.');
            }
        } catch (error) {
            console.error('채팅 모듈 중지 실패:', error);
            this.isActive = false;
        }
    }
    
    async restart() {
        await this.stop();
        const reconnectDelay = window.APP_CONFIG?.CHAT?.RECONNECT_DELAY || 500;
        await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        return await this.start();
    }
    
    startStatusMonitoring() {
        if (this.statusInterval) return;
        
        const checkInterval = window.APP_CONFIG?.CHAT?.STATUS_CHECK_INTERVAL || 5000;
        this.statusInterval = setInterval(async () => {
            try {
                const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
                const statusEndpoint = window.APP_CONFIG?.API?.STATUS || '/api/status';
                const response = await fetch(`${baseUrl}${statusEndpoint}`);
                const result = await response.json();
                
                if (result.success && !result.status.chat?.active && this.isActive) {
                    console.log('채팅 연결 종료');
                    this.isActive = false;
                    this.stopStatusMonitoring();
                    this.updateToggleState(false);
                    this.updateUIState(false);
                    this.showError('채팅 프로세스가 종료되었습니다.');
                }
            } catch (error) {
                // 서버 연결 실패 시 무시
            }
        }, checkInterval);
    }
    
    stopStatusMonitoring() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }
    
    updateToggleState(checked) {
        const toggle = document.getElementById('chat-toggle');
        if (toggle) {
            toggle.checked = checked;
        }
    }
    
    updateUIState(isActive) {
        if (window.app?.uiManager) {
            window.app.uiManager.updateModuleCard('chat', isActive);
        }
    }
    
    showError(message) {
        if (window.app?.uiManager) {
            window.app.uiManager.showError(message);
        } else {
            alert(message);
        }
    }
    
    showSuccess(message) {
        if (window.app?.uiManager) {
            window.app.uiManager.showSuccess(message);
        }
    }
    
    applyTheme(themeName) {
        if (window.app?.uiManager) {
            window.app.uiManager.applyChatTheme(themeName);
        }
    }
}

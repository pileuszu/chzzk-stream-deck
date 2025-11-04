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
        // 서버가 준비될 때까지 재시도 (최대 5초)
        const maxRetries = 10;
        const retryDelay = 500; // 500ms
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
                const statusEndpoint = window.APP_CONFIG?.API?.STATUS || '/api/status';
                
                // 타임아웃을 위한 AbortController 사용
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(`${baseUrl}${statusEndpoint}`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    // 서버가 응답하지 않으면 재시도
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    return;
                }
                
                const result = await response.json();
                
                if (result.success && result.status.chat?.active) {
                    this.isActive = true;
                    this.updateToggleState(true);
                    this.updateUIState(true);
                    this.startStatusMonitoring();
                    console.log('채팅 모듈이 이미 실행 중입니다.');
                }
                return; // 성공하면 종료
            } catch (error) {
                // 연결 거부 또는 네트워크 오류인 경우 재시도
                const isConnectionError = error.name === 'AbortError' || 
                                         error.message.includes('fetch') || 
                                         error.message.includes('Failed to fetch') || 
                                         error.message.includes('ERR_CONNECTION_REFUSED') ||
                                         error.message.includes('NetworkError');
                
                if (isConnectionError && attempt < maxRetries - 1) {
                    // 재시도 전 대기
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                
                // 마지막 시도이거나 다른 오류인 경우 조용히 실패
                console.debug('초기 상태 확인 실패 (정상):', error.message);
                return;
            }
        }
    }
    
    async start() {
        const settings = this.settingsManager.getModuleSettings('chat');
        
        if (!settings.channelId) {
            this.showError('CHZZK 채널 ID를 먼저 설정해주세요.');
            return false;
        }
        
        this.channelId = settings.channelId;
        
        // 서버가 준비될 때까지 대기 (최대 10초)
        const maxRetries = 20;
        const retryDelay = 500; // 500ms
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const baseUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
                const startEndpoint = window.APP_CONFIG?.API?.CHAT_START || '/api/chat/start';
                const contentType = window.APP_CONFIG?.HTTP_HEADERS?.CONTENT_TYPE_JSON || 'application/json';
                
                // 타임아웃을 위한 AbortController 사용
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                const response = await fetch(`${baseUrl}${startEndpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': contentType },
                    body: JSON.stringify({ channelId: this.channelId }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    this.isActive = true;
                    this.startStatusMonitoring();
                    console.log('채팅 연결');
                    this.showSuccess('채팅 모듈이 터미널에서 시작되었습니다.');
                    return true;
                } else {
                    // "이미 실행 중" 오류인 경우 상태 확인 후 재시도
                    if (result.error && result.error.includes('이미 실행 중')) {
                        // 서버 상태를 다시 확인
                        try {
                            const statusUrl = window.APP_CONFIG?.SERVER?.BASE_URL || window.location.origin;
                            const statusEndpoint = window.APP_CONFIG?.API?.STATUS || '/api/status';
                            const statusResponse = await fetch(`${statusUrl}${statusEndpoint}`);
                            const statusResult = await statusResponse.json();
                            
                            if (statusResult.success && statusResult.status.chat?.active) {
                                // 실제로 실행 중이면 상태 업데이트
                                this.isActive = true;
                                this.startStatusMonitoring();
                                this.updateToggleState(true);
                                this.updateUIState(true);
                                console.log('채팅 모듈이 이미 실행 중입니다.');
                                return true;
                            } else {
                                // 실행 중이 아니면 서버 상태 불일치, 재시도
                                console.log('서버 상태 불일치 감지, 재시도...');
                                if (attempt < maxRetries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                                    continue;
                                }
                            }
                        } catch (statusError) {
                            // 상태 확인 실패 시 재시도
                            if (attempt < maxRetries - 1) {
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                                continue;
                            }
                        }
                    }
                    throw new Error(result.error || '채팅 모듈 시작에 실패했습니다.');
                }
            } catch (error) {
                // 연결 거부 또는 네트워크 오류인 경우 재시도
                const isConnectionError = error.name === 'AbortError' || 
                                         error.message.includes('fetch') || 
                                         error.message.includes('Failed to fetch') || 
                                         error.message.includes('ERR_CONNECTION_REFUSED') ||
                                         error.message.includes('NetworkError');
                
                if (isConnectionError && attempt < maxRetries - 1) {
                    // 재시도 전 대기
                    console.log(`서버 연결 시도 ${attempt + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                
                // 마지막 시도이거나 다른 오류인 경우
                console.error('CHZZK 채팅 모듈 시작 실패:', error);
                
                let errorMsg = error.message;
                if (isConnectionError) {
                    errorMsg = '백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요. 잠시 후 다시 시도해주세요.';
                } else if (error.message.includes('HTTP')) {
                    errorMsg = `서버 오류: ${error.message}`;
                }
                
                this.showError(`채팅 모듈 시작 실패: ${errorMsg}`);
                return false;
            }
        }
        
        return false;
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

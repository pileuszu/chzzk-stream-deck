#!/usr/bin/env node

/**
 * CHZZK 채팅 클라이언트
 * 실시간 채팅 메시지를 수신하여 콘솔에 출력합니다.
 * 
 * @author ChzzkStreamDeck
 * @version 2.0.0
 */

let fetch;

/**
 * node-fetch ES Module을 동적으로 로드
 */
async function loadFetch() {
    if (!fetch) {
        fetch = (await import('node-fetch')).default;
    }
    return fetch;
}

const WebSocket = require('ws');

/**
 * CHZZK 채팅 클라이언트 클래스
 */
class ChzzkChatClient {
    constructor(channelId, options = {}) {
        this.channelId = channelId;
        this.chatChannelId = null;
        this.accessToken = null;
        this.websocket = null;
        this.isConnected = false;
        this.heartbeatInterval = null;
        
        // 상수 정의
        this.CONSTANTS = {
            CHZZK_API_BASE: 'https://api.chzzk.naver.com',
            CHAT_API_BASE: 'https://comm-api.game.naver.com',
            WS_SERVER_BASE: 'wss://kr-ss',
            WS_SERVER_MAX: 10,
            WS_SERVER_RETRY_DELAY: 100,
            CHAT_JSON_PREFIX: 'CHAT_JSON:',
            DEFAULT_DEV_TYPE: 2001,
            DEFAULT_AUTH: 'READ',
            WS_CMD: {
                HEARTBEAT: 0,
                AUTH: 100,
                HEARTBEAT_RESPONSE: 10000,
                AUTH_SUCCESS: 10100,
                CHAT_MESSAGE: 93101
            }
        };
        
        // 옵션 설정
        this.options = {
            reconnectAttempts: 3,
            heartbeatInterval: 20000,
            connectionTimeout: 5000,
            verbose: false,
            ...options
        };
        
        // HTTP 요청 헤더
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Referer': 'https://chzzk.naver.com/',
            'Origin': 'https://chzzk.naver.com'
        };
    }

    /**
     * 클라이언트 시작
     */
    async start() {
        try {
            this.log('CHZZK 채팅 클라이언트 시작');
            this.log(`채널 ID: ${this.channelId}`);
            
            // API 호출 단계별 실행
            await this.initializeConnection();
            await this.connectWebSocket();
            
            this.log('채팅 클라이언트 초기화 완료');
            
        } catch (error) {
            this.error(`클라이언트 시작 실패: ${error.message}`);
            throw error;
        }
    }

    /**
     * 연결 초기화 (API 호출)
     */
    async initializeConnection() {
        // 1. 채널 정보 가져오기
        const channelInfo = await this.getChannelInfo();
        if (!channelInfo) {
            throw new Error('채널 정보를 가져올 수 없습니다.');
        }
        
        // 2. 라이브 상태 확인
        const liveStatus = await this.getLiveStatus();
        if (!liveStatus) {
            throw new Error('라이브 상태를 확인할 수 없습니다.');
        }
        
        // 3. 액세스 토큰 가져오기
        const accessToken = await this.getAccessToken();
        if (!accessToken) {
            throw new Error('액세스 토큰을 가져올 수 없습니다.');
        }
    }

    /**
     * 채널 기본 정보 조회
     */
    async getChannelInfo() {
        try {
            const fetchFunction = await loadFetch();
            const url = `${this.CONSTANTS.CHZZK_API_BASE}/service/v1/channels/${this.channelId}`;
            const response = await fetchFunction(url, { headers: this.headers });
            
            if (response.ok) {
                const data = await response.json();
                if (data.code === 200 && data.content) {
                    this.log(`채널 정보: ${data.content.channelName || 'N/A'}`);
                    return data.content;
                }
            }
            
            this.warn('채널 정보 요청 실패');
            return null;
            
        } catch (error) {
            this.warn(`채널 정보 오류: ${error.message}`);
            return null;
        }
    }

    /**
     * 라이브 상태 조회
     */
    async getLiveStatus() {
        try {
            const fetchFunction = await loadFetch();
            const url = `${this.CONSTANTS.CHZZK_API_BASE}/polling/v2/channels/${this.channelId}/live-status`;
            const response = await fetchFunction(url, { headers: this.headers });
            
            if (response.ok) {
                const data = await response.json();
                if (data.code === 200 && data.content) {
                    const content = data.content;
                    this.chatChannelId = content.chatChannelId;
                    this.log(`라이브 상태: ${content.status || content.liveStatus}`);
                    return content;
                }
            }
            
            this.warn('라이브 상태 확인 실패');
            return null;
            
        } catch (error) {
            this.warn(`라이브 상태 오류: ${error.message}`);
            return null;
        }
    }

    /**
     * 채팅 액세스 토큰 조회
     */
    async getAccessToken() {
        if (!this.chatChannelId) {
            this.error('채팅 채널 ID가 없습니다.');
            return null;
        }

        try {
            const fetchFunction = await loadFetch();
            const url = `${this.CONSTANTS.CHAT_API_BASE}/nng_main/v1/chats/access-token?channelId=${this.chatChannelId}&chatType=STREAMING`;
            const response = await fetchFunction(url, { headers: this.headers });
            
            if (response.ok) {
                const data = await response.json();
                if (data.code === 200 && data.content) {
                    this.accessToken = data.content.accessToken;
                    this.log('액세스 토큰 획득 완료');
                    return data.content;
                }
            }
            
            this.warn('액세스 토큰 요청 실패');
            return null;
            
        } catch (error) {
            this.warn(`액세스 토큰 오류: ${error.message}`);
            return null;
        }
    }

    /**
     * WebSocket 연결
     */
    async connectWebSocket() {
        this.log('WebSocket 연결 시도...');
        
        if (!this.accessToken || !this.chatChannelId) {
            throw new Error('연결에 필요한 정보가 부족합니다.');
        }

        // kr-ss1 ~ kr-ss10 서버 순차 시도
        const maxServers = this.CONSTANTS.WS_SERVER_MAX;
        for (let serverNum = 1; serverNum <= maxServers; serverNum++) {
            const wsUrl = `${this.CONSTANTS.WS_SERVER_BASE}${serverNum}.chat.naver.com/chat?channelId=${this.chatChannelId}&accessToken=${this.accessToken}`;
            
            try {
                this.verbose(`WebSocket 서버 시도 ${serverNum}/${maxServers}: kr-ss${serverNum}`);
                
                if (await this.tryConnectToServer(wsUrl, serverNum)) {
                    return; // 연결 성공 시 종료
                }
                
            } catch (error) {
                this.verbose(`kr-ss${serverNum} 연결 실패: ${error.message}`);
                
                // 다음 서버 시도 전 정리
                this.cleanupWebSocket();
                
                if (serverNum < maxServers) {
                    await this.sleep(this.CONSTANTS.WS_SERVER_RETRY_DELAY);
                }
            }
        }
        
        throw new Error('모든 WebSocket 서버 연결 실패');
    }

    /**
     * 특정 서버로 WebSocket 연결 시도
     */
    async tryConnectToServer(wsUrl, serverNum) {
        return new Promise((resolve, reject) => {
            this.websocket = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                reject(new Error('연결 타임아웃'));
            }, this.options.connectionTimeout);
            
            this.websocket.on('open', () => {
                clearTimeout(timeout);
                this.log(`WebSocket 연결 성공: kr-ss${serverNum}`);
                this.isConnected = true;
                
                this.setupWebSocketHandlers();
                this.authenticateChat();
                this.startHeartbeat();
                
                resolve(true);
            });
            
            this.websocket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * WebSocket 이벤트 핸들러 설정
     */
    setupWebSocketHandlers() {
        this.websocket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                this.warn(`메시지 파싱 실패: ${error.message}`);
            }
        });
        
        this.websocket.on('error', (error) => {
            this.error(`WebSocket 오류: ${error.message}`);
        });
        
        this.websocket.on('close', (code, reason) => {
            if (this.isConnected) {
                this.log(`WebSocket 연결 종료: ${code} - ${reason}`);
                this.isConnected = false;
                this.stopHeartbeat();
            }
        });
    }

    /**
     * 채팅 인증
     */
    authenticateChat() {
        const authMessage = {
            ver: "2",
            cmd: this.CONSTANTS.WS_CMD.AUTH,
            svcid: "game",
            cid: this.chatChannelId,
            bdy: {
                uid: null,
                devType: this.CONSTANTS.DEFAULT_DEV_TYPE,
                accTkn: this.accessToken,
                auth: this.CONSTANTS.DEFAULT_AUTH
            },
            tid: 1
        };
        
        this.websocket.send(JSON.stringify(authMessage));
        this.log('채팅 인증 요청 전송');
    }

    /**
     * 하트비트 시작
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const heartbeatMessage = { 
                    ver: "2", 
                    cmd: this.CONSTANTS.WS_CMD.HEARTBEAT 
                };
                this.websocket.send(JSON.stringify(heartbeatMessage));
                this.verbose('하트비트 전송');
            }
        }, this.options.heartbeatInterval);
    }

    /**
     * 하트비트 중지
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * WebSocket 정리
     */
    cleanupWebSocket() {
        if (this.websocket) {
            this.websocket.removeAllListeners();
            if (this.websocket.readyState === WebSocket.OPEN || 
                this.websocket.readyState === WebSocket.CONNECTING) {
                this.websocket.close();
            }
            this.websocket = null;
        }
    }

    /**
     * 메시지 처리
     */
    handleMessage(message) {
        const { WS_CMD } = this.CONSTANTS;
        
        switch (message.cmd) {
            case WS_CMD.HEARTBEAT:
                // 서버 하트비트 요청 - 응답 필요
                const response = { ver: "2", cmd: WS_CMD.HEARTBEAT_RESPONSE };
                this.websocket.send(JSON.stringify(response));
                break;
                
            case WS_CMD.AUTH_SUCCESS:
                // 인증 완료
                this.log('채팅 연결 완료');
                break;
                
            case WS_CMD.CHAT_MESSAGE:
                // 채팅 메시지
                this.handleChatMessage(message);
                break;
                
            default:
                // 알 수 없는 명령 코드 (무시)
                break;
        }
    }

    /**
     * 채팅 메시지 처리
     */
    handleChatMessage(message) {
        if (!message.bdy || !Array.isArray(message.bdy) || message.bdy.length === 0) {
            return;
        }

        for (const chatData of message.bdy) {
            try {
                const nickname = this.extractNickname(chatData);
                const content = chatData.msg || chatData.content || '';
                
                if (content.trim()) {
                    // 이모티콘 정보 추출
                    const emoticons = this.extractEmoticons(chatData);
                    
                    if (emoticons && Object.keys(emoticons).length > 0) {
                        // 이모티콘이 있는 경우 JSON 형태로 출력
                        const messageData = {
                            username: nickname,
                            message: content,
                            extras: { emojis: emoticons }
                        };
                        console.log(`${this.CONSTANTS.CHAT_JSON_PREFIX}${JSON.stringify(messageData)}`);
                    } else {
                        // 기존 형태로 출력
                        console.log(`[${nickname}]: ${content}`);
                    }
                }
                
            } catch (error) {

            }
        }
    }

    /**
     * 이모티콘 정보 추출
     */
    extractEmoticons(chatData) {
        try {
            if (chatData.extras) {
                let extras = {};
                
                if (typeof chatData.extras === 'string') {
                    extras = JSON.parse(chatData.extras);
                } else if (typeof chatData.extras === 'object') {
                    extras = chatData.extras;
                }
                
                if (extras.emojis && typeof extras.emojis === 'object') {
                    return extras.emojis;
                }
            }
            
            return null;
            
        } catch (error) {

            return null;
        }
    }

    /**
     * 닉네임 추출
     */
    extractNickname(chatData) {
        try {
            let profile = {};
            
            if (typeof chatData.profile === 'string') {
                profile = JSON.parse(chatData.profile);
            } else if (typeof chatData.profile === 'object') {
                profile = chatData.profile || {};
            }
            
            return profile.nickname || '익명';
            
        } catch (error) {
            return '익명';
        }
    }

    /**
     * 연결 종료
     */
    disconnect() {
        this.stopHeartbeat();
        this.cleanupWebSocket();
        this.isConnected = false;
    }

    /**
     * 상태 조회
     */
    getStatus() {
        return {
            connected: this.isConnected,
            channelId: this.channelId,
            chatChannelId: this.chatChannelId,
            hasAccessToken: !!this.accessToken
        };
    }

    // 로깅 메서드들
    log(message) { console.log(message); }
    error(message) { console.error(message); }
    warn(message) { console.log(message); }
    verbose(message) { if (this.options.verbose) console.log(message); }
    
    // 유틸리티 메서드
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

// 명령행에서 직접 실행하는 경우
if (require.main === module) {
    const channelId = process.argv[2];
    const verbose = process.argv.includes('--verbose');
    
    if (!channelId) {
        console.error('채널 ID가 필요합니다.');
        console.error('사용법: node src/chat-client.js <channelId> [--verbose]');
        process.exit(1);
    }
    
    const client = new ChzzkChatClient(channelId, { verbose });
    
    // 프로세스 종료 시 정리
    process.on('SIGINT', () => {
        client.disconnect();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        client.disconnect();
        process.exit(0);
    });
    
    // 클라이언트 시작
    client.start().catch(error => {
        console.error(`시작 실패: ${error.message}`);
        process.exit(1);
    });
}

module.exports = ChzzkChatClient; 
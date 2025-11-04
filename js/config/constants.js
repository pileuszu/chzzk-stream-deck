/**
 * 애플리케이션 상수 정의
 */
(function() {
    'use strict';
    
    // 서버 설정 (동적으로 로드)
    let SERVER_CONFIG = {
        PORT: 7112,
        HOST: 'localhost',
        get BASE_URL() {
            return `http://${this.HOST}:${this.PORT}`;
        },
        get CHAT_OVERLAY_URL() {
            return `${this.BASE_URL}/chat-overlay.html`;
        }
    };
    
    // 서버 설정을 동적으로 로드
    function loadServerConfig() {
        // 현재 페이지의 포트를 사용하거나, API에서 가져오기
        const currentPort = window.location.port || '7112';
        const currentHost = window.location.hostname || 'localhost';
        
        // API에서 설정 가져오기 시도
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.config) {
                    SERVER_CONFIG.PORT = data.config.port;
                    SERVER_CONFIG.HOST = data.config.host;
                } else {
                    // API 실패 시 현재 페이지의 포트 사용
                    SERVER_CONFIG.PORT = parseInt(currentPort) || 7112;
                    SERVER_CONFIG.HOST = currentHost;
                }
            })
            .catch(() => {
                // API 호출 실패 시 현재 페이지의 포트 사용
                SERVER_CONFIG.PORT = parseInt(currentPort) || 7112;
                SERVER_CONFIG.HOST = currentHost;
            });
    }
    
    // DOM 로드 후 설정 로드
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadServerConfig);
    } else {
        loadServerConfig();
    }

    // API 엔드포인트
    const API_ENDPOINTS = {
        STATUS: '/api/status',
        CHAT_START: '/api/chat/start',
        CHAT_STOP: '/api/chat/stop',
        CHAT_MESSAGES: '/api/chat/messages',
        CHAT_STREAM: '/api/chat/stream'
    };

    // 채팅 설정
    const CHAT_CONFIG = {
        DEFAULT_MAX_MESSAGES: 5,
        MIN_MESSAGES: 10,
        MAX_MESSAGES: 100,
        DEFAULT_FADE_TIME: 0,
        MAX_FADE_TIME: 300,
        DEFAULT_MAX_NICKNAME_LENGTH: 5,
        STATUS_CHECK_INTERVAL: 5000, // ms
        RECONNECT_DELAY: 500, // ms
        PROCESS_START_WAIT_TIME: 2000, // ms
        WEBSOCKET_SERVER_RETRY_DELAY: 100 // ms
    };

    // WebSocket 설정
    const WEBSOCKET_CONFIG = {
        MAX_SERVERS: 10,
        HEARTBEAT_INTERVAL: 20000, // ms
        CONNECTION_TIMEOUT: 5000, // ms
        RECONNECT_ATTEMPTS: 3
    };

    // SSE 설정
    const SSE_CONFIG = {
        MAX_RECENT_MESSAGES: 10,
        DEFAULT_MESSAGE_LIMIT: 20
    };

    // 메시지 타입
    const MESSAGE_TYPES = {
        CHAT: 'chat',
        SYSTEM: 'system',
        ERROR: 'error'
    };

    // HTTP 헤더
    const HTTP_HEADERS = {
        USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ACCEPT: 'application/json, text/plain, */*',
        ACCEPT_LANGUAGE: 'ko-KR,ko;q=0.9,en;q=0.8',
        REFERER: 'https://chzzk.naver.com/',
        ORIGIN: 'https://chzzk.naver.com',
        CONTENT_TYPE_JSON: 'application/json'
    };

    // CHZZK API 엔드포인트
    const CHZZK_API = {
        BASE_URL: 'https://api.chzzk.naver.com',
        CHANNEL_INFO: (channelId) => `/service/v1/channels/${channelId}`,
        LIVE_STATUS: (channelId) => `/polling/v2/channels/${channelId}/live-status`,
        CHAT_ACCESS_TOKEN: 'https://comm-api.game.naver.com/nng_main/v1/chats/access-token'
    };

    // WebSocket 명령 코드
    const WS_COMMANDS = {
        HEARTBEAT: 0,
        AUTH: 100,
        HEARTBEAT_RESPONSE: 10000,
        AUTH_SUCCESS: 10100,
        CHAT_MESSAGE: 93101
    };

    // localStorage 키 이름 (통일된 키 이름 사용)
    const STORAGE_KEYS = {
        MODULE_SETTINGS: 'moduleSettings',
        CHAT_THEME: 'chat-theme',
        CHAT_CHANNEL_ID: 'chat-channel-id',
        CHAT_MAX_MESSAGES: 'chat-max-messages',
        CHAT_ALIGNMENT: 'chat-alignment',
        CHAT_FADE_TIME: 'chat-fade-time',
        CHAT_MAX_NICKNAME_LENGTH: 'chat-max-nickname-length',
        SERVER_URL: 'serverUrl',
        DARK_MODE: 'dark-mode'
    };

    // 기본 설정값
    const DEFAULT_SETTINGS = {
        chat: {
            theme: 'simple-purple',
            channelId: '',
            platform: 'chzzk',
            maxMessages: CHAT_CONFIG.DEFAULT_MAX_MESSAGES,
            alignment: 'default',
            fadeTime: CHAT_CONFIG.DEFAULT_FADE_TIME,
            maxNicknameLength: CHAT_CONFIG.DEFAULT_MAX_NICKNAME_LENGTH
        }
    };

    // 전역 객체로 노출
    window.APP_CONFIG = {
        SERVER: SERVER_CONFIG,
        API: API_ENDPOINTS,
        CHAT: CHAT_CONFIG,
        WEBSOCKET: WEBSOCKET_CONFIG,
        SSE: SSE_CONFIG,
        MESSAGE_TYPES: MESSAGE_TYPES,
        HTTP_HEADERS: HTTP_HEADERS,
        CHZZK_API: CHZZK_API,
        WS_COMMANDS: WS_COMMANDS,
        STORAGE_KEYS: STORAGE_KEYS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS
    };
})();


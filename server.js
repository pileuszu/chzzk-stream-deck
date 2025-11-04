/**
 * ChzzkStreamDeck OBS 위젯 서버
 * 
 * @description 채팅 위젯을 위한 백엔드 서버
 * @author ChzzkStreamDeck
 * @version 2.0.0
 */

// Windows 콘솔 인코딩 설정 (한글 출력 깨짐 방지)
if (process.platform === 'win32') {
    try {
        const { execSync } = require('child_process');
        execSync('chcp 65001 >nul 2>&1', { stdio: 'ignore' });
        // stdout 인코딩 설정
        if (process.stdout.setDefaultEncoding) {
            process.stdout.setDefaultEncoding('utf8');
        }
        if (process.stderr.setDefaultEncoding) {
            process.stderr.setDefaultEncoding('utf8');
        }
    } catch (e) {
        // 설정 실패 시 무시
    }
}

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// 설정 파일 로드
function loadConfig() {
    try {
        let configPath;
        
        // 먼저 __dirname에서 찾기 (개발 모드 및 일반 Node.js 실행)
        const devConfigPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(devConfigPath)) {
            configPath = devConfigPath;
            console.log(`[설정] __dirname에서 발견: ${configPath}`);
        } else {
            // Electron 앱이 패키징된 경우 실행 파일 위치에서 찾기
            if (process.resourcesPath) {
                try {
                    const { app } = require('electron');
                    if (app && app.isPackaged) {
                        // 프로덕션 모드: 실행 파일과 같은 위치의 config.json 우선
                        const execPath = app.getPath('exe');
                        const execDir = path.dirname(execPath);
                        const execConfigPath = path.join(execDir, 'config.json');
                        
                        if (fs.existsSync(execConfigPath)) {
                            configPath = execConfigPath;
                            console.log(`[설정] 실행 파일 위치에서 발견: ${configPath}`);
                        } else {
                            // 없으면 extraResources로 복사된 config.json 사용
                            const resourcesConfigPath = path.join(process.resourcesPath, 'config.json');
                            if (fs.existsSync(resourcesConfigPath)) {
                                configPath = resourcesConfigPath;
                                console.log(`[설정] resourcesPath에서 발견: ${configPath}`);
                            }
                        }
                    }
                } catch (e) {
                    // Electron이 없는 경우 무시
                }
            }
        }
        
        // 여전히 configPath가 없으면 __dirname 사용 (기본값)
        if (!configPath) {
            configPath = path.join(__dirname, 'config.json');
            console.log(`[설정] 기본 경로 시도: ${configPath}`);
        }
        
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            console.log(`✓ 설정 파일 로드 완료: ${configPath}`, config);
            return config;
        } else {
            console.warn(`경고: ${configPath} 파일이 없습니다. 기본값을 사용합니다.`);
        }
    } catch (error) {
        console.warn('config.json 파일을 읽을 수 없습니다. 기본값을 사용합니다.', error.message);
    }
    // 기본값 반환
    const defaultConfig = {
        port: 7112,
        host: 'localhost'
    };
    console.log(`[설정] 기본값 사용:`, defaultConfig);
    return defaultConfig;
}

const config = loadConfig();

class ChzzkStreamDeckServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || config.port;
        this.host = config.host;
        
        // 상수 정의
        this.CONFIG = {
            MAX_MESSAGES: 50,
            RECENT_MESSAGES_COUNT: 10,
            PROCESS_START_WAIT_TIME: 2000, // ms
            CHAT_PORT: 8002
        };
        
        // 프로세스 관리
        this.processes = {
            chat: null
        };
        
        // 상태 관리
        this.status = {
            chat: { active: false, port: this.CONFIG.CHAT_PORT, pid: null }
        };
        
        // 채팅 메시지 저장소
        this.chatMessages = [];
        this.maxMessages = this.CONFIG.MAX_MESSAGES;
        
        // 채팅 설정 저장소 (서버 메모리에 저장 - 모든 클라이언트가 공유)
        this.chatSettings = {
            theme: 'simple-purple',
            channelId: '',
            maxMessages: 5,
            alignment: 'left',
            fadeTime: 0,
            maxNicknameLength: 5
        };
        
        // SSE 연결 관리
        this.sseConnections = new Set();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupProcessHandlers();
        this.setupConfigEndpoint();
    }
    
    /**
     * 설정 엔드포인트 (프론트엔드에서 포트 정보 가져오기)
     */
    setupConfigEndpoint() {
        this.app.get('/api/config', (req, res) => {
            res.json({
                success: true,
                config: {
                    port: this.port,
                    host: this.host,
                    baseUrl: `http://${this.host}:${this.port}`,
                    chatOverlayUrl: `http://${this.host}:${this.port}/chat-overlay.html`
                }
            });
        });
    }

    /**
     * 미들웨어 설정
     */
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // 정적 파일 서빙 경로 설정 (빌드 환경에 맞게)
        let staticPath = __dirname;
        
        // Electron 패키징된 경우 resources/app 경로 사용
        // process.resourcesPath는 패키징된 앱에서만 존재
        if (process.resourcesPath) {
            staticPath = path.join(process.resourcesPath, 'app');
            console.log(`[빌드 모드] process.resourcesPath: ${process.resourcesPath}`);
        }
        
        console.log(`[정적 파일] __dirname: ${__dirname}`);
        console.log(`[정적 파일] staticPath: ${staticPath}`);
        
        // 경로 존재 여부 확인 후 정적 파일 서빙
        if (fs.existsSync(staticPath)) {
            this.app.use(express.static(staticPath));
            console.log(`✓ 정적 파일 경로 설정 완료: ${staticPath}`);
        } else {
            // 폴백: __dirname 사용
            console.warn(`경고: ${staticPath} 경로가 존재하지 않습니다. __dirname 사용: ${__dirname}`);
            this.app.use(express.static(__dirname));
        }
    }

    /**
     * 라우트 설정
     */
    setupRoutes() {
        // 정적 파일 경로와 동일한 기준으로 index.html 경로 결정
        let staticPath = __dirname;
        if (process.resourcesPath) {
            staticPath = path.join(process.resourcesPath, 'app');
        }
        
        console.log(`[라우트] staticPath: ${staticPath}`);
        
        // 홈 페이지
        this.app.get('/', (req, res) => {
            const indexPath = path.join(staticPath, 'index.html');
            console.log(`[라우트] index.html 요청, 경로: ${indexPath}`);
            
            if (fs.existsSync(indexPath)) {
                console.log(`✓ index.html 파일 발견: ${indexPath}`);
                res.sendFile(indexPath);
            } else {
                // 폴백: __dirname 사용
                const fallbackPath = path.join(__dirname, 'index.html');
                console.warn(`경고: ${indexPath} 파일이 없습니다. 폴백 사용: ${fallbackPath}`);
                if (fs.existsSync(fallbackPath)) {
                    res.sendFile(fallbackPath);
                } else {
                    res.status(404).send('index.html 파일을 찾을 수 없습니다.');
                }
            }
        });



        // 채팅 오버레이 페이지
        this.app.get('/chat-overlay.html', (req, res) => {
            const overlayPath = path.join(staticPath, 'src', 'chat-overlay.html');
            console.log(`[라우트] chat-overlay.html 요청, 경로: ${overlayPath}`);
            
            if (fs.existsSync(overlayPath)) {
                res.sendFile(overlayPath);
            } else {
                // 폴백: __dirname 사용
                const fallbackPath = path.join(__dirname, 'src', 'chat-overlay.html');
                console.warn(`경고: ${overlayPath} 파일이 없습니다. 폴백 사용: ${fallbackPath}`);
                if (fs.existsSync(fallbackPath)) {
                    res.sendFile(fallbackPath);
                } else {
                    res.status(404).send('chat-overlay.html 파일을 찾을 수 없습니다.');
                }
            }
        });

        // SSE 스트림 엔드포인트
        this.app.get('/api/chat/stream', (req, res) => this.handleChatStream(req, res));
        
        // 채팅 메시지 조회
        this.app.get('/api/chat/messages', (req, res) => this.getChatMessages(req, res));
        
        // 채팅 설정 조회/저장 (와일드카드 라우트보다 먼저 등록해야 함)
        this.app.get('/api/chat/settings', (req, res) => this.getChatSettings(req, res));
        this.app.post('/api/chat/settings', (req, res) => this.saveChatSettings(req, res));
        
        // 채팅 모듈 제어 (와일드카드 라우트는 마지막에)
        this.app.post('/api/chat/:action', (req, res) => this.handleChatAction(req, res));
        
        // 상태 조회
        this.app.get('/api/status', (req, res) => this.getStatus(req, res));
    }

    /**
     * 채팅 스트림 처리 (SSE)
     */
    handleChatStream(req, res) {
        // SSE 헤더 설정
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // 연결 추가
        this.sseConnections.add(res);
        
        // 기존 메시지 전송 (최근 메시지)
        const recentMessages = this.chatMessages.slice(-this.CONFIG.RECENT_MESSAGES_COUNT);
        recentMessages.forEach(message => {
            this.sendSSEMessage(res, message);
        });
        
        // 연결 종료 시 정리
        req.on('close', () => {
            this.sseConnections.delete(res);
        });
        
        req.on('aborted', () => {
            this.sseConnections.delete(res);
        });
    }

    /**
     * 채팅 메시지 조회
     */
    getChatMessages(req, res) {
        const limit = parseInt(req.query.limit) || 20;
        const messages = this.chatMessages.slice(-limit);
        
        res.json({ 
            success: true, 
            messages,
            total: this.chatMessages.length
        });
    }

    /**
     * 채팅 액션 처리
     */
    async handleChatAction(req, res) {
        const action = req.params.action;
        const { channelId } = req.body;
        
        try {
            if (action === 'start') {
                await this.startChatModule(channelId);
                res.json({ 
                    success: true, 
                    message: '채팅 모듈이 시작되었습니다.',
                    pid: this.processes.chat?.pid
                });
                
            } else if (action === 'stop') {
                this.stopChatModule();
                res.json({ 
                    success: true, 
                    message: '채팅 모듈이 중지되었습니다.' 
                });
                
            } else {
                res.json({ 
                    success: false, 
                    error: '지원하지 않는 액션입니다.' 
                });
            }
            
        } catch (error) {
            console.error('채팅 액션 오류:', error);
            res.json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * 채팅 모듈 시작
     */
    async startChatModule(channelId) {
        if (this.processes.chat) {
            throw new Error('채팅 모듈이 이미 실행 중입니다.');
        }
        
        if (!channelId) {
            throw new Error('채널 ID가 필요합니다.');
        }
        
        console.log(`채팅 모듈 시작 - 채널: ${channelId.substring(0, 8)}...`);
        
        // 채팅 클라이언트 실행 경로 설정
        let chatClientPath = path.join(__dirname, 'src', 'chat-client.js');
        
        // 빌드된 앱에서는 process.resourcesPath 사용
        if (process.resourcesPath) {
            const resourcesClientPath = path.join(process.resourcesPath, 'app', 'src', 'chat-client.js');
            if (fs.existsSync(resourcesClientPath)) {
                chatClientPath = resourcesClientPath;
                console.log(`[빌드 모드] 채팅 클라이언트 경로: ${chatClientPath}`);
            }
        }
        
        // 작업 디렉토리 설정
        let cwd = __dirname;
        if (process.resourcesPath) {
            const resourcesAppPath = path.join(process.resourcesPath, 'app');
            if (fs.existsSync(resourcesAppPath)) {
                cwd = resourcesAppPath;
            }
        }
        
        console.log(`채팅 클라이언트 실행: node ${chatClientPath}`);
        console.log(`작업 디렉토리: ${cwd}`);
        
        // 채팅 클라이언트 실행
        const chatProcess = spawn('node', [chatClientPath, channelId], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: cwd
        });
        
        this.processes.chat = chatProcess;
        this.status.chat.active = true;
        this.status.chat.pid = chatProcess.pid;
        
        // 프로세스 출력 처리
        chatProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            
            // 채팅 메시지 파싱 및 브로드캐스트
            this.parseChatMessage(output);
        });
        
        chatProcess.stderr.on('data', (data) => {
            console.error(`채팅 오류: ${data.toString().trim()}`);
        });
        
        chatProcess.on('close', (code) => {
            if (code !== 0) {
                console.log(`채팅 모듈 종료 - 코드: ${code}`);
            }
            this.processes.chat = null;
            this.status.chat.active = false;
            this.status.chat.pid = null;
        });
        
        // 프로세스 시작 확인
        await this.sleep(this.CONFIG.PROCESS_START_WAIT_TIME);
        
        if (!this.processes.chat || this.processes.chat.killed) {
            throw new Error('채팅 모듈 시작에 실패했습니다.');
        }
    }

    /**
     * 채팅 모듈 중지
     */
    stopChatModule() {
        if (!this.processes.chat) {
            throw new Error('실행 중인 채팅 모듈이 없습니다.');
        }
        
        console.log('채팅 모듈 중지');
        
        this.processes.chat.kill('SIGTERM');
        this.processes.chat = null;
        this.status.chat.active = false;
        this.status.chat.pid = null;
    }

    /**
     * 채팅 메시지 파싱
     */
    parseChatMessage(output) {
        try {
            const CHAT_JSON_PREFIX = 'CHAT_JSON:';
            
            // JSON 형태의 메시지 (이모티콘 포함) 확인
            if (output.startsWith(CHAT_JSON_PREFIX)) {
                const jsonData = output.substring(CHAT_JSON_PREFIX.length);
                const chatData = JSON.parse(jsonData);
                
                const message = this.createChatMessage({
                    username: chatData.username,
                    message: chatData.message,
                    extras: chatData.extras
                });
                
                this.processChatMessage(message);
                return;
            }
            
            // 기존 형태: [닉네임]: 메시지 내용
            const chatMatch = output.match(/\[([^\]]+)\]: (.+)/);
            
            if (chatMatch) {
                const message = this.createChatMessage({
                    username: chatMatch[1],
                    message: chatMatch[2]
                });
                
                this.processChatMessage(message);
            }
        } catch (error) {
            console.error('채팅 메시지 파싱 오류:', error);
        }
    }

    /**
     * 채팅 메시지 객체 생성
     */
    createChatMessage(data) {
        return {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            username: data.username,
            message: data.message,
            extras: data.extras,
            type: 'chat'
        };
    }

    /**
     * 채팅 메시지 처리 (저장 및 브로드캐스트)
     */
    processChatMessage(message) {
        this.addChatMessage(message);
        this.broadcastMessage(message);
    }

    /**
     * 채팅 메시지 추가
     */
    addChatMessage(message) {
        this.chatMessages.push(message);
        
        // 최대 메시지 수 유지
        if (this.chatMessages.length > this.maxMessages) {
            this.chatMessages.shift();
        }
    }

    /**
     * 모든 SSE 연결에 메시지 브로드캐스트
     */
    broadcastMessage(message) {
        const data = JSON.stringify(message);
        
        this.sseConnections.forEach(connection => {
            this.sendSSEMessage(connection, message);
        });
    }

    /**
     * SSE 메시지 전송
     */
    sendSSEMessage(connection, message) {
        try {
            const data = JSON.stringify(message);
            connection.write(`data: ${data}\n\n`);
        } catch (error) {
            console.error('SSE 전송 오류:', error);
            this.sseConnections.delete(connection);
        }
    }


    /**
     * 상태 조회
     */
    getStatus(req, res) {
        res.json({ 
            success: true, 
            status: {
                chat: {
                    active: this.status.chat.active,
                    pid: this.status.chat.pid,
                    port: this.status.chat.port,
                    messageCount: this.chatMessages.length
                },
                server: {
                    port: this.port,
                    sseConnections: this.sseConnections.size
                }
            }
        });
    }

    /**
     * 프로세스 핸들러 설정
     */
    setupProcessHandlers() {
        // 서버 종료 시 정리
        process.on('SIGINT', () => {
            this.shutdown();
        });

        process.on('SIGTERM', () => {
            this.shutdown();
        });
    }

    /**
     * 서버 시작
     * 주의: Electron에서 직접 listen을 호출하지 않고, main.js에서 관리합니다.
     */
    start() {
        // 이미 시작된 경우 중복 호출 방지
        if (this.serverInstance) {
            console.log('서버가 이미 시작되었습니다.');
            return;
        }
        
        // 기본 start() 메서드는 Electron에서 직접 listen을 호출하지 않음
        // main.js에서 serverInstance를 직접 관리
        console.log('서버 인스턴스 준비 완료 (main.js에서 listen 호출 예정)');
    }

    /**
     * 채팅 설정 조회
     */
    getChatSettings(req, res) {
        try {
            res.json({
                success: true,
                settings: this.chatSettings
            });
        } catch (error) {
            console.error('설정 조회 오류:', error);
            res.status(500).json({
                success: false,
                error: '설정 조회 실패'
            });
        }
    }

    /**
     * 채팅 설정 저장
     */
    saveChatSettings(req, res) {
        try {
            const { theme, channelId, maxMessages, alignment, fadeTime, maxNicknameLength } = req.body;
            
            // 설정 업데이트 (유효한 값만 업데이트)
            if (theme !== undefined && theme !== null) {
                this.chatSettings.theme = theme;
            }
            if (channelId !== undefined && channelId !== null) {
                this.chatSettings.channelId = channelId;
            }
            if (maxMessages !== undefined && maxMessages !== null) {
                const parsed = parseInt(maxMessages);
                this.chatSettings.maxMessages = isNaN(parsed) ? 5 : parsed;
            }
            if (alignment !== undefined && alignment !== null) {
                // 'default'를 'left'로 변환 (하위 호환성)
                this.chatSettings.alignment = alignment === 'default' ? 'left' : alignment;
            }
            if (fadeTime !== undefined && fadeTime !== null) {
                const parsed = parseInt(fadeTime);
                this.chatSettings.fadeTime = isNaN(parsed) ? 0 : parsed;
            }
            if (maxNicknameLength !== undefined && maxNicknameLength !== null) {
                const parsed = parseInt(maxNicknameLength);
                this.chatSettings.maxNicknameLength = isNaN(parsed) ? 5 : parsed;
            }
            
            res.json({
                success: true,
                settings: this.chatSettings
            });
        } catch (error) {
            console.error('설정 저장 오류:', error);
            res.status(500).json({
                success: false,
                error: '설정 저장 실패'
            });
        }
    }

    /**
     * 시작 정보 출력
     */
    printStartupInfo() {
        console.log(`ChzzkStreamDeck 서버 시작 (포트: ${this.port})`);
        console.log(`대시보드: http://${this.host}:${this.port}`);
        console.log(`채팅 오버레이: http://${this.host}:${this.port}/chat-overlay.html`);
    }

    /**
     * 서버 종료
     */
    shutdown() {
        console.log('서버 종료 중...');
        
        // 서버 인스턴스 종료
        if (this.serverInstance) {
            this.serverInstance.close(() => {
                console.log('서버 인스턴스 종료 완료');
            });
        }
        
        // 모든 프로세스 정리
        if (this.processes.chat) {
            this.processes.chat.kill('SIGTERM');
        }
        
        // SSE 연결 정리
        this.sseConnections.forEach(connection => {
            try {
                connection.end();
            } catch (error) {
                // 무시
            }
        });
    }

    // 유틸리티 메서드
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 서버 인스턴스 생성 및 시작 (직접 실행 시에만)
if (require.main === module) {
    const server = new ChzzkStreamDeckServer();
    server.start();
}

// Electron에서 사용할 수 있도록 export
module.exports = ChzzkStreamDeckServer; 
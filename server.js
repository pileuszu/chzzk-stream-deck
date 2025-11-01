/**
 * ChzzkStreamDeck OBS 위젯 서버
 * 
 * @description 채팅 위젯을 위한 백엔드 서버
 * @author ChzzkStreamDeck
 * @version 2.0.0
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// 설정 파일 로드
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    } catch (error) {
        console.warn('config.json 파일을 읽을 수 없습니다. 기본값을 사용합니다.', error.message);
    }
    // 기본값 반환
    return {
        port: 7112,
        host: 'localhost'
    };
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
        this.app.use(express.static('.'));
    }

    /**
     * 라우트 설정
     */
    setupRoutes() {
        // 홈 페이지
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });



        // 채팅 오버레이 페이지
        this.app.get('/chat-overlay.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'src/chat-overlay.html'));
        });

        // SSE 스트림 엔드포인트
        this.app.get('/api/chat/stream', (req, res) => this.handleChatStream(req, res));
        
        // 채팅 메시지 조회
        this.app.get('/api/chat/messages', (req, res) => this.getChatMessages(req, res));
        
        // 채팅 모듈 제어
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
        
        // 채팅 클라이언트 실행
        const chatProcess = spawn('node', ['src/chat-client.js', channelId], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
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
     */
    start() {
        this.app.listen(this.port, this.host, () => {
            this.printStartupInfo();
        });
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
        console.log('서버 종료');
        
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
        
        process.exit(0);
    }

    // 유틸리티 메서드
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 서버 인스턴스 생성 및 시작
const server = new ChzzkStreamDeckServer();
server.start(); 
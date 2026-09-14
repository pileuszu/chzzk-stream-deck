import { chatTheme } from './themes.mjs';
/**
         * CHZZK 채팅 오버레이 클래스
         * @version 2.0.0
         */
        class ChatOverlay {
            constructor({ preview = false } = {}) {
                this.preview = preview; this.timers = new Set();
                this.eventSource = null;
                this.maxMessages = 5;
                this.messageTimeout = 30; // 초
                this.maxNicknameLength = 5; // 닉네임 최대 길이
                // 서버 URL은 현재 페이지의 origin 사용
                this.serverUrl = window.location.origin;
                this.messages = [];
                this.reconnectAttempts = 0;
                this.maxReconnectAttempts = 5;
                this.settingsCheckInterval = null;
                this.lastSettingsHash = null;
                
                // 상수 정의
                this.CONSTANTS = {
                    DEFAULT_MAX_MESSAGES: 5,
                    DEFAULT_MESSAGE_TIMEOUT: 30,
                    DEFAULT_MAX_RECONNECT_ATTEMPTS: 5,
                    DEFAULT_MAX_NICKNAME_LENGTH: 5,
                    STORAGE_PREFIX: 'chat-'
                };
                
                this.elements = {
                    chatContainer: document.getElementById('chatContainer'),
                    chatMessages: document.getElementById('chatMessages')
                };
                
                this.init();
            }

            /**
             * 초기화
             */
            init() {
                if (this.preview) { document.body.classList.add('is-chat-preview'); return; }
                console.log('채팅 오버레이 초기화 시작');
                this.loadSettings();
                this.connectToServer();
                this.setupEventListeners();
                this.startSettingsPolling();
                console.log('채팅 오버레이 초기화 완료');
            }

            /**
             * 이벤트 리스너 설정
             */
            setupEventListeners() {
                // 페이지 언로드 시 연결 정리
                window.addEventListener('beforeunload', () => {
                    this.disconnect();
                });

                // localStorage 변경 감지 (다른 탭에서 설정 변경 시)
                window.addEventListener('storage', (e) => {
                    if (e.key && e.key.startsWith('chat-')) {
        
                        this.loadSettings();
                    }
                });

                // 같은 탭에서의 설정 변경을 감지하기 위한 커스텀 이벤트
                window.addEventListener('chatSettingsChanged', () => {
                    console.log('설정 변경 이벤트 수신');
                    this.loadSettings();
                });
            }
            
            /**
             * 설정 변경 감지를 위한 주기적 확인 시작
             */
            startSettingsPolling() {
                // 초기 설정 해시 계산
                this.updateSettingsHash();
                
                // 1초마다 설정 변경 확인
                this.settingsCheckInterval = setInterval(() => {
                    const currentHash = this.calculateSettingsHash();
                    if (currentHash !== this.lastSettingsHash) {
                        console.log('설정 변경 감지됨, 재로드 중...');
                        this.loadSettings();
                        this.lastSettingsHash = currentHash;
                    }
                }, 1000);
            }
            
            /**
             * 설정 해시 계산
             */
            calculateSettingsHash() {
                const settings = {
                    theme: localStorage.getItem('chat-theme'),
                    maxMessages: localStorage.getItem('chat-max-messages'),
                    messageTimeout: localStorage.getItem('chat-fade-time'),
                    alignment: localStorage.getItem('chat-alignment'),
                    maxNicknameLength: localStorage.getItem('chat-max-nickname-length')
                };
                return JSON.stringify(settings);
            }
            
            /**
             * 설정 해시 업데이트
             */
            updateSettingsHash() {
                this.lastSettingsHash = this.calculateSettingsHash();
            }
            
            /**
             * 설정 폴링 중지
             */
            stopSettingsPolling() {
                if (this.settingsCheckInterval) {
                    clearInterval(this.settingsCheckInterval);
                    this.settingsCheckInterval = null;
                }
            }

            /**
             * 설정 로드
             */
            loadSettings() {
                // localStorage에서 설정값 원본 읽기
                const rawSettings = {
                    theme: localStorage.getItem('chat-theme'),
                    maxMessages: localStorage.getItem('chat-max-messages'),
                    messageTimeout: localStorage.getItem('chat-fade-time'),
                    serverUrl: localStorage.getItem('serverUrl'),
                    alignment: localStorage.getItem('chat-alignment'),
                    maxNicknameLength: localStorage.getItem('chat-max-nickname-length'),
                    channelId: localStorage.getItem('chat-channel-id')
                };
                
                console.log('=== 설정 로드 시작 ===');
                console.log('localStorage 원본 설정값:', rawSettings);
                console.log('현재 maxNicknameLength 값:', this.maxNicknameLength);
                
                // 설정값 처리
                const settings = {
                    theme: chatTheme(rawSettings.theme),
                    maxMessages: rawSettings.maxMessages || String(this.CONSTANTS.DEFAULT_MAX_MESSAGES),
                    messageTimeout: rawSettings.messageTimeout || '0',
                    serverUrl: rawSettings.serverUrl || window.location.origin,
                    alignment: rawSettings.alignment || 'default',
                    maxNicknameLength: rawSettings.maxNicknameLength || String(this.CONSTANTS.DEFAULT_MAX_NICKNAME_LENGTH),
                    channelId: rawSettings.channelId || ''
                };
                
                console.log('처리된 설정값:', settings);
                
                // 최대 메시지 수 설정
                const maxMessagesValue = parseInt(settings.maxMessages);
                this.maxMessages = isNaN(maxMessagesValue) ? this.CONSTANTS.DEFAULT_MAX_MESSAGES : Math.max(1, maxMessagesValue);
                
                // 메시지 타임아웃 처리 개선
                const timeoutValue = parseInt(settings.messageTimeout);
                this.messageTimeout = isNaN(timeoutValue) ? 0 : Math.max(0, timeoutValue);
                
                // 닉네임 최대 길이 설정
                const previousMaxNicknameLength = this.maxNicknameLength;
                const maxNicknameLengthValue = parseInt(settings.maxNicknameLength);
                this.maxNicknameLength = isNaN(maxNicknameLengthValue) ? this.CONSTANTS.DEFAULT_MAX_NICKNAME_LENGTH : Math.max(1, Math.min(50, maxNicknameLengthValue));
                
                console.log(`채팅 설정 적용: 최대 메시지 ${this.maxMessages}개, 지속시간 ${this.messageTimeout === 0 ? '무제한' : this.messageTimeout + '초'}, 닉네임 최대 길이 ${previousMaxNicknameLength}자 -> ${this.maxNicknameLength}자, 정렬: ${settings.alignment}, 테마: ${settings.theme}`);
                
                this.serverUrl = settings.serverUrl;
                const previousAlignment = this.alignment;
                this.alignment = settings.alignment;
                this.channelId = settings.channelId;
                
                // 테마 적용
                const previousTheme = this.elements.chatContainer.className.match(/theme-([\w-]+)/)?.[1];
                if (previousTheme !== settings.theme) {
                    console.log(`테마 변경: ${previousTheme} -> ${settings.theme}`);
                    this.elements.chatContainer.className = `chat-container theme-${settings.theme}`;
                }
                
                // 정렬 방식 적용
                if (previousAlignment !== settings.alignment || previousTheme !== settings.theme) {
                    console.log(`정렬 방식 변경: ${previousAlignment} -> ${settings.alignment}`);
                    this.applyChatAlignment(settings.alignment);
                }
                
                // 최대 메시지 수 변경 시 기존 메시지 정리
                const previousMaxMessages = this.messages.length;
                this.cleanupExcessMessages();
                
                // 설정 해시 업데이트
                this.updateSettingsHash();
                
                // 기존 메시지들이 새로운 설정(예: 닉네임 길이 제한)에 맞게 업데이트 필요 시
                // 현재 표시된 메시지들의 닉네임을 업데이트
                this.updateDisplayedNicknames();
                
                console.log('=== 설정 로드 완료 ===');
            }
            
            /**
             * 표시된 메시지들의 닉네임 길이 제한 업데이트
             */
            updateDisplayedNicknames() {
                console.log(`닉네임 길이 업데이트 시작: 최대 ${this.maxNicknameLength}자, 총 ${this.messages.length}개 메시지`);
                let updatedCount = 0;
                // 메시지 배열을 순회하면서 원본 닉네임으로 다시 렌더링
                this.messages.forEach((msg, index) => {
                    if (msg.element && msg.originalUsername) {
                        const usernameEl = msg.element.querySelector('.username');
                        if (usernameEl) {
                            let displayUsername = msg.originalUsername;
                            const originalLength = displayUsername.length;
                            if (displayUsername.length > this.maxNicknameLength) {
                                displayUsername = displayUsername.substring(0, this.maxNicknameLength) + '...';
                                updatedCount++;
                            }
                            usernameEl.textContent = displayUsername;
                            if (index < 3) { // 처음 3개만 상세 로그
                                console.log(`  메시지 ${index}: "${msg.originalUsername}" (${originalLength}자) -> "${displayUsername}"`);
                            }
                        } else {
                            console.warn(`  메시지 ${index}: username 요소를 찾을 수 없음`);
                        }
                    } else {
                        if (index < 3) {
                            console.warn(`  메시지 ${index}: originalUsername이 없음`, msg);
                        }
                    }
                });
                console.log(`닉네임 길이 업데이트 완료: ${updatedCount}개 메시지 업데이트됨`);
            }

            /**
             * 채팅 정렬 방식 적용
             */
            applyChatAlignment(alignment) {
                const container = this.elements.chatContainer;
                
                // 기존 정렬 클래스 제거
                container.classList.remove('align-left', 'align-right', 'align-center');
                
                // 새 정렬 클래스 추가
                if (alignment !== 'default') {
                    container.classList.add(`align-${alignment}`);
                }
            }

            /**
             * 서버 연결
             */
            connectToServer() {
                this.disconnect();
                


                try {
                    this.eventSource = new EventSource(`${this.serverUrl}/api/chat/stream`);
                    
                    this.eventSource.onopen = () => {
                        this.reconnectAttempts = 0;

                    };

                    this.eventSource.onmessage = (event) => {
                        try {
                            const message = JSON.parse(event.data);
                            this.addMessage(message);
                        } catch (error) {
                            console.error('메시지 파싱 오류:', error);
                        }
                    };

                    this.eventSource.onerror = (error) => {
                        console.error('SSE 오류:', error);
                        
                        // 자동 재연결
                        this.scheduleReconnect();
                    };

                } catch (error) {
                    console.error('연결 오류:', error);
                    this.scheduleReconnect();
                }
            }

            /**
             * 재연결 스케줄링
             */
            scheduleReconnect() {
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    

                    
                    this.schedule(() => {
                        if (this.eventSource?.readyState === EventSource.CLOSED) {
                            this.connectToServer();
                        }
                    }, delay);
                }
            }

            /**
             * 메시지 추가
             */
            addMessage(messageData) {
                const messageElement = this.createMessageElement(messageData);
                this.elements.chatMessages.appendChild(messageElement);
                
                // 메시지 배열에 추가 (원본 닉네임 저장)
                this.messages.push({
                    element: messageElement,
                    timestamp: Date.now(),
                    originalUsername: messageData.username // 원본 닉네임 저장
                });
                
                const currentCount = this.messages.length;
                console.log(`새 메시지 추가: "${messageData.username}: ${messageData.message.substring(0, 30)}..." (총 ${currentCount}개)`);
                
                // 최대 메시지 수 관리 (항상 실행)
                this.cleanupExcessMessages();
                
                // 자동 삭제 타이머 설정 (타이머가 0이 아닐 때만)
                if (this.messageTimeout > 0 && (!this.preview || this.previewPlaying)) {
                    console.log(`메시지 자동 삭제 타이머 설정: ${this.messageTimeout}초`);
                    this.schedule(() => {
                        this.removeMessage(messageElement);
                    }, this.messageTimeout * 1000);
                } else {
                    console.log('메시지 자동 삭제 비활성화 (무제한 유지)');
                }
                
                // 페이드 아웃 효과 적용
                this.applyFadeEffect();
                
                // 스크롤 하단으로
                this.scrollToBottom();
                
                // 메시지 입장 효과
                if (!this.preview || this.previewPlaying) this.triggerMessageEntrance(messageElement);
            }

            /**
             * 진짜 페이드 아웃 효과 적용
             */
            applyFadeEffect() {
                const messageContainers = this.elements.chatMessages.querySelectorAll('.chat-message-container');
                const messageCount = messageContainers.length;
                
                if (messageCount <= 1) return;
                
                // 위로 갈수록 opacity 감소 (더 자연스러운 곡선)
                messageContainers.forEach((container, index) => {
                    const position = index / (messageCount - 1); // 0 (맨 위) ~ 1 (맨 아래)
                    
                    // 자연스러운 곡선 함수로 opacity 계산
                    let opacity;
                    if (position < 0.2) {
                        // 상단 20% 구간에서 완만히 감소
                        opacity = Math.pow(position / 0.2, 1.5) * 0.6;
                    } else if (position < 0.5) {
                        // 중간 구간에서 점진적 증가
                        opacity = 0.6 + (position - 0.2) / 0.3 * 0.25;
                    } else {
                        // 하단 구간에서 완전히 표시
                        opacity = 0.85 + (position - 0.5) / 0.5 * 0.15;
                    }
                    
                    container.style.opacity = Math.max(0.3, Math.min(1, opacity));
                    
                    // 상단 메시지에 약간의 블러 효과만 적용
                    if (position < 0.3) {
                        const blurAmount = (1 - position / 0.3) * 0.8;
                        container.style.filter = `blur(${blurAmount}px)`;
                    } else {
                        container.style.filter = 'none';
                    }
                });
            }

            /**
             * 메시지 입장 효과
             */
            triggerMessageEntrance(messageElement) {
                // 약간의 지연 후 반짝임 효과 - 전체 컨테이너에 적용
                this.schedule(() => {
                    const chatMessage = messageElement.querySelector('.chat-message');
                    const rocketIcon = messageElement.querySelector('.rocket-icon');
                    const starIcon = messageElement.querySelector('.star-icon');
                    const username = messageElement.querySelector('.username');
                    
                    if (chatMessage) {
                        // 채팅박스 효과
                        chatMessage.style.transform = 'scale(1.08)';
                        chatMessage.style.filter = 'brightness(1.1)';
                        
                        // 로켓 이미지 효과 (밝기 효과 제거, 올바른 각도 적용)
                        if (rocketIcon) {
                            rocketIcon.style.transform = 'rotate(70deg) scale(1.1)';
                            rocketIcon.style.filter = 'drop-shadow(0 0 8px rgba(147, 112, 219, 0.4))';
                        }
                        
                        // 별 이미지 효과
                        if (starIcon) {
                            starIcon.style.transform = 'scale(1.2) rotate(15deg)';
                            starIcon.style.filter = 'drop-shadow(0 0 6px rgba(147, 112, 219, 0.6))';
                        }
                        
                        // 닉네임 박스 효과
                        if (username) {
                            username.style.transform = 'scale(1.05)';
                            username.style.filter = 'none';
                        }
                        
                        // 원래 상태로 복귀
                        this.schedule(() => {
                            chatMessage.style.transform = 'scale(1)';
                            chatMessage.style.filter = 'brightness(1)';
                            
                            if (rocketIcon) {
                                rocketIcon.style.transform = 'rotate(70deg) scale(1)';
                                rocketIcon.style.filter = 'none';
                            }
                            
                            if (starIcon) {
                                starIcon.style.transform = 'scale(1) rotate(0deg)';
                                starIcon.style.filter = 'none';
                            }
                            
                            if (username) {
                                username.style.transform = 'scale(1)';
                                username.style.filter = 'none';
                            }
                        }, 300);
                    }
                }, 150);
            }

            /**
             * 메시지 요소 생성
             */
            createMessageElement(messageData) {
                const containerElement = document.createElement('div');
                containerElement.className = 'chat-message-container';
                
                // 닉네임 길이 제한
                let displayUsername = String(messageData.username);
                const originalLength = displayUsername.length;
                if (displayUsername.length > this.maxNicknameLength) {
                    displayUsername = displayUsername.substring(0, this.maxNicknameLength) + '...';
                    if (originalLength !== displayUsername.length) {
                        console.log(`닉네임 길이 제한 적용: "${messageData.username}" (${originalLength}자) -> "${displayUsername}"`);
                    }
                }
                
                displayUsername = this.escapeHtml(displayUsername);
                // 이모티콘 처리된 메시지
                const processedMessage = this.processEmoticons(messageData.message, messageData.extras);
                
                containerElement.innerHTML = `
                    <div class="rocket-icon"></div>
                    <span class="username">${displayUsername}</span>
                    <div class="chat-message">
                        <div class="message">${processedMessage}</div>
                        <div class="star-icon"></div>
                    </div>
                `;
                
                // 애니메이션 트리거 - 전체 컨테이너에 적용
                if (!this.preview || this.previewPlaying) this.schedule(() => {
                    containerElement.style.animation = 'enhancedPurpleSlideIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
                }, 10);
                
                return containerElement;
            }

            /**
             * 이모티콘 처리
             */
            processEmoticons(message, extras) {
                let processedMessage = this.escapeHtml(message);
                
                if (extras && extras.emojis) {
                    try {
                        const emojis = typeof extras.emojis === 'string' ? JSON.parse(extras.emojis) : extras.emojis;
                        
                        for (const [id, url] of Object.entries(emojis)) {
                            const emoticonPattern = new RegExp(`\\{:${id}:\\}`, 'g');
                            processedMessage = processedMessage.replace(emoticonPattern, 
                                `<img src="${url}" alt="${id}" class="emoticon" title="${id}" loading="lazy">`);
                        }
                    } catch (error) {

                    }
                }
                
                return processedMessage;
            }

            /**
             * 초과 메시지 정리
             */
            cleanupExcessMessages() {
                const currentMessageCount = this.messages.length;
                console.log(`메시지 정리 확인: 현재 ${currentMessageCount}개, 최대 ${this.maxMessages}개`);
                
                let removedCount = 0;
                while (this.messages.length > this.maxMessages) {
                    const oldestMessage = this.messages.shift();
                    this.removeMessageImmediately(oldestMessage.element);
                    removedCount++;
                }
                
                if (removedCount > 0) {
                    console.log(`최대 메시지 수 초과로 ${removedCount}개 메시지 제거됨`);
                    // 메시지 제거 후 페이드 효과 재적용
                    this.applyFadeEffect();
                } else {
                    console.log('메시지 수 정상 범위 내');
                }
            }

            /**
             * 메시지 제거 (페이드 아웃 효과 포함)
             */
            removeMessage(messageElement) {
                if (!messageElement || !messageElement.parentNode) return;
                
                console.log('메시지 타임아웃으로 제거 시작 (페이드 아웃)');
                
                const chatMessage = messageElement.querySelector('.chat-message');
                if (chatMessage) {
                    chatMessage.classList.add('fade-out');
                }
                
                this.schedule(() => {
                    this.removeMessageImmediately(messageElement);
                    console.log('메시지 타임아웃 제거 완료');
                }, 500);
            }

            /**
             * 메시지 즉시 제거 (애니메이션 없음)
             */
            removeMessageImmediately(messageElement) {
                if (!messageElement || !messageElement.parentNode) return;
                
                console.log('메시지 즉시 제거 실행');
                
                messageElement.parentNode.removeChild(messageElement);
                
                // 배열에서도 제거
                const beforeCount = this.messages.length;
                this.messages = this.messages.filter(msg => msg.element !== messageElement);
                const afterCount = this.messages.length;
                
                console.log(`메시지 배열 업데이트: ${beforeCount}개 → ${afterCount}개`);
                
                // 메시지 제거 후 페이드 효과 재적용
                this.applyFadeEffect();
            }

            /**
             * 하단으로 스크롤
             */
            scrollToBottom() {
                if (this.preview) return;
                // 메시지 컨테이너를 항상 하단으로 스크롤
                this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
                
                // 메시지들을 하단 정렬 유지
                const messageCount = this.elements.chatMessages.children.length;
                if (messageCount > 0) {
                    const lastMessage = this.elements.chatMessages.lastElementChild;
                    lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }

            /**
             * HTML 이스케이프
             */
            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            /**
             * 연결 종료
             */

            schedule(callback, delay) {
                const id = setTimeout(() => { this.timers.delete(id); callback(); }, delay);
                this.timers.add(id); return id;
            }
            pausePreview() {
                if (!this.preview) return;
                for (const id of this.timers) clearTimeout(id);
                this.timers.clear();
                document.body.classList.add('is-preview-still');
            }
            previewSettings(settings, play = false) {
                if (!this.preview) return;
                this.pausePreview();
                const number = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
                this.maxMessages = number(settings.maxMessages, 5, 1, 100);
                this.maxNicknameLength = number(settings.maxNicknameLength, 5, 1, 50);
                this.messageTimeout = number(settings.fadeTime, 0, 0, 300);
                this.elements.chatContainer.className = 'chat-container theme-' + chatTheme(settings.theme);
                this.applyChatAlignment(['default','left','center','right'].includes(settings.alignment) ? settings.alignment : 'default');
                this.elements.chatMessages.replaceChildren();
                this.messages = [];
                this.previewPlaying = play;
                document.body.classList.toggle('is-preview-still', !play);
                const samples = [
                    ['반가운시청자', '안녕하세요! 👋'],
                    ['오늘도함께듣는사람', '오늘 선곡 너무 좋아요'],
                    ['초록별', '소리도 화면도 잘 나와요!'],
                    ['기타좋아하는시청자', '방금 연주 한 번 더 듣고 싶어요 🎸'],
                    ['달빛', '편하게 듣고 있어요 :)'],
                    ['푸른하늘', '이 분위기 정말 좋네요'],
                    ['오래된친구', '늘 응원하고 있어요!'],
                    ['모두함께', '다음 곡도 기대할게요 ✨']
                ];
                const count = Math.min(this.maxMessages, samples.length);
                for (let i = 0; i < count; i++) {
                    const [username, message] = samples[i];
                    this.addMessage({ username, message });
                }
            }

            disconnect() {
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }
                this.stopSettingsPolling();
            }
        }

        // 전역 인스턴스 생성
        window.ChatOverlay = ChatOverlay;
        window.chatOverlay = new ChatOverlay({ preview: window.parent !== window && new URLSearchParams(location.search).get('preview') === '1' });

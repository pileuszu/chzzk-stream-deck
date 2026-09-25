import { chatTheme } from './themes.mjs';
import './unicorn-frame.mjs';
const { DEFAULT_SETTINGS, validateSettings } = globalThis.StreamDeckConfig;
const SAMPLE_MESSAGES = [
    ['반가운시청자', '안녕하세요! 👋'], ['오늘도함께듣는사람', '오늘 선곡 너무 좋아요'],
    ['초록별', '소리도 화면도 잘 나와요!'], ['기타좋아하는시청자', '방금 연주 한 번 더 듣고 싶어요 🎸'],
    ['달빛', '편하게 듣고 있어요 :)'], ['푸른하늘', '이 분위기 정말 좋네요'],
    ['오래된친구', '늘 응원하고 있어요!'], ['모두함께', '다음 곡도 기대할게요 ✨']
];

class ChatOverlay {
    constructor({ preview = false } = {}) {
        this.preview = preview;
        this.previewPlaying = false;
        this.settings = { ...DEFAULT_SETTINGS };
        this.messages = [];
        this.timers = new Set();
        this.eventSource = null;
        this.elements = { chatContainer: document.getElementById('chatContainer'), chatMessages: document.getElementById('chatMessages') };
        this.applySettings(this.settings);
        if (preview) document.body.classList.add('is-chat-preview');
        else this.connectToServer();
        window.addEventListener('pagehide', () => this.disconnect(), { once: true });
    }
    async loadSettings() {
        if (this.preview) return;
        const response = await fetch('/api/chat/settings', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || '채팅 설정을 불러오지 못했습니다.');
        this.applySettings(result.settings);
    }
    applySettings(settings) {
        this.settings = validateSettings(settings, this.settings);
        this.maxMessages = this.settings.maxMessages;
        this.maxNicknameLength = this.settings.maxNicknameLength;
        this.messageTimeout = this.settings.fadeTime;
        this.elements.chatContainer.className = 'chat-container theme-' + this.settings.theme;
        this.elements.chatContainer.classList.toggle('fade-mask', this.settings.fadeMask);
        this.elements.chatContainer.style.setProperty('--chat-font-size', this.settings.fontSize + 'px');
        this.elements.chatContainer.style.setProperty('--chat-opacity', this.settings.opacity / 100);
        this.applyChatAlignment(this.settings.alignment);
        // Rebuild existing cards too: Unicorn uses a different frame/nameplate structure.
        for (const item of this.messages) {
            const next = this.createMessageElement(item.data);
            next.style.animation = 'none';
            item.element.replaceWith(next);
            item.element = next;
        }
        this.cleanupExcessMessages();
        this.expire();
        this.armExpiry();
    }
    applyChatAlignment(alignment) {
        const container = this.elements.chatContainer;
        container.classList.remove('align-left', 'align-right', 'align-center');
        if (alignment !== 'default') container.classList.add('align-' + alignment);
    }
    connectToServer() {
        if (this.preview) return;
        this.eventSource?.close();
        // EventSource owns reconnect/backoff. Each connection starts with saved settings.
        this.eventSource = new EventSource('/api/chat/stream');
        this.eventSource.onopen = () => {
            this.clearTimers();
            this.messages = [];
            this.elements.chatMessages.replaceChildren();
        };
        this.eventSource.onmessage = event => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === 'settings') this.applySettings(payload.settings);
                else if (payload.type === 'snapshot') {
                    this.clearMessages(); this.applySettings(payload.settings);
                    for (const message of payload.messages) this.addMessage(message);
                } else if (payload.type === 'clear') this.clearMessages();
                else if (payload.type === 'chat') this.addMessage(payload);
            }
            catch (error) { console.warn('채팅 메시지 적용 실패:', error.message); }
        };
    }
    clearMessages() {
        this.clearTimers(); this.messages = []; this.elements.chatMessages.replaceChildren();
    }
    appendMessageText(element, text, extras) {
        let emojis = extras?.emojis || {};
        try { if (typeof emojis === 'string') emojis = JSON.parse(emojis); } catch { emojis = {}; }
        globalThis.ChatRenderer.appendMessageText(document, element, text, emojis);
    }
    createMessageElement(data) {
        const element = document.createElement('div');
        element.className = 'chat-message-container';
        if (this.settings.theme === 'unicorn-overlord') {
            element.innerHTML = '<div class="username"><unicorn-frame kind="name" aria-hidden="true"></unicorn-frame><span class="username-center"><span></span></span></div><div class="chat-message"><unicorn-frame kind="message" aria-hidden="true"></unicorn-frame><div class="message-center"><div class="message"></div></div></div>';
        } else if (this.settings.theme === 'maplestory') {
            element.innerHTML = '<div class="chat-message"><span class="username"></span><div class="message"></div></div>';
        } else {
            element.innerHTML = '<div class="rocket-icon"></div><span class="username"></span><div class="chat-message"><div class="message"></div><div class="star-icon"></div></div>';
        }
        const name = Array.from(String(data.username || '익명'));
        const username = element.querySelector('.username-center > span') || element.querySelector('.username');
        username.textContent = name.slice(0, this.maxNicknameLength).join('') + (name.length > this.maxNicknameLength ? '...' : '');
        this.appendMessageText(element.querySelector('.message'), data.message.slice(0, 10000), data.extras);
        return element;
    }
    addMessage(data) {
        if (!data || typeof data.message !== 'string') return;
        if (data.id && this.messages.some(item => item.data.id === data.id)) return;
        const timestamp = Date.parse(data.timestamp) || Date.now();
        if (this.messageTimeout && timestamp <= Date.now() - this.messageTimeout * 1000) return;
        const element = this.createMessageElement(data);
        this.elements.chatMessages.append(element);
        this.messages.push({ element, data, timestamp, originalUsername: data.username });
        this.cleanupExcessMessages();
        this.armExpiry();
    }
    cleanupExcessMessages() {
        while (this.messages.length > this.maxMessages) this.messages.shift().element.remove();
    }
    expire() {
        if (!this.messageTimeout || (this.preview && !this.previewPlaying)) return;
        const cutoff = Date.now() - this.messageTimeout * 1000;
        this.messages = this.messages.filter(item => {
            if (item.timestamp > cutoff) return true;
            item.element.remove(); return false;
        });
    }
    clearTimers() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
    }
    armExpiry() {
        this.clearTimers();
        if (!this.messageTimeout || !this.messages.length || (this.preview && !this.previewPlaying)) return;
        const delay = Math.max(1, this.messages[0].timestamp + this.messageTimeout * 1000 - Date.now());
        const timer = setTimeout(() => { this.timers.delete(timer); this.expire(); this.armExpiry(); }, delay);
        this.timers.add(timer);
    }
    pausePreview() {
        if (!this.preview) return;
        this.previewPlaying = false;
        this.clearTimers();
        document.body.classList.add('is-preview-still');
    }
    previewSettings(settings, play = false) {
        if (!this.preview) return;
        this.pausePreview();
        this.messages = [];
        this.elements.chatMessages.replaceChildren();
        this.applySettings({ ...settings, theme: chatTheme(settings.theme) });
        this.previewPlaying = play;
        document.body.classList.toggle('is-preview-still', !play);
        for (const [username, message] of SAMPLE_MESSAGES.slice(0, this.maxMessages)) this.addMessage({ username, message });
    }
    disconnect() {
        this.eventSource?.close();
        this.eventSource = null;
        this.clearTimers();
    }
}
window.ChatOverlay = ChatOverlay;
window.chatOverlay = new ChatOverlay({ preview: window.parent !== window && new URLSearchParams(location.search).get('preview') === '1' });

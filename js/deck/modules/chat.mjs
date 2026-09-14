import { DeckModule } from '../core/module.mjs';
import { panel } from './chat-panel.mjs';
import { ChatPreview } from './chat-preview.mjs';
import { CHAT_THEMES } from '../../chat/themes.mjs';

const FIELDS = { theme: 'theme-select', channelId: 'channel-id', maxMessages: 'max-messages', alignment: 'alignment', fadeTime: 'fade-time', maxNicknameLength: 'max-nickname-length' };

export class ChatDeckModule extends DeckModule {
    constructor() { super({ id: 'chat', label: 'CHZZK 채팅', icon: 'chat', accent: '#c3a5ff', tint: '#3a2c51', eyebrow: 'CHAT MODULE', description: '채팅 연결과 표시 설정을 미리보기와 함께 관리합니다.', panel }); }
    getState({ app }) { return { active: app.chatModule.isActive }; }
    onEnter({ app }) {
        app.uiManager.currentModule = this.id;
        document.getElementById('chat-channel-id').setCustomValidity('');
        app.settingsManager.loadModalSettings(this.id);
        app.settingsManager.updateUI();
        this.preview.sync();
    }
    onLeave({ app }) { this.preview.suspend(); app.uiManager.currentModule = null; }
    bind(context) {
        const root = document.getElementById(this.panel.id);
        document.getElementById('chat-theme-select').replaceChildren(...CHAT_THEMES.map(theme => new Option(theme.label, theme.id)));
        this.preview = new ChatPreview(root, { signal: this.listeners.signal, isActive: () => context.deck.view === this.id });
        this.listen(document.getElementById('chat-settings-form'), 'submit', async event => {
            event.preventDefault(); await context.app.uiManager.saveSettings(); this.refresh(context);
        }, context);
        this.listen(root, 'input', () => {
            document.getElementById('chat-channel-id').setCustomValidity(''); this.refresh(context);
        }, context);
        this.listen(root, 'change', () => this.refresh(context), context);
        this.listen(document.getElementById('chat-connect'), 'click', () => this.connect(context), context);
        this.listen(document.getElementById('copy-chat-source'), 'click', () => this.copySource(context), context);
    }
    isDirty({ app }) {
        const settings = app.settingsManager.getModuleSettings(this.id);
        return Object.entries(FIELDS).some(([key, id]) => document.getElementById('chat-' + id).value !== String(settings[key] ?? ''));
    }
    async connect(context) {
        const { app } = context;
        if (app.chatBusy) return;
        if (!app.chatModule.isActive) {
            const input = document.getElementById('chat-channel-id');
            input.setCustomValidity(input.value ? '' : '연결할 CHZZK 채널 ID를 입력해 주세요.');
            if (!document.getElementById('chat-settings-form').reportValidity()) return;
            app.settingsManager.saveModalSettings(this.id);
        }
        await app.toggleChat(); this.refresh(context);
    }
    refresh(context) {
        const { app } = context;
        const dirty = this.isDirty(context);
        const button = document.getElementById('chat-connect');
        button.disabled = app.chatBusy;
        button.textContent = app.chatModule.isActive ? '연결 해제' : dirty ? '저장 후 연결' : '연결';
        button.classList.toggle('stop-button', app.chatModule.isActive);
        document.getElementById('save-chat-settings').disabled = app.chatBusy;
        const state = document.getElementById('chat-connection-state');
        state.dataset.state = app.chatBusy ? 'busy' : app.chatModule.isActive ? 'on' : 'off';
        state.textContent = app.chatBusy ? '처리 중…' : app.chatModule.isActive ? '연결됨' : '연결 안 됨';
        const draft = document.getElementById('chat-draft-state');
        draft.dataset.dirty = String(dirty);
        draft.textContent = dirty ? '미저장 변경' : '저장된 설정';
        document.getElementById('copy-chat-source').title = document.getElementById('chat-url').value;
    }
    async copySource({ app, deck }) {
        app.settingsManager.updateUI();
        const url = document.getElementById('chat-url').value;
        try { await navigator.clipboard.writeText(url); deck.notify('채팅 브라우저 소스 주소를 복사했습니다.'); }
        catch { deck.notify('브라우저 소스 주소: ' + url, true); }
    }
}

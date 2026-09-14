// Preview owns no live chat connection and never writes broadcast settings.
export class ChatPreview {
    constructor(root, { signal, isActive }) {
        this.root = root;
        this.isActive = isActive;
        this.frame = root.querySelector('#chat-preview-frame');
        this.stage = root.querySelector('#chat-preview-stage');
        this.play = root.querySelector('#chat-preview-play');
        this.caption = root.querySelector('#chat-preview-description');
        this.empty = root.querySelector('#chat-preview-empty');
        const sync = () => this.sync();
        root.addEventListener('input', sync, { signal });
        root.addEventListener('change', sync, { signal });
        document.addEventListener('visibilitychange', sync, { signal });
        this.frame.addEventListener('load', sync, { signal });
        this.play.addEventListener('click', () => this.render(true), { signal });
        root.querySelector('#chat-preview-background').addEventListener('click', event => {
            const button = event.currentTarget;
            const light = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(light));
            button.setAttribute('aria-label', light ? '미리보기 어두운 배경' : '미리보기 밝은 배경');
            this.stage.classList.toggle('is-light', light);
        }, { signal });
        this.resize = new ResizeObserver(() => this.fit());
        this.resize.observe(this.stage);
        signal.addEventListener('abort', () => {
            this.suspend(); this.resize.disconnect(); this.frame.src = 'about:blank';
        }, { once: true });
    }
    get visible() {
        return this.isActive() && !document.hidden;
    }
    values() {
        const value = name => this.root.querySelector('#chat-' + name).value;
        return { theme: value('theme-select'), alignment: value('alignment'),
            maxMessages: Number(value('max-messages')), maxNicknameLength: Number(value('max-nickname-length')),
            fadeTime: Number(value('fade-time')) };
    }
    fit() {
        if (!this.stage.clientWidth) return;
        // Show the real message styles at a readable scale; only the stage framing is compact.
        const scale = Math.min(1, this.stage.clientWidth / 380);
        this.frame.style.width = (this.stage.clientWidth / scale) + 'px';
        this.frame.style.height = (this.stage.clientHeight / scale) + 'px';
        this.frame.style.transform = 'scale(' + scale + ')';
    }
    sync() {
        if (!this.visible) { this.suspend(); return; }
        if (!this.frame.getAttribute('src')) this.frame.src = '/chat-overlay.html?preview=1';
        this.fit(); this.render(false);
    }
    suspend() {
        clearTimeout(this.timer);
        this.frame.contentWindow?.chatOverlay?.pausePreview();
        this.play.querySelector('span').textContent = '재생';
    }
    render(play = false) {
        if (!this.visible) return;
        this.suspend();
        const inputs = [...this.root.querySelectorAll('[data-chat-display] input')];
        const valid = inputs.every(input => input.validity.valid);
        this.play.disabled = !valid;
        if (!valid) { this.caption.textContent = '설정값의 범위를 확인해 주세요.'; return; }
        const settings = this.values();
        const overlay = this.frame.contentWindow?.chatOverlay;
        if (!overlay) return;
        overlay.previewSettings(settings, play);
        this.empty.hidden = true;
        const count = Math.min(settings.maxMessages, 8);
        this.caption.textContent = '예시 ' + count + '개 · ' + (settings.fadeTime ? settings.fadeTime + '초 후 사라짐' : '계속 표시');
        if (settings.maxMessages > 8) this.caption.textContent = '최대 ' + settings.maxMessages + '개 · 예시 8개';
        this.play.querySelector('span').textContent = play ? '다시 재생' : '재생';
        if (play && settings.fadeTime) this.timer = setTimeout(() => {
            this.empty.hidden = false;
            this.caption.textContent = settings.fadeTime + '초 유지 · 재생 완료';
        }, settings.fadeTime * 1000 + 600);
    }
}

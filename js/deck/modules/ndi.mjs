import { OutputDeckModule } from './output.mjs';
import { InfoPopovers } from '../core/info-popovers.mjs';

export class NdiDeckModule extends OutputDeckModule {
    constructor() {
        super({ id: 'ndi', label: 'NDI 송신', icon: 'send', accent: '#76dcf7', tint: '#183b47', eyebrow: 'NDI OUTPUT', description: '다른 PC로 보낼 NDI 송출과 상태를 관리합니다.' });
        this.sourceKey = 'ndi';
        this.mode = 'audio_video';
        this.dirty = false;
    }
    bind(context) {
        super.bind(context);
        this.element = document.getElementById(this.panel.id);
        this.info = new InfoPopovers(this.element, this.listeners.signal);
        this.form = document.getElementById('ndi-settings-form');
        this.fields = Object.fromEntries(['resolution', 'width', 'height', 'fps', 'monitor', 'buffer', 'offset'].map(key => [key, document.getElementById('ndi-' + key)]));
        this.radios = [...this.element.querySelectorAll('[name="ndi-output-mode"]')];
        const edit = () => {
            this.mode = this.radios.find(radio => radio.checked).value;
            if (this.fields.resolution.value !== 'custom') [this.fields.width.value, this.fields.height.value] = this.fields.resolution.value.split('x');
            this.dirty = this.draft() !== this.baseline;
            this.refresh(context);
        };
        this.listen(this.form, 'input', edit, context);
        this.listen(this.form, 'change', edit, context);
        this.radios.forEach(radio => this.listen(radio, 'change', edit, context));
        this.listen(this.form, 'submit', event => { event.preventDefault(); return this.save(context, Boolean(this.source(context)?.processRunning)); }, context);
        this.listen(document.getElementById('ndi-mode-save'), 'click', () => this.save(context, Boolean(this.source(context)?.processRunning)), context);
        this.listen(document.getElementById('ndi-mode-reset'), 'click', () => { this.dirty = false; this.revision = ''; this.refresh(context); }, context);
    }
    onLeave() { this.info.close(); }
    values() {
        return { width: Number(this.fields.width.value), height: Number(this.fields.height.value),
            fps: Number(this.fields.fps.value), monitor: Number(this.fields.monitor.value) - 1,
            buffer_ms: Number(this.fields.buffer.value), audio_offset_ms: Number(this.fields.offset.value) };
    }
    draft() { return JSON.stringify({ mode: this.mode, ...this.values() }); }
    load(ndi) {
        const config = ndi?.config || {};
        this.mode = this.savedMode = config.output_mode === 'audio_only' ? 'audio_only' : 'audio_video';
        this.fields.width.value = config.width ?? 1920; this.fields.height.value = config.height ?? 1080;
        const size = this.fields.width.value + 'x' + this.fields.height.value;
        this.fields.resolution.value = [...this.fields.resolution.options].some(option => option.value === size) ? size : 'custom';
        this.fields.fps.value = config.fps ?? 30; this.fields.monitor.value = Number(config.monitor ?? 0) + 1;
        this.fields.buffer.value = config.buffer_ms ?? 500; this.fields.offset.value = config.audio_offset_ms ?? 0;
        this.revision = ndi?.revision || ''; this.baseline = this.draft();
    }
    async save(context, apply) {
        const state = context.deck.outputs;
        if (!state?.supported || state.processError || state.busy || context.outputs?.busy ||
            !this.revision || this.revision !== this.source(context)?.revision || !this.form.reportValidity()) return false;
        const values = this.values();
        const saved = await context.outputs.configureNdi({ mode: this.mode, values, revision: this.revision, apply });
        // A restart failure can follow a successful write; adopt only this exact saved draft for retry.
        const config = this.source(context)?.config;
        if (saved || (config?.output_mode === this.mode && Object.entries(values).every(([key, value]) => Number(config[key]) === value))) {
            this.dirty = false; this.revision = ''; this.refresh(context);
        }
        return saved;
    }
    async performAction(action, context) {
        if (!this.canPerform(action, context)) return;
        if (action === 'start-ndi' && this.dirty && !await this.save(context, false)) return;
        return super.performAction(action, context);
    }
    refresh(context) {
        super.refresh(context);
        if (!this.radios) return;
        const state = context.deck.outputs, ndi = this.source(context);
        const busy = Boolean(context.outputs?.busy || state?.busy);
        const savedMode = ndi?.config?.output_mode === 'audio_only' ? 'audio_only' : 'audio_video';
        if (!this.dirty) this.load(ndi);
        const canEdit = Boolean(state?.supported && !state.processError && ndi?.built && ndi.revision && !busy);
        this.radios.forEach(radio => { radio.checked = radio.value === this.mode; radio.disabled = !canEdit; });
        const audioDraft = this.mode === 'audio_only', custom = this.fields.resolution.value === 'custom';
        Object.values(this.fields).forEach(field => { field.disabled = !canEdit; });
        document.getElementById('ndi-video-settings').hidden = audioDraft;
        document.getElementById('ndi-custom-size').hidden = !custom;
        for (const key of ['resolution', 'fps', 'monitor']) this.fields[key].disabled = !canEdit || audioDraft;
        for (const key of ['width', 'height']) this.fields[key].disabled = !canEdit || audioDraft || !custom;
        this.fields.buffer.min = audioDraft ? '0' : '200';
        const limit = Math.max(0, Number(this.fields.buffer.value) - (audioDraft ? 0 : 100));
        this.fields.offset.min = String(-limit); this.fields.offset.max = String(limit);
        const invalid = canEdit && !this.form.checkValidity();
        this.text('ndi-settings-help', invalid ? (Number(this.fields.buffer.value) < Number(this.fields.buffer.min) ? '화면 + 소리 모드는 버퍼를 200 ms 이상으로 설정하세요.' : '숫자 범위와 오디오 보정값을 확인하세요.') : audioDraft ? '0 ms는 송신기의 추가 대기를 끕니다. 기기·네트워크·수신 버퍼 지연은 남습니다.' : '화면 번호는 1부터 · 보정 ＋는 소리를 늦춥니다.');
        this.element.dataset.invalid = String(invalid);
        const audioOnly = (ndi?.running ? ndi.output_mode : savedMode) === 'audio_only';
        if (audioOnly) {
            for (const id of ['video-live-fps', 'video-drops', 'video-size', 'video-fps']) this.text(id, '—');
            this.text('output-video-summary', '전송 안 함');
            this.text('output-fps-summary', '화면 캡처 꺼짐');
            this.text('sync-verified', 'A1 믹스의 타이밍과 송출 버퍼는 그대로 유지됩니다.');
        }
        this.text('ndi-buffer-note', audioOnly ? 'A1 소리만 대기' : '화면·소리 함께 대기');
        this.text('ndi-mode-hint', this.dirty && ndi?.processRunning ? '변경 적용 시 잠시 끊긴 뒤 새 설정으로 다시 연결됩니다.' : this.mode === 'audio_only' ? '화면 캡처·영상 전송 없이 A1 믹스만 보냅니다.' : '송출 전에 화면·소리 설정을 조정하세요.');
        this.text('ndi-receivers', '수신기 ' + (ndi?.running ? ndi.receivers || 0 : 0));
        const error = context.outputs?.lastErrorScope === 'ndi' ? context.outputs.lastError : '';
        if (error) this.text('output-module-note', error);
        const conflict = this.dirty && this.revision !== ndi?.revision;
        this.text('ndi-mode-status', busy ? '처리 중…' : conflict ? '저장값 변경됨' : this.dirty ? '미저장 변경' : '저장된 설정');
        const save = document.getElementById('ndi-mode-save');
        save.hidden = !this.dirty; save.disabled = !canEdit || conflict || invalid;
        save.textContent = ndi?.processRunning ? '변경 적용' : '설정 저장';
        const reset = document.getElementById('ndi-mode-reset'); reset.hidden = !this.dirty; reset.disabled = busy;
        const start = this.element.querySelector('[data-output-action="start-ndi"]');
        start.textContent = this.dirty ? '저장하고 송출' : '송출 시작';
        if (conflict || invalid) start.disabled = true;
    }
    canPerformOutput(action, state) {
        if (!state.ndi?.built) return false;
        if (action === 'start-ndi') return !state.ndi.processRunning && !state.local?.running;
        if (action === 'stop-ndi') return Boolean(state.ndi.processRunning);
        return false;
    }
    statusText(state, ndi) {
        return ndi?.running ? (ndi.healthy ? ndi.output_mode === 'audio_only' ? '소리 송출 중' : '화면 + 소리 송출 중' : '캡처 확인 필요') : ndi?.processRunning ? '다른 경로에서 실행 중' : ndi?.built ? '대기' : state?.supported ? '빌드 필요' : '데스크톱 앱 필요';
    }
    note(state) { return state?.local?.running ? '로컬 캡처가 A1을 사용하고 있습니다. 로컬 캡처 모듈에서 캡처 중지를 누른 뒤 송출을 시작하세요.' : '받는 PC에서 A1 Desktop Sync를 선택하세요. A1 믹스는 두 모드에서 동일합니다.'; }
    configPath(state) { return state?.root ? state.root + '/sender.ini' : ''; }
}

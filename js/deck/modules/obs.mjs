import { OutputDeckModule } from './output.mjs';
import { panel } from './obs-panel.mjs';
import { localWorkflow } from './local-workflow.mjs';

export class ObsDeckModule extends OutputDeckModule {
    constructor() {
        super({ id: 'obs', label: '로컬 캡처', icon: 'obs', accent: '#8df2bd', tint: '#244537', panel,
            eyebrow: 'LOCAL CAPTURE', description: '화면과 A1 오디오를 이 PC의 OBS에 전달합니다. 설정 변경과 캡처 시작·중지를 관리합니다.' });
        this.sourceKey = 'local';
        this.dirty = false;
        this.loaded = false;
    }
    bind(context) {
        this.element = document.getElementById(this.panel.id);
        this.form = document.getElementById('local-capture-form');
        this.fields = Object.fromEntries(['resolution', 'width', 'height', 'fps', 'monitor', 'buffer', 'offset'].map(key => [key, document.getElementById('capture-' + key)]));
        const edit = () => {
            if (this.fields.resolution.value !== 'custom') {
                [this.fields.width.value, this.fields.height.value] = this.fields.resolution.value.split('x');
            }
            this.syncFields();
            this.dirty = JSON.stringify(this.values()) !== this.baseline;
            this.refresh(context);
        };
        this.listen(this.form, 'input', edit, context);
        this.listen(this.form, 'change', edit, context);
        this.listen(this.form, 'submit', event => {
            event.preventDefault();
            return this.save(context, event.submitter?.value === 'apply');
        }, context);
        this.listen(document.getElementById('capture-reload'), 'click', () => this.load(context), context);
        this.listen(document.getElementById('capture-toggle'), 'click', () => this.next(context), context);
        this.listen(document.getElementById('capture-check-again'), 'click', () => context.outputs.refresh(), context);
        this.element.querySelectorAll('[data-local-action]').forEach(button =>
            this.listen(button, 'click', () => this.performAction(button.dataset.localAction, context), context));
    }
    onEnter(context) {
        context.deck.currentOutput = this.id;
        if (!this.loaded || !this.dirty) this.load(context);
    }
    values() {
        return { width: Number(this.fields.width.value), height: Number(this.fields.height.value),
            fps: Number(this.fields.fps.value), monitor: Number(this.fields.monitor.value) - 1,
            buffer_ms: Number(this.fields.buffer.value), audio_offset_ms: Number(this.fields.offset.value) };
    }
    syncFields() {
        const custom = this.fields.resolution.value === 'custom';
        document.getElementById('capture-custom-size').hidden = !custom;
        this.fields.width.disabled = !custom;
        this.fields.height.disabled = !custom;
        const limit = Math.max(0, Number(this.fields.buffer.value) - 100);
        this.fields.offset.min = String(-limit); this.fields.offset.max = String(limit);
    }
    load(context) {
        const local = this.source(context);
        if (!local?.revision) return;
        const config = local.config || {};
        this.fields.width.value = config.width || 1920;
        this.fields.height.value = config.height || 1080;
        const size = this.fields.width.value + 'x' + this.fields.height.value;
        this.fields.resolution.value = [...this.fields.resolution.options].some(option => option.value === size) ? size : 'custom';
        const fps = String(config.fps || 30);
        this.fields.fps.querySelectorAll('[data-custom]').forEach(option => option.remove());
        if (!['30', '60'].includes(fps)) {
            const option = new Option(fps + ' FPS', fps); option.dataset.custom = ''; this.fields.fps.add(option);
        }
        this.fields.fps.value = fps;
        this.fields.monitor.value = Number(config.monitor || 0) + 1;
        this.fields.buffer.value = config.buffer_ms || 500;
        this.fields.offset.value = config.audio_offset_ms || 0;
        this.revision = local.revision;
        this.baseline = JSON.stringify(this.values());
        this.dirty = false; this.loaded = true;
        this.syncFields(); this.refresh(context);
    }
    canPerformOutput(action, state) {
        const local = state.local;
        if (action === 'setup-local') return Boolean(local?.setup?.available && !local.processRunning);
        if (action === 'open-obs-setup') return Boolean(local?.setup?.obsInstalled && !local.processRunning);
        if (!local?.installed) return false;
        if (action === 'open-obs') return !state.ndi?.processRunning;
        if (action === 'stop-local') return Boolean(local.controlAvailable && (local.running || local.captureRequested));
        if (action === 'start-local') return !state.ndi?.processRunning;
        return false;
    }
    async save(context, apply) {
        if (!this.canSave(context, apply) || !this.form.reportValidity()) return false;
        const saved = await context.outputs.configure({ values: this.values(), revision: this.revision, apply });
        const current = this.source(context);
        // Applying can fail after the settings were saved. Adopt that revision
        // only when it exactly matches this draft, so Retry is not blocked by
        // our own successful write and no unsaved edits are discarded.
        const stored = Object.fromEntries(Object.keys(this.values()).map(key => [key, Number(current?.config?.[key])]));
        if (saved || JSON.stringify(stored) === JSON.stringify(this.values())) this.load(context);
        return saved;
    }
    canSave(context, apply = false) {
        const state = context.deck.outputs;
        return Boolean(this.loaded && state?.supported && !state.processError &&
            !context.outputs?.busy && !state.busy &&
            (!apply || (state.local.running && state.local.controlAvailable && !state.ndi?.processRunning)));
    }
    async toggle(context, action) {
        if (!this.canPerform(action, context)) return;
        if (action === 'start-local' && this.dirty && !await this.save(context, false)) return;
        return this.performAction(action, context);
    }
    next(context) {
        const flow = localWorkflow(context.deck.outputs, { dirty: this.dirty, busy: context.outputs?.busy || context.deck.outputs?.busy, error: this.connectionError(context) });
        if (flow.disabled) return;
        if (flow.action === 'start' || flow.action === 'stop') return this.toggle(context, flow.action + '-local');
        if (flow.action === 'prepare') return this.performAction('setup-local', context);
        if (flow.action === 'initialize') return this.performAction('open-obs-setup', context);
        if (flow.action === 'refresh') return context.outputs.refresh();
        if (flow.action === 'ndi') return context.deck.run('ndi');
        const help = document.getElementById('capture-help');
        help.open = true; help.querySelector('summary').focus({ preventScroll: true });
        help.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
    connectionError(context) {
        return context.outputs?.lastErrorScope === 'local' ? context.outputs.lastError : '';
    }
    refresh(context) {
        if (!this.element) return;
        const state = context.deck.outputs, local = this.source(context);
        if (!this.loaded && local?.revision) { this.load(context); return; }
        const running = Boolean(local?.running);
        const flow = localWorkflow(state, { dirty: this.dirty, busy: context.outputs?.busy || state?.busy, error: this.connectionError(context) });
        if (this.prepared === false && flow.prepared) {
            document.getElementById('capture-help').open = false;
            this.element.querySelector('.panel-body').scrollTop = 0;
        }
        this.prepared = flow.prepared;
        const status = document.getElementById('capture-state');
        status.dataset.state = context.outputs?.busy ? 'busy' : running && local.healthy ? 'on' : 'off';
        status.textContent = context.outputs?.busy ? '처리 중' : flow.status;
        const toggle = document.getElementById('capture-toggle');
        toggle.textContent = flow.label;
        toggle.classList.toggle('stop-button', flow.action === 'stop');
        const commands = { prepare: 'setup-local', initialize: 'open-obs-setup', start: 'start-local', stop: 'stop-local' };
        toggle.disabled = flow.disabled || Boolean(commands[flow.action] && !this.canPerform(commands[flow.action], context));
        this.element.dataset.stage = flow.setup ? 'setup' : flow.receiving ? 'receiving' : 'ready';
        this.text('capture-next-title', flow.title); this.text('capture-setup-title', flow.title);
        this.text('capture-next-detail', flow.detail); this.text('capture-setup-detail', flow.detail);
        document.getElementById('capture-setup').hidden = !flow.setup;
        document.getElementById('capture-config-workspace').hidden = flow.setup;
        document.getElementById('capture-save-actions').hidden = flow.setup;
        document.getElementById('capture-save-line').hidden = flow.setup;
        document.getElementById('capture-check-again').hidden = !flow.setup;
        document.getElementById('capture-check-again').disabled = flow.disabled;
        document.getElementById('capture-install-guide').hidden = !flow.setup;
        document.getElementById('capture-broadcast-guide').hidden = flow.setup;
        document.getElementById('capture-diagnostics').hidden = flow.setup;
        this.text('capture-help-title', flow.setup ? '설치·연결 방법' : 'OBS에서 방송하는 방법');
        this.text('capture-obs-activity', local?.controlAvailable ? local.streaming ? '방송 중' : local.recording ? '녹화 중' : '방송 대기' : '');
        for (const step of this.element.querySelectorAll('[data-capture-step]')) {
            const index = Number(step.dataset.captureStep), done = index < flow.step || (index === 2 && flow.streaming);
            step.dataset.state = done ? 'done' : index === flow.step ? 'current' : 'pending';
            if (index === flow.step) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
        }
        const setup = local?.setup || {};
        for (const [id, done, label] of [
            ['engine', setup.built, '캡처 엔진'], ['obs', setup.obsInstalled && setup.initialized, 'OBS 설치·초기 설정'],
            ['source', flow.prepared, 'A1 Local 소스 연결']
        ]) {
            const check = document.getElementById('capture-check-' + id);
            check.textContent = (done ? '✓ ' : '○ ') + label + (done ? ' 완료' : ' 필요'); check.dataset.done = Boolean(done);
        }
        document.getElementById('capture-save').disabled = !this.dirty || !this.canSave(context);
        document.getElementById('capture-apply').hidden = !running;
        document.getElementById('capture-apply').disabled = !this.canSave(context, true);
        document.getElementById('capture-reload').disabled = Boolean(context.outputs?.busy) || !this.loaded;
        // Lock fields only during a command, never while ordinary status polling runs.
        for (const field of Object.values(this.fields)) field.disabled = Boolean(context.outputs?.busy) || !this.loaded;
        if (!context.outputs?.busy && this.loaded) this.syncFields();
        const conflict = this.loaded && local?.revision && local.revision !== this.revision;
        this.text('capture-draft-state', conflict ? '저장값이 변경됨 · 되돌리기로 불러오기' : this.dirty ? '미저장 변경' : '저장된 설정');
        this.text('capture-apply-note', running ? '적용하면 캡처가 잠시 재시작됩니다.' : '시작하면 저장된 설정이 적용됩니다.');
        this.text('capture-live-video', running ? local.width + ' × ' + local.height + ' · ' + local.fps + ' FPS' : '캡처가 중지되어 있습니다.');
        this.text('capture-live-audio', running ? 'A1 스테레오 · ' + (local.sample_rate / 1000) + ' kHz' : '시작하면 화면과 소리가 함께 들어옵니다.');
        this.text('capture-live-fps', running ? Number(local.send_fps || 0).toFixed(1) + ' FPS / ' + (local.late_video_drops || 0) : '—');
        this.text('capture-live-sync', running ? local.buffer_ms + ' ms / ' + local.audio_offset_ms + ' ms' : '—');
        const peak = running ? Number(local.audio_peak) : NaN;
        const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        this.text('capture-peak', Number.isFinite(peak) ? (peak > 0 ? db.toFixed(1) : '−∞') + ' dBFS' : '—');
        document.getElementById('capture-meter').style.width = (Number.isFinite(db) ? Math.max(0, Math.min(100, (db + 60) / 60 * 100)) : 0) + '%';
        this.text('capture-path', '설정 파일: ' + (local?.configPath || '미연결'));
        this.text('capture-error', state?.processError || local?.error || local?.capture_error || '보고된 오류 없음');
        const connectionNote = document.getElementById('capture-connection-note');
        connectionNote.textContent = this.connectionError(context) || (local?.configRecovered ? '설정 파일이 없어 백업 또는 기본값을 불러왔습니다. 저장하거나 연결하면 복구됩니다.' : '');
        connectionNote.hidden = !connectionNote.textContent;
        this.text('capture-destination-name', local?.sceneName ? 'OBS 현재 장면 · ' + local.sceneName : 'OBS 현재 선택된 장면');
        const stop = document.getElementById('capture-stop');
        stop.hidden = flow.action === 'stop' || !this.canPerform('stop-local', context);
        stop.disabled = flow.disabled;
        this.element.querySelector('[data-local-action="open-obs"]').disabled = !this.canPerform('open-obs', context);
    }
}

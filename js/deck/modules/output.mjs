import { DeckModule } from '../core/module.mjs';
import { panel } from './output-panel.mjs';

export class OutputDeckModule extends DeckModule {
    constructor(metadata) { super({ panel, ...metadata }); }
    source(context) { return context.deck.outputs?.[this.sourceKey]; }
    getState(context) { return { active: Boolean(this.source(context)?.running) }; }
    onEnter(context) { context.deck.currentOutput = this.id;  }
    bind(context) {
        const element = document.getElementById(this.panel.id);
        const whenActive = handler => event => { if (context.deck.view === this.id) return handler(event); };
        element.querySelectorAll('[data-output-action]').forEach(button => this.listen(button, 'click', whenActive(() => this.performAction(button.dataset.outputAction, context)), context));
    }
    canPerform(action, context) {
        const state = context.deck.outputs;
        if (!state?.supported || context.outputs?.busy || state.busy) return false;
        if (action === 'open-folder') return true;
        return !state.processError && this.canPerformOutput(action, state);
    }
    canPerformOutput(_action, _state) { return false; }
    performAction(action, context) {
        if (this.canPerform(action, context)) return context.outputs?.action(action);
    }
    text(id, value) { document.getElementById(id).textContent = value; }
    refresh(context) {
        const state = context.deck.outputs;
        const selected = this.source(context);
        this.text(this.sourceKey + '-state', this.statusText(state, selected));
        const panel = document.getElementById(this.panel.id);
        panel.querySelectorAll('[data-output-action]').forEach(button => {
            if (button.dataset.outputModule === this.id || (!button.dataset.outputModule && context.deck.currentOutput === this.id)) {
                button.disabled = !this.canPerform(button.dataset.outputAction, context);
            }
        });
        if (context.deck.currentOutput !== this.id) return;
        panel.querySelectorAll('[data-output-module]').forEach(element => { element.hidden = element.dataset.outputModule !== this.id; });
        const live = selected?.running ? selected : null;
        const config = live || selected?.config || {};
        panel.dataset.signal = live ? (live.healthy ? 'ready' : 'warning') : 'idle';
        this.text('output-video-summary', `${config.width || '—'} × ${config.height || '—'}`);
        this.text('output-fps-summary', `${config.fps || '—'} FPS`);
        this.text('output-audio-summary', live?.sample_rate ? `${live.sample_rate / 1000} kHz` : '입력 대기');
        this.text('output-buffer-summary', `${config.buffer_ms ?? '—'} ms`);
        this.text('output-module-note', this.note(state));
        this.text('audio-rate', live?.sample_rate ? `${live.sample_rate / 1000} kHz` : '—');
        const peak = Number(live?.audio_peak);
        this.text('audio-peak', Number.isFinite(peak) ? peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : '−∞ dBFS' : '—');
        document.getElementById('audio-meter-fill').style.width = Number.isFinite(peak) && peak > 0 ? `${Math.max(0, Math.min(100, (20 * Math.log10(peak) + 60) / 60 * 100))}%` : '0%';
        this.text('video-size', `${config.width || '—'} × ${config.height || '—'}`);
        this.text('video-fps', `${config.fps || '—'} FPS`);
        this.text('video-live-fps', live?.send_fps != null ? Number(live.send_fps).toFixed(1) : '—');
        this.text('video-drops', live?.late_video_drops ?? '—');
        this.text('sync-buffer', `${config.buffer_ms ?? '—'} ms`);
        this.text('sync-offset', `${config.audio_offset_ms ?? '—'} ms`);
        this.text('sync-verified', config.calibration_verified === true || config.calibration_verified === 'true' ? '설정에서 보정 완료로 표시되어 있습니다.' : '물리적 화면·오디오 싱크 미검증');
        const configPath = this.configPath(state, selected);
        this.text('local-origin', configPath ? '설정 파일: ' + configPath : '설정 경로를 확인하지 못했습니다.');
        this.text('ndi-capture-error', state?.processError || live?.capture_error || selected?.error || '보고된 캡처 오류 없음');
    }

}

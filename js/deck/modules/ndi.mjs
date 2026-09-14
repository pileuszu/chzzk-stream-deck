import { OutputDeckModule } from './output.mjs';

export class NdiDeckModule extends OutputDeckModule {
    constructor() {
        super({ id: 'ndi', label: 'NDI 송신', icon: 'send', accent: '#76dcf7', tint: '#183b47', eyebrow: 'NDI OUTPUT', description: '다른 PC로 보낼 NDI 송출과 상태를 관리합니다.' });
        this.sourceKey = 'ndi';
    }
    canPerformOutput(action, state) {
        if (!state.ndi?.built) return false;
        if (action === 'start-ndi') return !state.ndi.processRunning && !state.local?.running;
        if (action === 'stop-ndi') return Boolean(state.ndi.processRunning);
        return false;
    }
    statusText(state, ndi) {
        return ndi?.running ? (ndi.healthy ? '송출 중' : '캡처 확인 필요') : ndi?.processRunning ? '다른 경로에서 실행 중' : ndi?.built ? '대기' : state?.supported ? '빌드 필요' : '데스크톱 앱 필요';
    }
    note(state) { return state?.local?.running ? '로컬 캡처가 A1을 사용하고 있습니다. 로컬 캡처 모듈에서 캡처 중지를 누른 뒤 송출을 시작하세요.' : '송출을 시작하면 현재 화면과 A1 믹스를 로컬 네트워크에 전송합니다.'; }
    configPath(state) { return state?.root ? state.root + '/sender.ini' : ''; }
}

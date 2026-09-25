// The primary action always advances or retries the observed connection state.
export function localWorkflow(state, { dirty = false, busy = false, error = '' } = {}) {
    const local = state?.local || {}, setup = local.setup || {};
    const prepared = Boolean(local.installed && !setup.needsUpdate);
    const receiving = Boolean(local.running && local.healthy && local.controlAvailable && local.sourceAttached !== false);
    const streaming = Boolean(local.controlAvailable && local.streaming);
    const base = { prepared, receiving, streaming, setup: !prepared, step: !prepared ? 0 : receiving ? 2 : 1 };
    const result = (title, detail, action, label, status) => ({
        ...base, title, detail, action, label: busy ? '처리 중…' : label, status, disabled: busy
    });
    if (!state) return result('연결 상태를 확인하고 있습니다', 'OBS가 준비되면 다시 확인하세요.', 'refresh', '다시 시도', '확인 중');
    if (!state.supported) return result('데스크톱 앱에서 열어주세요', 'Windows 앱 또는 npm run app으로 실행하세요.', 'help', '실행 방법 보기', '앱 실행 필요');
    if (state.processError) return result('연결 상태를 확인하지 못했습니다', state.processError, 'refresh', '다시 시도', '확인 필요');
    if (!prepared) {
        if (setup.built === false || setup.missingTools) return result('먼저 캡처 엔진을 준비하세요', '빌드된 배포 앱을 사용하거나 저장소에서 npm run build:native를 실행하세요.', 'help', '빌드 방법 보기', '빌드 필요');
        if (setup.obsInstalled === false) return result('OBS Studio를 설치해 주세요', 'OBS Studio 32.0.1 x64 설치 후 다시 확인하세요.', 'help', '설치 방법 보기', 'OBS 설치 필요');
        if (local.processRunning) return result('OBS를 닫으면 연결 도구를 준비합니다', '방송·녹화를 마친 뒤 OBS를 종료하세요. 설정은 유지되며 다시 시도로 이어갈 수 있습니다.', 'refresh', 'OBS 닫았어요 · 다시 시도', 'OBS 종료 필요');
        return result(error ? '연결 준비를 다시 시도하세요' : 'OBS 연결 도구를 준비하세요',
            error || '처음 한 번 플러그인을 설치합니다. 소스는 전달 시작을 누르면 현재 OBS 장면에 자동으로 추가됩니다.',
            'prepare', error ? '연결 준비 다시 시도' : 'OBS 연결 준비', error ? '준비 실패' : '최초 준비');
    }
    if (state.ndi?.processRunning) return result('NDI가 오디오를 사용 중입니다', 'NDI 송신을 중지한 뒤 다시 시도하세요.', 'ndi', 'NDI 모듈 열기', 'NDI 사용 중');
    if (receiving && !error) return result(streaming ? 'OBS에서 방송 중입니다' : '이제 OBS에서 방송을 시작하세요',
        '현재 장면에 화면과 A1 오디오가 전달됩니다. 방송·녹화는 OBS에서 조절하세요.', 'stop', '전달 중지', 'OBS에 전달 중');
    const failure = error || local.capture_error || (local.fresh && local.error);
    if (failure) return result('연결을 완료하지 못했습니다', failure + ' 설정을 확인한 뒤 다시 시도하세요.',
        'start', dirty ? '저장하고 다시 시도' : '다시 시도', '연결 실패');
    if (local.processRunning && !local.controlAvailable) return result('OBS 연결을 다시 확인하세요',
        'OBS 초기 설정 창을 마친 뒤 다시 시도하세요. 계속 실패하면 OBS를 닫고 다시 열어주세요.',
        'start', '연결 다시 시도', '연결 대기');
    return result('현재 OBS 장면에 연결하세요', '소스가 없으면 자동으로 추가합니다. 기존 캡처 소스는 다시 연결하며 중복 생성하지 않습니다.',
        'start', dirty ? '저장하고 OBS에 연결' : local.processRunning ? 'OBS에 연결' : 'OBS 열고 연결', '전달 대기');
}

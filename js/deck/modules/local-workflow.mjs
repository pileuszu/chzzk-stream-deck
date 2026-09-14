// Derive the next task from observed state, never from a dismissed onboarding flag.
export function localWorkflow(state, { dirty = false, busy = false } = {}) {
    const local = state?.local || {}, setup = local.setup || {};
    const prepared = Boolean(local.installed && local.registered);
    const receiving = Boolean(local.running && local.healthy && local.controlAvailable);
    const streaming = Boolean(local.controlAvailable && local.streaming);
    const base = { prepared, receiving, streaming, setup: !prepared, step: !prepared ? 0 : receiving ? 2 : 1 };
    const result = (title, detail, action, label, status) => ({
        ...base, title, detail, action, label: busy ? '처리 중…' : label, status, disabled: busy
    });
    if (!state) return result('연결 상태를 확인하고 있습니다', 'OBS와 캡처 소스의 준비 상태를 확인합니다.', 'refresh', '다시 확인', '확인 중');
    if (!state.supported) return result('데스크톱 앱에서 열어주세요', '로컬 캡처는 Windows 데스크톱 앱에서 사용할 수 있습니다. 클론한 경우 npm run app으로 실행하세요.', 'help', '실행 방법 보기', '앱 실행 필요');
    if (state.processError) return result('연결 상태를 확인하지 못했습니다', state.processError, 'refresh', '다시 확인', '확인 필요');
    if (!prepared) {
        if (setup.built === false || setup.missingTools) return result('먼저 캡처 엔진을 준비하세요', '소스를 클론했다면 네이티브 모듈 빌드가 한 번 필요합니다. 빌드된 배포 앱에는 포함되어 있습니다.', 'help', '빌드 방법 보기', '빌드 필요');
        if (setup.obsInstalled === false) return result('OBS Studio를 설치해 주세요', '이 캡처 플러그인은 OBS Studio 32.0.1 x64 설치를 기준으로 동작합니다.', 'help', '설치 방법 보기', 'OBS 설치 필요');
        if (local.processRunning) return result('OBS를 닫고 소스를 준비하세요', '소스 설치·등록은 OBS가 닫혀 있을 때 진행합니다. OBS를 종료한 뒤 아래에서 다시 확인하세요.', 'refresh', '닫았어요 · 다시 확인', 'OBS 종료 필요');
        if (setup.initialized === false) return result('OBS를 한 번 실행해 주세요', 'OBS의 초기 설정을 마친 뒤 종료하세요. 다음 단계에서 화면과 소리를 받을 소스를 추가합니다.', 'initialize', 'OBS 처음 열기', '초기 설정 필요');
        if (setup.conflict) return result('기존 A1 Local 설정을 확인하세요', '같은 이름의 장면이나 프로필이 있습니다. 기존 설정을 덮어쓰지 않도록 연결 방법을 확인하세요.', 'help', '연결 방법 보기', '기존 설정 확인');
        return result('OBS 소스를 준비하세요', '플러그인을 설치하고 A1 Local 프로필·장면에 화면과 A1 오디오를 받는 소스를 추가합니다.', 'prepare', 'OBS 소스 준비', '최초 준비');
    }
    if (local.running || local.captureRequested) {
        if (!receiving) return result('OBS 신호를 확인하고 있습니다', local.capture_error || local.error || '화면과 오디오 입력을 확인 중입니다. 계속 대기하면 연결·진단 정보를 확인하세요.', 'stop', '전달 중지', '신호 확인');
        return result(streaming ? 'OBS에서 방송 중입니다' : '이제 OBS에서 방송을 시작하세요',
            streaming ? '이 PC의 화면과 A1 오디오가 OBS에 전달되고 있습니다.' : 'OBS 미리보기에서 화면과 오디오 미터를 확인한 뒤, OBS의 방송 시작을 누르세요.',
            'stop', '전달 중지', 'OBS에 전달 중');
    }
    if (state.ndi?.processRunning) return result('NDI가 오디오를 사용 중입니다', 'NDI 모듈에서 송신을 중지한 뒤 돌아오면 이 PC의 OBS로 전달할 수 있습니다.', 'ndi', 'NDI 모듈 열기', 'NDI 사용 중');
    if (local.processRunning && !local.controlAvailable) return result('OBS에서 A1 Local을 선택하세요',
        'OBS의 프로파일과 장면 모음을 모두 A1 Local로 바꿔주세요. 선택 후 연결 상태를 다시 확인합니다.', 'help', '연결 방법 보기', 'OBS 연결 대기');
    return result('설정한 화면을 OBS로 보내세요', '화면과 A1 믹스를 A1 Local 장면으로 전달합니다. 방송·녹화는 OBS에서 시작하세요.',
        'start', dirty ? '저장하고 OBS로 전달' : local.processRunning ? 'OBS로 전달 시작' : 'OBS 열고 전달 시작', '전달 대기');
}

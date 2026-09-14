# Stream Deck에서 화면·A1 출력 사용하기

이 폴더는 같은 저장소에 포함된 NDI 송신기와 OBS 로컬 소스의 공통 런타임입니다. NDI 설정은 `sender.ini`, 로컬 캡처 설정은 `local-capture.ini`에 있습니다.

| 모드 | 동작 | 시작·종료 |
|---|---|---|
| NDI 송신 | 화면과 A1 최종 믹스를 다른 PC의 NDI 수신기로 전송 | 앱의 NDI 송출 시작·중지, 또는 `start.bat`·`stop.bat` |
| 로컬 캡처 | 같은 캡처와 버퍼를 이 PC의 OBS 소스에 직접 공급 | 앱의 캡처 시작·중지. `start-obs.bat`는 OBS를 열고, OBS 종료 시에도 캡처 종료 |

두 모드는 같은 A1 캡처를 사용하므로 하나씩 실행합니다. 전환할 때 기존 모드를 먼저 종료하세요.
X로 닫으면 트레이로 숨기며 모듈은 계속 실행됩니다. 트레이 우클릭 → 종료는 NDI·로컬 A1 캡처·채팅을 중지한 다음 서버와 앱을 종료합니다. OBS 프로그램 자체는 유지됩니다. Windows 로그인 시 자동 시작하지 않습니다.
NDI 시작은 실제 바탕화면과 A1 소리를 LAN에 전송합니다. OBS 열기는 녹화나 인터넷 방송 시작 버튼을 누르지 않습니다.

## 설치

Windows x64, 실행 중인 Voicemeeter와 정상 출력 중인 A1이 필요합니다. NDI 모드에는 NDI 6 런타임도 필요합니다.
OBS 로컬 모드는 **OBS Studio 32.0.1 x64**에 고정되어 있으며 NDI 런타임을 사용하지 않습니다.

소스를 클론했다면 저장소 루트에서 `npm ci`, `npm run build:native`, `npm run app`을 실행합니다.
빌드에는 VS 2022 C++ Build Tools, Windows SDK, CMake 3.24 이상이 필요합니다.
NDI만 빌드하려면 `npm run build:ndi`를 사용할 수 있습니다.

빌드된 앱에는 두 네이티브 바이너리가 포함됩니다. 앱은 실행 시 `%APPDATA%/chzzk-stream-deck/a1-output`에
런타임을 준비합니다(실제 경로는 앱의 모듈 폴더 버튼으로 확인). 설정과 로그는 임시 압축 해제 폴더에 두지 않습니다.
앱을 업데이트해도 기존 `sender.ini`와 `local-capture.ini`는 유지합니다.

### OBS 최초 등록

OBS를 한 번 실행해 초기 설정을 만든 뒤 **종료**하고 이 폴더에서 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-OBSPlugin.ps1
python tools\setup_obs_local.py
```

플러그인은 ProgramData에 설치하므로 권한 오류가 나면 설치 단계만 관리자 PowerShell에서 실행합니다.
장면 등록은 본인 Windows 계정으로 실행하세요. 자동 장면 등록에는 Python 3가 필요합니다.
`A1 Local` 프로파일·장면 모음에 `A1 Desktop + Audio` 소스를 생성합니다.
자동 생성된 녹화 설정은 NVIDIA NVENC 기준입니다. 다른 GPU에서는 OBS에서 녹화 인코더를 변경하세요.
방송 계정·스트림 키는 별도로 OBS에서 설정합니다.

Python 없이 직접 등록하려면 OBS에서 `A1 Desktop Sync (Local)` 소스를 추가하고 구성 파일에 이 폴더의
`sender.ini`를 지정하세요. 이 경우 앱의 자동 OBS 열기/상태 탐지는 `A1 Local` 자동 등록 방식에 맞춰져 있으므로
직접 구성한 OBS 장면은 OBS에서 관리합니다. 중복 오디오 입력과 소스 모니터링은 꺼 주세요.

### 기존 설치를 사용하거나 이 폴더로 옮기기

앱은 기존 `A1_Local.json`의 구성 파일 경로를 읽어 이전 설치의 실제 상태를 표시합니다.
자동으로 기존 장면이나 플러그인을 교체하지 않습니다. 이전 폴더는 경로를 옮기기 전까지 유지하세요.

이 폴더로 옮기려면 OBS를 종료한 뒤 설치 명령과 아래 명령을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-OBSPlugin.ps1
python tools\setup_obs_local.py --relink
```

이 명령은 기존 NDI·로컬 설정값을 보존해 복사하고 OBS의 실행/저장 구성 경로와 A1 스크립트를 이전합니다. 중지된 캡처는 중지 상태를 유지하며, 이전 로그 폴더를 가리키는 녹화 출력 경로도 이전합니다. 변경 전 파일은 `logs/obs-relink-*`에 백업합니다.
기존 OBS 장면 배치·방송 계정과 이전 녹화 파일은 유지합니다. [저장소 통합 안내](../../docs/REPOSITORY.md)를 참고하세요.

## 설정과 동기화

기본값은 1920×1080, 30 FPS, 공통 버퍼 500 ms, 추가 오디오 보정 0 ms입니다.
NDI와 OBS가 `src/aligned_capture.hpp`의 화면·A1 캡처, 타임스탬프 정렬과 큐를 공유합니다.
NDI는 한 스트림으로 전송하고 OBS는 로컬 소스에 영상·오디오를 직접 전달합니다.

A1에 섞인 마이크·기타·컴퓨터 소리의 상대 타이밍을 보존합니다. 헤드폰 경로에는 500 ms를 추가하지 않습니다.
**물리적인 모니터·헤드폰 지연까지 자동 측정해서 완벽히 맞춘다는 의미는 아닙니다.**
`calibration_verified=false`는 실제 환경의 화면/오디오 보정이 아직 검증되지 않았다는 뜻입니다.
상세한 검증 범위는 `VALIDATION.md`에 있습니다. `sender.ini` 변경은 송신기/OBS 소스 재시작 후 적용됩니다.

## 상태와 문제 해결

- NDI 상태: `logs/status.json`. OBS 상태: 해당 소스 구성 파일 옆 `logs/obs-status.json`.
- 앱은 프로세스와 최근 8초 안의 상태 갱신을 함께 확인합니다. 오래된 로그를 송출 중으로 표시하지 않습니다.
- `빌드 필요`: `npm run build:ndi` 또는 `npm run build:native` 실행.
- `설치·등록 필요`: 위의 OBS 최초 등록 절차 실행.
- `OBS에서 A1 Local 선택`: OBS 프로파일과 장면 모음을 모두 A1 Local로 선택.
- NDI 시작 시 A1 사용 중 오류: 로컬 캡처 모듈에서 캡처 중지를 누르세요. 제어 도구가 없는 기존 설치에서는 OBS의 A1 소스를 제거하거나 OBS를 종료합니다. 소스 숨기기만으로는 캡처가 해제되지 않습니다.
- 웹 브라우저의 `npm start` 모드는 채팅용입니다. 네이티브 제어는 `npm run app`의 Electron 창에서 가능합니다.
- NDI는 High Bandwidth 방식입니다. 기가비트 유선 LAN을 권장하며 100 Mbps 망에서 1080p30 안정성을 보장하지 않습니다.

라이선스·런타임 의존성은 `third_party/README.md`와 `obs-plugin/COPYING`을 참고하세요.

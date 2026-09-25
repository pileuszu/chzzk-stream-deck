# CHZZK Stream Deck v3.0.1

**로컬 캡처 · NDI 송신 · CHZZK 채팅을 한 앱에서 관리하는 스트림덱**

이 저장소 하나에 Electron 앱, 세 모듈과 공통 캡처 엔진이 들어 있습니다. 별도의 `a1-ndi-sender` 저장소는 필요하지 않습니다.

```text
chzzk-stream-deck/
├── main.js, src/             # 앱·모듈 제어
├── js/deck/, css/            # 덱과 각 모듈 패널
├── native/a1-output/
│   ├── src/                  # 화면·A1 캡처, 싱크 버퍼, NDI 출력
│   ├── obs-plugin/           # 같은 엔진을 쓰는 OBS 로컬 소스
│   └── tools/                # OBS 등록·기존 설정 이전
├── scripts/, test/           # 전체 앱 빌드·검증
└── docs/                     # 사용·개발 안내
```

저장소 루트에서 `npm ci` → `npm run build:native` → `npm run app`으로 실행합니다. 준비 후에는 루트의 `start.bat`로 앱을 열 수 있습니다. 앱을 열어도 방송은 자동 시작하지 않습니다.

개인 캡처 설정(`sender.ini`, `local-capture.ini`), 로그·녹화, 빌드 결과와 `.local-backups/`는 Git과 앱 배포에서 제외합니다. 기본 설정은 `native/a1-output/sender.example.ini`로 공유합니다. 배포 앱의 사용자 설정은 `%APPDATA%/chzzk-stream-deck/a1-output`에 보존됩니다. 이는 별도 저장소가 아닌 앱 실행 데이터입니다.

이전 독립 송신기 폴더를 사용했다면 [단일 저장소로 이전하기](docs/REPOSITORY.md)를 참고하세요.


## 화면·A1 오디오 출력 모듈 (Windows)

대시보드에 **NDI 송신**과 **로컬 캡처**를 추가했습니다.
Voicemeeter A1 최종 믹스와 화면 캡처·공통 버퍼를 공유하고 출력 방식만 선택합니다.

| 모듈 | 용도 | 대시보드 제어 |
|---|---|---|
| NDI 송신 | 다른 PC에 화면과 A1 소리를 한 NDI 소스로 전달 | 송출 시작 / 중지 |
| 로컬 캡처 | 이 PC의 OBS에 화면과 A1 소리를 직접 공급 | 설정 저장·적용 / 캡처 시작·중지 |

설치: `npm ci` → `npm run build:native` → `npm run app`.
빌드 도구: Windows x64, VS 2022 C++ Build Tools, Windows SDK, CMake 3.24+.
실행 시 Voicemeeter가 필요하고 NDI 모드에만 별도 NDI 6 런타임이 필요합니다.
OBS 로컬 플러그인은 **OBS 32.0.1 x64**에 맞춰 빌드·검증합니다.
처음 사용하는 OBS에는 플러그인 설치와 장면 등록이 필요합니다.

자세한 설치·실행·기존 소스 이전·동기화 범위는 **[출력 모듈 안내](native/a1-output/OUTPUT-MODULES.md)**를 참고하세요.
앱을 여는 것만으로 기존 OBS 설정을 바꾸지 않습니다. 사용자가 저장·시작·중지·적용을 누르면 해당 A1 캡처를 제어합니다. 두 캡처 모드는 동시에 실행하지 않습니다.
NDI 송출 시작은 실제 화면과 A1 믹스를 LAN으로 전송하며, OBS 열기는 녹화·방송을 자동 시작하지 않습니다.

기본값: 1920×1080 / 30 FPS / 공통 버퍼 500 ms / 추가 오디오 보정 0 ms.
A1에 섞인 소리의 상대 타이밍을 보존하지만 물리적인 모니터·헤드폰 지연을 자동 교정하지는 않습니다.
`npm start`의 웹 모드는 채팅용이며 네이티브 실행 제어는 Electron 앱에서만 가능합니다.

검증: `npm run test:outputs`(제어·기존 설치 탐지·IPC·로그 보호), `npm run build:native`(C++ 빌드·타이밍 테스트).
Windows 앱 패키징 전 두 모듈을 빌드하세요. 패키징은 바이너리와 해당 소스를 함께 포함하며 로그·녹화·SDK 다운로드는 제외합니다.
NDI/Voicemeeter 런타임은 배포하지 않습니다. OBS 플러그인의 GPL 조건은 [제3자 안내](native/a1-output/third_party/README.md)를 참고하세요.

## 스트림덱 UI

**페이지마다 5열 × 3행**을 유지합니다. **11번은 이전 페이지, 15번은 다음 페이지**로 고정하고 나머지 13칸을 모듈용으로 사용합니다. 캡처 상태 전용 슬롯은 표시하지 않습니다. 별도 하단 상태바와 페이지 바는 없습니다. 현재는 **로컬 캡처 · NDI 송신 · CHZZK 채팅** 3개를 배치하고 모듈용 빈 칸 10개를 남깁니다.
모듈을 좌클릭하면 같은 화면이 해당 모듈의 설정 화면으로 전환됩니다. 뒤로가기와 모듈명을 맨 위 창 제어 줄에 표시해 별도 제목 줄을 없앴습니다. 기본 창 640×440을 유지하며 설정 화면의 실행·저장 버튼은 하단에 고정합니다.

- **버튼 편집**(연필)을 누르면 같은 덱에서 모듈을 드래그해 배치합니다. 빈칸에 놓으면 이동하고 다른 모듈 위에 놓으면 서로 교환하며 즉시 저장합니다. 드래그 카드는 탄력적으로 따라오며 속도에 따라 기울어지고, 교환·안착할 때 주변 카드도 반응합니다. 별도 편집 패널은 없습니다. 편집 중 클릭은 모듈을 실행하지 않습니다. 연필을 다시 누르거나 Esc로 편집을 끝냅니다.
- 11·15번 **이전·다음 페이지** 슬롯 또는 **Page Up / Page Down**으로 이동합니다. 현재/전체 페이지 수는 이전 페이지 슬롯 안에 표시됩니다.
- 드래그한 채 이전·다음 페이지 키 위에 잠시 머무르면 기존 페이지를 넘길 수 있습니다. 드래그 중 Esc, 덱 바깥이나 페이지 키에 놓기는 취소입니다. 페이지 이동 키(11·15번)는 옮길 수 없습니다.
- 편집 모드에서 마지막 페이지의 15번 키를 클릭하면 **페이지 추가**가 됩니다. 빈 페이지에서는 상단에 삭제 아이콘이 표시됩니다. 모듈이 있는 페이지와 마지막 한 페이지는 삭제되지 않습니다.
- 키보드로는 편집 모드에서 Space/Enter로 모듈을 선택하고 방향키로 이동한 뒤 Space/Enter로 놓습니다. Page Up/Down으로 페이지를 바꾸고 Esc로 선택을 취소할 수 있습니다.
- 페이지별 배치와 마지막 페이지를 저장합니다. 기존 배치에서 새 페이지 이동 슬롯과 겹치는 모듈은 빈 모듈 슬롯으로 옮기고, 공간이 부족하면 새 페이지를 만듭니다. 원래 배치 데이터는 보관합니다. 이후 등록한 모듈도 빈 칸에 배치하고 페이지당 13개를 초과하면 자동으로 확장합니다.
- 로컬 캡처는 화면·오디오·싱크 설정을 편집하고 하단에서 저장·적용·시작·중지를 조작합니다. NDI 패널은 요약·오디오·화면·싱크 상태를 표시합니다. NDI와 로컬 캡처의 A1 사용은 동시에 실행되지 않습니다.
- 채팅 화면에는 연결·해제, 채널과 표시 설정, 브라우저 소스 주소 복사가 있습니다. 설정 저장 후에도 같은 화면에 머무릅니다. 저장하지 않고 뒤로 가면 변경사항은 버려집니다.
- 상단 브랜드 영역을 끌어 창을 이동합니다. 오른쪽 도구로 고정·최소화·최대화·트레이로 숨기기를 사용합니다.
- 방향키로 모듈을 이동하고 Enter/Space로 엽니다. 화면 왼쪽 위 뒤로 가기, Esc 또는 Alt+←로 모듈 목록에 돌아옵니다. 목록에서 Esc를 누르면 편집 모드를 마칩니다.
- 아이콘은 로컬 SVG, 키캡은 CSS로 그리므로 UI 표시를 위한 외부 CDN 연결이 필요 없습니다.

UI 글꼴은 앱에 내장된 **[Pretendard Variable](https://github.com/orioncactus/pretendard)**입니다. 인터넷 연결 없이 사용되며, 폰트의 SIL OFL 1.1 라이선스는 [폰트 라이선스](assets/fonts/pretendard/LICENSE.txt)에 포함되어 있습니다.

슬롯의 베젤·아이콘 크기·제목 크기·정렬은 하나의 공통 렌더러와 CSS 규격을 사용합니다. 페이지 번호는 별도 고정 위치에 표시해 제목 위치가 변하지 않습니다.

모듈은 `DeckModule`을 상속하며, OBS·NDI는 출력 공통 계층 `OutputDeckModule`을 한 번 더 상속합니다. 새 모듈 추가 방법과 생명주기는 **[모듈 개발 안내](docs/DECK-MODULES.md)**를 참고하세요.

모듈 계약·실행 가드 검증: `npm run test:deck`.

로컬 캡처에서 **OBS 연결 준비** 후 **OBS 열고 연결**을 누르면 현재 OBS 장면에 화면·A1 오디오 소스를 자동으로 추가합니다. 소스 목록이 비어 있어도 되며, 실패 시 설정을 유지하고 **다시 시도**할 수 있습니다. 실제 방송·녹화는 OBS에서 시작합니다. [로컬 캡처 사용법](docs/LOCAL-CAPTURE.md)을 참고하세요.

채팅은 채널 연결, 표시 설정, 실제 테마 미리보기를 한 화면에서 관리합니다. 재생으로 메시지 유지 시간과 사라짐을 확인하며, 저장 전에는 예시에만 반영됩니다. [미리보기 안내](docs/CHAT-PREVIEW.md)를 참고하세요.

UI 검증: `npx electron test/smoke-deck.cjs`. 별도 테스트 프로필에서 모듈 배치 이전·편집·제어 패널·창 제어를 확인하며 송출은 시작하지 않습니다.

## 트레이와 리소스 관리

- **X / Alt+F4**는 창을 트레이로 숨깁니다. 실행 중인 캡처·NDI·채팅과 브라우저 소스 서버는 계속 동작합니다. 숨겨진 창은 화면 상태 조회를 쉽니다.
- 시계 옆 **CHZZK Stream Deck** 아이콘을 클릭하거나 우클릭 → **스트림덱 열기**로 복원합니다. 실행 파일을 다시 열어도 같은 창을 복원합니다.
- 트레이 우클릭 → **종료**는 진행 중인 작업을 기다린 뒤 로컬 A1 캡처, NDI 송신기, 채팅 프로세스를 정리하고 서버·트레이·앱을 종료합니다. 일부 모듈이 종료되지 않으면 오류를 표시하고 재시도할 수 있도록 앱을 유지합니다.
- 특정 모듈만 멈추려면 그 모듈의 **캡처 중지 / 송출 중지 / 연결 해제**를 누릅니다. 나머지 모듈과 앱은 유지됩니다.
- 로컬 캡처 종료는 OBS 안의 A1 캡처 자원을 해제합니다. OBS 자체와 FL Studio·Voicemeeter는 별도 앱이므로 종료하지 않습니다. Windows 로그인 시 자동 실행을 추가하지 않습니다.

앱 로고 원본은 [icon.svg](icon.svg)입니다. 상단 로고·브라우저 아이콘에 같은 파일을 사용하고, Windows 창·트레이·실행 파일용 PNG/ICO는 `npm run build:icons`로 생성합니다. 생성물도 저장소에 포함되어 일반 빌드에 재생성이 필요하지 않습니다.

구현 계약과 검증: [앱 생명주기](docs/APP-LIFECYCLE.md), `npm run test:lifecycle`.

## Quick Start

### Method 1: Run Electron App (Recommended)

1. **Install Dependencies**
```bash
npm install
```

2. **Run Electron App**
```bash
npm run app
```
The app will automatically start the server and open a browser window.

### Method 2: Run in Web Browser

1. **Install Dependencies**
```bash
npm install
```

2. **Start Server**
```bash
npm start
```

3. **Access Dashboard**
- **Main Dashboard**: http://localhost:7112 (or the port set in config.json)
- **Chat Overlay**: http://localhost:7112/chat-overlay.html

### Configuration File (config.json)

You can create a `config.json` file in the project root to configure the port and host:

```json
{
  "port": 7112,
  "host": "localhost"
}
```

The default port is 7112.

## Build and Deployment

### v3.0.1 배포 파일 만들기

Windows x64에서 Node.js 24, Python 3, VS 2022 C++ Build Tools, Windows SDK, CMake 3.24+를 준비합니다.

```powershell
npm ci
npm run build:release
```

이 명령 하나로 버전 확인, 자동 테스트, NDI·OBS 로컬 모듈 빌드, 포터블 앱 패키징, SHA-256 생성을 차례로 실행합니다. 실행 중인 개발 앱과 충돌하지 않도록 배포 결과는 `dist/release/`에 생성합니다.

- `CHZZK-Stream-Deck-3.0.1-win-x64-portable.exe`: 사용자가 다운로드해 실행하는 단일 파일.
- `SHA256SUMS.txt`: 다운로드 무결성 확인용.
- `RELEASE-NOTES.md`: GitHub Release 본문에 사용할 안내.

`dist/` 전체는 Git에서 제외합니다. 소스와 빌드 설정만 커밋하고 실행 파일은 GitHub Release의 첨부 파일로 배포합니다. GitHub가 자동 제공하는 **Source code** ZIP은 실행 파일이 아닙니다.

변경사항을 커밋·푸시한 뒤 `v3.0.1` 태그를 푸시하면 GitHub Actions가 같은 명령으로 새로 빌드해 Release를 만들고 EXE·체크섬을 첨부합니다. `main`·`develop` 푸시와 PR에서는 빌드 아티팩트만 생성합니다. 태그와 `package.json`·`package-lock.json` 버전이 다르면 게시하지 않습니다.

v3.0.1은 버전·배포 문서를 갱신한 릴리스입니다. 기능과 캡처 엔진은 v3.0.0과 동일하며 성능 최적화 변경은 포함하지 않습니다.

정확한 순서와 재실행 방법은 [빌드·릴리스 안내](docs/RELEASES.md)를 참고하세요.

## Project Structure

```
chzzk-stream-deck/
├── .github/
│   └── workflows/               # CI/CD workflows
│       ├── build.yml            # Automated build workflow
│       ├── build-release.yml    # Release build workflow
│       └── test.yml             # Test workflow
├── assets/
│   └── images/                  # Image resources
├── css/
│   ├── components.css           # Component styles
│   ├── main.css                 # Main styles
│   └── themes.css               # Theme definitions
├── dist/                        # Build output (auto-generated)
├── js/
│   ├── config/
│   │   └── constants.js         # Application constants
│   ├── modules/
│   │   └── chat.js              # Chat module
│   ├── utils/
│   │   ├── settings.js          # Settings management
│   │   └── ui.js                # UI utilities
│   └── main.js                  # Main application
├── scripts/
│   ├── clear-cache.js           # Cache clearing script
│   └── kill-electron.js         # Electron process termination
├── src/
│   ├── chat-client.js           # CHZZK chat client
│   └── chat-overlay.html        # Chat overlay for OBS
├── main.js                      # Electron main process
├── server.js                    # Backend server
├── index.html                   # Main dashboard
├── config.json                  # Server configuration file
└── package.json                 # Project configuration
```

## Configuration and Usage

### Server Configuration (config.json)

Create or modify the `config.json` file in the project root to configure server port and host:

```json
{
  "port": 7112,
  "host": "localhost"
}
```

**Note**: 
- The Electron app automatically reads this configuration file on launch
- In built apps, `config.json` in the same directory as the executable takes priority

### Chat Module Setup

1. **Open Dashboard**
   - Electron App: Opens automatically
   - Web Browser: Navigate to http://localhost:7112

2. **Enter Channel ID**
   - Enter the 32-character alphanumeric combination found at the end of your CHZZK channel URL
   - Example: `42597020c1a79fb151bd9b9beaa9779b`

3. **Configure Display Settings**
   - Select theme (Simple Purple, etc.)
   - Set message display duration
   - Choose alignment (default/left/right/center)
   - Set maximum nickname length

4. **Start Chat Module**
   - Toggle the switch to start the chat module
   - The chat client will automatically run in the terminal

## OBS Integration

### Chat Overlay Setup

1. **Add Browser Source in OBS**
   - Open OBS Studio
   - Add "Browser Source" from the sources list

2. **Configure URL**
   - URL: `http://localhost:7112/chat-overlay.html` (or your configured port)
   - Width: 400px (recommended)
   - Height: 600px (recommended)

3. **CSS Settings (Optional)**
   ```css
   body { 
     background: transparent !important; 
   }
   ```

4. **Refresh Settings**
   - Click "Refresh Browser" button to verify
   - Enable "Shutdown source when not visible" if needed

## API Endpoints

### Chat Management
- `POST /api/chat/start` - Start chat monitoring
- `POST /api/chat/stop` - Stop chat monitoring
- `GET /api/chat/stream` - Real-time chat stream (SSE)
- `GET /api/chat/messages` - Retrieve chat messages

### Server Status
- `GET /api/status` - Get server and module status
- `GET /api/config` - Get server configuration information

### Pages
- `GET /` - Main dashboard
- `GET /chat-overlay.html` - Chat overlay for OBS

## Requirements

### System Requirements
- **Node.js**: 14.0.0 or higher (for development)
- **npm**: 6.0.0 or higher
- **Windows**: Windows 10 or higher (for running built app)
- **Browser**: Modern browser with ES6+ support (for web mode)

### CHZZK Requirements
- Valid CHZZK channel ID
- Active live stream for real-time chat

### Build Requirements
- Node.js 18 or higher (for CI/CD builds)
- Windows build: Windows environment or GitHub Actions

## Theme System

채팅 테마는 **Simple Purple**, **Unicorn Overlord**, **Maplestory** 세 가지입니다. 로켓·별, Unicorn 프레임 이미지, 단풍잎 장식을 사용합니다. Maplestory 테마는 크림색 말풍선과 단풍잎으로 구성합니다. 미리보기와 OBS 오버레이는 같은 테마 파일을 렌더링합니다.

Unicorn 프레임은 원본 이미지 조각을 하나의 캔버스에 이어 그립니다. 접합점을 실제 픽셀 경계에 맞춰 미리보기 축소 시 틈을 방지하고, 처음 표시되거나 크기가 바뀔 때만 다시 그립니다. 이름표는 본문 프레임 상단에 겹쳐 표시됩니다.

테마를 선택하면 먼저 미리보기에만 반영됩니다. **설정 저장**을 누르면 서버의 사용자 설정 파일에 저장하고 연결된 OBS 브라우저 소스에 즉시 전달합니다. 채팅 연결 해제·재연결이나 앱 재실행 후에도 저장한 테마를 유지합니다. 저장 실패 시 편집값을 유지하므로 같은 버튼으로 다시 저장할 수 있습니다.

OBS 주소는 `/chat-overlay.html`을 사용합니다. 앱과 OBS는 서로 다른 브라우저 저장소를 쓰므로 테마 적용에 localStorage 공유를 요구하지 않습니다. 이전 앱의 설정은 첫 실행에 한 번 이전하며, 잘못 추가됐던 Clean·Neon Green 선택값은 Simple Purple로 정리합니다.

## Troubleshooting

### Common Issues

#### Server Connection Failed (ERR_CONNECTION_REFUSED)
- **Cause**: Server not started or port conflict
- **Solution**:
  1. Using Electron App: The app automatically starts the server, wait a moment and retry
  2. Web Mode: Verify server is running with `npm start`
  3. Port Conflict: Use a different port in `config.json` or terminate existing processes
  4. Press F12 to open DevTools and check console for detailed errors

#### Chat Module Start Failed
- **Cause**: Server not ready yet or channel ID error
- **Solution**:
  1. Wait a few seconds after app launch before retrying (automatic retry logic included)
  2. Verify channel ID is correct (32-character alphanumeric)
  3. Confirm CHZZK channel is live
  4. Check error messages in DevTools console

#### CSS Not Loading (Built App)
- **Cause**: Static file path issue
- **Solution**:
  1. Use latest build files
  2. Ensure you're using the entire `dist/win-unpacked` folder
  3. Open DevTools with F12 and check Network tab for CSS file loading

#### Build Failure
- **Cause**: Windows Developer Mode disabled or port conflict
- **Solution**:
  1. Windows 11: Settings → Privacy & Security → For developers → Enable Developer Mode
  2. Or use CI/CD to build automatically via GitHub Actions
  3. Terminate running Electron processes before rebuilding

#### Chat Messages Not Appearing
- **Cause**: Server connection issues or API limitations
- **Solution**:
  1. Check server status at `/api/status`
  2. Check browser console for errors
  3. Verify firewall settings
  4. Confirm chat module is enabled

## Development

### Running in Development Mode

```bash
# Run Electron app (recommended)
npm run app

# Or run server only
npm start

# Development server (uses nodemon, auto-restarts on file changes)
npm run dev

# Run chat client directly (for testing)
node src/chat-client.js <CHANNEL_ID>
```

### Build Scripts

```bash
# Build for Windows
npm run build:win

# Build portable version
npm run build:win:portable

# Test, build both capture modules, and produce the release EXE + checksums
npm run build:release
```

### Module Development

Each module is developed independently and can be extended:
- **Chat Module**: `js/modules/chat.js`
- **UI Management**: `js/utils/ui.js`
- **Settings Management**: `js/utils/settings.js`

### Debugging

In built app:
- **F12**: Open DevTools (works in built app)
- **Ctrl+Shift+I**: Open DevTools (alternative shortcut)

In development mode:
- Check console logs
- Verify API calls in Network tab
- Server logs can be viewed in Electron console

## License

MIT License

---

For technical support and bug reports, please create an issue in the repository.

### 로컬 캡처 설정과 실행 제어

**로컬 캡처** 패널에서 화면·오디오·싱크 설정을 편집하고 캡처를 시작·중지합니다. **저장**은 다음 시작용 설정만 저장하고, 실행 중 **저장 후 적용**은 소스를 재시작해 반영합니다. NDI 설정과 분리된 local-capture.ini를 사용합니다. [사용법과 기존 설치 갱신 안내](docs/LOCAL-CAPTURE.md)를 참고하세요.

### NDI 전송 대상 선택

**NDI 송신 → 전송 대상**에서 **화면 + 소리** 또는 **소리만**을 선택합니다. 중지 상태에서는 **설정 저장** 후 시작하거나 **저장하고 송출**을 누르세요. 실행 중에는 **변경 적용**으로 송신기를 잠시 재시작합니다. 재시작이 실패해도 저장된 모드는 유지되며 **송출 시작**으로 다시 시도할 수 있습니다.

같은 패널에서 시작 전에 해상도·FPS·화면 번호·전송 버퍼·오디오 보정을 설정할 수 있습니다. **소리만 → 전송 버퍼 0 ms / 오디오 보정 0 ms**로 설정하면 송신기의 추가 대기 없이 A1 오디오를 전달합니다. 오인페·네트워크·수신 프로그램의 지연은 별도로 남습니다. 소리만 모드의 버퍼 범위는 0~2000 ms이고 보정 절댓값은 버퍼 이하입니다. 화면 + 소리는 기존 200~2000 ms 버퍼와 100 ms 이상의 보정 여유를 유지합니다. 영상 옵션은 소리만 모드에서 숨기며 저장값은 유지합니다. NDI 설정을 바꿔도 로컬 캡처 설정은 바뀌지 않습니다.

**소리만**은 화면 캡처 스레드·GPU 캡처 자원·영상 큐·NDI 영상 전송을 사용하지 않습니다. 검은 영상으로 대체하지 않으므로 영상 대역폭이 발생하지 않습니다. A1 최종 믹스, 오디오 타임스탬프, 버퍼·보정값과 헤드폰 모니터링 경로는 유지합니다. 받는 PC는 동일한 NDI 소스 이름을 사용합니다. 수신 프로그램에 따라 전환 전 마지막 영상이 남아 보일 수 있으나 새 영상은 전송하지 않습니다.

선택은 NDI용 `sender.ini`의 `output_mode=audio_video` 또는 `output_mode=audio_only`로 저장됩니다. 키가 없는 기존 설정은 화면+소리로 동작하며 로컬 OBS 캡처 모드는 변경하지 않습니다. 네이티브 변경 후에는 `npm run build:native`로 빌드하세요. 실제 Voicemeeter와 NDI 런타임이 있는 Windows에서 `python test/smoke-ndi-modes.py`로 수신 영상 0프레임·정상 오디오와 기존 영상 모드를 검증할 수 있습니다. 테스트는 다른 A1 캡처를 종료한 상태에서 실행합니다.

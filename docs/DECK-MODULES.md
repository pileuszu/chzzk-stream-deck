# 스트림덱 모듈 개발

## 구조

모듈 키, 빈 키, 페이지 키는 `DeckModule`을 상속하고 하나의 `KeyView`로 표시합니다. `DeckController`는 배치 저장·페이지 이동·창 제어를 맡습니다. 모듈별 상태나 실행 동작을 컨트롤러의 `if`/`switch`에 추가하지 않습니다.

```text
DeckModule                         js/deck/core/module.mjs
├─ OutputDeckModule                js/deck/modules/output.mjs
│  ├─ ObsDeckModule                js/deck/modules/obs.mjs
│  └─ NdiDeckModule                js/deck/modules/ndi.mjs
├─ ChatDeckModule                  js/deck/modules/chat.mjs
├─ PageModule                      js/deck/modules/pages.mjs
│  ├─ PreviousPageModule
│  └─ NextPageModule
└─ EmptySlotModule                 js/deck/modules/empty.mjs
```

- `DeckModule`: 패널 마운트, 이벤트 구독과 해제, 동기·비동기 동작 오류 표시, 상태 모델과 키 생성.
- `KeyView`: 모든 슬롯의 HTML과 접근성 속성. 텍스트는 `textContent`로 넣습니다.
- `ModuleRegistry`: 모듈 검색과 등록 검증. 중복 ID·고정 슬롯 충돌·상속하지 않은 모듈을 거부합니다.
- `OutputDeckModule`: 출력 상태 조회·키 활성 상태·실행 전 조건 검사와 액션 전달. 기본 읽기 전용 출력 패널을 제공하며, 로컬 캡처는 전용 편집 패널과 편집 생명주기를 재정의합니다.
- 각 자식 모듈: 이름·색·아이콘, 고유 상태와 실행 조건, 설정 화면과 이벤트.

기존 `js/modules/chat.js`와 `js/modules/outputs.js`는 연결·상태 조회·실행을 담당하는 서비스입니다. 화면 모듈은 서비스를 사용하며 서비스 내부에 키 배치나 DOM 모양을 넣지 않습니다. OBS·NDI 실행 조건은 서버에서도 검사합니다.

## 새 모듈 추가

1. `js/deck/modules/`에 `DeckModule`을 상속하는 파일을 만듭니다. OBS·NDI와 동일한 캡처 상태 형식을 쓰는 출력 모듈이면 `OutputDeckModule`을 확장할 수 있습니다.
2. 패널 템플릿을 해당 모듈에서 가져옵니다. 루트에 고유 `id`, `data-deck-view`, `module-screen`, `hidden`을 지정합니다. 패널 내부에 `.panel-body`와 `.panel-footer`를 사용하면 기존 창 크기 대응이 적용됩니다.
3. `js/deck/index.mjs`에서 import하고 `register(new MyDeckModule())`을 추가합니다. 앱을 다시 실행하면 편집 목록에 포함되고, 기존 배치를 유지하면서 첫 빈 칸에 배치됩니다. 13개를 넘으면 다음 페이지가 생깁니다.
4. 새 아이콘이 필요하면 `js/deck/icons.mjs`의 고정 SVG 경로 목록에 추가합니다. 키 HTML이나 모듈별 아이콘 크기 CSS는 만들지 않습니다.

예시:

```js
import { DeckModule } from '../core/module.mjs';
import { panel } from './my-panel.mjs';

export class MyDeckModule extends DeckModule {
    constructor() {
        super({
            id: 'my-module', // 저장된 배치가 참조하므로 배포 후 ID를 유지합니다.
            label: '새 모듈',
            icon: 'activity',
            accent: '#8df2bd',
            tint: '#244537',
            description: '새 모듈을 설정합니다.',
            eyebrow: 'MY MODULE',
            panel
        });
    }

    getState(context) {
        return { active: false }; // 서비스에서 이미 조회한 상태를 읽습니다.
    }

    bind(context) {
        const button = document.getElementById('my-refresh');
        this.listen(button, 'click', () => this.refresh(context), context);
    }

    onEnter(context) {
        this.refresh(context);
    }

    refresh(context) {
        // 이 모듈의 패널에 서비스 상태를 표시합니다.
    }
}
```

기본 좌클릭은 같은 화면에서 모듈 패널을 엽니다. `onActivate`는 특별한 동작이 필요할 때만 재정의합니다. 네이티브 실행·연결 같은 동작은 패널의 명시적인 버튼으로 연결합니다.

## 공통 계약

| 훅/메서드 | 용도 |
| --- | --- |
| `mount(context)` | 컨트롤러가 시작 시 호출합니다. 부모가 템플릿과 이벤트를 한 번만 설치합니다. |
| `bind(context)` | 자식의 이벤트 설치. `this.listen(element, event, handler, context)`를 사용합니다. |
| `getState(context)` | 동기 상태 조회. `active`, `disabled`, `state`, `caption` 등을 반환합니다. 네트워크 요청을 시작하지 않습니다. |
| `refresh(context)` | 서비스가 갱신되거나 UI 상태가 변할 때 패널 값을 갱신합니다. 설정 입력 중인 값을 덮어쓰지 않습니다. |
| `onEnter` / `onLeave` | 화면을 열고 떠날 때 필요한 설정 읽기·정리. |
| `onActivate(context)` | 기본 동작은 패널 열기. 부모 `activate`가 비활성 상태와 오류를 처리합니다. |
| `dispose()` | 부모가 `listen`으로 등록한 이벤트를 해제합니다. 별도 타이머/구독이 있으면 자식에서 정리한 뒤 `super.dispose()`를 호출합니다. |

`context.app`은 앱 서비스, `context.outputs`는 출력 서비스, `context.deck`은 화면 전환·알림·페이지 호스트입니다. DOM이 필요한 작업은 생성자 대신 `bind`나 `onEnter`에서 수행합니다. 동작이 Promise를 반환하면 이벤트 핸들러에서도 반환하여 부모가 오류를 표시할 수 있게 합니다.

OBS·NDI는 같은 출력 패널 템플릿을 공유하며 활성 모듈만 클릭 이벤트를 처리합니다. 각 모듈의 허용 동작과 A1 점유·처리 중 여부를 검사한 후 출력 서비스로 전달합니다. 패널을 열거나 상태를 조회하는 것만으로 송출이 시작되지는 않습니다.

템플릿은 저장소에 포함된 정적 HTML만 사용합니다. 사용자 이름·URL·설정값을 HTML 문자열에 합치지 않고 DOM 속성으로 설정합니다. 모듈 ID와 패널 ID는 중복되지 않게 유지합니다. 의도적으로 같은 패널을 쓰는 경우 해당 모듈끼리 생명주기와 이벤트 소유권을 공유해야 합니다.

## 작은 모듈 패널

기본 창 640×440, 최소 창 600×420을 유지합니다. 모듈을 열면 뒤로가기와 모듈명이 원래 창 헤더의 브랜드 자리를 사용합니다. 별도 두 번째 제목 줄이나 팝업을 만들지 않습니다. 오른쪽 편집·고정·창 제어와 왼쪽 뒤로가기는 드래그 영역에서 제외합니다.

- 모든 패널은 공통 `.module-screen` 안에 `.panel-bar`(선택), `.panel-body`, `.panel-footer`를 사용합니다.
- 자주 사용하는 설정과 결과는 한 화면에서 나란히 표시합니다. 탭으로 나누지 않습니다.
- 패널 본문만 스크롤하고 아래 실행·저장 버튼은 계속 표시합니다. 기본 정보는 최소 크기에서도 스크롤 없이 읽히도록 구성합니다. 긴 진단 정보는 펼쳐서 봅니다.
- 설정 저장과 실행 제어를 분리하고, 다음 행동은 현재 연결·실행 상태에 따라 표시합니다.
- 로컬 캡처는 준비 목록·설정·OBS로 전달·방송 안내를 제공하고 NDI는 출력 상태와 시작·중지를 표시합니다.
- 채팅은 상단 채널 연결, 본문의 설정·미리보기, 하단 저장으로 구성합니다.
- 일시적인 알림은 패널 위에 짧게 표시하여 저장 후 폼 전체의 높이가 바뀌지 않게 합니다.

로컬 캡처의 다음 행동은 `local-workflow.mjs`에서 관측 상태로 계산합니다. 설치 완료 여부를 별도 온보딩 플래그로 저장하지 않아, 다른 PC나 설치가 지워진 환경에서도 필요한 준비 단계로 돌아옵니다. `PanelTabs`는 기존 보조 컴포넌트이며 현재 세 모듈 패널은 사용하지 않습니다.

## 글꼴

앱 UI는 **Pretendard Variable v1.3.9**를 사용합니다. 한글·영문·숫자가 섞이는 작은 키 제목은 12px / 600 굵기, 본문·보조 글은 400~500, 제목·버튼은 600~750의 실제 가변 굵기를 사용합니다. 폰트와 `LICENSE.txt`는 `assets/fonts/pretendard/`에 포함되어 외부 CDN이나 운영체제 폰트 설치 없이 동작합니다. 출처와 파일 SHA-256은 같은 폴더의 `SOURCE.txt`에 기록합니다. 글꼴은 SIL Open Font License 1.1이며 앱 배포 시 이 폴더의 라이선스를 함께 유지합니다. URL·설정 경로에는 기존 고정폭 글꼴을 사용합니다.

## 슬롯 디자인과 배치

케이스와 설정 화면은 중립적인 실버·회색 팔레트를 공유합니다. 할당된 키는 차콜 바탕에 모듈 강조색을 쓰고, 빈 키와 페이지 이동 키는 낮은 대비의 실버 상태를 사용합니다. 슬롯 번호는 편집 중에만 표시합니다. 상태에 따라 색·그림자만 달라지고 모든 키의 크기와 배치는 같습니다.

한 페이지는 5×3입니다. 11번은 이전 페이지, 15번은 다음 페이지이고 1~10·12~14번이 모듈용입니다. 캡처 상태 전용 슬롯은 없습니다. 빈 슬롯은 편집 모드에서만 조작할 수 있습니다.

모든 슬롯에 같은 `.key-screen` → `.key-main` → 아이콘·제목 구조를 적용합니다. 아이콘 자체의 중심을 슬롯의 가로·세로 50%에 고정하고 제목은 아이콘 아래에 별도로 배치합니다. 번호·상태·페이지 보조 문구는 위쪽에 고정합니다. 제목이나 페이지 번호의 유무가 아이콘의 중앙 위치를 바꾸지 않습니다.

공통 크기는 `css/deck.css`의 `--key-icon-size`, `--key-label-size`, `--key-gap`으로 바꿉니다. 기본 창은 640×440이고 최소 크기는 600×420입니다. 키는 약 108px 정사각형, 아이콘/제목/간격은 36px/12px/6px입니다. 데크 폭을 600px로 제한해 큰 창에서도 키 내부 여백이 늘어나지 않습니다. 580px 미만의 브라우저 미리보기에서만 같은 규칙으로 더 축소합니다. 모듈별 CSS에서는 키의 크기·글자 크기·간격을 덮어쓰지 않습니다.

배치는 `chzzk.deck.pages.v6`에 페이지당 13개의 모듈 ID를 저장합니다. 기존 버전의 위치 이전, 모듈 중복 방지, 새 모듈 자동 배치는 컨트롤러가 처리합니다. 등록은 앱 초기화 시 수행합니다. 런타임 플러그인 로딩·제거를 제공하는 구조는 아닙니다.

## 검증

```sh
npm run test:deck
npm run test:outputs
npx electron test/smoke-deck.cjs
```

계약 테스트는 상속/등록·실행 조건·페이지 경계를 확인합니다. Electron 검증은 격리된 프로필에서 기존 배치 이전, 모듈 편집, 설정 화면, 창 제어, 새 자식 모듈의 화면 진입·복귀를 확인합니다. 기본/작은 창의 아이콘 크기·제목 위치·보조 문구 겹침을 실제 DOM 좌표로 검사하고 `test-results/`에 화면을 저장합니다. 검증 중 실제 캡처·방송 송출을 시작하지 않습니다.

로컬 캡처는 OutputDeckModule의 상태·명령 가드를 상속하고 별도 obs-panel.mjs와 편집 상태를 소유합니다. 공통 패널·필드·푸터 스타일을 공유합니다. NDI 패널의 필드나 이벤트에 로컬 캡처 조건 분기를 추가하지 않습니다. 저장·실행 계약은 [LOCAL-CAPTURE.md](LOCAL-CAPTURE.md)를 참고하세요.

배치 편집은 패널이 아닌 DeckReorder로 처리합니다. [드래그 배치 구조와 사용법](DECK-PLACEMENT.md)을 참고하세요.

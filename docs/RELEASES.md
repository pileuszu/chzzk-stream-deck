# v3.0.0 빌드와 GitHub Release

통합 스트림덱의 버전은 `3.0.0`, 대응 태그는 `v3.0.0`입니다. 앱 버전은 `package.json`과 `package-lock.json`에서 함께 관리합니다.

## 로컬 빌드

Windows x64, Node.js 24, Python 3, Visual Studio 2022 C++ Build Tools, Windows SDK, CMake 3.24 이상이 필요합니다. 최초 빌드는 npm/Electron/OBS 헤더 다운로드를 위해 인터넷 연결이 필요합니다.

```powershell
npm ci
npm run build:release
```

`build:release`는 버전·잠금 파일 확인 → Node 테스트 → OBS 등록·이전 테스트 → 두 네이티브 모듈 빌드·C++ 테스트 → 포터블 패키징 → 배포 구성 확인·SHA-256 생성 순서로 동작합니다. 실패한 단계가 있으면 뒤 단계로 넘어가지 않습니다. 이 명령은 로컬 파일만 만들며 GitHub에 게시하지 않습니다.

| 생성 파일 | 용도 |
|---|---|
| `dist/release/CHZZK-Stream-Deck-3.0.0-win-x64-portable.exe` | 사용자가 다운로드할 포터블 실행 파일 |
| `dist/release/SHA256SUMS.txt` | 실행 파일의 SHA-256 |
| `dist/release/RELEASE-NOTES.md` | Release 본문 |
| `dist/release/win-unpacked/` | 빌드 중 생성하는 전체 앱 폴더 |

별도의 NDI 실행 파일이나 OBS DLL을 사용자에게 따로 전달할 필요는 없습니다. 앱에 두 모듈과 대응 소스·라이선스가 포함됩니다. Voicemeeter와 NDI 런타임, OBS, 최초 자동 장면 등록에 필요한 Python은 별도 설치 항목입니다. 앱 다운로드 안내에도 이 조건을 표시합니다.

개인 `sender.ini`·`local-capture.ini`, 로그·녹화·백업은 포함하지 않습니다. 배포 기본값은 `sender.example.ini`에서 가져옵니다. 패키징 검사에서 모듈 누락이나 개인 설정 포함을 발견하면 실패합니다.

## GitHub에 게시

1. v3.0.0에 포함할 코드·빌드 설정을 검토하고 커밋·푸시합니다. 빌드 파일은 추가하지 않습니다.
2. 배포할 커밋에서 태그를 생성하고 푸시합니다.

```powershell
git tag -a v3.0.0 -m "CHZZK Stream Deck v3.0.0"
git push origin v3.0.0
```

3. Actions의 **Publish Release**를 확인합니다. Windows 러너가 태그의 코드를 체크아웃하고 같은 `npm run build:release`를 실행합니다. 태그 이름이 앱 버전과 다르면 빌드 전에 중단합니다.
4. 빌드·검증 성공 후 별도의 게시 작업이 아티팩트를 받아 SHA-256을 확인하고 Release를 생성합니다. EXE와 `SHA256SUMS.txt`가 첨부되고 안내문이 본문에 들어갑니다. `-beta.1` 같은 사전 버전 태그는 prerelease로 표시됩니다.

GitHub가 만드는 Source code ZIP/tar.gz는 소스용입니다. 사용자는 Assets에서 `CHZZK-Stream-Deck-...-portable.exe`를 받으면 됩니다. [GitHub의 Release와 태그 설명](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

## 자동화와 재실행

- `build.yml`: main/develop 푸시·수동 빌드·다른 워크플로우 호출이 공유하는 Windows 빌드. 실행 파일은 Actions 아티팩트로 14일 보관합니다.
- `build-pr.yml`: PR에서도 같은 전체 빌드를 실행합니다. PR 코드는 게시 권한을 받지 않습니다.
- `build-release.yml`: `v*` 태그 푸시 또는 수동으로 지정한 **기존 태그**를 빌드하고 게시합니다. 수동 실행은 브랜치의 최신 코드가 아니라 입력한 태그의 코드를 빌드합니다.

빌드 실패는 원인을 해결한 뒤 재실행할 수 있습니다. 아직 게시되지 않은 태그는 **Publish Release → Run workflow → tag**로 다시 빌드할 수 있습니다. 이미 게시된 버전을 덮어쓰거나 태그를 삭제·재생성하지 말고 다음 버전을 만드세요.

다음 패치 버전은 `npm version patch --no-git-tag-version`으로 두 버전 파일을 함께 올린 뒤 변경사항을 커밋하고 새 태그를 푸시합니다. 태그가 원격에 없으면 게시 단계의 `--verify-tag`가 Release 생성을 거절합니다.

빌드 작업은 `contents: read`, 게시 작업만 `contents: write`를 사용합니다. GitHub가 제공하는 `GITHUB_TOKEN`을 사용하며 개인 토큰이나 PR 승인 권한은 필요하지 않습니다. 조직 정책이 게시를 막는 경우에는 해당 정책을 확인하세요. [GitHub 토큰 권한 안내](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

## Git에는 무엇을 올리는가

소스, 아이콘·폰트, 기본 설정, package/lock 파일, 테스트, 빌드 스크립트와 워크플로우를 커밋합니다. `dist/`, `native-runtime/`, 네이티브 빌드 폴더, 개인 설정과 `.local-backups/`는 `.gitignore` 대상입니다. Git에서 무시되는 파일도 Release 첨부 파일로는 업로드할 수 있습니다.

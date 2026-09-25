# Windows 빌드·릴리스 워크플로우

- **Windows Build** (`build.yml`): main/develop 푸시, 수동 실행과 재사용 호출. Node.js 24·Python 3.12·Windows 2022에서 `npm run build:release`를 실행합니다.
- **Pull Request Build** (`build-pr.yml`): 같은 빌드를 호출해 네이티브 모듈까지 검증합니다.
- **Test** (`test.yml`): Linux·macOS·Windows에서 구문 검사와 채팅·출력 모듈의 자동 테스트를 실행합니다.
- **Publish Release** (`build-release.yml`): 버전 태그 푸시 또는 수동으로 입력한 기존 태그를 빌드한 뒤 EXE·SHA-256을 GitHub Release에 첨부합니다.

통합판의 시작 버전은 **v3.0.0**입니다. 태그와 package/lock 버전이 일치해야 게시됩니다. main/develop/PR 빌드는 Actions 아티팩트만 생성하며 Release를 만들지 않습니다.

공통 빌드는 전체 Node·OBS 등록 테스트, NDI·OBS 플러그인 빌드와 C++ 타이밍 테스트, 포터블 패키징, 배포 내용 검사를 수행합니다. 실패를 무시하지 않습니다. 로그·개인 설정·백업과 unpacked 개발 폴더는 업로드하지 않습니다.

빌드에는 읽기 권한만, 게시 작업에만 `contents: write`를 부여합니다. 개인 토큰이나 PR 승인 권한을 추가할 필요는 없습니다. 이미 게시한 버전을 덮어쓰지 않으며, 다음 버전을 만들어 배포합니다.

파일 위치, 최초 게시 순서와 재실행 절차는 [빌드·릴리스 안내](../../docs/RELEASES.md)를 참고하세요.

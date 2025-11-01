# CI/CD 워크플로우 가이드

이 디렉토리는 GitHub Actions CI/CD 워크플로우 파일을 포함합니다.

## 워크플로우 파일

### 1. `build.yml`
**목적**: `develop` 브랜치에 푸시될 때마다 Windows 빌드를 실행하고 아티팩트를 업로드합니다.

**트리거**:
- `develop` 브랜치에 푸시
- `develop` 브랜치로의 Pull Request
- 수동 실행 (workflow_dispatch)

**실행 내용**:
1. 코드 체크아웃
2. Node.js 18 설정
3. 의존성 설치 (`npm ci`)
4. 캐시 삭제
5. Windows 빌드 실행
6. 빌드 아티팩트 업로드 (릴리스는 생성하지 않음)

### 2. `build-release.yml`
**목적**: 태그가 푸시되면 빌드하고 릴리스를 생성합니다. `main` 브랜치 푸시 시에는 빌드만 실행합니다.

**트리거**:
- `v*` 형식의 태그 푸시 (예: `v2.0.0`) → 빌드 + 릴리스 생성
- `main` 브랜치에 푸시 → 빌드만 실행 (릴리스 생성 안 함)
- 수동 실행

### 3. `build-pr.yml`
**목적**: Pull Request 시 빌드 테스트 실행

**트리거**:
- `develop` 또는 `main` 브랜치로의 Pull Request

**실행 내용**:
- 빌드 테스트 및 아티팩트 업로드 (7일 보관)
- 릴리스 생성하지 않음

**사용 방법**:
```bash
# 태그 생성 및 푸시
git tag v2.0.0
git push origin v2.0.0
```

### 4. `test.yml`
**목적**: 코드 품질 검사 및 테스트 실행

**트리거**:
- Pull Request 생성/업데이트
- `develop` 브랜치에 푸시

## 브랜치 전략

이 프로젝트는 Git Flow 전략을 사용합니다:
- **develop**: 개발 브랜치 (자동 빌드 실행)
- **main**: 프로덕션 브랜치 (태그 푸시 시 릴리스 생성)
- **feature/***: 기능 개발 브랜치

자세한 내용은 [.git-branch-strategy.md](../.git-branch-strategy.md)를 참조하세요.

## 사용 방법

### 자동 빌드
`develop` 브랜치에 푸시하면 자동으로 빌드가 시작됩니다.

```bash
# develop 브랜치로 전환 (처음 설정 시)
git checkout -b develop
git push origin develop

# 작업 후 푸시
git add .
git commit -m "feat: 새로운 기능"
git push origin develop
```

### 수동 빌드
GitHub Actions 탭에서 워크플로우를 수동으로 실행할 수 있습니다.

1. GitHub 저장소 페이지에서 "Actions" 탭 클릭
2. 왼쪽 사이드바에서 워크플로우 선택
3. "Run workflow" 버튼 클릭

### 릴리스 생성
프로덕션 릴리스를 만들려면:

1. **develop 브랜치에서 main으로 병합**
```bash
git checkout main
git merge develop
git push origin main
```

2. **버전 태그 생성 및 푸시**
```bash
git tag v2.0.1
git push origin v2.0.1
```

태그 푸시 시 자동으로 릴리스가 생성됩니다.

## 빌드 아티팩트 다운로드

1. GitHub 저장소의 "Actions" 탭으로 이동
2. 완료된 워크플로우 실행을 클릭
3. "Artifacts" 섹션에서 빌드된 파일 다운로드

## 설정

### GitHub 저장소 권한 설정

워크플로우가 릴리스를 생성하려면 저장소에 올바른 권한이 설정되어 있어야 합니다:

1. GitHub 저장소 페이지로 이동
2. **Settings** → **Actions** → **General** 클릭
3. **Workflow permissions** 섹션에서:
   - **Read and write permissions** 선택
   - 또는 **Read and write permissions** + **Allow GitHub Actions to create and approve pull requests** 선택

이 설정을 하지 않으면 릴리스 생성 시 403 오류가 발생할 수 있습니다.

### 환경 변수
워크플로우는 다음 환경 변수를 사용합니다:
- `CSC_IDENTITY_AUTO_DISCOVERY=false`: 코드 서명 비활성화
- `GITHUB_TOKEN`: 자동으로 제공되는 토큰 (릴리스 생성용)

### 캐시
Node.js 모듈은 자동으로 캐시되어 빌드 시간이 단축됩니다.

## 문제 해결

### 릴리스 생성 실패 (403 오류)
**증상**: `GitHub release failed with status: 403`

**해결 방법**:
1. GitHub 저장소 **Settings** → **Actions** → **General**로 이동
2. **Workflow permissions**에서 **Read and write permissions** 선택
3. 저장 후 워크플로우를 다시 실행

### 빌드 실패 시
1. Actions 탭에서 실패한 워크플로우 실행 확인
2. 로그에서 오류 메시지 확인
3. 로컬에서 동일한 명령어 실행하여 문제 재현

### 캐시 문제
캐시 관련 문제가 발생하면 워크플로우의 캐시 단계를 확인하거나 수동으로 캐시를 삭제하세요.

### 태그가 이미 존재하는 경우
동일한 태그로 릴리스를 다시 생성하려면:
1. 기존 태그 삭제: `git tag -d v2.0.0 && git push origin :refs/tags/v2.0.0`
2. 새 태그 생성 및 푸시


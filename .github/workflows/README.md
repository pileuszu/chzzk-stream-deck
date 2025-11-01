# CI/CD 워크플로우 가이드

이 디렉토리는 GitHub Actions CI/CD 워크플로우 파일을 포함합니다.

## 워크플로우 파일

### 1. `build.yml`
**목적**: main 브랜치에 푸시될 때마다 Windows 빌드를 실행하고 아티팩트를 업로드합니다.

**트리거**:
- `main` 브랜치에 푸시
- Pull Request가 `main` 브랜치로 병합
- 수동 실행 (workflow_dispatch)

**실행 내용**:
1. 코드 체크아웃
2. Node.js 18 설정
3. 의존성 설치 (`npm ci`)
4. 캐시 삭제
5. Windows 빌드 실행
6. 빌드 아티팩트 업로드
7. Release 생성 (main 브랜치 푸시 시)

### 2. `build-release.yml`
**목적**: 태그가 푸시되면 릴리스를 생성합니다.

**트리거**:
- `v*` 형식의 태그 푸시 (예: `v2.0.0`)
- 수동 실행

**사용 방법**:
```bash
# 태그 생성 및 푸시
git tag v2.0.0
git push origin v2.0.0
```

### 3. `test.yml`
**목적**: 코드 품질 검사 및 테스트 실행

**트리거**:
- Pull Request 생성/업데이트
- `main` 브랜치에 푸시

## 사용 방법

### 자동 빌드
`main` 브랜치에 푸시하면 자동으로 빌드가 시작됩니다.

```bash
git add .
git commit -m "빌드 수정"
git push origin main
```

### 수동 빌드
GitHub Actions 탭에서 워크플로우를 수동으로 실행할 수 있습니다.

1. GitHub 저장소 페이지에서 "Actions" 탭 클릭
2. 왼쪽 사이드바에서 워크플로우 선택
3. "Run workflow" 버튼 클릭

### 릴리스 생성
릴리스를 만들려면 버전 태그를 생성하고 푸시하세요:

```bash
git tag v2.0.1
git push origin v2.0.1
```

## 빌드 아티팩트 다운로드

1. GitHub 저장소의 "Actions" 탭으로 이동
2. 완료된 워크플로우 실행을 클릭
3. "Artifacts" 섹션에서 빌드된 파일 다운로드

## 설정

### 환경 변수
워크플로우는 다음 환경 변수를 사용합니다:
- `CSC_IDENTITY_AUTO_DISCOVERY=false`: 코드 서명 비활성화
- `GITHUB_TOKEN`: 자동으로 제공되는 토큰 (릴리스 생성용)

### 캐시
Node.js 모듈은 자동으로 캐시되어 빌드 시간이 단축됩니다.

## 문제 해결

### 빌드 실패 시
1. Actions 탭에서 실패한 워크플로우 실행 확인
2. 로그에서 오류 메시지 확인
3. 로컬에서 동일한 명령어 실행하여 문제 재현

### 캐시 문제
캐시 관련 문제가 발생하면 워크플로우의 캐시 단계를 확인하거나 수동으로 캐시를 삭제하세요.


/**
 * 메인 애플리케이션
 */
class App {
    constructor() {
        this.settingsManager = new SettingsManager();
        this.uiManager = new UIManager(this);
        this.chatModule = new ChatModule(this.settingsManager);
        
        this.init();
    }
    
    init() {
        this.settingsManager.loadSettings();
        this.setupEventListeners();
        this.updateModuleStates();
        this.uiManager.applyTheme('chat', this.settingsManager.getModuleSettings('chat').theme);
        
        // 설정 로드 후 UI 업데이트 (URL 등)
        setTimeout(() => {
            this.settingsManager.updateUI();
        }, 100);
    }
    
    setupEventListeners() {
        const chatToggle = document.getElementById('chat-toggle');
        if (chatToggle) {
            chatToggle.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    const success = await this.chatModule.start();
                    if (!success) {
                        e.target.checked = false;
                    }
                } else {
                    await this.chatModule.stop();
                }
                this.uiManager.updateModuleCard('chat', this.chatModule.isActive);
                this.updateStats();
            });
        }
        
        // 사이드바 토글
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                sidebar?.classList.toggle('open');
            });
        }
        
        // 사이드바 네비게이션
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.handleNavigation(section);
                
                // 활성 상태 업데이트
                navLinks.forEach(l => l.parentElement.classList.remove('active'));
                link.parentElement.classList.add('active');
                
                // 모바일에서 사이드바가 열려있으면 닫기
                const sidebar = document.querySelector('.sidebar');
                if (window.innerWidth <= 768 && sidebar?.classList.contains('open')) {
                    sidebar.classList.remove('open');
                }
            });
        });
        
        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('settings-modal');
            if (e.target === modal) {
                this.uiManager.closeSettings();
            }
        });
        
        // 초기 통계 업데이트
        this.updateStats();
        
        // 다크모드 토글
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            // 통일된 키 이름 사용
            const STORAGE_KEYS = window.APP_CONFIG?.STORAGE_KEYS || {};
            const KEY_DARK_MODE = STORAGE_KEYS.DARK_MODE || 'dark-mode';
            
            // 저장된 다크모드 설정 로드
            const isDarkMode = localStorage.getItem(KEY_DARK_MODE) === 'true';
            darkModeToggle.checked = isDarkMode;
            this.toggleDarkMode(isDarkMode);
            
            darkModeToggle.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                localStorage.setItem(KEY_DARK_MODE, isDark);
                this.toggleDarkMode(isDark);
            });
        }
        
        // 종료 버튼
        const quitBtn = document.getElementById('quit-app-btn');
        if (quitBtn) {
            quitBtn.addEventListener('click', () => {
                if (confirm('CHZZK Stream Deck를 종료하시겠습니까?')) {
                    // Electron에서 종료
                    if (window.electronAPI && window.electronAPI.quitApp) {
                        window.electronAPI.quitApp();
                    } else {
                        window.close();
                    }
                }
            });
        }
    }
    
    toggleDarkMode(enabled) {
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    handleNavigation(section) {
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle) {
            const titles = {
                'dashboard': '대시보드',
                'settings': '설정'
            };
            pageTitle.textContent = titles[section] || '대시보드';
        }
        
        // content-section만 숨기기 (stats-grid는 항상 표시)
        document.querySelectorAll('.content-section[data-section]').forEach(sec => {
            sec.style.display = 'none';
        });
        
        // 선택한 섹션 표시
        const targetSection = document.querySelector(`.content-section[data-section="${section}"]`);
        if (targetSection) {
            targetSection.style.display = 'block';
        }
    }
    
    updateStats() {
        // 채팅 모듈 상태 업데이트
        const chatStatusValue = document.getElementById('chat-status-value');
        if (chatStatusValue) {
            chatStatusValue.textContent = this.chatModule.isActive ? '실행 중' : '대기 중';
        }
        
        // 활성 모듈 수 업데이트
        const activeModulesValue = document.getElementById('active-modules-value');
        if (activeModulesValue) {
            const activeCount = this.chatModule.isActive ? 1 : 0;
            activeModulesValue.textContent = activeCount;
        }
        
        // 서버 포트 업데이트
        const serverPortValue = document.getElementById('server-port-value');
        if (serverPortValue && window.APP_CONFIG?.SERVER?.PORT) {
            serverPortValue.textContent = window.APP_CONFIG.SERVER.PORT;
        }
    }
    
    updateModuleStates() {
        this.uiManager.updateModuleCard('chat', this.chatModule.isActive);
        this.updateStats();
    }
}

// 애플리케이션 시작
const app = new App();
window.app = app;

// 전역 함수들 (HTML에서 호출)
window.openSettings = (moduleName) => app.uiManager.openSettings(moduleName);
window.closeSettings = () => app.uiManager.closeSettings();
window.saveSettings = () => app.uiManager.saveSettings();
window.copyToClipboard = (elementId) => app.uiManager.copyToClipboard(elementId);

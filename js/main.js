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
            });
        }
        
        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('settings-modal');
            if (e.target === modal) {
                this.uiManager.closeSettings();
            }
        });
    }
    
    updateModuleStates() {
        this.uiManager.updateModuleCard('chat', this.chatModule.isActive);
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

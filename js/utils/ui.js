/**
 * UI 관리자
 */
class UIManager {
    constructor(app) {
        this.app = app;
        this.currentModule = null;
        this.settingsModal = document.getElementById('settings-modal');
    }
    
    updateModuleCard(moduleName, isActive) {
        const moduleCard = document.getElementById(`${moduleName}-module`);
        if (!moduleCard) return;
        
        if (isActive) {
            moduleCard.classList.add('active');
        } else {
            moduleCard.classList.remove('active');
        }
    }
    
    openSettings(moduleName) {
        this.currentModule = moduleName;
        this.settingsModal.style.display = 'block';
        
        // 모든 설정 패널 숨기기
        document.querySelectorAll('.settings-panel').forEach(panel => {
            panel.style.display = 'none';
        });
        
        // 해당 모듈의 설정 패널 표시
        const settingsPanel = document.getElementById(`${moduleName}-settings`);
        if (settingsPanel) {
            settingsPanel.style.display = 'block';
        }
        
        // 모달 제목 설정
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) {
            const titles = {
                'chat': '채팅 모듈 설정'
            };
            modalTitle.textContent = titles[moduleName] || '모듈 설정';
        }
        
        // 현재 설정 값 로드
        this.app.settingsManager.loadModalSettings(moduleName);
    }
    
    closeSettings() {
        this.settingsModal.style.display = 'none';
        this.currentModule = null;
    }
    
    saveSettings() {
        if (!this.currentModule) return;
        
        this.app.settingsManager.saveModalSettings(this.currentModule);
        this.applyTheme(this.currentModule, this.app.settingsManager.getModuleSettings(this.currentModule).theme);
        
        // 모듈이 실행 중이면 재시작
        const module = this.getModule(this.currentModule);
        if (module?.isActive && module.restart) {
            module.restart();
        }
        
        this.closeSettings();
    }
    
    getModule(moduleName) {
        const modules = {
            'chat': this.app.chatModule
        };
        return modules[moduleName] || null;
    }
    
    applyTheme(moduleName, themeName) {
        if (moduleName === 'chat') {
            this.applyChatTheme(themeName);
        }
    }
    
    applyChatTheme(themeName) {
        const chatWidget = document.querySelector('.chat-widget');
        if (!chatWidget) return;
        
        // 기존 테마 클래스 제거
        chatWidget.classList.remove('theme-simple-purple', 'theme-neon-green');
        // 새 테마 클래스 추가
        chatWidget.classList.add(`theme-${themeName}`);
    }
    
    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const copyBtn = element.nextElementSibling;
        element.select();
        element.setSelectionRange(0, 99999);
        
        const copyText = async () => {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(element.value);
                } else {
                    document.execCommand('copy');
                }
                this.showCopyFeedback(copyBtn);
            } catch (err) {
                console.error('복사 실패:', err);
                alert('복사에 실패했습니다. 수동으로 복사해주세요.');
            }
        };
        
        copyText();
    }
    
    showCopyFeedback(copyBtn) {
        if (!copyBtn) return;
        
        copyBtn.classList.add('copied');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = originalHTML;
        }, 2000);
    }
    
    showError(message) {
        alert(message);
    }
    
    showSuccess(message) {
        console.log('✅', message);
    }
    
    showInfo(message) {
        console.log(message);
        
        const formattedMessage = message.replace(/\n/g, '<br>');
        const infoModal = document.createElement('div');
        infoModal.className = 'info-modal';
        infoModal.innerHTML = `
            <div class="info-modal-content">
                <h3>📋 정보</h3>
                <pre>${message}</pre>
                <button class="info-modal-close">확인</button>
            </div>
        `;
        
        // 스타일 적용
        infoModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        
        const content = infoModal.querySelector('.info-modal-content');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;
        
        const pre = infoModal.querySelector('pre');
        pre.style.cssText = `
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #666;
            margin: 15px 0;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        `;
        
        const closeBtn = infoModal.querySelector('.info-modal-close');
        closeBtn.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            float: right;
        `;
        
        closeBtn.onclick = () => infoModal.remove();
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                infoModal.remove();
            }
        });
        
        document.body.appendChild(infoModal);
        
        // 10초 후 자동 닫기
        setTimeout(() => {
            if (infoModal.parentElement) {
                infoModal.remove();
            }
        }, 10000);
    }
}

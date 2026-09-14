import { DeckController } from './deck.js';

class App {
    constructor() {
        this.settingsManager = new SettingsManager();
        this.settingsManager.loadSettings();
        this.settingsManager.updateUI();
        this.uiManager = new UIManager(this);
        this.chatModule = new ChatModule(this.settingsManager);
        this.chatBusy = false;
    }
    async toggleChat() {
        if (this.chatBusy) return;
        if (!this.chatModule.isActive && !this.settingsManager.getModuleSettings('chat').channelId) {
            this.uiManager.openSettings('chat');
            return;
        }
        this.chatBusy = true;
        window.deck?.update();
        try {
            if (this.chatModule.isActive) await this.chatModule.stop();
            else await this.chatModule.start();
        } finally {
            this.chatBusy = false;
            window.deck?.update();
        }
    }
}
const app = new App();
window.app = app;
window.deck = new DeckController(app);
window.outputModuleCards = new OutputModuleCards();

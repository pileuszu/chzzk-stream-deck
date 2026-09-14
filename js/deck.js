import { createModuleRegistry } from './deck/index.mjs';
import { DeckReorder } from './deck/core/reorder.mjs';

const DECK_COLUMNS = 5;
const DECK_ROWS = 3;
const DECK_SLOT_COUNT = DECK_COLUMNS * DECK_ROWS;
const DECK_MODULE_POSITIONS = Array.from({ length: DECK_SLOT_COUNT }, (_, index) => index).filter(index => index !== 10 && index !== 14);
const DECK_MODULE_SLOTS = DECK_MODULE_POSITIONS.length;
export class DeckController {
    constructor(app, registry = createModuleRegistry()) {
        this.app = app;
        this.registry = registry;
        this.screenBed = document.querySelector('.screen-bed');
        this.grid = document.getElementById('key-grid');
        this.outputs = null;
        this.currentOutput = 'obs';
        this.view = 'home';
        this.returnModule = 'obs';
        this.returnSlot = 0;
        this.pageIndex = 0;
        this.editing = false;
        this.windowState = { pinned: false, maximized: false };
        const host = this;
        this.context = { app, deck: this, get outputs() { return window.outputModuleCards; } };
        this.registry.all.forEach(module => module.mount(this.context));
        app.settingsManager.updateUI();
        window.addEventListener('beforeunload', () => { host.reorder?.dispose(); host.registry.dispose(); }, { once: true });
        this.layout = this.loadLayout();
        this.buildKeys();
        this.reorder = new DeckReorder(this);
        this.bindEvents();
        this.update();
        if (window.deckWindow) {
            window.deckWindow.onState(state => this.setWindowState(state));
            this.windowAction('state');
        } else {
            document.querySelectorAll('[data-window-action], .control-divider').forEach(element => { element.hidden = true; });
        }
    }

    get defaultLayout() { return this.normalizeLayout([]); }

    normalizeLayout(saved) {
        const used = new Set();
        const slotCount = Math.max(DECK_MODULE_SLOTS, Math.ceil(saved.length / DECK_MODULE_SLOTS) * DECK_MODULE_SLOTS);
        const slots = Array.from({ length: slotCount }, (_, index) => {
            const id = saved[index];
            if (!this.registry.hasAssignable(id) || used.has(id)) return null;
            used.add(id);
            return id;
        });
        // Keep saved positions and place newly registered modules in the first free slots.
        for (const id of this.registry.assignable.map(module => module.id)) {
            if (used.has(id)) continue;
            let free = slots.indexOf(null);
            if (free < 0) { free = slots.length; slots.push(...Array(DECK_MODULE_SLOTS).fill(null)); }
            slots[free] = id;
            used.add(id);
        }
        return slots;
    }

    migrateLegacySlots(saved, positions = Array.from({ length: DECK_SLOT_COUNT }, (_, index) => index)) {
        const pages = Math.max(1, Math.ceil(saved.length / positions.length));
        const slots = Array(pages * DECK_MODULE_SLOTS).fill(null);
        const used = new Set();
        const overflow = [];
        saved.forEach((id, index) => {
            if (!this.registry.hasAssignable(id) || used.has(id)) return;
            const slot = DECK_MODULE_POSITIONS.indexOf(positions[index % positions.length]);
            if (slot < 0) { overflow.push(id); return; }
            slots[Math.floor(index / positions.length) * DECK_MODULE_SLOTS + slot] = id;
            used.add(id);
        });
        // Preserve physical positions and relocate only modules displaced by navigation keys.
        for (const id of overflow) {
            if (used.has(id)) continue;
            let free = slots.indexOf(null);
            if (free < 0) { free = slots.length; slots.push(...Array(DECK_MODULE_SLOTS).fill(null)); }
            slots[free] = id;
            used.add(id);
        }
        return this.normalizeLayout(slots);
    }

    loadLayout() {
        for (const key of ['chzzk.deck.pages.v6', 'chzzk.deck.pages.v5', 'chzzk.deck.pages.v4', 'chzzk.deck.slots.v3', 'chzzk.deck.modules.v2', 'chzzk.deck.layout.v1']) {
            try {
                const saved = JSON.parse(localStorage.getItem(key));
                if (['chzzk.deck.pages.v6', 'chzzk.deck.pages.v5', 'chzzk.deck.pages.v4'].includes(key)) {
                    if (!saved || !Array.isArray(saved.slots)) continue;
                    const layout = key === 'chzzk.deck.pages.v4' ? this.migrateLegacySlots(saved.slots)
                        : key === 'chzzk.deck.pages.v5' ? this.migrateLegacySlots(saved.slots, Array.from({ length: 12 }, (_, index) => index))
                        : this.normalizeLayout(saved.slots);
                    this.pageIndex = Math.max(0, Math.min(Number.isInteger(saved.pageIndex) ? saved.pageIndex : 0, layout.length / DECK_MODULE_SLOTS - 1));
                    return layout;
                }
                if (!Array.isArray(saved)) continue;
                this.pageIndex = 0;
                if (key === 'chzzk.deck.layout.v1') {
                    const ids = { 'open-obs': 'obs', 'start-ndi': 'ndi', 'stop-ndi': 'ndi', 'chat-toggle': 'chat', 'chat-settings': 'chat', 'copy-chat-url': 'chat' };
                    return this.normalizeLayout([...new Set(saved.map(id => ids[id]).filter(Boolean))]);
                }
                return key === 'chzzk.deck.slots.v3' ? this.migrateLegacySlots(saved) : this.normalizeLayout(saved);
            } catch { /* Try the previous layout version if this entry is damaged. */ }
        }
        return this.defaultLayout;
    }

    saveLayout() {
        this.layout = this.normalizeLayout(this.layout);
        this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.pageCount - 1));
        try { localStorage.setItem('chzzk.deck.pages.v6', JSON.stringify({ slots: this.layout, pageIndex: this.pageIndex })); }
        catch { this.notify('버튼 배치를 저장하지 못했습니다.', true); }
        this.buildKeys();
        this.update();
    }

    buildKeys() {
        const offset = this.pageIndex * DECK_MODULE_SLOTS;
        this.grid.setAttribute('aria-label', (this.pageIndex + 1) + '페이지. 5열 3행, 모듈 13칸과 11·15번 페이지 이동 슬롯. 방향키로 이동할 수 있습니다.');
        this.grid.replaceChildren(...Array.from({ length: DECK_SLOT_COUNT }, (_, position) => {
            const slot = position + 1;
            const fixed = this.registry.fixedAt(slot);
            const index = offset + DECK_MODULE_POSITIONS.indexOf(position);
            const module = fixed || this.registry.get(this.layout[index]) || this.registry.get('empty-slot');
            const key = module.createKey(this.context, slot);
            if (!fixed) key.dataset.index = index;
            return key;
        }));
    }

    focusPageControl() {
        const next = document.getElementById('next-page');
        const previous = document.getElementById('previous-page');
        (next.disabled ? previous.disabled ? document.getElementById('edit-deck') : previous : next).focus({ preventScroll: true });
    }

    get pageCount() { return this.layout.length / DECK_MODULE_SLOTS; }

    turnPage(delta) {
        const next = this.pageIndex + delta;
        if (this.view !== 'home' || next < 0 || next >= this.pageCount) return;
        this.pageIndex = next;
        this.returnModule = null;
        this.returnSlot = next * DECK_MODULE_SLOTS;
        this.saveLayout();
        if (!this.reorder.dragging) {
            if (this.reorder.picked) this.grid.querySelector('[data-index]')?.focus({ preventScroll: true });
            else this.focusPageControl();
        }
    }

    addPage() {
        if (!this.editing || this.view !== 'home') return;
        this.layout.push(...Array(DECK_MODULE_SLOTS).fill(null));
        this.pageIndex = this.pageCount - 1;
        this.returnModule = null;
        this.returnSlot = this.pageIndex * DECK_MODULE_SLOTS;
        this.saveLayout();
        this.focusPageControl();
    }

    removeEmptyPage() {
        const start = this.pageIndex * DECK_MODULE_SLOTS;
        if (!this.editing || this.view !== 'home' || this.pageCount === 1 || this.layout.slice(start, start + DECK_MODULE_SLOTS).some(Boolean)) return;
        this.layout.splice(start, DECK_MODULE_SLOTS);
        this.pageIndex = Math.min(this.pageIndex, this.pageCount - 1);
        this.returnModule = null;
        this.returnSlot = this.pageIndex * DECK_MODULE_SLOTS;
        this.saveLayout();
        this.showView('home');
        this.focusPageControl();
    }

    updatePages() {
        const remove = document.getElementById('remove-page');
        remove.disabled = this.pageCount === 1 || this.layout.slice(this.pageIndex * DECK_MODULE_SLOTS, (this.pageIndex + 1) * DECK_MODULE_SLOTS).some(Boolean);
        remove.hidden = !this.editing || this.view !== 'home' || remove.disabled;
    }

    bindEvents() {
        document.getElementById('remove-page').addEventListener('click', () => this.removeEmptyPage());
        this.grid.addEventListener('click', event => {
            if (performance.now() < this.reorder.ignoreClickUntil) { event.preventDefault(); return; }
            const key = event.target.closest('.deck-key');
            if (!key || key.disabled) return;
            const module = this.registry.get(key.dataset.keyModule);
            if (module?.fixedSlot) { module.activate(this.context); return; }
            const index = Number(key.dataset.index);
            if (!this.editing) this.run(this.layout[index]);
        });
        this.grid.addEventListener('keydown', event => {
            if (this.reorder.keyDown(event)) return;
            const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -DECK_COLUMNS, ArrowDown: DECK_COLUMNS };
            if (!(event.key in moves)) return;
            const keys = [...this.grid.children];
            const index = keys.indexOf(document.activeElement);
            if (index < 0) return;
            event.preventDefault();
            let next = index + moves[event.key];
            while (next >= 0 && next < keys.length && (keys[next].disabled || (this.reorder.picked && keys[next].classList.contains('utility-key')))) next += moves[event.key];
            keys[next]?.focus();
        });
        document.getElementById('edit-deck').addEventListener('click', () => this.toggleEdit());
        document.querySelectorAll('[data-window-action]').forEach(button => button.addEventListener('click', () => this.windowAction(button.dataset.windowAction)));
        document.getElementById('back-to-deck').addEventListener('click', () => this.goHome());
        document.querySelectorAll('[data-back-home]').forEach(button => button.addEventListener('click', () => this.goHome()));
        document.addEventListener('keydown', event => {
            if (event.isComposing || event.defaultPrevented) return;
            if (this.view === 'home' && !event.ctrlKey && !event.metaKey && !event.altKey && ['PageUp', 'PageDown'].includes(event.key)) {
                event.preventDefault(); this.turnPage(event.key === 'PageDown' ? 1 : -1); return;
            }
            if (event.key === 'Escape' && this.reorder.cancel()) { event.preventDefault(); return; }
            if (event.key === 'Escape' || (event.altKey && event.key === 'ArrowLeft')) {
                if (this.view !== 'home') { event.preventDefault(); this.goHome(); }
                else if (event.key === 'Escape' && this.editing) { event.preventDefault(); this.toggleEdit(); }
            }
        });

    }

    showView(view) {
        const module = this.registry.get(view);
        if (view !== 'home' && !module?.panel) return;
        if (view !== 'home') this.reorder.cancel({ immediate: true });
        if (this.view !== view) this.registry.get(this.view)?.onLeave(this.context);
        this.view = view;
        if (module) { this.editing = false; this.returnModule = view; module.onEnter(this.context); }
        const page = module?.panel?.view || view;
        document.querySelectorAll('[data-deck-view]').forEach(panel => { panel.hidden = panel.dataset.deckView !== page; });
        document.body.classList.toggle('is-panel-open', view !== 'home');
        document.getElementById('back-to-deck').hidden = view === 'home';
        document.getElementById('screen-feedback').hidden = true;
        document.getElementById('output-message').classList.remove('visible');
        clearTimeout(this.feedbackTimer);
        this.text('screen-title', view === 'home' ? '내 방송' : module.label);
        this.text('screen-type', module?.eyebrow || 'MAIN DECK');
        const panel = document.querySelector('[data-deck-view="' + page + '"]');
        const body = panel.querySelector('.panel-body');
        if (body) body.scrollTop = 0;
        this.update();
        if (view === 'home') {
            const key = this.returnModule ? [...this.grid.children].find(key => key.dataset.module === this.returnModule) : this.grid.querySelector(`[data-index="${this.returnSlot}"]`);
            (key && !key.disabled ? key : document.getElementById('edit-deck')).focus({ preventScroll: true });
        }
        else document.getElementById('back-to-deck').focus({ preventScroll: true });
    }

    goHome() {
        if (this.view !== 'home') {
            const index = this.returnModule ? this.layout.indexOf(this.returnModule) : this.returnSlot;
            this.pageIndex = Math.max(0, Math.min(Math.floor(Math.max(0, index) / DECK_MODULE_SLOTS), this.pageCount - 1));
            this.saveLayout();
        }
        this.showView('home');
    }

    toggleEdit() {
        this.reorder.cancel({ immediate: true });
        this.editing = !this.editing;
        if (this.view !== 'home') this.goHome();
        else this.update();
    }


    moveModule(from, to) {
        if (!this.editing || this.view !== 'home' || !Number.isInteger(from) || !Number.isInteger(to) ||
            from < 0 || to < 0 || from >= this.layout.length || to >= this.layout.length || from === to ||
            !this.registry.hasAssignable(this.layout[from])) return false;
        [this.layout[from], this.layout[to]] = [this.layout[to], this.layout[from]];
        this.returnModule = this.layout[to];
        this.returnSlot = to;
        this.saveLayout();
        return true;
    }

    run(id) { return this.registry.get(id)?.activate(this.context); }

    copyChatUrl() { return this.registry.get('chat')?.copySource(this.context); }

    async windowAction(action) {
        if (!window.deckWindow) return;
        try { this.setWindowState(await window.deckWindow.action(action)); }
        catch (error) { this.notify(error.message, true); }
    }

    setWindowState(state) {
        this.windowState = state;
        document.getElementById('pin-window').setAttribute('aria-pressed', String(state.pinned));
        const maximize = document.getElementById('maximize-window');
        maximize.title = state.maximized ? '이전 크기로' : '최대화';
        maximize.setAttribute('aria-label', maximize.title);
        this.update();
    }

    setOutputs(state) { this.outputs = state; this.update(); }

    update() {
        for (const key of this.grid.children) this.registry.get(key.dataset.keyModule)?.updateKey(key, this.context);
        this.registry.all.forEach(module => module.refresh(this.context));
        document.body.classList.toggle('is-editing', this.editing);
        const edit = document.getElementById('edit-deck');
        edit.setAttribute('aria-pressed', String(this.editing));
        edit.title = this.editing ? '편집 완료' : '버튼 편집';
        edit.setAttribute('aria-label', edit.title);
        document.querySelector('.device-signature b').textContent = this.editing ? '드래그로 배치' : 'Stream Deck';
        this.reorder?.paint();
        this.updatePages();
    }

    text(id, value) { document.getElementById(id).textContent = value; }

    notify(message, error = false) {
        if (this.view !== 'home') {
            const notice = document.getElementById('screen-feedback');
            notice.textContent = message;
            notice.classList.toggle('error', error);
            notice.hidden = false;
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = setTimeout(() => { notice.hidden = true; }, error ? 9000 : 5000);
            return;
        }
        const toast = document.getElementById('output-message');
        toast.textContent = message;
        toast.classList.toggle('error', error);
        toast.classList.add('visible');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('visible'), error ? 9000 : 5000);
    }
}

import { DeckMotion } from './motion.mjs';

// Logical placement is independent of the spring animation and always follows the pointer.
export class DeckReorder {
    constructor(deck) {
        this.deck = deck; this.grid = deck.grid;
        this.drag = null; this.picked = null; this.ignoreClickUntil = 0;
        this.motion = new DeckMotion(this.grid);
        this.listeners = new AbortController();
        const on = (target, type, handler) => target.addEventListener(type, handler, { signal: this.listeners.signal });
        on(this.grid, 'pointerdown', event => this.begin(event));
        on(this.grid, 'pointermove', event => this.move(event));
        on(this.grid, 'pointerup', event => this.end(event));
        on(this.grid, 'pointercancel', () => this.cancel({ immediate: true }));
        on(this.grid, 'lostpointercapture', () => { if (this.drag) this.cancel({ immediate: true }); });
        on(this.grid, 'dragstart', event => event.preventDefault());
        on(window, 'blur', () => this.cancel({ immediate: true }));
        on(window, 'resize', () => this.cancel({ immediate: true }));
        on(document, 'visibilitychange', () => { if (document.hidden) this.cancel({ immediate: true }); });
        on(this.motion.preference, 'change', () => this.cancel({ immediate: true }));
    }
    get dragging() { return Boolean(this.drag?.active); }
    get enabled() { return this.deck.editing && this.deck.view === 'home'; }
    keyAt(x, y) {
        const key = document.elementFromPoint(x, y)?.closest('.deck-key');
        return key && this.grid.contains(key) ? key : null;
    }
    begin(event) {
        if (!this.enabled || event.button !== 0 || !event.isPrimary || this.drag) return;
        const key = event.target.closest('.module-key');
        if (!key?.dataset.module || key.disabled) return;
        this.cancel({ immediate: true });
        const rect = key.getBoundingClientRect();
        this.drag = { pointerId: event.pointerId, moduleId: key.dataset.module,
            x: event.clientX, y: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top,
            width: rect.width, height: rect.height, active: false, target: null };
        key.focus({ preventScroll: true });
        this.grid.setPointerCapture(event.pointerId);
    }
    move(event) {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!this.enabled) { this.cancel({ immediate: true }); return; }
        if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        event.preventDefault();
        if (!drag.active) {
            drag.active = true;
            drag.preview = this.motion.lift(this.grid.querySelector('[data-module="' + drag.moduleId + '"]'), drag);
            this.deck.update();
        }
        const key = this.keyAt(event.clientX, event.clientY);
        drag.target = key?.hasAttribute('data-index') ? Number(key.dataset.index) : null;
        this.motion.follow(event.clientX, event.clientY, drag.target);
        this.hoverPage(key); this.paint();
    }
    hoverPage(key) {
        const direction = key?.dataset.utility;
        const canTurn = direction === 'previous' ? this.deck.pageIndex > 0
            : direction === 'next' && this.deck.pageIndex < this.deck.pageCount - 1;
        const hover = canTurn ? direction : null;
        if (this.hover === hover) return;
        clearTimeout(this.pageTimer); this.hover = hover;
        if (hover) this.pageTimer = setTimeout(() => {
            if (!this.dragging || !this.enabled) return;
            this.drag.target = null;
            this.deck.turnPage(hover === 'previous' ? -1 : 1);
            this.motion.follow(this.motion.session.pointerX, this.motion.session.pointerY, null);
            this.announce('페이지를 넘겼습니다. 원하는 칸에 놓으세요.');
        }, 650);
    }
    end(event) {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const key = this.keyAt(event.clientX, event.clientY);
        const target = key?.hasAttribute('data-index') ? Number(key.dataset.index) : null;
        const from = this.deck.layout.indexOf(drag.moduleId), before = this.motion.snapshot();
        this.release();
        if (!drag.active) return;
        event.preventDefault();
        const moved = target !== null && this.deck.moveModule(from, target);
        const destination = this.grid.querySelector('[data-module="' + drag.moduleId + '"]');
        this.motion.land(destination, moved ? before : null, moved);
        if (moved) {
            destination?.focus({ preventScroll: true });
            this.announce('모듈 위치를 저장했습니다.');
        }
    }
    keyDown(event) {
        if (!this.enabled || ![' ', 'Enter'].includes(event.key)) return false;
        const key = event.target.closest('.deck-key');
        if (!key?.hasAttribute('data-index') || event.repeat) return false;
        event.preventDefault();
        const index = Number(key.dataset.index);
        if (this.picked) {
            const from = this.deck.layout.indexOf(this.picked), before = this.motion.snapshot();
            this.cancel({ immediate: true });
            if (this.deck.moveModule(from, index)) {
                this.motion.reflow(before);
                this.grid.querySelector('[data-index="' + index + '"]')?.focus({ preventScroll: true });
                this.announce('모듈 위치를 저장했습니다.');
            }
        } else if (this.deck.layout[index]) {
            this.picked = this.deck.layout[index];
            this.announce('모듈을 선택했습니다. 방향키로 이동하고 Space로 놓으세요. Esc로 취소합니다.');
            this.paint();
        }
        return true;
    }
    paint() {
        const source = this.dragging ? this.drag.moduleId : this.picked;
        for (const key of this.grid.children) {
            key.classList.toggle('is-drag-origin', Boolean(source && key.dataset.module === source));
            key.classList.toggle('is-drop-target', this.dragging && key.hasAttribute('data-index') && Number(key.dataset.index) === this.drag.target);
            key.classList.toggle('is-page-hover', this.dragging && Boolean(this.hover) && key.dataset.utility === this.hover);
        }
        document.body.classList.toggle('is-dragging', this.dragging);
        this.motion.syncGrid();
    }
    announce(message) { document.getElementById('deck-placement-status').textContent = message; }
    release() {
        const drag = this.drag;
        if (drag?.active) this.ignoreClickUntil = performance.now() + 250;
        this.drag = null; this.picked = null;
        clearTimeout(this.pageTimer); this.hover = null;
        if (drag && this.grid.hasPointerCapture(drag.pointerId)) this.grid.releasePointerCapture(drag.pointerId);
        this.paint();
        if (drag?.active) this.deck.update();
    }
    cancel({ immediate = false } = {}) {
        const changed = Boolean(this.drag || this.picked), drag = this.drag;
        if (!changed && !immediate) return false;
        this.release();
        if (drag?.active && !immediate && this.enabled && !document.hidden) {
            this.motion.land(this.grid.querySelector('[data-module="' + drag.moduleId + '"]'), null, false);
        } else this.motion.reset();
        return changed;
    }
    dispose() { this.cancel({ immediate: true }); this.listeners.abort(); }
}

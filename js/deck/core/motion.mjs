import { axis, advance, clamp } from './spring.mjs';

// Visual physics only. The grid and pointer hit boxes never move.
export class DeckMotion {
    constructor(grid) {
        this.grid = grid;
        this.preference = matchMedia('(prefers-reduced-motion: reduce)');
        this.session = null;
        this.rows = [];
        this.animations = new Set();
        this.frame = null;
        this.lastTime = 0;
    }
    get reduced() { return this.preference.matches; }
    get animating() { return this.frame !== null || this.animations.size > 0; }
    snapshot() {
        return new Map([...this.grid.querySelectorAll('[data-module]')].filter(key => key.dataset.module)
            .map(key => [key.dataset.module, key.getBoundingClientRect()]));
    }
    lift(key, drag) {
        this.reset();
        const rect = key.getBoundingClientRect(), preview = key.cloneNode(true);
        for (const attribute of ['id', 'data-module', 'data-index']) preview.removeAttribute(attribute);
        preview.classList.remove('is-drag-origin', 'is-drop-target', 'is-motion-arriving');
        preview.classList.add('drag-preview');
        preview.tabIndex = -1; preview.setAttribute('aria-hidden', 'true');
        Object.assign(preview.style, { width: rect.width + 'px', height: rect.height + 'px', left: '0px', top: '0px' });
        document.body.append(preview);
        this.session = { preview, moduleId: drag.moduleId, mode: 'drag', width: rect.width, height: rect.height,
            grabX: drag.dx, grabY: drag.dy, targetX: rect.left, targetY: rect.top,
            pointerX: drag.x, pointerY: drag.y, targetIndex: null,
            x: axis(rect.left), y: axis(rect.top), roll: axis(0), tiltX: axis(0), tiltY: axis(0), scale: axis(1) };
        this.syncGrid();
        this.draw(); this.wake();
        return preview;
    }
    follow(x, y, targetIndex) {
        const s = this.session;
        if (!s || s.mode !== 'drag') return;
        s.pointerX = x; s.pointerY = y; s.targetX = x - s.grabX; s.targetY = y - s.grabY; s.targetIndex = targetIndex;
        // Keep the grabbed card close even during a large pointer jump.
        const dx = s.x.value - s.targetX, dy = s.y.value - s.targetY, distance = Math.hypot(dx, dy);
        if (distance > 85) { s.x.value = s.targetX + dx / distance * 85; s.y.value = s.targetY + dy / distance * 85; }
        if (this.reduced) {
            s.x = axis(s.targetX); s.y = axis(s.targetY); this.draw(); return;
        }
        this.syncGrid(); this.wake();
    }
    syncGrid() {
        if (!this.session || this.rows[0]?.key === this.grid.firstElementChild) return;
        this.clearRows();
        this.rows = [...this.grid.children].map(key => ({
            key, screen: key.querySelector('.key-screen'), rect: key.getBoundingClientRect(),
            x: axis(0), y: axis(0), roll: axis(0), scale: axis(1)
        }));
        if (!this.reduced) for (const row of this.rows) row.screen.classList.add('motion-surface');
        this.wake();
    }
    wake() {
        if (this.frame !== null || !this.session) return;
        this.frame = requestAnimationFrame(time => this.tick(time));
    }
    tick(time) {
        this.frame = null;
        const s = this.session;
        if (!s) return;
        const dt = this.lastTime ? Math.min(.05, Math.max(.001, (time - this.lastTime) / 1000)) : 1 / 60;
        this.lastTime = time;
        const dragging = s.mode === 'drag';
        let moving = false;
        if (this.reduced) {
            s.x = axis(s.targetX); s.y = axis(s.targetY); s.scale = axis(1);
            s.roll = axis(0); s.tiltX = axis(0); s.tiltY = axis(0);
        } else {
            moving = advance(s.x, s.targetX, dt) || moving;
            moving = advance(s.y, s.targetY, dt) || moving;
            moving = advance(s.roll, dragging ? clamp(s.x.velocity * .013, -13, 13) : 0, dt, 4.5, .64) || moving;
            moving = advance(s.tiltX, dragging ? clamp(-s.y.velocity * .008, -9, 9) : 0, dt, 5, .72) || moving;
            moving = advance(s.tiltY, dragging ? clamp(s.x.velocity * .008, -9, 9) : 0, dt, 5, .72) || moving;
            moving = advance(s.scale, dragging ? 1.075 : 1, dt, 5, .68, .0006) || moving;
            for (const row of this.rows) {
                const dx = row.rect.left + row.rect.width / 2 - s.pointerX;
                const dy = row.rect.top + row.rect.height / 2 - s.pointerY;
                const distance = Math.max(1, Math.hypot(dx, dy));
                const source = row.key.dataset.module === s.moduleId;
                const force = dragging && !source ? Math.pow(Math.max(0, 1 - distance / (s.width * 1.65)), 2) * 11 : 0;
                const target = dragging && row.key.hasAttribute('data-index') && Number(row.key.dataset.index) === s.targetIndex;
                const scale = dragging && source ? .93 : target ? row.key.dataset.module ? .94 : 1.025 : 1;
                moving = advance(row.x, dx / distance * force, dt, 6, .8) || moving;
                moving = advance(row.y, dy / distance * force, dt, 6, .8) || moving;
                moving = advance(row.roll, dx / distance * force * .23, dt, 5, .72) || moving;
                moving = advance(row.scale, scale, dt, 6, .75, .0006) || moving;
                row.screen.style.transform = 'translate3d(' + row.x.value.toFixed(2) + 'px,' + row.y.value.toFixed(2) +
                    'px,0) rotate(' + row.roll.value.toFixed(2) + 'deg) scale(' + row.scale.value.toFixed(4) + ')';
            }
        }
        this.draw();
        if (!dragging && (!moving || time - s.landedAt > 800)) { this.complete(); return; }
        if (moving) this.wake(); else this.lastTime = 0;
    }
    draw() {
        const s = this.session;
        if (!s) return;
        s.preview.style.transform = 'translate3d(' + s.x.value.toFixed(2) + 'px,' + s.y.value.toFixed(2) +
            'px,0) perspective(600px) rotateX(' + s.tiltX.value.toFixed(2) + 'deg) rotateY(' +
            s.tiltY.value.toFixed(2) + 'deg) rotateZ(' + s.roll.value.toFixed(2) + 'deg) scale(' + s.scale.value.toFixed(4) + ')';
    }
    land(key, before = null, impact = true) {
        const s = this.session;
        if (!s) { if (before) this.reflow(before); return; }
        if (this.reduced) { this.reset(); return; }
        this.syncGrid();
        if (!key) { this.reset(); return; }
        const rect = key.getBoundingClientRect();
        s.mode = 'land'; s.targetX = rect.left; s.targetY = rect.top; s.targetIndex = null;
        s.arrival = key; s.impact = impact; s.landedAt = performance.now();
        key.classList.add('is-motion-arriving');
        s.preview.classList.add('is-landing');
        if (before) this.reflow(before, s.moduleId);
        this.wake();
    }
    reflow(before, excluded = null) {
        if (this.reduced) return;
        for (const key of this.grid.querySelectorAll('[data-module]')) {
            const rect = before.get(key.dataset.module);
            if (!rect || key.dataset.module === excluded) continue;
            const now = key.getBoundingClientRect(), x = rect.left - now.left, y = rect.top - now.top;
            if (Math.hypot(x, y) < 1) continue;
            this.play(key.querySelector('.key-screen'), [
                { transform: 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + clamp(x * -.03, -8, 8) + 'deg) scale(.96)' },
                { transform: 'translate3d(' + (-x * .035) + 'px,' + (-y * .035) + 'px,0) scale(1.025)', offset: .72 },
                { transform: 'none' }
            ], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
    }
    play(element, frames, timing) {
        if (!element?.isConnected || this.reduced) return;
        const animation = element.animate(frames, { ...timing, fill: 'none' });
        this.animations.add(animation); element.classList.add('motion-surface');
        element.parentElement.classList.add('is-motion-travelling');
        const done = () => {
            this.animations.delete(animation);
            element.parentElement.classList.remove('is-motion-travelling');
            if (!this.session) element.classList.remove('motion-surface');
        };
        animation.onfinish = done; animation.oncancel = done;
    }
    complete() {
        const s = this.session;
        if (!s) return;
        s.preview.remove(); s.arrival?.classList.remove('is-motion-arriving');
        this.session = null; this.lastTime = 0;
        this.clearRows();
        if (!s.impact || !s.arrival?.isConnected || this.reduced) return;
        const center = s.arrival.getBoundingClientRect();
        for (const key of this.grid.children) {
            const rect = key.getBoundingClientRect(), distance = Math.hypot(rect.left - center.left, rect.top - center.top);
            if (distance > center.width * 1.6) continue;
            const isTarget = key === s.arrival;
            this.play(key.querySelector('.key-screen'), [
                { transform: 'scale(1)' },
                { transform: isTarget ? 'scale(.95)' : 'scale(.975)', offset: .22 },
                { transform: isTarget ? 'scale(1.035)' : 'scale(1.008)', offset: .55 },
                { transform: 'none' }
            ], { duration: isTarget ? 280 : 240, delay: isTarget ? 0 : distance / center.width * 28, easing: 'cubic-bezier(.2,.8,.25,1)' });
        }
    }
    clearRows() {
        for (const row of this.rows) {
            row.screen.style.removeProperty('transform');
            row.screen.classList.remove('motion-surface');
        }
        this.rows = [];
    }
    reset() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null; this.lastTime = 0;
        this.session?.preview.remove(); this.session?.arrival?.classList.remove('is-motion-arriving');
        this.session = null;
        for (const animation of [...this.animations]) animation.cancel();
        this.animations.clear(); this.clearRows();
    }
}

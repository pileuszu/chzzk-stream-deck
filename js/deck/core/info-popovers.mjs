/** Top-layer help shared by compact module panels. No polling or layout expansion. */
export class InfoPopovers {
    constructor(root, signal) {
        this.root = root;
        this.items = [...root.querySelectorAll('[data-info-trigger]')].map(button => ({
            button, panel: document.getElementById(button.getAttribute('aria-controls'))
        }));
        for (const { button, panel } of this.items) {
            // Register the invoker with native light-dismiss, including a second click on it.
            button.setAttribute('popovertarget', panel.id);
            button.addEventListener('click', event => {
                event.preventDefault();
                if (panel.matches(':popover-open')) this.close();
                else this.open(panel.id);
            }, { signal });
            panel.addEventListener('beforetoggle', event => {
                button.setAttribute('aria-expanded', String(event.newState === 'open'));
            }, { signal });
            panel.querySelector('[data-info-close]').addEventListener('click', () => this.close(true), { signal });
            panel.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                this.close(true);
            }, { signal });
        }
        window.addEventListener('resize', () => this.position(), { signal });
        // Scrolling help is independent; scrolling its anchor dismisses it.
        root.addEventListener('scroll', event => {
            if (!this.items.some(({ panel }) => panel.contains(event.target))) this.close();
        }, { capture: true, signal });
        signal.addEventListener('abort', () => this.close(), { once: true });
    }
    open(id) {
        const item = this.items.find(({ panel }) => panel.id === id);
        if (!item || !item.button.getClientRects().length) return;
        this.close();
        item.button.focus({ preventScroll: true });
        item.panel.showPopover(); // Native light-dismiss and Escape; never clipped by panel overflow.
        this.position();
        item.panel.focus({ preventScroll: true });
    }
    close(restoreFocus = false) {
        for (const { button, panel } of this.items) {
            if (!panel.matches(':popover-open')) continue;
            panel.hidePopover();
            if (restoreFocus) button.focus({ preventScroll: true });
        }
    }
    position() {
        const item = this.items.find(({ panel }) => panel.matches(':popover-open'));
        if (!item) return;
        const { panel, button } = item, anchor = button.getBoundingClientRect();
        const bounds = this.root.getBoundingClientRect(), gap = 8;
        const left = Math.max(gap, bounds.left + gap), right = Math.min(innerWidth - gap, bounds.right - gap);
        const top = Math.max(gap, bounds.top + gap), bottom = Math.min(innerHeight - gap, bounds.bottom - gap);
        const below = bottom - anchor.bottom - gap, above = anchor.top - top - gap;
        panel.style.maxHeight = `${Math.max(120, Math.min(280, Math.max(below, above), bottom - top))}px`;
        panel.style.maxWidth = `${right - left}px`;
        const size = panel.getBoundingClientRect();
        const y = below >= size.height || below >= above ? anchor.bottom + gap : anchor.top - gap - size.height;
        panel.style.left = `${Math.max(left, Math.min(anchor.left, right - size.width))}px`;
        panel.style.top = `${Math.max(top, Math.min(y, bottom - size.height))}px`;
    }
}

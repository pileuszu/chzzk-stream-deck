import { PanelTabs } from './panel-tabs.mjs';
import { KeyView } from './key-view.mjs';

/** Template method base: subclasses supply metadata, state and lifecycle hooks. */
export class DeckModule {
    constructor({ id, label, icon = 'plus', accent = '#b4c4c0', tint = '#29332b', description = '',
        panel = null, eyebrow = 'MODULE', fixedSlot = null, assignable = true }) {
        if (!id || !label) throw new TypeError('DeckModule requires an id and label');
        Object.assign(this, { id, label, icon, accent, tint, description, panel, eyebrow, fixedSlot, assignable });
        this.listeners = null;
    }

    // Shared lifecycle; modules own their panel template and event bindings.
    mount(context) {
        if (this.listeners) return;
        if (this.panel && !document.getElementById(this.panel.id)) {
            const template = document.createElement('template');
            template.innerHTML = this.panel.html; // Bundled developer-authored template only.
            context.deck.screenBed.append(template.content.cloneNode(true));
        }
        this.listeners = new AbortController();
        this.bind(context);
    }
    listen(element, event, handler, context) {
        element.addEventListener(event, value => this.invoke(context, () => handler(value)), { signal: this.listeners.signal });
    }
    createTabs(context, options) {
        return new PanelTabs(document.getElementById(this.panel.id), {
            signal: this.listeners.signal, isActive: () => context.deck.view === this.id, ...options
        });
    }
    dispose() { this.listeners?.abort(); this.listeners = null; }
    invoke(context, action) {
        try {
            const result = action();
            if (result?.then) return Promise.resolve(result).catch(error => context.deck.notify(error.message, true));
            return result;
        } catch (error) { context.deck.notify(error.message, true); }
    }
    bind(_context) {}
    refresh(_context) {}
    onEnter(_context) {}
    onLeave(_context) {}
    getState(_context) { return {}; }
    onActivate(context) { if (this.panel) context.deck.showView(this.id); }

    keyModel(context, slot) {
        const state = this.getState(context);
        const editing = context.deck.editing && this.assignable;
        const stateLabel = state.state ?? (typeof state.active === 'boolean' ? (state.active ? 'ON' : 'OFF') : '');
        return {
            label: this.label, icon: this.icon, accent: this.accent, tint: this.tint,
            title: this.description, ...state,
            state: stateLabel,
            ariaLabel: state.ariaLabel ?? this.label + (stateLabel ? ' · ' + stateLabel : ''),
            ...(editing ? { ariaLabel: this.label + ' 위치 편집', title: this.label + ' · 드래그하여 이동 · Space로 선택' } : {})
        };
    }
    createKey(context, slot) {
        const key = KeyView.create(slot);
        key.dataset.keyModule = this.id;
        key.classList.add(this.fixedSlot ? 'utility-key' : 'module-key');
        key.dataset.module = this.assignable ? this.id : '';
        if (this.fixedSlot) {
            key.id = this.id;
            key.dataset.utility = this.direction;
        }
        this.updateKey(key, context);
        return key;
    }
    updateKey(key, context) { KeyView.update(key, this.keyModel(context, Number(key.dataset.slot))); }
    activate(context) {
        if (this.getState(context).disabled) return;
        return this.invoke(context, () => this.onActivate(context));
    }
}

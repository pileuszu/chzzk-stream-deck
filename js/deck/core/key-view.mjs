import { DECK_ICONS } from '../icons.mjs';

// Every physical key uses this DOM and css/deck.css geometry. Module data is text, never HTML.
export class KeyView {
    static create(slot) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'deck-key';
        key.dataset.slot = slot;
        key.innerHTML = '<span class="key-screen"><span class="key-number"></span><span class="key-state"></span><span class="key-main"><span class="key-icon"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span><span class="key-label"></span></span><span class="key-caption"></span></span>';
        key.querySelector('.key-number').textContent = String(slot).padStart(2, '0');
        return key;
    }

    static update(key, model) {
        key.style.setProperty('--accent', model.accent);
        key.style.setProperty('--tint', model.tint);
        key.disabled = Boolean(model.disabled);
        key.title = model.title || model.label;
        key.setAttribute('aria-label', model.ariaLabel || model.label);
        key.classList.toggle('is-active', Boolean(model.active));
        key.classList.toggle('is-inactive', model.active === false && !model.empty);
        key.classList.toggle('is-empty', Boolean(model.empty));
        for (const field of ['label', 'state', 'caption']) {
            const element = key.querySelector('.key-' + field);
            const text = model[field] || '';
            if (element.textContent !== text) element.textContent = text;
        }
        const icon = key.querySelector('.key-icon svg');
        if (icon.dataset.kind !== model.icon) {
            icon.dataset.kind = model.icon;
            icon.innerHTML = DECK_ICONS[model.icon] || DECK_ICONS.plus;
        }
    }
}

import { DeckModule } from '../core/module.mjs';

class PageModule extends DeckModule {
    constructor(metadata) { super({ accent: '#9dbfcb', tint: '#29373d', assignable: false, ...metadata }); }
    createKey(context, slot) {
        const key = super.createKey(context, slot);
        const caption = key.querySelector('.key-caption');
        caption.setAttribute('role', 'status');
        caption.setAttribute('aria-live', 'polite');
        return key;
    }
    pageLabel(deck) { return String(deck.pageIndex + 1).padStart(2, '0') + ' / ' + String(deck.pageCount).padStart(2, '0'); }
}

export class PreviousPageModule extends PageModule {
    constructor() { super({ id: 'previous-page', label: '이전 페이지', icon: 'previous', fixedSlot: 11 }); this.direction = 'previous'; }
    getState({ deck }) {
        return { disabled: deck.pageIndex === 0, caption: this.pageLabel(deck),
            title: deck.pageIndex === 0 ? '첫 페이지' : '이전 페이지 · Page Up',
            ariaLabel: '이전 페이지, 현재 ' + this.pageLabel(deck) };
    }
    onActivate({ deck }) { deck.turnPage(-1); }
}

export class NextPageModule extends PageModule {
    constructor() { super({ id: 'next-page', label: '다음 페이지', icon: 'next', fixedSlot: 15 }); this.direction = 'next'; }
    getState({ deck }) {
        const last = deck.pageIndex === deck.pageCount - 1;
        const add = deck.editing && last && !deck.reorder?.dragging;
        return { disabled: last && !add, label: add ? '페이지 추가' : this.label, icon: add ? 'plus' : this.icon,
            caption: add ? '+ NEW PAGE' : last ? '마지막 페이지' : String(deck.pageIndex + 2).padStart(2, '0') + ' PAGE',
            title: add ? '새 페이지 추가' : last ? '마지막 페이지 · 버튼 편집에서 페이지를 추가하세요' : '다음 페이지 · Page Down',
            ariaLabel: add ? '새 페이지 추가' : '다음 페이지, 현재 ' + this.pageLabel(deck) };
    }
    onActivate({ deck }) {
        if (deck.editing && deck.pageIndex === deck.pageCount - 1) deck.addPage();
        else deck.turnPage(1);
    }
}

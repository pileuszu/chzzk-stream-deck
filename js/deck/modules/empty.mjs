import { DeckModule } from '../core/module.mjs';

export class EmptySlotModule extends DeckModule {
    constructor() { super({ id: 'empty-slot', label: '빈 슬롯', assignable: false, accent: '#8c9d88', tint: '#29332b' }); }
    getState({ deck }) { return { disabled: !deck.editing, empty: true }; }
    keyModel(context, slot) {
        return { ...super.keyModel(context, slot), label: context.deck.editing ? '빈 슬롯' : '',
            ariaLabel: slot + '번 빈 슬롯' + (context.deck.editing ? ' 위치 편집' : ''),
            title: context.deck.editing ? '이 칸에 모듈을 놓으세요' : '새 모듈을 위한 빈 슬롯' };
    }
}

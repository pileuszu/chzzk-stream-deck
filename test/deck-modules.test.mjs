import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckModule } from '../js/deck/core/module.mjs';
import { ModuleRegistry } from '../js/deck/core/registry.mjs';
import { createModuleRegistry } from '../js/deck/index.mjs';
import { OutputDeckModule } from '../js/deck/modules/output.mjs';

test('registry requires the shared base and prevents duplicate ids and physical slots', () => {
    const registry = createModuleRegistry();
    assert.ok(registry.all.every(module => module instanceof DeckModule));
    assert.ok(registry.get('obs') instanceof OutputDeckModule);
    assert.ok(registry.get('ndi') instanceof OutputDeckModule);
    assert.deepEqual(registry.assignable.map(module => module.id), ['obs', 'ndi', 'chat']);
    assert.equal(registry.fixedAt(11).id, 'previous-page');
    assert.equal(registry.fixedAt(15).id, 'next-page');
    assert.equal(registry.fixedAt(13), undefined);
    assert.throws(() => registry.register({ id: 'plain' }), /extend DeckModule/);
    assert.throws(() => registry.register(new DeckModule({ id: 'obs', label: 'Duplicate' })), /Duplicate/);
    assert.throws(() => registry.register(new DeckModule({ id: 'bad', label: 'Bad', fixedSlot: 13, assignable: false })), /11 and 15/);
    assert.throws(() => registry.register(new DeckModule({ id: 'second', label: 'Second', fixedSlot: 11, assignable: false })), /Duplicate fixed/);
});

test('a subclass supplies state and lifecycle while the base owns activation/error handling', async () => {
    const events = [];
    const context = { deck: { editing: false, showView: id => events.push(id), notify: message => events.push(message) } };
    class Custom extends DeckModule {
        constructor() { super({ id: 'custom', label: 'Custom', panel: { view: 'custom' } }); this.disabled = true; }
        getState() { return { active: true, disabled: this.disabled }; }
    }
    const module = new Custom();
    module.activate(context); assert.deepEqual(events, []);
    module.disabled = false; module.activate(context); assert.deepEqual(events, ['custom']);
    assert.equal(module.keyModel(context, 1).state, 'ON');
    context.deck.editing = true;
    assert.equal(module.keyModel(context, 1).ariaLabel, 'Custom 위치 편집');
    await module.invoke(context, () => Promise.reject(new Error('Async failure')));
    module.invoke(context, () => { throw new Error('Sync failure'); });
    assert.deepEqual(events, ['custom', 'Async failure', 'Sync failure']);
});

test('output modules share guards and dispatch only their own permitted actions', () => {
    const registry = createModuleRegistry();
    const obs = registry.get('obs'), ndi = registry.get('ndi');
    const calls = [];
    const context = { deck: { outputs: { supported: true, local: { installed: true, registered: true, running: true }, ndi: { built: true, processRunning: false } } }, outputs: { busy: false, action: action => calls.push(action) } };
    ndi.performAction('start-ndi', context);
    ndi.performAction('open-obs', context);
    obs.performAction('start-ndi', context);
    assert.deepEqual(calls, []);
    obs.performAction('open-obs', context);
    assert.deepEqual(calls, ['open-obs']);
    context.deck.outputs.local.running = false;
    ndi.performAction('start-ndi', context);
    assert.deepEqual(calls, ['open-obs', 'start-ndi']);
    context.outputs.busy = true;
    ndi.performAction('start-ndi', context); obs.performAction('open-folder', context);
    assert.equal(calls.length, 2);
    context.outputs.busy = false;
    context.deck.outputs.ndi.processRunning = true;
    obs.performAction('open-obs', context); ndi.performAction('start-ndi', context);
    ndi.performAction('stop-ndi', context);
    assert.deepEqual(calls, ['open-obs', 'start-ndi', 'stop-ndi']);
    context.deck.outputs.processError = 'failed';
    ndi.performAction('stop-ndi', context); assert.equal(calls.length, 3);
    context.deck.outputs.supported = false;
    ndi.performAction('open-folder', context); assert.equal(calls.length, 3);
});

test('navigation activation respects first/last page and editing mode', () => {
    const registry = createModuleRegistry();
    const calls = [];
    const deck = { editing: false, pageIndex: 0, pageCount: 1, turnPage: delta => calls.push(delta), addPage: () => calls.push('add') };
    const context = { deck };
    registry.fixedAt(11).activate(context); registry.fixedAt(15).activate(context);
    assert.deepEqual(calls, []);
    deck.editing = true;
    assert.equal(registry.fixedAt(15).keyModel(context).icon, 'plus');
    registry.fixedAt(15).activate(context); assert.deepEqual(calls, ['add']);
    deck.pageCount = 2;
    registry.fixedAt(15).activate(context); assert.deepEqual(calls, ['add', 1]);
    deck.pageIndex = 1;
    registry.fixedAt(11).activate(context); assert.deepEqual(calls, ['add', 1, -1]);
    assert.equal(registry.fixedAt(11).keyModel(context).caption, '02 / 02');
});

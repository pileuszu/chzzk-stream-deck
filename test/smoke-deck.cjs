// Exercise only this app's UI, window controls and local preferences. Never start a capture.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const results = path.resolve(__dirname, '../test-results');
fs.mkdirSync(results, { recursive: true });
app.setPath('userData', path.join(results, process.env.DECK_TEST_SOFTWARE ? 'deck-test-profile-software' : 'deck-test-profile'));
if (process.env.DECK_TEST_SOFTWARE) app.disableHardwareAcceleration();
process.env.PORT = '17113';
const failures = [];
let testShutdowns = 0;
// This isolated UI test must never stop the user's live native outputs.
require('../src/output-modules').OutputModules.prototype.shutdown = async function () { testShutdowns++; };
// UI tests observe fixtures, never the user's live OBS processes or source configuration.
require('../src/output-modules').OutputModules.prototype.readState = async function () {
    return {supported:true,busy:false,processError:'',root:'fixture',ndi:{built:true,processRunning:false,config:{}},
        local:{installed:true,registered:true,processRunning:false,running:false,healthy:false,controlAvailable:false,
            revision:'fixture',configPath:'fixture/local-capture.ini',config:{width:'1920',height:'1080',fps:'30',monitor:'0',buffer_ms:'500',audio_offset_ms:'0'},
            setup:{built:true,obsInstalled:true,initialized:true,available:true}}};
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.on('browser-window-created', (_event, window) => {
    window.webContents.on('console-message', (_event, level, message) => { if (level === 3) failures.push(message); });
    window.webContents.once('did-finish-load', async () => {
        try {
            const evaluate = script => window.webContents.executeJavaScript(script);
            const capture = async name => {
                await delay(200);
                fs.writeFileSync(path.join(results, name + '.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
            };
            const screen = () => evaluate(`({
                view: window.deck.view,
                visible: [...document.querySelectorAll('[data-deck-view]')].filter(panel => !panel.hidden).map(panel => panel.dataset.deckView),
                homeHidden: document.getElementById('module-list').hidden,
                backHidden: document.getElementById('back-to-deck').hidden,
                dialogs: document.querySelectorAll('dialog, [role="dialog"]').length,
                overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
                drag: getComputedStyle(document.querySelector('.deck-header')).webkitAppRegion,
                backInHeader: Boolean(document.getElementById('back-to-deck').closest('.deck-header')),
                backDraggable: getComputedStyle(document.getElementById('back-to-deck')).webkitAppRegion,
                headerBottom: document.querySelector('.deck-header').getBoundingClientRect().bottom,
                panelTop: document.querySelector('[data-deck-view]:not([hidden])').getBoundingClientRect().top,
                focusModule: document.activeElement.dataset.module || null
            })`);
            const checkScreen = async (view, page = view) => {
                const state = await screen();
                assert.equal(state.view, view);
                assert.deepEqual(state.visible, [page]);
                assert.equal(state.homeHidden, view !== 'home');
                assert.equal(state.backHidden, view === 'home');
                assert.equal(state.dialogs, 0);
                assert.equal(state.overflow, false);
                assert.equal(state.drag, 'drag');
                if (view !== 'home') {
                    assert.equal(state.backInHeader, true);
                    assert.equal(state.backDraggable, 'no-drag');
                    assert.ok(state.panelTop - state.headerBottom < 12, 'Redundant module header takes up space');
                    assert.equal(await evaluate(`(() => {
                        const footer = document.querySelector('[data-deck-view="${page}"] .panel-footer').getBoundingClientRect();
                        return footer.height > 0 && footer.top >= 0 && footer.bottom <= innerHeight;
                    })()`), true);
                }
                return state;
            };
            window.show(); window.focus();
            await evaluate('document.fonts.ready.then(() => true)');
            const loadedFonts = await evaluate('[...document.fonts].map(font => ({ family: font.family, weight: font.weight, status: font.status }))');
            console.log('DECK_LOADED_FONTS:', JSON.stringify(loadedFonts));
            await evaluate("import('./js/deck/core/module.mjs').then(module => { window.TestDeckModule = module.DeckModule; })");
            const checkKeyDesign = async () => {
                const metrics = await evaluate(`(() => {
                    const keys = [...document.querySelectorAll('.deck-key:not(.is-empty)')];
                    return keys.map(key => {
                        const slot = key.getBoundingClientRect();
                        const box = key.querySelector('.key-screen').getBoundingClientRect();
                        const icon = key.querySelector('.key-icon').getBoundingClientRect();
                        const label = key.querySelector('.key-label').getBoundingClientRect();
                        const caption = key.querySelector('.key-caption').getBoundingClientRect();
                        const font = getComputedStyle(key.querySelector('.key-label'));
                        return { id: key.dataset.keyModule, iconWidth: icon.width, iconHeight: icon.height,
                            iconTop: icon.top - box.top, labelTop: label.top - box.top,
                            centerXError: icon.left + icon.width / 2 - (slot.left + slot.width / 2),
                            centerYError: icon.top + icon.height / 2 - (slot.top + slot.height / 2),
                            labelGap: label.top - icon.bottom, labelInside: label.bottom <= box.bottom,
                            labelFont: font.fontSize, labelWeight: font.fontWeight,
                            captionClear: !key.querySelector('.key-caption').textContent || (caption.bottom <= icon.top && caption.top >= box.top) };
                    });
                })()`);
                for (const value of metrics) {
                    for (const field of ['iconWidth', 'iconHeight', 'iconTop', 'labelTop']) {
                        assert.ok(Math.abs(value[field] - metrics[0][field]) < 1, value.id + ' differs in ' + field);
                    }
                    assert.equal(value.labelFont, metrics[0].labelFont);
                    assert.equal(value.labelWeight, metrics[0].labelWeight);
                    assert.ok(Math.abs(value.centerXError) < .5, value.id + ' icon is not horizontally centered');
                    assert.ok(Math.abs(value.centerYError) < .5, value.id + ' icon is not vertically centered');
                    assert.ok(value.labelGap >= 3, value.id + ' title is not below icon');
                    assert.equal(value.labelInside, true, value.id + ' title is clipped');
                    assert.equal(value.captionClear, true, value.id + ' caption overlaps icon');
                }
                return metrics;
            };
            const initial = await evaluate(`(async () => {
                window.deck.layout = [...window.deck.defaultLayout]; window.deck.pageIndex = 0; window.deck.saveLayout();
                const reply = await window.outputModules.status();
                window.outputModuleCards.state = reply.data; window.outputModuleCards.render();
                return { status: reply.data, modules: [...document.querySelectorAll('.module-key')].map(key => key.dataset.module),
                    physicalSlots: document.querySelectorAll('.deck-key').length,
                    utilities: [...document.querySelectorAll('.utility-key')].map(key => key.dataset.utility),
                    utilityPositions: [...document.querySelectorAll('.utility-key')].map(key => Number(key.dataset.slot)),
                    statusRemoved: !document.getElementById('open-output-status'),
                    footerRemoved: !document.querySelector('.device-footer, .deck-utility-line'),
                    editBeforePin: document.getElementById('edit-deck').nextElementSibling.id === 'pin-window',
                    sourceLocked: document.querySelector('[data-output-action="start-ndi"]').disabled,
                    obsEnabled: !document.querySelector('[data-local-action="open-obs"]').disabled };
            })()`);
            assert.equal(initial.modules.length, 13);
            assert.equal(initial.physicalSlots, 15);
            assert.equal(initial.footerRemoved, true);
            assert.deepEqual(initial.utilities, ['previous', 'next']);
            assert.deepEqual(initial.utilityPositions, [11, 15]);
            assert.equal(initial.statusRemoved, true);
            assert.deepEqual(initial.modules.filter(Boolean).sort(), ['chat', 'ndi', 'obs']);
            assert.equal(initial.modules.filter(id => !id).length, 10);
            assert.equal(initial.editBeforePin, true);
            if (initial.status.local.running) { assert.equal(initial.sourceLocked, true); assert.equal(initial.obsEnabled, true); }
            await checkScreen('home');
            const geometry = await evaluate(`(() => {
                const keys = [...document.querySelectorAll('.deck-key')];
                const rects = keys.map(key => key.getBoundingClientRect());
                keys.find(key => !key.dataset.module).click();
                return { columns: new Set(rects.map(rect => Math.round(rect.left))).size,
                    rows: new Set(rects.map(rect => Math.round(rect.top))).size,
                    emptyDisabled: keys.filter(key => key.classList.contains('is-empty')).every(key => key.disabled), view: window.deck.view };
            })()`);
            assert.deepEqual(geometry, { columns: 5, rows: 3, emptyDisabled: true, view: 'home' });
            // Right-click has no navigation or editing behavior; only the header enables editing.
            await evaluate(`document.querySelector('[data-module="obs"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))`);
            assert.equal(await evaluate('window.deck.editing'), false);
            await checkScreen('home');
            const defaultKeyDesign = await checkKeyDesign();

            const waitFor = async expression => {
                const deadline = Date.now() + 2500;
                while (!await evaluate(expression)) {
                    assert.ok(Date.now() < deadline, 'Input was not delivered: ' + expression);
                    await delay(20);
                }
            };
            await evaluate("window.lastPointer = {}; document.addEventListener('pointermove', e => { window.lastPointer = { x:e.clientX, y:e.clientY }; }, true);");
            const center = async selector => evaluate("(() => { const r = document.querySelector('#key-grid ' + " + JSON.stringify(selector) + ").getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)}; })()");
            const pointerStart = async selector => {
                const p = await center(selector);
                window.webContents.sendInputEvent({ type: 'mouseMove', ...p });
                window.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1, modifiers: ['leftButtonDown'] });
                await delay(25);
                window.webContents.sendInputEvent({ type: 'mouseMove', x: p.x + 9, y: p.y + 9, modifiers: ['leftButtonDown'] });
                await waitFor('window.lastPointer.x === ' + (p.x + 9) + ' && window.lastPointer.y === ' + (p.y + 9));
            };
            const pointerTo = async selector => {
                const p = typeof selector === 'string' ? await center(selector) : selector;
                window.webContents.sendInputEvent({ type: 'mouseMove', ...p, modifiers: ['leftButtonDown'] });
                await waitFor('window.lastPointer.x === ' + p.x + ' && window.lastPointer.y === ' + p.y);
                return p;
            };
            const pointerDrop = async selector => {
                const p = await pointerTo(selector);
                window.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
                await waitFor('!window.deck.reorder.drag');
                await waitFor('!window.deck.reorder.motion.animating && !window.deck.reorder.motion.session');
            };
            const placement = () => evaluate('({ slots: [...window.deck.layout], stored: window.deck.loadLayout(), page: window.deck.pageIndex, count: window.deck.pageCount, dragging: window.deck.reorder.dragging, view: window.deck.view, preview: !!document.querySelector(".drag-preview") })');
            // Real mouse events exercise pointer capture, cancellation and page changes.
            await pointerStart('[data-module="obs"]'); await pointerDrop('[data-module="ndi"]');
            assert.deepEqual((await placement()).slots, ['obs', 'ndi', 'chat', ...Array(10).fill(null)]);
            await evaluate("document.getElementById('edit-deck').click(); document.querySelector('#key-grid [data-module=obs]').click(); document.querySelector('#key-grid [data-index=\"3\"]').click()");
            const edit = await evaluate("({editing: window.deck.editing, view: window.deck.view, editorRemoved: !document.getElementById('key-panel'), slots: document.querySelectorAll('#key-grid .deck-key').length})");
            assert.deepEqual(edit, { editing: true, view: 'home', editorRemoved: true, slots: 15 });
            const anchorBefore = await center('[data-module="ndi"]');
            await pointerStart('[data-module="obs"]'); await pointerTo('[data-module="ndi"]');
            await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
            const motion = await evaluate(`(() => {
                const m = window.deck.reorder.motion, s = m.session;
                return { roll: s.roll.value, scale: s.scale.value, lag: Math.hypot(s.x.value-s.targetX,s.y.value-s.targetY),
                    targetSurface: document.querySelector('#key-grid [data-module=ndi] .key-screen').style.transform,
                    slots: [...window.deck.layout] };
            })()`);
            assert.ok(Math.abs(motion.roll) > .1, 'Fast drag should tilt');
            assert.ok(motion.scale > 1, 'Lift should raise the card');
            assert.ok(motion.lag > .05 && motion.lag < 90, 'Elastic follow must stay close to pointer');
            assert.ok(motion.targetSurface.includes('translate3d'));
            assert.deepEqual(await center('[data-module="ndi"]'), anchorBefore, 'Slot hit boxes must not move');
            assert.deepEqual(motion.slots, ['obs', 'ndi', 'chat', ...Array(10).fill(null)]);
            assert.equal(await evaluate('window.deck.grid.hasPointerCapture(window.deck.reorder.drag.pointerId)'), true);
            assert.equal(await evaluate("document.querySelector('#key-grid [data-module=ndi]').classList.contains('is-drop-target')"), true);
            await capture('deck-drag-swap');
            await waitFor('!window.deck.reorder.motion.animating');
            assert.equal(await evaluate('window.deck.reorder.motion.session.roll.value'), 0, 'Held card should settle and sleep');
            const dropPoint = await pointerTo('[data-module="ndi"]');
            window.webContents.sendInputEvent({ type:'mouseUp', ...dropPoint, button:'left', clickCount:1 });
            await waitFor('!window.deck.reorder.drag');
            const landing = await evaluate('({mode: window.deck.reorder.motion.session?.mode, swap: window.deck.reorder.motion.animations.size})');
            assert.equal(landing.mode, 'land'); assert.ok(landing.swap > 0);
            await capture('deck-drag-landing');
            await waitFor('!window.deck.reorder.motion.animating && !window.deck.reorder.motion.session');
            const swapped = await placement();
            assert.deepEqual(swapped.slots, ['ndi', 'obs', 'chat', ...Array(10).fill(null)]);
            assert.deepEqual(swapped.stored, swapped.slots);
            assert.equal(swapped.view, 'home'); assert.equal(swapped.preview, false);
            await pointerStart('[data-module="obs"]'); await pointerDrop('[data-index="12"]');
            const moved = await placement();
            assert.deepEqual(moved.slots, ['ndi', null, 'chat', ...Array(9).fill(null), 'obs']);
            assert.deepEqual(moved.stored, moved.slots);
            // Same slot, outside the deck, fixed navigation and Escape cannot alter placement.
            await pointerStart('[data-module="obs"]'); await pointerDrop('[data-module="obs"]');
            await pointerStart('[data-module="obs"]'); await pointerDrop({ x: 320, y: 424 });
            await pointerStart('[data-module="obs"]'); await pointerDrop('#next-page');
            assert.equal((await placement()).count, 1);
            await pointerStart('[data-module="obs"]'); await pointerTo('[data-module="chat"]');
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
            await pointerDrop('[data-module="chat"]');
            const cancelled = await placement();
            assert.deepEqual(cancelled.slots, moved.slots);
            assert.equal(cancelled.dragging, false); assert.equal(cancelled.preview, false);
            assert.equal(await evaluate('window.deck.editing'), true);
            await pointerStart('[data-index="1"]');
            assert.equal((await placement()).dragging, false);
            await pointerDrop('[data-module="chat"]');
            assert.deepEqual((await placement()).slots, moved.slots);
            // Empty pages are still managed directly on the deck, without an editor panel.
            await evaluate("document.getElementById('next-page').click()");
            assert.equal((await placement()).count, 2);
            assert.equal(await evaluate("document.getElementById('remove-page').hidden"), false);
            await evaluate("document.getElementById('remove-page').click(); document.getElementById('next-page').click(); document.getElementById('previous-page').click()");
            await pointerStart('[data-module="obs"]'); await pointerTo('#next-page'); await delay(780);
            assert.equal((await placement()).page, 1);
            assert.equal((await placement()).dragging, true);
            await pointerDrop('[data-index="13"]');
            const crossPage = await placement();
            assert.equal(crossPage.slots[13], 'obs'); assert.equal(crossPage.slots[12], null);
            assert.deepEqual(crossPage.stored, crossPage.slots);
            assert.equal(await evaluate("document.getElementById('remove-page').hidden"), true);
            await capture('deck-second-page');
            await pointerStart('[data-module="obs"]'); await pointerTo('#previous-page'); await delay(780);
            assert.equal((await placement()).page, 0);
            await pointerDrop('[data-module="ndi"]');
            const crossSwap = await placement();
            assert.equal(crossSwap.slots[0], 'obs'); assert.equal(crossSwap.slots[13], 'ndi');
            assert.equal(new Set(crossSwap.slots.filter(Boolean)).size, 3);
            const keyboard = await evaluate("(() => {\n" +
                "const key = document.querySelector('#key-grid [data-module=obs]'); key.focus();\n" +
                "const press = name => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true}));\n" +
                "press(' '); press('ArrowRight'); press(' '); const moved = window.deck.layout[1] === 'obs';\n" +
                "press(' '); press('ArrowDown'); press('Escape'); const cancelled = window.deck.layout[1] === 'obs' && !window.deck.reorder.picked && window.deck.editing;\n" +
                "return {moved, cancelled}; })()");
            assert.deepEqual(keyboard, { moved: true, cancelled: true });
            const slots = await evaluate("(() => {\n" +
                "const normalized = window.deck.normalizeLayout(['obs','obs','unknown','chat']);\n" +
                "const before = [...window.deck.layout]; window.deck.registry.register(new window.TestDeckModule({id:'futureTest',label:'Future'}));\n" +
                "const expanded = window.deck.normalizeLayout(before); window.deck.registry.unregister('futureTest');\n" +
                "window.deck.layout = [...window.deck.defaultLayout]; window.deck.pageIndex = 0; window.deck.saveLayout(); window.deck.toggleEdit();\n" +
                "return {normalized, newModuleAdded: expanded.includes('futureTest'), previousModulesPreserved: before.every((id,index)=>!id || expanded[index]===id)}; })()");
            assert.deepEqual(slots.normalized, ['obs', 'ndi', null, 'chat', ...Array(9).fill(null)]);
            assert.equal(slots.newModuleAdded, true); assert.equal(slots.previousModulesPreserved, true);
            // Reduced motion bypasses inertia and landing effects.
            window.webContents.debugger.attach('1.3');
            await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
            await waitFor('window.deck.reorder.motion.reduced');
            await evaluate('window.deck.toggleEdit()');
            await pointerStart('[data-module="obs"]'); await pointerTo('[data-module="ndi"]');
            const reduced = await evaluate('({roll:window.deck.reorder.motion.session.roll.value,scale:window.deck.reorder.motion.session.scale.value})');
            assert.deepEqual(reduced,{roll:0,scale:1});
            await pointerDrop('[data-module="ndi"]');
            assert.equal((await placement()).preview,false);
            await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
            await waitFor('!window.deck.reorder.motion.reduced');
            window.webContents.debugger.detach();
            // Interrupt a landing with another drag, then leave placement mode.
            await pointerStart('[data-module="obs"]');
            const rapidPoint = await pointerTo('[data-module="chat"]');
            window.webContents.sendInputEvent({type:'mouseUp',...rapidPoint,button:'left',clickCount:1});
            await waitFor('!window.deck.reorder.drag');
            await pointerStart('[data-module="obs"]');
            assert.equal(await evaluate('document.querySelectorAll(".drag-preview").length'),1);
            await evaluate('window.deck.toggleEdit()');
            assert.equal(await evaluate('window.deck.reorder.motion.session === null && !window.deck.reorder.motion.animating'),true);
            window.webContents.sendInputEvent({type:'mouseUp',...rapidPoint,button:'left',clickCount:1});
            await evaluate('window.deck.layout=[...window.deck.defaultLayout];window.deck.pageIndex=0;window.deck.saveLayout()');
            const pages = { crossPage, crossSwap, keyboard };
            console.log('DECK_MOTION_OK: spring follow, tilt, stationary hit targets, idle sleep, swap landing, reduced motion and cleanup.');
            const migration = await evaluate(`(() => {
                const legacy = Array(30).fill(null); legacy[12] = 'obs'; legacy[15] = 'ndi'; legacy[29] = 'chat';
                const migrated = window.deck.migrateLegacySlots(legacy);
                const previousSlots = Array(24).fill(null); previousSlots[10] = 'obs'; previousSlots[11] = 'chat'; previousSlots[12] = 'ndi';
                const previousMigration = window.deck.migrateLegacySlots(previousSlots, Array.from({ length: 12 }, (_, index) => index));
                const extraIds = Array.from({ length: 12 }, (_, index) => 'legacyFullTest' + index);
                extraIds.forEach(id => window.deck.registry.register(new window.TestDeckModule({ id, label: id })));
                const full = window.deck.migrateLegacySlots(window.deck.registry.assignable.map(module => module.id));
                extraIds.forEach(id => window.deck.registry.unregister(id));
                return { migrated, previousMigration, fullSize: full.length, fullCount: full.filter(Boolean).length, uniqueCount: new Set(full.filter(Boolean)).size };
            })()`);
            const migratedLayout = Array(26).fill(null); migratedLayout[11] = 'obs'; migratedLayout[0] = 'chat'; migratedLayout[13] = 'ndi';
            assert.deepEqual(migration.migrated, migratedLayout);
            const previousLayout = Array(26).fill(null); previousLayout[0] = 'obs'; previousLayout[10] = 'chat'; previousLayout[13] = 'ndi';
            assert.deepEqual(migration.previousMigration, previousLayout);
            assert.equal(migration.fullSize, 26); assert.equal(migration.fullCount, 15); assert.equal(migration.uniqueCount, 15);
            await delay(300); // Allow ordinary clicks after the drag click-suppression interval.
            // Opening modules must never invoke capture/start/stop actions.
            await evaluate(`window.deckTestAction = window.outputModuleCards.action; window.deckTestInvoked = false; window.outputModuleCards.action = () => { window.deckTestInvoked = true; }; document.querySelector('[data-module="ndi"]').click()`);
            await checkScreen('ndi', 'output');
            assert.equal(await evaluate(`!document.querySelector('#output-panel [data-output-module="ndi"]').hidden && document.getElementById('local-capture-panel').hidden`), true);
            assert.equal(await evaluate('window.deckTestInvoked'), false);
            await capture('deck-ndi-panel');
            await evaluate(`document.getElementById('back-to-deck').click()`);
            assert.equal((await checkScreen('home')).focusModule, 'ndi');
            await evaluate(`document.querySelector('[data-module="obs"]').click()`);
            await checkScreen('obs');
            assert.equal(await evaluate(`document.getElementById('capture-offset').offsetParent !== null`), true);
            assert.equal(await evaluate('window.deckTestInvoked'), false);
            await capture('deck-audio-panel');
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
            await delay(100);
            assert.equal((await checkScreen('home')).focusModule, 'obs');
            await evaluate(`document.querySelector('[data-module="chat"]').click()`);
            await checkScreen('chat');
            // A save stays on the same screen; leaving without a save discards only the draft.
            await evaluate(`document.getElementById('chat-max-messages').value = '6'; document.getElementById('chat-settings-form').requestSubmit()`);
            await checkScreen('chat');
            assert.equal(await evaluate(`window.app.settingsManager.getModuleSettings('chat').maxMessages`), 6);
            await evaluate(`document.getElementById('chat-max-messages').value = '9'; document.getElementById('back-to-deck').click(); document.querySelector('[data-module="chat"]').click()`);
            assert.equal(await evaluate(`document.getElementById('chat-max-messages').value`), '6');
            await evaluate(`document.getElementById('chat-max-messages').value = '5'; document.getElementById('chat-settings-form').requestSubmit(); document.getElementById('screen-feedback').hidden = true`);
            await capture('deck-chat-panel');
            await evaluate(`window.app.uiManager.closeSettings(); window.outputModuleCards.action = window.deckTestAction; void 0`);
            assert.equal((await checkScreen('home')).focusModule, 'chat');

            const localControls = await evaluate("(async () => {\n" +
                "const service = window.outputModuleCards, module = window.deck.registry.get('obs');\n" +
                "const originalAction = service.action, originalConfigure = service.configure, originalState = service.state;\n" +
                "clearTimeout(service.timer);\n" +
                "const local = { ...originalState.local, controlAvailable: true, running: true, captureRequested: true, revision: 'fixture-a' };\n" +
                "service.state = { ...originalState, local }; service.render(); module.loaded = false; module.dirty = false; window.deck.run('obs');\n" +
                "const calls = []; service.action = async action => { calls.push(action); return true; };\n" +
                "service.configure = async payload => { calls.push(payload); local.config = Object.fromEntries(Object.entries(payload.values).map(([k,v]) => [k,String(v)])); local.revision = 'fixture-' + calls.length; service.render(); return true; };\n" +
                "const fps = document.getElementById('capture-fps'); fps.value = fps.value === '30' ? '60' : '30'; fps.dispatchEvent(new Event('change', { bubbles: true })); const draft = fps.value;\n" +
                "service.render(); window.deck.goHome(); window.deck.run('obs'); const preserved = fps.value === draft && module.dirty;\n" +
                "await module.save(window.deck.context, false); const savedOnly = calls[0].apply === false && calls[0].values.fps === Number(draft);\n" +
                "await module.save(window.deck.context, true); const applied = calls[1].apply === true;\n" +
                "const offset = document.getElementById('capture-offset'); offset.value = '9999'; offset.dispatchEvent(new Event('input', { bubbles: true }));\n" +
                "const invalidResult = await module.save(window.deck.context, true); const invalidRevealed = invalidResult === false && offset.offsetParent !== null && calls.length === 2;\n" +
                "module.load(window.deck.context); await module.toggle(window.deck.context); const stopped = calls.at(-1) === 'stop-local';\n" +
                "local.running = false; local.captureRequested = false; service.render(); fps.value = fps.value === '30' ? '60' : '30'; fps.dispatchEvent(new Event('change', { bubbles: true })); await module.toggle(window.deck.context);\n" +
                "const savedBeforeStart = calls.at(-2).apply === false && calls.at(-1) === 'start-local';\n" +
                "service.busy = true; service.render(); const busyLocked = document.getElementById('capture-toggle').disabled && document.getElementById('capture-save').disabled && fps.disabled; service.busy = false;\n" +
                "service.action = originalAction; service.configure = originalConfigure; service.state = originalState; module.loaded = false; module.dirty = false; service.render(); window.deck.goHome(); service.timer = setTimeout(() => service.refresh(), 3000);\n" +
                "return { preserved, savedOnly, applied, invalidRevealed, stopped, savedBeforeStart, busyLocked };\n" +
                "})()");
            assert.ok(Object.values(localControls).every(Boolean), JSON.stringify(localControls));

            const pinBefore = window.isAlwaysOnTop();
            const pin = await evaluate(`(async () => { await window.deck.windowAction('toggle-pin'); return window.deck.windowState.pinned; })()`);
            assert.equal(pin, !pinBefore, JSON.stringify({pinBefore,pin,nativePinned:window.isAlwaysOnTop(),feedback:await evaluate('document.getElementById("screen-feedback").textContent')}));
            await evaluate(`window.deck.windowAction('toggle-pin')`);
            const maximized = new Promise(resolve => window.once('maximize', resolve));
            await evaluate(`window.deck.windowAction('toggle-maximize')`); await maximized; assert.equal(window.isMaximized(), true);
            const restored = new Promise(resolve => window.once('unmaximize', resolve));
            await evaluate(`window.deck.windowAction('toggle-maximize')`); await restored; assert.equal(window.isMaximized(), false);
            await capture('deck-dashboard');
            window.setSize(600, 420); await delay(180);
            await checkScreen('home'); const compactKeyDesign = await checkKeyDesign(); await capture('deck-compact');
            for (const module of ['obs', 'ndi', 'chat']) {
                await evaluate(`window.deck.run('${module}')`);
                await checkScreen(module, module === 'ndi' ? 'output' : module);
            }
            await capture('deck-compact-chat');


            // First-launch guidance is visible in the same compact panel; buttons dispatch only the expected action.
            await evaluate(`(() => {
                const service=window.outputModuleCards;
                clearTimeout(service.timer); window.workflowOriginal={state:service.state,action:service.action};
                service.action=async action=>{window.workflowActions.push(action);return true;};
                window.workflowActions=[]; window.workflowBase=structuredClone(service.state);
            })()`);
            const localFixture = async patch => evaluate(`(() => {
                const service=window.outputModuleCards,module=window.deck.registry.get('obs');
                service.state={...window.workflowBase,local:{...window.workflowBase.local,...${JSON.stringify(patch)}}};
                service.render(); module.loaded=false;module.dirty=false;window.deck.run('obs');
                document.getElementById('capture-help').open=false;
                document.getElementById('capture-diagnostics').open=false;
            })()`);
            const workflowScreen=()=>evaluate(`(() => {
                const p=document.getElementById('local-capture-panel'),body=p.querySelector('.panel-body');
                return {stage:p.dataset.stage,label:document.getElementById('capture-toggle').textContent,
                    disabled:document.getElementById('capture-toggle').disabled,
                    next:document.getElementById('capture-next-title').textContent,
                    step:p.querySelector('[aria-current=step]').dataset.captureStep,
                    overflow:body.scrollHeight>body.clientHeight+1,
                    footer:p.querySelector('.panel-footer').getBoundingClientRect().bottom};
            })()`);
            await localFixture({installed:false,registered:false,setup:{built:false,obsInstalled:true,initialized:true,available:false}});
            assert.equal((await workflowScreen()).label,'빌드 방법 보기');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.equal(await evaluate("document.getElementById('capture-help').open"),true);
            assert.deepEqual(await evaluate('window.workflowActions'),[]);
            await localFixture({installed:false,registered:false});
            let firstRun=await workflowScreen();
            assert.equal(firstRun.stage,'setup');assert.equal(firstRun.label,'OBS 소스 준비');assert.equal(firstRun.disabled,false);
            assert.equal(firstRun.overflow,false);assert.ok(firstRun.footer<=420);
            await capture('local-first-setup');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.deepEqual(await evaluate('window.workflowActions'),['setup-local']);
            await localFixture({}); await capture('local-ready');
            assert.equal((await workflowScreen()).label,'OBS 열고 전달 시작');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.deepEqual(await evaluate('window.workflowActions'),['setup-local','start-local']);
            await localFixture({processRunning:true,controlAvailable:false});
            assert.equal((await workflowScreen()).label,'연결 방법 보기');
            await localFixture({processRunning:true,controlAvailable:true,running:true,healthy:true,sample_rate:48000,audio_peak:.12});
            const delivering=await workflowScreen();assert.equal(delivering.step,'2');assert.match(delivering.next,/방송을 시작/);
            assert.equal(delivering.overflow,false);await capture('local-delivering');
            await localFixture({processRunning:true,controlAvailable:true,running:true,healthy:true,streaming:true});
            assert.match((await workflowScreen()).next,/방송 중/);await capture('local-broadcasting');
            await evaluate(`window.outputModuleCards.state=window.workflowOriginal.state;window.outputModuleCards.action=window.workflowOriginal.action;window.deck.registry.get('obs').loaded=false;window.outputModuleCards.render();window.deck.goHome();`);
            console.log('LOCAL_WORKFLOW_OK: fresh clone, preparation, start action, reconnect, delivery and broadcast states.');

            // Every module exposes its main controls and results without tabs.
            const panelFit = [];
            for (const module of ['obs', 'ndi', 'chat']) {
                await evaluate(`window.deck.run('${module}')`);
                const dimensions = await evaluate(`(() => {
                    const panel = document.querySelector('[data-deck-view]:not([hidden])');
                    const body = panel.querySelector('.panel-body');
                    return { bodyHeight: body.clientHeight, contentHeight: body.scrollHeight,
                        footerBottom: panel.querySelector('.panel-footer').getBoundingClientRect().bottom,
                        tabs: panel.querySelectorAll('[role=tablist], .panel-tabs').length };
                })()`);
                await capture('deck-compact-' + module + '-workspace');
                assert.ok(dimensions.contentHeight <= dimensions.bodyHeight + 1, module + ' requires scrolling: ' + JSON.stringify(dimensions));
                assert.equal(dimensions.tabs, 0); assert.ok(dimensions.footerBottom <= 420);
                panelFit.push({ module, ...dimensions });
            }
            const chatWorkspace = await evaluate(`(() => {
                const form = document.getElementById('chat-settings-form');
                const messages = document.getElementById('chat-max-messages');
                const channel = document.getElementById('chat-channel-id'), originalChannel = channel.value;
                const allInputsVisible = [...form.querySelectorAll('input:not([type=hidden]),select')].every(input => input.getBoundingClientRect().height > 0);
                messages.value = '0';
                const invalidCount = !form.reportValidity() && document.activeElement === messages;
                messages.value = '5'; channel.value = 'bad';
                const invalidChannel = !form.reportValidity() && document.activeElement === channel;
                channel.value = originalChannel;
                messages.dispatchEvent(new Event('input', { bubbles: true }));
                return { allInputsVisible, invalidCount, invalidChannel, previewVisible: document.getElementById('chat-preview-stage').clientHeight > 100 };
            })()`);
            assert.deepEqual(chatWorkspace, { allInputsVisible: true, invalidCount: true, invalidChannel: true, previewVisible: true });

            // Draft preview is the real overlay renderer, isolated from live chat and saved settings.
            await evaluate(`window.deck.registry.get('chat').preview.sync()`);
            await waitFor(`Boolean(document.getElementById('chat-preview-frame').contentWindow.chatOverlay)`);
            const savedChat = await evaluate('JSON.stringify(window.app.settingsManager.getModuleSettings("chat"))');
            const savedOverlay = await evaluate('JSON.stringify({...localStorage})');
            const setPreview = async (field, value) => evaluate(`(() => { const input = document.getElementById('chat-${field}'); input.value = ${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await setPreview('max-messages', 3); await setPreview('max-nickname-length', 2);
            await setPreview('alignment', 'right');
            const previewState = () => evaluate(`(() => {
                const frame = document.getElementById('chat-preview-frame'), overlay = frame.contentWindow.chatOverlay;
                const root = overlay.elements.chatContainer, message = root.querySelector('.chat-message');
                return { count: overlay.messages.length, nick: root.querySelector('.username').textContent,
                    className: root.className, live: Boolean(overlay.eventSource), polling: Boolean(overlay.settingsCheckInterval),
                    pending: overlay.timers.size, background: frame.contentWindow.getComputedStyle(message).backgroundColor };
            })()`);
            const themeBackgrounds = [];
            for (const theme of ['simple-purple', 'neon-green', 'clean']) {
                await setPreview('theme-select', theme); await delay(200);
                const state = await previewState();
                assert.equal(state.count, 3); assert.equal(state.nick, '반가...');
                assert.ok(state.className.includes('theme-' + theme));
                assert.ok(state.className.includes('align-right'));
                assert.equal(state.live, false); assert.equal(state.polling, false); assert.equal(state.pending, 0);
                themeBackgrounds.push(state.background);
                await capture('chat-preview-' + theme);
            }
            assert.notEqual(themeBackgrounds[0], themeBackgrounds[1]);
            await setPreview('max-messages', 1);
            assert.equal((await previewState()).count, 1);
            await setPreview('max-messages', 100);
            assert.equal((await previewState()).count, 8);
            assert.ok((await evaluate("document.getElementById('chat-preview-description').textContent")).includes('100'));
            await setPreview('max-messages', 0);
            assert.equal(await evaluate("document.getElementById('chat-preview-play').disabled"), true);
            await setPreview('max-messages', 3); await setPreview('fade-time', 1);
            await evaluate("document.getElementById('chat-preview-play').click()");
            await delay(1800);
            assert.equal(await evaluate("document.getElementById('chat-preview-frame').contentWindow.chatOverlay.messages.length"), 0);
            assert.equal(await evaluate("document.getElementById('chat-preview-empty').hidden"), false);
            await setPreview('fade-time', 0); await evaluate("document.getElementById('chat-preview-play').click()");
            await delay(1000); assert.equal((await previewState()).count, 3);
            await setPreview('fade-time', 60); await evaluate("document.getElementById('chat-preview-play').click()");
            await evaluate("window.deck.goHome()");
            assert.equal((await previewState()).pending, 0);
            assert.equal(await evaluate('JSON.stringify(window.app.settingsManager.getModuleSettings("chat"))'), savedChat);
            assert.equal(await evaluate('JSON.stringify({...localStorage})'), savedOverlay);
            await evaluate("window.deck.run('chat'); document.getElementById('chat-preview-background').click()");
            assert.equal(await evaluate("document.getElementById('chat-preview-stage').classList.contains('is-light')"), true);
            await capture('chat-preview-light');
            console.log('CHAT_PREVIEW_OK: themes, alignment, counts, nicknames, timed replay, draft isolation and pause.');


            await evaluate(`window.deck.goHome(); document.getElementById('edit-deck').click(); document.querySelector('[data-module="obs"]').click()`);
            await checkScreen('home'); await capture('deck-edit-mode');
            await evaluate(`window.deck.goHome(); window.deck.toggleEdit()`);
            // A new independent subclass uses the same key and screen host, without a controller branch.
            const extension = await evaluate(`(() => {
                class SampleModule extends window.TestDeckModule {
                    constructor() { super({ id: 'sample', label: 'Sample <safe>', panel: { id: 'sample-panel', view: 'sample', html: '<section id="sample-panel" class="module-screen" data-deck-view="sample" hidden><div class="panel-body">Sample</div><footer class="panel-footer">Sample footer</footer></section>' } }); }
                    onEnter() { this.entries = (this.entries || 0) + 1; }
                    onLeave() { this.exits = (this.exits || 0) + 1; }
                }
                const module = new SampleModule();
                window.deck.registry.register(module);
                module.mount(window.deck.context);
                window.deck.saveLayout();
                const key = document.querySelector('[data-module="sample"]');
                const safeLabel = key.querySelector('.key-label').textContent === 'Sample <safe>' && !key.querySelector('safe');
                key.click();
                const opened = window.deck.view === 'sample' && !document.getElementById('sample-panel').hidden;
                window.deck.goHome();
                const returned = window.deck.view === 'home' && module.exits === 1;
                window.deck.registry.unregister('sample');
                document.getElementById('sample-panel').remove();
                window.deck.layout = window.deck.defaultLayout; window.deck.saveLayout();
                return { safeLabel, opened, returned, entries: module.entries };
            })()`);
            assert.deepEqual(extension, { safeLabel: true, opened: true, returned: true, entries: 1 });
            assert.deepEqual(failures, []);
            fs.writeFileSync(path.join(results, 'deck-smoke.json'), JSON.stringify({ initial, geometry, edit, slots, pages, migration, pin, defaultKeyDesign, compactKeyDesign, extension, loadedFonts, panelFit, chatWorkspace, localControls, consoleErrors: failures }, null, 2));
            console.log('DECK_SMOKE_OK: inherited module extension, common key geometry, 13 module slots, navigation 11/15, layout migrations, panels and compact layout.');

            const lifecycle = require('../main').getLifecycle();
            assert.equal(lifecycle.tray.isDestroyed(), false);
            await evaluate("window.outputChecks = 0; window.originalOutputApi = window.outputModuleCards.api; window.outputModuleCards.api = { ...window.originalOutputApi, status: async () => { window.outputChecks++; return window.originalOutputApi.status(); } }; void 0;");
            await evaluate('window.deck.goHome();window.deck.toggleEdit()');
            await pointerStart('[data-module="obs"]');
            await evaluate("window.deckWindow.action('close')");
            await delay(150);
            assert.equal(window.isDestroyed(), false); assert.equal(window.isVisible(), false);
            assert.equal(await evaluate('window.deck.reorder.motion.session === null && !window.deck.reorder.motion.animating'),true);
            assert.equal(lifecycle.tray.isDestroyed(), false); assert.equal(testShutdowns, 0);
            await evaluate('window.outputChecks = 0; window.outputModuleCards.refresh();');
            assert.equal(await evaluate('window.outputChecks'), 0);
            assert.equal((await fetch('http://localhost:17113/api/status')).ok, true);
            lifecycle.tray.emit('double-click');
            await delay(150);
            assert.equal(window.isVisible(), true);
            await evaluate("window.deckWindow.action('close')");
            await delay(100);
            console.log('TRAY_SMOKE_OK: close hides, tray reopens, server stays alive, hidden polling pauses.');
            await lifecycle.menu.getMenuItemById('quit').click();
            assert.equal(testShutdowns, 1);

        } catch (error) { console.error(error); app.exit(1); }
    });
});
setTimeout(() => { console.error('Deck test timeout'); app.exit(1); }, 65000).unref();
require('../main');

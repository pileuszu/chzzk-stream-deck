const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { OutputModules, readStatus, isTrustedSender } = require('../src/output-modules');
const { syncRuntime } = require('../src/output-runtime');

function fixture(t, names = [], execute = async () => ({ stdout: '' })) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-deck-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = path.join(dir, 'module');
    fs.mkdirSync(root);
    const write = (file, data) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
    };
    const controller = new OutputModules({ root, platform: 'win32', appData: dir, programData: dir,
        processes: async () => new Set(names), execute, openPath: async () => '',
        control: async () => { throw new Error('fixture: no live OBS connection'); } });
    write(path.join(root, 'sender.ini'), 'width=1920\nheight=1080\nfps=30\nbuffer_ms=500\naudio_offset_ms=0\n');
    write(path.join(root, 'build-obs/Release/a1-ndi-sender.exe'), 'fixture');
    return { root, dir, controller, write };
}

test('detects the existing OBS source in another folder without migrating it', async t => {
    const f = fixture(t, ['obs64.exe']);
    const config = path.join(f.dir, 'previous-install', 'sender.ini');
    f.write(config, 'fps=60\nbuffer_ms=750');
    f.write(f.controller.collection, { sources: [{ id: 'a1_local_sync', settings: { config_path: config } }] });
    f.write(f.controller.plugin, 'fixture');
    f.write(path.join(path.dirname(config), 'logs/obs-status.json'), { running: true, healthy: true });
    const before = fs.readFileSync(f.controller.collection);
    const state = await f.controller.status();
    assert.equal(state.local.running, true);
    assert.equal(state.local.external, true);
    assert.equal(state.local.config.fps, '60');
    assert.equal(state.ndi.config.fps, '30');
    assert.deepEqual(fs.readFileSync(f.controller.collection), before);
});

test('stale, missing and dead-process status cannot claim an active stream', t => {
    const f = fixture(t);
    const file = path.join(f.root, 'logs/status.json');
    f.write(file, { running: true, healthy: true });
    assert.equal(readStatus(file, false).running, false);
    const old = new Date(Date.now() - 10000);
    fs.utimesSync(file, old, old);
    assert.equal(readStatus(file, true).running, false);
    assert.equal(readStatus(file, true).fresh, false);
    f.write(file, '{partial write');
    assert.equal(readStatus(file, true).running, false);
});

test('OBS ownership blocks NDI before launching a process', async t => {
    let launched = false;
    const f = fixture(t, ['obs64.exe'], async () => { launched = true; });
    f.write(path.join(f.root, 'logs/obs-status.json'), { running: true });
    await assert.rejects(f.controller.action('start-ndi'), /로컬 캡처/);
    assert.equal(launched, false);
});

test('NDI start and stop use fixed arguments and accept the OBS-build executable', async t => {
    const calls = [];
    const f = fixture(t, [], async (...args) => { calls.push(args); return {}; });
    await f.controller.action('start-ndi');
    assert.equal(calls[0][0], 'powershell.exe');
    assert.equal(calls[0][1].at(-1), path.join(f.root, 'Start-Sender.ps1'));
    assert.equal(calls[0][2].windowsHide, true);
    f.controller.processes = async () => new Set(['a1-ndi-sender.exe']);
    f.controller.execute = async (...args) => { calls.push(args); f.controller.processes = async () => new Set(); return {}; };
    await f.controller.action('stop-ndi');
    assert.equal(calls[1][0], path.join(f.root, 'build-obs/Release/a1-ndi-sender.exe'));
    assert.deepEqual(calls[1][1], ['--stop']);
});

test('NDI mode saves preserve timing, video settings and local capture; stale or invalid edits fail', async t => {
    const calls = [], f = fixture(t, [], async (...args) => calls.push(args));
    const file = path.join(f.root, 'sender.ini');
    const original = fs.readFileSync(file, 'utf8') + '# keep this\nname=My source\n';
    f.write(file, original); f.write(path.join(f.root, 'local-capture.ini'), 'fps=60\n');
    const revision = (await f.controller.status()).ndi.revision;
    for (const mode of ['video', '', 'audio_only\nname=bad'])
        await assert.rejects(f.controller.configureNdi({ mode, revision, apply: false }), /올바르지/);
    await f.controller.configureNdi({ mode: 'audio_only', revision, apply: false });
    assert.equal(fs.readFileSync(file, 'utf8'), original.trimEnd() + '\noutput_mode=audio_only\n');
    assert.equal(fs.readFileSync(file + '.bak', 'utf8'), original);
    assert.equal(fs.readFileSync(path.join(f.root, 'local-capture.ini'), 'utf8'), 'fps=60\n');
    assert.equal(calls.length, 0, 'saving cannot start transmission');
    await assert.rejects(f.controller.configureNdi({ mode: 'audio_video', revision, apply: false }), /다른 곳/);
    assert.equal(f.controller.busy, false);
});

test('NDI settings allow zero audio-only holdback without changing local settings; reject unsafe drafts before stopping', async t => {
    const calls = [], f = fixture(t, [], async (...args) => calls.push(args));
    const file = path.join(f.root, 'sender.ini'), local = path.join(f.root, 'local-capture.ini');
    f.write(local, 'buffer_ms=500\n');
    const values = { width: 1280, height: 720, fps: 60, monitor: 1, buffer_ms: 0, audio_offset_ms: 0 };
    let revision = (await f.controller.status()).ndi.revision;
    for (const patch of [{ buffer_ms: -1 }, { buffer_ms: 2001 }, { audio_offset_ms: .1 }, { fps: 61 }, { buffer_ms: '0' }, { width: 1281 }, { monitor: 16 }]) {
        await assert.rejects(f.controller.configureNdi({ mode: 'audio_only', values: { ...values, ...patch }, revision, apply: false }));
        assert.equal((await f.controller.status()).ndi.revision, revision);
    }
    await f.controller.configureNdi({ mode: 'audio_only', values, revision, apply: false });
    const state = await f.controller.status(); revision = state.ndi.revision;
    assert.equal(state.ndi.config.buffer_ms, '0'); assert.equal(state.ndi.config.monitor, '1');
    assert.equal(state.ndi.config.width, '1280'); assert.equal(state.ndi.config.fps, '60');
    assert.equal(fs.readFileSync(local, 'utf8'), 'buffer_ms=500\n');
    await assert.rejects(f.controller.configureNdi({ mode: 'audio_video', revision, apply: false }), /200/);
    f.controller.processes = async () => new Set(['a1-ndi-sender.exe']);
    f.write(path.join(f.root, 'logs/status.json'), { running: true, healthy: true, output_mode: 'audio_only' });
    await assert.rejects(f.controller.configureNdi({ mode: 'audio_video', values, revision, apply: true }), /200/);
    assert.equal(calls.length, 0, 'invalid live edits cannot stop the sender');
    assert.equal((await f.controller.status()).ndi.revision, revision);
});

test('mixed native build folders select the newest sender so new modes are supported', t => {
    const f = fixture(t);
    const ndiBuild = path.join(f.root, 'build/Release/a1-ndi-sender.exe');
    const obsBuild = path.join(f.root, 'build-obs/Release/a1-ndi-sender.exe');
    f.write(ndiBuild, 'old sender');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(ndiBuild, old, old);
    assert.equal(f.controller.executable(), obsBuild);
    fs.utimesSync(obsBuild, new Date(0), new Date(0));
    assert.equal(f.controller.executable(), ndiBuild);
});

test('NDI apply stops before saving and restarts with the new mode', async t => {
    const f = fixture(t, ['a1-ndi-sender.exe']), sequence = [];
    const file = path.join(f.root, 'sender.ini');
    f.write(path.join(f.root, 'logs/status.json'), { running: true, healthy: true, output_mode: 'audio_video' });
    f.controller.execute = async (exe) => {
        if (exe.endsWith('a1-ndi-sender.exe')) {
            assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /audio_only/);
            f.controller.processes = async () => new Set(); sequence.push('stop');
        } else {
            assert.match(fs.readFileSync(file, 'utf8'), /output_mode=audio_only/);
            f.controller.processes = async () => new Set(['a1-ndi-sender.exe']);
            f.write(path.join(f.root, 'logs/status.json'), { running: true, healthy: true, output_mode: 'audio_only' });
            sequence.push('start');
        }
        return {};
    };
    await f.controller.configureNdi({ mode: 'audio_only', revision: (await f.controller.status()).ndi.revision, apply: true });
    assert.deepEqual(sequence, ['stop', 'start']);
    assert.equal((await f.controller.status()).ndi.output_mode, 'audio_only');
});

test('failed NDI restart retains saved mode for an explicit retry, failed stop retains original config', async t => {
    const f = fixture(t, ['a1-ndi-sender.exe']);
    const file = path.join(f.root, 'sender.ini'), original = fs.readFileSync(file, 'utf8');
    f.write(path.join(f.root, 'logs/status.json'), { running: true, healthy: true });
    f.controller.execute = async () => { throw new Error('stop failed'); };
    const revision = (await f.controller.status()).ndi.revision;
    await assert.rejects(f.controller.configureNdi({ mode: 'audio_only', revision, apply: true }), /stop failed/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    f.controller.execute = async exe => {
        if (exe.endsWith('a1-ndi-sender.exe')) { f.controller.processes = async () => new Set(); return {}; }
        throw new Error('start failed');
    };
    await assert.rejects(f.controller.configureNdi({ mode: 'audio_only', revision, apply: true }), /설정은 저장됐지만/);
    const state = await f.controller.status();
    assert.equal(state.ndi.config.output_mode, 'audio_only');
    assert.equal(state.ndi.running, false);
    assert.equal(f.controller.busy, false);
});

test('OBS open does not reopen an active OBS or stop NDI', async t => {
    const calls = [];
    const f = fixture(t, [], async (...args) => { calls.push(args); return {}; });
    f.write(f.controller.plugin, 'fixture');
    f.write(f.controller.collection, { sources: [{ id: 'a1_local_sync' }] });
    await f.controller.action('open-obs');
    assert.equal(calls[0][1].at(-1), path.join(f.root, 'Start-OBS.ps1'));
    f.controller.processes = async () => new Set(['obs64.exe']);
    await f.controller.action('open-obs');
    assert.equal(calls.length, 1);
    f.controller.processes = async () => new Set(['a1-ndi-sender.exe']);
    await assert.rejects(f.controller.action('open-obs'), /NDI/);
});

test('unknown actions and unavailable process snapshots cannot start captures', async t => {
    const f = fixture(t);
    await assert.rejects(f.controller.action('start-ndi; calc.exe'), /지원하지/);
    f.controller.processes = async () => { throw new Error('unavailable'); };
    await assert.rejects(f.controller.action('start-ndi'), /프로세스/);
    assert.equal(f.controller.busy, false);
});

test('concurrent actions are serialized', async t => {
    let finish;
    const f = fixture(t, [], () => new Promise(resolve => { finish = resolve; }));
    const action = f.controller.action('start-ndi');
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.controller.action('open-obs'), /이전 작업/);
    finish({});
    await action;
    assert.equal(f.controller.busy, false);
});

test('IPC accepts only the dashboard main frame in the owning window', () => {
    const frame = { url: 'http://localhost:7113/' };
    const webContents = { mainFrame: frame };
    const window = { webContents };
    const event = { sender: webContents, senderFrame: frame };
    assert.equal(isTrustedSender(event, window, 'http://localhost:7113'), true);
    assert.equal(isTrustedSender({ ...event, senderFrame: { ...frame } }, window, 'http://localhost:7113'), false);
    frame.url = 'https://example.com/';
    assert.equal(isTrustedSender(event, window, 'http://localhost:7113'), false);
    frame.url = 'http://localhost:7113/chat-overlay.html';
    assert.equal(isTrustedSender(event, window, 'http://localhost:7113'), false);
});

test('packaged runtime updates code but preserves user configuration and logs', t => {
    const f = fixture(t);
    const destination = path.join(f.dir, 'user-data');
    f.write(path.join(f.root, 'runtime.txt'), 'new code');
    f.write(path.join(destination, 'sender.ini'), 'fps=60');
    f.write(path.join(destination, 'logs/status.json'), { running: false });
    syncRuntime(f.root, destination);
    assert.equal(fs.readFileSync(path.join(destination, 'sender.ini'), 'utf8'), 'fps=60');
    assert.equal(fs.readFileSync(path.join(destination, 'runtime.txt'), 'utf8'), 'new code');
    assert.equal(fs.existsSync(path.join(destination, 'logs/status.json')), true);
});

test('native logs cannot be fetched through the HTTP static server', async t => {
    const f = fixture(t);
    f.write(path.join(f.dir, 'native/a1-output/logs/status.json'), 'private');
    f.write(path.join(f.dir, 'index.html'), 'dashboard');
    const app = express();
    app.use(require('../src/output-static'));
    app.use(express.static(f.dir));
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const target of ['/native/a1-output/logs/status.json', '/%6eative/a1-output/logs/status.json',
        '/native%2fa1-output%2flogs%2fstatus.json', '/x/%2e%2e%2fnative/a1-output/logs/status.json']) {
        assert.equal((await fetch(origin + target)).status, 404, target);
    }
    assert.equal(await (await fetch(origin + '/')).text(), 'dashboard');
});

const localCapture = require('../src/local-capture');
const values = { width: 1920, height: 1080, fps: 30, monitor: 0, buffer_ms: 500, audio_offset_ms: 0 };

test('local OBS transport handles fragmented replies and disconnects without hanging', async t=>{
    const net=require('node:net'), {request}=require('../src/obs-control');
    let disconnect=false;
    const server=net.createServer(socket=>socket.on('data',data=>{
        const message=JSON.parse(data.toString());
        assert.equal(message.action,'status');
        if(disconnect) return socket.end();
        socket.write('{"version":2,');
        setTimeout(()=>socket.write('"ok":true,"source_present":false}'),10);
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>server.close());
    const options={endpoint:{host:'127.0.0.1',port:server.address().port},timeout:500};
    assert.equal((await request('status',undefined,options)).source_present,false);
    disconnect=true;
    await assert.rejects(request('status',undefined,options),/끊어졌/);
    await assert.rejects(request('record_start',undefined,options),/지원하지/);
});

test('local settings reject invalid fields, ranges and unsafe offsets', () => {
    for (const change of [{ width: 1921 }, { fps: 120 }, { monitor: -1 }, { buffer_ms: 100 },
        { audio_offset_ms: 401 }, { fps: '30' }, { width: NaN }, { command: 'anything' }])
        assert.throws(() => localCapture.validateSettings({ ...values, ...change }));
    assert.deepEqual(localCapture.validateSettings({ ...values, audio_offset_ms: -400 }), { ...values, audio_offset_ms: -400 });
});
test('saving local config preserves NDI and rejects stale drafts', async t => {
    const f = fixture(t);
    f.write(f.controller.collection, { sources: [{ id: 'a1_local_sync', settings: { config_path: path.join(f.root, 'sender.ini') } }] });
    const original = '# custom comment\n' + fs.readFileSync(path.join(f.root, 'sender.ini'), 'utf8') + 'name=My NDI\nvoicemeeter_dll=C:\\VM\\Remote.dll\ncalibration_verified=true\n';
    f.write(path.join(f.root, 'sender.ini'), original);
    const state = await f.controller.status();
    await f.controller.configure({ values: { ...values, fps: 60 }, revision: state.local.revision, apply: false });
    assert.equal(fs.readFileSync(path.join(f.root, 'sender.ini'), 'utf8'), original);
    const result = await f.controller.status();
    assert.equal(result.local.config.fps, '60');
    assert.equal(result.local.config.calibration_verified, 'false');
    assert.equal(result.local.config.name, 'My NDI');
    assert.equal(result.local.config.voicemeeter_dll, 'C:\\VM\\Remote.dll');
    assert.equal(fs.readFileSync(path.join(f.root, 'local-capture.ini.bak'), 'utf8'), original);
    assert.equal(fs.existsSync(path.join(f.root, 'logs/deck-control-command.json')), false);
    await assert.rejects(f.controller.configure({ values, revision: state.local.revision, apply: false }), /다른 곳에서/);
});
test('apply requires live control before any write; unknown process state cannot mutate config', async t => {
    const f = fixture(t, ['obs64.exe']);
    f.write(f.controller.collection, { sources: [{ id: 'a1_local_sync', settings: { config_path: path.join(f.root, 'sender.ini') } }] });
    f.write(path.join(f.root, 'logs/obs-status.json'), { running: true });
    const state = await f.controller.status();
    await assert.rejects(f.controller.configure({ values, revision: state.local.revision, apply: true }), /연결/);
    assert.equal(fs.existsSync(path.join(f.root, 'local-capture.ini')), false);
    f.controller.processes = async () => { throw new Error('unavailable'); };
    await assert.rejects(f.controller.configure({ values, revision: state.local.revision, apply: false }), /프로세스/);
    assert.equal(fs.existsSync(path.join(f.root, 'local-capture.ini')), false);
});
test('empty live scene connects without saved registration; retry preserves config', async t => {
    const f = fixture(t, ['obs64.exe']);
    f.write(f.controller.plugin, 'fixture');
    let requested=false, present=false, fail=true;
    const commands=[];
    f.controller.control=async(action,configPath)=>{
        if(action!=='status') {
            commands.push(action);
            if(fail) {fail=false;throw Error('temporary disconnect');}
            present=true; requested=action!=='stop';
            f.write(path.join(f.root,'logs/obs-status.json'),{running:requested,healthy:true,...values});
        }
        return {available:true,version:2,source_present:present,source_attached:present,
            capture_requested:requested,config_path:present?path.join(f.root,'sender.ini'):'',scene_name:'User scene'};
    };
    assert.equal((await f.controller.status()).local.sourcePresent,false);
    await assert.rejects(f.controller.action('start-local'),/temporary/);
    assert.equal(f.controller.busy,false);
    await f.controller.action('start-local');
    assert.equal((await f.controller.status()).local.running,true);
    await f.controller.action('stop-local');
    assert.deepEqual(commands,['start','start','stop']);
    assert.equal(fs.existsSync(f.controller.collection),false);
    assert.equal((await f.controller.status()).local.config.fps,'30');
});

test('missing configuration previews a backup then restores on save', async t=>{
    const f=fixture(t);
    const missing=path.join(f.root,'local-capture.ini');
    f.write(f.controller.collection,{sources:[{id:'a1_local_sync',settings:{config_path:missing}}]});
    f.write(missing+'.bak','width=1920\nheight=1080\nfps=60\nmonitor=0\nbuffer_ms=700\naudio_offset_ms=20\n');
    const state=await f.controller.status();
    assert.equal(state.local.configRecovered,true);
    assert.equal(state.local.config.fps,'60');
    assert.equal(fs.existsSync(missing),false);
    await f.controller.configure({values:{...values,fps:60,buffer_ms:700,audio_offset_ms:20},revision:state.local.revision,apply:false});
    assert.equal((await f.controller.status()).local.configRecovered,undefined);
    assert.equal(fs.existsSync(missing),true);
});

test('stale ack cannot report success and timed-out commands are cleaned up', async t => {
    const f = fixture(t);
    f.write(path.join(f.root, 'logs/deck-control-status.json'), { version: 1, source_present: true, request_id: 'old', ok: true });
    await assert.rejects(localCapture.sendControl(f.root, 'start', { timeout: 100 }), /응답/);
    assert.equal(fs.existsSync(path.join(f.root, 'logs/deck-control-command.json')), false);
    await assert.rejects(localCapture.sendControl(f.root, 'record_start'), /지원하지/);
});

test('retry ignores failures and successful frames from older capture attempts', async t=>{
    const f=fixture(t), file=path.join(f.root,'logs/obs-status.json');
    f.write(file,{request_id:'previous',running:false,error:'Previous failure'});
    const timer=setTimeout(()=>f.write(file,{request_id:'current',running:true,healthy:true,...values}),150);
    t.after(()=>clearTimeout(timer));
    const result=await localCapture.waitForCapture(f.root,true,values,{requestId:'current',timeout:1000});
    assert.equal(result.request_id,'current');
    f.write(file,{request_id:'previous',running:true,healthy:true,...values});
    await assert.rejects(localCapture.waitForCapture(f.root,true,values,{requestId:'another',timeout:100}),/지연/);
});

test('application shutdown blocks new work, waits for running actions and joins native outputs', async t => {
    const f = fixture(t);
    const calls = [];
    let release;
    f.controller.execute = async (...args) => { calls.push(args); await new Promise(resolve => { release = resolve; }); return {}; };
    const starting = f.controller.action('start-ndi');
    await new Promise(resolve => setImmediate(resolve));
    let names = new Set(['a1-ndi-sender.exe', 'obs64.exe']);
    f.controller.processes = async () => names;
    f.controller.controlLocal = async action => calls.push(action);
    f.write(path.join(f.root, 'logs/obs-status.json'), { running: true });
    const quitting = f.controller.shutdown();
    await assert.rejects(f.controller.action('start-local'), /종료하는 중/);
    release(); await starting;
    f.controller.execute = async (...args) => { calls.push(args); names = new Set(['obs64.exe']); };
    await quitting;
    assert.equal(calls[1], 'stop-local');
    assert.deepEqual(calls[2][1], ['--stop']);
    assert.equal(f.controller.closing, true);
});
test('native shutdown reports failed capture cleanup after trying NDI too', async t => {
    const f = fixture(t, ['obs64.exe','a1-ndi-sender.exe']);
    const calls = [];
    f.write(path.join(f.root, 'logs/obs-status.json'), { running: true });
    f.controller.controlLocal = async () => { throw new Error('capture unavailable'); };
    f.controller.stopNdi = async () => { calls.push('ndi'); };
    await assert.rejects(f.controller.shutdown(), /capture unavailable/);
    assert.deepEqual(calls, ['ndi']); assert.equal(f.controller.closing, false);
});

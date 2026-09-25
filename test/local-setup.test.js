const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { OutputModules } = require('../src/output-modules');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-setup-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    const root = path.join(dir,'runtime'), calls = [];
    const write = (file, data) => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data)); };
    const c = new OutputModules({root,appData:dir,programData:dir,platform:'win32',
        obsExecutable:path.join(dir,'obs64.exe'),processes:async()=>new Set(),
        control:async()=>{throw Error('fixture: no live OBS connection');},
        execute:async(exe,args,options)=>{
            calls.push({exe,args,options});
            if (args.includes('-c')) return {stdout:'3\n'};
            if (args.at(-1).endsWith('Install-OBSPlugin.ps1')) write(c.plugin,'plugin');
            if (args.at(-1).endsWith('setup_obs_local.py')) write(c.collection,{sources:[{id:'a1_local_sync'}]});
            return {};
        },openPath:async file=>{calls.push({opened:file});return '';}});
    write(c.obsExecutable,'fixture');
    write(path.join(root,'sender.ini'),'width=1920\nheight=1080\nfps=30\n');
    write(path.join(root,'build-obs/Release/a1-local-source.dll'),'plugin');
    write(path.join(root,'Install-OBSPlugin.ps1'),'fixture');
    write(path.join(root,'tools/setup_obs_local.py'),'fixture');
    write(path.join(path.dirname(c.collection),'Original.json'),{name:'Original',sources:[]});
    return {c,root,write,calls};
}

test('first setup installs without Python or changing scene collections', async t => {
    const {c,calls}=fixture(t);
    assert.equal((await c.status()).local.setup.available,true);
    assert.match((await c.action('setup-local')).message,/준비 완료/);
    assert.equal(calls.length,1);
    assert.ok(calls[0].args.at(-1).endsWith('Install-OBSPlugin.ps1'));
    assert.ok(calls.every(call=>call.options.windowsHide));
    assert.equal((await c.status()).local.registered,false);
    await c.action('setup-local'); assert.equal(calls.length,1);
});
test('OBS running and pre-existing profile collisions never invoke setup commands', async t => {
    const f=fixture(t);
    f.c.processes=async()=>new Set(['obs64.exe']);
    await assert.rejects(f.c.action('setup-local'),/OBS를 종료/);
    assert.equal(f.calls.length,0);
    f.c.processes=async()=>new Set();
    f.write(path.join(f.c.profile,'basic.ini'),'existing profile');
    assert.equal((await f.c.status()).local.setup.conflict,true);
    await f.c.action('setup-local');
    assert.equal(f.calls.length,1);
    assert.equal(fs.readFileSync(path.join(f.c.profile,'basic.ini'),'utf8'),'existing profile');
});
test('a failed install can be retried without touching user scenes', async t => {
    const f=fixture(t), execute=f.c.execute; f.c.execute=async()=>{throw Error('install failed');};
    await assert.rejects(f.c.action('setup-local'),/install failed/);
    assert.equal(fs.existsSync(f.c.plugin),false); assert.equal(fs.existsSync(f.c.collection),false);
    f.c.execute=execute; await f.c.action('setup-local');
    assert.equal(fs.existsSync(f.c.plugin),true);
});
test('repairing only the missing plugin preserves an existing external source without re-registration', async t => {
    const f=fixture(t), source={sources:[{id:'a1_local_sync',settings:{config_path:path.join(f.root,'previous','sender.ini')}}]};
    f.write(f.c.collection,source);
    const original=fs.readFileSync(f.c.collection,'utf8');
    await f.c.action('setup-local');
    assert.equal(f.calls.length,1);
    assert.equal(fs.readFileSync(f.c.collection,'utf8'),original);
});
test('initial OBS launch opens only the configured application and never starts a broadcast', async t => {
    const f=fixture(t);
    await f.c.action('open-obs-setup');
    assert.deepEqual(f.calls,[{opened:f.c.obsExecutable}]);
    f.c.processes=async()=>new Set(['obs64.exe']);
    await f.c.action('open-obs-setup'); assert.equal(f.calls.length,1);
});

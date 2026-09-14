// Focused, isolated Electron verification for the local-capture first-use flow.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const results=path.resolve(__dirname,'../test-results');fs.mkdirSync(results,{recursive:true});
app.setPath('userData',path.join(results,'local-test-profile'));process.env.PORT='17116';
const {OutputModules}=require('../src/output-modules');
OutputModules.prototype.shutdown=async function(){};
OutputModules.prototype.readState=async function(){return {supported:true,busy:false,processError:'',root:'fixture',ndi:{built:true,processRunning:false,config:{}},
local:{installed:true,registered:true,processRunning:false,running:false,healthy:false,controlAvailable:false,
revision:'fixture',configPath:'fixture/local-capture.ini',config:{width:'1920',height:'1080',fps:'30',monitor:'0',buffer_ms:'500',audio_offset_ms:'0'},
setup:{built:true,obsInstalled:true,initialized:true,available:true}}};};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)), errors=[];
app.on('browser-window-created',(_,window)=>{
window.webContents.on('console-message',(_,level,message)=>{if(level===3)errors.push(message);});
window.webContents.once('did-finish-load',async()=>{
try{
window.setSize(600,420);window.show();window.focus();
const evaluate=script=>window.webContents.executeJavaScript(script);
const capture=async name=>{await delay(100);fs.writeFileSync(path.join(results,name+'.png'),(await window.webContents.capturePage()).toPNG());};
await evaluate('document.fonts.ready.then(()=>true)');await delay(100);

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

assert.deepEqual(errors,[]);
console.log('LOCAL_UI_OK: 600x420, first-run preparation, actionable start, reconnect, delivery and OBS broadcast; no live capture.');
await require('../main').getLifecycle().requestQuit();
}catch(error){console.error(error);app.exit(1);}
});
});
setTimeout(()=>{console.error('Local UI timeout');app.exit(1);},30000).unref();
require('../main');

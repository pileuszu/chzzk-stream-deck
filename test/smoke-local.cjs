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
                module.info.close();
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
            assert.equal(await evaluate("document.getElementById('capture-help').matches(':popover-open')"),true);
            assert.deepEqual(await evaluate('window.workflowActions'),[]);
            await localFixture({installed:false,registered:false});
            let firstRun=await workflowScreen();
            assert.equal(firstRun.stage,'setup');assert.equal(firstRun.label,'OBS 연결 준비');assert.equal(firstRun.disabled,false);
            assert.equal(firstRun.overflow,false);assert.ok(firstRun.footer<=420);
            await capture('local-first-setup');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.deepEqual(await evaluate('window.workflowActions'),['setup-local']);
            await localFixture({}); await capture('local-ready');
            // Help floats above the workspace at both supported compact sizes.
            const geometry=()=>evaluate(`(() => {
                const p=document.getElementById('local-capture-panel'),b=p.querySelector('.panel-body');
                return [b.clientHeight,b.scrollHeight,b.scrollTop,p.querySelector('.panel-footer').getBoundingClientRect().top];
            })()`);
            const isOpen=id=>evaluate(`document.getElementById('${id}').matches(':popover-open')`);
            for (const [width,height] of [[640,440],[600,420]]) {
                window.setSize(width,height);await delay(80);
                const baseline=await geometry();
                assert.ok(baseline[1]<=baseline[0]+1,'compact settings fit without a scrollbar');
                for (const id of ['capture-help','capture-diagnostics']) {
                    await evaluate(`document.getElementById('${id}-button').click()`);
                    assert.equal(await isOpen(id),true);
                    assert.deepEqual(await geometry(),baseline,'opening help cannot expand or scroll the settings');
                    assert.equal(await evaluate(`document.getElementById('${id}-button').getAttribute('aria-expanded')`),'true');
                    const rect=await evaluate(`(() => {const r=document.getElementById('${id}').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};})()`);
                    assert.ok(rect.left>=0&&rect.top>=0&&rect.right<=width&&rect.bottom<=height,'popover stays within the window');
                    assert.equal(await evaluate("document.querySelectorAll(':popover-open').length"),1);
                    await window.webContents.capturePage();await delay(150);
                    await capture(`local-${id}-${width}`);
                }
                window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
                window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(50);
                assert.equal(await isOpen('capture-diagnostics'),false);
                assert.equal(await evaluate("document.activeElement.id"),'capture-diagnostics-button');
                assert.equal(await evaluate("document.getElementById('capture-diagnostics-button').getAttribute('aria-expanded')"),'false');
                await evaluate("document.getElementById('capture-help-button').click()");
                window.webContents.sendInputEvent({type:'mouseDown',x:580,y:405,button:'left',clickCount:1});
                window.webContents.sendInputEvent({type:'mouseUp',x:580,y:405,button:'left',clickCount:1});await delay(50);
                assert.equal(await isOpen('capture-help'),false,'outside click dismisses help');
                await evaluate("document.getElementById('capture-help-button').click();document.querySelector('#capture-help [data-info-close]').click()");
                assert.equal(await isOpen('capture-help'),false);
                assert.equal(await evaluate("document.activeElement.id"),'capture-help-button');
                const point=await evaluate("(() => {const r=document.getElementById('capture-help-button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
                for (const expected of [true,false]) {
                    window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
                    window.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await delay(40);
                    assert.equal(await isOpen('capture-help'),expected,'same info button toggles with real pointer input');
                }
                await evaluate("document.getElementById('capture-help-button').click();window.deck.goHome()");
                assert.equal(await isOpen('capture-help'),false,'leaving the module closes its help');
                await localFixture({});
            }
            assert.equal((await workflowScreen()).label,'OBS 열고 연결');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.deepEqual(await evaluate('window.workflowActions'),['setup-local','start-local']);
            await localFixture({processRunning:true,controlAvailable:false});
            assert.equal((await workflowScreen()).label,'연결 다시 시도');
            await localFixture({processRunning:true,controlAvailable:true,running:false,captureRequested:true,fresh:true,error:'테스트 연결 실패',sourceAttached:false});
            assert.equal((await workflowScreen()).label,'다시 시도');assert.equal((await workflowScreen()).disabled,false);
            await capture('local-retry');
            await evaluate("document.getElementById('capture-toggle').click()");
            assert.equal(await evaluate('window.workflowActions.at(-1)'), 'start-local');
            await localFixture({processRunning:true,controlAvailable:true,running:true,healthy:true,sample_rate:48000,audio_peak:.12});
            const delivering=await workflowScreen();assert.equal(delivering.step,'2');assert.match(delivering.next,/방송을 시작/);
            assert.equal(delivering.overflow,false);await capture('local-delivering');
            await localFixture({processRunning:true,controlAvailable:true,running:true,healthy:true,streaming:true});
            assert.match((await workflowScreen()).next,/방송 중/);await capture('local-broadcasting');
            await localFixture({processRunning:true,controlAvailable:true,running:true,healthy:true});
            const partial=await evaluate("(async()=>{ const service=window.outputModuleCards,module=window.deck.registry.get('obs'), original=service.configure; const fps=document.getElementById('capture-fps');fps.value='60';fps.dispatchEvent(new Event('change',{bubbles:true})); service.configure=async payload=>{ service.state.local.config={...payload.values};service.state.local.revision='saved-but-not-applied';service.lastError='적용 실패';service.lastErrorScope='local';service.state.local.running=false;service.state.local.healthy=false;service.state.local.captureRequested=true;service.render();return false;};await module.save(window.deck.context,true);service.configure=original;const result={revision:module.revision,dirty:module.dirty,label:document.getElementById('capture-toggle').textContent};service.lastError='';return result;})()");
            assert.equal(partial.revision,'saved-but-not-applied');assert.equal(partial.dirty,false);assert.equal(partial.label,'다시 시도');
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

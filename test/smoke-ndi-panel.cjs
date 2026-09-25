// Isolated UI + preload IPC test. Native actions never run.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const results=path.resolve(__dirname,'../test-results');fs.mkdirSync(results,{recursive:true});
app.setPath('userData',path.join(results,'ndi-panel-profile'));process.env.PORT='17118';
const {OutputModules}=require('../src/output-modules');
const state={supported:true,busy:false,root:'fixture',local:{running:false},ndi:{built:true,processRunning:false,running:false,revision:'v1',config:{width:1920,height:1080,fps:60,buffer_ms:500,audio_offset_ms:0}}};
let revision=1,failApply=false;const calls=[];
OutputModules.prototype.shutdown=async()=>{};
OutputModules.prototype.readState=async()=>structuredClone(state);
OutputModules.prototype.configureNdi=async function(payload){
  calls.push(['configure',payload]);assert.equal(payload.revision,state.ndi.revision);
  Object.assign(state.ndi.config,payload.values,{output_mode:payload.mode});state.ndi.revision='v'+(++revision);
  if(payload.apply){
    if(failApply){state.ndi.processRunning=state.ndi.running=false;failApply=false;throw new Error('모드는 저장됐지만 테스트 재시작 실패');}
    Object.assign(state.ndi,state.ndi.config);
  }
  return {message:'모드 저장'};
};
OutputModules.prototype.action=async function(action){
  calls.push(['action',action]);
  if(action==='start-ndi')Object.assign(state.ndi,{processRunning:true,running:true,healthy:true,output_mode:state.ndi.config.output_mode,sample_rate:48000,audio_peak:.1,receivers:1,...state.ndi.config});
  if(action==='stop-ndi')state.ndi.processRunning=state.ndi.running=false;
  return {message:action};
};
const delay=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
app.on('browser-window-created',(_,win)=>{
  win.webContents.on('console-message',(_,level,message)=>{if(level===3)errors.push(message);});
  win.webContents.once('did-finish-load',async()=>{
    const evaluate=code=>win.webContents.executeJavaScript(code);
    const settled=async()=>{await delay(60);for(let i=0;i<80;i++){if(await evaluate('window.outputModuleCards && !window.outputModuleCards.busy'))return;await delay(30);}throw new Error('UI request did not settle');};
    const select=mode=>evaluate(`document.querySelector('[name="ndi-output-mode"][value="${mode}"]').click()`);
    const field=(id,value)=>evaluate(`(()=>{const f=document.getElementById('ndi-${id}');f.value=${JSON.stringify(String(value))};f.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    try{
      await evaluate('document.fonts.ready');await delay(250);
      await evaluate("window.deck.run('ndi')");
      for(const size of [[640,440],[600,420]]){
        win.setSize(...size);await delay(100);
        const fit=await evaluate("(()=>{const p=document.getElementById('output-panel'),b=p.querySelector('.panel-body');return {client:b.clientHeight,scroll:b.scrollHeight,footer:p.querySelector('footer').getBoundingClientRect().bottom};})()");
        fs.writeFileSync(path.join(results,`ndi-settings-${size[0]}.png`),(await win.webContents.capturePage()).toPNG());
        assert.ok(fit.scroll<=fit.client+1,JSON.stringify(fit));assert.ok(fit.footer<=size[1]);
      }
      await select('audio_only');assert.equal(await evaluate("document.getElementById('ndi-mode-save').textContent"),'설정 저장');
      await field('buffer',0);
      assert.equal(await evaluate("document.getElementById('ndi-buffer').value"),'0');
      assert.equal(await evaluate("document.getElementById('ndi-video-settings').hidden"),true);
      await evaluate("document.getElementById('ndi-mode-save').click()");await settled();
      assert.equal(state.ndi.running,false,'saving while stopped never starts');
      assert.equal(calls.at(-1)[1].mode,'audio_only');
      assert.equal(state.ndi.config.buffer_ms,0);
      await select('audio_video');
      assert.equal(await evaluate("document.querySelector('[data-output-action=\"start-ndi\"]').disabled"),true,'video requires a valid holdback before starting');
      await field('buffer',500);await field('fps',30);await field('monitor',2);
      await evaluate("document.querySelector('[data-output-action=\"start-ndi\"]').click()");await settled();
      assert.equal(state.ndi.running,true);assert.equal(state.ndi.output_mode,'audio_video');
      assert.equal(calls.at(-2)[0],'configure');assert.equal(calls.at(-1)[1],'start-ndi');
      assert.equal(state.ndi.fps,30);assert.equal(state.ndi.monitor,1);
      await select('audio_only');assert.equal(await evaluate("document.getElementById('ndi-mode-save').textContent"),'변경 적용');
      await field('buffer',0);
      await evaluate("document.getElementById('ndi-mode-save').click()");await settled();
      assert.equal(calls.at(-1)[1].apply,true);
      assert.equal(await evaluate("document.getElementById('output-video-summary').textContent"),'전송 안 함');
      assert.equal(await evaluate("document.getElementById('ndi-state').textContent"),'소리 송출 중');
      assert.equal(await evaluate("document.getElementById('output-buffer-summary').textContent"),'0 ms');
      await evaluate("document.getElementById('output-message').classList.remove('visible')");
      for(const size of [[640,440],[600,420]]){
        win.setSize(...size);await win.webContents.capturePage();await delay(150);
        assert.equal(await evaluate("(()=>{const b=document.querySelector('#output-panel .panel-body');return b.scrollHeight<=b.clientHeight+1})()"),true);
        fs.writeFileSync(path.join(results,`ndi-audio-only-${size[0]}.png`),(await win.webContents.capturePage()).toPNG());
      }
      await evaluate("document.querySelector('#output-panel [data-info-trigger]').click();window.deck.goHome()");
      assert.equal(await evaluate("document.querySelectorAll(':popover-open').length"),0);
      await evaluate("window.deck.run('ndi')");await select('audio_video');await field('buffer',250);failApply=true;
      await evaluate("document.getElementById('ndi-mode-save').click()");await settled();
      assert.equal(state.ndi.running,false);assert.equal(await evaluate("window.deck.registry.get('ndi').dirty"),false);
      assert.match(await evaluate("document.getElementById('output-module-note').textContent"),/재시작 실패/);
      assert.equal(await evaluate("document.querySelector('[data-output-action=\"start-ndi\"]').disabled"),false);
      await evaluate("document.querySelector('[data-output-action=\"start-ndi\"]').click()");await settled();assert.equal(state.ndi.output_mode,'audio_video');
      assert.deepEqual(errors,[]);
      console.log('NDI_PANEL_OK: compact layout; stopped save; save-and-start; live apply; audio-only status; failed-apply retry; guarded IPC.');
      await require('../main').getLifecycle().requestQuit();
    }catch(error){console.error(error);app.exit(1);}
  });
});
setTimeout(()=>app.exit(1),30000).unref();require('../main');

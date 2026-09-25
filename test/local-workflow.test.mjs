import test from 'node:test';
import assert from 'node:assert/strict';
import {localWorkflow} from '../js/deck/modules/local-workflow.mjs';
const state = {supported:true,local:{installed:false,registered:false,setup:{built:true,obsInstalled:true,initialized:true,available:true}}};
test('deleted sources and partial failures always expose a usable reconnect action',()=>{
    const ready={...state,local:{...state.local,installed:true,registered:false,controlAvailable:true,sourceAttached:false,processRunning:true}};
    assert.equal(localWorkflow(ready).action,'start');
    const failed={...ready,local:{...ready.local,captureRequested:true,fresh:true,error:'Capture failed'}};
    assert.equal(localWorkflow(failed).action,'start');
    assert.equal(localWorkflow(failed).label,'다시 시도');
    assert.equal(localWorkflow(failed,{dirty:true}).label,'저장하고 다시 시도');
    assert.equal(localWorkflow(ready,{error:'Connection lost'}).label,'다시 시도');
    assert.equal(localWorkflow(ready,{busy:true,error:'Connection lost'}).disabled,true);
});
test('a fresh clone progresses through prerequisites to preparation, not a disabled capture button',()=>{
    assert.equal(localWorkflow({...state,local:{...state.local,setup:{built:false}}}).action,'help');
    assert.equal(localWorkflow({...state,local:{...state.local,setup:{built:true,obsInstalled:true,initialized:false}}}).action,'prepare');
    assert.equal(localWorkflow({...state,local:{...state.local,processRunning:true}}).action,'refresh');
    const ready=localWorkflow(state);
    assert.equal(ready.action,'prepare'); assert.equal(ready.step,0);
});
test('capture delivery and OBS broadcasting remain distinct observed states',()=>{
    const ready={...state,local:{...state.local,installed:true,registered:true}};
    assert.equal(localWorkflow(ready).action,'start');
    assert.match(localWorkflow(ready,{dirty:true}).label,/저장/);
    const live={...ready,local:{...ready.local,running:true,healthy:true,controlAvailable:true}};
    assert.equal(localWorkflow(live).step,2); assert.equal(localWorkflow(live).streaming,false);
    assert.match(localWorkflow(live).title,/방송을 시작/);
    assert.equal(localWorkflow({...live,local:{...live.local,streaming:true}}).streaming,true);
    assert.equal(localWorkflow({...live,local:{...live.local,streaming:true,controlAvailable:false}}).streaming,false);
    assert.equal(localWorkflow(live,{busy:true}).disabled,true);
    assert.equal(localWorkflow({...ready,ndi:{processRunning:true}}).action,'ndi');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {localWorkflow} from '../js/deck/modules/local-workflow.mjs';
const state = {supported:true,local:{installed:false,registered:false,setup:{built:true,obsInstalled:true,initialized:true,available:true}}};
test('a fresh clone progresses through prerequisites to preparation, not a disabled capture button',()=>{
    assert.equal(localWorkflow({...state,local:{...state.local,setup:{built:false}}}).action,'help');
    assert.equal(localWorkflow({...state,local:{...state.local,setup:{built:true,obsInstalled:true,initialized:false}}}).action,'initialize');
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

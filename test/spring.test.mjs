import test from 'node:test';
import assert from 'node:assert/strict';
import { axis, advance } from '../js/deck/core/spring.mjs';

test('damped spring converges with bounded overshoot at 30, 60 and 144 Hz', () => {
    for (const hz of [30,60,144]) {
        const s=axis(0); let maximum=0, moving=true;
        for(let i=0;i<hz*3;i++){moving=advance(s,100,1/hz);maximum=Math.max(maximum,s.value);assert.ok(Number.isFinite(s.value)&&Number.isFinite(s.velocity));}
        assert.equal(moving,false); assert.equal(s.value,100); assert.equal(s.velocity,0);
        assert.ok(maximum>100 && maximum<110);
    }
});
test('integration is consistent at the same elapsed time across refresh rates', () => {
    const values=[30,60,120].map(hz=>{const s=axis(0);for(let i=0;i<hz/10;i++)advance(s,200,1/hz);return s.value;});
    assert.ok(Math.max(...values)-Math.min(...values)<.00001);
});
test('reversing a moving spring stays finite and settles at its new target', () => {
    const s=axis(0);
    for(let i=0;i<3;i++)advance(s,400,1/60);
    assert.ok(s.velocity>0);
    for(let i=0;i<180;i++)advance(s,-20,1/60);
    assert.equal(s.value,-20);assert.equal(s.velocity,0);
});

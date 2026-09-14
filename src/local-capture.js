const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const KEYS = ['width', 'height', 'fps', 'monitor', 'buffer_ms', 'audio_offset_ms'];

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}
function snapshot(file) {
    try {
        const text = fs.readFileSync(file, 'utf8');
        return { text, revision: createHash('sha256').update(text).digest('hex') };
    } catch { return { text: '', revision: '' }; }
}
function atomicWrite(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, text, 'utf8'); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function validateSettings(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values) ||
        Object.keys(values).length !== KEYS.length || Object.keys(values).some(key => !KEYS.includes(key))) {
        throw new Error('화면·싱크 설정 항목이 올바르지 않습니다.');
    }
    for (const key of KEYS) {
        if (typeof values[key] !== 'number' || !Number.isFinite(values[key]) ||
            (key !== 'audio_offset_ms' && !Number.isInteger(values[key]))) throw new Error('설정값은 유효한 숫자여야 합니다.');
    }
    const { width, height, fps, monitor, buffer_ms: buffer, audio_offset_ms: offset } = values;
    if (width < 320 || width > 3840 || width % 2 || height < 180 || height > 2160)
        throw new Error('해상도는 320×180부터 3840×2160까지, 가로는 짝수로 입력하세요.');
    if (fps < 15 || fps > 60 || monitor < 0 || monitor > 15)
        throw new Error('프레임은 15~60 FPS, 화면 번호는 1~16 범위여야 합니다.');
    if (buffer < 200 || buffer > 2000 || Math.abs(offset) > buffer - 100)
        throw new Error('버퍼는 200~2000 ms, 오디오 보정의 절댓값은 버퍼보다 최소 100 ms 작아야 합니다.');
    return { ...values };
}
function updateConfig(text, values) {
    const remaining = new Set([...KEYS, 'calibration_verified']);
    const next = { ...values, calibration_verified: 'false' };
    const lines = text.split(/\r?\n/).map(line => {
        const match = /^\s*(\w+)\s*=/.exec(line);
        if (!match || (!KEYS.includes(match[1]) && match[1] !== 'calibration_verified')) return line;
        remaining.delete(match[1]);
        return match[1] + '=' + next[match[1]];
    });
    for (const key of remaining) lines.push(key + '=' + next[key]);
    return lines.join('\n').replace(/\n*$/, '\n');
}
function readBridge(directory, now = Date.now()) {
    const file = path.join(directory, 'logs', 'deck-control-status.json');
    const data = readJson(file);
    let fresh = false;
    try { const age = now - fs.statSync(file).mtimeMs; fresh = age >= -1000 && age < 8000; } catch {}
    return { ...data, available: Boolean(fresh && data?.version === 1 && data.source_present) };
}
async function sendControl(directory, action, { timeout = 7000 } = {}) {
    if (!['start', 'stop', 'apply'].includes(action)) throw new Error('지원하지 않는 캡처 명령입니다.');
    if (!readBridge(directory).available) throw new Error('OBS의 A1 Local 장면과 캡처 제어 도구를 먼저 연결해 주세요.');
    const id = randomUUID();
    const file = path.join(directory, 'logs', 'deck-control-command.json');
    atomicWrite(file, JSON.stringify({ version: 1, id, action, expires_at: Date.now() + timeout }));
    try {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const state = readBridge(directory);
            if (state.available && state.request_id === id) {
                if (!state.ok) throw new Error(state.error || 'OBS가 캡처 명령을 처리하지 못했습니다.');
                return state;
            }
            await pause(100);
        }
        throw new Error('OBS의 처리 응답을 확인하지 못했습니다. 실행 상태를 확인해 주세요.');
    } finally {
        if (readJson(file)?.id === id) { try { fs.unlinkSync(file); } catch {} }
    }
}
async function waitForCapture(directory, running, values, { timeout = 5000, requestId } = {}) {
    const file = path.join(directory, 'logs', 'obs-status.json');
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const state = readJson(file);
        if (requestId && state?.request_id !== requestId) { await pause(100); continue; }
        if (state?.running === running) {
            if (!running) return state;
            if (state.healthy && ['width', 'height', 'fps', 'buffer_ms', 'audio_offset_ms'].every(key => Number(state[key]) === Number(values[key]))) return state;
        }
        if (state?.running === false && state.error) throw new Error('캡처 시작 실패: ' + state.error);
        await pause(100);
    }
    throw new Error('캡처 상태 확인이 지연되고 있습니다. 연결·진단 정보의 오류를 확인해 주세요.');
}
module.exports = { snapshot, atomicWrite, validateSettings, updateConfig, readBridge, sendControl, waitForCapture };

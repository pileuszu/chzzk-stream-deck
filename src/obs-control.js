const net = require('node:net');
const PIPE = '\\\\.\\pipe\\chzzk-a1-local-v2';

// One bounded request per local connection. No network listener or OBS credentials.
function request(action, configPath, { endpoint = PIPE, timeout = 5000 } = {}) {
    if (!['status', 'start', 'stop', 'apply'].includes(action)) return Promise.reject(new Error('지원하지 않는 OBS 명령입니다.'));
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(endpoint);
        socket.setEncoding('utf8');
        let text = '', done = false;
        const finish = (error, value) => {
            if (done) return; done = true; clearTimeout(timer); socket.destroy();
            if (error) reject(error); else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error('OBS 연결 응답이 없습니다. OBS가 준비되면 다시 시도해 주세요.')), timeout);
        socket.on('connect', () => socket.write(JSON.stringify({ version: 2, action,
            config_path: configPath, expires_at: Date.now() + timeout }) + '\n'));
        socket.on('data', chunk => {
            text += chunk.toString('utf8');
            if (Buffer.byteLength(text) > 16384) return finish(new Error('OBS 응답 크기가 올바르지 않습니다.'));
            let reply; try { reply = JSON.parse(text); } catch { return; }
            if (reply.version !== 2 || !reply.ok) return finish(new Error(reply.error || 'OBS 연결 응답이 올바르지 않습니다.'));
            finish(null, { ...reply, available: true });
        });
        socket.on('error', () => finish(new Error('OBS 연결 도구를 찾지 못했습니다. OBS를 닫고 연결 준비를 다시 시도해 주세요.')));
        socket.on('end', () => { if (!done) finish(new Error('OBS 연결이 끊어졌습니다. 다시 시도해 주세요.')); });
    });
}
module.exports = { request };

// Stop only the child handle owned by this server. Never kill by an image name.
function stopChild(child, { graceMs = 4000, forceMs = 2000 } = {}) {
    if (!child || child.exitCode != null || child.signalCode != null) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let grace, force, settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(grace); clearTimeout(force);
            child.removeListener('exit', onExit); child.removeListener('error', onError);
            error ? reject(error) : resolve();
        };
        const onExit = () => finish();
        const onError = error => finish(error);
        const terminate = () => {
            if (settled) return;
            clearTimeout(grace);
            try { child.kill('SIGTERM'); } catch (error) { finish(error); return; }
            if (!settled) force = setTimeout(() => finish(new Error('채팅 프로세스의 종료를 확인하지 못했습니다.')), forceMs);
        };
        child.once('exit', onExit); child.once('error', onError);
        if (child.connected) {
            grace = setTimeout(terminate, graceMs);
            try { child.send({ type: 'shutdown' }, error => { if (error) terminate(); }); } catch { terminate(); }
        } else terminate();
    });
}
module.exports = { stopChild };

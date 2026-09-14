// Closing the window preserves modules; explicit application quit drains these outputs.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const localCapture = require('./local-capture');
const ACTIONS = new Set(['start-ndi', 'stop-ndi', 'open-obs', 'open-folder', 'start-local', 'stop-local', 'setup-local', 'open-obs-setup']);

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { return null; }
}

function readConfig(file) {
    try {
        return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
            .map(line => /^\s*(\w+)\s*=(.*)$/.exec(line)).filter(Boolean)
            .map(match => [match[1], match[2].trim()]));
    } catch { return {}; }
}

function readStatus(file, processRunning, now = Date.now()) {
    const data = readJson(file);
    let age = Infinity;
    try { age = now - fs.statSync(file).mtimeMs; } catch { /* not started */ }
    const fresh = Boolean(data && age >= -1000 && age < 8000);
    return { ...data, fresh, running: Boolean(processRunning && fresh && data?.running) };
}

async function listProcesses() {
    const { stdout } = await runFile('tasklist.exe', ['/FO', 'CSV', '/NH'],
        { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    return new Set(stdout.split(/\r?\n/).map(line => /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase()).filter(Boolean));
}

function isTrustedSender(event, window, origin) {
    if (!window || event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame) return false;
    try {
        const url = new URL(event.senderFrame.url);
        return url.origin === origin && ['/', '/index.html'].includes(url.pathname);
    } catch { return false; }
}

class OutputModules {
    constructor({ root, appData = process.env.APPDATA, programData = process.env.ProgramData,
        platform = process.platform, execute = runFile, processes = listProcesses, openPath,
        obsExecutable = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' }) {
        this.root = root;
        this.platform = platform;
        this.execute = execute;
        this.processes = processes;
        this.openPath = openPath;
        this.obsExecutable = obsExecutable;
        this.profile = path.join(appData || '', 'obs-studio', 'basic', 'profiles', 'A1_Local');
        this.collection = path.join(appData || '', 'obs-studio', 'basic', 'scenes', 'A1_Local.json');
        this.plugin = path.join(programData || '', 'obs-studio', 'plugins', 'a1-local-source', 'bin', '64bit', 'a1-local-source.dll');
        this.busy = false;
        this.pendingStatus = null;
    }

    executable() {
        return ['build/Release/a1-ndi-sender.exe', 'build-obs/Release/a1-ndi-sender.exe']
            .map(file => path.join(this.root, file)).find(file => fs.existsSync(file));
    }

    status() {
        // Renderer polling and button clicks can share the same process snapshot.
        if (!this.pendingStatus) {
            this.pendingStatus = this.readState().finally(() => { this.pendingStatus = null; });
        }
        return this.pendingStatus;
    }

    async readState() {
        if (this.platform !== 'win32') return { supported: false, busy: false };
        let names = new Set();
        let processError = '';
        try { names = await this.processes(); } catch { processError = 'Windows 프로세스 상태를 확인하지 못했습니다.'; }
        const ndiProcess = names.has('a1-ndi-sender.exe');
        const obsProcess = names.has('obs64.exe');
        const collection = readJson(this.collection);
        const source = collection?.sources?.find(item => (item.id || item.versioned_id) === 'a1_local_sync');
        const registeredConfig = source?.settings?.config_path || source?.settings?.deck_config_path;
        const obsConfig = typeof registeredConfig === 'string' && path.isAbsolute(registeredConfig)
            ? registeredConfig : path.join(this.root, 'sender.ini');
        const ndi = readStatus(path.join(this.root, 'logs', 'status.json'), ndiProcess);
        const directory = path.dirname(obsConfig);
        const local = readStatus(path.join(directory, 'logs', 'obs-status.json'), obsProcess);
        const bridge = localCapture.readBridge(directory);
        const localFile = path.join(directory, 'local-capture.ini');
        const editFile = fs.existsSync(localFile) ? localFile : obsConfig;
        const draft = localCapture.snapshot(editFile);
        const installed = fs.existsSync(this.plugin), registered = Boolean(source);
        return {
            supported: true, busy: this.busy || Boolean(this.closing), processError, root: this.root,
            ndi: { ...ndi, processRunning: ndiProcess, built: Boolean(this.executable()),
                config: readConfig(path.join(this.root, 'sender.ini')) },
            local: { ...local, processRunning: obsProcess, registered,
                installed, setup: this.setupInfo(registered, installed), configPath: editFile, directory,
                controlAvailable: Boolean(obsProcess && bridge.available), captureRequested: bridge.capture_requested,
                recording: bridge.recording, streaming: bridge.streaming, revision: draft.revision,
                appliedConfigPath: obsConfig,
                external: path.resolve(path.dirname(obsConfig)).toLowerCase() !== path.resolve(this.root).toLowerCase(),
                config: readConfig(editFile) }
        };
    }

    async action(action) {
        if (!ACTIONS.has(action)) throw new Error('지원하지 않는 출력 모듈 명령입니다.');
        if (this.platform !== 'win32') throw new Error('출력 모듈은 Windows x64에서 사용할 수 있습니다.');
        if (this.closing) throw new Error('앱을 종료하는 중입니다.');
        if (this.busy) throw new Error('이전 작업이 끝날 때까지 기다려 주세요.');
        this.busy = true;
        try {
            const state = await this.status();
            if (action === 'setup-local') return await this.setupLocal(state);
            if (action === 'open-obs-setup') {
                if (state.processError) throw new Error(state.processError);
                if (!state.local.setup.obsInstalled) throw new Error('OBS Studio 32.0.1 x64를 기본 경로에 설치해 주세요.');
                if (!state.local.processRunning) {
                    const error = await this.openPath(this.obsExecutable);
                    if (error) throw new Error(error);
                }
                return { message: 'OBS 초기 설정을 마친 뒤 종료하고 OBS 소스 준비를 눌러 주세요.' };
            }
            if (action === 'start-local' || action === 'stop-local') return await this.controlLocal(action, state);
            if (action === 'open-folder') {
                const error = await this.openPath(this.root);
                if (error) throw new Error(error);
                return { message: '모듈 폴더를 열었습니다. OUTPUT-MODULES.md에 설치 방법이 있습니다.' };
            }
            if (state.processError) throw new Error(state.processError);
            const exe = this.executable();
            if (action === 'start-ndi') {
                if (state.local.running) throw new Error('로컬 캡처 모듈의 캡처 중지를 먼저 눌러 주세요.');
                if (state.ndi.processRunning) return { message: 'NDI 송신기가 이미 실행 중입니다.' };
                if (!exe) throw new Error('아직 빌드되지 않았습니다. 저장소에서 npm run build:ndi를 실행해 주세요.');
                await this.runScript('Start-Sender.ps1');
                return { message: 'NDI 송출을 시작했습니다. 받는 PC에서 A1 Desktop Sync를 선택하세요.' };
            }
            if (action === 'stop-ndi') {
                if (!state.ndi.processRunning) return { message: 'NDI 송신기가 중지되어 있습니다.' };
                if (!exe) throw new Error('중지 명령에 필요한 송신기 실행 파일이 없습니다. 실행 중인 송신기의 트레이에서 중지해 주세요.');
                await this.stopNdi();
                return { message: 'NDI 송신기를 종료했습니다.' };
            }
            if (!state.local.registered || !state.local.installed) {
                throw new Error('OBS 소스를 먼저 설치·등록해 주세요. 모듈 폴더의 OUTPUT-MODULES.md를 참고하세요.');
            }
            if (state.local.processRunning) return { message: 'OBS가 실행 중입니다. OBS에서 A1 Local 프로파일과 장면 모음을 선택하세요.' };
            if (state.ndi.processRunning) throw new Error('NDI 중지를 누른 후 OBS를 열어 주세요.');
            await this.runScript('Start-OBS.ps1');
            return { message: 'A1 Local로 OBS를 열었습니다. 녹화·방송 시작은 OBS에서 선택하세요.' };
        } catch (error) {
            throw new Error(error.stderr?.trim() || error.message);
        } finally { this.busy = false; }
    }


    setupInfo(registered, installed) {
        let initialized = false;
        try { initialized = fs.readdirSync(path.dirname(this.collection)).some(name => name.endsWith('.json')); } catch {}
        const built = installed || fs.existsSync(path.join(this.root, 'build-obs', 'Release', 'a1-local-source.dll'));
        const obsInstalled = fs.existsSync(this.obsExecutable);
        const conflict = !registered && (fs.existsSync(this.collection) || fs.existsSync(this.profile));
        const missingTools = (!installed && !fs.existsSync(path.join(this.root, 'Install-OBSPlugin.ps1'))) ||
            (!registered && !fs.existsSync(path.join(this.root, 'tools', 'setup_obs_local.py')));
        return { built, obsInstalled, initialized, conflict, missingTools,
            available: Boolean(built && obsInstalled && initialized && !conflict && !missingTools) };
    }

    async registrationPython() {
        for (const [exe, args] of [['py.exe', ['-3']], ['python.exe', []]]) {
            try {
                const reply = await this.execute(exe, [...args, '-c', 'import sys; print(sys.version_info.major)'],
                    { windowsHide: true, timeout: 5000, maxBuffer: 8192 });
                if (reply.stdout?.trim() === '3') return { exe, args };
            } catch { /* Try the other standard Python launcher. */ }
        }
        throw new Error('자동 소스 등록에는 Python 3가 필요합니다. 설치 후 앱을 다시 열고 OBS 소스 준비를 눌러 주세요.');
    }

    async setupLocal(state) {
        if (state.processError) throw new Error(state.processError);
        const local = state.local, setup = local.setup;
        if (local.installed && local.registered) return { message: 'OBS 소스가 준비되어 있습니다. 설정 후 OBS로 전달을 시작하세요.' };
        if (local.processRunning) throw new Error('OBS를 종료한 뒤 소스를 준비해 주세요. 방송·녹화가 끝난 뒤 진행하세요.');
        if (!setup.built || setup.missingTools) throw new Error('캡처 엔진이 준비되지 않았습니다. 저장소에서 npm run build:native를 실행하거나 빌드된 앱을 사용하세요.');
        if (!setup.obsInstalled) throw new Error('OBS Studio 32.0.1 x64를 기본 경로에 설치해 주세요.');
        if (!setup.initialized) throw new Error('OBS를 한 번 실행해 초기 설정을 만든 뒤 종료해 주세요.');
        if (setup.conflict) throw new Error('기존 A1 Local 장면 또는 프로필이 있어 자동 등록을 멈췄습니다. 설치·연결 방법에서 기존 설정을 확인하세요.');
        // Validate the registration dependency before changing the installed plugin.
        const python = !local.registered ? await this.registrationPython() : null;
        if (!local.installed) {
            try { await this.runScript('Install-OBSPlugin.ps1'); }
            catch (error) {
                const detail = error.stderr?.trim() || error.message;
                if (/requires the verified OBS/i.test(detail)) throw new Error('현재 플러그인은 OBS Studio 32.0.1 x64용입니다. 설치된 OBS 버전을 확인해 주세요.');
                if (/Unauthorized|denied|권한|액세스/i.test(detail)) throw new Error('플러그인 설치 권한이 필요합니다. 설치·연결 방법에서 관리자 설치 단계를 확인한 뒤 다시 준비하세요.');
                throw error;
            }
        }
        if (python) await this.execute(python.exe, [...python.args, path.join(this.root, 'tools', 'setup_obs_local.py')],
            { cwd: this.root, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
        const ready = await this.readState();
        if (!ready.local.installed || !ready.local.registered) throw new Error('준비 결과를 확인하지 못했습니다. 설치·연결 방법을 확인해 주세요.');
        return { message: 'OBS 소스 준비 완료. 설정을 확인하고 OBS 열고 전달 시작을 누르세요.' };
    }

    async controlLocal(action, state) {
        if (state.processError) throw new Error(state.processError);
        if (!state.local.installed || !state.local.registered) throw new Error('OBS에 A1 Local 소스를 설치·등록해 주세요.');
        if (action === 'start-local' && state.ndi.processRunning) throw new Error('NDI 송신을 먼저 중지해 주세요.');
        if (!state.local.processRunning) {
            if (action === 'stop-local') return { message: '캡처가 중지되어 있습니다.' };
            await this.runScript('Start-OBS.ps1');
            const deadline = Date.now() + 12000;
            do {
                await new Promise(resolve => setTimeout(resolve, 300));
                state = await this.readState();
                if (state.local.controlAvailable) break;
            } while (Date.now() < deadline);
        }
        if (!state.local.controlAvailable) throw new Error('OBS에서 A1 Local 장면 모음과 캡처 제어 도구를 연결해 주세요.');
        const running = action === 'start-local';
        await localCapture.sendControl(state.local.directory, running ? 'start' : 'stop');
        await localCapture.waitForCapture(state.local.directory, running, state.local.config);
        return { message: running ? '로컬 캡처를 시작했습니다. 화면과 A1 오디오가 OBS에 공급됩니다.' : '로컬 캡처를 중지했습니다.' };
    }

    async configure(payload) {
        if (this.platform !== 'win32') throw new Error('로컬 캡처는 Windows에서 사용할 수 있습니다.');
        if (this.closing) throw new Error('앱을 종료하는 중입니다.');
        if (this.busy) throw new Error('이전 작업이 끝날 때까지 기다려 주세요.');
        if (!payload || typeof payload.revision !== 'string' || typeof payload.apply !== 'boolean' ||
            Object.keys(payload).some(key => !['values', 'revision', 'apply'].includes(key))) throw new Error('잘못된 설정 요청입니다.');
        const values = localCapture.validateSettings(payload.values);
        this.busy = true;
        try {
            const state = await this.readState();
            if (state.processError) throw new Error(state.processError);
            if (!state.local.registered) throw new Error('OBS에 A1 Local 소스를 먼저 등록해 주세요.');
            if (payload.apply && (!state.local.running || !state.local.controlAvailable || state.ndi.processRunning))
                throw new Error('실행 중인 로컬 캡처에 연결한 후 적용해 주세요.');
            const current = localCapture.snapshot(state.local.configPath);
            if (!current.text || !current.revision || current.revision !== payload.revision)
                throw new Error('다른 곳에서 설정이 변경됐습니다. 저장값 불러오기를 누른 뒤 다시 편집해 주세요.');
            const file = path.join(state.local.directory, 'local-capture.ini');
            // Local capture owns a separate config after its first save.
            localCapture.atomicWrite(file + '.bak', current.text);
            localCapture.atomicWrite(file, localCapture.updateConfig(current.text, values));
            if (payload.apply) {
                try {
                    await localCapture.sendControl(state.local.directory, 'apply');
                    await localCapture.waitForCapture(state.local.directory, true, values);
                } catch (error) {
                    throw new Error('설정은 저장됐지만 적용을 확인하지 못했습니다. ' + error.message);
                }
            }
            return { message: payload.apply ? '설정을 저장하고 캡처에 적용했습니다.' : '설정을 저장했습니다. 다음 캡처 시작 시 적용됩니다.' };
        } finally { this.busy = false; }
    }


    async shutdown() {
        if (this.platform !== 'win32') return;
        if (this.shutdownPromise) return this.shutdownPromise;
        this.closing = true;
        this.shutdownPromise = (async () => {
            const deadline = Date.now() + 45000;
            while (this.busy) {
                if (Date.now() >= deadline) throw new Error('진행 중인 캡처 작업을 기다리는 중입니다. 잠시 후 종료를 다시 누르세요.');
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            this.busy = true;
            try {
                const state = await this.readState();
                if (state.processError) throw new Error(state.processError);
                const errors = [];
                if (state.local.processRunning && (state.local.running || (state.local.controlAvailable && state.local.captureRequested))) {
                    try { await this.controlLocal('stop-local', state); } catch (error) { errors.push('로컬 캡처: ' + error.message); }
                }
                if (state.ndi.processRunning) {
                    try { await this.stopNdi(); } catch (error) { errors.push('NDI: ' + error.message); }
                }
                if (errors.length) throw new Error(errors.join('\n'));
            } finally { this.busy = false; }
        })().catch(error => { this.closing = false; throw error; })
            .finally(() => { this.shutdownPromise = null; });
        return this.shutdownPromise;
    }

    async stopNdi() {
        const exe = this.executable();
        if (!exe) throw new Error('NDI 중지에 필요한 송신기 실행 파일이 없습니다.');
        await this.execute(exe, ['--stop'], { cwd: this.root, windowsHide: true, timeout: 15000 });
        const deadline = Date.now() + 8000;
        while ((await this.processes()).has('a1-ndi-sender.exe')) {
            if (Date.now() >= deadline) throw new Error('NDI 송신기의 종료를 확인하지 못했습니다.');
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    runScript(file) {
        // No shell or renderer-supplied command, path or arguments.
        return this.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', path.join(this.root, file)], { cwd: this.root, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
    }
}

module.exports = { OutputModules, readStatus, readConfig, isTrustedSender };

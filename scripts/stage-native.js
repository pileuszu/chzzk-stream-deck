// electron-builder hook: stage a clean runtime without recordings, local settings backups or SDK downloads.
const fs = require('node:fs');
const path = require('node:path');

function stageNative() {
    const root = path.resolve(__dirname, '..');
    const source = path.join(root, 'native', 'a1-output');
    const target = path.join(root, 'native-runtime');
    // build:native builds both outputs together; prefer that binary over an older NDI-only build.
    const exe = ['build-obs/Release/a1-ndi-sender.exe', 'build/Release/a1-ndi-sender.exe']
        .find(file => fs.existsSync(path.join(source, file)));
    const plugin = 'build-obs/Release/a1-local-source.dll';
    if (!exe || !fs.existsSync(path.join(source, plugin))) {
        throw new Error('Build both native modules before packaging: npm run build:native');
    }
    // Fixed child of the repository; never remove the user's runtime/configuration directory.
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    const folders = new Set(['src', 'tests', 'obs-plugin', 'third_party', 'tools']);
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        if (folders.has(item.name) || (item.isFile() && /\.(md|ps1|bat|cmd)$/.test(item.name)) || item.name === 'CMakeLists.txt') {
            fs.cpSync(path.join(source, item.name), path.join(target, item.name), {
                recursive: true, filter: file => !file.split(path.sep).includes('__pycache__')
            });
        }
    }
    // Never package a developer's customized sender.ini.
    fs.copyFileSync(path.join(source, 'sender.example.ini'), path.join(target, 'sender.ini'));
    for (const [from, to] of [[exe, 'build/Release/a1-ndi-sender.exe'], [plugin, plugin]]) {
        fs.mkdirSync(path.dirname(path.join(target, to)), { recursive: true });
        fs.copyFileSync(path.join(source, from), path.join(target, to));
    }
    console.log('Staged A1 NDI sender and OBS local plugin (no installed third-party runtimes).');
}

module.exports = stageNative;
if (require.main === module) stageNative();

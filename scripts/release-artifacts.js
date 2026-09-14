const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function releaseVersion(root, tag = '') {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Invalid release version');
    if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
        throw new Error('package.json and package-lock.json versions must match');
    }
    if (tag && tag !== `v${pkg.version}`) throw new Error(`Release tag must be v${pkg.version}; received ${tag}`);
    return { version: pkg.version, tag: `v${pkg.version}`,
        filename: `CHZZK-Stream-Deck-${pkg.version}-win-x64-portable.exe` };
}

function prepareArtifacts(root, output = path.join(root, 'dist/release'), tag = '') {
    const release = releaseVersion(root, tag);
    const executable = path.join(output, release.filename);
    if (!fs.existsSync(executable) || fs.statSync(executable).size === 0) throw new Error('The versioned portable executable is missing');
    const app = path.join(output, 'win-unpacked/resources/app');
    const native = path.join(output, 'win-unpacked/resources/a1-output');
    const packaged = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
    if (packaged.version !== release.version) throw new Error('Packaged application version does not match');
    for (const file of ['build/Release/a1-ndi-sender.exe', 'build-obs/Release/a1-local-source.dll',
        'src/aligned_capture.hpp', 'CMakeLists.txt', 'obs-plugin/COPYING', 'tools/setup_obs_local.py',
        'tools/relink_obs_local.py', 'tools/deck-local-control.lua']) {
        if (!fs.existsSync(path.join(native, file))) throw new Error(`Required native runtime file missing: ${file}`);
    }
    for (const file of ['.local-backups', 'native', 'test-results']) {
        if (fs.existsSync(path.join(app, file))) throw new Error(`Private/build directory in packaged app: ${file}`);
    }
    for (const file of ['logs', 'local-capture.ini', 'local-capture.ini.bak', 'build-obs-deps']) {
        if (fs.existsSync(path.join(native, file))) throw new Error(`Personal/generated data in packaged runtime: ${file}`);
    }
    const defaults = fs.readFileSync(path.join(root, 'native/a1-output/sender.example.ini'));
    if (!defaults.equals(fs.readFileSync(path.join(native, 'sender.ini')))) throw new Error('Packaged sender settings are not the shared defaults');
    const checksum = createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
    fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${checksum}  ${release.filename}\n`);
    fs.writeFileSync(path.join(output, 'RELEASE-NOTES.md'), `# CHZZK Stream Deck ${release.tag}\n\n` +
        `Windows x64 포터블 앱입니다. **${release.filename}**을 다운로드해 실행하세요.\n\n` +
        `- 로컬 캡처, NDI 송신, CHZZK 채팅을 한 앱에서 관리합니다.\n` +
        `- 화면·A1 캡처 엔진과 OBS 로컬 플러그인이 포함돼 있습니다.\n` +
        `- 앱 실행만으로 캡처·방송·녹화를 시작하지 않습니다.\n\n` +
        `캡처에는 Voicemeeter, NDI 송신에는 NDI 6 런타임을 별도로 설치해야 합니다. ` +
        `로컬 캡처는 OBS Studio 32.0.1 x64 기준이며 최초 자동 소스 등록에는 Python 3가 필요합니다.\n\n` +
        `설정은 사용자 AppData에 보관합니다. 개인 설정·녹화·백업은 배포 파일에 포함하지 않습니다. ` +
        `OBS 플러그인의 대응 소스·빌드 스크립트·라이선스는 앱에 함께 포함됩니다.\n`);
    return { ...release, executable, checksum };
}

if (require.main === module) {
    try {
        const root = path.resolve(__dirname, '..');
        const tag = process.env.RELEASE_TAG || '';
        console.log(JSON.stringify(process.argv.includes('--check-version') ? releaseVersion(root, tag) : prepareArtifacts(root, undefined, tag)));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { releaseVersion, prepareArtifacts };

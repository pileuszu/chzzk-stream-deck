const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { releaseVersion, prepareArtifacts } = require('../scripts/release-artifacts');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-release-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (name, data = 'fixture') => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, data);
    };
    write('package.json', JSON.stringify({ version: '3.0.0' }));
    write('package-lock.json', JSON.stringify({ version: '3.0.0', packages: { '': { version: '3.0.0' } } }));
    const output = 'dist/release/';
    const native = output + 'win-unpacked/resources/a1-output/';
    write(output + 'CHZZK-Stream-Deck-3.0.0-win-x64-portable.exe', 'portable fixture');
    write(output + 'win-unpacked/resources/app/package.json', JSON.stringify({ version: '3.0.0' }));
    for (const file of ['build/Release/a1-ndi-sender.exe', 'build-obs/Release/a1-local-source.dll',
        'src/aligned_capture.hpp', 'CMakeLists.txt', 'obs-plugin/COPYING', 'tools/setup_obs_local.py',
        'tools/relink_obs_local.py', 'tools/deck-local-control.lua']) write(native + file);
    write('native/a1-output/sender.example.ini', 'fps=30\n');
    write(native + 'sender.ini', 'fps=30\n');
    return { root, output, native, write };
}

test('release rejects tag and lockfile version mismatches before building', t => {
    const f = fixture(t);
    assert.equal(releaseVersion(f.root, 'v3.0.0').version, '3.0.0');
    assert.throws(() => releaseVersion(f.root, 'v2.0.1'), /tag must be/);
    f.write('package-lock.json', JSON.stringify({ version: '2.0.0' }));
    assert.throws(() => releaseVersion(f.root), /versions must match/);
});

test('release selects only the current portable executable and creates checksum and notes', t => {
    const f = fixture(t);
    f.write(f.output + 'CHZZK-Stream-Deck-2.0.0-win-x64-portable.exe', 'old fixture');
    const release = prepareArtifacts(f.root);
    assert.match(fs.readFileSync(path.join(f.root, f.output, 'SHA256SUMS.txt'), 'utf8'), /^[a-f0-9]{64}  CHZZK-Stream-Deck-3\.0\.0-win-x64-portable\.exe\n$/);
    assert.match(fs.readFileSync(path.join(f.root, f.output, 'RELEASE-NOTES.md'), 'utf8'), /v3\.0\.0/);
    assert.equal(release.filename, 'CHZZK-Stream-Deck-3.0.0-win-x64-portable.exe');
});

test('release refuses incomplete modules, private files and customized sender settings', t => {
    const f = fixture(t);
    const plugin = f.native + 'build-obs/Release/a1-local-source.dll';
    fs.unlinkSync(path.join(f.root, plugin));
    assert.throws(() => prepareArtifacts(f.root), /Required native/);
    f.write(plugin);
    f.write(f.native + 'local-capture.ini', 'private');
    assert.throws(() => prepareArtifacts(f.root), /Personal\/generated/);
    fs.unlinkSync(path.join(f.root, f.native, 'local-capture.ini'));
    f.write(f.native + 'sender.ini', 'private');
    assert.throws(() => prepareArtifacts(f.root), /shared defaults/);
    assert.equal(fs.existsSync(path.join(f.root, f.output, 'SHA256SUMS.txt')), false);
});

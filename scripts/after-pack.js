const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
module.exports = async context => {
    if (context.electronPlatformName !== 'win32') return;
    const executable = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'embed-windows-icon.ps1'),
        '-Executable', executable, '-Icon', path.resolve(__dirname, '../assets/icons/icon.ico')],
        { windowsHide: true, timeout: 30000 });
};

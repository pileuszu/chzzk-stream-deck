const fs = require('node:fs');
const path = require('node:path');

// Portable Electron extracts resources to a temporary directory. Keep configuration,
// plugin source paths and logs under userData so OBS can use them after the app exits.
function syncRuntime(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, item.name);
        const to = path.join(destination, item.name);
        if (item.isDirectory()) syncRuntime(from, to);
        else if (item.isFile()) {
            if (['sender.ini', 'local-capture.ini'].includes(item.name) && fs.existsSync(to)) continue;
            const content = fs.readFileSync(from);
            if (!fs.existsSync(to) || !content.equals(fs.readFileSync(to))) fs.writeFileSync(to, content);
        }
    }
    return destination;
}

function prepareRuntime(app) {
    if (!app.isPackaged) return path.join(__dirname, '..', 'native', 'a1-output');
    return syncRuntime(path.join(process.resourcesPath, 'a1-output'), path.join(app.getPath('userData'), 'a1-output'));
}

module.exports = { prepareRuntime, syncRuntime };

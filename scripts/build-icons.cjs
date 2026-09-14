// Render the source SVG with the installed Electron; no image service or extra package.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
    const svg = fs.readFileSync(path.resolve(__dirname, '../icon.svg'), 'utf8');
    const window = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true,
        webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true } });
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;width:256px;height:256px;overflow:hidden;background:transparent}svg{display:block}</style>' + svg));
    await new Promise(resolve => setTimeout(resolve, 150));
    const capture = await window.webContents.capturePage();
    const output = path.resolve(__dirname, '../assets/icons');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'icon.png'), capture.toPNG());
    const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
    const images = sizes.map(size => nativeImage.createFromBuffer(capture.toPNG()).resize({ width: size, height: size, quality: 'best' }).toPNG());
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
        const entry = 6 + index * 16;
        header[entry] = header[entry + 1] = size === 256 ? 0 : size;
        header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
        offset += images[index].length;
    });
    fs.writeFileSync(path.join(output, 'icon.ico'), Buffer.concat([header, ...images]));
    window.destroy();
    console.log('Generated application PNG and multi-resolution ICO from icon.svg.');
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });

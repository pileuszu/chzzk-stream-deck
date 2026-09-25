const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { once } = require('node:events');
const { DEFAULT_SETTINGS } = require('../shared/chat-config');
app.setPath('userData', path.resolve('test-results/chat-overlay-profile'));
process.env.PORT = '17114';
const Server = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
    const settingsPath = path.resolve('test-results/chat-settings-' + process.pid + '.json');
    const server = new Server({ settingsPath });
    server.startChatModule = async () => { server.status.chat.active = true; };
    server.stopChatModule = async () => { server.status.chat.active = false; };
    server.serverInstance = server.app.listen(server.port, server.host);
    await once(server.serverInstance, 'listening');
    const dashboard = new BrowserWindow({ width: 640, height: 440, show: false, frame: false,
        webPreferences: { partition: 'chat-dashboard-' + process.pid, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const obs = new BrowserWindow({ width: 800, height: 600, show: false,
        webPreferences: { partition: 'chat-obs-' + process.pid, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    dashboard.showInactive();
    const evaluate = source => dashboard.webContents.executeJavaScript(source);
    const live = source => obs.webContents.executeJavaScript(source);
    const wait = async (condition, run = evaluate) => {
        const deadline = Date.now() + 8000;
        while (!await run(condition)) { if (Date.now() > deadline) throw new Error(condition); await delay(50); }
    };
    const set = async (field, value) => evaluate('(() => { const input=document.getElementById(' + JSON.stringify('chat-' + field) +
        '); input.value=' + JSON.stringify(String(value)) + '; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
    const themeIs = theme => 'document.getElementById("chatContainer").classList.contains(' + JSON.stringify('theme-' + theme) + ')';
    const checkUnicornFrame = async () => {
        await live(`Promise.all(['Unicorn_Side.png','Unicorn_Center.png','Unicorn_Name_Left.png','Unicorn_Name_Center.png','Unicorn_Name_Right.png'].map(name => {
            const image=new Image(); image.src='/assets/images/'+name; return image.decode();
        }))`);
        obs.showInactive();
        for (const [width,height,zoom] of [[800,600,1],[380,300,1],[380,300,0.75]]) {
            obs.setSize(width,height); obs.webContents.setZoomFactor(zoom);
            await delay(150);
            const layout=await live(`(() => {
                const card=document.querySelector('.chat-message-container:last-child');
                const box=selector=>{const r=card.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
                return {viewport:{width:innerWidth,height:innerHeight},body:box('.chat-message'),name:box('.username'),painted:card.querySelector('unicorn-frame[kind="message"]').painted};
            })()`);
            assert.ok(layout.name.y < layout.body.y && layout.name.bottom > layout.body.y + 15,'nameplate must overlap the upper rim');
            assert.ok(layout.name.right <= layout.body.right,'nameplate must stay inside the frame');
            assert.equal(layout.painted,true,'the frame artwork must be rendered');
            const capture=await obs.webContents.capturePage();
            const size=capture.getSize(); const pixels=capture.toBitmap();
            const sx=size.width/layout.viewport.width, sy=size.height/layout.viewport.height;
            const capWidth=layout.body.height*1144/2138;
            for(const seam of [layout.body.x+capWidth,layout.body.right-capWidth]) {
                const row=Math.round((layout.body.y+layout.body.height*0.6)*sy);
                const column=Math.round(seam*sx);
                const samples=[];
                for(let x=column-3;x<=column+3;x++)samples.push([...pixels.subarray((row*size.width+x)*4,(row*size.width+x)*4+3)]);
                assert.ok(samples.every(bgr=>bgr[2]>150 && bgr[1]>100),'no transparent/dark crack in the parchment');
                for(let channel=0;channel<3;channel++)assert.ok(Math.max(...samples.map(c=>c[channel]))-Math.min(...samples.map(c=>c[channel]))<18,'no visible colour stripe at the join');
            }
            fs.mkdirSync(path.resolve('test-results'),{recursive:true});
            fs.writeFileSync(path.resolve('test-results/unicorn-frame-'+width+'-'+zoom+'.png'),capture.toPNG());
        }
        obs.webContents.setZoomFactor(1); obs.setSize(800,600); obs.hide();
    };
    try {
        await obs.loadURL('http://localhost:17114/chat-overlay.html');
        await wait('Boolean(window.chatOverlay)', live);
        await live('localStorage.setItem("chat-theme","simple-purple")');
        await dashboard.loadURL('http://localhost:17114/not-a-page');
        await evaluate('localStorage.setItem("moduleSettings",' + JSON.stringify(JSON.stringify({chat:{...DEFAULT_SETTINGS,theme:'unicorn-overlord'}})) + ')');
        await dashboard.loadURL('http://localhost:17114/');
        await wait('Boolean(window.app && window.deck)');
        await evaluate('window.app.settingsReady');
        await evaluate('window.deck.run("chat")');
        await wait('document.getElementById("chat-theme-select").value === "unicorn-overlord"');
        await wait('Boolean(document.getElementById("chat-preview-frame").contentWindow.chatOverlay)');
        assert.deepEqual(await evaluate('Array.from(document.getElementById("chat-theme-select").options, o=>o.value)'),
            ['simple-purple','unicorn-overlord','maplestory']);
        await wait(themeIs('unicorn-overlord'), live);
        assert.equal(await live('localStorage.getItem("chat-theme")'), 'simple-purple');
        assert.equal(await evaluate('window.app.chatModule.isActive'), false);

        server.broadcastMessage({ username:'긴닉네임시청자', message:'저장 전부터 표시된 채팅' });
        await wait('window.chatOverlay.messages.length === 1', live);
        const currentMessage = await live('document.querySelector(".message").textContent');
        for (const theme of ['simple-purple','maplestory','unicorn-overlord']) {
            const savedTheme = server.chatSettings.get().theme;
            await set('theme-select', theme);
            await delay(100);
            assert.equal(server.chatSettings.get().theme, savedTheme, 'draft must not reach OBS');
            await evaluate('document.getElementById("save-chat-settings").click()');
            await wait('!window.app.chatBusy');
            await wait(themeIs(theme), live);
            await wait('window.app.settingsManager.getModuleSettings("chat").theme === ' + JSON.stringify(theme));
            await wait('document.getElementById("chat-draft-state").dataset.dirty === "false"');
            assert.equal(server.chatSettings.get().theme, theme);
            assert.equal(await live('document.querySelector(".message").textContent'), currentMessage);
            if (theme === 'unicorn-overlord') {
                await wait('Boolean(document.querySelector("unicorn-frame[kind=message]")?.painted)',live);
                await checkUnicornFrame();
            }
            await delay(180);
            const image = await dashboard.webContents.capturePage();
            fs.mkdirSync(path.resolve('test-results'), {recursive:true});
            fs.writeFileSync(path.resolve('test-results/chat-' + theme + '.png'), image.toPNG());
        }
        await set('max-messages', 2); await set('max-nickname-length', 3); await set('alignment', 'right');
        await evaluate('document.getElementById("save-chat-settings").click()');
        await wait('!window.app.chatBusy');
        await wait('window.chatOverlay.maxMessages === 2', live);
        for (let i=0;i<3;i++) server.broadcastMessage({username:'긴닉네임시청자',message:'수신 확인 '+i});
        await wait('document.querySelector(".message").textContent === "수신 확인 1"',live);
        assert.equal(await live('document.querySelector(".username").textContent'),'긴닉네...');
        assert.equal(await live('window.chatOverlay.messages.length'),2);

        const update=server.chatSettings.update.bind(server.chatSettings);
        server.chatSettings.update=()=>{throw new Error('test disk unavailable');};
        await set('theme-select','maplestory');
        await evaluate('document.getElementById("save-chat-settings").click()');
        await wait('!window.app.chatBusy');
        assert.equal(server.chatSettings.get().theme,'unicorn-overlord');
        assert.equal(await evaluate('document.getElementById("chat-draft-state").dataset.dirty'),'true');
        assert.equal(await evaluate('document.getElementById("save-chat-settings").disabled'),false);
        server.chatSettings.update=update;
        await evaluate('document.getElementById("save-chat-settings").click()');
        await wait(themeIs('maplestory'),live);

        // Disconnect/reconnect the chat module without changing the selected theme.
        await set('channel-id','a'.repeat(32));
        await evaluate('document.getElementById("chat-connect").click()');
        await wait('window.app.chatModule.isActive && !window.app.chatBusy');
        await evaluate('document.getElementById("chat-connect").click()');
        await wait('!window.app.chatModule.isActive && !window.app.chatBusy');
        await evaluate('document.getElementById("chat-connect").click()');
        await wait('window.app.chatModule.isActive && !window.app.chatBusy');
        assert.equal(server.chatSettings.get().theme,'maplestory');
        await live('window.chatOverlay.connectToServer()');
        await wait(themeIs('maplestory'),live);
        await obs.reload();
        await wait('Boolean(window.chatOverlay) && ' + themeIs('maplestory'),live);
        await dashboard.reload();
        await wait('Boolean(window.app && window.deck)');
        await evaluate('window.app.settingsReady');
        assert.equal(await evaluate('window.app.settingsManager.getModuleSettings("chat").theme'),'maplestory');

        server.broadcastMessage({username:'<script>',message:'<img src=x onerror=alert(1)>'});
        await wait('window.chatOverlay.messages.at(-1)?.originalUsername === "<script>"',live);
        assert.equal(await live('document.querySelector(".chat-message-container:last-child .message").textContent'),'<img src=x onerror=alert(1)>');
        assert.equal(await live('document.querySelectorAll(".chat-message-container script, .chat-message-container img").length'),0);
        for (const asset of ['Unicorn_Center.png','Unicorn_Name_Left.png','maple-leaf.svg']) {
            assert.equal((await fetch('http://localhost:17114/assets/images/'+asset)).status,200);
        }
        console.log('LIVE_OVERLAY_OK: separate browser storage, three original themes, migration, saved live updates, retry, reconnect and reload.');
    } finally {
        dashboard.destroy(); obs.destroy();
        await server.shutdown();
        if(fs.existsSync(settingsPath))fs.unlinkSync(settingsPath);
    }
    app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
setTimeout(()=>app.exit(1),60000).unref();

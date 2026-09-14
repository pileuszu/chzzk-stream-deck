const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const ChzzkStreamDeckServer = require("./server");
app.setName("CHZZK Stream Deck");
let server;
let mainWindow;
let quitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 900,
    minHeight: 680,
    title: "CHZZK Stream Deck",
    backgroundColor: "#f6f7f3",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${server.baseUrl}/`))
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    if (/^https:\/\/chzzk\.naver\.com\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${server.baseUrl}/`)) event.preventDefault();
  });
  mainWindow.loadURL(server.baseUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow && server?.serverInstance?.listening) createWindow();
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      const externalConfig = path.join(
        path.dirname(app.getPath("exe")),
        "config.json",
      );
      server = new ChzzkStreamDeckServer({
        configPath:
          app.isPackaged && fs.existsSync(externalConfig)
            ? externalConfig
            : undefined,
        settingsPath: path.join(app.getPath("userData"), "settings.json"),
      });
      await server.start();
      createWindow();
      app.on("activate", () => {
        if (!mainWindow) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Stream Deck를 시작하지 못했습니다",
        error.code === "EADDRINUSE"
          ? `${server.port} 포트가 사용 중입니다. 실행 중인 웹 서버나 다른 Stream Deck를 종료해주세요.`
          : error.message,
      );
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    server.shutdown().finally(() => app.quit());
  });
  ipcMain.on("app-quit", (event) => {
    if (event.sender === mainWindow?.webContents) app.quit();
  });
}

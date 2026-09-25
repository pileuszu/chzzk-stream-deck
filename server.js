const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const ChzzkChatClient = require("./src/chat-client");
const SettingsStore = require("./src/settings-store");
const { THEMES, normalizeChannelId } = require("./shared/chat-config");

function loadConfig(file = path.join(__dirname, "config.json")) {
  const config = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};
  const port = Number(process.env.PORT ?? config.port ?? 7112);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("서버 포트가 올바르지 않습니다.");
  return { port, host: process.env.HOST || config.host || "127.0.0.1" };
}

class ChzzkStreamDeckServer {
  constructor(options = {}) {
    const config = options.config || loadConfig(options.configPath);
    this.port = options.port ?? config.port;
    this.host = options.host || config.host;
    this.app = express();
    this.clientFactory =
      options.clientFactory || ((id) => new ChzzkChatClient(id));
    this.store = new SettingsStore(
      options.settingsPath !== undefined ? options.settingsPath :
        path.join(
          process.env.CHZZK_DATA_DIR || path.join(__dirname, ".data"),
          "settings.json",
        ),
    );
    this.client = null;
    this.messages = [];
    this.connections = new Set();
    this.serverInstance = null;
    this.stopping = false;
    this.idleStatus = {
      state: "idle",
      active: false,
      connected: false,
      channelName: "",
      error: null,
      retryCount: 0,
    };
    this.setupRoutes();
  }
  get baseUrl() {
    return `http://${["0.0.0.0", "::", "localhost"].includes(this.host) ? "127.0.0.1" : this.host}:${this.port}`;
  }
  getStatus() {
    return {
      chat: {
        ...this.idleStatus,
        ...this.client?.getStatus(),
        channelId: this.client?.channelId || this.store.get().channelId,
        messageCount: this.messages.length,
      },
      server: { port: this.port, sseConnections: this.connections.size },
    };
  }
  setupRoutes() {
    this.app.disable("x-powered-by");
    this.app.use(express.json({ limit: "64kb" }));
    this.app.use("/api", (req, res, next) => {
      if (this.stopping && req.method !== 'GET') return res.status(503).json({ success: false, error: '앱을 종료하는 중입니다.' });
      if (
        req.method !== "GET" &&
        req.headers.origin &&
        req.headers.origin !== `${req.protocol}://${req.get("host")}`
      )
        return res
          .status(403)
          .json({ success: false, error: "같은 앱 화면에서 요청해주세요." });
      next();
    });
    for (const directory of ["css", "js", "assets", "shared"])
      this.app.use(
        `/${directory}`,
        express.static(path.join(__dirname, directory)),
      );
    this.app.get(["/", "/index.html"], (req, res) =>
      res.sendFile(path.join(__dirname, "index.html")),
    );
    this.app.get('/icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));
    for (const route of ["/chat-overlay.html", "/chat.html"])
      this.app.get(route, (req, res) =>
        res.sendFile(path.join(__dirname, "src/chat-overlay.html")),
      );
    this.app.get("/api/config", (req, res) =>
      res.json({
        success: true,
        config: {
          port: this.port,
          host: this.host,
          baseUrl: this.baseUrl,
          chatOverlayUrl: `${this.baseUrl}/chat-overlay.html`,
        },
        themes: THEMES,
      }),
    );
    this.app.get("/api/status", (req, res) =>
      res.json({ success: true, status: this.getStatus() }),
    );
    this.app.get("/api/chat/settings", (req, res) =>
      res.set('Cache-Control', 'no-store').json({ success: true, settings: this.store.get(), initialized: this.store.initialized }),
    );
    this.app.post("/api/chat/settings", (req, res, next) => {
      try {
        if (!req.is('application/json')) return res.status(415).json({ success: false, error: 'JSON 설정이 필요합니다.' });
        const settings = this.store.update(req.body?.initialize === true ? req.body.settings : req.body,
          { initialize: req.body?.initialize === true });
        this.broadcast({ type: "settings", settings });
        res.json({ success: true, settings, initialized: this.store.initialized });
      } catch (error) {
        error.status = 400;
        next(error);
      }
    });
    this.app.get("/api/chat/messages", (req, res) => {
      const limit = Math.min(
        200,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
      );
      res.json({
        success: true,
        messages: this.messages.slice(-limit),
        total: this.messages.length,
      });
    });
    this.app.get("/api/chat/stream", (req, res) => this.handleStream(req, res));
    this.app.post("/api/chat/start", (req, res, next) => {
      try {
        const channelId = normalizeChannelId(
          req.body?.channelId || this.store.get().channelId,
        );
        if (!channelId) throw new Error("채널 ID를 먼저 입력해주세요.");
        if (
          this.client?.getStatus().active &&
          this.client.channelId === channelId
        )
          return res.json({ success: true, status: this.getStatus() });
        this.stopChat();
        this.store.update({ channelId });
        this.messages = [];
        this.broadcast({ type: "clear" });
        this.broadcast({ type: "settings", settings: this.store.get() });
        const client = (this.client = this.clientFactory(channelId));
        client.on("message", (data) => {
          if (this.client === client) this.addMessage(data);
        });
        client.on("status", () => {
          if (this.client === client)
            this.broadcast({ type: "status", status: this.getStatus() });
        });
        client
          .start()
          .catch((error) => console.warn(`[채팅] ${error.message}`));
        res.status(202).json({ success: true, status: this.getStatus() });
      } catch (error) {
        error.status = 400;
        next(error);
      }
    });
    this.app.post("/api/chat/stop", (req, res) => {
      this.stopChat();
      res.json({ success: true, status: this.getStatus() });
    });
    this.app.post("/api/chat/clear", (req, res) => {
      this.messages = [];
      this.broadcast({ type: "clear" });
      res.json({ success: true });
    });
    this.app.use("/api", (req, res) =>
      res
        .status(404)
        .json({ success: false, error: "존재하지 않는 API입니다." }),
    );
    this.app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      res
        .status(error.status || 500)
        .json({
          success: false,
          error: error.message || "서버 오류가 발생했습니다.",
        });
    });
  }
  stopChat() {
    const client = this.client;
    this.client = null;
    client?.disconnect();
    client?.removeAllListeners();
    this.broadcast({ type: "status", status: this.getStatus() });
  }
  addMessage(data) {
    const message = {
      ...data,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "chat",
    };
    this.messages.push(message);
    if (this.messages.length > 200) this.messages.shift();
    this.broadcast(message);
  }
  send(res, payload) {
    if (res.destroyed || res.writableEnded) {
      this.connections.delete(res);
      return;
    }
    if (res.writableLength > 1024 * 1024) {
      res.end();
      this.connections.delete(res);
      return;
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  broadcast(payload) {
    for (const connection of this.connections) this.send(connection, payload);
  }
  handleStream(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    this.connections.add(res);
    this.send(res, {
      type: "snapshot",
      settings: this.store.get(),
      messages: this.messages,
      status: this.getStatus(),
    });
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": heartbeat\n\n");
    }, 15000);
    heartbeat.unref();
    res.on("close", () => {
      clearInterval(heartbeat);
      this.connections.delete(res);
    });
  }
  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve, reject) => {
      this.serverInstance = this.app.listen(this.port, this.host, () => {
        this.port = this.serverInstance.address().port;
        resolve(this);
      });
      this.serverInstance.once("error", (error) => {
        this.startPromise = null;
        reject(error);
      });
    });
    return this.startPromise;
  }
  async shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.stopping = true;
    this.shutdownPromise = this.close();
    return this.shutdownPromise;
  }
  async close() {
    this.stopChat();
    for (const connection of this.connections) connection.end();
    this.connections.clear();
    if (this.serverInstance) {
      this.serverInstance.closeIdleConnections?.();
      await new Promise((resolve) => this.serverInstance.close(resolve));
      this.serverInstance = null;
      this.startPromise = null;
    }
  }
}
if (require.main === module) {
  const server = new ChzzkStreamDeckServer();
  server
    .start()
    .then(() =>
      console.log(
        `CHZZK Stream Deck: ${server.baseUrl}\nOBS: ${server.baseUrl}/chat-overlay.html`,
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.shutdown().catch(console.error));
}
module.exports = ChzzkStreamDeckServer;

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Server = require("../server");
class Client extends EventEmitter {
  constructor(channelId) {
    super();
    this.channelId = channelId;
    this.state = "idle";
  }
  getStatus() {
    return {
      state: this.state,
      active: this.state !== "idle",
      connected: this.state === "connected",
    };
  }
  async start() {
    this.state = "connecting";
    this.emit("status");
  }
  disconnect() {
    this.state = "idle";
  }
}
async function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "chzzk-server-"));
  const clients = [];
  const server = new Server({
    port: 0,
    host: "127.0.0.1",
    settingsPath: path.join(folder, "settings.json"),
    clientFactory: (id) => {
      const client = new Client(id);
      clients.push(client);
      return client;
    },
  });
  await server.start();
  t.after(async () => {
    await server.shutdown();
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const call = async (route, body, headers = {}) => {
    const response = await fetch(
      server.baseUrl + route,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
          },
    );
    return { code: response.status, data: await response.json() };
  };
  return { server, clients, call };
}
test("server listens, serves dashboard, restricts source files and validates writes", async (t) => {
  const { server, call } = await fixture(t);
  assert.equal((await fetch(server.baseUrl)).status, 200);
  for (const file of [
    "/server.js",
    "/package.json",
    "/.data/settings.json",
    "/src/chat-client.js",
  ])
    assert.equal((await fetch(server.baseUrl + file)).status, 404);
  assert.equal(
    (await call("/api/chat/settings", { theme: "maplestory" })).data.settings
      .theme,
    "maplestory",
  );
  assert.equal(
    (await call("/api/chat/settings", { maxMessages: -1 })).code,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/chat/settings",
        { theme: "simple-purple" },
        { Origin: "https://other.test" },
      )
    ).code,
    403,
  );
  assert.equal(
    (await call("/api/chat/settings")).data.settings.theme,
    "maplestory",
  );
});
test("start reports pending auth, start/stop is idempotent, old clients cannot inject messages", async (t) => {
  const { clients, call, server } = await fixture(t);
  const channelId = "a".repeat(32);
  const response = await call("/api/chat/start", { channelId });
  assert.equal(response.code, 202);
  assert.equal(response.data.status.chat.connected, false);
  await call("/api/chat/start", { channelId });
  assert.equal(clients.length, 1);
  clients[0].emit("message", { message: "hello", username: "viewer" });
  assert.equal(server.messages.length, 1);
  await call("/api/chat/start", { channelId: "b".repeat(32) });
  clients[0].emit("message", { message: "stale" });
  assert.equal(server.messages.length, 0);
  await call("/api/chat/stop", {});
  await call("/api/chat/stop", {});
  assert.equal((await call("/api/status")).data.status.chat.state, "idle");
});
test("SSE sends snapshot, new chat, settings and clear in order", async (t) => {
  const { server, call } = await fixture(t);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(server.baseUrl + "/api/chat/stream", {
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  let buffer = "";
  async function event() {
    while (!buffer.includes("\n\n")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("stream closed");
      buffer += new TextDecoder().decode(chunk.value);
    }
    const split = buffer.indexOf("\n\n"),
      part = buffer.slice(0, split);
    buffer = buffer.slice(split + 2);
    return JSON.parse(part.slice(6));
  }
  assert.equal((await event()).type, "snapshot");
  server.addMessage({ username: "view", message: "first" });
  const chat = await event();
  assert.equal(chat.type, "chat");
  assert(chat.id);
  await call("/api/chat/settings", { theme: "maplestory" });
  assert.equal((await event()).settings.theme, "maplestory");
  await call("/api/chat/clear", {});
  assert.equal((await event()).type, "clear");
  controller.abort();
});

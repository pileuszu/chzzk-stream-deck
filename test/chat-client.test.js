const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Client = require("../src/chat-client");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class Socket extends EventEmitter {
  static instances = [];
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    Socket.instances.push(this);
    queueMicrotask(() => this.emit("open"));
  }
  send(message) {
    this.sent.push(JSON.parse(message));
  }
  terminate() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.emit("close"));
  }
  packet(data) {
    this.emit("message", Buffer.from(JSON.stringify(data)));
  }
}
const fakeFetch = async (url) => ({
  ok: true,
  json: async () => ({
    code: 200,
    content: url.includes("/access-token")
      ? { accessToken: "test-token" }
      : url.includes("/live-status")
        ? { chatChannelId: "chat-123" }
        : { channelName: "test-channel" },
  }),
});
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await delay(5);
  }
  throw new Error("Timed out");
}
function fixture(t, options = {}) {
  Socket.instances = [];
  const client = new Client("a".repeat(32), {
    fetch: fakeFetch,
    WebSocket: Socket,
    serverCount: 1,
    connectionTimeout: 200,
    reconnectDelay: 5,
    ...options,
  });
  t.after(() => client.disconnect());
  return client;
}
test("connected requires successful auth; pings and messages are parsed safely", async (t) => {
  const client = fixture(t);
  const messages = [];
  client.on("message", (message) => messages.push(message));
  const started = client.start();
  await waitFor(() => Socket.instances[0]?.sent.length);
  const socket = Socket.instances[0];
  assert.equal(client.getStatus().connected, false);
  assert.equal(socket.sent[0].bdy.auth, "READ");
  socket.packet({ cmd: 10100, retCode: 0 });
  await started;
  assert.equal(client.getStatus().connected, true);
  socket.packet({ cmd: 0 });
  assert.equal(socket.sent.at(-1).cmd, 10000);
  socket.packet({
    cmd: 93101,
    bdy: [{ msg: "hello", profile: "{bad", extras: "not json" }],
  });
  assert.equal(messages[0].username, "익명");
  assert.equal(messages[0].message, "hello");
});
test("auth rejection never reports connected", async (t) => {
  const client = fixture(t);
  const started = client.start();
  const rejected = assert.rejects(started, /인증/);
  await waitFor(() => Socket.instances.length);
  Socket.instances[0].packet({ cmd: 10100, retCode: 403 });
  await rejected;
  assert.equal(client.getStatus().state, "error");
});
test("connection loss reconnects and stop cancels all later reconnects", async (t) => {
  const client = fixture(t);
  const started = client.start();
  await waitFor(() => Socket.instances.length);
  Socket.instances[0].packet({ cmd: 10100 });
  await started;
  Socket.instances[0].terminate();
  await waitFor(() => Socket.instances.length === 2);
  assert.equal(client.getStatus().state, "reconnecting");
  Socket.instances[1].packet({ cmd: 10100 });
  assert.equal(client.getStatus().connected, true);
  client.disconnect();
  await delay(30);
  assert.equal(client.getStatus().state, "idle");
  assert.equal(Socket.instances.length, 2);
});
test("stop aborts authentication instead of leaving a pending socket", async (t) => {
  const client = fixture(t);
  const started = client.start();
  const rejected = assert.rejects(started);
  await waitFor(() => Socket.instances.length);
  client.disconnect();
  await rejected;
  assert.equal(client.getStatus().state, "idle");
  assert.equal(Socket.instances[0].readyState, 3);
});
test("offline channel reports useful error without creating a socket", async (t) => {
  const client = fixture(t, {
    fetch: async (url) => ({
      ok: true,
      json: async () => ({
        code: 200,
        content: url.includes("/live-status")
          ? null
          : { channelName: "offline channel" },
      }),
    }),
  });
  await assert.rejects(client.start(), /열린 채팅방/);
  assert.equal(Socket.instances.length, 0);
  assert.equal(client.getStatus().channelName, "offline channel");
});

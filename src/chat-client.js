const { EventEmitter } = require("node:events");
const WebSocket = require("ws");
const { normalizeChannelId } = require("../shared/chat-config");

function parseObject(value) {
  try {
    const result = typeof value === "string" ? JSON.parse(value) : value;
    return result && typeof result === "object" ? result : {};
  } catch {
    return {};
  }
}
function parseChatMessages(packet) {
  if (![93101, 93102].includes(packet.cmd) || !Array.isArray(packet.bdy))
    return [];
  return packet.bdy.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const message = item.msg ?? item.content;
    if (typeof message !== "string" || !message.trim()) return [];
    const profile = parseObject(item.profile);
    const extras = parseObject(item.extras);
    return [
      {
        username: String(profile.nickname || "익명").slice(0, 100),
        message: message.slice(0, 10000),
        extras: { emojis: parseObject(extras.emojis) },
        type: "chat",
      },
    ];
  });
}

class ChzzkChatClient extends EventEmitter {
  constructor(channelId, options = {}) {
    super();
    this.channelId = normalizeChannelId(channelId);
    if (!this.channelId) throw new Error("채널 ID가 필요합니다.");
    this.options = {
      connectionTimeout: 5000,
      requestTimeout: 15000,
      reconnectDelay: 1500,
      reconnectAttempts: 8,
      serverCount: 10,
      ...options,
    };
    this.fetch = options.fetch || globalThis.fetch;
    this.WebSocket = options.WebSocket || WebSocket;
    this.status = {
      state: "idle",
      active: false,
      connected: false,
      channelId: this.channelId,
      channelName: "",
      error: null,
      retryCount: 0,
    };
    this.socket = null;
    this.controller = null;
    this.reconnectTimer = null;
    this.heartbeat = null;
  }
  setStatus(state, details = {}) {
    this.status = {
      ...this.status,
      ...details,
      state,
      active: ["connecting", "connected", "reconnecting"].includes(state),
      connected: state === "connected",
    };
    this.emit("status", this.getStatus());
  }
  getStatus() {
    return { ...this.status };
  }
  async request(url, signal, allowEmpty = false) {
    const response = await this.fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Referer: "https://chzzk.naver.com/",
        Origin: "https://chzzk.naver.com",
      },
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(this.options.requestTimeout),
      ]),
    });
    if (!response.ok)
      throw new Error(`치지직 API 연결 실패 (HTTP ${response.status})`);
    const data = await response.json();
    if (data.code !== 200 || (!allowEmpty && !data.content))
      throw new Error(data.message || "채널 정보를 가져오지 못했습니다.");
    return data.content;
  }
  async start() {
    if (this.status.active) return;
    this.controller = new AbortController();
    this.setStatus("connecting", { error: null, retryCount: 0 });
    try {
      await this.connect(this.controller.signal);
    } catch (error) {
      if (!this.controller.signal.aborted)
        this.setStatus("error", { error: error.message });
      throw error;
    }
  }
  async connect(signal) {
    const channel = await this.request(
      `https://api.chzzk.naver.com/service/v1/channels/${this.channelId}`,
      signal,
    );
    this.status.channelName = channel.channelName || "";
    const live = await this.request(
      `https://api.chzzk.naver.com/polling/v2/channels/${this.channelId}/live-status`,
      signal,
      true,
    );
    if (!live?.chatChannelId)
      throw new Error(
        "현재 열린 채팅방이 없습니다. 방송을 시작한 뒤 다시 연결해주세요.",
      );
    const credentials = await this.request(
      `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${encodeURIComponent(live.chatChannelId)}&chatType=STREAMING`,
      signal,
    );
    if (!credentials.accessToken)
      throw new Error("채팅 접근 토큰을 가져오지 못했습니다.");
    let lastError;
    for (let server = 1; server <= this.options.serverCount; server++) {
      signal.throwIfAborted();
      try {
        await this.openSocket(
          `wss://kr-ss${server}.chat.naver.com/chat`,
          live.chatChannelId,
          credentials.accessToken,
          signal,
        );
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `채팅 서버에 연결하지 못했습니다: ${lastError?.message || "연결 실패"}`,
    );
  }
  openSocket(url, chatChannelId, token, signal) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const socket = new this.WebSocket(url);
      this.socket = socket;
      let authenticated = false;
      let settled = false;
      const dispose = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        if (this.socket === socket) {
          this.socket = null;
          clearInterval(this.heartbeat);
          this.heartbeat = null;
        }
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        dispose();
        socket.terminate();
        reject(error);
      };
      const abort = () => {
        if (!authenticated) fail(new Error("연결이 취소되었습니다."));
        else {
          dispose();
          socket.terminate();
        }
      };
      const timeout = setTimeout(
        () => fail(new Error("채팅 인증 응답 시간 초과")),
        this.options.connectionTimeout,
      );
      signal.addEventListener("abort", abort, { once: true });
      socket.on("open", () => {
        if (signal.aborted) return abort();
        socket.send(
          JSON.stringify({
            ver: "2",
            cmd: 100,
            svcid: "game",
            cid: chatChannelId,
            bdy: { uid: null, devType: 2001, accTkn: token, auth: "READ" },
            tid: 1,
          }),
        );
      });
      socket.on("message", (raw) => {
        if (signal.aborted) return;
        let packet;
        try {
          packet = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!packet || typeof packet !== "object") return;
        if (packet.cmd === 0 && socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ ver: "2", cmd: 10000 }));
        if (packet.cmd === 10100 && !settled) {
          if (packet.retCode && packet.retCode !== 0)
            return fail(new Error("채팅 인증이 거부되었습니다."));
          clearTimeout(timeout);
          authenticated = settled = true;
          this.setStatus("connected", { error: null, retryCount: 0 });
          this.heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ ver: "2", cmd: 0 }));
          }, 20000);
          resolve();
        }
        if (authenticated)
          for (const message of parseChatMessages(packet))
            this.emit("message", message);
      });
      socket.on("error", (error) => {
        if (!authenticated) fail(error);
        else socket.terminate();
      });
      socket.on("close", () => {
        dispose();
        if (!authenticated)
          fail(new Error("인증 전에 채팅 연결이 종료되었습니다."));
        else if (!signal.aborted) this.scheduleReconnect(signal);
      });
    });
  }
  scheduleReconnect(signal) {
    if (signal.aborted || this.reconnectTimer) return;
    const attempt = this.status.retryCount + 1;
    if (attempt > this.options.reconnectAttempts) {
      this.setStatus("error", {
        error:
          "자동 재연결에 실패했습니다. 네트워크를 확인하고 다시 연결해주세요.",
      });
      return;
    }
    this.setStatus("reconnecting", { retryCount: attempt });
    this.reconnectTimer = setTimeout(
      async () => {
        this.reconnectTimer = null;
        if (signal.aborted) return;
        try {
          await this.connect(signal);
        } catch (error) {
          if (!signal.aborted) {
            this.status.error = error.message;
            this.scheduleReconnect(signal);
          }
        }
      },
      Math.min(this.options.reconnectDelay * 2 ** (attempt - 1), 30000),
    );
  }
  disconnect() {
    this.controller?.abort();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeat);
    this.reconnectTimer = this.heartbeat = null;
    this.socket?.terminate();
    this.socket = null;
    this.setStatus("idle", { error: null, retryCount: 0 });
  }
}

if (require.main === module) {
  try {
    const client = new ChzzkChatClient(process.argv[2]);
    client.on("message", (message) => console.log(JSON.stringify(message)));
    client.on("status", (status) =>
      console.error(`${status.state}: ${status.error || status.channelName}`),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        client.disconnect();
        process.exit(0);
      });
    client.start().catch(() => {
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = ChzzkChatClient;
module.exports.parseChatMessages = parseChatMessages;
